import React, { ChangeEventHandler, useRef, useState } from 'react';
import { Box, Button, color, config, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { BadgeChip } from '../../../components/diddy/BadgeChip';
import { AwardBadgeButton } from '../../../components/diddy/AwardBadgeMenu';
import { SequenceCardStyle } from '../styles.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useOptionsRooms } from '../../../plugins/diddy/optionsRoom';
import {
  awardBadge,
  createCustomBadge,
  patchMyProfile,
  revokeBadge,
  useBadgeDefs,
  useDiddyProfile,
  useUserBadges,
} from '../../../plugins/diddy/profiles';
import { BadgeDef, MAX_SHOWN_BADGES } from '../../../plugins/diddy/types';
import { uploadDiddyMedia } from '../../../plugins/diddy/media';

const USER_ID_REGEX = /^@[^\s:]+:[^\s]+$/;
const DEFAULT_BADGE_COLOR = '#7AA2F7';
const MAX_EMOJI_CODEPOINTS = 6;

const errorMessage = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

const normalizeColor = (c?: string): string => (c ?? '').trim().toLowerCase();

function BadgeLibrary() {
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();
  const defs = useBadgeDefs(mx);
  const owned = useUserBadges(mx, myUserId);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  const ownedIds = new Set(owned.map((b) => b.id));
  const query = filter.trim().toLowerCase();
  const visible = query ? defs.filter((b) => b.name.toLowerCase().includes(query)) : defs;

  const authorLabel = (badge: BadgeDef): string => {
    if (badge.global) return 'Built-in';
    if (!badge.createdBy) return 'by unknown';
    const displayName = mx.getUser(badge.createdBy)?.displayName;
    const localpart = badge.createdBy.replace(/^@/, '').split(':')[0];
    return `by ${displayName || localpart || badge.createdBy}`;
  };

  const handleToggle = async (badge: BadgeDef) => {
    setBusyId(badge.id);
    setError(undefined);
    try {
      if (ownedIds.has(badge.id)) await revokeBadge(mx, badge.id, myUserId);
      else await awardBadge(mx, badge.id, myUserId);
    } catch (e) {
      setError(errorMessage(e, 'Failed to update badge.'));
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Badge library</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="300">
        <SettingTile
          title="Browse all badges"
          description={`Built-in and community badges. You own ${owned.length} of ${defs.length}.`}
        >
          <Input
            value={filter}
            onChange={(evt) => setFilter((evt.target as HTMLInputElement).value)}
            placeholder="Search badges"
            aria-label="Search badges"
            variant="Secondary"
            radii="300"
            size="400"
            style={{ width: '100%' }}
          />
        </SettingTile>
        {visible.length === 0 ? (
          <Text size="T200" priority="300">
            No badges match your search.
          </Text>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: config.space.S200,
              maxHeight: 360,
              overflowY: 'auto',
            }}
          >
            {visible.map((badge) => {
              const isOwned = ownedIds.has(badge.id);
              return (
                <Box
                  key={badge.id}
                  direction="Column"
                  gap="200"
                  style={{
                    padding: config.space.S200,
                    borderRadius: config.radii.R400,
                    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
                  }}
                >
                  <Box gap="200" alignItems="Center">
                    <BadgeChip badge={badge} size={28} />
                    <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
                      <Text size="T300" truncate>
                        {badge.name}
                      </Text>
                      <Text size="T200" priority="300" truncate>
                        {authorLabel(badge)}
                      </Text>
                    </Box>
                  </Box>
                  <Button
                    size="300"
                    radii="300"
                    variant={isOwned ? 'Critical' : 'Primary'}
                    fill="Soft"
                    disabled={busyId !== undefined}
                    before={
                      busyId === badge.id ? (
                        <Spinner size="100" variant={isOwned ? 'Critical' : 'Primary'} />
                      ) : undefined
                    }
                    onClick={() => handleToggle(badge)}
                  >
                    <Text size="B300">{isOwned ? 'Remove' : 'Add to me'}</Text>
                  </Button>
                </Box>
              );
            })}
          </div>
        )}
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        )}
      </SequenceCard>
    </Box>
  );
}

function YourBadges() {
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();
  const owned = useUserBadges(mx, myUserId);
  const profile = useDiddyProfile(mx, myUserId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const shownIds = (profile?.shownBadges ?? []).filter((id) => owned.some((b) => b.id === id));

  const handleToggle = async (badge: BadgeDef) => {
    const isShown = shownIds.includes(badge.id);
    if (!isShown && shownIds.length >= MAX_SHOWN_BADGES) return;
    const next = isShown ? shownIds.filter((id) => id !== badge.id) : [...shownIds, badge.id];
    setSaving(true);
    setError(undefined);
    try {
      await patchMyProfile(mx, { shownBadges: next });
    } catch (e) {
      setError(errorMessage(e, 'Failed to save shown badges.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Your badges</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="300">
        <SettingTile
          title="Shown badges"
          description={`Pick up to ${MAX_SHOWN_BADGES} badges to show next to your name (${shownIds.length}/${MAX_SHOWN_BADGES}).`}
        />
        {owned.length === 0 ? (
          <Text size="T200" priority="300">
            You do not have any badges yet. Create one below or ask someone to give you one.
          </Text>
        ) : (
          <Box gap="200" wrap="Wrap">
            {owned.map((badge) => {
              const selected = shownIds.includes(badge.id);
              const full = !selected && shownIds.length >= MAX_SHOWN_BADGES;
              return (
                <Button
                  key={badge.id}
                  size="300"
                  radii="300"
                  variant={selected ? 'Primary' : 'Secondary'}
                  fill={selected ? 'Soft' : 'None'}
                  outlined={!selected}
                  aria-pressed={selected}
                  disabled={saving || full}
                  before={<BadgeChip badge={badge} size={18} />}
                  onClick={() => handleToggle(badge)}
                >
                  <Text size="B300">{badge.name}</Text>
                </Button>
              );
            })}
          </Box>
        )}
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        )}
      </SequenceCard>
    </Box>
  );
}

function CreateBadge() {
  const mx = useMatrixClient();
  const defs = useBadgeDefs(mx);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [imageMxc, setImageMxc] = useState<string>();
  const [badgeColor, setBadgeColor] = useState(DEFAULT_BADGE_COLOR);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  const trimmedName = name.trim();
  const trimmedEmoji = emoji.trim();
  const emojiTooLong = Array.from(trimmedEmoji).length > MAX_EMOJI_CODEPOINTS;
  const canCreate =
    trimmedName.length > 0 && (!!imageMxc || (trimmedEmoji.length > 0 && !emojiTooLong)) && !uploading && !creating;

  const preview: BadgeDef = {
    id: 'preview',
    name: trimmedName || 'Preview',
    emoji: imageMxc ? undefined : trimmedEmoji || '❔',
    imageMxc,
    color: badgeColor,
  };

  const handleFile: ChangeEventHandler<HTMLInputElement> = async (evt) => {
    const file = evt.target.files?.[0];
    // eslint-disable-next-line no-param-reassign
    evt.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setUploading(true);
    setError(undefined);
    try {
      setImageMxc(await uploadDiddyMedia(mx, file));
    } catch (e) {
      setError(errorMessage(e, 'Failed to upload image.'));
    } finally {
      setUploading(false);
    }
  };

  const duplicate = defs.find((d) => {
    if (trimmedName && d.name.trim().toLowerCase() === trimmedName.toLowerCase()) return true;
    return (
      !imageMxc &&
      trimmedEmoji.length > 0 &&
      d.emoji === trimmedEmoji &&
      normalizeColor(d.color) === normalizeColor(badgeColor)
    );
  });

  const handleUseExisting = async () => {
    if (!duplicate || creating) return;
    setCreating(true);
    setError(undefined);
    try {
      await awardBadge(mx, duplicate.id, mx.getSafeUserId());
      setName('');
      setEmoji('');
      setImageMxc(undefined);
    } catch (e) {
      setError(errorMessage(e, 'Failed to add badge.'));
    } finally {
      setCreating(false);
    }
  };

  const handleCreate = async () => {
    if (!canCreate || duplicate) return;
    setCreating(true);
    setError(undefined);
    try {
      const id = await createCustomBadge(mx, {
        name: trimmedName,
        color: badgeColor,
        ...(imageMxc ? { imageMxc } : { emoji: trimmedEmoji }),
      });
      await awardBadge(mx, id, mx.getSafeUserId());
      setName('');
      setEmoji('');
      setImageMxc(undefined);
    } catch (e) {
      setError(errorMessage(e, 'Failed to create badge.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Create custom badge</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
        <SettingTile title="Name" description="Shown when hovering the badge.">
          <Input
            value={name}
            onChange={(evt) => setName((evt.target as HTMLInputElement).value)}
            maxLength={32}
            placeholder="Badge name"
            variant="Secondary"
            radii="300"
            size="400"
          />
        </SettingTile>
        <SettingTile
          title="Emoji or image"
          description={imageMxc ? 'Using an uploaded image.' : 'Type an emoji, or upload an image instead.'}
        >
          <Box gap="200" alignItems="Center" wrap="Wrap">
            <Input
              value={emoji}
              onChange={(evt) => setEmoji((evt.target as HTMLInputElement).value)}
              disabled={!!imageMxc}
              placeholder="😀"
              aria-label="Emoji"
              variant="Secondary"
              radii="300"
              size="400"
              style={{ width: 96 }}
            />
            <Button
              size="400"
              radii="300"
              variant="Secondary"
              fill="Soft"
              disabled={uploading}
              before={uploading ? <Spinner size="100" variant="Secondary" /> : undefined}
              onClick={() => fileRef.current?.click()}
            >
              <Text size="B300">Upload image</Text>
            </Button>
            {imageMxc && (
              <Button
                size="400"
                radii="300"
                variant="Critical"
                fill="Soft"
                onClick={() => setImageMxc(undefined)}
              >
                <Text size="B300">Remove image</Text>
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </Box>
          {emojiTooLong && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              Use a single emoji.
            </Text>
          )}
        </SettingTile>
        <SettingTile
          title="Color"
          after={
            <input
              type="color"
              aria-label="Badge color"
              value={badgeColor}
              onChange={(evt) => setBadgeColor(evt.target.value)}
              style={{ width: 40, height: 28, padding: 0, border: 'none', background: 'none' }}
            />
          }
        />
        <SettingTile
          title="Preview"
          after={<BadgeChip badge={preview} size={32} />}
        />
        {duplicate && (
          <Box direction="Column" gap="200" alignItems="Start">
            <Text size="T200" style={{ color: color.Warning.Main }}>
              This badge already exists in the library
            </Text>
            <Box gap="200" alignItems="Center">
              <BadgeChip badge={duplicate} size={24} />
              <Text size="T200" priority="300">
                {duplicate.name}
              </Text>
              <Button
                size="300"
                variant="Secondary"
                fill="Soft"
                radii="300"
                disabled={creating}
                before={creating ? <Spinner size="100" variant="Secondary" /> : undefined}
                onClick={handleUseExisting}
              >
                <Text size="B300">Use the existing badge</Text>
              </Button>
            </Box>
          </Box>
        )}
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        )}
        <Box>
          <Button
            size="300"
            variant="Primary"
            radii="300"
            disabled={!canCreate || !!duplicate}
            before={creating ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined}
            onClick={handleCreate}
          >
            <Text size="B300">Create</Text>
          </Button>
        </Box>
      </SequenceCard>
    </Box>
  );
}

function GiveBadge() {
  const [userId, setUserId] = useState('');
  const trimmed = userId.trim();
  const valid = USER_ID_REGEX.test(trimmed);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Give a badge</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="300">
        <SettingTile
          title="User"
          description="Enter a user id like @name:server, then pick the badges to give or remove."
        >
          <Box gap="200" alignItems="Center">
            <Box grow="Yes">
              <Input
                value={userId}
                onChange={(evt) => setUserId((evt.target as HTMLInputElement).value)}
                placeholder="@name:server"
                variant="Secondary"
                radii="300"
                size="400"
                style={{ width: '100%' }}
              />
            </Box>
            {valid && <AwardBadgeButton userId={trimmed} />}
          </Box>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}

export function BadgeEditor() {
  const mx = useMatrixClient();
  const optionsRooms = useOptionsRooms(mx);

  if (optionsRooms.length === 0) {
    return (
      <Box direction="Column" gap="100">
        <Text size="L400">Badges</Text>
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <Text size="T300" priority="300">
            Set up the Diddy Options room first
          </Text>
        </SequenceCard>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="400">
      <YourBadges />
      <BadgeLibrary />
      <CreateBadge />
      <GiveBadge />
    </Box>
  );
}
