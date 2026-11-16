"""diddybot: Matrix bots in a few lines that look their best in Diddy.

    from diddybot import Bot, cards

    bot = Bot.from_env(about="Says hello")

    @bot.command("hello", desc="greets you")
    async def hello(ctx, name: str = "you"):
        await ctx.reply(cards.note(f"Hello {name}!", tone="success", icon="👋"))

    bot.run()

Docs: sdk/python/README.md in the Diddy repo. Protocol: docs/bot-cards.md.
"""
from . import cards, checks, errors, protocol, tasks, ui
from .bot import Bot, Context, Message, edit_content, to_content
from .cards import Card, button
from .checks import check, cooldown
from .cog import Cog, command, group, listener
from .commands import Command
from .converters import Converter, Duration
from .errors import (
    BadArgument,
    CheckFailure,
    CommandError,
    CommandInvokeError,
    MissingArgument,
    OnCooldown,
    UsageError,
)
from .objects import File, Member, Room
from .store import Store
from .tasks import Loop
from .ui import View

__version__ = "0.2.0"

__all__ = [
    "Bot", "Context", "Message", "Card", "Command", "Cog", "View", "File", "Member", "Room",
    "Duration", "Converter", "Loop", "Store", "UsageError", "BadArgument", "MissingArgument",
    "CheckFailure", "OnCooldown", "CommandError", "CommandInvokeError", "button", "check",
    "cooldown", "command", "group", "listener", "cards", "checks", "errors", "protocol", "tasks",
    "ui", "edit_content", "to_content", "__version__"]
