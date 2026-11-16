"""People, rooms and files: what ``ctx.author``, ``ctx.room`` and ``ctx.reply(File(...))`` give you.

::

    @bot.command("who")
    async def who(ctx, member: Member):                  # !who alice  (name or @id:server)
        await ctx.reply(f"{member.mention} has power {member.power}", mentions=[member])

    await ctx.reply(File("cover.png"))                    # image, audio, video or any file
"""
from __future__ import annotations

import mimetypes
import os
import struct
from typing import TYPE_CHECKING, Any, Optional, Union

from .errors import BadArgument

if TYPE_CHECKING:  # pragma: no cover
    from .bot import Bot

__all__ = ["Member", "Room", "File"]


class Member:
    """A person in a room. Names and power levels are read live from the room."""

    def __init__(self, bot: "Bot", room_id: str, user_id: str):
        self.bot, self.room_id, self.id = bot, room_id, user_id

    @property
    def name(self) -> str:
        """Display name in this room (falls back to the Matrix id)."""
        return self.bot._t.display_name(self.room_id, self.id) or self.id

    @property
    def mention(self) -> str:
        """``@Name``. Pass the member in ``mentions=[...]`` of ``reply`` to make it a real mention."""
        return f"@{self.name}"

    @property
    def power(self) -> int:
        return self.bot._t.power_level(self.room_id, self.id)

    @property
    def avatar_url(self) -> str:
        """``mxc://`` URI of the avatar ("" without one)."""
        return self.bot._t.avatar_url(self.room_id, self.id)

    @property
    def is_bot(self) -> bool:
        return self.id == self.bot.user_id

    async def dm(self, content: Any, **kw: Any) -> Any:
        return await self.bot.dm(self.id, content, **kw)

    def __str__(self) -> str:
        return self.name

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Member) and other.id == self.id

    def __hash__(self) -> int:
        return hash(self.id)

    def __repr__(self) -> str:
        return f"<Member {self.id} {self.name!r}>"

    @classmethod
    def convert(cls, ctx: Any, text: str) -> "Member":
        """``alice``, ``@alice``, ``Alice Example``, ``@alice:server`` or the start of a name."""
        wanted = text.strip()
        key = wanted.lstrip("@").casefold()
        rows = ctx.bot._t.member_list(ctx.room_id)
        if not key:
            raise BadArgument("member: name missing")

        def local(uid: str) -> str:
            return uid.lstrip("@").split(":", 1)[0].casefold()

        for test in (lambda u, n: u.casefold() == wanted.casefold() or u.lstrip("@").casefold() == key,
                     lambda u, n: n.casefold() == key or local(u) == key,
                     lambda u, n: n.casefold().startswith(key) or local(u).startswith(key)):
            hits = [(u, n) for u, n, _ in rows if test(u, n)]
            if len(hits) == 1:
                return cls(ctx.bot, ctx.room_id, hits[0][0])
            if len(hits) > 1:
                names = ", ".join(n or u for u, n in hits[:5])
                raise BadArgument(f"member: “{wanted}” fits several people ({names}); "
                                  "use the full @id:server")
        raise BadArgument(f"member: nobody called “{wanted}” in this room")


class Room:
    """A room the bot is in."""

    def __init__(self, bot: "Bot", room_id: str):
        self.bot, self.id = bot, room_id

    @property
    def name(self) -> str:
        return self.bot._t.room_name(self.id)

    @property
    def topic(self) -> str:
        return self.bot._t.room_topic(self.id)

    @property
    def alias(self) -> str:
        """The main ``#alias:server`` ("" without one)."""
        return self.bot._t.room_alias(self.id)

    @property
    def member_count(self) -> int:
        return self.bot._t.member_count(self.id)

    @property
    def is_dm(self) -> bool:
        return self.member_count <= 2

    @property
    def encrypted(self) -> bool:
        return self.bot._t.is_encrypted(self.id)

    @property
    def members(self) -> list[Member]:
        return [Member(self.bot, self.id, u) for u, _, _ in self.bot._t.member_list(self.id)]

    async def send(self, content: Any, **kw: Any) -> Any:
        return await self.bot.send(self.id, content, **kw)

    def __str__(self) -> str:
        return self.name

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Room) and other.id == self.id

    def __hash__(self) -> int:
        return hash(self.id)

    def __repr__(self) -> str:
        return f"<Room {self.id} {self.name!r}>"

    @classmethod
    def convert(cls, ctx: Any, text: str) -> "Room":
        """``!abc:server``, ``#alias:server`` or (part of) the name of a room of the bot."""
        wanted = text.strip()
        rooms = [cls(ctx.bot, r) for r in ctx.bot._t.joined_rooms()]
        for test in (lambda r: r.id == wanted or r.alias.casefold() == wanted.casefold(),
                     lambda r: r.name.casefold() == wanted.casefold(),
                     lambda r: wanted.casefold() in r.name.casefold()):
            hits = [r for r in rooms if test(r)]
            if len(hits) == 1:
                return hits[0]
            if len(hits) > 1:
                raise BadArgument(f"room: “{wanted}” fits {len(hits)} rooms; use the !id or #alias")
        raise BadArgument(f"room: I am in no room called “{wanted}”")


# ------------------------------------------------------------------------------------------ files
def image_size(data: bytes) -> Optional[tuple[int, int]]:
    """Width and height of a PNG, GIF or JPEG (``None`` when unknown). No dependencies."""
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return struct.unpack(">II", data[16:24])
        if data[:6] in (b"GIF87a", b"GIF89a"):
            return struct.unpack("<HH", data[6:10])
        if data[:2] == b"\xff\xd8":
            i = 2
            while i + 9 < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                size = struct.unpack(">H", data[i + 2:i + 4])[0]
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                i += 2 + size
    except (struct.error, IndexError):
        pass
    return None


class File:
    """A file to send: ``await ctx.reply(File("cover.png", caption="Cover"))``.

    ``source`` is a path or the bytes. Images, audio and video are shown by clients as such, the rest
    as a download. In encrypted rooms the file is encrypted, like the messages.
    """

    def __init__(self, source: Union[bytes, str, os.PathLike], filename: str = "",
                 mimetype: str = "", *, caption: str = ""):
        if isinstance(source, (bytes, bytearray)):
            self.data = bytes(source)
            self.filename = filename or "file"
        else:
            path = os.fspath(source)
            with open(path, "rb") as fh:
                self.data = fh.read()
            self.filename = filename or os.path.basename(path)
        self.mimetype = (mimetype or mimetypes.guess_type(self.filename)[0]
                         or "application/octet-stream")
        self.caption = caption

    @property
    def msgtype(self) -> str:
        top = self.mimetype.split("/", 1)[0]
        return {"image": "m.image", "audio": "m.audio", "video": "m.video"}.get(top, "m.file")

    def info(self) -> dict:
        out: dict[str, Any] = {"mimetype": self.mimetype, "size": len(self.data)}
        if self.msgtype == "m.image":
            size = image_size(self.data)
            if size:
                out["w"], out["h"] = size
        return out

    def __repr__(self) -> str:
        return f"<File {self.filename} {self.mimetype} {len(self.data)} bytes>"

