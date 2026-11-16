"""A countdown with a progress bar that Diddy animates by itself.

The bot edits the card only when something changes (start, pause, resume, done); in between
Diddy moves the bar from `position` and `startedAt`. !timer 90 Tea
"""
import asyncio
import time

from diddybot import Bot, cards

bot = Bot.from_env(display_name="Timer Bot", about="Countdowns with a live bar.",
                   banner=("#f59e0b", "#ef4444"))

timers: dict[str, dict] = {}  # room id -> timer


def elapsed(t: dict) -> float:
    return t["done"] + (time.monotonic() - t["since"] if t["running"] else 0)


def timer_card(t: dict) -> cards.Card:
    left = max(0.0, t["seconds"] - elapsed(t))
    if left <= 0:
        return cards.track("stopped", t["label"], duration=t["seconds"], position=t["seconds"],
                           note="⏰ Time is up!",
                           buttons=[("🔁 Again", f"!timer {t['seconds']} {t['label']}")])
    state = "playing" if t["running"] else "paused"
    toggle = ("⏸ Pause", "!tpause") if t["running"] else ("▶ Resume", "!tresume")
    return cards.track(state, t["label"], artist=f"{t['seconds']} s timer",
                       duration=t["seconds"], position=elapsed(t), seek="!tseek",
                       buttons=[toggle, ("⏹ Cancel", "!tcancel")])


async def ring(room_id: str, t: dict) -> None:
    while t["running"] and elapsed(t) < t["seconds"]:
        await asyncio.sleep(min(1.0, t["seconds"] - elapsed(t)))
    if t["running"] and timers.get(room_id) is t:
        t["running"] = False
        t["done"] = t["seconds"]
        await bot.live(room_id, "timer").update(timer_card(t))
        await bot.send(room_id, cards.note(f"{t['label']}: time is up!", tone="success", icon="⏰"))


def start(room_id: str, t: dict) -> None:
    t["running"], t["since"] = True, time.monotonic()
    t["task"] = asyncio.ensure_future(ring(room_id, t))


@bot.command("timer", desc="start a countdown")
async def timer(ctx, seconds: int, label: str = "Timer"):
    if not 1 <= seconds <= 86400:
        await ctx.usage("1 second to 24 hours")
        return
    t = {"seconds": seconds, "label": label, "done": 0.0, "since": 0.0, "running": False}
    old = timers.get(ctx.room_id)
    if old:
        old["running"] = False
    timers[ctx.room_id] = t
    start(ctx.room_id, t)
    await ctx.show(timer_card(t), key="timer", new=True)


@bot.command("tpause", hidden=True)
async def tpause(ctx):
    t = timers.get(ctx.room_id)
    if t and t["running"]:
        t["done"], t["running"] = elapsed(t), False
        await ctx.show(timer_card(t), key="timer")


@bot.command("tresume", hidden=True)
async def tresume(ctx):
    t = timers.get(ctx.room_id)
    if t and not t["running"] and elapsed(t) < t["seconds"]:
        start(ctx.room_id, t)
        await ctx.show(timer_card(t), key="timer")


@bot.command("tseek", hidden=True)
async def tseek(ctx, to: str):
    """The timeline: Diddy sends "!tseek 1:23", "!tseek +10" or "!tseek -10"."""
    t = timers.get(ctx.room_id)
    if not t:
        return
    if to[0] in "+-":
        pos = elapsed(t) + float(to)
    else:
        m, _, s = to.rpartition(":")
        pos = int(m or 0) * 60 + int(s)
    t["done"], t["since"] = max(0.0, min(pos, t["seconds"] - 1)), time.monotonic()
    await ctx.show(timer_card(t), key="timer")


@bot.command("tcancel", hidden=True)
async def tcancel(ctx):
    t = timers.pop(ctx.room_id, None)
    if t:
        t["running"] = False
        await ctx.show(cards.track("stopped", t["label"], note="Cancelled"), key="timer")


if __name__ == "__main__":
    bot.run()
