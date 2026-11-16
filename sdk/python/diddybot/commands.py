"""Commands: registry, argument parsing and the lists Diddy shows (suggestions and ``!help``).

A command is an async function. Its parameters after ``ctx`` are the arguments, converted by type
annotation (``int``, ``float``, ``bool``, ``str``)::

    @bot.command("timer", desc="Countdown")
    async def timer(ctx, seconds: int, label: str = "Timer"): ...

``!timer 30 Pizza im Ofen`` gives ``seconds=30, label="Pizza im Ofen"``: the **last** ``str``
parameter takes the rest of the line. A keyword-only parameter (after ``*``) always takes the rest,
``*args`` collects the remaining words. "Quoted words" count as one argument. Missing or wrong
arguments answer with the usage line, your function is not called.
"""
from __future__ import annotations

import inspect
import re
import types
import typing
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from . import cards
from .protocol import COMMANDS_MAX, VERSION

__all__ = ["Command", "CommandRegistry", "UsageError", "split_args"]

Handler = Callable[..., Awaitable[Any]]

_NAME = re.compile(r"^[\w/-]+\Z")
_TOKEN = re.compile(r'"([^"]*)"|\'([^\']*)\'|(\S+)')
_TRUE = {"1", "true", "yes", "y", "on", "an", "ja", "ein", "enable", "enabled"}
_FALSE = {"0", "false", "no", "n", "off", "aus", "nein", "disable", "disabled"}


class UsageError(Exception):
    """Wrong arguments. Raise it in a command to answer with the usage line plus your message."""


def split_args(text: str) -> list[tuple[str, int]]:
    """Words of ``text`` with the index where the next word may start. Quotes group words."""
    out = []
    for m in _TOKEN.finditer(text):
        word = next(g for g in m.groups() if g is not None)
        out.append((word, m.end()))
    return out


def _convert(value: str, kind: Any, name: str) -> Any:
    if kind in (inspect.Parameter.empty, str, Any):
        return value
    if kind is bool:
        low = value.lower()
        if low in _TRUE:
            return True
        if low in _FALSE:
            return False
        raise UsageError(f"{name}: expected on/off, got “{value}”")
    if kind is int:
        try:
            return int(value)
        except ValueError:
            raise UsageError(f"{name}: expected a whole number, got “{value}”") from None
    if kind is float:
        try:
            return float(value.replace(",", "."))
        except ValueError:
            raise UsageError(f"{name}: expected a number, got “{value}”") from None
    if callable(kind):  # any converter: a class or function taking the text
        try:
            return kind(value)
        except Exception as e:  # noqa: BLE001 - reported to the user as usage error
            raise UsageError(f"{name}: {e}") from None
    return value


def _unwrap_optional(t: Any) -> Any:
    args = typing.get_args(t)
    if typing.get_origin(t) in (typing.Union, types.UnionType) and args:
        rest = [a for a in args if a is not type(None)]
        return rest[0] if len(rest) == 1 else t
    return t


@dataclass
class Param:
    name: str
    kind: Any
    required: bool
    default: Any
    mode: str  # "word", "rest", "varargs"


@dataclass
class Command:
    name: str
    func: Handler
    desc: str = ""
    usage: str = ""
    aliases: tuple[str, ...] = ()
    group: str = "Commands"
    power: int = 0
    hidden: bool = False
    dm_only: bool = False
    params: list[Param] = field(default_factory=list)

    def usage_line(self, prefix: str) -> str:
        if self.usage:
            return self.usage if self.usage.startswith(prefix) else f"{prefix}{self.usage}"
        parts = [f"{prefix}{self.name}"]
        for p in self.params:
            label = p.name.replace("_", " ")
            if p.mode == "varargs":
                parts.append(f"[{label}…]")
            elif p.required:
                parts.append(f"<{label}>")
            else:
                parts.append(f"[{label}]")
        return " ".join(parts)

    def bind(self, arg: str) -> tuple[list, dict]:
        """Turn the text after the command into the function's arguments."""
        words = split_args(arg)
        args: list = []
        kwargs: dict = {}
        pos = 0
        word_params = [p for p in self.params if p.mode == "word"]
        greedy_last = (word_params and word_params[-1].kind in (str, inspect.Parameter.empty)
                       and not any(p.mode in ("rest", "varargs") for p in self.params))
        for p in self.params:
            if p.mode == "word":
                if pos >= len(words):
                    if p.required:
                        raise UsageError(f"missing {p.name.replace('_', ' ')}")
                    args.append(p.default)
                    continue
                if greedy_last and p is word_params[-1]:
                    start = words[pos - 1][1] if pos else 0
                    value = arg[start:].strip()
                    if len(words) - pos == 1:
                        value = words[pos][0]  # a single quoted word loses its quotes
                    pos = len(words)
                else:
                    value = words[pos][0]
                    pos += 1
                args.append(_convert(value, p.kind, p.name))
            elif p.mode == "rest":
                start = words[pos - 1][1] if pos else 0
                value = arg[start:].strip()
                pos = len(words)
                if not value and p.required:
                    raise UsageError(f"missing {p.name.replace('_', ' ')}")
                kwargs[p.name] = _convert(value, p.kind, p.name) if value else p.default
            else:  # varargs
                args.extend(_convert(w, p.kind, p.name) for w, _ in words[pos:])
                pos = len(words)
        return args, kwargs


def _params(func: Handler) -> list[Param]:
    sig = inspect.signature(func)
    try:
        hints = typing.get_type_hints(func)
    except Exception:  # noqa: BLE001 - unresolvable forward refs: fall back to raw annotations
        hints = {}
    out = []
    for i, (name, p) in enumerate(sig.parameters.items()):
        if i == 0:
            continue  # ctx
        kind = _unwrap_optional(hints.get(name, p.annotation))
        required = p.default is inspect.Parameter.empty
        default = None if required else p.default
        if p.kind is p.VAR_POSITIONAL:
            out.append(Param(name, kind, False, None, "varargs"))
        elif p.kind is p.KEYWORD_ONLY:
            out.append(Param(name, kind, required, default, "rest"))
        elif p.kind is p.VAR_KEYWORD:
            continue
        else:
            out.append(Param(name, kind, required, default, "word"))
    return out


class CommandRegistry:
    """All commands of a bot, looked up by name or alias (case-insensitive)."""

    def __init__(self, prefix: str = "!"):
        self.prefix = prefix
        self.commands: dict[str, Command] = {}
        self._lookup: dict[str, Command] = {}

    def add(self, name: str, func: Handler, **opts: Any) -> Command:
        name = name.strip()
        if name.startswith(self.prefix):
            name = name[len(self.prefix):]
        if name in self.commands:
            self.remove(name)  # redefining a command (e.g. your own "help") replaces it
        for n in (name, *opts.get("aliases", ())):
            if not n or not _NAME.match(n):
                raise ValueError(f"command name {n!r}: only letters, digits, _, - and /")
            if n.lower() in self._lookup and self._lookup[n.lower()].name != name:
                raise ValueError(f"command name {n!r} is already used by "
                                 f"{self._lookup[n.lower()].name!r}")
        if not inspect.iscoroutinefunction(func):
            raise TypeError(f"command {name!r}: the handler must be an async function")
        cmd = Command(name=name, func=func, params=_params(func), **opts)
        self.commands[name] = cmd
        for n in (name, *cmd.aliases):
            self._lookup[n.lower()] = cmd
        return cmd

    def remove(self, name: str) -> None:
        cmd = self.commands.pop(name, None)
        if cmd:
            for n in (cmd.name, *cmd.aliases):
                self._lookup.pop(n.lower(), None)

    def parse(self, body: str) -> Optional[tuple[Command, str]]:
        """``(command, rest of the line)`` for a message, or ``None`` when it is no command."""
        text = (body or "").strip()
        if not text.startswith(self.prefix):
            return None
        rest = text[len(self.prefix):]
        if not rest or rest[0].isspace():
            return None
        head, _, tail = rest.partition(" ")
        if "\n" in head:
            head, _, more = head.partition("\n")
            tail = f"{more} {tail}".strip()
        cmd = self._lookup.get(head.lower())
        return (cmd, tail.strip()) if cmd else None

    def visible(self) -> list[Command]:
        return [c for c in self.commands.values() if not c.hidden]

    def commands_content(self) -> dict:
        """Content of the ``dev.diddy.commands`` state event (suggestions while typing)."""
        return {
            "v": VERSION,
            "prefix": self.prefix,
            "commands": [
                {"name": c.name, "usage": c.usage_line(self.prefix), "desc": c.desc or ""}
                for c in self.visible()[:COMMANDS_MAX]
            ],
        }

    def help_card(self, note: str = "", title_for: Optional[Callable[[str], str]] = None) -> cards.Card:
        """A help card with one group per ``group=``, in the order the commands were added."""
        groups: dict[str, list[tuple[str, str]]] = {}
        for c in self.visible():
            usage = c.usage_line(self.prefix)
            if c.aliases:
                usage += " · " + " · ".join(f"{self.prefix}{a}" for a in c.aliases)
            groups.setdefault(c.group, []).append((usage, c.desc or "–"))
        out = []
        for g, rows in groups.items():
            title = title_for(g) if title_for else g
            # Diddy shows at most 20 rows per group and 12 groups
            for n in range(0, len(rows), 20):
                out.append(cards.help_group(title if n == 0 else f"{title} ({n // 20 + 1})",
                                            *rows[n:n + 20]))
        return cards.help(out[:12], note)
