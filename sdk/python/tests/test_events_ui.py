import asyncio

import pytest

from diddybot import Bot, View, cards, ui
from diddybot.testing import FakeTransport, TestClient


def make_bot(**kw):
    return Bot(transport=FakeTransport("@bot:test"), **kw)


async def test_listen_dispatch_custom_events_and_legacy_decorators():
    bot = make_bot()
    got = []

    @bot.listen("message")
    async def a(ctx):
        got.append(("a", ctx.body))

    @bot.listen("message")
    async def b(ctx):
        got.append(("b", ctx.body))

    @bot.listen("ping_event")
    async def ping_event(x, y):
        got.append(("custom", x, y))

    @bot.on_member_join
    async def welcome(b_, room_id, user_id):
        got.append(("join", user_id))

    @bot.listen
    async def on_member_leave(room_id, user_id):
        got.append(("leave", user_id))

    @bot.on_start
    async def started(b_):
        got.append(("start", b_ is bot))

    chat = TestClient(bot)
    await chat.say("hello")
    await chat.say("!help")                 # commands are no "message" events
    bot.dispatch("ping_event", 1, 2)
    await asyncio.sleep(0)
    await chat.arrive("@carol:test")
    await chat.leave("@carol:test")
    await chat.start()
    assert got == [("a", "hello"), ("b", "hello"), ("custom", 1, 2), ("join", "@carol:test"),
                   ("leave", "@carol:test"), ("start", True)]


async def test_edit_delete_and_reaction_remove_events():
    bot = make_bot()
    got = []

    @bot.listen("message_edit")
    async def edited(ctx):
        got.append(("edit", ctx.body, ctx.target))

    @bot.listen("message_delete")
    async def deleted(ctx):
        got.append(("delete", ctx.target))

    @bot.listen("reaction")
    async def reacted(ctx):
        got.append(("react", ctx.reaction))

    @bot.listen("reaction_remove")
    async def unreacted(ctx):
        got.append(("unreact", ctx.reaction, ctx.target, ctx.sender))

    @bot.command("x")
    async def x(ctx):
        await ctx.reply("hi")

    chat = TestClient(bot)
    [m] = await chat.say("!x")
    await chat.say("see")
    mine = chat.last_event_id
    await chat.edit(mine, "see again")
    await chat.delete(mine)
    r = await chat.react(m, "👍")
    await chat.delete(r)
    assert got == [("edit", "see again", mine), ("delete", mine), ("react", "👍"),
                   ("unreact", "👍", m.event_id, "@alice:test")]
    assert chat.sent[-1] is m                       # an edit is no new command


async def test_wait_for_and_ask_and_timeout():
    bot = make_bot()

    @bot.command("name")
    async def name(ctx):
        answer = await ctx.ask("Your name?", timeout=0.3)
        await ctx.reply(f"hi {answer}" if answer else "too slow")

    chat = TestClient(bot)
    task = asyncio.ensure_future(chat.say("!name"))
    await asyncio.sleep(0.05)
    await chat.say("Zed", user="@mallory:test")      # somebody else: ignored
    await chat.say("Bob")
    out = await task
    assert [m.body for m in out] == ["Your name?", "hi Bob"]
    with pytest.raises(asyncio.TimeoutError):
        await bot.wait_for("message", timeout=0.05)
    slow = await chat.say("!name")                                   # nobody answers
    assert [m.body for m in slow] == ["Your name?", "too slow"]


async def test_confirm_with_button_text_answer_and_timeout():
    bot = make_bot()
    results = []

    @bot.command("wipe")
    async def wipe(ctx):
        ok = await ctx.confirm("Delete everything?", timeout=1)
        results.append(ok)

    chat = TestClient(bot)
    task = asyncio.ensure_future(chat.say("!wipe"))
    await asyncio.sleep(0.05)
    [prompt] = chat.sent
    assert prompt.card["kind"] == "list" and prompt.card["title"] == "Delete everything?"
    assert list(prompt.buttons()) == ["✅ Yes", "❌ No"]
    await chat.press(prompt, "✅ Yes", user="@mallory:test")       # not the asker: ignored
    assert results == []
    await chat.press(prompt, "✅ Yes")
    await task
    assert results == [True]
    assert prompt.card["kind"] == "note" and "Delete everything? — Yes" in prompt.card["text"]

    task = asyncio.ensure_future(chat.say("!wipe"))
    await asyncio.sleep(0.05)
    await chat.say("nein")
    await task
    assert results == [True, False]

    await chat.say("!wipe")                                          # nobody answers
    assert results[-1] is None and chat.sent[-1].card["tone"] == "warning"


async def test_view_buttons_call_python_and_stop():
    bot = make_bot()
    clicks = []

    class Counter(View):
        def __init__(self):
            super().__init__(timeout=5)
            self.n = 0

        @ui.button("+1")
        async def plus(self, ctx, button):
            self.n += 1
            clicks.append(ctx.sender)
            await self.update(cards.listing(f"Count {self.n}", [], buttons=[("Own", "!own")]))

        @ui.button("Done")
        async def done(self, ctx, button):
            self.stop()

    @bot.command("count")
    async def count(ctx):
        await ctx.reply(cards.listing("Count 0", [], buttons=[("Own", "!own")]), view=Counter())

    chat = TestClient(bot)
    [card] = await chat.say("!count")
    assert list(card.buttons()) == ["Own", "+1", "Done"]
    assert card.card["actions"][1]["send"].startswith("!_v ")
    await chat.press(card, "+1")
    await chat.press(card, "+1", user="@bob:test")
    assert clicks == ["@alice:test", "@bob:test"] and card.card["title"] == "Count 2"
    await chat.press(card, "Done")
    await asyncio.sleep(0.05)
    assert list(card.buttons()) == ["Own"]                           # buttons removed
    [stale] = await chat.say("!_v abcdef 0")                         # an old card: told once
    assert "out of date" in stale.card["text"]
    assert await chat.say("!_v abcdef 0") == []


async def test_view_owner_timeout_and_errors():
    bot = make_bot()
    seen = []

    class Mine(View):
        async def on_timeout(self):
            seen.append("timeout")
            await super().on_timeout()

        @ui.button("Boom")
        async def boom(self, ctx, button):
            raise RuntimeError("no")

    view = Mine(timeout=0.2, owner="@alice:test")

    @bot.command("v")
    async def v(ctx):
        await ctx.reply(cards.listing("T", []), view=view)

    chat = TestClient(bot)
    [card] = await chat.say("!v")
    await chat.press(card, "Boom", user="@bob:test")                 # owner only
    await chat.press(card, "Boom")                                   # callback error is contained
    assert await view.wait() is True and seen == ["timeout"]
    await asyncio.sleep(0.05)
    assert list(card.buttons()) == []
    with pytest.raises(ValueError):
        view.inject({"msgtype": "m.notice", "body": "x"})
    with pytest.raises(ValueError):
        view.inject(cards.note("a note").content())


async def test_view_on_plain_text_and_too_many_buttons():
    bot = make_bot()

    async def cb(ctx):
        return None

    @bot.command("t")
    async def t(ctx):
        v = View()
        v.add_button("Go", cb)
        await ctx.reply("Ready?", view=v)

    chat = TestClient(bot)
    [m] = await chat.say("!t")
    assert m.card["title"] == "Ready?" and list(m.buttons()) == ["Go"]
    v = View()
    for i in range(11):
        v.add_button(f"b{i}", cb)
    with pytest.raises(ValueError):
        v.inject(cards.listing("x", []).content())


async def test_paginator():
    bot = make_bot()
    pages = [cards.listing(f"Page {i}", [f"row {i}"]) for i in range(1, 6)]

    @bot.command("pages")
    async def pages_cmd(ctx):
        await ctx.paginate(pages)

    chat = TestClient(bot)
    [m] = await chat.say("!pages")
    assert m.card["title"] == "Page 1" and list(m.buttons()) == ["1/5", "▶", "⏭"]
    await chat.press(m, "▶")
    await chat.press(m, "▶")
    assert m.card["title"] == "Page 3"
    assert list(m.buttons()) == ["⏮", "◀", "3/5", "▶", "⏭"]
    await chat.press(m, "⏭")
    assert m.card["title"] == "Page 5" and list(m.buttons()) == ["⏮", "◀", "5/5"]
    await chat.press(m, "⏮", user="@bob:test")                       # only the asker
    assert m.card["title"] == "Page 5"
    with pytest.raises(ValueError):
        ui.Paginator([])
