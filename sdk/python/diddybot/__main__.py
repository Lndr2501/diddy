"""``diddybot new <folder>``: a ready bot project. ``diddybot check <file.json>``: lint a card."""
from __future__ import annotations

import argparse
import json
import os
import sys

from . import cards

BOT_PY = '''"""{name}: a Matrix bot built with diddybot."""
from diddybot import Bot, cards

bot = Bot.from_env(
    display_name="{name}",
    about="A friendly bot. Type !help.",
    banner=("#ff6fa5", "#7a5cff"),
)


@bot.command("ping", desc="checks that I am alive")
async def ping(ctx):
    await ctx.reply(cards.note("Pong!", tone="success", icon="🏓"))


@bot.command("hello", desc="greets you", group="Fun")
async def hello(ctx, name: str = ""):
    await ctx.reply(cards.note(f"Hello {{name or ctx.sender_name}}!", icon="👋"))


@bot.command("count", desc="a counter with buttons", group="Fun")
async def count(ctx, n: int = 0):
    # show(): the first call sends the card, button presses edit it in place
    await ctx.show(cards.listing(
        f"Counter: {{n}}", [], empty="Press a button",
        buttons=[("➖", f"!count {{n - 1}}"), ("➕", f"!count {{n + 1}}")]))


if __name__ == "__main__":
    bot.run()
'''

TEST_PY = '''from bot import bot
from diddybot.testing import TestClient


async def test_ping():
    chat = TestClient(bot)
    [answer] = await chat.say("!ping")
    assert answer.card["text"] == "Pong!"


async def test_counter_buttons():
    chat = TestClient(bot)
    [card] = await chat.say("!count 1")
    assert await chat.press(card, "➕") == []   # no new message: the card was edited
    assert card.card["title"] == "Counter: 2"


async def test_help_lists_commands():
    chat = TestClient(bot)
    await chat.start()
    names = [c["name"] for c in chat.commands()["commands"]]
    assert "ping" in names and "hello" in names
'''

ENV = """# Matrix account of the bot (create it like any user account)
DIDDY_BOT_HOMESERVER=https://matrix.example.org
DIDDY_BOT_USER=@mybot:example.org
DIDDY_BOT_PASSWORD=change-me
# Optional: DIDDY_BOT_TOKEN instead of the password, DIDDY_BOT_STORE=./store, DIDDY_BOT_PREFIX=!
"""

FILES = {
    "bot.py": BOT_PY,
    "test_bot.py": TEST_PY,
    ".env.example": ENV,
    ".gitignore": "store/\n.env\n__pycache__/\n",
    "requirements.txt": "diddy-bot\npytest\npytest-asyncio\n",
    "pytest.ini": "[pytest]\nasyncio_mode = auto\n",
}


def new(folder: str) -> int:
    if os.path.exists(folder) and os.listdir(folder):
        print(f"{folder} exists and is not empty", file=sys.stderr)
        return 1
    os.makedirs(folder, exist_ok=True)
    name = os.path.basename(os.path.abspath(folder))
    for fname, text in FILES.items():
        with open(os.path.join(folder, fname), "w", encoding="utf-8") as fh:
            fh.write(text.format(name=name) if fname == "bot.py" else text)
    print(f"""Created {folder}/
Next:
  cd {folder}
  cp .env.example .env      # fill in the bot account
  python bot.py             # invite the bot to a room, then type !help
  pytest                    # tests run without a server""")
    return 0


def check(path: str) -> int:
    with (sys.stdin if path == "-" else open(path, encoding="utf-8")) as fh:
        content = json.load(fh)
    if "dev.diddy.card" not in content and "kind" in content:
        content = {"msgtype": "m.notice", "body": "x", "dev.diddy.card": {"v": 1, **content}}
    problems = cards.check(content)
    for p in problems:
        print(p)
    if not problems:
        print("ok: Diddy draws this card as sent")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="diddybot")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("new", help="create a bot project").add_argument("folder")
    sub.add_parser("check", help="check a card JSON (file or -)").add_argument("file")
    a = ap.parse_args(argv)
    return new(a.folder) if a.cmd == "new" else check(a.file)


if __name__ == "__main__":
    sys.exit(main())
