"""Cogs bundle commands, listeners and loops of one topic into a class, like nextcord's cogs::

    from diddybot import Cog, command, group, tasks

    class Music(Cog):
        def __init__(self, bot):
            self.bot = bot

        @command("play", desc="plays a song")
        async def play(self, ctx, *, query: str):
            await ctx.reply(f"playing {query}")

        @group("queue", desc="the queue")
        async def queue(self, ctx): ...

        @queue.command("clear")
        async def queue_clear(self, ctx): ...

        @Cog.listener("member_join")
        async def welcome(self, room_id, user_id): ...

        @tasks.loop(minutes=10)
        async def tidy(self): ...

    bot.add_cog(Music(bot))               # or: bot.load_extension("cogs.music")

Optional methods: ``cog_load()`` / ``cog_unload()`` (sync or async), ``cog_check(ctx)`` for all
commands of the cog, ``cog_command_error(ctx, error)`` takes over the errors of its commands.

A module for ``load_extension`` has a ``setup(bot)`` function that adds its cogs (and optionally
``teardown(bot)``).
"""
from __future__ import annotations

from typing import Any, Callable, Optional

from .commands import Command, _doc_line, _opts, _validate
from .tasks import Loop

__all__ = ["Cog", "command", "group", "listener"]


def command(name: str = "", *, desc: str = "", usage: str = "", aliases: Any = (),
            group: str = "Commands", power: int = 0, hidden: bool = False, dm_only: bool = False,
            checks: Any = ()) -> Callable[[Any], Command]:
    """Make a :class:`Command` of a function; ``bot.add_command`` or a cog registers it."""
    def deco(func: Any) -> Command:
        n = name or func.__name__
        _validate(n, tuple(aliases), func)
        cmd = Command(name=n, func=func, **_opts(func, {
            "desc": desc or _doc_line(func), "usage": usage, "aliases": tuple(aliases),
            "group": group, "power": power, "hidden": hidden, "dm_only": dm_only,
            "checks": list(checks)}))
        return cmd
    return deco


def group(name: str = "", **opts: Any) -> Callable[[Any], Command]:
    """Like :func:`command`; add subcommands with ``@thegroup.command("name")``."""
    return command(name, **opts)


def listener(event: str = "") -> Callable[[Any], Any]:
    """Mark a cog method as the listener of an event (see ``bot.listen``)."""
    def deco(func: Any) -> Any:
        func.__diddy_listener__ = event or func.__name__.removeprefix("on_")
        return func
    if callable(event):  # used as @listener without brackets
        func, event = event, ""
        return deco(func)
    return deco


class Cog:
    """Base class of a cog (see the module text)."""

    @staticmethod
    def listener(event: Any = "") -> Callable[[Any], Any]:
        """``@Cog.listener("message")`` or bare ``@Cog.listener`` (the name is the event)."""
        return listener(event)

    @property
    def qualified_name(self) -> str:
        return type(self).__name__

    def cog_check(self, ctx: Any) -> Any:  # replaced by cogs that need it
        return True

    # these are optional hooks; the defaults do nothing
    def cog_load(self) -> Optional[Any]:
        return None

    def cog_unload(self) -> Optional[Any]:
        return None

    async def cog_command_error(self, ctx: Any, error: Exception) -> None:
        """Define it to take over the error handling of this cog's commands."""

    def _members(self) -> list[tuple[str, Any]]:
        seen: set[str] = set()
        out = []
        for klass in type(self).__mro__:
            for attr, value in vars(klass).items():
                if attr in seen:
                    continue
                seen.add(attr)
                out.append((attr, value))
        return out

    def _commands(self) -> list[Command]:
        return [v.bound_to(self) for _, v in self._members() if isinstance(v, Command)]

    def _listeners(self) -> list[tuple[str, Any]]:
        return [(v.__diddy_listener__, getattr(self, a)) for a, v in self._members()
                if callable(v) and hasattr(v, "__diddy_listener__")]

    def _loops(self) -> list[Loop]:
        return [getattr(self, a) for a, v in self._members() if isinstance(v, Loop)]
