"""Everything a track card can do: the Diddy player layout with cover, controls, volume slider,
"⋯" menu, up next and a queue. It does not play audio; plug in your own source.

!play <title> adds a song, the card buttons do the rest.
"""
from diddybot import Bot, cards

bot = Bot.from_env(display_name="Player Demo", about="Shows the Diddy player card.",
                   banner=("#ff6fa5", "#2bd9a8"), accent="#7a5cff")

state = {"queue": [], "now": None, "paused": False, "volume": 70, "pos": 0, "loop": False}


def player_card(ctx_room: str) -> cards.Card:
    now = state["now"]
    if not now:
        return cards.track("stopped", "Nothing playing", note="!play <title> to start")
    paused = state["paused"]
    return cards.track(
        "paused" if paused else "playing", now["title"], artist=now["artist"],
        duration=now["duration"], position=state["pos"], seek="!seek",
        volume=state["volume"], room=ctx_room, requested_by=now["by"],
        up_next=[cards.song(s["title"], s["artist"]) for s in state["queue"][:3]],
        controls=cards.player(prev="!restart", toggle="!resume" if paused else "!pause",
                              skip="!skip", volume="!volume"),
        volume_max=150,
        more=[("🔁 Loop: on" if state["loop"] else "🔁 Loop", "!loop"), ("📜 Queue", "!queue"),
              ("⏹ Stop", "!stop")],
        # older Diddy versions show these instead of the player
        buttons=[("▶ Play" if paused else "⏸ Pause", "!resume" if paused else "!pause"),
                 ("⏭ Skip", "!skip")],
    )


async def refresh(ctx):
    await ctx.show(player_card(ctx.room_name), key="player")


@bot.command("play", desc="add a song", group="Player")
async def play(ctx, *, title: str):
    song = {"title": title, "artist": "Demo Artist", "duration": 180, "by": ctx.sender_name}
    if state["now"] is None:
        state.update(now=song, pos=0, paused=False)
    else:
        state["queue"].append(song)
    await refresh(ctx)


@bot.command("pause", hidden=True)
async def pause(ctx):
    state["paused"] = True
    await refresh(ctx)


@bot.command("resume", hidden=True)
async def resume(ctx):
    state["paused"] = False
    await refresh(ctx)


@bot.command("skip", desc="next song", group="Player")
async def skip(ctx):
    state.update(now=state["queue"].pop(0) if state["queue"] else None, pos=0)
    await refresh(ctx)


@bot.command("restart", hidden=True)
async def restart(ctx):
    state["pos"] = 0
    await refresh(ctx)


@bot.command("seek", hidden=True)
async def seek(ctx, to: str):
    if to[0] in "+-":
        state["pos"] = max(0, state["pos"] + int(to))
    else:
        m, _, s = to.rpartition(":")
        state["pos"] = int(m or 0) * 60 + int(s)
    await refresh(ctx)


@bot.command("volume", desc="volume 0-150", group="Player")
async def volume(ctx, level: int):
    state["volume"] = max(0, min(150, level))
    await refresh(ctx)


@bot.command("loop", hidden=True)
async def loop(ctx):
    state["loop"] = not state["loop"]
    await refresh(ctx)


@bot.command("stop", desc="stop and clear", group="Player")
async def stop(ctx):
    state.update(now=None, queue=[], pos=0)
    await refresh(ctx)


@bot.command("queue", desc="show the queue", group="Player")
async def queue(ctx):
    now = state["now"]
    await ctx.reply(cards.queue(
        [cards.song(s["title"], s["artist"], s["duration"]) for s in state["queue"]],
        now=cards.song(now["title"], now["artist"], now["duration"]) if now else None))


if __name__ == "__main__":
    bot.run()
