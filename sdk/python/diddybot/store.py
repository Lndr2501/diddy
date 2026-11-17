"""A small key-value store for your bot: ``bot.store`` (SQLite, a file in the bot's store folder).

::

    bot.store.set("counter", 41)
    n = bot.store.incr("counter")               # 42
    bot.store.get("missing", default=0)

    room = bot.store.room(ctx.room_id)          # a separate space per room
    room.set("greeting", "hi")
    user = bot.store.scope(f"user:{ctx.sender}")

Values are anything JSON can hold (numbers, text, lists, dicts). Restarting the bot keeps them.
"""
from __future__ import annotations

import json
import os
import sqlite3
from typing import Any, Iterator

__all__ = ["Store", "Scope"]


class Store:
    def __init__(self, path: str = ":memory:"):
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.path = path
        self._db = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS kv ("
                         "scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, "
                         "PRIMARY KEY (scope, key))")

    # ------------------------------------------------------------------ plain access
    def get(self, key: str, default: Any = None, *, scope: str = "") -> Any:
        row = self._db.execute("SELECT value FROM kv WHERE scope = ? AND key = ?",
                               (scope, key)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key: str, value: Any, *, scope: str = "") -> None:
        self._db.execute("INSERT INTO kv (scope, key, value) VALUES (?, ?, ?) "
                         "ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value",
                         (scope, key, json.dumps(value)))

    def delete(self, key: str, *, scope: str = "") -> bool:
        cur = self._db.execute("DELETE FROM kv WHERE scope = ? AND key = ?", (scope, key))
        return cur.rowcount > 0

    def incr(self, key: str, by: float = 1, *, scope: str = "") -> Any:
        """Add ``by`` to a number (a missing key counts as 0) and return the new value."""
        value = (self.get(key, 0, scope=scope) or 0) + by
        self.set(key, value, scope=scope)
        return value

    def keys(self, prefix: str = "", *, scope: str = "") -> list[str]:
        like = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        rows = self._db.execute("SELECT key FROM kv WHERE scope = ? AND key LIKE ? ESCAPE '\\' "
                                "ORDER BY key", (scope, like)).fetchall()
        return [r[0] for r in rows]

    def items(self, prefix: str = "", *, scope: str = "") -> Iterator[tuple[str, Any]]:
        for k in self.keys(prefix, scope=scope):
            yield k, self.get(k, scope=scope)

    def __contains__(self, key: str) -> bool:
        return self._db.execute("SELECT 1 FROM kv WHERE scope = '' AND key = ?",
                                (key,)).fetchone() is not None

    def clear(self, *, scope: str = "") -> None:
        self._db.execute("DELETE FROM kv WHERE scope = ?", (scope,))

    # ------------------------------------------------------------------ spaces
    def scope(self, name: str) -> "Scope":
        """A separate space inside the store (``store.scope("user:@alice:server")``)."""
        return Scope(self, name)

    def room(self, room_id: str) -> "Scope":
        """The space of one room."""
        return Scope(self, f"room:{room_id}")

    def close(self) -> None:
        self._db.close()


class Scope:
    """The same calls as :class:`Store`, inside one space."""

    def __init__(self, store: Store, name: str):
        self._s, self.name = store, name

    def get(self, key: str, default: Any = None) -> Any:
        return self._s.get(key, default, scope=self.name)

    def set(self, key: str, value: Any) -> None:
        self._s.set(key, value, scope=self.name)

    def delete(self, key: str) -> bool:
        return self._s.delete(key, scope=self.name)

    def incr(self, key: str, by: float = 1) -> Any:
        return self._s.incr(key, by, scope=self.name)

    def keys(self, prefix: str = "") -> list[str]:
        return self._s.keys(prefix, scope=self.name)

    def items(self, prefix: str = "") -> Iterator[tuple[str, Any]]:
        return self._s.items(prefix, scope=self.name)

    def clear(self) -> None:
        self._s.clear(scope=self.name)

    def __contains__(self, key: str) -> bool:
        return self._s._db.execute("SELECT 1 FROM kv WHERE scope = ? AND key = ?",
                                   (self.name, key)).fetchone() is not None
