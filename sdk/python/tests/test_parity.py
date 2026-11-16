"""diddybot.protocol must read every content exactly like Diddy's TypeScript parsers."""
import json
import os
import random
import shutil
import subprocess

import pytest

from diddybot import protocol

HERE = os.path.dirname(__file__)
PLUGINS = os.path.normpath(os.path.join(HERE, "../../../cinny/src/app/plugins"))


def _node_ok() -> bool:
    if not shutil.which("node") or not os.path.exists(os.path.join(PLUGINS, "botCard.ts")):
        return False
    try:
        v = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout
        major, minor = (int(x) for x in v.lstrip("v").split(".")[:2])
        return (major, minor) >= (22, 6)
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _node_ok(), reason="needs Node >= 22.6 and the Diddy sources")

PY = {"card": protocol.parse_card, "action": protocol.is_card_action_message,
      "commands": protocol.parse_commands, "profile": protocol.parse_profile}


def run_ts(cases):
    res = subprocess.run(
        ["node", "--no-warnings", "--experimental-strip-types",
         os.path.join(HERE, "parity_runner.mjs"), PLUGINS],
        input=json.dumps(cases), capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def compare(cases):
    ts = run_ts(cases)
    bad = []
    for (fn, inp), want in zip(cases, ts):
        # through JSON like the network does (lone surrogates become U+FFFD on both sides)
        got = json.loads(json.dumps(PY[fn](inp)))
        if got != want:
            bad.append((fn, inp, want, got))
    assert not bad, "\n\n".join(f"{fn} {json.dumps(i, ensure_ascii=False)[:300]}\n  ts: {w}\n  py: {g}"
                                for fn, i, w, g in bad[:5])


def card(**c):
    return {"msgtype": "m.notice", "body": "x", "dev.diddy.card": {"v": 1, **c}}


EDGE = [
    ("card", card(kind="note", text="hi", tone="success", icon="👋")),
    ("card", card(kind="note", text="   spaces﻿ ", tone="nope")),
    ("card", card(kind="note", text="\u0085next line", url="https://a.de", linkLabel="Go")),
    ("card", card(kind="note", text="x" * 400)),
    ("card", card(kind="note", text="😀" * 200)),            # cut in UTF-16 units
    ("card", card(kind="note", text="a" * 298 + "😀😀")),    # cut through a surrogate pair
    ("card", card(kind="note", text="ok", url="javascript:alert(1)")),
    ("card", card(kind="note", text="ok", url="https://")),
    ("card", card(kind="note", text="ok", linkLabel="no url")),
    ("card", card(kind="note", text="")),
    ("card", {"dev.diddy.card": {"v": 2, "kind": "note", "text": "future"}}),
    ("card", {"dev.diddy.card": {"v": True, "kind": "note", "text": "bool"}}),
    ("card", {"dev.diddy.card": {"v": 1.0, "kind": "note", "text": "float one"}}),
    ("card", {"dev.diddy.card": [1, 2]}),
    ("card", {"body": "no card"}),
    ("card", card(kind="track", state="playing", title="Song", artist="A", duration=200,
                  position=10, startedAt=1763000000000, thumbnail="mxc://s.de/abc",
                  url="https://youtu.be/x", source="YouTube", note="hi", seek="!seek",
                  volume=70, room="Lounge", requestedBy="Luis", volumeMax=150,
                  controls={"prev": "!previous", "toggle": "!pause", "skip": "!skip",
                            "volume": "!volume", "dashboard": "!dashboard", "evil": "!x"},
                  more=[{"label": "🔁 Loop", "send": "!loop"}] * 20,
                  upNext=[{"title": f"T{i}", "artist": "A"} for i in range(5)],
                  actions=[{"label": "⏸ Pause", "send": "!pause"}] * 12)),
    ("card", card(kind="track", state="playing", title="t", duration=True, position=-1,
                  volume=1001, volumeMax=0, thumbnail="https://x/y.png", seek="!seek now",
                  controls={"toggle": "pause", "skip": "!skip a b", "volume": "!" + "v" * 31})),
    ("card", card(kind="track", state="playing", title="t", seek="!seek\n",
                  controls={"skip": "!skip\n", "prev": "!😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀"})),
    ("card", card(kind="track", state="dancing", title="t")),
    ("card", card(kind="track", state="paused", title="t", more="nope", upNext="nope")),
    ("card", card(kind="queue", now={"title": "Now"}, items=[{"title": "a", "duration": 3},
                                                             {"artist": "no title"}, "str"],
                  total=9)),
    ("card", card(kind="queue")),
    ("card", card(kind="help", groups=[{"title": "G", "items": [{"usage": "!a", "desc": "d"},
                                                                {"usage": "!b"}]},
                                       {"title": "", "items": [{"usage": "!c", "desc": "d"}]}],
                  note="n")),
    ("card", card(kind="help", groups=[])),
    ("card", card(kind="list", title="Favs", items=[{"title": "a", "subtitle": "b"}],
                  empty="none", actions=[{"label": "x", "send": "no command"},
                                         {"label": "", "send": "!a"}, {"label": "ok", "send": "/ok"}])),
    ("card", card(kind="list", title="Empty", items=[])),
    ("card", card(kind="stats", title="S", charts=[
        {"title": "C", "unit": "plays", "items": [{"label": "a", "value": 3, "sub": "s"},
                                                  {"label": "b", "value": -1},
                                                  {"label": "c", "value": False}]},
        {"title": "empty", "items": []}])),
    ("card", card(kind="stats", title="S", charts=[])),
    ("card", card(kind="unknown")),
    ("action", {"msgtype": "m.text", "body": "!pause", "dev.diddy.card_action": True}),
    ("action", {"msgtype": "m.text", "body": "!seek 1:23", "dev.diddy.card_action": True}),
    ("action", {"msgtype": "m.text", "body": "!a b c d", "dev.diddy.card_action": True}),
    ("action", {"msgtype": "m.text", "body": "hello there", "dev.diddy.card_action": True}),
    ("action", {"msgtype": "m.text", "body": "!pause\n", "dev.diddy.card_action": True}),
    ("action", {"msgtype": "m.notice", "body": "!pause", "dev.diddy.card_action": True}),
    ("action", {"msgtype": "m.text", "body": "!pause", "dev.diddy.card_action": 1}),
    ("commands", {"v": 1, "prefix": "!", "commands": [
        {"name": "play", "usage": "!play <x>", "desc": "plays"}, {"name": "24/7"},
        {"name": "bad name"}, {"name": "émoji"}, {"name": "²"}, {"name": "x" * 40}]}),
    ("commands", {"v": 1, "prefix": "a", "commands": [{"name": "x"}]}),
    ("commands", {"v": 1, "prefix": "/", "commands": [{"name": "x"}]}),
    ("commands", {"v": 1, "prefix": "!!", "commands": []}),
    ("commands", {"v": 1, "prefix": "!\n", "commands": [{"name": "x"}]}),
    ("profile", {"v": 1, "about": "hi", "banner": {"from": "#FF6FA5", "to": "#2bd9a8",
                                                   "angle": 135}, "accent": "#7A5CFF"}),
    ("profile", {"v": 1, "banner": {"from": "red", "to": "#000"}, "accent": "#12345"}),
    ("profile", {"v": 1, "banner": {"from": "#fff", "to": "#000", "angle": 400}}),
    ("profile", {}),
]


def test_edge_cases_match_diddy():
    compare(EDGE)


ALPHABET = ["a", "Z", "ä", " ", " ", "﻿", "\u0085", "\n", "\t", "\u0007", "😀", "🎵",
            "!", "/", ":", "#", "-", "_", "1", "x"]


def rand_text(r, n=None):
    n = r.choice([0, 1, 3, 10, 30, 130, 330]) if n is None else n
    return "".join(r.choice(ALPHABET) for _ in range(n))


def rand_value(r, depth=0):
    pick = r.random()
    if pick < 0.35:
        return rand_text(r)
    if pick < 0.5:
        return r.choice([0, 1, -5, 3.5, 1e13, 86400 * 8, True, False, None])
    if pick < 0.6:
        return r.choice(["!pause", "/x", "!seek", "!volume 10", "!a b c", "mxc://a/b",
                         "https://a.de/x", "info", "error", "playing", "#abc", "#a1b2c3"])
    if pick < 0.8 and depth < 3:
        return [rand_obj(r, depth + 1) for _ in range(r.choice([0, 1, 3, 12, 25]))]
    if depth < 3:
        return rand_obj(r, depth + 1)
    return None


KEYS = ["kind", "state", "title", "artist", "duration", "position", "startedAt", "thumbnail",
        "url", "source", "note", "seek", "volume", "actions", "room", "requestedBy", "upNext",
        "controls", "volumeMax", "more", "now", "items", "total", "groups", "usage", "desc",
        "empty", "charts", "label", "value", "sub", "unit", "text", "tone", "icon", "linkLabel",
        "send", "prev", "toggle", "skip", "dashboard", "subtitle"]


def rand_obj(r, depth=0):
    return {r.choice(KEYS): rand_value(r, depth) for _ in range(r.choice([1, 3, 6]))}


def test_random_cards_match_diddy():
    r = random.Random(4711)
    cases = []
    kinds = ["track", "queue", "help", "list", "stats", "note"]
    for i in range(600):
        raw = rand_obj(r)
        raw["kind"] = kinds[i % len(kinds)]
        raw["v"] = 1
        if raw["kind"] == "track":
            raw.setdefault("state", r.choice(protocol.TRACK_STATES))
            raw.setdefault("title", rand_text(r, 5))
        if raw["kind"] == "note":
            raw.setdefault("text", rand_text(r))
        cases.append(("card", {"dev.diddy.card": raw}))
        cases.append(("action", {"msgtype": "m.text", "dev.diddy.card_action": True,
                                 "body": r.choice(["!", "/"]) + rand_text(r, r.choice([1, 5, 31]))}))
        cases.append(("commands", {"v": 1, "prefix": r.choice(["!", "!!", ".", "a", "?"]),
                                   "commands": [{"name": rand_text(r, r.choice([1, 4, 31])),
                                                 "usage": rand_text(r), "desc": rand_text(r)}
                                                for _ in range(3)]}))
        cases.append(("profile", {"v": 1, "about": rand_text(r),
                                  "banner": {"from": rand_value(r), "to": "#abc",
                                             "angle": rand_value(r)},
                                  "accent": rand_value(r)}))
    compare(cases)


def test_builders_produce_what_diddy_draws():
    """Everything the builders make survives Diddy's parser unchanged."""
    from diddybot import cards
    made = [
        cards.note("Saved", tone="success", icon="✅", url="https://a.de/x", link_label="Open"),
        cards.track("playing", "Song", artist="A", duration=200, position=5, seek="!seek",
                    volume=70, buttons=[("⏸ Pause", "!pause")], room="Lounge",
                    requested_by="Luis", up_next=[cards.song("Next", "B")],
                    controls=cards.player(prev="!prev", toggle="!pause", skip="!skip",
                                          volume="!volume", dashboard="!dash"),
                    volume_max=150, more=[("🔁 Loop", "!loop")]),
        cards.queue([cards.song("a", "b", 10)], now=cards.song("now")),
        cards.help([cards.help_group("G", ("!a", "does a"))], note="n"),
        cards.listing("Favs", ["a", cards.item("b", "c", 30)], empty="none",
                      buttons=[("x", "!x")]),
        cards.stats("S", [cards.chart("C", [("a", 3), cards.bar("b", 1.5, "s")], unit="u")]),
    ]
    contents = [c.content() for c in made]
    ts = run_ts([("card", c) for c in contents])
    for c, want in zip(contents, ts):
        raw = {k: v for k, v in c["dev.diddy.card"].items() if k != "v"}
        want = {k: v for k, v in want.items() if not (v == [] and k not in raw)}
        assert want == json.loads(json.dumps(raw)), c["dev.diddy.card"]["kind"]
        assert cards.check(c) == []
