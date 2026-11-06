import React, { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Scroll, Switch, Text, color, config } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import { useDiddyProfile, setMyProfile } from '../../../plugins/diddy/profiles';
import {
  adoptRoomAsOptionsRoom,
  createOptionsRoom,
  useOptionsRooms,
} from '../../../plugins/diddy/optionsRoom';
import { OPTIONS_ROOM_NAME } from '../../../plugins/diddy/types';
import { uploadDiddyMedia, useMxcUrl } from '../../../plugins/diddy/media';
import {
  CardStyle,
  DiddyProfile,
  DiddyStatus,
  NAME_FONTS,
  NameEffect,
  NameStyle,
  NameplateStyle,
} from '../../../plugins/diddy/types';
import { BadgeEditor } from './BadgeEditor';
import * as css from './DiddyProfileSettings.css';

type Draft = Omit<DiddyProfile, 'v' | 'shownBadges'>;

const STATUSES: { id: DiddyStatus; label: string; color: string }[] = [
  { id: 'online', label: 'Online', color: '#3BA55D' },
  { id: 'idle', label: 'Idle', color: '#F0B232' },
  { id: 'dnd', label: 'Do not disturb', color: '#ED4245' },
  { id: 'invisible', label: 'Invisible', color: '#80848E' },
];
const statusColor = (s?: DiddyStatus) => STATUSES.find((x) => x.id === (s ?? 'online'))!.color;

const EFFECTS: NameEffect[] = ['none', 'glow', 'shadow', 'outline'];
const MAX_BIO = 160;

// JSON with sorted keys and no undefined/empty values, to compare drafts reliably
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach((k) => {
        const v = (value as Record<string, unknown>)[k];
        if (v !== undefined && v !== '') out[k] = stable(v);
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

const buildNameCss = (ns: NameStyle | undefined): CSSProperties => {
  const out: CSSProperties = {};
  if (!ns) return out;
  const font = NAME_FONTS.find((f) => f.id === ns.font);
  if (font && font.id !== 'default') out.fontFamily = font.css;
  if (ns.bold) out.fontWeight = 700;
  if (ns.italic) out.fontStyle = 'italic';
  const gradient = ns.gradient;
  const solid = gradient ? undefined : ns.color || undefined;
  const effectColor = solid ?? gradient?.from;
  if (gradient) {
    out.backgroundImage = `linear-gradient(${gradient.angle ?? 90}deg, ${gradient.from}, ${gradient.to})`;
    out.WebkitBackgroundClip = 'text';
    out.backgroundClip = 'text';
    out.color = 'transparent';
    out.WebkitTextFillColor = 'transparent';
  } else if (solid) {
    out.color = solid;
  }
  switch (ns.effect) {
    case 'glow':
      if (effectColor) {
        if (gradient) out.filter = `drop-shadow(0 0 4px ${effectColor})`;
        else out.textShadow = `0 0 8px ${effectColor}`;
      }
      break;
    case 'shadow':
      if (gradient) out.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,.6))';
      else out.textShadow = '0 2px 4px rgba(0,0,0,.6)';
      break;
    case 'outline':
      if (effectColor) {
        (out as Record<string, string>).WebkitTextStroke = `0.5px ${effectColor}`;
        if (gradient) out.WebkitTextFillColor = 'transparent';
      }
      break;
    default:
      break;
  }
  return out;
};

function PreviewName({ name, style, size }: { name: string; style?: NameStyle; size?: number }) {
  const cssProps = useMemo(() => buildNameCss(style), [style]);
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
    <Box direction="Column" gap="100">
      <Text size="L400">{title}</Text>
      {description && (
        <Text size="T200" priority="300">
          {description}
        </Text>
      )}
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
        {children}
      </SequenceCard>
    </Box>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={css.Field}>
      <Text size="T300">{label}</Text>
      <Box alignItems="Center" gap="200">
        {children}
      </Box>
    </div>
  );
}

function ColorField({
  value,
  fallback,
  onChange,
}: {
  value?: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="color"
      className={css.ColorInput}
      value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function AngleField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <>
      <input
        type="range"
        min={0}
        max={360}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 120 }}
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
      <Box alignItems="Center" gap="300">
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
        <Text size="T300">{label}</Text>
      </Box>
      <Box gap="200">
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
      </Box>
    </div>
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
  const accent = card?.accent;
  const plateColor = draft.nameplate?.color;

  const headerBg = card?.from
    ? `linear-gradient(${card.angle ?? 135}deg, ${card.from}, ${card.to ?? card.from})`
    : color.SurfaceVariant.Container;

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
          <img
            src={avatarSrc}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
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
    <Box direction="Column" gap="200">
      <Text size="L400">Preview</Text>
      <div
        className={css.Card}
        style={accent ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}55` } : undefined}
      >
        <div
          style={{
            height: 96,
            background: headerBg,
            backgroundImage: bannerUrl ? `url("${bannerUrl}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}>
          <div style={{ marginTop: -40, marginBottom: config.space.S200 }}>{avatar(80, 14)}</div>
          <PreviewName name={displayName} style={draft.nameStyle} />
          <Text size="T200" priority="300" style={{ display: 'block' }}>
            {userId}
          </Text>
          {draft.bio && (
            <Text
              size="T300"
              style={{ display: 'block', marginTop: config.space.S300, whiteSpace: 'pre-wrap' }}
            >
              {draft.bio}
            </Text>
          )}
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
              {STATUSES.find((s) => s.id === (draft.status ?? 'online'))!.label}
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

      <Text size="L400" style={{ marginTop: config.space.S200 }}>
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
              background: `linear-gradient(90deg, ${plateColor}66, ${plateColor}11)`,
            }}
          />
        )}
        {plateUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("${plateUrl}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.55,
            }}
          />
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
          {avatar(32, 8)}
          <PreviewName name={displayName} style={draft.nameStyle} size={14} />
        </div>
      </div>
    </Box>
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
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const handleCreate = async () => {
    setCreating(true);
    setSetupError(undefined);
    try {
      if (setupMode === 'existing') {
        if (!existingRoomId) throw new Error('Choose a room first.');
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
      const { nameStyle, card, nameplate, animatedAvatarMxc, status, bio, ...kept } = (stored ?? { v: 1 }) as DiddyProfile;
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
            <div className={css.Layout}>
              <div className={css.Editor}>
                {!hasOptionsRoom && (
                  <Section title="Diddy Options room">
                    <Text size="T300">
                      On a private server where everyone uses Diddy, an admin creates a hidden room
                      that Diddy uses to share profiles, badges and name styles between everyone.
                      Without it your customization cannot be saved or seen by others.
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
                            {existingRooms.map((room) => (
                              <option key={room.roomId} value={room.roomId}>
                                {room.name}
                              </option>
                            ))}
                          </select>
                        </Row>
                        <Row label="Let others find it">
                          <Switch variant="Primary" value={tagTopic} onChange={setTagTopic} />
                        </Row>
                        <Text size="T200" priority="300">
                          The room is then hidden from the room lists in Diddy. You need permission
                          to change its settings. With this switch on, [diddy-options] is added to
                          its topic so Diddy clients in the same space join it automatically.
                        </Text>
                      </>
                    )}
                    <Box alignItems="Center" gap="300">
                      <Button
                        size="300"
                        variant="Primary"
                        radii="300"
                        disabled={creating || created}
                        onClick={handleCreate}
                      >
                        <Text size="B300">
                          {creating ? 'Working...' : setupMode === 'existing' ? 'Use this room' : 'Create Diddy Options room'}
                        </Text>
                      </Button>
                      {created && (
                        <Text size="T200" style={{ color: color.Success.Main }}>
                          Room created. You can customize your profile now.
                        </Text>
                      )}
                    </Box>
                    {setupError && (
                      <Text size="T200" style={{ color: color.Critical.Main }}>
                        {setupError}
                      </Text>
                    )}
                    <Text size="T200" priority="300">
                      Not an admin? Ask the admin of your server to set it up; Diddy joins it
                      automatically.
                    </Text>
                  </Section>
                )}

                <div
                  className={css.Editor}
                  style={hasOptionsRoom ? undefined : { opacity: 0.5, pointerEvents: 'none' }}
                >
                  <Section title="Display name style">
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
                    {!gradient && (
                      <Row label="Solid color">
                        <ColorField
                          value={ns.color}
                          fallback="#ffffff"
                          onChange={(c) => patchNameStyle({ color: c })}
                        />
                        {ns.color && (
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="None"
                            radii="300"
                            onClick={() => patchNameStyle({ color: undefined })}
                          >
                            <Text size="B300">Clear</Text>
                          </Button>
                        )}
                      </Row>
                    )}
                    <SettingTile
                      title="Gradient"
                      description="Use a two-color gradient instead of a solid color."
                      after={
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
                      }
                    />
                    {gradient && (
                      <>
                        <Row label="Colors">
                          <ColorField
                            value={gradient.from}
                            fallback="#7aa2f7"
                            onChange={(c) => patchNameStyle({ gradient: { ...gradient, from: c } })}
                          />
                          <ColorField
                            value={gradient.to}
                            fallback="#c084fc"
                            onChange={(c) => patchNameStyle({ gradient: { ...gradient, to: c } })}
                          />
                        </Row>
                        <Row label="Angle">
                          <AngleField
                            value={gradient.angle ?? 90}
                            onChange={(angle) => patchNameStyle({ gradient: { ...gradient, angle } })}
                          />
                        </Row>
                      </>
                    )}
                    <Row label="Effect">
                      <select
                        className={css.Input}
                        value={ns.effect ?? 'none'}
                        onChange={(e) => patchNameStyle({ effect: e.target.value as NameEffect })}
                      >
                        {EFFECTS.map((eff) => (
                          <option key={eff} value={eff}>
                            {eff.charAt(0).toUpperCase() + eff.slice(1)}
                          </option>
                        ))}
                      </select>
                    </Row>
                    <SettingTile
                      title="Bold"
                      after={
                        <Switch
                          variant="Primary"
                          value={!!ns.bold}
                          onChange={(on) => patchNameStyle({ bold: on })}
                        />
                      }
                    />
                    <SettingTile
                      title="Italic"
                      after={
                        <Switch
                          variant="Primary"
                          value={!!ns.italic}
                          onChange={(on) => patchNameStyle({ italic: on })}
                        />
                      }
                    />
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

                  <Section title="Profile card">
                    <Row label="Header colors">
                      <ColorField
                        value={draft.card?.from}
                        fallback="#3a3f5c"
                        onChange={(c) => patchCard({ from: c, to: draft.card?.to ?? c })}
                      />
                      <ColorField
                        value={draft.card?.to}
                        fallback="#3a3f5c"
                        onChange={(c) => patchCard({ to: c, from: draft.card?.from ?? c })}
                      />
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
                      {draft.card?.accent && (
                        <Button
                          size="300"
                          variant="Secondary"
                          fill="None"
                          radii="300"
                          onClick={() => patchCard({ accent: undefined })}
                        >
                          <Text size="B300">Clear</Text>
                        </Button>
                      )}
                    </Row>
                    <UploadField
                      label="Banner (image or GIF)"
                      accept="image/*"
                      mxc={draft.card?.bannerMxc}
                      busy={busyKey === 'banner'}
                      onFile={(file) =>
                        upload('banner', file, (mxc) => patchCard({ bannerMxc: mxc }))
                      }
                      onRemove={() => patchCard({ bannerMxc: undefined })}
                    />
                    <Box direction="Column" gap="100">
                      <Box justifyContent="SpaceBetween">
                        <Text size="T300">Bio</Text>
                        <Text size="T200" priority="300">
                          {(draft.bio ?? '').length}/{MAX_BIO}
                        </Text>
                      </Box>
                      <textarea
                        className={css.Input}
                        rows={3}
                        maxLength={MAX_BIO}
                        value={draft.bio ?? ''}
                        placeholder="Tell people a bit about you"
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, bio: e.target.value.slice(0, MAX_BIO) }))
                        }
                        style={{ resize: 'vertical' }}
                      />
                    </Box>
                  </Section>

                  <Section title="Nameplate" description="Shown behind your name in member lists.">
                    <Row label="Color">
                      <ColorField
                        value={draft.nameplate?.color}
                        fallback="#7aa2f7"
                        onChange={(c) => patchPlate({ color: c })}
                      />
                      {draft.nameplate?.color && (
                        <Button
                          size="300"
                          variant="Secondary"
                          fill="None"
                          radii="300"
                          onClick={() => patchPlate({ color: undefined })}
                        >
                          <Text size="B300">Clear</Text>
                        </Button>
                      )}
                    </Row>
                    <UploadField
                      label="Image (optional)"
                      accept="image/*"
                      mxc={draft.nameplate?.imageMxc}
                      busy={busyKey === 'plate'}
                      onFile={(file) =>
                        upload('plate', file, (mxc) => patchPlate({ imageMxc: mxc }))
                      }
                      onRemove={() => patchPlate({ imageMxc: undefined })}
                    />
                  </Section>

                  <Section
                    title="Animated avatar"
                    description="Other Diddy users see this instead of your normal avatar."
                  >
                    <UploadField
                      label="GIF, WebP or PNG"
                      accept="image/gif,image/webp,image/png"
                      round
                      mxc={draft.animatedAvatarMxc}
                      busy={busyKey === 'avatar'}
                      onFile={(file) =>
                        upload('avatar', file, (mxc) =>
                          setDraft((d) => ({ ...d, animatedAvatarMxc: mxc }))
                        )
                      }
                      onRemove={() => setDraft((d) => ({ ...d, animatedAvatarMxc: undefined }))}
                    />
                  </Section>

                  <Section title="Status">
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

                  <BadgeEditor />
                </div>

                {uploadError && (
                  <Text size="T200" style={{ color: color.Critical.Main }}>
                    {uploadError}
                  </Text>
                )}

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

              <div className={css.PreviewColumn}>
                <ProfilePreview
                  userId={myId}
                  displayName={displayName}
                  avatarUrl={avatarUrl}
                  draft={draft}
                />
              </div>
            </div>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
