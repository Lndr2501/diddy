import enum
from typing import Literal, Optional

import pytest

from diddybot import (BadArgument, Bot, CommandError, Duration, Member,
                      MissingArgument, UsageError, checks, protocol)
from diddybot import checks as ck
from diddybot.testing import FakeTransport, TestClient


def make_bot(**kw):
    return Bot(transport=FakeTransport("@bot:test"), **kw)


async def test_groups_and_subcommands():
    bot = make_bot()

    @bot.group("playlist", desc="your playlists")
    async def playlist(ctx): ...

    @playlist.command("add", desc="add a song", aliases=("a",))
    async def add(ctx, *, song: str):
        await ctx.reply(f"added {song}")

    @playlist.command("list")
    async def lst(ctx):
        await ctx.reply("the list")

    chat = TestClient(bot)
    assert (await chat.say("!playlist add Hey Jude"))[0].body == "added Hey Jude"
    assert (await chat.say("!playlist a Yesterday"))[0].body == "added Yesterday"
    assert (await chat.say("!PLAYLIST list"))[0].body == "the list"
    [help_] = await chat.say("!playlist")           # no subcommand: lists them
    rows = [i["usage"] for g in help_.card["groups"] for i in g["items"]]
    assert rows == ["!playlist add <song> · !playlist a", "!playlist list"]
    [bad] = await chat.say("!playlist nope")
    assert "unknown subcommand" in bad.card["text"] and "Usage: !playlist <add|list>" in bad.card["text"]
    [missing] = await chat.say("!playlist add")
    assert "Usage: !playlist add <song>" in missing.card["text"]
    # Diddy only suggests the group, the help lists the subcommands
    suggested = protocol.parse_commands(bot.registry.commands_content())["commands"]
    assert [c["name"] for c in suggested] == ["help", "playlist"]
    usages = [i["usage"] for g in (await chat.say("!help"))[0].card["groups"] for i in g["items"]]
    assert "!playlist add <song> · !playlist a" in usages and "!playlist" not in usages


async def test_group_with_own_action_and_nested():
    bot = make_bot()

    @bot.group("cfg", invoke_without_command=True)
    async def cfg(ctx, key: str = ""):
        await ctx.reply(f"cfg {key or 'overview'}")

    @cfg.command("room")
    async def room(ctx): ...

    @room.command("name")
    async def name(ctx, value: str):
        await ctx.reply(f"name={value}")

    chat = TestClient(bot)
    assert (await chat.say("!cfg"))[0].body == "cfg overview"
    assert (await chat.say("!cfg volume"))[0].body == "cfg volume"
    assert (await chat.say("!cfg room name Büro"))[0].body == "name=Büro"


class Color(enum.Enum):
    red = 1
    blue = 2


async def test_converters():
    bot = make_bot()
    seen = {}

    @bot.command("t")
    async def t(ctx, wait: Duration, mode: Literal["on", "off"], color: Color, nums: list[int]):
        seen.update(wait=wait, mode=mode, color=color, nums=nums)
        await ctx.reply("ok")

    chat = TestClient(bot)
    await chat.say("!t 5m30s ON Blue 1 2 3")
    assert seen == {"wait": 330.0, "mode": "on", "color": Color.blue, "nums": [1, 2, 3]}
    assert isinstance(seen["wait"], Duration)
    assert "<wait> <on|off> <color> <nums…>" in (await chat.say("!t"))[0].card["text"]
    for bad, needle in (("!t soon on red 1", "duration"), ("!t 1m maybe red 1", "one of on, off"),
                        ("!t 1m on green 1", "one of red, blue"), ("!t 1m on red x", "whole number")):
        assert needle in (await chat.say(bad))[0].card["text"]
    assert [p.choices for p in bot.registry.commands["t"].params][1:3] == [["on", "off"], ["red", "blue"]]


async def test_custom_converters_sync_async_and_failing():
    bot = make_bot()

    class Even:
        @classmethod
        async def convert(cls, ctx, text):
            n = int(text)
            if n % 2:
                raise BadArgument("only even numbers")
            return n

    def shout(text):
        return text.upper()

    @bot.command("c")
    async def c(ctx, a: Even, b: shout, c: Optional[int] = None):
        await ctx.reply(f"{a} {b} {c}")

    chat = TestClient(bot)
    assert (await chat.say("!c 4 hi"))[0].body == "4 HI None"
    assert "only even numbers" in (await chat.say("!c 3 hi"))[0].card["text"]
    assert "invalid literal" in (await chat.say("!c x hi"))[0].card["text"]


async def test_checks_power_owner_room_dm_and_custom():
    bot = make_bot(owners=["@alice:test"])
    VIP = {"@carol:test"}

    @bot.command("mod")
    @checks.power(50)
    async def mod(ctx):
        await ctx.reply("mod ok")

    @bot.command("own")
    @checks.owner()
    async def own(ctx):
        await ctx.reply("owner ok")

    async def vip(ctx):
        return ctx.sender in VIP

    @bot.command("vip", checks=[vip])
    async def vip_cmd(ctx):
        await ctx.reply("vip ok")

    @bot.command("roomy")
    @checks.room_only()
    async def roomy(ctx):
        await ctx.reply("room ok")

    chat = TestClient(bot)
    chat.join("@carol:test")
    assert "power level 50" in (await chat.say("!mod"))[0].card["text"]
    chat.set_power("@alice:test", 50)
    assert (await chat.say("!mod"))[0].body == "mod ok"
    assert (await chat.say("!own"))[0].body == "owner ok"
    assert "owners" in (await chat.say("!own", user="@carol:test"))[0].card["text"]
    assert "cannot use" in (await chat.say("!vip"))[0].card["text"]
    assert (await chat.say("!vip", user="@carol:test"))[0].body == "vip ok"
    assert (await chat.say("!roomy"))[0].body == "room ok"
    [dm] = await chat.say("!roomy", room="!dm:test", user="@alice:test")
    assert "direct message" in dm.card["text"]


async def test_global_check_hooks_and_error_handlers():
    bot = make_bot()
    log = []

    @bot.check
    async def not_banned(ctx):
        return ctx.sender != "@mallory:test"

    @bot.before_invoke
    async def before(ctx):
        log.append(("before", ctx.command.name))

    @bot.after_invoke
    async def after(ctx):
        log.append(("after", ctx.command.name))

    @bot.command("boom")
    async def boom(ctx):
        raise RuntimeError("kaputt")

    @bot.command("fine")
    async def fine(ctx):
        await ctx.reply("fine")

    chat = TestClient(bot, strict=False)
    chat.join("@mallory:test")
    assert (await chat.say("!fine"))[0].body == "fine"
    assert (await chat.say("!fine", user="@mallory:test"))[0].card["tone"] == "error"
    assert "Something went wrong" in (await chat.say("!boom"))[0].card["text"]
    assert log == [("before", "fine"), ("after", "fine"), ("before", "boom"), ("after", "boom")]

    caught = []

    @bot.on_command_error
    async def on_error(ctx, error):
        caught.append(type(error).__name__)

    assert await chat.say("!boom") == [] and await chat.say("!fine", user="@mallory:test") == []
    assert caught[:2] == ["CommandInvokeError", "CheckFailure"]

    @bot.command("custom")
    async def custom(ctx):
        raise CommandError("Nicht gefunden")

    @custom.error
    async def custom_error(ctx, error):
        await ctx.reply(f"local: {error}")

    assert (await chat.say("!custom"))[0].body == "local: Nicht gefunden"


async def test_command_error_listener_sees_every_error_and_commandinvokeerror_wraps():
    bot = make_bot()
    seen = []

    @bot.listen("command_error")
    async def log_error(ctx, error):
        seen.append(error)

    @bot.command("x")
    async def x(ctx, n: int):
        raise ValueError("bad")

    chat = TestClient(bot, strict=False)
    await chat.say("!x")
    await chat.say("!x 1")
    assert isinstance(seen[0], MissingArgument) and isinstance(seen[0], UsageError)
    assert type(seen[1]).__name__ == "CommandInvokeError" and isinstance(seen[1].original, ValueError)


async def test_cooldown(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(ck, "_clock", lambda: now[0])
    bot = make_bot()

    @bot.command("roll")
    @checks.cooldown(2, 10, by="user")
    async def roll(ctx, sides: int = 6):
        await ctx.reply("rolled")

    chat = TestClient(bot)
    chat.join("@bob:test")
    assert (await chat.say("!roll"))[0].body == "rolled"
    assert (await chat.say("!roll"))[0].body == "rolled"
    [cd] = await chat.say("!roll")
    assert cd.card["tone"] == "warning" and "works again in 10 s" in cd.card["text"]
    assert (await chat.say("!roll", user="@bob:test"))[0].body == "rolled"   # per user
    await chat.say("!roll x")                       # a usage error does not use up a try
    now[0] += 10.5
    assert (await chat.say("!roll"))[0].body == "rolled"
    with pytest.raises(ValueError):
        ck.Cooldown(0, 5)


async def test_command_is_still_callable_and_reregistering_replaces():
    bot = make_bot()

    @bot.command("a")
    async def a(ctx):
        return "result"

    assert await a(None) == "result"

    @bot.command("a")
    async def a2(ctx):
        await ctx.reply("second")

    chat = TestClient(bot)
    assert (await chat.say("!a"))[0].body == "second"


async def test_member_converter_and_usage_in_help_use_choices():
    bot = make_bot()

    @bot.command("poke")
    async def poke(ctx, who: Member):
        await ctx.reply(f"poked {who.name} ({who.id})")

    chat = TestClient(bot)
    chat.join("@bob:test", name="Bob Builder")
    chat.join("@bobby:test", name="Bobby")
    assert (await chat.say("!poke @bob:test"))[0].body == "poked Bob Builder (@bob:test)"
    assert (await chat.say('!poke "Bob Builder"'))[0].body == "poked Bob Builder (@bob:test)"
    assert (await chat.say("!poke bob"))[0].body == "poked Bob Builder (@bob:test)"  # exact id part
    assert "fits several" in (await chat.say("!poke bo"))[0].card["text"]
    assert "nobody called" in (await chat.say("!poke zed"))[0].card["text"]
    assert (await chat.say("!poke bobby"))[0].body == "poked Bobby (@bobby:test)"


async def test_options_for_diddy_suggestions():
    bot = make_bot()

    @bot.command("mode", describe={"setting": "turns it on or off"})
    async def mode(ctx, setting: Literal["on", "off"], note: str = "", *, text: str = ""):
        ...

    @bot.command("sum")
    async def total(ctx, numbers: list[int], *words: str):
        ...

    @bot.group("pl")
    async def pl(ctx): ...

    @pl.command("add")
    async def pl_add(ctx, song: str): ...

    @pl.command("secret", hidden=True)
    async def pl_secret(ctx): ...

    @bot.command("quiet", hidden=True)
    async def quiet(ctx): ...

    @bot.command("color")
    async def color(ctx, c: Color, loud: bool = False): ...

    commands = {c["name"]: c for c in protocol.parse_commands(bot.registry.commands_content())["commands"]}
    assert commands["mode"]["options"] == [
        {"name": "setting", "required": True, "desc": "turns it on or off", "choices": ["on", "off"]},
        {"name": "note", "required": False}, {"name": "text", "required": False}]
    assert commands["sum"]["options"] == [{"name": "numbers", "required": True},
                                          {"name": "words", "required": False}]
    assert commands["pl"]["options"] == [{"name": "subcommand", "required": True,
                                          "choices": ["add"]}]
    assert commands["color"]["options"][0]["choices"] == ["red", "blue"]
    assert commands["color"]["options"][1]["choices"] == ["on", "off"]
    assert "quiet" not in commands and "options" not in commands["help"]
