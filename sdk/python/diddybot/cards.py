"""Card builders: structured messages Diddy draws as cards (``dev.diddy.card``).

Every builder returns a :class:`Card`. A card carries the card data *and* a readable fallback text
(``body``), so Element and every other client still shows something sensible. You never write the
JSON by hand::

    from diddybot import cards

    cards.note("Saved!", tone="success", icon="✅")
    cards.listing("Your favourites", [cards.item("Song A", "Artist")], empty="Nothing yet")
    cards.stats("Top users", [cards.chart("Messages", [cards.bar("alice", 42)])])

Builders check their input early (unknown tone, a button that is not a command, ...) and raise
``ValueError``, so mistakes show up where you made them, not as a silently dropped card in Diddy.
Field rules: ``docs/bot-cards.md`` in the Diddy repo.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Optional, Sequence, Union

from .protocol import (
    ACTIONS_MAX,
    CARD_KEY,
    MORE_MAX,
    TONES,
    TRACK_STATES,
    VERSION,
    format_time,
    is_control_command,
    is_seek_command,
    parse_card,
)

__all__ = [
    "Card", "button", "player", "note", "track", "queue", "help", "help_group", "listing", "item",
    "stats", "chart", "bar", "song", "check", "now_ms",
]

ButtonLike = Union["Button", Mapping[str, str], Sequence[str]]


def now_ms() -> int:
    """The bot clock in epoch milliseconds (what ``startedAt`` expects)."""
    return int(time.time() * 1000)


@dataclass(frozen=True)
class Button:
    """A card button. A click makes the user's client send ``send`` as a normal chat message."""

    label: str
    send: str

    def to_dict(self) -> dict:
        return {"label": self.label, "send": self.send}


def button(label: str, send: str) -> Button:
    """A button: ``button("⏸ Pause", "!pause")``. ``send`` must start with ``!`` or ``/``."""
    if not isinstance(send, str) or len(send) < 2 or send[0] not in "!/" or send[1].isspace():
        raise ValueError(f"button send must be a bot command like '!pause', got {send!r}")
    if not label or not label.strip():
        raise ValueError("button label must not be empty")
    return Button(label, send)


def _buttons(items: Optional[Iterable[ButtonLike]], max_count: int, what: str) -> list[dict]:
    out = []
    for b in items or ():
        if isinstance(b, Button):
            out.append(b.to_dict())
        elif isinstance(b, Mapping):
            out.append(button(b["label"], b["send"]).to_dict())
        else:
            label, send = b
            out.append(button(label, send).to_dict())
    if len(out) > max_count:
        raise ValueError(f"at most {max_count} {what}, got {len(out)}")
    return out


def _clean(d: Mapping[str, Any]) -> dict:
    """Leave out empty fields (Diddy treats a missing field as "not set")."""
    return {k: v for k, v in d.items() if v is not None and v != "" and v != [] and v != {}}


@dataclass
class Card:
    """A card plus its fallback text. Pass it to ``ctx.reply`` / ``bot.send``."""

    data: dict
    body: str
    msgtype: str = "m.notice"
    extra: dict = field(default_factory=dict)

    def content(self) -> dict:
        """The Matrix message content (``m.room.message``)."""
        card = dict(self.data)
        card["v"] = VERSION
        return {**self.extra, "msgtype": self.msgtype, "body": self.body, CARD_KEY: card}

    def with_body(self, body: str) -> "Card":
        """Same card, own fallback text."""
        return Card(dict(self.data), body, self.msgtype, dict(self.extra))

    @property
    def kind(self) -> str:
        return self.data["kind"]

    def problems(self) -> list[str]:
        """What Diddy would drop or cut from this card (empty list: Diddy draws it as sent)."""
        return check(self.content())


# --------------------------------------------------------------------------------------- note
def note(text: str, tone: str = "info", icon: str = "", *, url: str = "", link_label: str = "",
         body: Optional[str] = None) -> Card:
    """A one-line chip: ``note("Saved", tone="success", icon="✅")``.

    ``tone``: info, success, warning, error. ``url`` (http/https) adds a round link button,
    ``link_label`` names it (default "Open").
    """
    if tone not in TONES:
        raise ValueError(f"tone must be one of {TONES}, got {tone!r}")
    if not text or not text.strip():
        raise ValueError("note text must not be empty")
    data = _clean({"kind": "note", "text": text, "tone": tone, "icon": icon or None,
                   "url": url or None, "linkLabel": (link_label or None) if url else None})
    fallback = f"{icon} {text}".strip()
    if url:
        fallback += f"\n{url}"
    return Card(data, body if body is not None else fallback)


# --------------------------------------------------------------------------------------- track
def player(*, prev: str = "", toggle: str = "", skip: str = "", volume: str = "",
           dashboard: str = "") -> dict:
    """Player buttons for :func:`track` (Diddy then draws the player layout).

    ``toggle`` is the pause/play command (``"!pause"`` while playing, ``"!resume"`` while paused),
    ``volume`` the start of the volume command: the slider sends ``<volume> N``.
    """
    out = {}
    for k, v in (("prev", prev), ("toggle", toggle), ("skip", skip), ("volume", volume),
                 ("dashboard", dashboard)):
        if v:
            if not is_control_command(v):
                raise ValueError(f"player {k} must be a command like '!skip', got {v!r}")
            out[k] = v
    return out


_TRACK_ICON = {"searching": "🔎", "downloading": "⬇️", "playing": "🎵", "paused": "⏸",
               "stopped": "⏹", "error": "⚠️"}
_TRACK_VERB = {"searching": "Searching", "downloading": "Downloading", "playing": "Playing",
               "paused": "Paused", "stopped": "Stopped", "error": "Error"}


def track(state: str, title: str, *, artist: str = "", duration: Optional[float] = None,
          position: Optional[float] = None, started_at: Optional[int] = None,
          thumbnail: str = "", url: str = "", source: str = "", note: str = "", seek: str = "",
          volume: Optional[float] = None, buttons: Iterable[ButtonLike] = (),
          room: str = "", requested_by: str = "", up_next: Iterable[Mapping[str, str]] = (),
          controls: Optional[Mapping[str, str]] = None, volume_max: Optional[float] = None,
          more: Iterable[ButtonLike] = (), body: Optional[str] = None) -> Card:
    """Something that runs: a song, a download, a build, a timer.

    ``state``: searching, downloading, playing, paused, stopped, error. With ``duration`` and
    ``position`` Diddy draws a progress bar; while ``playing`` it moves by itself (``started_at``
    defaults to now). ``seek="!seek"`` makes the bar clickable (Diddy sends ``!seek 1:23``,
    ``!seek +10``, ``!seek -10``). ``thumbnail`` must be an ``mxc://`` URI (``await bot.upload``).

    ``controls=cards.player(...)`` switches to the player layout; ``more`` fills its "⋯" menu.
    Keep ``buttons`` too: older Diddy versions show those instead.
    """
    if state not in TRACK_STATES:
        raise ValueError(f"state must be one of {TRACK_STATES}, got {state!r}")
    if not title or not title.strip():
        raise ValueError("track title must not be empty")
    if thumbnail and not thumbnail.startswith("mxc://"):
        raise ValueError("thumbnail must be an mxc:// URI: upload the image first (bot.upload)")
    if seek and not is_seek_command(seek):
        raise ValueError(f"seek must be a single command like '!seek', got {seek!r}")
    if position is not None and started_at is None and state == "playing":
        started_at = now_ms()
    ups = [_clean({"title": u["title"], "artist": u.get("artist")}) for u in up_next]
    data = _clean({
        "kind": "track", "state": state, "title": title, "artist": artist or None,
        "duration": duration, "position": position, "startedAt": started_at,
        "thumbnail": thumbnail or None, "url": url or None, "source": source or None,
        "note": note or None, "seek": seek or None, "volume": volume,
        "actions": _buttons(buttons, ACTIONS_MAX, "buttons"), "room": room or None,
        "requestedBy": requested_by or None, "upNext": ups[:3], "controls": dict(controls or {}),
        "volumeMax": volume_max, "more": _buttons(more, MORE_MAX, "menu entries"),
    })
    if body is None:
        extra = f" ({format_time(duration)})" if duration else ""
        who = f" – {artist}" if artist else ""
        body = f"{_TRACK_ICON[state]} {_TRACK_VERB[state]}: {title}{who}{extra}"
        if note:
            body += f"\n{note}"
    return Card(data, body)


# --------------------------------------------------------------------------------------- queue
def song(title: str, artist: str = "", duration: Optional[float] = None) -> dict:
    """An entry for :func:`queue` and ``up_next``."""
    return _clean({"title": title, "artist": artist or None, "duration": duration})


def queue(items: Iterable[Mapping[str, Any]], *, now: Optional[Mapping[str, Any]] = None,
          total: Optional[int] = None, buttons: Iterable[ButtonLike] = (),
          body: Optional[str] = None) -> Card:
    """A queue: what runs now plus what comes next (Diddy shows up to 50 entries)."""
    rows = [song(i["title"], i.get("artist", ""), i.get("duration")) for i in items]
    total = len(rows) if total is None else total
    data = _clean({"kind": "queue", "now": dict(song(**now)) if now else None,
                   "items": rows[:50], "total": total,
                   "actions": _buttons(buttons, ACTIONS_MAX, "buttons")})
    data.setdefault("items", [])
    data.setdefault("total", 0)
    if body is None:
        lines = [f"Now: {now['title']}"] if now else []
        lines += [f"{n}. {r['title']}" for n, r in enumerate(rows[:50], 1)]
        if total > len(rows[:50]):
            lines.append(f"… and {total - len(rows[:50])} more")
        body = "\n".join(lines) or "The queue is empty."
    return Card(data, body)


# --------------------------------------------------------------------------------------- help
def help_group(title: str, *rows: tuple[str, str]) -> dict:
    """A section of a help card: ``help_group("Basics", ("!ping", "answers pong"))``."""
    return {"title": title, "items": [{"usage": u, "desc": d} for u, d in rows]}


def help(groups: Iterable[Mapping[str, Any]], note: str = "", *,  # noqa: A001 - card kind name
         body: Optional[str] = None) -> Card:
    """A grouped command overview. The bot builds one for you (``!help``), see ``Bot``."""
    gs = [{"title": g["title"], "items": [dict(i) for i in g["items"]]} for g in groups]
    gs = [g for g in gs if g["items"]]
    if not gs:
        raise ValueError("a help card needs at least one group with items")
    data = _clean({"kind": "help", "groups": gs, "note": note or None})
    if body is None:
        lines = []
        for g in gs:
            lines.append(f"{g['title']}:")
            lines += [f"  {i['usage']} – {i['desc']}" for i in g["items"]]
        if note:
            lines.append(note)
        body = "\n".join(lines)
    return Card(data, body)


# --------------------------------------------------------------------------------------- list
def item(title: str, subtitle: str = "", duration: Optional[float] = None) -> dict:
    """An entry of :func:`listing`."""
    return _clean({"title": title, "subtitle": subtitle or None, "duration": duration})


def listing(title: str, items: Iterable[Union[str, Mapping[str, Any]]], *,
            total: Optional[int] = None, empty: str = "", buttons: Iterable[ButtonLike] = (),
            body: Optional[str] = None) -> Card:
    """A titled list (favourites, search results, todos). Items are strings or :func:`item`."""
    rows = [item(i) if isinstance(i, str) else item(i["title"], i.get("subtitle", ""),
                                                    i.get("duration")) for i in items]
    data = _clean({"kind": "list", "title": title, "items": rows[:50],
                   "total": len(rows) if total is None else total, "empty": empty or None,
                   "actions": _buttons(buttons, ACTIONS_MAX, "buttons")})
    data.setdefault("items", [])
    data.setdefault("total", 0)
    if body is None:
        if not rows:
            body = f"{title}: {empty or 'empty'}"
        else:
            body = "\n".join([f"{title}:"] + [
                f"{n}. {r['title']}" + (f" – {r['subtitle']}" if r.get("subtitle") else "")
                for n, r in enumerate(rows[:50], 1)])
    return Card(data, body)


# --------------------------------------------------------------------------------------- stats
def bar(label: str, value: float, sub: str = "") -> dict:
    """One bar of a :func:`chart` (``value`` ≥ 0; bars are relative to the largest)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise ValueError(f"bar value must be a number ≥ 0, got {value!r}")
    return _clean({"label": label, "value": value, "sub": sub or None})


def chart(title: str, bars: Iterable[Union[Mapping[str, Any], tuple]], unit: str = "") -> dict:
    """A bar chart for :func:`stats`. Bars are :func:`bar` or ``(label, value)`` tuples."""
    rows = [bar(*b) if isinstance(b, tuple) else bar(b["label"], b["value"], b.get("sub", ""))
            for b in bars]
    return _clean({"title": title, "unit": unit or None, "items": rows})


def stats(title: str, charts: Iterable[Mapping[str, Any]], *,
          buttons: Iterable[ButtonLike] = (), body: Optional[str] = None) -> Card:
    """Bar charts (up to 6 charts with 15 bars each)."""
    cs = [dict(c) for c in charts if c.get("items")]
    if not cs:
        raise ValueError("a stats card needs at least one chart with bars")
    data = _clean({"kind": "stats", "title": title, "charts": cs,
                   "actions": _buttons(buttons, ACTIONS_MAX, "buttons")})
    if body is None:
        lines = [title]
        for c in cs:
            unit = f" {c['unit']}" if c.get("unit") else ""
            lines.append(f"{c['title']}:")
            lines += [f"{n}. {b['label']} ({b['value']:g}{unit})" for n, b in enumerate(c["items"], 1)]
        body = "\n".join(lines)
    return Card(data, body)


# --------------------------------------------------------------------------------------- check
def _name(d: dict) -> Any:
    return d.get("title", d.get("label"))


def _diff(sent: Any, seen: Any, path: str, out: list[str]) -> None:
    if isinstance(sent, dict):
        seen = seen if isinstance(seen, dict) else {}
        for k, v in sent.items():
            if k == "v" and not path:
                continue
            p = f"{path}.{k}" if path else k
            if k not in seen:
                out.append(f"{p}: dropped by Diddy")
            else:
                _diff(v, seen[k], p, out)
    elif isinstance(sent, list):
        seen = seen if isinstance(seen, list) else []
        if len(seen) < len(sent):
            out.append(f"{path}: Diddy keeps {len(seen)} of {len(sent)} entries")
        # entries may be dropped in the middle; compare by position only while they line up
        for i, (a, b) in enumerate(zip(sent, seen)):
            if isinstance(a, dict) and isinstance(b, dict) and _name(a) != _name(b):
                break
            _diff(a, b, f"{path}[{i}]", out)
    elif isinstance(sent, str) and isinstance(seen, str) and sent != seen:
        if seen.endswith("…"):
            out.append(f"{path}: cut to {len(seen)} characters")
        elif seen.rstrip("/") != sent.rstrip("/") and sent.strip() == seen:
            out.append(f"{path}: spaces trimmed")
        elif seen.rstrip("/") != sent.rstrip("/"):
            out.append(f"{path}: changed to {seen!r}")


def check(content: Mapping[str, Any]) -> list[str]:
    """Everything Diddy would drop or cut from a message content, as readable lines.

    ``[]`` means Diddy draws the card exactly as sent. ``["card: Diddy ignores this card ..."]``
    means it shows only the fallback ``body``.
    """
    raw = content.get(CARD_KEY) if isinstance(content, Mapping) else None
    if raw is None:
        return []
    seen = parse_card(dict(content))
    if seen is None:
        return ["card: Diddy ignores this card and shows only the body text "
                "(unknown kind, wrong version or a required field is missing/empty)"]
    out: list[str] = []
    _diff(raw, seen, "", out)
    return out
