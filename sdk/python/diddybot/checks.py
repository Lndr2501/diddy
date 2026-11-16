"""Checks and cooldowns, as decorators below ``@bot.command``::

    from diddybot import checks

    @bot.command("purge")
    @checks.power(50)                    # moderators and up
    @checks.room_only()                  # not in a direct message
    @checks.cooldown(1, 30, by="room")   # once per 30 s in a room
    async def purge(ctx): ...

    async def is_vip(ctx):               # your own check: True lets the command run
        return ctx.sender in VIPS

    @bot.command("secret")
    @checks.check(is_vip)
    async def secret(ctx): ...

A failing check raises a :class:`~diddybot.errors.CheckFailure`; the bot answers with a note unless
you handle the error (``@bot.on_command_error``). Checks for **all** commands: ``@bot.check``.
"""
from __future__ import annotations

import collections
import time
from typing import Any, Callable

from .commands import Command
from .errors import CheckFailure, DMOnly, MissingPower, NotOwner, OnCooldown, RoomOnly

__all__ = ["check", "power", "owner", "dm_only", "room_only", "cooldown", "Cooldown"]

_clock = time.monotonic  # tests replace it


def _attach(target: Any, attr: str, field: str, item: Any) -> Any:
    if isinstance(target, Command):
        getattr(target, field).insert(0, item)
    else:
        setattr(target, attr, [item, *getattr(target, attr, [])])
    return target


def check(predicate: Callable[[Any], Any]) -> Callable[[Any], Any]:
    """Run ``predicate(ctx)`` (sync or async) before the command; a falsy answer stops it."""
    def deco(target: Any) -> Any:
        return _attach(target, "__diddy_checks__", "checks", predicate)
    return deco


def power(level: int) -> Callable[[Any], Any]:
    """Only people with at least this power level in the room (50 = moderator, 100 = admin)."""
    async def pred(ctx: Any) -> bool:
        if ctx.power < level:
            raise MissingPower(level, ctx.power, ctx.invoked_with)
        return True
    return check(pred)


def owner() -> Callable[[Any], Any]:
    """Only the owners of the bot (``Bot(owners=["@you:server"])``)."""
    async def pred(ctx: Any) -> bool:
        if not ctx.bot.is_owner(ctx.sender):
            raise NotOwner(ctx.invoked_with)
        return True
    return check(pred)


def dm_only() -> Callable[[Any], Any]:
    async def pred(ctx: Any) -> bool:
        if not ctx.is_dm:
            raise DMOnly(ctx.invoked_with)
        return True
    return check(pred)


def room_only() -> Callable[[Any], Any]:
    async def pred(ctx: Any) -> bool:
        if ctx.is_dm:
            raise RoomOnly(ctx.invoked_with)
        return True
    return check(pred)


class Cooldown:
    """``rate`` uses per ``per`` seconds, counted per ``by``: ``user``, ``room``, ``member``
    (one user in one room) or ``global``."""

    def __init__(self, rate: int, per: float, by: str = "user"):
        if rate < 1 or per <= 0:
            raise ValueError("cooldown: rate must be at least 1 and per above 0")
        if by not in ("user", "room", "member", "global"):
            raise ValueError("cooldown: by must be user, room, member or global")
        self.rate, self.per, self.by = rate, per, by
        self._uses: dict[Any, collections.deque] = {}

    def __copy__(self) -> "Cooldown":
        return Cooldown(self.rate, self.per, self.by)

    def _key(self, ctx: Any) -> Any:
        return {"user": ctx.sender, "room": ctx.room_id, "member": (ctx.room_id, ctx.sender),
                "global": None}[self.by]

    def retry_after(self, ctx: Any) -> float:
        uses = self._uses.get(self._key(ctx))
        if not uses:
            return 0.0
        now = _clock()
        while uses and now - uses[0] >= self.per:
            uses.popleft()
        return uses[0] + self.per - now if len(uses) >= self.rate else 0.0

    def acquire(self, ctx: Any) -> None:
        """Count one use or raise :class:`~diddybot.errors.OnCooldown`."""
        wait = self.retry_after(ctx)
        if wait > 0:
            raise OnCooldown(wait, ctx.invoked_with)
        self._uses.setdefault(self._key(ctx), collections.deque()).append(_clock())

    def reset(self) -> None:
        self._uses.clear()


def cooldown(rate: int, per: float, by: str = "user") -> Callable[[Any], Any]:
    """Allow ``rate`` uses per ``per`` seconds for each ``by`` (user, room, member, global)."""
    cd = Cooldown(rate, per, by)

    def deco(target: Any) -> Any:
        return _attach(target, "__diddy_cooldowns__", "cooldowns", cd)
    return deco


__all__ += ["CheckFailure"]
