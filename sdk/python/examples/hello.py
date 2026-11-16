"""The smallest useful bot: python examples/hello.py (settings in .env, see README)."""
from diddybot import Bot, cards

bot = Bot.from_env(display_name="Hello Bot", about="Says hello. Type !help.",
                   banner=("#ff6fa5", "#7a5cff"))


@bot.command("hello", desc="greets you")
async def hello(ctx, name: str = ""):
    await ctx.reply(cards.note(f"Hello {name or ctx.sender_name}!", icon="👋"))


@bot.command("roll", desc="rolls a die", group="Fun")
async def roll(ctx, sides: int = 6):
    import random
    await ctx.reply(cards.note(f"🎲 {random.randint(1, max(2, sides))}", tone="success"))


if __name__ == "__main__":
    bot.run()
