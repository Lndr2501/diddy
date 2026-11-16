"""Repeating jobs, like ``nextcord.ext.tasks``::

    from diddybot import tasks

    @bot.loop(minutes=5)                     # starts with the bot
    async def refresh():
        ...

    @bot.loop(time=datetime.time(8, 0))      # every day at 08:00 (local time)
    async def morning():
        await bot.send(ROOM, cards.note("Good morning!"))

    @tasks.loop(seconds=30, count=10)        # your own control: start/stop/restart
    async def poll(): ...
    poll.start()

Inside a :class:`~diddybot.cog.Cog` a loop gets ``self`` and starts when the cog is added.
A failing run is logged (or goes to ``@loop.error``) and the loop keeps running.
"""
from __future__ import annotations

import asyncio
import datetime
import inspect
import logging
import types
from typing import Any, Awaitable, Callable, Iterable, Optional, Union

log = logging.getLogger("diddybot.tasks")

__all__ = ["Loop", "loop", "seconds_until"]

Coro = Callable[..., Awaitable[Any]]
TimeArg = Union[datetime.time, Iterable[datetime.time], None]


def _times(value: TimeArg) -> list[datetime.time]:
    if value is None:
        return []
    if isinstance(value, datetime.time):
        return [value]
    return sorted(value, key=lambda t: (t.hour, t.minute, t.second))


def seconds_until(times: list[datetime.time], now: datetime.datetime) -> float:
    """Seconds from ``now`` to the next of the daily ``times`` (naive times are local)."""
    best: Optional[float] = None
    for t in times:
        base = now.astimezone(t.tzinfo) if t.tzinfo is not None and now.tzinfo is not None else now
        at = base.replace(hour=t.hour, minute=t.minute, second=t.second, microsecond=0)
        if at <= base:
            at += datetime.timedelta(days=1)
        delta = (at - base).total_seconds()
        best = delta if best is None else min(best, delta)
    return best if best is not None else 0.0


class Loop:
    """A repeating job. Create it with :func:`loop`."""

    def __init__(self, coro: Coro, *, seconds: float = 0, minutes: float = 0, hours: float = 0,
                 time: TimeArg = None, count: Optional[int] = None, wait_first: bool = False):
        if not inspect.iscoroutinefunction(coro):
            raise TypeError("a loop needs an async function")
        self.coro = coro
        self.count = count
        self.wait_first = wait_first
        self.current_loop = 0
        self.start_args: tuple = ()
        self._before: Optional[Coro] = None
        self._after: Optional[Coro] = None
        self._error: Optional[Coro] = None
        self._task: Optional[asyncio.Task] = None
        self._stopping = False
        self._owner: Any = None
        self._cache: dict[int, "Loop"] = {}
        self._set_interval(seconds, minutes, hours, time)

    # ------------------------------------------------------------------ setup
    def _set_interval(self, seconds: float, minutes: float, hours: float, time: TimeArg) -> None:
        self.times = _times(time)
        self.interval = seconds + minutes * 60 + hours * 3600
        if self.times and self.interval:
            raise ValueError("use either seconds/minutes/hours or time, not both")
        if not self.times and self.interval <= 0:
            raise ValueError("a loop needs seconds, minutes, hours or time")

    def change_interval(self, *, seconds: float = 0, minutes: float = 0, hours: float = 0,
                        time: TimeArg = None) -> None:
        """Take the new interval from the next wait on."""
        self._set_interval(seconds, minutes, hours, time)

    def before_loop(self, coro: Coro) -> Coro:
        """``async def f()`` once before the first run."""
        self._before = coro
        return coro

    def after_loop(self, coro: Coro) -> Coro:
        """``async def f()`` after the loop ended (stopped, cancelled or ``count`` reached)."""
        self._after = coro
        return coro

    def error(self, coro: Coro) -> Coro:
        """``async def f(exception)`` when a run raised."""
        self._error = coro
        return coro

    def __get__(self, obj: Any, objtype: Any = None) -> "Loop":
        if obj is None:
            return self
        cache = obj.__dict__.setdefault("_diddy_loops", {})
        if id(self) not in cache:
            bound = Loop.__new__(Loop)
            bound.__dict__.update(self.__dict__)
            bound.coro = types.MethodType(self.coro, obj)
            for hook in ("_before", "_after", "_error"):
                fn = getattr(self, hook)
                setattr(bound, hook, types.MethodType(fn, obj) if fn else None)
            bound._task, bound._stopping, bound.current_loop = None, False, 0
            bound._owner = obj
            cache[id(self)] = bound
        return cache[id(self)]

    # ------------------------------------------------------------------ control
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self, *args: Any, **kwargs: Any) -> asyncio.Task:
        """Start the loop in the running event loop. Calling it again does nothing."""
        if self.is_running():
            assert self._task is not None
            return self._task
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            raise RuntimeError("start a loop while the bot runs (@bot.loop, on_start or cog_load)") \
                from None
        self._stopping = False
        self.current_loop = 0
        self._task = asyncio.ensure_future(self._run(args or self.start_args, kwargs))
        return self._task

    def stop(self) -> None:
        """Let the current run finish, then end."""
        self._stopping = True
        if self._task and self._sleeping:
            self._task.cancel()

    def cancel(self) -> None:
        """End now, also in the middle of a run."""
        if self._task:
            self._task.cancel()

    def restart(self, *args: Any, **kwargs: Any) -> asyncio.Task:
        self.cancel()
        self._task = None
        return self.start(*args, **kwargs)

    @property
    def next_iteration(self) -> Optional[datetime.datetime]:
        return getattr(self, "_next", None)

    _sleeping = False

    # ------------------------------------------------------------------ running
    async def _wait(self) -> None:
        if self.times:
            delay = seconds_until(self.times, datetime.datetime.now().astimezone())
        else:
            delay = self.interval
        self._next = datetime.datetime.now() + datetime.timedelta(seconds=delay)
        self._sleeping = True
        try:
            await asyncio.sleep(delay)
        finally:
            self._sleeping = False

    async def _run(self, args: tuple, kwargs: dict) -> None:
        try:
            if self._before:
                await self._before()
            first = True
            while not self._stopping:
                if self.times or (first and self.wait_first) or not first:
                    try:
                        await self._wait()
                    except asyncio.CancelledError:
                        if self._stopping:
                            break
                        raise
                first = False
                if self._stopping:
                    break
                try:
                    await self.coro(*args, **kwargs)
                except asyncio.CancelledError:
                    raise
                except Exception as e:  # noqa: BLE001 - the loop must survive a failing run
                    if self._error:
                        await self._error(e)
                    else:
                        log.exception("loop %s failed", getattr(self.coro, "__name__", self.coro))
                self.current_loop += 1
                if self.count is not None and self.current_loop >= self.count:
                    break
        except asyncio.CancelledError:
            pass
        finally:
            if self._after:
                try:
                    await self._after()
                except Exception:  # noqa: BLE001
                    log.exception("after_loop failed")


def loop(*, seconds: float = 0, minutes: float = 0, hours: float = 0, time: TimeArg = None,
         count: Optional[int] = None, wait_first: bool = False) -> Callable[[Coro], Loop]:
    """Decorator for a repeating job (see the module text). ``wait_first=True`` waits one
    interval before the first run (the default runs at once)."""
    def deco(func: Coro) -> Loop:
        return Loop(func, seconds=seconds, minutes=minutes, hours=hours, time=time, count=count,
                    wait_first=wait_first)
    return deco
