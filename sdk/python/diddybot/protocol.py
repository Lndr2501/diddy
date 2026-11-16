"""The Diddy bot protocol, as Diddy reads it.

This is a line-by-line port of Diddy's own parsers (``cinny/src/app/plugins/botCard.ts``,
``botCommands.ts``, ``botProfile.ts``). It answers one question: *what will Diddy draw from this
content?* The bot library uses it to warn you before you send something Diddy would drop or cut,
and :mod:`diddybot.testing` uses it so your tests see exactly what a Diddy user would see.

A parity test (``tests/test_parity.py``) runs the TypeScript originals on the same inputs, so this
file cannot drift from the client. Protocol description: ``docs/bot-cards.md`` in the Diddy repo.
"""
from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import urlsplit, urlunsplit

CARD_KEY = "dev.diddy.card"
CARD_ACTION_KEY = "dev.diddy.card_action"
COMMANDS_EVENT = "dev.diddy.commands"
BOT_EVENT = "dev.diddy.bot"
VERSION = 1

TONES = ("info", "success", "warning", "error")
TRACK_STATES = ("searching", "downloading", "playing", "paused", "stopped", "error")
CONTROL_KEYS = ("prev", "toggle", "skip", "volume", "dashboard")

#: most buttons in ``actions``
ACTIONS_MAX = 10
#: most entries in the "⋯" menu of the player card
MORE_MAX = 16
#: most commands in a ``dev.diddy.commands`` list
COMMANDS_MAX = 100

# what String.prototype.trim() removes and what "\s" matches in JavaScript
# (ECMAScript WhiteSpace + LineTerminator; differs from Python's "\s", e.g. U+0085, U+FEFF)
_JS_SPACE = (
    "\t\n\u000b\u000c\r            "
    "      　﻿"
)
_NS = "[^" + re.escape(_JS_SPACE) + "]"  # JS [^\s]
_NS_SLASH = "[^/" + re.escape(_JS_SPACE) + "]"  # JS [^/\s]

_MXC = re.compile(rf"^mxc://{_NS_SLASH}{{1,255}}/{_NS_SLASH}{{1,255}}\Z")
_BUTTON_SEND = re.compile(rf"^[!/]{_NS}")
_COMMAND = re.compile(rf"^[!/]{_NS}{{1,30}}( {_NS}{{1,20}})?\Z")
_SEEK = re.compile(rf"^[!/]{_NS}{{1,30}}\Z")
_CARD_ACTION_BODY = re.compile(rf"^[!/]{_NS}{{1,30}}( {_NS}{{1,20}}){{0,2}}\Z")
_PREFIX = re.compile(r"^[!%$.,;~?+*-]{1,2}\Z")
_HEX = re.compile(r"^#(?:[0-9a-f]{3}|[0-9a-f]{6})\Z", re.IGNORECASE)
_CTRL_CARD = re.compile("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]")
_CTRL_COMMANDS = re.compile("[\u0000-\u001f\u007f]")


def _units(s: str) -> str:
    """``s`` as UTF-16 code units (astral characters as surrogate pairs). JS regexes without the
    "u" flag work on those, so `{1,30}` counts an emoji as 2; matching this string does the same."""
    out = []
    for c in s:
        o = ord(c)
        if o > 0xFFFF:
            o -= 0x10000
            out.append(chr(0xD800 + (o >> 10)) + chr(0xDC00 + (o & 0x3FF)))
        else:
            out.append(c)
    return "".join(out)


def _match(pattern: re.Pattern, s: str) -> bool:
    return bool(pattern.match(_units(s)))


def _is_object(v: Any) -> bool:
    return isinstance(v, dict)


def utf16_len(s: str) -> int:
    """Length as JavaScript counts it (UTF-16 code units: an emoji is often 2)."""
    return sum(2 if ord(c) > 0xFFFF else 1 for c in s)


def _utf16_slice(s: str, end: int) -> str:
    """``s.slice(0, end)`` in JavaScript. A cut through a surrogate pair keeps a lone surrogate,
    like JS does; it is written as U+FFFD when sent as UTF-8."""
    out, n = [], 0
    for c in s:
        w = 2 if ord(c) > 0xFFFF else 1
        if n + w > end:
            if w == 2 and n < end:
                out.append(chr(0xD800 + ((ord(c) - 0x10000) >> 10)))
            break
        out.append(c)
        n += w
    return "".join(out)


def _cut(clean: str, max_len: int) -> str:
    return f"{_utf16_slice(clean, max_len - 1)}…" if utf16_len(clean) > max_len else clean


def _text(v: Any, max_len: int, ctrl: re.Pattern = _CTRL_CARD) -> Optional[str]:
    """Printable text, single piece, cut to ``max_len`` characters (UTF-16 units)."""
    if not isinstance(v, str):
        return None
    clean = ctrl.sub("", v).strip(_JS_SPACE)
    if not clean:
        return None
    return _cut(clean, max_len)


def _num(v: Any, max_value: float = 1e9) -> Optional[float]:
    # bool is an int in Python, but true/false are not numbers in JSON
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if v != v or v in (float("inf"), float("-inf")):
        return None
    return v if 0 <= v <= max_value else None


def _http_url(v: Any) -> Optional[str]:
    if not isinstance(v, str) or utf16_len(v) > 2000:
        return None
    s = v.strip(_JS_SPACE)
    try:
        u = urlsplit(s)
    except ValueError:
        return None
    if u.scheme.lower() not in ("http", "https"):
        return None
    host = u.hostname or ""
    if not host or any(c.isspace() for c in u.netloc):
        return None
    # The client normalises the link with `new URL(v).toString()`; a bare host gets a "/".
    return s if u.path else urlunsplit((u.scheme, u.netloc, "/", u.query, u.fragment))


def _actions(v: Any, max_count: int = ACTIONS_MAX) -> list[dict]:
    if not isinstance(v, list):
        return []
    out = []
    for a in v[:max_count]:
        if not _is_object(a):
            continue
        label = _text(a.get("label"), 24)
        send = _text(a.get("send"), 120)
        if label and send and _match(_BUTTON_SEND, send):
            out.append({"label": label, "send": send})
    return out


def _command(v: Any) -> Optional[str]:
    if isinstance(v, str) and utf16_len(v) <= 60 and _match(_COMMAND, v):
        return v
    return None


def is_control_command(v: Any) -> bool:
    """A command Diddy accepts as a player button / volume prefix ("!skip", "!fav add")."""
    return _command(v) is not None


def is_seek_command(v: Any) -> bool:
    """A command Diddy accepts for the clickable timeline ("!seek")."""
    return isinstance(v, str) and _match(_SEEK, v)


def _controls(v: Any) -> Optional[dict]:
    if not _is_object(v):
        return None
    out = {}
    for k in CONTROL_KEYS:
        c = _command(v.get(k))
        if c:
            out[k] = c
    return out


def _up_next(v: Any) -> Optional[list]:
    if not isinstance(v, list):
        return None
    out = []
    for i in v[:20]:
        if not _is_object(i) or len(out) >= 3:
            continue
        title = _text(i.get("title"), 160)
        if title:
            out.append(_drop_none({"title": title, "artist": _text(i.get("artist"), 120)}))
    return out


def _queue_item(v: Any) -> Optional[dict]:
    if not _is_object(v):
        return None
    title = _text(v.get("title"), 160)
    if not title:
        return None
    return _drop_none({
        "title": title,
        "artist": _text(v.get("artist"), 120),
        "duration": _num(v.get("duration"), 86400 * 7),
    })


def _drop_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def parse_card(content: Any) -> Optional[dict]:
    """The card Diddy draws from a message ``content``, or ``None`` (then Diddy shows ``body``).

    Mirrors ``parseBotCard``: unknown kinds, wrong versions and missing required fields give
    ``None``; texts are cut, invalid buttons and links are dropped. Fields Diddy leaves out are
    missing from the result (like ``undefined`` in JSON).
    """
    if not _is_object(content):
        return None
    raw = content.get(CARD_KEY)
    if not _is_object(raw) or raw.get("v") != 1 or isinstance(raw.get("v"), bool):
        return None
    kind = raw.get("kind")

    if kind == "track":
        title = _text(raw.get("title"), 200)
        state = raw.get("state") if raw.get("state") in TRACK_STATES else None
        if not title or not state:
            return None
        thumb = raw.get("thumbnail")
        seek = raw.get("seek")
        more = raw.get("more")
        return _drop_none({
            "kind": "track",
            "state": state,
            "title": title,
            "artist": _text(raw.get("artist"), 120),
            "duration": _num(raw.get("duration"), 86400 * 7),
            "position": _num(raw.get("position"), 86400 * 7),
            "startedAt": _num(raw.get("startedAt"), 4e12),
            "thumbnail": thumb if isinstance(thumb, str) and _match(_MXC, thumb) else None,
            "url": _http_url(raw.get("url")),
            "source": _text(raw.get("source"), 30),
            "note": _text(raw.get("note"), 200),
            "seek": seek if isinstance(seek, str) and _match(_SEEK, seek) else None,
            "volume": _num(raw.get("volume"), 1000),
            "actions": _actions(raw.get("actions")),
            "room": _text(raw.get("room"), 80),
            "requestedBy": _text(raw.get("requestedBy"), 80),
            "upNext": _up_next(raw.get("upNext")),
            "controls": _controls(raw.get("controls")),
            "volumeMax": _num(raw.get("volumeMax"), 1000) or None,
            "more": _actions(more, MORE_MAX) if isinstance(more, list) else None,
        })

    if kind == "queue":
        items = [q for q in (_queue_item(i) for i in _list(raw.get("items"))[:50]) if q]
        total = _num(raw.get("total"), 1e6)
        return _drop_none({
            "kind": "queue",
            "now": _queue_item(raw.get("now")),
            "items": items,
            "total": len(items) if total is None else total,
            "actions": _actions(raw.get("actions")),
        })

    if kind == "help":
        groups = []
        for g in _list(raw.get("groups"))[:12]:
            if not _is_object(g):
                continue
            title = _text(g.get("title"), 60)
            items = []
            for i in _list(g.get("items"))[:20]:
                if not _is_object(i):
                    continue
                usage = _text(i.get("usage"), 120)
                desc = _text(i.get("desc"), 200)
                if usage and desc:
                    items.append({"usage": usage, "desc": desc})
            if title and items:
                groups.append({"title": title, "items": items})
        if not groups:
            return None
        return _drop_none({"kind": "help", "groups": groups, "note": _text(raw.get("note"), 400)})

    if kind == "list":
        title = _text(raw.get("title"), 100)
        if not title:
            return None
        items = []
        for i in _list(raw.get("items"))[:50]:
            if not _is_object(i):
                continue
            t = _text(i.get("title"), 160)
            if t:
                items.append(_drop_none({
                    "title": t,
                    "subtitle": _text(i.get("subtitle"), 120),
                    "duration": _num(i.get("duration"), 86400 * 7),
                }))
        total = _num(raw.get("total"), 1e6)
        return _drop_none({
            "kind": "list",
            "title": title,
            "items": items,
            "total": len(items) if total is None else total,
            "empty": _text(raw.get("empty"), 200),
            "actions": _actions(raw.get("actions")),
        })

    if kind == "stats":
        title = _text(raw.get("title"), 100)
        charts = []
        for c in _list(raw.get("charts"))[:6]:
            if not _is_object(c):
                continue
            ct = _text(c.get("title"), 80)
            items = []
            for i in _list(c.get("items"))[:15]:
                if not _is_object(i):
                    continue
                label = _text(i.get("label"), 120)
                value = _num(i.get("value"), 1e12)
                if label and value is not None:
                    items.append(_drop_none({"label": label, "value": value,
                                             "sub": _text(i.get("sub"), 60)}))
            if ct and items:
                charts.append(_drop_none({"title": ct, "unit": _text(c.get("unit"), 12),
                                          "items": items}))
        if not title or not charts:
            return None
        return {"kind": "stats", "title": title, "charts": charts,
                "actions": _actions(raw.get("actions"))}

    if kind == "note":
        body = _text(raw.get("text"), 300)
        if not body:
            return None
        tone = raw.get("tone") if raw.get("tone") in TONES else "info"
        url = _http_url(raw.get("url"))
        return _drop_none({
            "kind": "note",
            "text": body,
            "tone": tone,
            "icon": _text(raw.get("icon"), 8),
            "url": url,
            "linkLabel": _text(raw.get("linkLabel"), 40) if url else None,
        })

    return None


def _list(v: Any) -> list:
    return v if isinstance(v, list) else []


def is_card_action_message(content: Any) -> bool:
    """True for a command a Diddy card button / timeline sent ("!pause", "!seek 1:23").

    Diddy hides those in the chat. Only short, command-shaped ``m.text`` messages count.
    """
    if (not _is_object(content) or content.get(CARD_ACTION_KEY) is not True
            or content.get("msgtype") != "m.text"):
        return False
    body = content.get("body")
    return (isinstance(body, str) and utf16_len(body) <= 60
            and _match(_CARD_ACTION_BODY, body))


def _command_name_ok(name: str) -> bool:
    # /^[\p{L}\p{N}_/-]+$/u
    return bool(name) and all(c.isalpha() or c.isnumeric() or c in "_/-" for c in name)


def parse_commands(content: Any) -> Optional[dict]:
    """The command list Diddy reads from a ``dev.diddy.commands`` state content, or ``None``."""
    if not _is_object(content) or content.get("v") != 1 or isinstance(content.get("v"), bool):
        return None
    prefix = content.get("prefix")
    if not isinstance(prefix, str) or not _match(_PREFIX, prefix):
        return None
    commands = []
    for c in _list(content.get("commands"))[:COMMANDS_MAX]:
        if not _is_object(c):
            continue
        name = _text(c.get("name"), 30, _CTRL_COMMANDS)
        if not name or not _command_name_ok(name):
            continue
        commands.append({
            "name": name,
            "usage": _text(c.get("usage"), 120, _CTRL_COMMANDS) or f"{prefix}{name}",
            "desc": _text(c.get("desc"), 160, _CTRL_COMMANDS) or "",
        })
    return {"prefix": prefix, "commands": commands} if commands else None


def parse_profile(content: Any) -> Optional[dict]:
    """The bot profile Diddy reads from a ``dev.diddy.bot`` state content, or ``None``."""
    if not _is_object(content) or content.get("v") != 1 or isinstance(content.get("v"), bool):
        return None
    out: dict = {}
    about = _text(content.get("about"), 200)
    if about:
        out["about"] = about
    banner = content.get("banner")
    if _is_object(banner):
        frm, to = _hex(banner.get("from")), _hex(banner.get("to"))
        angle = banner.get("angle")
        if frm and to:
            out["banner"] = {"from": frm, "to": to}
            if _num(angle, 360) is not None:
                out["banner"]["angle"] = angle
    accent = _hex(content.get("accent"))
    if accent:
        out["accent"] = accent
    return out


def _hex(v: Any) -> Optional[str]:
    return v.lower() if isinstance(v, str) and _match(_HEX, v) else None


def format_time(seconds: float) -> str:
    """3:17 or 1:02:03, like Diddy shows times."""
    s = max(0, int(seconds // 1))
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"
