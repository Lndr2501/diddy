"""Converters turn the words of a message into the Python type a command asks for.

Annotate a parameter and the library does the rest::

    @bot.command("remind")
    async def remind(ctx, wait: Duration, *, text: str): ...        # !remind 5m30s tea
    @bot.command("mode")
    async def mode(ctx, setting: Literal["on", "off"]): ...         # only these two words
    @bot.command("sum")
    async def total(ctx, numbers: list[int]): ...                   # !sum 1 2 3
    @bot.command("poke")
    async def poke(ctx, who: Member): ...                           # !poke alice

Built in: ``str``, ``int``, ``float``, ``bool`` (on/off, an/aus, yes/no, ja/nein), ``Literal[...]``,
``enum.Enum``, ``list[T]``, :class:`Duration`, :class:`~diddybot.objects.Member`,
:class:`~diddybot.objects.Room`. Your own: a class with ``convert(ctx, text)`` (sync or async), or
any function taking the text.
"""
from __future__ import annotations

import re
from typing import Any

from .errors import BadArgument

__all__ = ["Duration", "Converter", "parse_duration"]

_UNITS = {"w": 604800, "d": 86400, "h": 3600, "hr": 3600, "m": 60, "min": 60, "s": 1, "sec": 1}


def parse_duration(text: str) -> float:
    """``"90"``, ``"1:30"``, ``"1:02:03"``, ``"5m30s"``, ``"1.5h"`` → seconds."""
    t = text.strip().lower().replace(",", ".").replace(" ", "")
    if re.fullmatch(r"\d+(?::\d{1,2}){1,2}", t):
        total = 0
        for part in t.split(":"):
            total = total * 60 + int(part)
        return float(total)
    if re.fullmatch(r"\d+(?:\.\d+)?", t):
        return float(t)
    parts = re.findall(r"(\d+(?:\.\d+)?)([a-z]+)", t)
    if not parts or "".join(f"{n}{u}" for n, u in parts) != t or any(u not in _UNITS for _, u in parts):
        raise ValueError("expected a duration like 90, 1:30, 5m30s or 2h")
    return float(sum(float(n) * _UNITS[u] for n, u in parts))


class Duration(float):
    """A length of time in **seconds** (``!timer 5m30s`` gives ``330.0``)."""

    @classmethod
    def convert(cls, ctx: Any, text: str) -> "Duration":
        try:
            return cls(parse_duration(text))
        except ValueError as e:
            raise BadArgument(f"duration: {e}") from None


class Converter:
    """Base for your own converters: override :meth:`convert` (sync or async)."""

    @classmethod
    def convert(cls, ctx: Any, text: str) -> Any:
        raise NotImplementedError
