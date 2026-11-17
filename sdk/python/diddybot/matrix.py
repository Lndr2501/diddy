"""Matrix transport on matrix-nio: login, E2EE, sync loop, invites, sending.

The lessons of the Diddy music bot are built in: the password is used once and the token is kept
(no new login per restart, homeservers throttle those), E2EE key upload/query/claim runs after
every sync (plain ``sync()`` does not do it), missing room keys are requested from the sender,
invites are accepted after each sync (nio fires no callback for them), handlers run as tasks so a
slow command never blocks the sync, and the first sync loads the full room state.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import quote

import nio

log = logging.getLogger("diddybot.matrix")

SYNC_TIMEOUT_MS = 30_000
CREDENTIALS_FILE = "credentials.json"


class MatrixError(RuntimeError):
    """A Matrix request failed (the message holds the server's answer)."""


class NioTransport:
    def __init__(self, bot: Any, *, homeserver: str, user_id: str, password: str = "",
                 access_token: str = "", device_id: str = "", store_path: str = "./store",
                 encryption: bool = True, device_name: str = "diddybot"):
        self.bot = bot
        self.homeserver = homeserver.rstrip("/")
        if self.homeserver and "://" not in self.homeserver:
            self.homeserver = f"https://{self.homeserver}"
        self._user = user_id
        self._password = password
        self._token = access_token
        self._device_id = device_id
        self.store_path = store_path
        self.device_name = device_name
        self.encryption = encryption and bool(getattr(nio.crypto, "ENCRYPTION_ENABLED", False))
        if encryption and not self.encryption:
            log.warning("E2EE is not available (install matrix-nio[e2e]); encrypted rooms "
                        "will not work")
        self.client: Optional[nio.AsyncClient] = None
        self._stop = asyncio.Event()
        self._key_requests: set[str] = set()
        self._joining: set[str] = set()
        self._synced = False

    # ------------------------------------------------------------------ login
    @property
    def user_id(self) -> str:
        return (self.client.user_id if self.client and self.client.user_id else self._user)

    def _new_client(self, user: str, device_id: Optional[str]) -> nio.AsyncClient:
        os.makedirs(self.store_path, exist_ok=True)
        config = nio.AsyncClientConfig(encryption_enabled=self.encryption,
                                       store_sync_tokens=True)
        client = nio.AsyncClient(self.homeserver, user, device_id=device_id or None,
                                 store_path=self.store_path, config=config)
        client.add_event_callback(self._on_event, nio.Event)
        for cb, types in self.bot._raw_event_callbacks:
            client.add_event_callback(cb, types)
        for cb, types in self.bot._raw_to_device_callbacks:
            client.add_to_device_callback(cb, types)
        return client

    def _creds_path(self) -> str:
        return os.path.join(self.store_path, CREDENTIALS_FILE)

    def _load_creds(self) -> Optional[dict]:
        try:
            with open(self._creds_path(), encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            return None
        if data.get("homeserver") != self.homeserver:
            return None
        if self._user and data.get("user_id") not in (self._user, None):
            # "bot" or "@bot:server" both name the same account; compare the localpart
            if _localpart(data.get("user_id", "")) != _localpart(self._user):
                return None
        return data

    def _save_creds(self, user_id: str, device_id: str, token: str) -> None:
        path = self._creds_path()
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"homeserver": self.homeserver, "user_id": user_id,
                       "device_id": device_id, "access_token": token}, fh)

    async def _restore(self, token: str, device_id: str = "") -> bool:
        probe = self._new_client(self._user, None)
        probe.access_token = token
        me = await probe.whoami()
        await probe.close()
        if not isinstance(me, nio.WhoamiResponse):
            log.warning("saved/given token rejected: %s", getattr(me, "message", me))
            return False
        device = device_id or me.device_id or ""
        if not device:
            raise MatrixError("the access token has no device id; set DIDDY_BOT_DEVICE")
        self.client = self._new_client(me.user_id, device)
        self.client.restore_login(me.user_id, device, token)
        log.info("logged in as %s (device %s)", me.user_id, device)
        return True

    async def login(self) -> None:
        if not self.homeserver:
            raise MatrixError("no homeserver set")
        if self._token:
            if not await self._restore(self._token, self._device_id):
                raise MatrixError("the access token is not valid")
            return
        saved = self._load_creds()
        if saved and await self._restore(saved["access_token"], saved.get("device_id", "")):
            return
        if not self._password:
            raise MatrixError("no password and no valid saved token")
        device = self._device_id or (saved or {}).get("device_id") or None
        self.client = self._new_client(self._user, device)
        resp = await self.client.login(password=self._password, device_name=self.device_name)
        if not isinstance(resp, nio.LoginResponse):
            raise MatrixError(f"login failed: {getattr(resp, 'message', resp)}")
        self._save_creds(resp.user_id, resp.device_id, resp.access_token)
        log.info("logged in as %s (new device %s, token saved in %s)", resp.user_id,
                 resp.device_id, self._creds_path())

    # ------------------------------------------------------------------ sync
    async def run(self, on_ready: Callable[[], Awaitable[None]]) -> None:
        assert self.client is not None, "login() first"
        backoff = 1
        first = True
        try:
            while not self._stop.is_set():
                sync = asyncio.ensure_future(self.client.sync(
                    timeout=0 if first else SYNC_TIMEOUT_MS, since=self.client.next_batch,
                    full_state=first, set_presence="online"))
                stop = asyncio.ensure_future(self._stop.wait())
                done, _ = await asyncio.wait({sync, stop}, return_when=asyncio.FIRST_COMPLETED)
                if stop in done:
                    sync.cancel()
                    break
                stop.cancel()
                try:
                    resp = sync.result()
                except Exception:
                    log.exception("sync failed")
                    resp = None
                if isinstance(resp, nio.SyncResponse):
                    backoff = 1
                    await self._crypto_housekeeping()
                    await self._accept_invites()
                    if first:
                        first = False
                        self._synced = True
                        await on_ready()
                else:
                    if resp is not None:
                        log.warning("sync failed: %s", getattr(resp, "message", resp))
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60)
        finally:
            await self.client.close()

    def stop(self) -> None:
        self._stop.set()

    async def _crypto_housekeeping(self) -> None:
        """What ``sync_forever`` would do: upload our keys, query and claim others' keys, send
        queued to-device messages. Without it nobody can encrypt for the bot."""
        c = self.client
        if not self.encryption or c is None or c.olm is None:
            return
        try:
            if c.should_upload_keys:
                await c.keys_upload()
            if c.should_query_keys:
                await c.keys_query()
            if c.should_claim_keys:
                await c.keys_claim(c.get_users_for_key_claiming())
            await c.send_to_device_messages()
        except Exception:
            log.exception("E2EE key upkeep failed")

    async def _accept_invites(self) -> None:
        if not self.bot.auto_join or self.client is None:
            return
        for room_id, room in list(self.client.invited_rooms.items()):
            if room_id in self._joining:
                continue
            allow = self.bot.auto_join
            if callable(allow):  # Bot(auto_join=lambda inviter, room_id: ...)
                inviter = getattr(room, "inviter", None) or ""
                try:
                    ok = bool(allow(inviter, room_id))
                except Exception:  # noqa: BLE001 - a broken filter must not stop the sync
                    log.exception("auto_join filter failed")
                    ok = False
                if not ok:
                    log.warning("invite from %s to %s declined", inviter or "?", room_id)
                    self._joining.add(room_id)
                    self.bot._spawn(self._decline(room_id))
                    continue
            self._joining.add(room_id)
            self.bot._spawn(self._join(room_id))

    async def _decline(self, room_id: str) -> None:
        try:
            await self.client.room_leave(room_id)
        except Exception:  # noqa: BLE001
            log.exception("declining %s failed", room_id)
        finally:
            self._joining.discard(room_id)

    async def _join(self, room_id: str) -> None:
        try:
            resp = await self.client.join(room_id)
            if isinstance(resp, nio.JoinResponse):
                log.info("joined %s", room_id)
                # the room shows up in client.rooms with the next sync (it returns at once)
                for _ in range(200):
                    if room_id in self.client.rooms:
                        break
                    await asyncio.sleep(0.05)
                await self.bot.handle_joined(room_id)
            else:
                log.warning("could not join %s: %s", room_id, getattr(resp, "message", resp))
        finally:
            self._joining.discard(room_id)

    # ------------------------------------------------------------------ events
    async def _on_event(self, room: nio.MatrixRoom, event: nio.Event) -> None:
        src = getattr(event, "source", None) or {}
        etype = src.get("type", "")
        sender = getattr(event, "sender", "") or src.get("sender", "")
        event_id = getattr(event, "event_id", "") or src.get("event_id", "")
        ts = getattr(event, "server_timestamp", None) or src.get("origin_server_ts")
        content = src.get("content") or {}
        if isinstance(event, nio.MegolmEvent):
            await self._request_room_key(event)
            return
        if etype == "m.room.message" and isinstance(content, dict):
            self.bot._spawn(self.bot.handle_message(room.room_id, sender, event_id, content, ts))
        elif etype == "m.room.redaction":
            redacts = src.get("redacts") or content.get("redacts")
            if redacts:
                self.bot._spawn(self.bot.handle_redaction(room.room_id, sender, event_id,
                                                          redacts, ts))
        elif etype == "m.reaction":
            rel = content.get("m.relates_to") or {}
            if rel.get("rel_type") == "m.annotation" and rel.get("key"):
                self.bot._spawn(self.bot.handle_reaction(room.room_id, sender, event_id,
                                                         rel.get("event_id", ""), rel["key"], ts))
        elif etype == "m.room.member" and self._synced:
            key = src.get("state_key", "")
            membership = content.get("membership")
            prev = getattr(event, "prev_membership", None)
            if membership == "join" and prev != "join" and key and key != self.user_id:
                self.bot._spawn(self.bot.handle_member_join(room.room_id, key))
            elif membership in ("leave", "ban") and prev == "join" and key \
                    and key != self.user_id:
                self.bot._spawn(self.bot.handle_member_leave(room.room_id, key))

    async def _request_room_key(self, event: nio.MegolmEvent) -> None:
        """Ask the sender for a missing room key (nio does not do that by itself)."""
        session_id = getattr(event, "session_id", None)
        if not session_id or session_id in self._key_requests:
            return
        self._key_requests.add(session_id)
        log.info("cannot decrypt a message from %s yet; asking for the room key", event.sender)
        try:
            resp = await self.client.to_device(
                event.as_key_request(event.sender, self.client.device_id))
            if not isinstance(resp, nio.ToDeviceResponse):
                self._key_requests.discard(session_id)
        except Exception:
            self._key_requests.discard(session_id)
            log.exception("room key request failed")

    # ------------------------------------------------------------------ rooms
    def joined_rooms(self) -> list[str]:
        return list(self.client.rooms) if self.client else []

    def _room(self, room_id: str) -> Optional[nio.MatrixRoom]:
        return self.client.rooms.get(room_id) if self.client else None

    def display_name(self, room_id: str, user_id: str) -> str:
        room = self._room(room_id)
        return room.user_name(user_id) or "" if room else ""

    def room_name(self, room_id: str) -> str:
        room = self._room(room_id)
        return room.display_name if room else room_id

    def member_count(self, room_id: str) -> int:
        room = self._room(room_id)
        if not room:
            return 0
        return len(set(room.users) | set(getattr(room, "invited_users", {})))

    def power_level(self, room_id: str, user_id: str) -> int:
        room = self._room(room_id)
        return room.power_levels.get_user_level(user_id) if room else 0

    def member_list(self, room_id: str) -> list[tuple[str, str, str]]:
        """``(user id, display name, avatar mxc)`` of everyone joined."""
        room = self._room(room_id)
        if not room:
            return []
        return [(uid, room.user_name(uid) or "", getattr(u, "avatar_url", "") or "")
                for uid, u in room.users.items()]

    def avatar_url(self, room_id: str, user_id: str) -> str:
        room = self._room(room_id)
        user = room.users.get(user_id) if room else None
        return (getattr(user, "avatar_url", "") or "") if user else ""

    def room_topic(self, room_id: str) -> str:
        room = self._room(room_id)
        return (room.topic or "") if room else ""

    def room_alias(self, room_id: str) -> str:
        room = self._room(room_id)
        return (room.canonical_alias or "") if room else ""

    def is_encrypted(self, room_id: str) -> bool:
        room = self._room(room_id)
        return bool(room and room.encrypted)

    async def set_typing(self, room_id: str, on: bool) -> None:
        await self.client.room_typing(room_id, on, timeout=30_000)

    # ------------------------------------------------------------------ sending
    async def send(self, room_id: str, etype: str, content: dict) -> str:
        if room_id not in self.client.rooms and self.encryption:
            await self._wait_room(room_id)
        resp = await self.client.room_send(room_id, etype, content,
                                           ignore_unverified_devices=True)
        if not isinstance(resp, nio.RoomSendResponse):
            raise MatrixError(f"sending {etype} to {room_id} failed: "
                              f"{getattr(resp, 'message', resp)}")
        return resp.event_id

    async def _wait_room(self, room_id: str, seconds: float = 35) -> None:
        for _ in range(int(seconds * 20)):
            if room_id in self.client.rooms:
                return
            await asyncio.sleep(0.05)
        raise MatrixError(f"the bot is not in {room_id}")

    async def redact(self, room_id: str, event_id: str, reason: str = "") -> None:
        resp = await self.client.room_redact(room_id, event_id, reason or None)
        if isinstance(resp, nio.ErrorResponse):
            raise MatrixError(f"delete failed: {resp.message}")

    async def get_state(self, room_id: str, etype: str, state_key: str) -> Optional[dict]:
        resp = await self.client.room_get_state_event(room_id, etype, state_key)
        if isinstance(resp, nio.RoomGetStateEventResponse):
            return resp.content
        return None

    async def put_state(self, room_id: str, etype: str, state_key: str, content: dict) -> bool:
        resp = await self.client.room_put_state(room_id, etype, content, state_key=state_key)
        if isinstance(resp, nio.RoomPutStateResponse):
            return True
        if getattr(resp, "status_code", "") == "M_FORBIDDEN":
            return False
        raise MatrixError(f"setting {etype} failed: {getattr(resp, 'message', resp)}")

    async def upload(self, data: bytes, mimetype: str, filename: str) -> str:
        resp, _ = await self.client.upload(io.BytesIO(data), content_type=mimetype,
                                           filename=filename, filesize=len(data))
        if not isinstance(resp, nio.UploadResponse):
            raise MatrixError(f"upload failed: {getattr(resp, 'message', resp)}")
        return resp.content_uri

    async def upload_file(self, data: bytes, mimetype: str, filename: str,
                          encrypt: bool) -> tuple[str, Optional[dict]]:
        """Upload an attachment. In encrypted rooms it is encrypted; the second value holds the
        keys for the ``file`` object of the message."""
        resp, keys = await self.client.upload(io.BytesIO(data), content_type=mimetype,
                                              filename=filename, encrypt=encrypt,
                                              filesize=len(data))
        if not isinstance(resp, nio.UploadResponse):
            raise MatrixError(f"upload failed: {getattr(resp, 'message', resp)}")
        return resp.content_uri, (keys if encrypt else None)

    async def set_profile(self, display_name: str, avatar: str) -> None:
        try:
            if display_name:
                cur = await self.client.get_displayname(self.user_id)
                if getattr(cur, "displayname", None) != display_name:
                    await self.client.set_displayname(display_name)
            if avatar:
                with open(avatar, "rb") as fh:
                    data = fh.read()
                digest = hashlib.sha256(data).hexdigest()
                mark = os.path.join(self.store_path, "avatar.sha256")
                try:
                    with open(mark, encoding="utf-8") as fh:
                        same = fh.read().strip() == digest
                except OSError:
                    same = False
                if not same:
                    import mimetypes
                    mime = mimetypes.guess_type(avatar)[0] or "image/png"
                    uri = await self.upload(data, mime, os.path.basename(avatar))
                    await self.client.set_avatar(uri)
                    with open(mark, "w", encoding="utf-8") as fh:
                        fh.write(digest)
        except Exception:
            log.exception("setting the bot profile failed")

    async def _account_data(self, etype: str) -> dict:
        path = f"/_matrix/client/v3/user/{quote(self.user_id)}/account_data/{etype}"
        resp = await self.client.send("GET", path, headers=self._auth())
        if resp.status != 200:
            return {}
        data = await resp.json()
        return data if isinstance(data, dict) else {}

    async def _set_account_data(self, etype: str, data: dict) -> None:
        path = f"/_matrix/client/v3/user/{quote(self.user_id)}/account_data/{etype}"
        resp = await self.client.send("PUT", path, json.dumps(data), headers=self._auth())
        if resp.status != 200:
            log.warning("saving %s failed: HTTP %s", etype, resp.status)

    def _auth(self) -> dict:
        return {"Authorization": f"Bearer {self.client.access_token}",
                "Content-Type": "application/json"}

    async def dm_room(self, user_id: str, name: str) -> str:
        """The private room with ``user_id`` from ``m.direct`` (like Element), or a new one."""
        direct = await self._account_data("m.direct")
        for room_id in reversed(direct.get(user_id, [])):
            room = self.client.rooms.get(room_id)
            if room is None:
                continue
            members = set(room.users) | set(getattr(room, "invited_users", {}))
            if user_id in members and members <= {user_id, self.user_id}:
                return room_id
        state = ([{"type": "m.room.encryption", "state_key": "",
                   "content": {"algorithm": "m.megolm.v1.aes-sha2"}}] if self.encryption else [])
        resp = await self.client.room_create(is_direct=True, invite=[user_id], name=name,
                                             preset=nio.RoomPreset.trusted_private_chat,
                                             initial_state=state)
        if not isinstance(resp, nio.RoomCreateResponse):
            raise MatrixError(f"could not open a DM with {user_id}: "
                              f"{getattr(resp, 'message', resp)}")
        direct.setdefault(user_id, []).append(resp.room_id)
        await self._set_account_data("m.direct", direct)
        await self._wait_room(resp.room_id)
        # Wait until the sync shows the invite: nio shares the room key only with members it
        # knows (invited ones too). Sending earlier gives the user an undecryptable message.
        for _ in range(35 * 20):
            room = self.client.rooms.get(resp.room_id)
            if room is not None and user_id in room.users:
                break
            await asyncio.sleep(0.05)
        return resp.room_id

def _localpart(user: str) -> str:
    return user.lstrip("@").split(":", 1)[0].lower()
