import pytest

from diddybot import cards


def test_note_body_and_link():
    c = cards.note("Issue created", tone="success", icon="✅", url="https://x.de/1")
    assert c.body == "✅ Issue created\nhttps://x.de/1"
    assert c.content()["dev.diddy.card"] == {"kind": "note", "text": "Issue created",
                                             "tone": "success", "icon": "✅",
                                             "url": "https://x.de/1", "v": 1}
    assert c.content()["msgtype"] == "m.notice"


@pytest.mark.parametrize("make", [
    lambda: cards.note("x", tone="loud"),
    lambda: cards.note(""),
    lambda: cards.button("Go", "go"),
    lambda: cards.button("", "!go"),
    lambda: cards.track("dancing", "t"),
    lambda: cards.track("playing", "t", thumbnail="https://x/y.png"),
    lambda: cards.track("playing", "t", seek="!seek now"),
    lambda: cards.player(skip="skip"),
    lambda: cards.player(volume="!volume up down"),
    lambda: cards.listing("x", [], buttons=[("b", f"!b{i}") for i in range(11)]),
    lambda: cards.bar("x", -1),
    lambda: cards.bar("x", True),
    lambda: cards.stats("x", []),
    lambda: cards.help([]),
])
def test_builders_reject_what_diddy_would_drop(make):
    with pytest.raises(ValueError):
        make()


def test_track_runs_by_itself_while_playing():
    c = cards.track("playing", "Song", duration=100, position=10)
    assert c.data["startedAt"] > 1_700_000_000_000
    assert "startedAt" not in cards.track("paused", "Song", duration=100, position=10).data
    assert c.body == "🎵 Playing: Song (1:40)"


def test_queue_list_stats_bodies():
    q = cards.queue([cards.song("a"), cards.song("b")], now=cards.song("n"), total=5)
    assert q.body == "Now: n\n1. a\n2. b\n… and 3 more"
    assert cards.listing("Favs", [], empty="nothing").body == "Favs: nothing"
    s = cards.stats("Top", [cards.chart("Plays", [("a", 3)], unit="x")])
    assert s.body == "Top\nPlays:\n1. a (3 x)"


def test_check_reports_cuts_and_drops():
    content = cards.note("x" * 500, icon="👋").content()
    assert cards.check(content) == ["text: cut to 300 characters"]
    content["dev.diddy.card"]["kind"] = "nope"
    assert "ignores this card" in cards.check(content)[0]
    content = cards.listing("L", ["a"]).content()
    content["dev.diddy.card"]["actions"] = [{"label": "x", "send": "no"}]
    assert cards.check(content) == ["actions: Diddy keeps 0 of 1 entries"]
    assert cards.check({"msgtype": "m.text", "body": "plain"}) == []


def test_with_body_and_problems():
    c = cards.note("hi").with_body("custom")
    assert c.content()["body"] == "custom" and c.problems() == []
