"""The bot: commands, events, sending, live cards. Matrix itself is in :mod:`diddybot.matrix`."""
from __future__ import annotations

import asyncio
import collections
import inspect
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Iterable, Optional, Union

from . import cards
from .commands import Command, CommandRegistry, UsageError
from .protocol import (
    BOT_EVENT,
    CARD_ACTION_KEY,
    CARD_KEY,
    COMMANDS_EVENT,
    VERSION,
    _PREFIX,
    _match,
    parse_card,
)

log = logging.getLogger("diddybot")

Content = Union[str, cards.Card, dict]
Handler = Callable[..., Awaitable[Any]]

__all__ = ["Bot", "Context", "Message"]


def _hex_ok(v: str) -> bool:
    import re
    return bool(re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})", v or ""))


def to_content(content: Content, *, html: Optional[str] = None, notice: bool = True) -> dict:
    """A message content from text, a :class:`~diddybot.cards.Card` or a ready dict."""
    if isinstance(content, cards.Card):
        out = content.content()
        if not notice:
            out["msgtype"] = "m.text"
        return out
    if isinstance(content, dict):
        return dict(content)
    out = {"msgtype": "m.notice" if notice else "m.text", "body": str(content)}
    if html is not None:
        out["format"] = "org.matrix.custom.html"
        out["formatted_body"] = html
    return out


def edit_content(event_id: str, content: dict) -> dict:
    """An ``m.replace`` edit of ``event_id``: the card is in ``m.new_content`` too (Diddy needs it)."""
    new = {k: v for k, v in content.items() if k != "m.relates_to"}
    edit = dict(new)
    edit["body"] = f"* {new.get('body', '')}"
    if "formatted_body" in new:
        edit["formatted_body"] = f"* {new['formatted_body']}"
    edit["m.new_content"] = new
    edit["m.relates_to"] = {"rel_type": "m.replace", "event_id": event_id}
    return edit


class Message:
    """A message the bot sent. Cards that change (progress, status) are **edited**, not resent::

        msg = await ctx.reply(cards.track("downloading", "Song"))
        await msg.update(cards.track("playing", "Song", duration=200, position=0))

    Updates closer together than ``bot.edit_interval`` seconds are merged: only the newest
    is sent, so a loop that updates every 50 ms does not flood the room.
    """

    def __init__(self, bot: "Bot", room_id: str, event_id: str, content: dict):
        self.bot = bot
        self.room_id = room_id
        self.event_id = event_id
        self.content = content
        self._lock = asyncio.Lock()
        self._pending: Optional[dict] = None
        self._last = 0.0

    @property
    def card(self) -> Optional[dict]:
        """The card as Diddy draws it now (``None`` for plain text)."""
        return parse_card(self.content)

    async def update(self, content: Content, *, html: Optional[str] = None) -> None:
        """Replace the message (card or text) with new content."""
        new = to_content(content, html=html, notice=self.content.get("msgtype") != "m.text")
        self._pending = new
        async with self._lock:
            if self._pending is None:
                return  # a newer update was already sent
            wait = self.bot.edit_interval - (time.monotonic() - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            new, self._pending = self._pending, None
            if new is None:
                return
            self.bot._lint(new)
            await self.bot._send_raw(self.room_id, "m.room.message",
                                     edit_content(self.event_id, new))
            self.content = new
            self._last = time.monotonic()

    async def react(self, key: str) -> None:
        await self.bot.react(self.room_id, self.event_id, key)

    async def delete(self, reason: str = "") -> None:
        await self.bot._t.redact(self.room_id, self.event_id, reason)

    def __repr__(self) -> str:
        return f"<Message {self.event_id} in {self.room_id}>"


@dataclass
class Context:
    """Everything about one incoming message (or reaction) plus ways to answer."""

    bot: "Bot"
    room_id: str
    sender: str
    event_id: str
    content: dict
    body: str = ""
    command: Optional[Command] = None
    #: text after the command name
    arg: str = ""
    #: True when a Diddy card button / the timeline sent this command
    from_button: bool = False
    #: for reactions: the emoji and the event it reacts to
    reaction: Optional[str] = None
    target: Optional[str] = None

    @property
    def args(self) -> list[str]:
        """The words after the command ("quoted words" stay together)."""
        from .commands import split_args
        return [w for w, _ in split_args(self.arg)]

    @property
    def sender_name(self) -> str:
        """Display name of the sender in this room (falls back to the Matrix id)."""
        return self.bot._t.display_name(self.room_id, self.sender) or self.sender

    @property
    def room_name(self) -> str:
        return self.bot._t.room_name(self.room_id)

    @property
    def is_dm(self) -> bool:
        """True in a room with only the bot and the sender."""
        return self.bot._t.member_count(self.room_id) <= 2

    @property
    def power(self) -> int:
        """Power level of the sender in this room (0 user, 50 moderator, 100 admin)."""
        return self.bot._t.power_level(self.room_id, self.sender)

    async def reply(self, content: Content, *, quote: bool = False, html: Optional[str] = None,
                    notice: bool = True) -> Message:
        """Answer in this room. ``quote=True`` shows it as a reply to the message."""
        c = to_content(content, html=html, notice=notice)
        if quote and self.event_id:
            c["m.relates_to"] = {"m.in_reply_to": {"event_id": self.event_id}}
        return await self.bot.send(self.room_id, c)

    send = reply

    async def show(self, content: Content, *, key: str = "", html: Optional[str] = None,
                   new: bool = False) -> Message:
        """Show a card that stays in place: the first call sends it, later calls with the same
        ``key`` in this room **edit** it (a button press updates the card instead of adding a
        message). ``key`` defaults to the command name; ``new=True`` starts a fresh card."""
        key = key or (self.command.name if self.command else "default")
        live = None if new else self.bot.live(self.room_id, key)
        if live is not None:
            await live.update(content, html=html)
            return live
        msg = await self.reply(content, html=html)
        self.bot._live[(self.room_id, key)] = msg
        return msg

    async def react(self, key: str) -> None:
        """React to the message (``await ctx.react("👍")``)."""
        await self.bot.react(self.room_id, self.event_id, key)

    async def dm(self, content: Content, *, html: Optional[str] = None) -> Message:
        """Send a direct message to the sender (opens a private room the first time)."""
        return await self.bot.dm(self.sender, content, html=html)

    async def usage(self, problem: str = "") -> Message:
        """Answer with the usage line of the current command."""
        line = self.command.usage_line(self.bot.prefix) if self.command else ""
        text = f"{problem.rstrip('.')}. Usage: {line}" if problem else f"Usage: {line}"
        return await self.reply(cards.note(text, tone="warning", icon="⌨️"))


class Bot:
    """A Matrix bot that works with every client and looks best in Diddy.

    Minimal::

        bot = Bot.from_env()

        @bot.command("ping", desc="answers pong")
        async def ping(ctx):
            await ctx.reply(cards.note("Pong!", tone="success", icon="🏓"))

        bot.run()

    The bot logs in (password once, then the saved token), keeps E2EE keys in ``store_path``,
    joins rooms it is invited to, announces itself and its commands to Diddy (``dev.diddy.bot``,
    ``dev.diddy.commands``) and answers ``!help`` with a help card.
    """

    def __init__(
        self,
        homeserver: str = "",
        user_id: str = "",
        *,
        password: str = "",
        access_token: str = "",
        device_id: str = "",
        store_path: str = "./store",
        prefix: str = "!",
        display_name: str = "",
        avatar: str = "",
        about: str = "",
        banner: Optional[tuple] = None,
        accent: str = "",
        encryption: bool = True,
        auto_join: bool = True,
        help_command: bool = True,
        help_note: str = "",
        announce: bool = True,
        ignore_older_than: float = 60.0,
        edit_interval: float = 1.0,
        strict: bool = False,
        error_text: str = "Something went wrong. The bot log has the details.",
        transport: Any = None,
    ):
        if not _match(_PREFIX, prefix):
            log.warning("prefix %r: Diddy only suggests commands for punctuation prefixes such as "
                        "'!', '.', '%%' (no letters, no '/')", prefix)
        if banner is not None and (len(banner) not in (2, 3) or not all(_hex_ok(c) for c in banner[:2])):
            raise ValueError("banner must be (from, to) or (from, to, angle) with #rgb/#rrggbb colours")
        if accent and not _hex_ok(accent):
            raise ValueError("accent must be a #rgb or #rrggbb colour")
        self.prefix = prefix
        self.registry = CommandRegistry(prefix)
        self.display_name = display_name
        self.avatar = avatar
        self.about = about
        self.banner = banner
        self.accent = accent
        self.auto_join = auto_join
        self.announce = announce
        self.ignore_older_than = ignore_older_than
        self.edit_interval = edit_interval
        self.strict = strict
        self.error_text = error_text
        self.help_note = help_note
        self.store_path = store_path
        self._message_handlers: list[Handler] = []
        self._reaction_handlers: list[Handler] = []
        self._join_handlers: list[Handler] = []
        self._member_handlers: list[Handler] = []
        self._start_handlers: list[Handler] = []
        self._timers: list[tuple[float, Handler]] = []
        self._tasks: set[asyncio.Task] = set()
        self._seen: collections.OrderedDict[str, None] = collections.OrderedDict()
        self._warned: set[str] = set()
        self._live: dict[tuple[str, str], Message] = {}
        self._started_ms = int(time.time() * 1000)
        if transport is None:
            from .matrix import NioTransport
            transport = NioTransport(
                self, homeserver=homeserver, user_id=user_id, password=password,
                access_token=access_token, device_id=device_id, store_path=store_path,
                encryption=encryption)
        self._t = transport
        if help_command:
            self.registry.add("help", self._help, desc="all commands", group="Help",
                              aliases=("hilfe",))

    # ------------------------------------------------------------------ setup
    @classmethod
    def from_env(cls, **overrides: Any) -> "Bot":
        """Settings from environment variables (and a ``.env`` file in the working directory).

        ``DIDDY_BOT_HOMESERVER``, ``DIDDY_BOT_USER``, ``DIDDY_BOT_PASSWORD`` or
        ``DIDDY_BOT_TOKEN``, optional ``DIDDY_BOT_STORE`` (default ``./store``),
        ``DIDDY_BOT_PREFIX``, ``DIDDY_BOT_DEVICE``. Keyword arguments win.
        """
        _load_dotenv(".env")
        env = os.environ.get
        opts: dict[str, Any] = {
            "homeserver": env("DIDDY_BOT_HOMESERVER", ""),
            "user_id": env("DIDDY_BOT_USER", ""),
            "password": env("DIDDY_BOT_PASSWORD", ""),
            "access_token": env("DIDDY_BOT_TOKEN", ""),
            "device_id": env("DIDDY_BOT_DEVICE", ""),
            "store_path": env("DIDDY_BOT_STORE", "./store"),
        }
        if env("DIDDY_BOT_PREFIX"):
            opts["prefix"] = env("DIDDY_BOT_PREFIX")
        opts.update(overrides)
        if "transport" not in overrides:
            missing = [n for n, k in (("DIDDY_BOT_HOMESERVER", "homeserver"),
                                      ("DIDDY_BOT_USER", "user_id")) if not opts[k]]
            if not opts["password"] and not opts["access_token"]:
                missing.append("DIDDY_BOT_PASSWORD or DIDDY_BOT_TOKEN")
            if missing:
                raise SystemExit("diddybot: missing settings: " + ", ".join(missing)
                                 + " (environment or .env file)")
        return cls(**opts)

    @property
    def user_id(self) -> str:
        return self._t.user_id

    @property
    def client(self) -> Any:
        """The underlying ``nio.AsyncClient`` for everything this library does not cover."""
        return getattr(self._t, "client", None)

    # ------------------------------------------------------------------ decorators
    def command(self, name: str = "", *, desc: str = "", usage: str = "",
                aliases: Iterable[str] = (), group: str = "Commands", power: int = 0,
                hidden: bool = False, dm_only: bool = False) -> Callable[[Handler], Handler]:
        """Register a command. ``name`` defaults to the function name.

        ``power``: lowest power level allowed to run it (50 = moderators). ``hidden``: not in help
        or Diddy's suggestions. ``group``: section in the help card. ``usage`` is generated from
        the function's parameters when left out.
        """
        def deco(func: Handler) -> Handler:
            self.registry.add(name or func.__name__, func, desc=desc or _doc_line(func),
                              usage=usage, aliases=tuple(aliases), group=group, power=power,
                              hidden=hidden, dm_only=dm_only)
            return func
        return deco

    def on_message(self, func: Handler) -> Handler:
        """``async def f(ctx)`` for every text message that is not a command of this bot."""
        self._message_handlers.append(_need_async(func))
        return func

    def on_reaction(self, func: Handler) -> Handler:
        """``async def f(ctx)`` for reactions: ``ctx.reaction`` (emoji), ``ctx.target`` (event)."""
        self._reaction_handlers.append(_need_async(func))
        return func

    def on_join(self, func: Handler) -> Handler:
        """``async def f(bot, room_id)`` when the bot joined a room (invite accepted)."""
        self._join_handlers.append(_need_async(func))
        return func

    def on_member_join(self, func: Handler) -> Handler:
        """``async def f(bot, room_id, user_id)`` when someone else joined a room of the bot."""
        self._member_handlers.append(_need_async(func))
        return func

    def on_start(self, func: Handler) -> Handler:
        """``async def f(bot)`` once the bot is logged in and synced."""
        self._start_handlers.append(_need_async(func))
        return func

    def every(self, seconds: float) -> Callable[[Handler], Handler]:
        """``async def f(bot)`` every ``seconds`` while the bot runs (first run after start)."""
        def deco(func: Handler) -> Handler:
            self._timers.append((seconds, _need_async(func)))
            return func
        return deco

    # ------------------------------------------------------------------ running
    def run(self) -> None:
        """Start the bot and block until Ctrl+C."""
        if not logging.getLogger().handlers:
            logging.basicConfig(level=logging.INFO,
                                format="%(asctime)s %(levelname)s %(name)s: %(message)s")
        try:
            asyncio.run(self.start())
        except KeyboardInterrupt:
            pass

    async def start(self) -> None:
        """Log in, sync and handle events until :meth:`stop`."""
        self._started_ms = int(time.time() * 1000)
        await self._t.login()
        await self._t.run(self._ready)
        for t in list(self._tasks):
            t.cancel()

    def stop(self) -> None:
        self._t.stop()

    async def _ready(self) -> None:
        """First sync done: announce in all rooms, start timers, call on_start."""
        await self._t.set_profile(self.display_name, self.avatar)
        if self.announce:
            await asyncio.gather(*(self.announce_in(r) for r in self._t.joined_rooms()))
        for seconds, func in self._timers:
            self._spawn(self._repeat(seconds, func))
        for func in self._start_handlers:
            await self._safe(func(self), "on_start")
        log.info("%s is ready in %d rooms", self.user_id, len(self._t.joined_rooms()))

    async def _repeat(self, seconds: float, func: Handler) -> None:
        while True:
            await asyncio.sleep(seconds)
            await self._safe(func(self), f"every({seconds})")

    def _spawn(self, coro: Awaitable[Any]) -> asyncio.Task:
        task = asyncio.ensure_future(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def _safe(self, coro: Awaitable[Any], what: str) -> Any:
        try:
            return await coro
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("%s failed", what)
            return None

    # ------------------------------------------------------------------ Diddy room state
    def profile_content(self) -> dict:
        """Content of ``dev.diddy.bot`` (Diddy shows the BOT badge, about text and banner)."""
        out: dict[str, Any] = {"v": VERSION}
        if self.about:
            out["about"] = self.about[:200]
        if self.banner:
            out["banner"] = {"from": self.banner[0], "to": self.banner[1],
                             "angle": self.banner[2] if len(self.banner) > 2 else 135}
        if self.accent:
            out["accent"] = self.accent
        return out

    async def announce_in(self, room_id: str) -> None:
        """Publish ``dev.diddy.bot`` and ``dev.diddy.commands`` in a room (when they changed).

        Needs the power level for state events (default: moderator). Without it Diddy shows no
        suggestions there; the bot still works.
        """
        for etype, content in ((BOT_EVENT, self.profile_content()),
                               (COMMANDS_EVENT, self.registry.commands_content())):
            if etype == COMMANDS_EVENT and not content["commands"]:
                continue
            try:
                current = await self._t.get_state(room_id, etype, self.user_id)
                if current == content:
                    continue
                if not await self._t.put_state(room_id, etype, self.user_id, content):
                    key = f"announce:{room_id}"
                    if key not in self._warned:
                        self._warned.add(key)
                        log.info("no permission for %s in %s: make the bot a moderator to get "
                                 "the BOT badge and command suggestions in Diddy", etype, room_id)
                    return
            except Exception:
                log.exception("announcing %s in %s failed", etype, room_id)

    # ------------------------------------------------------------------ sending
    def live(self, room_id: str, key: str) -> Optional[Message]:
        """The card :meth:`Context.show` keeps under ``key`` in a room (``None`` if there is none)."""
        return self._live.get((room_id, key))

    def forget(self, room_id: str, key: str) -> None:
        """Let the next :meth:`Context.show` with ``key`` send a new card."""
        self._live.pop((room_id, key), None)

    async def send(self, room_id: str, content: Content, *, html: Optional[str] = None,
                   notice: bool = True) -> Message:
        """Send text, a card or a raw content dict. Returns a :class:`Message` to edit later."""
        c = to_content(content, html=html, notice=notice)
        self._lint(c)
        event_id = await self._send_raw(room_id, "m.room.message", c)
        return Message(self, room_id, event_id, c)

    async def react(self, room_id: str, event_id: str, key: str) -> None:
        await self._send_raw(room_id, "m.reaction", {
            "m.relates_to": {"rel_type": "m.annotation", "event_id": event_id, "key": key}})

    async def dm(self, user_id: str, content: Content, *, html: Optional[str] = None) -> Message:
        """Direct message to ``user_id`` (reuses an existing private room)."""
        room_id = await self._t.dm_room(user_id, self.display_name or "Bot")
        return await self.send(room_id, content, html=html)

    async def upload(self, data: Union[bytes, str, os.PathLike], mimetype: str = "",
                     filename: str = "") -> str:
        """Upload a file (bytes or a path) and return its ``mxc://`` URI (e.g. a card thumbnail)."""
        if not isinstance(data, bytes):
            path = os.fspath(data)
            filename = filename or os.path.basename(path)
            with open(path, "rb") as fh:
                data = fh.read()
        if not mimetype:
            import mimetypes
            mimetype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        return await self._t.upload(data, mimetype, filename or "file")

    async def _send_raw(self, room_id: str, etype: str, content: dict) -> str:
        return await self._t.send(room_id, etype, content)

    def _lint(self, content: dict) -> None:
        if CARD_KEY not in content:
            return
        problems = cards.check(content)
        if not problems:
            return
        if self.strict:
            raise ValueError("Diddy would not draw this card as sent: " + "; ".join(problems))
        for p in problems:
            key = f"{content[CARD_KEY].get('kind')}:{p}"
            if key not in self._warned:
                self._warned.add(key)
                log.warning("card (%s): %s", content[CARD_KEY].get("kind"), p)

    # ------------------------------------------------------------------ incoming
    def _fresh(self, event_id: str, ts: Optional[int]) -> bool:
        if event_id in self._seen:
            return False
        self._seen[event_id] = None
        while len(self._seen) > 2000:
            self._seen.popitem(last=False)
        if ts is not None and self.ignore_older_than is not None:
            if ts < self._started_ms - self.ignore_older_than * 1000:
                return False
        return True

    async def handle_message(self, room_id: str, sender: str, event_id: str, content: dict,
                             ts: Optional[int] = None) -> None:
        """Handle one ``m.room.message`` (called by the transport, also usable in tests)."""
        if sender == self.user_id or not self._fresh(event_id, ts):
            return
        rel = content.get("m.relates_to") or {}
        if rel.get("rel_type") == "m.replace":
            return  # edits of earlier messages are no new commands
        if content.get("msgtype") != "m.text" or not isinstance(content.get("body"), str):
            return  # m.notice comes from bots: never answer those (no bot loops)
        body = content["body"]
        parsed = self.registry.parse(body)
        ctx = Context(self, room_id, sender, event_id, content, body,
                      from_button=content.get(CARD_ACTION_KEY) is True)
        if parsed is None:
            for func in self._message_handlers:
                await self._safe(func(ctx), "on_message")
            return
        ctx.command, ctx.arg = parsed
        await self._run_command(ctx)

    async def _run_command(self, ctx: Context) -> None:
        cmd = ctx.command
        assert cmd is not None
        if cmd.dm_only and not ctx.is_dm:
            await ctx.reply(cards.note(f"{self.prefix}{cmd.name} only works in a direct message "
                                       "with me.", tone="warning", icon="✉️"))
            return
        if cmd.power and ctx.power < cmd.power:
            await ctx.reply(cards.note(f"{self.prefix}{cmd.name} needs power level {cmd.power} "
                                       f"in this room (you have {ctx.power}).",
                                       tone="error", icon="🔒"))
            return
        try:
            args, kwargs = cmd.bind(ctx.arg)
        except UsageError as e:
            await ctx.usage(str(e))
            return
        log.info("%s: %s%s %s", ctx.sender, self.prefix, cmd.name, ctx.arg[:80])
        try:
            await cmd.func(ctx, *args, **kwargs)
        except UsageError as e:
            await ctx.usage(str(e))
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("command %s failed", cmd.name)
            if self.error_text:
                try:
                    await ctx.reply(cards.note(self.error_text, tone="error", icon="⚠️"))
                except Exception:
                    log.exception("could not report the error")

    async def handle_reaction(self, room_id: str, sender: str, event_id: str, target: str,
                              key: str, ts: Optional[int] = None) -> None:
        if sender == self.user_id or not self._fresh(event_id, ts):
            return
        ctx = Context(self, room_id, sender, event_id, {}, reaction=key, target=target)
        for func in self._reaction_handlers:
            await self._safe(func(ctx), "on_reaction")

    async def handle_joined(self, room_id: str) -> None:
        if self.announce:
            await self.announce_in(room_id)
        for func in self._join_handlers:
            await self._safe(func(self, room_id), "on_join")

    async def handle_member_join(self, room_id: str, user_id: str) -> None:
        for func in self._member_handlers:
            await self._safe(func(self, room_id, user_id), "on_member_join")

    async def _help(self, ctx: Context) -> None:
        await ctx.reply(self.registry.help_card(self.help_note))


def _need_async(func: Handler) -> Handler:
    if not inspect.iscoroutinefunction(func):
        raise TypeError(f"{getattr(func, '__name__', func)!r} must be an async function")
    return func


def _doc_line(func: Handler) -> str:
    doc = inspect.getdoc(func) or ""
    return doc.strip().splitlines()[0] if doc.strip() else ""


def _load_dotenv(path: str) -> None:
    """Minimal .env reader: KEY=value lines, existing environment wins."""
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip().removeprefix("export ").strip()
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        os.environ.setdefault(k, v)
