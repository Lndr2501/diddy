"""A poll with buttons. The card is edited on every vote and shows live bars.

!poll "Pizza or pasta?" Pizza Pasta Salad
"""
from collections import defaultdict

from diddybot import Bot, cards

bot = Bot.from_env(display_name="Poll Bot", about="Quick polls with buttons.",
                   banner=("#2bd9a8", "#3b82f6"))

# room id -> {"question": str, "options": [...], "votes": {user: index}}
polls: dict[str, dict] = {}


def poll_card(p: dict, closed: bool = False) -> cards.Card:
    counts = defaultdict(int)
    for choice in p["votes"].values():
        counts[choice] += 1
    bars = [cards.bar(opt, counts[i], f"{counts[i]} vote{'s' * (counts[i] != 1)}")
            for i, opt in enumerate(p["options"])]
    buttons = [] if closed else [(f"{i + 1}. {o}"[:24], f"!vote {i + 1}")
                                 for i, o in enumerate(p["options"])] + [("🔒 Close", "!endpoll")]
    title = ("🔒 " if closed else "📊 ") + p["question"]
    return cards.stats(title, [cards.chart(f"{len(p['votes'])} votes", bars)], buttons=buttons)


@bot.command("poll", usage='!poll "question" option1 option2 …', desc="start a poll")
async def poll(ctx, question: str, *options: str):
    if not 2 <= len(options) <= 9:
        await ctx.usage("A poll needs 2 to 9 options")
        return
    polls[ctx.room_id] = {"question": question, "options": list(options), "votes": {}}
    await ctx.show(poll_card(polls[ctx.room_id]), key="poll", new=True)


@bot.command("vote", hidden=True)
async def vote(ctx, choice: int):
    p = polls.get(ctx.room_id)
    if not p or not 1 <= choice <= len(p["options"]):
        return
    p["votes"][ctx.sender] = choice - 1
    await ctx.show(poll_card(p), key="poll")


@bot.command("endpoll", desc="close the poll", power=0)
async def endpoll(ctx):
    p = polls.pop(ctx.room_id, None)
    if p:
        await ctx.show(poll_card(p, closed=True), key="poll")
        bot.forget(ctx.room_id, "poll")


if __name__ == "__main__":
    bot.run()
