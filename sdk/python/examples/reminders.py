"""Reminders with a Cog: Duration argument, confirm buttons, cooldown, store and a loop.

!remind 10m Tea         set a reminder
!reminders              list yours
!clear                  delete all of yours (asks first)
"""
import time

from diddybot import Bot, Cog, Duration, cards, checks, command, tasks

bot = Bot.from_env(display_name="Reminder Bot", about="Reminds you of things.",
                   banner=("#f59e0b", "#ef4444"))


class Reminders(Cog):
    def __init__(self, bot):
        self.bot = bot

    def due_list(self):
        return self.bot.store.get("reminders", [])      # [{"user", "room", "due", "text"}]

    @command("remind", desc="remind you later", usage="!remind <time> <text>",
             describe={"wait": "how long, e.g. 10m or 1h 30m", "text": "what to remind you of"})
    @checks.cooldown(5, 60)
    async def remind(self, ctx, wait: Duration, *, text: str):
        if not 5 <= wait <= 7 * 86400:
            await ctx.usage("between 5 seconds and 7 days")
            return
        items = self.due_list() + [{"user": ctx.sender, "room": ctx.room_id,
                                    "due": time.time() + wait, "text": text}]
        self.bot.store.set("reminders", items)
        await ctx.reply(cards.note(f"I will remind you in {int(wait)} s: {text}",
                                   tone="success", icon="⏰"))

    @command("reminders", desc="your open reminders")
    async def reminders(self, ctx):
        mine = [r for r in self.due_list() if r["user"] == ctx.sender]
        rows = [{"title": r["text"], "subtitle": f"in {max(0, int(r['due'] - time.time()))} s"}
                for r in mine]
        await ctx.reply(cards.listing("⏰ Your reminders", rows, empty="Nothing set"))

    @command("clear", desc="delete all your reminders")
    async def clear(self, ctx):
        if await ctx.confirm("Delete all your reminders?"):
            self.bot.store.set("reminders", [r for r in self.due_list() if r["user"] != ctx.sender])
            await ctx.reply(cards.note("Deleted.", tone="success"))

    @tasks.loop(seconds=15)
    async def deliver(self):
        now = time.time()
        items = self.due_list()
        for r in [r for r in items if r["due"] <= now]:
            await self.bot.send(r["room"], cards.note(r["text"], icon="⏰"))
        self.bot.store.set("reminders", [r for r in items if r["due"] > now])


bot.add_cog(Reminders(bot))

if __name__ == "__main__":
    bot.run()
