from typing import Optional

import pytest

from diddybot.commands import CommandRegistry, UsageError, split_args
from diddybot import protocol


async def _f(ctx): ...


def reg():
    return CommandRegistry("!")


def test_split_args_quotes():
    assert [w for w, _ in split_args('a "b c" \'d\' e')] == ["a", "b c", "d", "e"]


def test_parse_name_alias_case():
    r = reg()
    r.add("play", _f, aliases=("p",))
    assert r.parse("!PLAY x y")[1] == "x y"
    assert r.parse("!p")[0].name == "play"
    assert r.parse("! play") is None and r.parse("play") is None and r.parse("!nope") is None
    assert r.parse("!play\nsecond line")[1] == "second line"


async def test_binding_by_annotations():
    async def timer(ctx, seconds: int, label: str = "Timer"): ...
    c = reg().add("timer", timer)
    assert await c.bind("30 Pizza im Ofen") == ([30, "Pizza im Ofen"], {})
    assert await c.bind("30") == ([30, "Timer"], {})
    assert await c.bind('30 "quoted"') == ([30, "quoted"], {})
    with pytest.raises(UsageError):
        await c.bind("")
    with pytest.raises(UsageError):
        await c.bind("soon")
    assert c.usage_line("!") == "!timer <seconds> [label]"


async def test_binding_bool_float_optional_varargs_rest():
    async def f(ctx, on: bool, x: Optional[float] = None, *words: str): ...
    c = reg().add("f", f)
    assert await c.bind("an 1,5 a b") == ([True, 1.5, "a", "b"], {})
    async def g(ctx, n: int, *, text: str): ...
    c = reg().add("g", g)
    assert await c.bind("2 hello   world") == ([2], {"text": "hello   world"})
    with pytest.raises(UsageError):
        await c.bind("2")
    assert c.usage_line("!") == "!g <n> <text>"


def test_invalid_names_and_sync_handlers():
    r = reg()
    with pytest.raises(ValueError):
        r.add("bad name", _f)
    def sync(ctx): ...
    with pytest.raises(TypeError):
        r.add("x", sync)
    r.add("a", _f, aliases=("b",))
    with pytest.raises(ValueError):
        r.add("c", _f, aliases=("b",))


def test_commands_content_is_what_diddy_suggests():
    r = reg()
    async def play(ctx, query: str): ...
    r.add("play", play, desc="plays")
    r.add("secret", _f, hidden=True)
    r.add("24/7", _f, desc="radio")
    content = r.commands_content()
    assert protocol.parse_commands(content) == {"prefix": "!", "commands": [
        {"name": "play", "usage": "!play <query>", "desc": "plays"},
        {"name": "24/7", "usage": "!24/7", "desc": "radio"}]}


def test_help_card_groups_and_splits():
    r = reg()
    for i in range(25):
        r.add(f"c{i}", _f, desc=f"does {i}", group="Many")
    r.add("x", _f, group="Other", aliases=("y",))
    card = r.help_card(note="hi")
    parsed = protocol.parse_card(card.content())
    assert [g["title"] for g in parsed["groups"]] == ["Many", "Many (2)", "Other"]
    assert parsed["groups"][2]["items"] == [{"usage": "!x · !y", "desc": "–"}]
    assert card.problems() == []
