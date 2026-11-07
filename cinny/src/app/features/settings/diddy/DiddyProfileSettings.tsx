import React, {
  PointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EventType } from 'matrix-js-sdk';
import { Box, Button, Icon, IconButton, Icons, Scroll, Switch, Text, color, config } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import { useDiddyProfile, setMyProfile, getDiddyDebugInfo } from '../../../plugins/diddy/profiles';
import {
  DiscoveredRoom,
  discoverSpaceRooms,
  looksLikeDiddyRoom,
} from '../../../plugins/diddy/discover';
import {
  addLightOptionsRoom,
  adoptRoomAsOptionsRoom,
  createOptionsRoom,
  isLightOptionsRoom,
  removeLightOptionsRoom,
  useOptionsRooms,
} from '../../../plugins/diddy/optionsRoom';
import { OPTIONS_ROOM_NAME } from '../../../plugins/diddy/types';
import { uploadDiddyMedia, useMxcUrl } from '../../../plugins/diddy/media';
import {
  CardStyle,
  DiddyProfile,
  DiddyStatus,
  ImagePos,
  NAME_FONTS,
  NameEffect,
  NameStyle,
  NameplateStyle,
} from '../../../plugins/diddy/types';
import { BadgeEditor } from './BadgeEditor';
import {
  AboutEditor,
  ActivityEditor,
  EditorTab,
  EditorTabs,
  InterestsEditor,
  LayoutEditor,
  LinksEditor,
} from './ProfileCardEditor';
import { ProfileModules } from '../../../components/user-profile/ProfileModules';
import * as css from './DiddyProfileSettings.css';
import { RangeInput } from '../../../components/diddy/RangeInput';
import { buildNameStyleCss } from '../../../components/diddy/DiddyName';
import { safeAngle, safeColor } from '../../../plugins/diddy/sanitize';
import { DEFAULT_IMAGE_POS, PositionedImg } from '../../../components/diddy/PositionedImg';

type Draft = Omit<DiddyProfile, 'v' | 'shownBadges'>;

const STATUSES: { id: DiddyStatus; label: string; color: string }[] = [
  { id: 'online', label: 'Online', color: '#3BA55D' },
  { id: 'idle', label: 'Idle', color: '#F0B232' },
  { id: 'dnd', label: 'Do not disturb', color: '#ED4245' },
  { id: 'invisible', label: 'Invisible', color: '#80848E' },
];
const statusColor = (s?: DiddyStatus) =>
  (STATUSES.find((x) => x.id === (s ?? 'online')) ?? STATUSES[0]).color;

const EFFECTS: NameEffect[] = ['none', 'glow', 'shadow', 'outline'];
const MAX_BIO = 160;

// JSON with sorted keys and without undefined / empty / "off" values, to compare drafts reliably
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach((k) => {
        const v = (value as Record<string, unknown>)[k];
        if (v === undefined || v === '' || v === false || (k === 'effect' && v === 'none')) return;
        const next = stable(v);
        if (
          next &&
          typeof next === 'object' &&
          !Array.isArray(next) &&
          Object.keys(next as object).length === 0
        ) {
          return;
        }
        out[k] = next;
      });
    return out;
  }
  return value;
};
const stableKey = (value: unknown): string => JSON.stringify(stable(value));

const toDraft = (profile: DiddyProfile | undefined): Draft => {
  if (!profile) return {};
  const { v, shownBadges, ...rest } = profile;
  return JSON.parse(JSON.stringify(rest)) as Draft;
};

// --- name style --------------------------------------------------------------------------------

function PreviewName({ name, style, size }: { name: string; style?: NameStyle; size?: number }) {
  const cssProps = useMemo(() => buildNameStyleCss(style), [style]);
  return (
    <span
      style={{
        fontSize: size ?? 20,
        fontWeight: 600,
        display: 'inline-block',
        maxWidth: '100%',
        overflowWrap: 'anywhere',
        ...cssProps,
      }}
    >
      {name}
    </span>
  );
}

// --- small building blocks ---------------------------------------------------------------------

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={css.SectionCard}>
      <div className={css.SectionHeader}>
        <Text size="H5">{title}</Text>
        {description && (
          <Text size="T200" priority="300">
            {description}
          </Text>
        )}
      </div>
      <div className={css.SectionBody}>{children}</div>
    </section>
  );
}

function Row({ label, top, children }: { label: string; top?: boolean; children: ReactNode }) {
  return (
    <div className={top ? `${css.Field} ${css.FieldTop}` : css.Field}>
      <Text size="T300" priority="300">
        {label}
      </Text>
      <div className={css.Controls}>{children}</div>
    </div>
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  value,
  fallback,
  onChange,
}: {
  value?: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const current = value && HEX_RE.test(value) ? value : fallback;
  return (
    <>
      <input
        type="color"
        className={css.ColorInput}
        value={current}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={css.HexLabel} style={value ? undefined : { opacity: 0.45 }}>
        {current.toUpperCase()}
      </span>
    </>
  );
}

function AngleField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <>
      <RangeInput
        min={0}
        max={360}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 160 }}
      />
      <Text size="T200" priority="300" style={{ width: 36, textAlign: 'right' }}>
        {value}°
      </Text>
    </>
  );
}

type UploadFieldProps = {
  label: string;
  accept: string;
  mxc?: string;
  busy: boolean;
  round?: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
};
function UploadField({ label, accept, mxc, busy, round, onFile, onRemove }: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = useMxcUrl(mxc);
  return (
    <div className={css.Field}>
      <Text size="T300" priority="300">
        {label}
      </Text>
      <div className={css.Controls} style={{ gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: round ? '50%' : 10,
            overflow: 'hidden',
            background: color.Surface.Container,
            border: `1px solid ${color.Surface.ContainerLine}`,
            flexShrink: 0,
          }}
        >
          {url && (
            <img
              src={url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Text size="B300">{busy ? 'Uploading...' : mxc ? 'Replace' : 'Upload'}</Text>
        </Button>
        {mxc && (
          <Button
            size="300"
            variant="Critical"
            fill="None"
            radii="300"
            disabled={busy}
            onClick={onRemove}
          >
            <Text size="B300">Remove</Text>
          </Button>
        )}
      </div>
    </div>
  );
}

// --- image position editor ---------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type PositionEditorProps = {
  mxc: string;
  pos?: ImagePos;
  /** frame width in px and width / height ratio of the target */
  width: number;
  ratio: number;
  round?: boolean;
  onChange: (pos: ImagePos | undefined) => void;
};
function PositionEditor({ mxc, pos, width, ratio, round, onChange }: PositionEditorProps) {
  const url = useMxcUrl(mxc);
  const frameRef = useRef<HTMLDivElement>(null);
  const natural = useRef<{ w: number; h: number }>();
  const drag = useRef<{ px: number; py: number; start: ImagePos; fw: number; fh: number }>();
  const cur = pos ?? DEFAULT_IMAGE_POS;

  // Pixels the image moves on screen per 1% of focal point change (object-position overflow plus
  // the zoom scale around the focal point), per axis.
  const perPercent = (axis: 'x' | 'y', p: ImagePos, fw: number, fh: number): number => {
    const n = natural.current;
    const box = axis === 'x' ? fw : fh;
    let overflow = 0;
    if (n && n.w > 0 && n.h > 0) {
      const scale = Math.max(fw / n.w, fh / n.h);
      overflow = (axis === 'x' ? n.w : n.h) * scale - box;
    }
    return (p.zoom * overflow + box * (p.zoom - 1)) / 100;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, start: cur, fw: rect.width, fh: rect.height };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const kx = perPercent('x', d.start, d.fw, d.fh);
    const ky = perPercent('y', d.start, d.fw, d.fh);
    // dragging right moves the image right, i.e. the visible area (focal point) to the left
    const x = kx > 0.01 ? d.start.x - (e.clientX - d.px) / kx : d.start.x;
    const y = ky > 0.01 ? d.start.y - (e.clientY - d.py) / ky : d.start.y;
    onChange({
      x: round1(clampNum(x, 0, 100)),
      y: round1(clampNum(y, 0, 100)),
      zoom: d.start.zoom,
    });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = undefined;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (!url) return null;
  return (
    <Box alignItems="Center" gap="300" wrap="Wrap">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to choose the visible part"
        style={{
          width,
          maxWidth: '100%',
          aspectRatio: String(ratio),
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
          borderRadius: round ? '50%' : 12,
          background: color.Surface.Container,
          border: `1px solid ${color.Surface.ContainerLine}`,
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <PositionedImg
          src={url}
          pos={cur}
          onLoad={(e) => {
            natural.current = {
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            };
          }}
        />
      </div>
      <Box direction="Column" gap="100" style={{ minWidth: 140, flexGrow: 1, maxWidth: 260 }}>
        <Text size="T200" priority="300">
          Position: drag the image, zoom {cur.zoom.toFixed(1)}x
        </Text>
        <RangeInput
          min={1}
          max={3}
          step={0.05}
          value={cur.zoom}
          aria-label="Zoom"
          onChange={(e) =>
            onChange({
              ...cur,
              zoom: clampNum(Math.round(Number(e.target.value) * 100) / 100, 1, 3),
            })
          }
        />
        <Box>
          <Button
            size="300"
            variant="Secondary"
            fill="None"
            radii="300"
            disabled={!pos}
            onClick={() => onChange(undefined)}
          >
            <Text size="B300">Reset</Text>
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// --- preview -----------------------------------------------------------------------------------

type PreviewProps = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  draft: Draft;
};
function ProfilePreview({ userId, displayName, avatarUrl, draft }: PreviewProps) {
  const card = draft.card;
  const bannerUrl = useMxcUrl(card?.bannerMxc);
  const animatedUrl = useMxcUrl(draft.animatedAvatarMxc);
  const plateUrl = useMxcUrl(draft.nameplate?.imageMxc);
  const avatarSrc = animatedUrl ?? avatarUrl;
  const accent = safeColor(card?.accent);
  const plateColor = safeColor(draft.nameplate?.color);

  const headerFrom = safeColor(card?.from);
  const headerTo = safeColor(card?.to);
  let headerBg: string = color.SurfaceVariant.Container;
  if (headerFrom && headerTo) {
    headerBg = `linear-gradient(${safeAngle(card?.angle, 135)}deg, ${headerFrom}, ${headerTo})`;
  } else if (headerFrom || headerTo) {
    headerBg = headerFrom ?? headerTo ?? headerBg;
  }

  const avatar = (size: number, dot: number) => (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          background: color.Secondary.Container,
          color: color.Secondary.OnContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: size / 3,
          boxSizing: 'border-box',
          border: size > 40 ? `4px solid ${color.Surface.Container}` : undefined,
        }}
      >
        {avatarSrc ? (
          <PositionedImg src={avatarSrc} pos={animatedUrl ? draft.avatarPos : undefined} />
        ) : (
          nameInitials(displayName)
        )}
      </div>
      <span
        style={{
          position: 'absolute',
          right: size > 40 ? 2 : -1,
          bottom: size > 40 ? 2 : -1,
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: statusColor(draft.status),
          border: `3px solid ${color.Surface.Container}`,
          boxSizing: 'content-box',
          opacity: draft.status === 'invisible' ? 0.7 : 1,
        }}
      />
    </div>
  );

  return (
    <section className={css.SectionCard}>
      <div className={css.SectionHeader}>
        <Text size="H5">Live preview</Text>
        <Text size="T200" priority="300">
          How your profile card and nameplate look to others.
        </Text>
      </div>
      <div
        className={css.Card}
        style={
          accent
            ? {
                borderColor: accent,
                boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 33%, transparent)`,
              }
            : undefined
        }
      >
        <div
          style={{
            height: draft.cardLayout?.layout === 'compact' ? 56 : 96,
            background: headerBg,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {bannerUrl && <PositionedImg src={bannerUrl} pos={card?.bannerPos} />}
        </div>
        <div style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}>
          <div style={{ marginTop: -40, marginBottom: config.space.S200 }}>{avatar(80, 14)}</div>
          <PreviewName name={displayName} style={draft.nameStyle} />
          <Text size="T200" priority="300" style={{ display: 'block' }}>
            {userId}
          </Text>
          <div style={{ marginTop: config.space.S300 }}>
            <ProfileModules profile={{ v: 1, ...draft }} accent={accent} />
          </div>
          <div
            style={{
              marginTop: config.space.S300,
              display: 'flex',
              alignItems: 'center',
              gap: config.space.S200,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor(draft.status),
              }}
            />
            <Text size="T200" priority="300">
              {(STATUSES.find((s) => s.id === (draft.status ?? 'online')) ?? STATUSES[0]).label}
            </Text>
          </div>
          {accent && (
            <div
              style={{
                marginTop: config.space.S300,
                padding: `${config.space.S200} ${config.space.S300}`,
                borderRadius: 10,
                background: accent,
                color: '#fff',
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 600,
                textShadow: '0 1px 2px rgba(0,0,0,.4)',
              }}
            >
              Message
            </div>
          )}
        </div>
      </div>

      <Text size="T300" priority="300">
        Nameplate
      </Text>
      <div
        className={css.Card}
        style={{ position: 'relative', padding: `${config.space.S200} ${config.space.S300}` }}
      >
        {plateColor && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(90deg, color-mix(in srgb, ${plateColor} 40%, transparent), color-mix(in srgb, ${plateColor} 7%, transparent))`,
            }}
          />
        )}
        {plateUrl && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.55 }}>
            <PositionedImg src={plateUrl} pos={draft.nameplate?.imagePos} />
          </div>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
          {avatar(32, 8)}
          <PreviewName name={displayName} style={draft.nameStyle} size={14} />
        </div>
      </div>
    </section>
  );
}

// --- debug info --------------------------------------------------------------------------------

type DebugInfo = Awaited<ReturnType<typeof getDiddyDebugInfo>>;

function DebugPanel({ mx }: { mx: Parameters<typeof getDiddyDebugInfo>[0] }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [info, setInfo] = useState<DebugInfo>();
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    Promise.resolve(getDiddyDebugInfo(mx))
      .then((result) => {
        if (alive) setInfo(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mx, open, tick]);

  return (
    <details
      className={css.Details}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <Text as="span" size="T300">
          Debug info
        </Text>
      </summary>
      <Box direction="Column" gap="200" style={{ marginTop: 8 }}>
        <Box>
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            radii="300"
            onClick={() => setTick((t) => t + 1)}
          >
            <Text size="B300">Refresh</Text>
          </Button>
        </Box>
        <div className={css.DebugScroll}>
          <table className={css.DebugTable}>
            <thead>
              <tr>
                <th>Room</th>
                <th>Mode</th>
                <th>Enc</th>
                <th>Members</th>
                <th>State ev.</th>
                <th>Msg ev.</th>
                <th>Accepted</th>
                <th>Dropped</th>
              </tr>
            </thead>
            <tbody>
              {(info?.rooms ?? []).map((r) => (
                <tr key={r.roomId} title={r.roomId}>
                  <td>{r.name}</td>
                  <td>{r.mode}</td>
                  <td>{r.encrypted ? 'yes' : 'no'}</td>
                  <td>{r.joinedMembers}</td>
                  <td>{r.stateEvents}</td>
                  <td>{r.messageEvents}</td>
                  <td>{r.profilesAccepted}</td>
                  <td>
                    {Object.entries(r.dropped)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(' ') || '-'}
                  </td>
                </tr>
              ))}
              {info && info.rooms.length === 0 && (
                <tr>
                  <td colSpan={8}>No data rooms.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Box>
    </details>
  );
}

// --- main --------------------------------------------------------------------------------------

type DiddyProfileSettingsProps = {
  requestClose: () => void;
};
export function DiddyProfileSettings({ requestClose }: DiddyProfileSettingsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const myId = mx.getSafeUserId();
  const userProfile = useUserProfile(myId);
  const displayName = userProfile.displayName ?? getMxIdLocalPart(myId) ?? myId;
  const avatarUrl = userProfile.avatarUrl
    ? mxcUrlToHttp(mx, userProfile.avatarUrl, useAuthentication, 160, 160, 'crop') ?? undefined
    : undefined;

  const optionsRooms = useOptionsRooms(mx);
  const hasOptionsRoom = optionsRooms.length > 0;
  const lightRooms = optionsRooms.filter((room) => isLightOptionsRoom(room));
  const stored = useDiddyProfile(mx, myId);

  const storedBase = useMemo(() => toDraft(stored), [stored]);
  const storedKey = stableKey(storedBase);
  const [localBase, setLocalBase] = useState<Draft>();
  const base = localBase ?? storedBase;
  const baseKey = stableKey(base);

  const [draft, setDraft] = useState<Draft>(base);
  const prevBaseKey = useRef(baseKey);
  useEffect(() => {
    const prev = prevBaseKey.current;
    prevBaseKey.current = baseKey;
    setDraft((d) => (stableKey(d) === prev ? base : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);
  useEffect(() => {
    setLocalBase(undefined);
  }, [storedKey]);

  const dirty = stableKey(draft) !== baseKey;
  const [tab, setTab] = useState<EditorTab>('identity');

  const patchNameStyle = (p: Partial<NameStyle>) =>
    setDraft((d) => ({ ...d, nameStyle: { ...d.nameStyle, ...p } }));
  const patchCard = (p: Partial<CardStyle>) =>
    setDraft((d) => ({ ...d, card: { ...d.card, ...p } }));
  const patchPlate = (p: Partial<NameplateStyle>) =>
    setDraft((d) => ({ ...d, nameplate: { ...d.nameplate, ...p } }));

  // setup
  const spaces = mx
    .getRooms()
    .filter((room) => room.isSpaceRoom() && room.getMyMembership() === 'join');
  const [spaceId, setSpaceId] = useState('');
  const [setupMode, setSetupMode] = useState<'new' | 'existing'>('new');
  const [roomName, setRoomName] = useState(OPTIONS_ROOM_NAME);
  const [existingRoomId, setExistingRoomId] = useState('');
  const [tagTopic, setTagTopic] = useState(true);
  const existingRooms = mx
    .getRooms()
    .filter((room) => !room.isSpaceRoom() && room.getMyMembership() === 'join')
    .sort((a, b) => a.name.localeCompare(b.name));
  const roomTopic = (roomId: string): string | undefined =>
    mx.getRoom(roomId)?.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent()?.topic;
  const isDiddyJoined = (roomId: string, name: string) =>
    looksLikeDiddyRoom(name, roomTopic(roomId));

  // rooms of the user's spaces (including the ones not joined yet)
  const [discovered, setDiscovered] = useState<DiscoveredRoom[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const discoverToken = useRef(0);
  const loadDiscovered = useCallback(() => {
    discoverToken.current += 1;
    const token = discoverToken.current;
    setDiscovering(true);
    discoverSpaceRooms(mx)
      .then((rooms) => {
        if (token === discoverToken.current) setDiscovered(rooms);
      })
      .catch(() => {
        if (token === discoverToken.current) setDiscovered([]);
      })
      .finally(() => {
        if (token === discoverToken.current) setDiscovering(false);
      });
  }, [mx]);
  useEffect(() => {
    if (setupMode === 'existing' && !hasOptionsRoom) loadDiscovered();
  }, [setupMode, hasOptionsRoom, loadDiscovered]);

  const unjoinedRooms = discovered
    .filter((d) => !mx.getRoom(d.roomId) || mx.getRoom(d.roomId)?.getMyMembership() !== 'join')
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedUnjoined = unjoinedRooms.find((d) => d.roomId === existingRoomId);
  const selectedJoined = existingRooms.find((room) => room.roomId === existingRoomId);
  const selectedIsDiddy = selectedUnjoined
    ? looksLikeDiddyRoom(selectedUnjoined.name, selectedUnjoined.topic)
    : selectedJoined
    ? isDiddyJoined(selectedJoined.roomId, selectedJoined.name)
    : false;

  // preselect a room that is marked as a Diddy room
  useEffect(() => {
    if (setupMode !== 'existing' || existingRoomId) return;
    const joinedHit = existingRooms.find((room) => isDiddyJoined(room.roomId, room.name));
    const hit = joinedHit
      ? joinedHit.roomId
      : unjoinedRooms.find((d) => looksLikeDiddyRoom(d.name, d.topic))?.roomId;
    if (hit) setExistingRoomId(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupMode, discovered, existingRooms.length]);

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const [lightUsed, setLightUsed] = useState(false);
  const handleUseLight = () => {
    if (!existingRoomId) return;
    addLightOptionsRoom(existingRoomId);
    setSetupError(undefined);
    setLightUsed(true);
  };
  const joinAndWait = async (roomId: string, via?: string[]) => {
    await mx.joinRoom(roomId, { viaServers: via });
    for (let i = 0; i < 20; i += 1) {
      const room = mx.getRoom(roomId);
      if (
        room?.getMyMembership() === 'join' &&
        room.currentState.getStateEvents(EventType.RoomPowerLevels, '')
      ) {
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    }
    if (mx.getRoom(roomId)?.getMyMembership() !== 'join') {
      throw new Error('Joining the room takes too long. Try again in a moment.');
    }
  };
  const handleCreate = async () => {
    setCreating(true);
    setSetupError(undefined);
    setLightUsed(false);
    try {
      if (setupMode === 'existing') {
        if (!existingRoomId) throw new Error('Choose a room first.');
        if (selectedUnjoined) await joinAndWait(existingRoomId, selectedUnjoined.via);
        await adoptRoomAsOptionsRoom(mx, existingRoomId, tagTopic);
      } else {
        await createOptionsRoom(mx, spaceId || undefined, roomName);
      }
      setCreated(true);
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Could not create the room.');
    } finally {
      setCreating(false);
    }
  };

  // uploads
  const [busyKey, setBusyKey] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();
  const upload = async (key: string, file: File, apply: (mxc: string) => void) => {
    setBusyKey(key);
    setUploadError(undefined);
    try {
      apply(await uploadDiddyMedia(mx, file));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusyKey(undefined);
    }
  };

  // save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const handleSave = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const clean = JSON.parse(JSON.stringify(draft)) as Draft;
      // keep everything the editor does not manage (shownBadges is written by BadgeEditor)
      const {
        nameStyle,
        card,
        nameplate,
        animatedAvatarMxc,
        avatarPos,
        status,
        bio,
        about,
        interests,
        links,
        activity,
        cardLayout,
        ...kept
      } = (stored ?? { v: 1 }) as DiddyProfile;
      await setMyProfile(mx, { ...kept, ...clean, v: 1 });
      setLocalBase(clean);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const ns = draft.nameStyle ?? {};
  const gradient = ns.gradient;
  const clearButton = (onClick: () => void) => (
    <Button size="300" variant="Secondary" fill="None" radii="300" onClick={onClick}>
      <Text size="B300">Clear</Text>
    </Button>
  );

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Profile
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <div className={css.Wrap}>
              <div className={css.Layout}>
                <div className={css.Editor}>
                  {/* 1. Data room */}
                  {hasOptionsRoom ? (
                    <Section
                      title="Data room"
                      description="The hidden room Diddy uses to share profiles, badges and name styles."
                    >
                      {optionsRooms.map((room) => {
                        const light = isLightOptionsRoom(room);
                        return (
                          <Box
                            key={room.roomId}
                            alignItems="Center"
                            justifyContent="SpaceBetween"
                            gap="300"
                            wrap="Wrap"
                          >
                            <Text size="T300">
                              Data room: <b>{room.name}</b> ({light ? 'message mode' : 'state mode'}
                              )
                            </Text>
                            {light && (
                              <Button
                                size="300"
                                variant="Critical"
                                fill="None"
                                radii="300"
                                onClick={() => {
                                  removeLightOptionsRoom(room.roomId);
                                  setLightUsed(false);
                                }}
                              >
                                <Text size="B300">Stop using this room</Text>
                              </Button>
                            )}
                          </Box>
                        );
                      })}
                      {lightRooms.length > 0 && (
                        <Text size="T200" priority="300">
                          Message mode (no admin rights): your profile is stored as hidden messages.
                        </Text>
                      )}
                      <DebugPanel mx={mx} />
                    </Section>
                  ) : (
                    <Section
                      title="Data room"
                      description="Set up the hidden room Diddy uses to share profiles, badges and name styles."
                    >
                      <Text size="T300">
                        On a private server where everyone uses Diddy, an admin creates a hidden
                        room that Diddy uses to share profiles, badges and name styles between
                        everyone. Without it your customization cannot be saved or seen by others.
                      </Text>
                      <Row label="Mode">
                        <select
                          className={css.Input}
                          value={setupMode}
                          onChange={(e) => setSetupMode(e.target.value as 'new' | 'existing')}
                          disabled={creating}
                        >
                          <option value="new">Create a new hidden room</option>
                          <option value="existing">Use an existing room</option>
                        </select>
                      </Row>
                      {setupMode === 'new' && (
                        <>
                          <Row label="Room name">
                            <input
                              className={css.Input}
                              value={roomName}
                              onChange={(e) => setRoomName(e.target.value)}
                              placeholder={OPTIONS_ROOM_NAME}
                              disabled={creating}
                            />
                          </Row>
                          <Row label="Create it in">
                            <select
                              className={css.Input}
                              value={spaceId}
                              onChange={(e) => setSpaceId(e.target.value)}
                              disabled={creating}
                            >
                              <option value="">No space (private room)</option>
                              {spaces.map((space) => (
                                <option key={space.roomId} value={space.roomId}>
                                  {space.name}
                                </option>
                              ))}
                            </select>
                          </Row>
                        </>
                      )}
                      {setupMode === 'existing' && (
                        <>
                          <Row label="Room">
                            <select
                              className={css.Input}
                              value={existingRoomId}
                              onChange={(e) => setExistingRoomId(e.target.value)}
                              disabled={creating}
                            >
                              <option value="">Choose a room...</option>
                              <optgroup label="Your rooms">
                                {existingRooms.map((room) => (
                                  <option key={room.roomId} value={room.roomId}>
                                    {room.name}
                                    {isDiddyJoined(room.roomId, room.name) ? ' - Diddy room' : ''}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Rooms in your spaces (not joined)">
                                {unjoinedRooms.map((d) => (
                                  <option key={d.roomId} value={d.roomId}>
                                    {d.name} ({d.spaceName})
                                    {looksLikeDiddyRoom(d.name, d.topic) ? ' - Diddy room' : ''}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            {selectedIsDiddy && <span className={css.Badge}>Diddy room</span>}
                          </Row>
                          <Row label="Spaces">
                            <Button
                              size="300"
                              variant="Secondary"
                              fill="Soft"
                              radii="300"
                              disabled={discovering || creating}
                              onClick={loadDiscovered}
                            >
                              <Text size="B300">Refresh</Text>
                            </Button>
                            {discovering && (
                              <Text size="T200" priority="300">
                                Looking in your spaces...
                              </Text>
                            )}
                            {!discovering && unjoinedRooms.length === 0 && (
                              <Text size="T200" priority="300">
                                No unjoined rooms found in your spaces.
                              </Text>
                            )}
                          </Row>
                          <Row label="Let others find it">
                            <Switch variant="Primary" value={tagTopic} onChange={setTagTopic} />
                          </Row>
                          <Text size="T200" priority="300">
                            The room is then hidden from the room lists in Diddy. You need
                            permission to change its settings. With this switch on, [diddy-options]
                            is added to its topic so Diddy clients in the same space join it
                            automatically.
                          </Text>
                          <Text size="T200" priority="300">
                            No admin rights in that room? You can still use it without them:
                            everyone who uses Diddy has to choose this same room themselves; your
                            profile is then stored as hidden messages in it.
                          </Text>
                        </>
                      )}
                      <Box alignItems="Center" gap="300" wrap="Wrap">
                        <Button
                          size="300"
                          variant="Primary"
                          radii="300"
                          disabled={creating || created}
                          onClick={handleCreate}
                        >
                          <Text size="B300">
                            {creating
                              ? 'Working...'
                              : setupMode === 'existing'
                              ? selectedUnjoined
                                ? 'Join and use'
                                : 'Use this room'
                              : 'Create Diddy Options room'}
                          </Text>
                        </Button>
                        {created && (
                          <Text size="T200" style={{ color: color.Success.Main }}>
                            Room created. You can customize your profile now.
                          </Text>
                        )}
                        {lightUsed && (
                          <Text size="T200" style={{ color: color.Success.Main }}>
                            Room is used in message mode. You can customize your profile now.
                          </Text>
                        )}
                      </Box>
                      {setupError && (
                        <Text size="T200" style={{ color: color.Critical.Main }}>
                          {setupError}
                        </Text>
                      )}
                      {setupError &&
                        setupMode === 'existing' &&
                        existingRoomId &&
                        !created &&
                        mx.getRoom(existingRoomId)?.getMyMembership() === 'join' && (
                          <Box alignItems="Center" gap="300" wrap="Wrap">
                            <Button
                              size="300"
                              variant="Secondary"
                              fill="Soft"
                              radii="300"
                              disabled={creating}
                              onClick={handleUseLight}
                            >
                              <Text size="B300">Use without admin rights</Text>
                            </Button>
                            <Text size="T200" priority="300">
                              Everyone has to choose this same room themselves.
                            </Text>
                          </Box>
                        )}
                      <Text size="T200" priority="300">
                        Not an admin? Ask the admin of your server to set it up; Diddy joins it
                        automatically.
                      </Text>
                    </Section>
                  )}

                  <div
                    className={css.Editor}
                    style={
                      hasOptionsRoom
                        ? { marginTop: 8 }
                        : { marginTop: 8, opacity: 0.5, pointerEvents: 'none' }
                    }
                    aria-disabled={!hasOptionsRoom}
                    {...(hasOptionsRoom ? {} : ({ inert: '' } as object))}
                  >
                    <EditorTabs tab={tab} onChange={setTab} />
                    {tab === 'identity' && (
                      <Section
                        title="Appearance of your name"
                        description="Font, color, effect and style of your display name."
                      >
                        <Row label="Font">
                          <select
                            className={css.Input}
                            value={ns.font ?? 'default'}
                            onChange={(e) => patchNameStyle({ font: e.target.value })}
                          >
                            {NAME_FONTS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </Row>
                        <Row label="Gradient">
                          <Switch
                            variant="Primary"
                            value={!!gradient}
                            onChange={(on) =>
                              patchNameStyle({
                                gradient: on
                                  ? { from: ns.color ?? '#7aa2f7', to: '#c084fc', angle: 90 }
                                  : undefined,
                              })
                            }
                          />
                          <Text size="T200" priority="300">
                            Two-color gradient instead of a solid color
                          </Text>
                        </Row>
                        {!gradient && (
                          <Row label="Solid color">
                            <ColorField
                              value={ns.color}
                              fallback="#ffffff"
                              onChange={(c) => patchNameStyle({ color: c })}
                            />
                            {ns.color && clearButton(() => patchNameStyle({ color: undefined }))}
                          </Row>
                        )}
                        {gradient && (
                          <>
                            <Row label="Colors">
                              <ColorField
                                value={gradient.from}
                                fallback="#7aa2f7"
                                onChange={(c) =>
                                  patchNameStyle({ gradient: { ...gradient, from: c } })
                                }
                              />
                              <ColorField
                                value={gradient.to}
                                fallback="#c084fc"
                                onChange={(c) =>
                                  patchNameStyle({ gradient: { ...gradient, to: c } })
                                }
                              />
                            </Row>
                            <Row label="Angle">
                              <AngleField
                                value={gradient.angle ?? 90}
                                onChange={(angle) =>
                                  patchNameStyle({ gradient: { ...gradient, angle } })
                                }
                              />
                            </Row>
                          </>
                        )}
                        <Row label="Effect">
                          <select
                            className={css.Input}
                            value={ns.effect ?? 'none'}
                            onChange={(e) =>
                              patchNameStyle({ effect: e.target.value as NameEffect })
                            }
                          >
                            {EFFECTS.map((eff) => (
                              <option key={eff} value={eff}>
                                {eff.charAt(0).toUpperCase() + eff.slice(1)}
                              </option>
                            ))}
                          </select>
                        </Row>
                        <Row label="Bold">
                          <Switch
                            variant="Primary"
                            value={!!ns.bold}
                            onChange={(on) => patchNameStyle({ bold: on })}
                          />
                        </Row>
                        <Row label="Italic">
                          <Switch
                            variant="Primary"
                            value={!!ns.italic}
                            onChange={(on) => patchNameStyle({ italic: on })}
                          />
                        </Row>
                        <div
                          style={{
                            padding: config.space.S400,
                            borderRadius: 12,
                            background: color.Surface.Container,
                            textAlign: 'center',
                          }}
                        >
                          <PreviewName name={displayName} style={draft.nameStyle} size={24} />
                        </div>
                      </Section>
                    )}
                    {tab === 'card' && (
                      <>
                        <Section
                          title="Profile card"
                          description="Header colors, banner and bio of your profile card."
                        >
                          <Row label="Header colors">
                            <ColorField
                              value={draft.card?.from}
                              fallback="#3a3f5c"
                              onChange={(c) => patchCard({ from: c })}
                            />
                            <ColorField
                              value={draft.card?.to}
                              fallback="#3a3f5c"
                              onChange={(c) => patchCard({ to: c })}
                            />
                            {(draft.card?.from ||
                              draft.card?.to ||
                              draft.card?.angle !== undefined) &&
                              clearButton(() =>
                                patchCard({ from: undefined, to: undefined, angle: undefined })
                              )}
                          </Row>
                          <Row label="Header angle">
                            <AngleField
                              value={draft.card?.angle ?? 135}
                              onChange={(angle) => patchCard({ angle })}
                            />
                          </Row>
                          <Row label="Accent color">
                            <ColorField
                              value={draft.card?.accent}
                              fallback="#7aa2f7"
                              onChange={(c) => patchCard({ accent: c })}
                            />
                            {draft.card?.accent &&
                              clearButton(() => patchCard({ accent: undefined }))}
                          </Row>
                          <UploadField
                            label="Banner (image or GIF)"
                            accept="image/*"
                            mxc={draft.card?.bannerMxc}
                            busy={busyKey === 'banner'}
                            onFile={(file) =>
                              upload('banner', file, (mxc) =>
                                patchCard({ bannerMxc: mxc, bannerPos: undefined })
                              )
                            }
                            onRemove={() =>
                              patchCard({ bannerMxc: undefined, bannerPos: undefined })
                            }
                          />
                          {draft.card?.bannerMxc && (
                            <Row label="Banner position" top>
                              <PositionEditor
                                mxc={draft.card.bannerMxc}
                                pos={draft.card.bannerPos}
                                width={340}
                                ratio={640 / 192}
                                onChange={(bannerPos) => patchCard({ bannerPos })}
                              />
                            </Row>
                          )}
                          <Row label="Bio" top>
                            <Box direction="Column" gap="100" style={{ width: '100%' }}>
                              <textarea
                                className={css.TextArea}
                                rows={3}
                                maxLength={MAX_BIO}
                                value={draft.bio ?? ''}
                                placeholder="Tell people a bit about you"
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, bio: e.target.value.slice(0, MAX_BIO) }))
                                }
                                style={{ resize: 'vertical' }}
                              />
                              <Text size="T200" priority="300" style={{ textAlign: 'right' }}>
                                {(draft.bio ?? '').length}/{MAX_BIO}
                              </Text>
                            </Box>
                          </Row>
                        </Section>

                        <AboutEditor draft={draft} patch={setDraft} />
                        <InterestsEditor key={baseKey} draft={draft} patch={setDraft} />
                        <LinksEditor draft={draft} patch={setDraft} />
                        <ActivityEditor draft={draft} patch={setDraft} />
                      </>
                    )}
                    {tab === 'avatar' && (
                      <Section
                        title="Avatar & nameplate"
                        description="An animated avatar and the nameplate shown behind your name in member lists."
                      >
                        <UploadField
                          label="Animated avatar (GIF, WebP or PNG)"
                          accept="image/gif,image/webp,image/png"
                          round
                          mxc={draft.animatedAvatarMxc}
                          busy={busyKey === 'avatar'}
                          onFile={(file) =>
                            upload('avatar', file, (mxc) =>
                              setDraft((d) => ({
                                ...d,
                                animatedAvatarMxc: mxc,
                                avatarPos: undefined,
                              }))
                            )
                          }
                          onRemove={() =>
                            setDraft((d) => ({
                              ...d,
                              animatedAvatarMxc: undefined,
                              avatarPos: undefined,
                            }))
                          }
                        />
                        {draft.animatedAvatarMxc && (
                          <Row label="Avatar position" top>
                            <PositionEditor
                              mxc={draft.animatedAvatarMxc}
                              pos={draft.avatarPos}
                              width={120}
                              ratio={1}
                              round
                              onChange={(avatarPos) => setDraft((d) => ({ ...d, avatarPos }))}
                            />
                          </Row>
                        )}
                        <Text size="T200" priority="300">
                          Other Diddy users see the animated avatar instead of your normal avatar.
                        </Text>
                        <Row label="Nameplate color">
                          <ColorField
                            value={draft.nameplate?.color}
                            fallback="#7aa2f7"
                            onChange={(c) => patchPlate({ color: c })}
                          />
                          {draft.nameplate?.color &&
                            clearButton(() => patchPlate({ color: undefined }))}
                        </Row>
                        <UploadField
                          label="Nameplate image (optional)"
                          accept="image/*"
                          mxc={draft.nameplate?.imageMxc}
                          busy={busyKey === 'plate'}
                          onFile={(file) =>
                            upload('plate', file, (mxc) =>
                              patchPlate({ imageMxc: mxc, imagePos: undefined })
                            )
                          }
                          onRemove={() => patchPlate({ imageMxc: undefined, imagePos: undefined })}
                        />
                        {draft.nameplate?.imageMxc && (
                          <Row label="Nameplate position" top>
                            <PositionEditor
                              mxc={draft.nameplate.imageMxc}
                              pos={draft.nameplate.imagePos}
                              width={340}
                              ratio={560 / 80}
                              onChange={(imagePos) => patchPlate({ imagePos })}
                            />
                          </Row>
                        )}
                      </Section>
                    )}
                    {tab === 'status' && (
                      <>
                        <Section title="Status" description="Shown next to your avatar.">
                          <div className={css.Segment}>
                            {STATUSES.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className={css.SegmentButton}
                                aria-pressed={(draft.status ?? 'online') === s.id}
                                onClick={() => setDraft((d) => ({ ...d, status: s.id }))}
                              >
                                <span
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: s.color,
                                  }}
                                />
                                <Text size="T300">{s.label}</Text>
                              </button>
                            ))}
                          </div>
                        </Section>

                        {/* 6. Badges */}
                        <BadgeEditor />
                      </>
                    )}
                    {tab === 'layout' && <LayoutEditor draft={draft} patch={setDraft} />}
                  </div>

                  {uploadError && (
                    <Text size="T200" style={{ color: color.Critical.Main }}>
                      {uploadError}
                    </Text>
                  )}
                </div>

                <div className={css.PreviewColumn}>
                  <ProfilePreview
                    userId={myId}
                    displayName={displayName}
                    avatarUrl={avatarUrl}
                    draft={draft}
                  />
                </div>
              </div>

              {dirty && hasOptionsRoom && (
                <div className={css.SaveBar}>
                  <Text size="T300">
                    {saveError ? (
                      <span style={{ color: color.Critical.Main }}>{saveError}</span>
                    ) : (
                      'You have unsaved changes.'
                    )}
                  </Text>
                  <Box gap="200">
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="None"
                      radii="300"
                      disabled={saving}
                      onClick={() => {
                        setDraft(base);
                        setSaveError(undefined);
                      }}
                    >
                      <Text size="B300">Reset</Text>
                    </Button>
                    <Button
                      size="300"
                      variant="Primary"
                      radii="300"
                      disabled={saving || busyKey !== undefined}
                      onClick={handleSave}
                    >
                      <Text size="B300">{saving ? 'Saving...' : 'Save changes'}</Text>
                    </Button>
                  </Box>
                </div>
              )}
            </div>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
