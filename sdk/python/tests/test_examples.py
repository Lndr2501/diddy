"""The example bots and the project template work and only send cards Diddy draws as sent."""
import asyncio
import importlib.util
import os
import subprocess
import sys

from diddybot.testing import TestClient

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))


def load(name):
    for k, v in {"DIDDY_BOT_HOMESERVER": "http://localhost", "DIDDY_BOT_USER": "@bot:test",
                 "DIDDY_BOT_PASSWORD": "x"}.items():
        os.environ.setdefault(k, v)
    spec = importlib.util.spec_from_file_location(f"ex_{name}",
                                                  os.path.join(ROOT, "examples", f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


async def test_hello():
    chat = TestClient(load("hello").bot)
    [m] = await chat.say("!hello")
    assert m.card["text"] == "Hello alice!"
    [m] = await chat.say("!roll 20")
    assert m.card["tone"] == "success"


async def test_poll():
    chat = TestClient(load("poll").bot)
    [card] = await chat.say('!poll "Pizza or pasta?" Pizza Pasta')
    await chat.press(card, "1. Pizza")
    await chat.press(card, "2. Pasta", user="@bob:test")
    await chat.press(card, "2. Pasta", user="@carol:test")
    bars = card.card["charts"][0]["items"]
    assert [b["value"] for b in bars] == [1, 2]
    await chat.press(card, "🔒 Close")
    assert card.card["title"].startswith("🔒") and card.card["actions"] == []
    [u] = await chat.say("!poll lonely")
    assert u.card["tone"] == "warning"


async def test_timer():
    mod = load("timer")
    chat = TestClient(mod.bot)
    [card] = await chat.say("!timer 1 Tea")
    assert card.card["state"] == "playing" and card.card["duration"] == 1
    await chat.press(card, "⏸ Pause")
    assert card.card["state"] == "paused"
    await chat.seek(card, 0)
    await chat.press(card, "▶ Resume")
    await asyncio.sleep(1.3)
    assert card.card["state"] == "stopped" and "up" in card.card["note"]
    assert chat.sent[-1].card["text"] == "Tea: time is up!"


async def test_player():
    chat = TestClient(load("player").bot)
    [card] = await chat.say("!play Neon Highway")
    assert card.card["controls"]["toggle"] == "!pause"
    await chat.say("!play Paper Planets")
    assert card.card["upNext"] == [{"title": "Paper Planets", "artist": "Demo Artist"}]
    await chat.press(card, "toggle")
    assert card.card["state"] == "paused" and card.card["controls"]["toggle"] == "!resume"
    await chat.press(card, "volume", arg="120")
    assert card.card["volume"] == 120
    await chat.seek(card, 75)
    assert card.card["position"] == 75
    await chat.press(card, "🔁 Loop")
    assert card.card["more"][0]["label"] == "🔁 Loop: on"
    [q] = await chat.press(card, "📜 Queue")
    assert q.card["kind"] == "queue" and q.card["now"]["title"] == "Neon Highway"
    await chat.press(card, "skip")
    assert card.card["title"] == "Paper Planets"


def test_template(tmp_path):
    target = tmp_path / "mybot"
    from diddybot.__main__ import main
    assert main(["new", str(target)]) == 0
    assert (target / "bot.py").exists() and (target / ".gitignore").read_text().startswith("store/")
    env = dict(os.environ, PYTHONPATH=ROOT, DIDDY_BOT_HOMESERVER="http://localhost",
               DIDDY_BOT_USER="@b:t", DIDDY_BOT_PASSWORD="x")
    res = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"],
                         cwd=target, env=env, capture_output=True, text=True)
    assert res.returncode == 0, res.stdout + res.stderr
    assert main(["new", str(target)]) == 1  # never overwrite


def test_check_cli(tmp_path, capsys):
    from diddybot.__main__ import main
    f = tmp_path / "c.json"
    f.write_text('{"kind": "note", "text": "hi", "tone": "info"}')
    assert main(["check", str(f)]) == 0
    f.write_text('{"kind": "note", "text": "hi", "url": "ftp://x"}')
    assert main(["check", str(f)]) == 1
    assert "url: dropped by Diddy" in capsys.readouterr().out
