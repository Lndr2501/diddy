import asyncio
import datetime
import struct
import sys
import zlib

import pytest

from diddybot import Bot, Cog, File, Room, Store, command, group, tasks
from diddybot.objects import image_size
from diddybot.testing import FakeTransport, TestClient


def make_bot(**kw):
    return Bot(transport=FakeTransport("@bot:test"), **kw)


def png(w, h):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))
    raw = b"".join(b"\x00" + b"\x00\x00\x00" * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


# ------------------------------------------------------------------------------- files, objects
async def test_files_images_and_encryption():
    bot = make_bot()

    @bot.command("pic")
    async def pic(ctx):
        await ctx.reply(File(png(7, 3), "cover.png", caption="Cover"))

    @bot.command("doc")
    async def doc(ctx):
        await ctx.reply(File(b"hello", "notes.txt"))

    chat = TestClient(bot)
    [m] = await chat.say("!pic")
    c = m.content
    assert c["msgtype"] == "m.image" and c["body"] == "Cover" and c["filename"] == "cover.png"
    assert c["info"] == {"mimetype": "image/png", "size": len(png(7, 3)), "w": 7, "h": 3}
    assert c["url"].startswith("mxc://") and "file" not in c
    [d] = await chat.say("!doc")
    assert d.content["msgtype"] == "m.file" and d.content["body"] == "notes.txt"
    chat.t.room(chat.room_id)["encrypted"] = True
    [e] = await chat.say("!doc")
    assert "url" not in e.content and e.content["file"]["url"].startswith("mxc://")
    assert e.content["file"]["key"] and e.content["file"]["hashes"]
    assert chat.t.uploads[e.content["file"]["url"]] == b"hello"
    assert image_size(png(40, 20)) == (40, 20) and image_size(b"nope") is None
    assert File(b"x", "a.mp3").msgtype == "m.audio" and File(b"x", "a.mp4").msgtype == "m.video"


async def test_member_room_objects_mentions_and_typing():
    bot = make_bot()

    @bot.command("me")
    async def me(ctx):
        a, r = ctx.author, ctx.room
        await ctx.reply(f"{a.name}|{a.power}|{r.name}|{r.topic}|{len(r.members)}|{r.is_dm}")

    @bot.command("hi")
    async def hi(ctx):
        await ctx.reply(f"hi {ctx.author.mention}!\nbye", mentions=[ctx.author])

    @bot.command("slow")
    async def slow(ctx):
        async with ctx.typing():
            await ctx.reply("done")

    chat = TestClient(bot)
    chat.join("@alice:test", name="Alice", power=50)
    chat.t.room(chat.room_id).update(name="Lounge", topic="Chat here")
    assert (await chat.say("!me"))[0].body == "Alice|50|Lounge|Chat here|2|True"
    [h] = await chat.say("!hi")
    assert h.content["msgtype"] == "m.text"                       # a mention is no silent notice
    assert h.content["m.mentions"] == {"user_ids": ["@alice:test"]}
    assert h.content["formatted_body"] == ('hi <a href="https://matrix.to/#/@alice:test">@Alice'
                                           '</a>!<br>bye')
    await chat.say("!slow")
    assert chat.t.typing == [(chat.room_id, True), (chat.room_id, False)]


async def test_room_converter_and_bot_rooms():
    bot = make_bot()

    @bot.command("where")
    async def where(ctx, target: Room):
        await target.send(f"from {ctx.author.name}")
        await ctx.reply("sent")

    chat = TestClient(bot)
    chat.t.room("!a:test").update(name="Alpha team", alias="#alpha:test")
    chat.t.room("!b:test").update(name="Beta team")
    assert [r.name for r in bot.rooms] == ["!room:test", "Alpha team", "Beta team"]
    await chat.say("!where #alpha:test")
    await chat.say("!where beta")
    assert [(s.room_id, s.body) for s in chat.sent if s.body.startswith("from")] == [
        ("!a:test", "from alice"), ("!b:test", "from alice")]
    assert "I am in no room" in (await chat.say("!where zzz"))[0].card["text"]
    assert "fits 2 rooms" in (await chat.say("!where team"))[0].card["text"]


# ------------------------------------------------------------------------------------ loops
def test_seconds_until():
    t8 = [datetime.time(8, 0)]
    now = datetime.datetime(2026, 1, 1, 7, 0, 0)
    assert tasks.seconds_until(t8, now) == 3600
    assert tasks.seconds_until(t8, datetime.datetime(2026, 1, 1, 8, 0, 0)) == 86400
    assert tasks.seconds_until([datetime.time(8), datetime.time(20, 30)],
                               datetime.datetime(2026, 1, 1, 9, 0)) == 11.5 * 3600
    with pytest.raises(ValueError):
        tasks.loop()(_noop)
    with pytest.raises(ValueError):
        tasks.loop(seconds=1, time=datetime.time(1))(_noop)


async def _noop():
    return None


async def test_loops_count_stop_restart_and_hooks():
    bot = make_bot()
    runs, events = [], []

    @bot.loop(seconds=0.02, count=3)
    async def tick():
        runs.append(tick.current_loop)

    @tick.before_loop
    async def before():
        events.append("before")

    @tick.after_loop
    async def after():
        events.append("after")

    @bot.loop(seconds=0.01)
    async def failing():
        raise RuntimeError("x")

    errors = []

    @failing.error
    async def failing_error(e):
        errors.append(str(e))

    @bot.every(0.02)
    async def old_style(b):
        events.append(("every", b is bot))

    chat = TestClient(bot)
    await chat.start()
    await asyncio.sleep(0.25)
    assert runs == [0, 1, 2] and events[0] == "before" and "after" in events
    assert not tick.is_running() and failing.is_running() and len(errors) >= 3
    assert ("every", True) in events
    failing.stop()
    await asyncio.sleep(0.05)
    assert not failing.is_running()
    tick.start()
    await asyncio.sleep(0.15)
    assert runs[3:] == [0, 1, 2]
    tick.change_interval(minutes=1)
    assert tick.interval == 60
    await chat.stop()


async def test_loop_before_start_needs_a_running_bot():
    lp = tasks.loop(seconds=1)(_noop)

    async def body():
        t = lp.start()
        assert lp.start() is t                                    # a second start does nothing
        lp.cancel()
        await asyncio.sleep(0)
        assert not lp.is_running()
    await body()


# -------------------------------------------------------------------------------------- store
def test_store_scopes_and_persistence(tmp_path):
    path = str(tmp_path / "sub" / "bot.sqlite")
    s = Store(path)
    s.set("a", {"x": [1, 2]})
    assert s.get("a") == {"x": [1, 2]} and s.get("missing", 7) == 7 and "a" in s
    assert s.incr("n") == 1 and s.incr("n", 4) == 5
    room = s.room("!r:test")
    room.set("a", "room value")
    room.set("b", 1)
    assert s.get("a") == {"x": [1, 2]} and room.get("a") == "room value"
    assert room.keys() == ["a", "b"] and s.keys("a") == ["a"] and s.keys("%") == []
    assert dict(room.items("b")) == {"b": 1}
    assert room.delete("b") and not room.delete("b") and "b" not in room
    s.close()
    again = Store(path)
    assert again.get("n") == 5 and again.room("!r:test").get("a") == "room value"


async def test_bot_store_is_in_memory_in_tests():
    bot = make_bot()

    @bot.command("count")
    async def count(ctx):
        await ctx.reply(str(bot.store.room(ctx.room_id).incr("uses")))

    chat = TestClient(bot)
    assert [(await chat.say("!count"))[0].body for _ in range(3)] == ["1", "2", "3"]


# ---------------------------------------------------------------------------------------- cogs
class Music(Cog):
    def __init__(self, bot):
        self.bot = bot
        self.loaded = self.unloaded = False
        self.joined = []
        self.ticks = 0

    def cog_load(self):
        self.loaded = True

    def cog_unload(self):
        self.unloaded = True

    def cog_check(self, ctx):
        return ctx.sender != "@mallory:test"

    @command("play", desc="plays a song", aliases=("p",))
    async def play(self, ctx, *, song: str):
        await ctx.reply(f"{self.bot.user_id} plays {song}")

    @group("queue", desc="the queue")
    async def queue(self, ctx): ...

    @queue.command("clear")
    async def queue_clear(self, ctx):
        await ctx.reply("cleared")

    @Cog.listener("member_join")
    async def welcome(self, room_id, user_id):
        self.joined.append(user_id)

    @tasks.loop(seconds=0.02)
    async def tidy(self):
        self.ticks += 1


async def test_cog_commands_listeners_loops_and_removal():
    bot = make_bot()
    cog = bot.add_cog(Music(bot))
    assert cog.loaded and bot.get_cog("Music") is cog and list(bot.cogs) == ["Music"]
    chat = TestClient(bot)
    chat.join("@mallory:test")
    assert (await chat.say("!play Hey Jude"))[0].body == "@bot:test plays Hey Jude"
    assert (await chat.say("!p x"))[0].body == "@bot:test plays x"
    assert (await chat.say("!queue clear"))[0].body == "cleared"
    assert (await chat.say("!play x", user="@mallory:test"))[0].card["tone"] == "error"
    usages = [i["usage"] for g in (await chat.say("!help"))[0].card["groups"] for i in g["items"]]
    assert "!play <song> · !p" in usages and "!queue clear" in usages
    await chat.arrive("@carol:test")
    assert cog.joined == ["@carol:test"]
    await chat.start()
    await asyncio.sleep(0.1)
    assert cog.ticks >= 3
    assert bot.remove_cog("Music") is cog and cog.unloaded
    ticks = cog.ticks
    await asyncio.sleep(0.06)
    assert cog.ticks == ticks
    assert await chat.say("!play x") == [] and await chat.arrive("@dave:test") is None
    assert cog.joined == ["@carol:test"]
    bot.add_cog(Music(bot))
    with pytest.raises(ValueError):
        bot.add_cog(Music(bot))
    await chat.stop()


async def test_cog_error_handler_and_name_clash_rolls_back():
    bot = make_bot()

    class Risky(Cog):
        @command("risky")
        async def risky(self, ctx):
            raise RuntimeError("oops")

        async def cog_command_error(self, ctx, error):
            await ctx.reply(f"cog saw {type(error).__name__}")

    bot.add_cog(Risky())
    chat = TestClient(bot, strict=False)
    assert (await chat.say("!risky"))[0].body == "cog saw CommandInvokeError"

    class Clash(Cog):
        @command("fresh")
        async def fresh(self, ctx): ...

        @command("risky")
        async def risky2(self, ctx): ...

    with pytest.raises(ValueError):
        bot.add_cog(Clash())
    assert "fresh" not in bot.registry.commands


async def test_extensions(tmp_path, monkeypatch):
    (tmp_path / "ext_demo.py").write_text(
        "from diddybot import Cog, command\n"
        "class Demo(Cog):\n"
        "    @command('demo')\n"
        "    async def demo(self, ctx):\n"
        "        await ctx.reply('from the extension')\n"
        "def setup(bot):\n"
        "    bot.add_cog(Demo())\n"
        "def teardown(bot):\n"
        "    bot.torn_down = True\n")
    (tmp_path / "ext_empty.py").write_text("x = 1\n")
    monkeypatch.syspath_prepend(str(tmp_path))
    bot = make_bot()
    bot.load_extension("ext_demo")
    chat = TestClient(bot)
    assert (await chat.say("!demo"))[0].body == "from the extension"
    with pytest.raises(ValueError):
        bot.load_extension("ext_demo")
    with pytest.raises(ValueError):
        bot.load_extension("ext_empty")
    bot.unload_extension("ext_demo")
    assert bot.torn_down and await chat.say("!demo") == [] and "Demo" not in bot.cogs
    sys.modules.pop("ext_demo", None)


async def test_auto_join_filter_declines_unwanted_invites():
    """auto_join may be a function (inviter, room_id): others are declined, not joined."""
    from types import SimpleNamespace

    from diddybot.matrix import NioTransport

    joined, left = [], []

    class Client:
        invited_rooms = {"!a:x": SimpleNamespace(inviter="@friend:good"),
                         "!b:x": SimpleNamespace(inviter="@spam:evil")}

        async def room_leave(self, room_id):
            left.append(room_id)

    class B:
        auto_join = staticmethod(lambda inviter, room: inviter.endswith(":good"))

        def _spawn(self, coro):
            return asyncio.ensure_future(coro)

    t = NioTransport.__new__(NioTransport)
    t.bot, t.client, t._joining = B(), Client(), set()

    async def fake_join(room_id):
        joined.append(room_id)
        t._joining.discard(room_id)
    t._join = fake_join
    await t._accept_invites()
    await asyncio.sleep(0.05)
    assert joined == ["!a:x"] and left == ["!b:x"]


async def test_raw_nio_callbacks_reach_every_new_client():
    import nio

    from diddybot.matrix import NioTransport

    seen = []
    bot = Bot(transport=FakeTransport("@b:t"))
    bot.add_event_callback(lambda room, ev: seen.append(ev), nio.Event)   # before login: stored
    bot.add_to_device_callback(lambda ev: seen.append(ev), nio.ToDeviceEvent)
    t = NioTransport(bot, homeserver="http://x", user_id="@b:t", store_path="/tmp/diddybot-cb-test",
                     encryption=False)
    client = t._new_client("@b:t", None)
    assert any(c.func is bot._raw_event_callbacks[0][0] for c in client.event_callbacks)
    assert any(c.func is bot._raw_to_device_callbacks[0][0] for c in client.to_device_callbacks)
    await client.close()


async def test_start_without_login_after_earlier_login():
    bot = Bot(transport=FakeTransport("@b:t"))
    calls = []
    orig = bot._t.login

    async def login():
        calls.append("login")
        await orig()
    bot._t.login = login
    await bot.login()
    runner = asyncio.ensure_future(bot.start(login=False))
    await asyncio.sleep(0.05)
    bot.stop()
    await asyncio.wait_for(runner, 5)
    assert calls == ["login"]
