"""Commands: registry, argument parsing and the lists Diddy shows (suggestions and ``!help``).

A command is an async function. Its parameters after ``ctx`` are the arguments, converted by type
annotation (see :mod:`diddybot.converters`)::

    @bot.command("timer", desc="Countdown")
    async def timer(ctx, seconds: int, label: str = "Timer"): ...

``!timer 30 Pizza im Ofen`` gives ``seconds=30, label="Pizza im Ofen"``: the **last** ``str``
parameter takes the rest of the line. A keyword-only parameter (after ``*``) always takes the rest,
``*args`` and ``list[T]`` collect the remaining words. "Quoted words" count as one argument. Missing
or wrong arguments answer with the usage line, your function is not called.

Groups give subcommands, ``!playlist add Song``::

    @bot.group("playlist", desc="your playlists")
    async def playlist(ctx): ...

    @playlist.command("add")
    async def playlist_add(ctx, *, song: str): ...
"""
from __future__ import annotations

import copy
import enum
import inspect
import re
import types
import typing
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from . import cards
from .errors import (  # noqa: F401 - re-exported
    BadArgument,
    CheckFailure,
    CommandError,
    DMOnly,
    MissingArgument,
    MissingPower,
    UsageError,
)
from .protocol import COMMANDS_MAX, VERSION

__all__ = ["Command", "CommandRegistry", "UsageError", "split_args"]

Handler = Callable[..., Awaitable[Any]]

_NAME = re.compile(r"^[\w/-]+\Z")
_TOKEN = re.compile(r'"([^"]*)"|\'([^\']*)\'|(\S+)')
_TRUE = {"1", "true", "yes", "y", "on", "an", "ja", "ein", "enable", "enabled"}
_FALSE = {"0", "false", "no", "n", "off", "aus", "nein", "disable", "disabled"}


def split_args(text: str) -> list[tuple[str, int]]:
    """Words of ``text`` with the index where the next word may start. Quotes group words."""
    out = []
    for m in _TOKEN.finditer(text):
        word = next(g for g in m.groups() if g is not None)
        out.append((word, m.end()))
    return out


def _doc_line(func: Handler) -> str:
    doc = inspect.getdoc(func) or ""
    return doc.strip().splitlines()[0] if doc.strip() else ""


async def _maybe(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


async def convert(ctx: Any, value: str, kind: Any, name: str) -> Any:
    """Turn the text ``value`` into ``kind`` (raises :class:`BadArgument`)."""
    if kind in (inspect.Parameter.empty, str, Any):
        return value
    if kind is bool:
        low = value.lower()
        if low in _TRUE:
            return True
        if low in _FALSE:
            return False
        raise BadArgument(f"{name}: expected on/off, got “{value}”")
    if kind is int:
        try:
            return int(value)
        except ValueError:
            raise BadArgument(f"{name}: expected a whole number, got “{value}”") from None
    if kind is float:
        try:
            return float(value.replace(",", "."))
        except ValueError:
            raise BadArgument(f"{name}: expected a number, got “{value}”") from None
    if typing.get_origin(kind) is typing.Literal:
        choices = typing.get_args(kind)
        for c in choices:
            if str(c).casefold() == value.casefold():
                return c
        raise BadArgument(f"{name}: one of {', '.join(map(str, choices))} (not “{value}”)")
    if inspect.isclass(kind) and issubclass(kind, enum.Enum):
        for m in kind:
            if value.casefold() in (m.name.casefold(), str(m.value).casefold()):
                return m
        raise BadArgument(f"{name}: one of {', '.join(m.name.lower() for m in kind)} "
                          f"(not “{value}”)")
    converter = getattr(kind, "convert", None)
    try:
        if callable(converter):  # Member, Room, Duration, your own class
            return await _maybe(converter(ctx, value))
        if callable(kind):  # any function or class taking the text
            return await _maybe(kind(value))
    except CommandError:
        raise
    except Exception as e:  # noqa: BLE001 - reported to the user as a usage error
        raise BadArgument(f"{name}: {e}") from None
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
    mode: str  # "word", "rest", "varargs" (spread) or "list" (one list argument)

    @property
    def label(self) -> str:
        if typing.get_origin(self.kind) is typing.Literal:
            return "|".join(map(str, typing.get_args(self.kind)))
        return self.name.replace("_", " ")

    @property
    def choices(self) -> list[str]:
        """Fixed answers (``Literal`` or ``Enum``) Diddy can suggest while typing."""
        if typing.get_origin(self.kind) is typing.Literal:
            return [str(c) for c in typing.get_args(self.kind)]
        if inspect.isclass(self.kind) and issubclass(self.kind, enum.Enum):
            return [m.name.lower() for m in self.kind]
        if self.kind is bool:
            return ["on", "off"]
        return []


@dataclass(eq=False)
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
    checks: list[Callable[..., Any]] = field(default_factory=list)
    cooldowns: list[Any] = field(default_factory=list)
    parent: Optional["Command"] = None
    children: dict[str, "Command"] = field(default_factory=dict)
    invoke_without_command: bool = False
    cog: Any = None
    error_handler: Optional[Handler] = None
    _lookup: dict[str, "Command"] = field(default_factory=dict, repr=False)

    # ------------------------------------------------------------------ naming
    @property
    def full_name(self) -> str:
        return f"{self.parent.full_name} {self.name}" if self.parent else self.name

    @property
    def root(self) -> "Command":
        return self.parent.root if self.parent else self

    def __call__(self, *args: Any, **kwargs: Any) -> Awaitable[Any]:
        """Call the function behind the command directly (like a normal function)."""
        return self.func(*args, **kwargs)

    def usage_line(self, prefix: str) -> str:
        if self.usage:
            return self.usage if self.usage.startswith(prefix) else f"{prefix}{self.usage}"
        parts = [f"{prefix}{self.full_name}"]
        if self.children:
            names = "|".join(c.name for c in self.children.values() if not c.hidden)
            parts.append(f"[{names}]" if self.invoke_without_command else f"<{names}>")
        for p in self.params:
            if p.mode in ("varargs", "list"):
                parts.append(f"<{p.label}…>" if p.required else f"[{p.label}…]")
            elif p.required:
                parts.append(f"<{p.label}>")
            else:
                parts.append(f"[{p.label}]")
        return " ".join(parts)

    def row(self, prefix: str) -> tuple[str, str]:
        """``(usage with aliases, description)`` as the help card lists the command."""
        usage = self.usage_line(prefix)
        if self.aliases:
            head = f"{prefix}{self.parent.full_name} " if self.parent else prefix
            usage += " · " + " · ".join(f"{head}{a}" for a in self.aliases)
        return usage, self.desc or "–"

    # ------------------------------------------------------------------ groups
    def child(self, word: str) -> Optional["Command"]:
        return self._lookup.get(word.lower())

    def add_child(self, name: str, func: Handler, **opts: Any) -> "Command":
        """A subcommand: ``!<this> <name> ...``."""
        name = name.strip()
        aliases = tuple(opts.get("aliases", ()))
        _validate(name, aliases, func)
        for n in (name, *aliases):
            other = self._lookup.get(n.lower())
            if other is not None and other.name != name:
                raise ValueError(f"subcommand {n!r} is already used by {other.name!r}")
        if name in self.children:
            old = self.children.pop(name)
            for n in (old.name, *old.aliases):
                self._lookup.pop(n.lower(), None)
        opts.setdefault("group", self.group)
        cmd = Command(name=name, func=func, params=_params(func), parent=self, **_opts(func, opts))
        self.children[name] = cmd
        for n in (name, *aliases):
            self._lookup[n.lower()] = cmd
        return cmd

    def command(self, name: str = "", **opts: Any) -> Callable[[Handler], "Command"]:
        """Decorator for a subcommand of this group."""
        def deco(func: Handler) -> "Command":
            return self.add_child(name or func.__name__, func, **opts)
        return deco

    def group_command(self, name: str = "", **opts: Any) -> Callable[[Handler], "Command"]:
        """Decorator for a nested group (``!a b c``)."""
        return self.command(name, **opts)

    def error(self, func: Handler) -> Handler:
        """``@cmd.error async def f(ctx, error)``: handles errors of this command only."""
        self.error_handler = func
        return func

    def walk(self) -> "list[Command]":
        """This command and all subcommands, depth first."""
        out = [self]
        for c in self.children.values():
            out.extend(c.walk())
        return out

    def refresh_params(self) -> None:
        """Read the arguments from the function again (after it got bound to a bot or cog)."""
        self.params = _params(self.func)
        for c in self.children.values():
            c.refresh_params()

    def bound_to(self, cog: Any) -> "Command":
        """A copy whose function is bound to ``cog`` (``self`` of a cog method)."""
        new = copy.copy(self)
        new.func = types.MethodType(self.func, cog)
        new.cog = cog
        new.checks = list(self.checks)
        new.cooldowns = [copy.copy(c) for c in self.cooldowns]
        new.children, new._lookup = {}, {}
        for c in self.children.values():
            kid = c.bound_to(cog)
            kid.parent = new
            new.children[kid.name] = kid
            for n in (kid.name, *kid.aliases):
                new._lookup[n.lower()] = kid
        if self.error_handler is not None:
            new.error_handler = types.MethodType(self.error_handler, cog)
        new.refresh_params()
        return new

    # ------------------------------------------------------------------ running
    async def can_run(self, ctx: Any) -> None:
        """Run every check. Raises a :class:`~diddybot.errors.CheckFailure`."""
        bot = ctx.bot
        for pred in bot._global_checks:
            await _run_check(pred, ctx)
        if self.cog is not None and hasattr(self.cog, "cog_check"):
            await _run_check(self.cog.cog_check, ctx)
        chain = []
        node: Optional[Command] = self
        while node is not None:
            chain.append(node)
            node = node.parent
        for node in reversed(chain):
            if node.dm_only and not ctx.is_dm:
                raise DMOnly(ctx.invoked_with)
            if node.power and ctx.power < node.power:
                raise MissingPower(node.power, ctx.power, ctx.invoked_with)
            for pred in node.checks:
                await _run_check(pred, ctx)

    def take_cooldowns(self, ctx: Any) -> None:
        node: Optional[Command] = self
        while node is not None:
            for cd in node.cooldowns:
                cd.acquire(ctx)
            node = node.parent

    async def bind(self, arg: str, ctx: Any = None) -> tuple[list, dict]:
        """Turn the text after the command into the function's arguments."""
        words = split_args(arg)
        args: list = []
        kwargs: dict = {}
        pos = 0
        word_params = [p for p in self.params if p.mode == "word"]
        greedy_last = (word_params and word_params[-1].kind in (str, inspect.Parameter.empty)
                       and not any(p.mode in ("rest", "varargs", "list") for p in self.params))
        for p in self.params:
            if p.mode == "word":
                if pos >= len(words):
                    if p.required:
                        raise MissingArgument(p.name)
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
                args.append(await convert(ctx, value, p.kind, p.name))
            elif p.mode == "rest":
                start = words[pos - 1][1] if pos else 0
                value = arg[start:].strip()
                pos = len(words)
                if not value and p.required:
                    raise MissingArgument(p.name)
                kwargs[p.name] = await convert(ctx, value, p.kind, p.name) if value else p.default
            else:  # varargs, list
                got = [await convert(ctx, w, p.kind, p.name) for w, _ in words[pos:]]
                pos = len(words)
                if p.mode == "list":
                    if not got and p.required:
                        raise MissingArgument(p.name)
                    args.append(got if got or p.required else (p.default or []))
                else:
                    args.extend(got)
        return args, kwargs


def _opts(func: Handler, opts: dict) -> dict:
    """Options of ``@command`` plus what ``@checks.*`` decorators stored on the function."""
    out = dict(opts)
    out["checks"] = list(opts.get("checks", ())) + list(getattr(func, "__diddy_checks__", []))
    out["cooldowns"] = list(getattr(func, "__diddy_cooldowns__", []))
    out["aliases"] = tuple(opts.get("aliases", ()))
    return out


def _validate(name: str, aliases: tuple[str, ...], func: Handler) -> None:
    for n in (name, *aliases):
        if not n or not _NAME.match(n):
            raise ValueError(f"command name {n!r}: only letters, digits, _, - and /")
    if not inspect.iscoroutinefunction(func):
        raise TypeError(f"command {name!r}: the handler must be an async function")


async def _run_check(pred: Callable[..., Any], ctx: Any) -> None:
    if not await _maybe(pred(ctx)):
        raise CheckFailure(f"{ctx.invoked_with}: you cannot use this here.")


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
        elif typing.get_origin(kind) in (list, typing.List):  # noqa: UP006
            inner = typing.get_args(kind)
            out.append(Param(name, inner[0] if inner else str, required, default, "list"))
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
        aliases = tuple(opts.get("aliases", ()))
        _validate(name, aliases, func)
        if name in self.commands:
            self.remove(name)  # redefining a command (e.g. your own "help") replaces it
        for n in (name, *aliases):
            if n.lower() in self._lookup and self._lookup[n.lower()].name != name:
                raise ValueError(f"command name {n!r} is already used by "
                                 f"{self._lookup[n.lower()].name!r}")
        cmd = Command(name=name, func=func, params=_params(func), **_opts(func, opts))
        self.commands[name] = cmd
        for n in (name, *cmd.aliases):
            self._lookup[n.lower()] = cmd
        return cmd

    def add_command(self, cmd: Command) -> Command:
        """Register a ready-made :class:`Command` (used for cogs)."""
        for n in (cmd.name, *cmd.aliases):
            other = self._lookup.get(n.lower())
            if other is not None and other.name != cmd.name:
                raise ValueError(f"command name {n!r} is already used by {other.name!r}")
        if cmd.name in self.commands:
            self.remove(cmd.name)
        self.commands[cmd.name] = cmd
        for n in (cmd.name, *cmd.aliases):
            self._lookup[n.lower()] = cmd
        return cmd

    def remove(self, name: str) -> None:
        cmd = self.commands.pop(name, None)
        if cmd:
            for n in (cmd.name, *cmd.aliases):
                self._lookup.pop(n.lower(), None)

    def parse(self, body: str) -> Optional[tuple[Command, str]]:
        """``(command, rest of the line)`` for a message, or ``None`` when it is no command.

        For ``!playlist add x`` the command is the subcommand ``add`` and the rest is ``x``.
        """
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
        if cmd is None:
            return None
        tail = tail.strip()
        while cmd.children and tail:
            parts = tail.split(None, 1)
            kid = cmd.child(parts[0])
            if kid is None:
                break
            cmd, tail = kid, (parts[1].strip() if len(parts) > 1 else "")
        return cmd, tail

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
        """A help card with one group per ``group=``, in the order the commands were added.
        Subcommands get their own rows."""
        groups: dict[str, list[tuple[str, str]]] = {}
        for top in self.visible():
            for c in top.walk():
                if c.hidden or (c.children and not c.invoke_without_command):
                    continue  # a group without an action of its own: its subcommands list instead
                groups.setdefault(top.group, []).append(c.row(self.prefix))
        out = []
        for g, rows in groups.items():
            title = title_for(g) if title_for else g
            # Diddy shows at most 20 rows per group and 12 groups
            for n in range(0, len(rows), 20):
                out.append(cards.help_group(title if n == 0 else f"{title} ({n // 20 + 1})",
                                            *rows[n:n + 20]))
        return cards.help(out[:12], note)
