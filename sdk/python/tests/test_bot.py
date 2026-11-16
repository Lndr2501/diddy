import asyncio

import pytest

from diddybot import Bot, UsageError, cards
from diddybot.testing import FakeTransport, TestClient


def make_bot(**kw):
    bot = Bot(transport=FakeTransport("@bot:test"), about="Test bot", banner=("#f0a", "#0af"),
              accent="#123456", **kw)
    return bot


async def test_command_reply_and_help():
    bot = make_bot()

    @bot.command("ping", desc="pong")
    async def ping(ctx):
        await ctx.reply(cards.note("Pong", tone="success"))

    chat = TestClient(bot)
    [m] = await chat.say("!ping")
    assert m.card == {"kind": "note", "text": "Pong", "tone": "success"}
    assert m.content["msgtype"] == "m.notice"
    [h] = await chat.say("!help")
    usages = [i["usage"] for g in h.card["groups"] for i in g["items"]]
    assert "!ping" in usages and "!help · !hilfe" in usages


async def test_notices_own_messages_and_edits_are_ignored():
    bot = make_bot()
    seen = []

    @bot.on_message
    async def any_msg(ctx):
        seen.append(ctx.body)

    chat = TestClient(bot)
    await chat.send_content({"msgtype": "m.notice", "body": "!help"})
    await chat.say("!help", user="@bot:test")
    await chat.say("* !help", extra={"m.relates_to": {"rel_type": "m.replace", "event_id": "$1"}})
    assert chat.sent == []
    await chat.say("hello")
    assert seen == ["hello"]


async def test_usage_errors_and_crashes_answer_nicely():
    bot = make_bot()

    @bot.command("timer")
    async def timer(ctx, seconds: int):
        if seconds > 60:
            raise UsageError("at most 60 seconds")
        raise RuntimeError("boom")

    chat = TestClient(bot)
    [u] = await chat.say("!timer soon")
    assert u.card["tone"] == "warning" and "Usage: !timer <seconds>" in u.card["text"]
    [u] = await chat.say("!timer 99")
    assert u.card["text"] == "at most 60 seconds. Usage: !timer <seconds>"
    [e] = await chat.say("!timer 5")
    assert e.card["tone"] == "error"


async def test_power_and_dm_only():
    bot = make_bot()

    @bot.command("ban", power=50)
    async def ban(ctx):
        await ctx.reply("done")

    @bot.command("secret", dm_only=True)
    async def secret(ctx):
        await ctx.reply("psst")

    chat = TestClient(bot)
    chat.join("@carol:test")
    [m] = await chat.say("!ban")
    assert m.card["tone"] == "error" and "power level 50" in m.card["text"]
    chat.set_power("@alice:test", 50)
    [m] = await chat.say("!ban")
    assert m.body == "done"
    [m] = await chat.say("!secret")
    assert m.card["icon"] == "✉️"


async def test_show_edits_the_card_on_button_press():
    bot = make_bot()

    @bot.command("count")
    async def count(ctx, n: int = 0):
        assert ctx.from_button == (n != 0)
        await ctx.show(cards.listing(f"Count {n}", [], buttons=[("+", f"!count {n + 1}")]))

    chat = TestClient(bot)
    [card] = await chat.say("!count")
    assert await chat.press(card, "+") == []
    assert await chat.press(card, "+") == []
    assert card.card["title"] == "Count 2"
    assert card.edits[-1]["body"].startswith("* ")
    assert card.edits[-1]["m.new_content"]["dev.diddy.card"]["title"] == "Count 2"
    assert card.edits[-1]["m.relates_to"] == {"rel_type": "m.replace", "event_id": card.event_id}
    with pytest.raises(KeyError):
        await chat.press(card, "nope")


async def test_player_controls_seek_and_volume():
    bot = make_bot()
    state = {"pos": 0, "vol": 50}

    def player_card():
        return cards.track("playing", "Song", duration=200, position=state["pos"], seek="!seek",
                           volume=state["vol"], buttons=[("⏸", "!pause")],
                           controls=cards.player(toggle="!pause", volume="!volume"))

    @bot.command("play")
    async def play(ctx, *, query: str):
        await ctx.show(player_card(), key="player")

    @bot.command("seek")
    async def seek(ctx, to: str):
        m, s = to.split(":")
        state["pos"] = int(m) * 60 + int(s)
        await ctx.show(player_card(), key="player")

    @bot.command("volume")
    async def volume(ctx, n: int):
        state["vol"] = n
        await ctx.show(player_card(), key="player")

    chat = TestClient(bot)
    [card] = await chat.say("!play some song")
    await chat.seek(card, 83)
    assert card.card["position"] == 83
    await chat.press(card, "volume", arg="120")
    assert card.card["volume"] == 120


async def test_strict_mode_catches_cards_diddy_would_cut():
    bot = make_bot()

    @bot.command("long")
    async def long(ctx):
        await ctx.reply(cards.note("x" * 400))

    chat = TestClient(bot)
    [e] = await chat.say("!long")  # strict raises inside the command: the bot reports an error
    assert e.card["tone"] == "error"
    lenient = TestClient(make_bot(), strict=False)

    @lenient.bot.command("long")
    async def long2(ctx):
        await ctx.reply(cards.note("x" * 400))

    [m] = await lenient.say("!long")
    assert m.card["text"].endswith("…")


async def test_announce_profile_and_commands():
    bot = make_bot()

    @bot.command("ping", desc="pong")
    async def ping(ctx): ...

    chat = TestClient(bot)
    await chat.start()
    assert chat.profile() == {"about": "Test bot", "banner": {"from": "#f0a", "to": "#0af",
                                                             "angle": 135}, "accent": "#123456"}
    names = [c["name"] for c in chat.commands()["commands"]]
    assert names == ["help", "ping"]
    # unchanged state is not sent again
    chat.t.forbid_state = True
    await bot.announce_in(chat.room_id)
    assert bot._warned == set()


async def test_reactions_dm_upload_and_timers():
    bot = make_bot()
    votes = []
    ticks = []

    @bot.on_reaction
    async def vote(ctx):
        votes.append((ctx.reaction, ctx.target))
        await ctx.dm("thanks for voting")

    @bot.every(0.01)
    async def tick(b):
        ticks.append(1)

    chat = TestClient(bot)
    chat.join("@carol:test")  # three people: the room is no DM
    await bot.send(chat.room_id, "Vote!")
    poll = chat.sent[-1]
    await chat.react(poll, "👍")
    assert votes == [("👍", poll.event_id)]
    assert chat.sent[-1].room_id.startswith("!dm-") and chat.sent[-1].body == "thanks for voting"
    uri = await bot.upload(b"png", "image/png", "a.png")
    assert uri.startswith("mxc://")
    await chat.start()
    await asyncio.sleep(0.05)
    await chat.stop()
    assert ticks


async def test_edit_throttle_sends_only_the_newest():
    bot = make_bot()
    chat = TestClient(bot)
    bot.edit_interval = 0.05
    msg = await bot.send(chat.room_id, cards.track("downloading", "Song"))
    msg._last = __import__("time").monotonic()
    await asyncio.gather(*(msg.update(cards.track("downloading", "Song", note=f"{i} %"))
                           for i in range(10)))
    sent = chat.sent[0]
    assert len(sent.edits) == 1 and sent.card["note"] == "9 %"


def test_config_errors():
    with pytest.raises(ValueError):
        Bot(transport=FakeTransport("@b:t"), banner=("red", "#000"))
    with pytest.raises(ValueError):
        Bot(transport=FakeTransport("@b:t"), accent="blue")
    with pytest.raises(SystemExit):
        Bot.from_env(homeserver="", user_id="", password="")
