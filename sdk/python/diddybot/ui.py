"""Buttons that call your Python code, like nextcord's ``ui.View``::

    class Poll(ui.View):
        def __init__(self):
            super().__init__(timeout=120)
            self.votes = {"Yes": 0, "No": 0}

        @ui.button("👍 Yes")
        async def yes(self, ctx, button):
            self.votes["Yes"] += 1
            await self.update(show(self.votes))

        @ui.button("👎 No")
        async def no(self, ctx, button): ...

    await ctx.reply(show(votes), view=Poll())

Diddy draws the buttons in the card (``actions``); a click makes the user's client send a hidden
``!_v <view> <button>`` message that the bot turns into your callback. Cards that can hold buttons
are ``listing``, ``queue``, ``track`` and ``stats``. After ``timeout`` seconds without a click (or
``view.stop()``) the buttons are removed. Views live in memory: after a restart the old buttons do
nothing (the bot says so once).

Ready made: ``await ctx.confirm("Delete it?")`` and ``await ctx.paginate(pages)``.
"""
from __future__ import annotations

import asyncio
import inspect
import itertools
import logging
import secrets
import time
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Iterable, Optional, Union

from . import cards
from .protocol import CARD_KEY

if TYPE_CHECKING:  # pragma: no cover
    from .bot import Bot, Context, Message

log = logging.getLogger("diddybot.ui")

__all__ = ["View", "Button", "button", "Paginator", "confirm", "paginate", "BUTTON_KINDS"]

#: card kinds Diddy draws ``actions`` for
BUTTON_KINDS = ("list", "queue", "track", "stats")
VIEW_COMMAND = "_v"
_ORDER = itertools.count()
_YES = {"y", "yes", "ja", "j", "ok", "1", "true", "klar"}
_NO = {"n", "no", "nein", "0", "false", "abbrechen", "cancel"}


def press_command(view_id: str, index: int) -> str:
    """What a view button sends (``!`` works for every bot prefix; Diddy hides it)."""
    return f"!{VIEW_COMMAND} {view_id} {index}"


def button(label: str, *, disabled: bool = False) -> Callable[[Callable], Callable]:
    """Mark a method of a :class:`View` as a button: ``async def f(self, ctx, button)``."""
    def deco(func: Callable) -> Callable:
        func.__diddy_button__ = (next(_ORDER), label, disabled)  # type: ignore[attr-defined]
        return func
    return deco


class Button:
    """A button of a view. Change ``label`` or ``disabled`` and call ``view.update()``."""

    def __init__(self, label: str, callback: Callable[..., Awaitable[Any]], disabled: bool = False):
        if not label or not label.strip():
            raise ValueError("button label must not be empty")
        self.label, self.callback, self.disabled = label, callback, disabled
        self.view: Optional["View"] = None
        try:
            self._arity = len(inspect.signature(callback).parameters)
        except (TypeError, ValueError):
            self._arity = 2

    async def call(self, ctx: "Context") -> None:
        if self._arity <= 1:
            await self.callback(ctx)
        else:
            await self.callback(ctx, self)


class View:
    """A set of buttons with callbacks (see the module text)."""

    def __init__(self, *, timeout: Optional[float] = 180.0, owner: Optional[str] = None):
        self.id = secrets.token_hex(3)
        self.timeout = timeout
        #: only this Matrix id may press (``None``: everybody)
        self.owner = owner
        self.children: list[Button] = []
        self.bot: Optional["Bot"] = None
        self.message: Optional["Message"] = None
        self.timed_out = False
        self._done = asyncio.Event()
        self._deadline = 0.0
        self._watch: Optional[asyncio.Task] = None
        found = []
        for klass in type(self).__mro__:
            for func in vars(klass).values():
                mark = getattr(func, "__diddy_button__", None)
                if mark:
                    found.append((mark, func))
        seen = set()
        for (order, label, disabled), func in sorted(found, key=lambda f: f[0][0]):
            if order in seen:
                continue
            seen.add(order)
            self.add_button(label, func.__get__(self), disabled=disabled)

    # ------------------------------------------------------------------ buttons
    def add_button(self, label: str, callback: Callable[..., Awaitable[Any]], *,
                   disabled: bool = False) -> Button:
        """Add a button: ``callback(ctx, button)`` (or just ``callback(ctx)``)."""
        if not inspect.iscoroutinefunction(callback):
            raise TypeError("a button callback must be an async function")
        b = Button(label, callback, disabled)
        b.view = self
        self.children.append(b)
        return b

    def remove_button(self, btn: Button) -> None:
        self.children.remove(btn)

    def actions(self) -> list[dict]:
        """The ``actions`` Diddy draws (disabled buttons are left out)."""
        return [{"label": b.label, "send": press_command(self.id, i)}
                for i, b in enumerate(self.children) if not b.disabled]

    def inject(self, content: dict) -> dict:
        """``content`` with this view's buttons added to the card."""
        card = content.get(CARD_KEY)
        if not isinstance(card, dict) or card.get("kind") not in BUTTON_KINDS:
            raise ValueError("buttons need a card that has them: cards.listing, queue, track "
                             f"or stats (not {card.get('kind') if isinstance(card, dict) else 'text'})")
        merged = [*card.get("actions", []), *self.actions()]
        if len(merged) > 10:
            raise ValueError(f"at most 10 buttons per card, got {len(merged)}")
        out = dict(content)
        out[CARD_KEY] = {**card, "actions": merged}
        return out

    # ------------------------------------------------------------------ life
    async def interaction_check(self, ctx: "Context") -> bool:
        """Who may press. Default: the ``owner`` (everybody when there is none)."""
        return self.owner is None or ctx.sender == self.owner

    async def on_timeout(self) -> None:
        """No click for ``timeout`` seconds. Default: remove the buttons."""
        await self.remove_buttons()

    async def on_error(self, ctx: "Context", error: Exception, btn: Button) -> None:
        log.error("button %r of %s failed", btn.label, type(self).__name__, exc_info=error)

    def is_finished(self) -> bool:
        return self._done.is_set()

    def stop(self, *, keep_buttons: bool = False) -> None:
        """End the view; the buttons disappear unless ``keep_buttons``."""
        if self._done.is_set():
            return
        self._done.set()
        if self._watch is not None:
            self._watch.cancel()
        if self.bot is not None:
            self.bot._views.pop(self.id, None)
            if not keep_buttons and self.message is not None:
                self.bot._spawn(self.remove_buttons())

    async def wait(self) -> bool:
        """Wait until the view ended. ``True`` when it ran into the timeout."""
        await self._done.wait()
        return self.timed_out

    async def update(self, content: Optional[Any] = None) -> None:
        """Redraw the card with the current buttons (and new ``content`` if given)."""
        if self.message is None:
            raise RuntimeError("the view was not sent yet")
        await self.message.update(content if content is not None else self.message.base, view=self)

    async def remove_buttons(self) -> None:
        msg = self.message
        if msg is not None and msg.view is self:
            await msg.update(msg.base, view=False)

    def _attach(self, bot: "Bot", message: "Message") -> None:
        self.bot, self.message = bot, message
        if self._done.is_set():
            return
        bot._views[self.id] = self
        self._touch()
        if self.timeout is not None and self._watch is None:
            self._watch = bot._spawn(self._watcher())

    def _touch(self) -> None:
        if self.timeout is not None:
            self._deadline = time.monotonic() + self.timeout

    async def _watcher(self) -> None:
        while not self._done.is_set():
            left = self._deadline - time.monotonic()
            if left <= 0:
                self.timed_out = True
                self._done.set()
                if self.bot is not None:
                    self.bot._views.pop(self.id, None)
                try:
                    await self.on_timeout()
                except Exception:  # noqa: BLE001
                    log.exception("on_timeout failed")
                return
            await asyncio.sleep(left)

    async def _press(self, ctx: "Context", index: int) -> None:
        if self._done.is_set() or not 0 <= index < len(self.children):
            return
        if not await self.interaction_check(ctx):
            return
        btn = self.children[index]
        if btn.disabled:
            return
        self._touch()
        try:
            await btn.call(ctx)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            await self.on_error(ctx, e, btn)


# ------------------------------------------------------------------------------------ confirm
async def confirm(ctx: "Context", question: str, *, yes: str = "✅ Yes", no: str = "❌ No",
                  timeout: float = 30.0, user: Optional[str] = None,
                  finish: str = "edit") -> Optional[bool]:
    """Ask a yes/no question with two buttons (typing yes/no / ja/nein works too).

    Returns ``True``, ``False``, or ``None`` when nobody answered in ``timeout`` seconds. Only
    ``user`` (default: the sender) may answer. ``finish``: ``"edit"`` turns the question into a
    short note with the answer, ``"delete"`` removes it, ``"keep"`` leaves it.
    """
    user = user or ctx.sender
    view = View(timeout=timeout, owner=user)
    answer: dict[str, Optional[bool]] = {"v": None}

    async def pick(value: bool) -> None:
        answer["v"] = value
        view.stop(keep_buttons=True)

    async def on_yes(c: "Context") -> None:
        await pick(True)

    async def on_no(c: "Context") -> None:
        await pick(False)

    view.add_button(yes, on_yes)
    view.add_button(no, on_no)
    title = question if len(question) <= 100 else question[:99] + "…"
    card = cards.listing(title, [], empty="Answer with the buttons, or type yes / no",
                         body=f"{question}\n(answer yes / no)")
    msg = await ctx.reply(card, view=view)

    def typed(c: "Context") -> bool:
        return (c.sender == user and c.room_id == ctx.room_id
                and c.body.strip().lower() in (_YES | _NO))

    waiter = asyncio.ensure_future(ctx.bot.wait_for("message", check=typed, timeout=timeout))
    ended = asyncio.ensure_future(view.wait())
    try:
        await asyncio.wait({waiter, ended}, return_when=asyncio.FIRST_COMPLETED)
        if answer["v"] is None and waiter.done() and not waiter.cancelled() \
                and waiter.exception() is None:
            answer["v"] = waiter.result().body.strip().lower() in _YES
            view.stop(keep_buttons=True)
    finally:
        waiter.cancel()
        ended.cancel()
        view.stop(keep_buttons=True)
    result = answer["v"]
    if finish == "delete":
        await msg.delete()
    elif finish == "edit":
        text, tone, icon = {True: ("Yes", "success", "✅"), False: ("No", "info", "❌"),
                            None: ("No answer", "warning", "⌛")}[result]
        await msg.update(cards.note(f"{question} — {text}"[:300], tone=tone, icon=icon), view=False)
    else:
        await view.remove_buttons()
    return result


# ------------------------------------------------------------------------------------ pages
class Paginator(View):
    """Pages with ◀ ▶ buttons (and ⏮ ⏭ for long lists). ``pages``: cards or texts."""

    def __init__(self, pages: Iterable[Any], *, timeout: Optional[float] = 120.0,
                 owner: Optional[str] = None, start: int = 0):
        super().__init__(timeout=timeout, owner=owner)
        self.pages = list(pages)
        if not self.pages:
            raise ValueError("a paginator needs at least one page")
        self.index = min(max(start, 0), len(self.pages) - 1)
        self.first = self.add_button("⏮", self._first) if len(self.pages) > 3 else None
        self.prev = self.add_button("◀", self._prev)
        self.here = self.add_button("1/1", self._noop)
        self.next = self.add_button("▶", self._next)
        self.last = self.add_button("⏭", self._last) if len(self.pages) > 3 else None
        self._labels()

    def _labels(self) -> None:
        n = len(self.pages)
        self.here.label = f"{self.index + 1}/{n}"
        at_start, at_end = self.index == 0, self.index == n - 1
        self.prev.disabled = at_start
        self.next.disabled = at_end
        if self.first and self.last:
            self.first.disabled, self.last.disabled = at_start, at_end

    @property
    def page(self) -> Any:
        return self.pages[self.index]

    async def go(self, index: int) -> None:
        self.index = min(max(index, 0), len(self.pages) - 1)
        self._labels()
        await self.message.update(self.page, view=self)  # type: ignore[union-attr]

    async def _first(self, ctx: "Context") -> None:
        await self.go(0)

    async def _prev(self, ctx: "Context") -> None:
        await self.go(self.index - 1)

    async def _next(self, ctx: "Context") -> None:
        await self.go(self.index + 1)

    async def _last(self, ctx: "Context") -> None:
        await self.go(len(self.pages) - 1)

    async def _noop(self, ctx: "Context") -> None:
        return None


async def paginate(ctx: "Context", pages: Iterable[Any], *, timeout: Optional[float] = 120.0,
                   user: Optional[str] = None, start: int = 0) -> Paginator:
    """Send the pages with page buttons. Only ``user`` (default: the sender) may turn pages;
    pass ``user=""`` to let everybody."""
    owner = ctx.sender if user is None else (user or None)
    pager = Paginator(pages, timeout=timeout, owner=owner, start=start)
    await ctx.reply(pager.page, view=pager)
    return pager


Content = Union[str, cards.Card, dict]
