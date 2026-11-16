"""End to end against a real homeserver, in an encrypted room.

Runs only with ``DIDDY_TEST_HOMESERVER`` (a server with open registration, e.g. a local Synapse
with ``enable_registration_without_verification: true``)::

    DIDDY_TEST_HOMESERVER=http://127.0.0.1:8008 pytest tests/test_integration.py
"""
import asyncio
import json
import os
import secrets
import urllib.request

import pytest

HS = os.environ.get("DIDDY_TEST_HOMESERVER", "")
pytestmark = [pytest.mark.integration,
              pytest.mark.skipif(not HS, reason="set DIDDY_TEST_HOMESERVER")]

if HS:
    import nio

    from diddybot import Bot, cards


def register(name: str, password: str) -> str:
    body = json.dumps({"username": name, "password": password,
                       "auth": {"type": "m.login.dummy"}}).encode()
    req = urllib.request.Request(f"{HS}/_matrix/client/v3/register", body,
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)["user_id"]


class User:
    """A person with a normal E2EE client (what Diddy does, minus the drawing)."""

    def __init__(self, name, password, store):
        os.makedirs(store, exist_ok=True)
        self.c = nio.AsyncClient(HS, name, store_path=store,
                                 config=nio.AsyncClientConfig(encryption_enabled=True))
        self.password = password
        self.events = []
        self.c.add_event_callback(self._on, nio.Event)

    async def _on(self, room, event):
        self.events.append((room.room_id, event))

    async def login(self):
        r = await self.c.login(self.password)
        assert isinstance(r, nio.LoginResponse), r
        await self.sync()

    async def sync(self, timeout=0):
        await self.c.sync(timeout=timeout, full_state=True)
        if self.c.should_upload_keys:
            await self.c.keys_upload()
        if self.c.should_query_keys:
            await self.c.keys_query()
        if self.c.should_claim_keys:
            await self.c.keys_claim(self.c.get_users_for_key_claiming())
        await self.c.send_to_device_messages()

    async def wait_for(self, pred, seconds=20):
        for _ in range(int(seconds * 4)):
            for room_id, ev in self.events:
                if pred(room_id, ev):
                    return ev
            await self.sync(250)
        raise AssertionError("timed out; last events: " + "; ".join(
            f"{type(e).__name__} {getattr(e, 'sender', '')}" for _, e in self.events[-6:]))

    async def say(self, room_id, body, **extra):
        r = await self.c.room_send(room_id, "m.room.message",
                                   {"msgtype": "m.text", "body": body, **extra},
                                   ignore_unverified_devices=True)
        assert isinstance(r, nio.RoomSendResponse), r
        return r.event_id


def content(ev):
    return (getattr(ev, "source", None) or {}).get("content") or {}


async def test_bot_end_to_end_encrypted(tmp_path):
    tag = secrets.token_hex(3)
    bot_id = register(f"bot{tag}", "botpass")
    alice_id = register(f"alice{tag}", "alicepass")

    bot = Bot(HS, bot_id, password="botpass", store_path=str(tmp_path / "botstore"),
              display_name="Testbot", about="I test things", banner=("#ff6fa5", "#2bd9a8"),
              edit_interval=0.2)

    @bot.command("ping", desc="pong")
    async def ping(ctx):
        await ctx.reply(cards.note("Pong", tone="success", icon="🏓"))

    @bot.command("count", desc="counter")
    async def count(ctx, n: int = 0):
        await ctx.show(cards.listing(f"Count {n}", [], buttons=[("+", f"!count {n + 1}")]))

    @bot.command("whisper")
    async def whisper(ctx):
        await ctx.dm("psst")

    runner = asyncio.ensure_future(bot.start())
    alice = User(alice_id, "alicepass", str(tmp_path / "alice"))
    try:
        await alice.login()
        room = await alice.c.room_create(
            invite=[bot_id], name="Bot test",
            initial_state=[{"type": "m.room.encryption", "state_key": "",
                            "content": {"algorithm": "m.megolm.v1.aes-sha2"}}],
            power_level_override={"users": {alice_id: 100, bot_id: 50}})
        assert isinstance(room, nio.RoomCreateResponse), room
        rid = room.room_id

        # the bot joins by itself and announces itself and its commands to Diddy
        await alice.wait_for(lambda r, e: r == rid and isinstance(e, nio.RoomMemberEvent)
                             and e.state_key == bot_id and e.membership == "join")
        for _ in range(40):
            st = await alice.c.room_get_state_event(rid, "dev.diddy.commands", bot_id)
            if isinstance(st, nio.RoomGetStateEventResponse):
                break
            await asyncio.sleep(0.25)
        names = [c["name"] for c in st.content["commands"]]
        assert names == ["help", "ping", "count", "whisper"]
        prof = await alice.c.room_get_state_event(rid, "dev.diddy.bot", bot_id)
        assert prof.content["about"] == "I test things"

        await asyncio.sleep(1)  # bot device keys are uploaded after its first sync
        await alice.sync()
        await alice.say(rid, "!ping")
        pong = await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id
                                    and "dev.diddy.card" in content(e))
        assert content(pong)["dev.diddy.card"]["text"] == "Pong"
        assert content(pong)["msgtype"] == "m.notice"

        # a card button edits the card instead of sending a new one
        await alice.say(rid, "!count")
        card = await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id and
                                    content(e).get("dev.diddy.card", {}).get("title") == "Count 0")
        await alice.say(rid, "!count 1", **{"dev.diddy.card_action": True})
        edit = await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id and
                                    content(e).get("m.relates_to", {}).get("event_id") == card.event_id)
        new = content(edit)["m.new_content"]
        assert new["dev.diddy.card"]["title"] == "Count 1"
        assert content(edit)["m.relates_to"]["rel_type"] == "m.replace"

        # direct messages open a private room
        await alice.say(rid, "!whisper")
        invite = None
        for _ in range(60):
            await alice.sync(250)
            if alice.c.invited_rooms:
                invite = next(iter(alice.c.invited_rooms))
                break
        assert invite, "no DM invite"
        await alice.c.join(invite)
        psst = await alice.wait_for(lambda r, e: r == invite and e.sender == bot_id
                                    and content(e).get("body") == "psst")
        assert psst

        device = bot._t.client.device_id
    finally:
        bot.stop()
        await asyncio.wait_for(runner, 40)

    # restart: the saved token is reused, no new device or login
    bot2 = Bot(HS, bot_id, password="wrong-password-not-needed",
               store_path=str(tmp_path / "botstore"))

    @bot2.command("ping")
    async def ping2(ctx):
        await ctx.reply("pong again")

    runner = asyncio.ensure_future(bot2.start())
    try:
        for _ in range(40):
            if bot2._t.client and bot2._t._synced:
                break
            await asyncio.sleep(0.25)
        assert bot2._t.client.device_id == device
        await alice.sync()
        await alice.say(rid, "!ping")
        again = await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id
                                     and content(e).get("body") == "pong again")
        assert again
    finally:
        bot2.stop()
        await asyncio.wait_for(runner, 40)
        await alice.c.close()
