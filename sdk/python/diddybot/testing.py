"""Test your bot without a homeserver.

::

    from diddybot.testing import TestClient

    async def test_ping():
        chat = TestClient(bot)
        [answer] = await chat.say("!ping")
        assert answer.card["kind"] == "note"

    async def test_pause_button():
        chat = TestClient(bot)
        [card] = await chat.say("!play song")
        await chat.press(card, "⏸ Pause")
        assert card.card["state"] == "paused"     # the card was edited

The client runs in **strict** mode: a card that Diddy would cut or drop raises an error, so a green
test means Diddy draws exactly what you sent. ``answer.card`` is the card *as Diddy reads it*
(``diddybot.protocol.parse_card``), after all edits.
"""
from __future__ import annotations

import asyncio
import itertools
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from .bot import Bot
from .protocol import CARD_ACTION_KEY, format_time, parse_card, parse_commands, parse_profile

__all__ = ["TestClient", "Sent"]

_EVENT_IDS = itertools.count(1)  # unique across all test clients


@dataclass
class Sent:
    """A message the bot sent, with every later edit applied."""

    room_id: str
    event_id: str
    content: dict
    type: str = "m.room.message"
    edits: list[dict] = field(default_factory=list)
    reply_to: Optional[str] = None

    @property
    def body(self) -> str:
        return self.content.get("body", "")

    @property
    def card(self) -> Optional[dict]:
        """The card as Diddy draws it (``None``: Diddy shows only ``body``)."""
        return parse_card(self.content)

    def buttons(self) -> dict[str, str]:
        """Label → command of every button on the card (actions, player controls, ⋯ menu)."""
        card = self.card or {}
        out = {a["label"]: a["send"] for a in card.get("actions", [])}
        out.update({a["label"]: a["send"] for a in card.get("more", [])})
        out.update(card.get("controls", {}))
        return out

    def __repr__(self) -> str:
        kind = (self.card or {}).get("kind", "text")
        return f"<Sent {kind} {self.body[:40]!r}>"


class FakeTransport:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.auto_join = True
        self.rooms: dict[str, dict[str, Any]] = {}
        self.sent: list[Sent] = []
        self.by_id: dict[str, Sent] = {}
        self.reactions: list[tuple[str, str, str]] = []  # room, event, key
        self.state: dict[tuple[str, str, str], dict] = {}
        self.uploads: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.typing: list[tuple[str, bool]] = []
        self.forbid_state = False
        self._ids = itertools.count(1)
        self._stop = asyncio.Event()

    def room(self, room_id: str) -> dict[str, Any]:
        return self.rooms.setdefault(room_id, {"name": room_id, "members": {self.user_id: "Bot"},
                                               "power": {}, "topic": "", "alias": "",
                                               "encrypted": False, "avatars": {}})

    # transport interface -------------------------------------------------
    async def login(self) -> None:
        pass

    async def run(self, on_ready: Any) -> None:
        await on_ready()
        await self._stop.wait()

    def stop(self) -> None:
        self._stop.set()

    def joined_rooms(self) -> list[str]:
        return list(self.rooms)

    def display_name(self, room_id: str, user_id: str) -> str:
        return self.room(room_id)["members"].get(user_id, "")

    def room_name(self, room_id: str) -> str:
        return self.room(room_id)["name"]

    def member_count(self, room_id: str) -> int:
        return len(self.room(room_id)["members"])

    def power_level(self, room_id: str, user_id: str) -> int:
        return self.room(room_id)["power"].get(user_id, 0)

    def member_list(self, room_id: str) -> list[tuple[str, str, str]]:
        r = self.room(room_id)
        return [(u, n, r["avatars"].get(u, "")) for u, n in r["members"].items()]

    def avatar_url(self, room_id: str, user_id: str) -> str:
        return self.room(room_id)["avatars"].get(user_id, "")

    def room_topic(self, room_id: str) -> str:
        return self.room(room_id)["topic"]

    def room_alias(self, room_id: str) -> str:
        return self.room(room_id)["alias"]

    def is_encrypted(self, room_id: str) -> bool:
        return self.room(room_id)["encrypted"]

    async def set_typing(self, room_id: str, on: bool) -> None:
        self.typing.append((room_id, on))

    async def upload_file(self, data: bytes, mimetype: str, filename: str,
                          encrypt: bool) -> tuple[str, Optional[dict]]:
        uri = f"mxc://test/{next(self._ids)}"
        self.uploads[uri] = data
        keys = {"v": "v2", "key": {"k": "fake"}, "iv": "fake", "hashes": {"sha256": "fake"}}
        return uri, (keys if encrypt else None)

    async def send(self, room_id: str, etype: str, content: dict) -> str:
        self.room(room_id)
        event_id = f"$bot{next(self._ids)}"
        if etype == "m.reaction":
            rel = content["m.relates_to"]
            self.reactions.append((room_id, rel["event_id"], rel["key"]))
            return event_id
        rel = content.get("m.relates_to") or {}
        if rel.get("rel_type") == "m.replace":
            target = self.by_id[rel["event_id"]]
            target.edits.append(content)
            target.content = content["m.new_content"]
            return event_id
        s = Sent(room_id, event_id, content, etype,
                 reply_to=(rel.get("m.in_reply_to") or {}).get("event_id"))
        self.sent.append(s)
        self.by_id[event_id] = s
        return event_id

    async def redact(self, room_id: str, event_id: str, reason: str = "") -> None:
        self.deleted.append(event_id)

    async def get_state(self, room_id: str, etype: str, state_key: str) -> Optional[dict]:
        return self.state.get((room_id, etype, state_key))

    async def put_state(self, room_id: str, etype: str, state_key: str, content: dict) -> bool:
        if self.forbid_state:
            return False
        self.state[(room_id, etype, state_key)] = content
        return True

    async def upload(self, data: bytes, mimetype: str, filename: str) -> str:
        uri = f"mxc://test/{next(self._ids)}"
        self.uploads[uri] = data
        return uri

    async def set_profile(self, display_name: str, avatar: str) -> None:
        pass

    async def dm_room(self, user_id: str, name: str) -> str:
        for room_id, r in self.rooms.items():
            if set(r["members"]) == {self.user_id, user_id}:
                return room_id
        room_id = f"!dm-{user_id.lstrip('@')}"
        r = self.room(room_id)
        r["members"][user_id] = user_id
        return room_id


class TestClient:
    """A fake chat around your bot. Replaces the bot's Matrix connection."""

    __test__ = False  # not a pytest test class

    def __init__(self, bot: Bot, *, user: str = "@alice:test", room: str = "!room:test",
                 bot_id: str = "@bot:test", strict: bool = True):
        self.bot = bot
        self.t = FakeTransport(bot_id)
        bot._t = self.t
        bot.strict = strict
        bot.edit_interval = 0
        bot.ignore_older_than = None
        self.user = user
        self.room_id = room
        self.last_event_id = ""
        self.join(user, room)
        # a fresh chat: forget cards, seen events and warnings of earlier tests on the same bot
        bot._live.clear()
        bot._seen.clear()
        bot._warned.clear()
        bot._views.clear()
        bot._reactions.clear()
        bot._running = False
        if bot._store is None:
            from .store import Store
            bot._store = Store(":memory:")
        self._ids = _EVENT_IDS

    # setup ---------------------------------------------------------------
    def join(self, user: str, room: Optional[str] = None, *, name: str = "", power: int = 0) -> None:
        """Put ``user`` in a room (with a display name and power level)."""
        r = self.t.room(room or self.room_id)
        r["members"][user] = name or user.lstrip("@").split(":")[0]
        if power:
            r["power"][user] = power

    def set_power(self, user: str, level: int, room: Optional[str] = None) -> None:
        self.t.room(room or self.room_id)["power"][user] = level

    async def start(self) -> None:
        """Run the start-up (announcing in rooms, ``ready`` listeners, loops) without blocking."""
        await self.bot._ready()

    async def stop(self) -> None:
        self.bot._running = False
        for lp in self.bot._loops:
            lp.cancel()
        for task in list(self.bot._tasks):
            task.cancel()
        await asyncio.gather(*self.bot._tasks, return_exceptions=True)

    # chatting ------------------------------------------------------------
    @property
    def sent(self) -> list[Sent]:
        """Everything the bot sent so far, oldest first."""
        return self.t.sent

    async def say(self, text: str, *, user: Optional[str] = None, room: Optional[str] = None,
                  extra: Optional[dict] = None, wait: float = 0) -> list[Sent]:
        """Send ``text`` as a user; returns the new messages the bot sent in answer.

        ``wait`` keeps waiting that many seconds for background work (``bot._spawn``).
        """
        content = {"msgtype": "m.text", "body": text, **(extra or {})}
        return await self.send_content(content, user=user, room=room, wait=wait)

    async def send_content(self, content: dict, *, user: Optional[str] = None,
                           room: Optional[str] = None, wait: float = 0) -> list[Sent]:
        before = len(self.t.sent)
        user = user or self.user
        room = room or self.room_id
        if user not in self.t.room(room)["members"]:
            self.join(user, room)
        event_id = f"$user{next(self._ids)}"
        self.last_event_id = event_id
        await self.bot.handle_message(room, user, event_id, content, int(time.time() * 1000))
        if wait:
            await asyncio.sleep(wait)
        return self.t.sent[before:]

    async def press(self, message: Sent, button: str, *, user: Optional[str] = None,
                    arg: Optional[str] = None) -> list[Sent]:
        """Click a card button by label (or a player control: "toggle", "skip", "volume"...).

        Sends what Diddy sends: the command with ``dev.diddy.card_action``. ``arg`` is appended
        (the volume slider sends ``<volume> N``).
        """
        buttons = message.buttons()
        if button not in buttons:
            raise KeyError(f"no button {button!r} on this card; there are {sorted(buttons)}")
        send = buttons[button] + (f" {arg}" if arg is not None else "")
        return await self.say(send, user=user, room=message.room_id,
                              extra={CARD_ACTION_KEY: True})

    async def seek(self, message: Sent, seconds: float, *, user: Optional[str] = None) -> list[Sent]:
        """Click the timeline of a track card at ``seconds`` (Diddy sends ``<seek> m:ss``)."""
        card = message.card or {}
        if "seek" not in card:
            raise KeyError("this card has no clickable timeline (seek)")
        return await self.say(f"{card['seek']} {format_time(seconds)}", user=user,
                              room=message.room_id, extra={CARD_ACTION_KEY: True})

    async def react(self, message: Sent, key: str, *, user: Optional[str] = None) -> str:
        """React to a bot message with an emoji. Returns the id of the reaction (for ``delete``)."""
        event_id = f"$user{next(self._ids)}"
        await self.bot.handle_reaction(message.room_id, user or self.user, event_id,
                                       message.event_id, key, int(time.time() * 1000))
        return event_id

    async def edit(self, event_id: str, text: str, *, user: Optional[str] = None,
                   room: Optional[str] = None) -> None:
        """A user edits one of their messages (``chat.last_event_id`` is the latest one)."""
        content = {"msgtype": "m.text", "body": f"* {text}",
                   "m.new_content": {"msgtype": "m.text", "body": text},
                   "m.relates_to": {"rel_type": "m.replace", "event_id": event_id}}
        await self.bot.handle_message(room or self.room_id, user or self.user,
                                      f"$user{next(self._ids)}", content, int(time.time() * 1000))

    async def delete(self, event_id: str, *, user: Optional[str] = None,
                     room: Optional[str] = None) -> None:
        """A user deletes a message or a reaction."""
        await self.bot.handle_redaction(room or self.room_id, user or self.user,
                                        f"$user{next(self._ids)}", event_id,
                                        int(time.time() * 1000))

    async def leave(self, user: str, room: Optional[str] = None) -> None:
        """A user leaves the room."""
        self.t.room(room or self.room_id)["members"].pop(user, None)
        await self.bot.handle_member_leave(room or self.room_id, user)

    async def arrive(self, user: str, room: Optional[str] = None, *, name: str = "") -> None:
        """A user joins the room."""
        self.join(user, room, name=name)
        await self.bot.handle_member_join(room or self.room_id, user)

    # what Diddy sees -----------------------------------------------------
    def commands(self, room: Optional[str] = None) -> Optional[dict]:
        """The command suggestions Diddy shows in a room (after :meth:`start`)."""
        c = self.t.state.get((room or self.room_id, "dev.diddy.commands", self.t.user_id))
        return parse_commands(c)

    def profile(self, room: Optional[str] = None) -> Optional[dict]:
        """The bot profile Diddy shows in a room (after :meth:`start`)."""
        return parse_profile(self.t.state.get((room or self.room_id, "dev.diddy.bot",
                                               self.t.user_id)))

    def reactions(self) -> list[tuple[str, str, str]]:
        return self.t.reactions
