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


async def test_new_features_end_to_end(tmp_path):
    """Files in an encrypted room, view buttons, edit/delete/leave events, typing."""
    import struct
    import zlib

    from diddybot import File, View, ui

    def png(w, h):
        def chunk(kind, data):
            body = kind + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))
        raw = b"".join(b"\x00" + b"\x10\x20\x30" * w for _ in range(h))
        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

    image = png(9, 4)
    tag = secrets.token_hex(3)
    bot_id = register(f"bot{tag}", "botpass")
    alice_id = register(f"alice{tag}", "alicepass")
    carol_id = register(f"carol{tag}", "carolpass")
    bot = Bot(HS, bot_id, password="botpass", store_path=str(tmp_path / "botstore"),
              edit_interval=0.1, announce=False)
    seen = []

    class Counter(View):
        def __init__(self):
            super().__init__(timeout=60)
            self.n = 0

        @ui.button("+1")
        async def plus(self, ctx, button):
            self.n += 1
            await self.update(cards.listing(f"Count {self.n}", []))

    @bot.command("pic")
    async def pic(ctx):
        async with ctx.typing():
            await ctx.reply(File(image, "cover.png", caption="Cover"))

    @bot.command("menu")
    async def menu(ctx):
        await ctx.reply(cards.listing("Count 0", []), view=Counter())

    @bot.command("ask")
    async def ask(ctx):
        answer = await ctx.ask("Name?", timeout=15)
        await ctx.reply(f"hello {answer}")

    @bot.listen("message_edit")
    async def edited(ctx):
        seen.append(("edit", ctx.body))

    @bot.listen("message_delete")
    async def deleted(ctx):
        seen.append(("delete", ctx.target))

    @bot.listen("member_leave")
    async def left(room_id, user_id):
        seen.append(("leave", user_id))

    runner = asyncio.ensure_future(bot.start())
    alice = User(alice_id, "alicepass", str(tmp_path / "alice"))
    carol = nio.AsyncClient(HS, carol_id)
    try:
        await alice.login()
        room = await alice.c.room_create(
            invite=[bot_id, carol_id], name="New features",
            initial_state=[{"type": "m.room.encryption", "state_key": "",
                            "content": {"algorithm": "m.megolm.v1.aes-sha2"}}])
        rid = room.room_id
        await alice.wait_for(lambda r, e: r == rid and isinstance(e, nio.RoomMemberEvent)
                             and e.state_key == bot_id and e.membership == "join")
        assert isinstance(await carol.login("carolpass"), nio.LoginResponse)
        assert isinstance(await carol.join(rid), nio.JoinResponse)
        await asyncio.sleep(1)
        await alice.sync()

        # a file in an encrypted room is encrypted and can be read with the key in the event
        await alice.say(rid, "!pic")
        pic_ev = await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id
                                      and content(e).get("msgtype") == "m.image")
        c = content(pic_ev)
        assert c["body"] == "Cover" and c["filename"] == "cover.png" and "url" not in c
        assert c["info"]["w"] == 9 and c["info"]["h"] == 4
        file = c["file"]
        dl = await alice.c.download(mxc=file["url"])
        assert isinstance(dl, nio.DownloadResponse), dl
        from nio.crypto import decrypt_attachment
        assert decrypt_attachment(dl.body, file["key"]["k"], file["hashes"]["sha256"],
                                  file["iv"]) == image

        # view buttons: the press is a hidden command message, the answer edits the card
        await alice.say(rid, "!menu")
        card = await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id and
                                    content(e).get("dev.diddy.card", {}).get("title") == "Count 0")
        send = content(card)["dev.diddy.card"]["actions"][0]["send"]
        assert send.startswith("!_v ")
        await alice.say(rid, send, **{"dev.diddy.card_action": True})
        edit = await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id and
                                    content(e).get("m.relates_to", {}).get("event_id")
                                    == card.event_id)
        assert content(edit)["m.new_content"]["dev.diddy.card"]["title"] == "Count 1"

        # wait_for / ask: the next message of the same person is the answer
        await alice.say(rid, "!ask")
        await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id
                             and content(e).get("body") == "Name?")
        await alice.say(rid, "Alice")
        await alice.wait_for(lambda r, e: r == rid and e.sender == bot_id
                             and content(e).get("body") == "hello Alice")

        # edits, deletions and people leaving reach the bot
        eid = await alice.say(rid, "first")
        await alice.c.room_send(rid, "m.room.message", {
            "msgtype": "m.text", "body": "* second",
            "m.new_content": {"msgtype": "m.text", "body": "second"},
            "m.relates_to": {"rel_type": "m.replace", "event_id": eid}},
            ignore_unverified_devices=True)
        await alice.c.room_redact(rid, eid)
        await carol.room_leave(rid)
        for _ in range(60):
            if len(seen) >= 3:
                break
            await asyncio.sleep(0.25)
        assert ("edit", "second") in seen and ("delete", eid) in seen
        assert ("leave", carol_id) in seen
    finally:
        bot.stop()
        await asyncio.wait_for(runner, 40)
        await alice.c.close()
        await carol.close()
