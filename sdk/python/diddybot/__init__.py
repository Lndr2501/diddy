"""diddybot: Matrix bots in a few lines that look their best in Diddy.

    from diddybot import Bot, cards

    bot = Bot.from_env(about="Says hello")

    @bot.command("hello", desc="greets you")
    async def hello(ctx, name: str = "you"):
        await ctx.reply(cards.note(f"Hello {name}!", tone="success", icon="👋"))

    bot.run()

Docs: sdk/python/README.md in the Diddy repo. Protocol: docs/bot-cards.md.
"""
from . import cards, protocol
from .bot import Bot, Context, Message, edit_content, to_content
from .cards import Card, button
from .commands import Command, UsageError

__version__ = "0.1.0"

__all__ = ["Bot", "Context", "Message", "Card", "Command", "UsageError", "button", "cards",
           "protocol", "edit_content", "to_content", "__version__"]
