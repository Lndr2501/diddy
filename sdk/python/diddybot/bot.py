"""The bot: commands, events, sending, live cards. Matrix itself is in :mod:`diddybot.matrix`."""
from __future__ import annotations

import asyncio
import collections
import html as htmllib
import importlib
import inspect
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Iterable, Optional, Union

from . import cards
from .cog import Cog
from .commands import Command, CommandRegistry, _doc_line, split_args
from .errors import (
    CheckFailure,
    CommandError,
    CommandInvokeError,
    DMOnly,
    OnCooldown,
    RoomOnly,
    UsageError,
)
from .objects import File, Member, Room
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
from .store import Store
from .tasks import Loop
from .ui import VIEW_COMMAND, View, confirm, paginate

log = logging.getLogger("diddybot")

Content = Union[str, cards.Card, dict, File]
Handler = Callable[..., Awaitable[Any]]

__all__ = ["Bot", "Context", "Message"]

_KEEP: Any = object()  # "leave the view as it is" in Message.update
_VIEW_PRESS = re.compile(rf"[!/]{VIEW_COMMAND} ([0-9a-f]{{6}}) (\d{{1,2}})")
#: events a listener can subscribe to (``@bot.listen("message")``) and what it receives
EVENTS = {
    "ready": "()", "message": "(ctx)", "message_edit": "(ctx)", "message_delete": "(ctx)",
    "reaction": "(ctx)", "reaction_remove": "(ctx)", "member_join": "(room_id, user_id)",
    "member_leave": "(room_id, user_id)", "join": "(room_id)", "command": "(ctx)",
    "command_completion": "(ctx)", "command_error": "(ctx, error)",
}


def _hex_ok(v: str) -> bool:
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


def _with_mentions(content: dict, members: Iterable[Any]) -> dict:
    """Turn ``@Name`` of the given members into real mentions (``m.mentions`` plus a link)."""
    ids: list[str] = []
    body = content.get("body", "")
    fb = content.get("formatted_body")
    made = fb is None
    if made:
        fb = htmllib.escape(body)
    for m in members:
        uid = m.id if isinstance(m, Member) else str(m)
        ids.append(uid)
        text = m.mention if isinstance(m, Member) else ""
        if text and htmllib.escape(text) in fb:
            link = f'<a href="https://matrix.to/#/{uid}">{htmllib.escape(text)}</a>'
            fb = fb.replace(htmllib.escape(text), link, 1)
    out = dict(content)
    out["m.mentions"] = {"user_ids": ids}
    out["format"] = "org.matrix.custom.html"
    out["formatted_body"] = fb.replace("\n", "<br>") if made else fb
    return out


class Message:
    """A message the bot sent. Cards that change (progress, status) are **edited**, not resent::

        msg = await ctx.reply(cards.track("downloading", "Song"))
        await msg.update(cards.track("playing", "Song", duration=200, position=0))

    Updates closer together than ``bot.edit_interval`` seconds are merged: only the newest
    is sent, so a loop that updates every 50 ms does not flood the room.
    """

    def __init__(self, bot: "Bot", room_id: str, event_id: str, content: dict, *,
                 base: Optional[dict] = None, view: Optional[View] = None):
        self.bot = bot
        self.room_id = room_id
        self.event_id = event_id
        self.content = content
        #: the content without the buttons of a view
        self.base = base if base is not None else content
        self.view = view
        self._lock = asyncio.Lock()
        self._pending: Optional[tuple[dict, dict, Optional[View]]] = None
        self._last = 0.0

    @property
    def card(self) -> Optional[dict]:
        """The card as Diddy draws it now (``None`` for plain text)."""
        return parse_card(self.content)

    async def update(self, content: Content, *, html: Optional[str] = None,
                     view: Any = _KEEP) -> None:
        """Replace the message (card or text) with new content. ``view=False`` removes the
        buttons of a view, a :class:`~diddybot.ui.View` puts its buttons on the card."""
        if isinstance(content, File):
            raise TypeError("a file cannot be edited into a message")
        v = self.view if view is _KEEP else (view or None)
        base = to_content(_for_view(content, v), html=html,
                          notice=self.content.get("msgtype") != "m.text")
        final = v.inject(base) if v is not None else base
        self._pending = (final, base, v)
        async with self._lock:
            if self._pending is None:
                return  # a newer update was already sent
            wait = self.bot.edit_interval - (time.monotonic() - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            (final, base, v), self._pending = self._pending, None
            self.bot._lint(final)
            await self.bot._send_raw(self.room_id, "m.room.message",
                                     edit_content(self.event_id, final))
            self.content, self.base, self.view = final, base, v
            self._last = time.monotonic()

    async def react(self, key: str) -> None:
        await self.bot.react(self.room_id, self.event_id, key)

    async def delete(self, reason: str = "") -> None:
        await self.bot._t.redact(self.room_id, self.event_id, reason)

    def __repr__(self) -> str:
        return f"<Message {self.event_id} in {self.room_id}>"


def _for_view(content: Content, view: Optional[View]) -> Content:
    """Text that gets buttons becomes a small list card (only cards can carry buttons)."""
    if view is not None and isinstance(content, str):
        if len(content) > 100:
            raise ValueError("text with buttons must be at most 100 characters; send a card "
                             "(cards.listing, cards.stats ...) for more")
        return cards.listing(content, [])
    return content


class _Typing:
    """``async with ctx.typing():`` shows "bot is typing…" while your code works."""

    def __init__(self, bot: "Bot", room_id: str):
        self.bot, self.room_id = bot, room_id
        self._task: Optional[asyncio.Task] = None

    async def _set(self, on: bool) -> None:
        try:
            await self.bot._t.set_typing(self.room_id, on)
        except Exception:  # noqa: BLE001 - typing is cosmetic
            log.debug("typing notification failed", exc_info=True)

    async def _refresh(self) -> None:
        while True:
            await asyncio.sleep(20)
            await self._set(True)

    async def __aenter__(self) -> "_Typing":
        await self._set(True)
        self._task = self.bot._spawn(self._refresh())
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._task:
            self._task.cancel()
        await self._set(False)


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
    #: for reactions: the emoji and the event it reacts to; for edits and deletions: the event
    reaction: Optional[str] = None
    target: Optional[str] = None

    @property
    def args(self) -> list[str]:
        """The words after the command ("quoted words" stay together)."""
        return [w for w, _ in split_args(self.arg)]

    @property
    def author(self) -> Member:
        """The sender as a :class:`~diddybot.objects.Member`."""
        return Member(self.bot, self.room_id, self.sender)

    @property
    def room(self) -> Room:
        return Room(self.bot, self.room_id)

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

    @property
    def prefix(self) -> str:
        return self.bot.prefix

    @property
    def invoked_with(self) -> str:
        """The command as the user typed it, e.g. ``!playlist add``."""
        return f"{self.bot.prefix}{self.command.full_name}" if self.command else ""

    async def reply(self, content: Content, *, quote: bool = False, html: Optional[str] = None,
                    notice: Optional[bool] = None, view: Optional[View] = None,
                    mentions: Iterable[Any] = ()) -> Message:
        """Answer in this room. ``quote=True`` shows it as a reply to the message.

        ``view`` adds buttons with callbacks (:mod:`diddybot.ui`). ``mentions=[member]`` turns
        ``member.mention`` in your text into a real mention (and a notification: such a message
        is not a notice unless you say ``notice=True``).
        """
        return await self.bot.send(self.room_id, content, html=html, notice=notice, view=view,
                                   mentions=mentions,
                                   reply_to=self.event_id if quote and self.event_id else None)

    send = reply

    async def show(self, content: Content, *, key: str = "", html: Optional[str] = None,
                   new: bool = False, view: Optional[View] = None) -> Message:
        """Show a card that stays in place: the first call sends it, later calls with the same
        ``key`` in this room **edit** it (a button press updates the card instead of adding a
        message). ``key`` defaults to the command name; ``new=True`` starts a fresh card."""
        key = key or (self.command.name if self.command else "default")
        live = None if new else self.bot.live(self.room_id, key)
        if live is not None:
            await live.update(content, html=html, view=view if view is not None else _KEEP)
            return live
        msg = await self.reply(content, html=html, view=view)
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

    def typing(self) -> _Typing:
        """``async with ctx.typing(): ...`` shows that the bot is working."""
        return _Typing(self.bot, self.room_id)

    async def confirm(self, question: str, **kw: Any) -> Optional[bool]:
        """Yes/no with buttons: ``True``, ``False`` or ``None`` (no answer). See
        :func:`diddybot.ui.confirm`."""
        return await confirm(self, question, **kw)

    async def paginate(self, pages: Iterable[Content], **kw: Any) -> Any:
        """Send pages with ◀ ▶ buttons. See :func:`diddybot.ui.paginate`."""
        return await paginate(self, pages, **kw)

    async def ask(self, prompt: Content, *, timeout: float = 60.0,
                  user: Optional[str] = None) -> Optional[str]:
        """Ask something and return the text of the next answer of ``user`` (default: the
        sender) in this room, or ``None`` after ``timeout`` seconds."""
        await self.reply(prompt)
        who = user or self.sender
        try:
            answer = await self.bot.wait_for(
                "message", timeout=timeout,
                check=lambda c: c.sender == who and c.room_id == self.room_id)
        except asyncio.TimeoutError:
            return None
        return answer.body


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
        owners: Iterable[str] = (),
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
        self.owners = set(owners)
        self.ignore_older_than = ignore_older_than
        self.edit_interval = edit_interval
        self.strict = strict
        self.error_text = error_text
        self.help_note = help_note
        self.store_path = store_path
        self._listeners: dict[str, list[Handler]] = collections.defaultdict(list)
        self._waiters: dict[str, list[tuple[Optional[Callable], asyncio.Future]]] = \
            collections.defaultdict(list)
        self._global_checks: list[Callable[..., Any]] = []
        self._before: list[Handler] = []
        self._after: list[Handler] = []
        self._error_handlers: list[Handler] = []
        self._cogs: dict[str, dict] = {}
        self._extensions: dict[str, tuple[Any, list[str]]] = {}
        self._views: dict[str, View] = {}
        self._loops: list[Loop] = []
        self._later: list[Awaitable[Any]] = []
        self._store: Optional[Store] = None
        self._running = False
        self._tasks: set[asyncio.Task] = set()
        self._seen: collections.OrderedDict[str, None] = collections.OrderedDict()
        self._reactions: collections.OrderedDict[str, tuple] = collections.OrderedDict()
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
        ``DIDDY_BOT_PREFIX``, ``DIDDY_BOT_DEVICE``, ``DIDDY_BOT_OWNERS`` (comma separated Matrix
        ids). Keyword arguments win.
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
        if env("DIDDY_BOT_OWNERS"):
            opts["owners"] = [o.strip() for o in env("DIDDY_BOT_OWNERS", "").split(",") if o.strip()]
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

    @property
    def store(self) -> Store:
        """A small key-value database that survives restarts (see :mod:`diddybot.store`)."""
        if self._store is None:
            self._store = Store(os.path.join(self.store_path, "bot.sqlite"))
        return self._store

    @property
    def rooms(self) -> list[Room]:
        """The rooms the bot is in."""
        return [Room(self, r) for r in self._t.joined_rooms()]

    def is_owner(self, user_id: str) -> bool:
        return user_id in self.owners

    # ------------------------------------------------------------------ commands
    def command(self, name: str = "", *, desc: str = "", usage: str = "",
                aliases: Iterable[str] = (), group: str = "Commands", power: int = 0,
                hidden: bool = False, dm_only: bool = False,
                checks: Iterable[Callable[..., Any]] = ()) -> Callable[[Handler], Command]:
        """Register a command. ``name`` defaults to the function name.

        ``power``: lowest power level allowed to run it (50 = moderators). ``hidden``: not in help
        or Diddy's suggestions. ``group``: section in the help card. ``usage`` is generated from
        the function's parameters when left out. More conditions: :mod:`diddybot.checks`.
        """
        def deco(func: Handler) -> Command:
            return self.registry.add(
                name or func.__name__, func, desc=desc or _doc_line(func), usage=usage,
                aliases=tuple(aliases), group=group, power=power, hidden=hidden,
                dm_only=dm_only, checks=list(checks))
        return deco

    def group(self, name: str = "", *, invoke_without_command: bool = False,
              **opts: Any) -> Callable[[Handler], Command]:
        """A command with subcommands: ``@bot.group("playlist")`` then
        ``@playlist.command("add")``. Without a valid subcommand the bot lists them (or runs
        your function when ``invoke_without_command=True``)."""
        deco = self.command(name, **opts)

        def wrap(func: Handler) -> Command:
            cmd = deco(func)
            cmd.invoke_without_command = invoke_without_command
            return cmd
        return wrap

    def add_command(self, cmd: Command) -> Command:
        """Register a :class:`~diddybot.commands.Command` made with ``diddybot.command``."""
        if cmd.cog is None:
            cmd.refresh_params()
        return self.registry.add_command(cmd)

    def remove_command(self, name: str) -> None:
        self.registry.remove(name)

    def check(self, func: Callable[..., Any]) -> Callable[..., Any]:
        """``@bot.check``: a check for **every** command (``async def f(ctx) -> bool``)."""
        self._global_checks.append(func)
        return func

    def before_invoke(self, func: Handler) -> Handler:
        """``async def f(ctx)`` before every command (after checks and argument parsing)."""
        self._before.append(_need_async(func))
        return func

    def after_invoke(self, func: Handler) -> Handler:
        """``async def f(ctx)`` after every command that ran, also when it raised."""
        self._after.append(_need_async(func))
        return func

    def on_command_error(self, func: Handler) -> Handler:
        """``async def f(ctx, error)`` for errors of all commands. With a handler the bot no
        longer answers errors by itself. A command's own ``@cmd.error`` goes first."""
        self._error_handlers.append(_need_async(func))
        return func

    # ------------------------------------------------------------------ events
    def listen(self, event: Any = "") -> Callable[[Handler], Handler]:
        """``@bot.listen("message")``: call this function for an event. Several listeners per
        event are fine. Built-in events and what the function receives: see :data:`EVENTS`; your
        own names work with :meth:`dispatch`."""
        def deco(func: Handler) -> Handler:
            name = event or func.__name__.removeprefix("on_")
            self._listeners[name].append(_need_async(func))
            return func
        if callable(event):  # bare @bot.listen
            func, event = event, ""
            return deco(func)
        return deco

    def remove_listener(self, event: str, func: Handler) -> None:
        if func in self._listeners.get(event, []):
            self._listeners[event].remove(func)

    def dispatch(self, event: str, *args: Any) -> None:
        """Fire an event (also your own names) without waiting for the listeners."""
        self._spawn(self._emit(event, *args))

    async def wait_for(self, event: str, *, check: Optional[Callable[..., Any]] = None,
                       timeout: Optional[float] = None) -> Any:
        """Wait for the next matching event and return what it carries (the ``ctx`` of a
        message). Raises ``asyncio.TimeoutError`` after ``timeout`` seconds::

            answer = await bot.wait_for("message", timeout=30,
                                        check=lambda c: c.sender == ctx.sender)
        """
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        entry = (check, fut)
        self._waiters[event].append(entry)
        try:
            return await asyncio.wait_for(fut, timeout)
        finally:
            if entry in self._waiters.get(event, []):
                self._waiters[event].remove(entry)

    def _resolve_waiters(self, event: str, *args: Any) -> None:
        for check, fut in list(self._waiters.get(event, [])):
            if fut.done():
                continue
            try:
                ok = check(*args) if check else True
            except Exception as e:  # noqa: BLE001 - a broken check fails the waiter
                fut.set_exception(e)
                continue
            if ok:
                fut.set_result(args[0] if len(args) == 1 else args)

    async def _emit(self, event: str, *args: Any) -> None:
        self._resolve_waiters(event, *args)
        await self._call_listeners(event, *args)

    async def _call_listeners(self, event: str, *args: Any) -> None:
        for func in list(self._listeners.get(event, [])):
            await self._safe(func(*args), f"listener of {event}")

    # legacy decorators (still the simplest way for small bots) ----------
    def on_message(self, func: Handler) -> Handler:
        """``async def f(ctx)`` for every text message that is not a command of this bot."""
        return self.listen("message")(func)

    def on_reaction(self, func: Handler) -> Handler:
        """``async def f(ctx)`` for reactions: ``ctx.reaction`` (emoji), ``ctx.target`` (event)."""
        return self.listen("reaction")(func)

    def on_join(self, func: Handler) -> Handler:
        """``async def f(bot, room_id)`` when the bot joined a room (invite accepted)."""
        _need_async(func)

        async def call(room_id: str) -> None:
            await func(self, room_id)
        self.listen("join")(call)
        return func

    def on_member_join(self, func: Handler) -> Handler:
        """``async def f(bot, room_id, user_id)`` when someone else joined a room of the bot."""
        _need_async(func)

        async def call(room_id: str, user_id: str) -> None:
            await func(self, room_id, user_id)
        self.listen("member_join")(call)
        return func

    def on_start(self, func: Handler) -> Handler:
        """``async def f(bot)`` once the bot is logged in and synced."""
        _need_async(func)

        async def call() -> None:
            await func(self)
        self.listen("ready")(call)
        return func

    # ------------------------------------------------------------------ loops
    def loop(self, *, seconds: float = 0, minutes: float = 0, hours: float = 0,
             time: Any = None, count: Optional[int] = None,
             wait_first: bool = False) -> Callable[[Handler], Loop]:
        """A repeating job that starts with the bot (see :mod:`diddybot.tasks`)."""
        def deco(func: Handler) -> Loop:
            lp = Loop(func, seconds=seconds, minutes=minutes, hours=hours, time=time,
                      count=count, wait_first=wait_first)
            self._loops.append(lp)
            if self._running:
                lp.start()
            return lp
        return deco

    def every(self, seconds: float) -> Callable[[Handler], Handler]:
        """``async def f(bot)`` every ``seconds`` while the bot runs (first run after one
        interval). ``@bot.loop`` has more control."""
        def deco(func: Handler) -> Handler:
            lp = Loop(_need_async(func), seconds=seconds, wait_first=True)
            lp.start_args = (self,)
            self._loops.append(lp)
            if self._running:
                lp.start()
            return func
        return deco

    # ------------------------------------------------------------------ cogs
    def add_cog(self, cog: Cog) -> Cog:
        """Add a :class:`~diddybot.cog.Cog`: its commands, listeners and loops."""
        name = cog.qualified_name
        if name in self._cogs:
            raise ValueError(f"cog {name!r} is already added")
        commands = cog._commands()
        taken: set[str] = set()
        for cmd in commands:
            for n in (cmd.name, *cmd.aliases):
                other = self.registry._lookup.get(n.lower())
                if other is not None or n.lower() in taken:
                    raise ValueError(f"cog {name!r}: command name {n!r} is already used"
                                     + (f" by {other.name!r}" if other else ""))
                taken.add(n.lower())
        for cmd in commands:
            self.registry.add_command(cmd)
        listeners = cog._listeners()
        for event, func in listeners:
            self.listen(event)(func)
        loops = cog._loops()
        for lp in loops:
            self._loops.append(lp)
            if self._running:
                lp.start()
        self._cogs[name] = {"cog": cog, "commands": [c.name for c in commands],
                            "listeners": listeners, "loops": loops}
        self._later_or_now(cog.cog_load())
        return cog

    def remove_cog(self, name: str) -> Optional[Cog]:
        entry = self._cogs.pop(name, None)
        if entry is None:
            return None
        for cmd_name in entry["commands"]:
            self.registry.remove(cmd_name)
        for event, func in entry["listeners"]:
            self.remove_listener(event, func)
        for lp in entry["loops"]:
            lp.cancel()
            if lp in self._loops:
                self._loops.remove(lp)
        self._later_or_now(entry["cog"].cog_unload())
        return entry["cog"]

    def get_cog(self, name: str) -> Optional[Cog]:
        entry = self._cogs.get(name)
        return entry["cog"] if entry else None

    @property
    def cogs(self) -> dict[str, Cog]:
        return {n: e["cog"] for n, e in self._cogs.items()}

    def load_extension(self, name: str) -> None:
        """Import module ``name`` and call its ``setup(bot)`` (which adds cogs)."""
        if name in self._extensions:
            raise ValueError(f"extension {name!r} is already loaded")
        module = importlib.import_module(name)
        setup = getattr(module, "setup", None)
        if not callable(setup):
            raise ValueError(f"extension {name!r} has no setup(bot) function")
        before = set(self._cogs)
        self._later_or_now(setup(self))
        self._extensions[name] = (module, sorted(set(self._cogs) - before))

    def unload_extension(self, name: str) -> None:
        """Remove the cogs an extension added and call its ``teardown(bot)``."""
        module, cog_names = self._extensions.pop(name)
        for cog_name in cog_names:
            self.remove_cog(cog_name)
        teardown = getattr(module, "teardown", None)
        if callable(teardown):
            self._later_or_now(teardown(self))

    def _later_or_now(self, result: Any) -> None:
        if inspect.isawaitable(result):
            if self._running:
                self._spawn(self._safe(result, "cog/extension hook"))
            else:
                self._later.append(result)

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
        try:
            await self._t.run(self._ready)
        finally:
            self._running = False
            for lp in self._loops:
                lp.cancel()
            for t in list(self._tasks):
                t.cancel()

    def stop(self) -> None:
        self._t.stop()

    async def _ready(self) -> None:
        """First sync done: announce in all rooms, start loops, call ``ready`` listeners."""
        self._running = True
        await self._t.set_profile(self.display_name, self.avatar)
        if self.announce:
            await asyncio.gather(*(self.announce_in(r) for r in self._t.joined_rooms()))
        later, self._later = self._later, []
        for item in later:
            await self._safe(item, "cog/extension hook")
        for lp in self._loops:
            lp.start()
        await self._emit("ready")
        log.info("%s is ready in %d rooms", self.user_id, len(self._t.joined_rooms()))

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
                   notice: Optional[bool] = None, view: Optional[View] = None,
                   mentions: Iterable[Any] = (), reply_to: Optional[str] = None) -> Message:
        """Send text, a card, a :class:`~diddybot.objects.File` or a raw content dict. Returns a
        :class:`Message` to edit later."""
        mentions = list(mentions)
        if isinstance(content, File):
            base = await self._file_content(room_id, content)
        else:
            plain = notice if notice is not None else not mentions
            base = to_content(_for_view(content, view), html=html, notice=plain)
            if mentions:
                base = _with_mentions(base, mentions)
        if reply_to:
            base["m.relates_to"] = {"m.in_reply_to": {"event_id": reply_to}}
        final = view.inject(base) if view is not None else base
        self._lint(final)
        event_id = await self._send_raw(room_id, "m.room.message", final)
        msg = Message(self, room_id, event_id, final, base=base, view=view)
        if view is not None:
            view._attach(self, msg)
        return msg

    async def _file_content(self, room_id: str, f: File) -> dict:
        encrypted = self._t.is_encrypted(room_id)
        uri, keys = await self._t.upload_file(f.data, f.mimetype, f.filename, encrypted)
        out: dict[str, Any] = {"msgtype": f.msgtype, "body": f.caption or f.filename,
                               "info": f.info()}
        if f.caption:
            out["filename"] = f.filename
        if keys:
            out["file"] = {"url": uri, **keys}
        else:
            out["url"] = uri
        return out

    async def react(self, room_id: str, event_id: str, key: str) -> None:
        await self._send_raw(room_id, "m.reaction", {
            "m.relates_to": {"rel_type": "m.annotation", "event_id": event_id, "key": key}})

    async def dm(self, user_id: str, content: Content, *, html: Optional[str] = None,
                 view: Optional[View] = None) -> Message:
        """Direct message to ``user_id`` (reuses an existing private room)."""
        room_id = await self._t.dm_room(user_id, self.display_name or "Bot")
        return await self.send(room_id, content, html=html, view=view)

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
            await self._handle_edit(room_id, sender, event_id, content, rel)
            return
        if content.get("msgtype") != "m.text" or not isinstance(content.get("body"), str):
            return  # m.notice comes from bots: never answer those (no bot loops)
        body = content["body"]
        ctx = Context(self, room_id, sender, event_id, content, body,
                      from_button=content.get(CARD_ACTION_KEY) is True)
        press = _VIEW_PRESS.fullmatch(body.strip())
        if press:
            await self._press(ctx, press.group(1), int(press.group(2)))
            return
        self._resolve_waiters("message", ctx)
        parsed = self.registry.parse(body)
        if parsed is None:
            await self._call_listeners("message", ctx)
            return
        ctx.command, ctx.arg = parsed
        await self._run_command(ctx)

    async def _press(self, ctx: Context, view_id: str, index: int) -> None:
        view = self._views.get(view_id)
        if view is None:
            key = f"stale:{ctx.room_id}"
            if key not in self._warned:
                self._warned.add(key)
                await ctx.reply(cards.note("These buttons are out of date (the bot restarted or "
                                           "the card timed out). Run the command again.",
                                           tone="warning", icon="⌛"))
            return
        await view._press(ctx, index)

    async def _handle_edit(self, room_id: str, sender: str, event_id: str, content: dict,
                           rel: dict) -> None:
        new = content.get("m.new_content")
        new = new if isinstance(new, dict) else content
        body = new.get("body") if isinstance(new.get("body"), str) else ""
        ctx = Context(self, room_id, sender, event_id, new, body, target=rel.get("event_id"))
        await self._emit("message_edit", ctx)

    # -- running a command -------------------------------------------------
    async def _run_command(self, ctx: Context) -> None:
        cmd = ctx.command
        assert cmd is not None
        await self._emit("command", ctx)
        error: Optional[CommandError] = None
        started = False
        try:
            await cmd.can_run(ctx)
            if cmd.children and not cmd.invoke_without_command:
                await self._group_help(ctx, cmd)
                return
            args, kwargs = await cmd.bind(ctx.arg, ctx)
            cmd.take_cooldowns(ctx)
            started = True
            for hook in self._before:
                await hook(ctx)
            log.info("%s: %s %s", ctx.sender, ctx.invoked_with, ctx.arg[:80])
            await cmd.func(ctx, *args, **kwargs)
        except CommandError as e:
            error = e
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 - reported to the user, logged for you
            log.exception("command %s failed", cmd.full_name)
            error = CommandInvokeError(e)
        if started:
            for hook in self._after:
                await self._safe(hook(ctx), "after_invoke")
        if error is None:
            await self._emit("command_completion", ctx)
        else:
            await self._handle_error(ctx, error)

    async def _group_help(self, ctx: Context, cmd: Command) -> None:
        if ctx.arg.strip():
            word = ctx.arg.split(None, 1)[0]
            raise UsageError(f"unknown subcommand “{word}”")
        rows = []
        for kid in cmd.children.values():
            for c in kid.walk():
                if not c.hidden and not (c.children and not c.invoke_without_command):
                    rows.append(c.row(self.prefix))
        title = f"{self.prefix}{cmd.full_name}"
        await ctx.reply(cards.help([cards.help_group(title, *rows[:20])], cmd.desc))

    async def _handle_error(self, ctx: Context, error: CommandError) -> None:
        await self._emit("command_error", ctx, error)
        node: Optional[Command] = ctx.command
        while node is not None:
            if node.error_handler is not None:
                await self._safe(node.error_handler(ctx, error), "command error handler")
                return
            node = node.parent
        cog = ctx.command.cog if ctx.command else None
        if cog is not None and type(cog).cog_command_error is not Cog.cog_command_error:
            await self._safe(cog.cog_command_error(ctx, error), "cog_command_error")
            return
        if self._error_handlers:
            for handler in self._error_handlers:
                await self._safe(handler(ctx, error), "on_command_error")
            return
        await self._default_error(ctx, error)

    async def _default_error(self, ctx: Context, error: CommandError) -> None:
        try:
            if isinstance(error, CommandInvokeError):
                if self.error_text:
                    await ctx.reply(cards.note(self.error_text, tone="error", icon="⚠️"))
            elif isinstance(error, OnCooldown):
                await ctx.reply(cards.note(str(error), tone="warning", icon="⏳"))
            elif isinstance(error, (DMOnly, RoomOnly)):
                await ctx.reply(cards.note(str(error), tone="warning", icon="✉️"))
            elif isinstance(error, UsageError):
                await ctx.usage(str(error))
            elif isinstance(error, CheckFailure):
                await ctx.reply(cards.note(str(error), tone="error", icon="🔒"))
            elif str(error):
                await ctx.reply(cards.note(str(error), tone="warning", icon="⚠️"))
        except Exception:
            log.exception("could not report the error")

    # -- other events --------------------------------------------------------
    async def handle_reaction(self, room_id: str, sender: str, event_id: str, target: str,
                              key: str, ts: Optional[int] = None) -> None:
        if sender == self.user_id or not self._fresh(event_id, ts):
            return
        self._reactions[event_id] = (room_id, sender, target, key)
        while len(self._reactions) > 2000:
            self._reactions.popitem(last=False)
        ctx = Context(self, room_id, sender, event_id, {}, reaction=key, target=target)
        await self._emit("reaction", ctx)

    async def handle_redaction(self, room_id: str, sender: str, event_id: str, redacts: str,
                               ts: Optional[int] = None) -> None:
        """A message or reaction was deleted (``redacts`` is its event id)."""
        if sender == self.user_id or not self._fresh(event_id, ts):
            return
        react = self._reactions.pop(redacts, None)
        if react is not None:
            r_room, r_sender, target, key = react
            ctx = Context(self, r_room, r_sender, event_id, {}, reaction=key, target=target)
            await self._emit("reaction_remove", ctx)
            return
        ctx = Context(self, room_id, sender, event_id, {}, target=redacts)
        await self._emit("message_delete", ctx)

    async def handle_joined(self, room_id: str) -> None:
        if self.announce:
            await self.announce_in(room_id)
        await self._emit("join", room_id)

    async def handle_member_join(self, room_id: str, user_id: str) -> None:
        await self._emit("member_join", room_id, user_id)

    async def handle_member_leave(self, room_id: str, user_id: str) -> None:
        await self._emit("member_leave", room_id, user_id)

    async def _help(self, ctx: Context) -> None:
        await ctx.reply(self.registry.help_card(self.help_note))


def _need_async(func: Handler) -> Handler:
    if not inspect.iscoroutinefunction(func):
        raise TypeError(f"{getattr(func, '__name__', func)!r} must be an async function")
    return func


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
