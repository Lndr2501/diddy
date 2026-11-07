import React, { ChangeEventHandler, useRef, useState } from 'react';
import { Box, Button, color, config, Icons, Spinner, Text } from 'folds';
import { BadgeChip } from '../../../components/diddy/BadgeChip';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  canModerateOptionsRoom,
  getPrimaryOptionsRoom,
  useOptionsRooms,
} from '../../../plugins/diddy/optionsRoom';
import {
  awardBadge,
  createCustomBadge,
  deleteBadgeDef,
  patchMyProfile,
  revokeBadge,
  useBadgeDefs,
  useDiddyProfile,
  useUserBadges,
} from '../../../plugins/diddy/profiles';
import { BadgeDef, MAX_SHOWN_BADGES } from '../../../plugins/diddy/types';
import { uploadDiddyMedia } from '../../../plugins/diddy/media';
import * as css from './DiddyProfileSettings.css';
import { Field, SettingsCard } from './ProfileSettingsUI';

const DEFAULT_BADGE_COLOR = '#7AA2F7';
const MAX_EMOJI_CODEPOINTS = 6;

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

const normalizeColor = (c?: string): string => (c ?? '').trim().toLowerCase();

function BadgeLibrary() {
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();
  const defs = useBadgeDefs(mx);
  const owned = useUserBadges(mx, myUserId);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  const optionsRoom = getPrimaryOptionsRoom(mx);
  const isModerator = !!optionsRoom && canModerateOptionsRoom(mx, optionsRoom);
  const canDelete = (badge: BadgeDef): boolean =>
    !badge.global && (badge.createdBy === myUserId || isModerator);

  const handleDelete = async (badge: BadgeDef) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete the badge "${badge.name}" for everyone?`)) return;
    setBusyId(badge.id);
    setError(undefined);
    try {
      await deleteBadgeDef(mx, badge);
    } catch (e) {
      setError(errorMessage(e, 'Failed to delete badge.'));
    } finally {
      setBusyId(undefined);
    }
  };

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
    <SettingsCard
      wide
      icon={Icons.Category}
      title="Badge library"
      description={`Built-in and community badges. You own ${owned.length} of ${defs.length}.`}
      action={
        <input
          className={css.Input}
          style={{ width: 240 }}
          value={filter}
          onChange={(evt) => setFilter(evt.target.value)}
          placeholder="Search badges"
          aria-label="Search badges"
        />
      }
    >
      {visible.length === 0 ? (
        <Text size="T200" priority="300">
          No badges match your search.
        </Text>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: config.space.S300,
            maxHeight: 440,
            overflowY: 'auto',
            padding: 2,
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
                  padding: config.space.S300,
                  borderRadius: 14,
                  background: color.Surface.Container,
                  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
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
                {canDelete(badge) && (
                  <Button
                    size="300"
                    radii="300"
                    variant="Critical"
                    fill="None"
                    disabled={busyId !== undefined}
                    onClick={() => handleDelete(badge)}
                  >
                    <Text size="B300">Delete from library</Text>
                  </Button>
                )}
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
    </SettingsCard>
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
    <SettingsCard
      icon={Icons.Star}
      title="Equipped badges"
      description={`Pick up to ${MAX_SHOWN_BADGES} badges to show next to your name. Saved right away.`}
      action={
        <Text size="T200" priority="300">
          {shownIds.length}/{MAX_SHOWN_BADGES}
        </Text>
      }
    >
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
    </SettingsCard>
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
    trimmedName.length > 0 &&
    (!!imageMxc || (trimmedEmoji.length > 0 && !emojiTooLong)) &&
    !uploading &&
    !creating;

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
    <SettingsCard
      icon={Icons.Plus}
      title="Create custom badge"
      description="A new badge for the shared library. It is given to you right away."
      action={<BadgeChip badge={preview} size={32} />}
    >
      <Field label="Name">
        <input
          className={css.Input}
          value={name}
          onChange={(evt) => setName(evt.target.value)}
          maxLength={32}
          placeholder="Badge name"
          aria-label="Badge name"
        />
      </Field>
      <Field label="Emoji or image" top>
        <Box direction="Column" gap="200" style={{ minWidth: 0 }}>
          <Box gap="200" alignItems="Center" wrap="Wrap">
            <input
              className={css.Input}
              value={emoji}
              onChange={(evt) => setEmoji(evt.target.value)}
              disabled={!!imageMxc}
              placeholder="😀"
              aria-label="Emoji"
              style={{ width: 80, textAlign: 'center' }}
            />
            <Button
              size="300"
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
                size="300"
                radii="300"
                variant="Critical"
                fill="None"
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
          <Text size="T200" priority="300">
            {imageMxc ? 'Using an uploaded image.' : 'Type an emoji, or upload an image instead.'}
          </Text>
          {emojiTooLong && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              Use a single emoji.
            </Text>
          )}
        </Box>
      </Field>
      <Field label="Color">
        <input
          type="color"
          aria-label="Badge color"
          className={css.ColorInput}
          value={badgeColor}
          onChange={(evt) => setBadgeColor(evt.target.value)}
        />
        <span className={css.HexLabel}>{badgeColor.toUpperCase()}</span>
      </Field>
      {duplicate && (
        <Box direction="Column" gap="200" alignItems="Start">
          <Text size="T200" style={{ color: color.Warning.Main }}>
            This badge already exists in the library
          </Text>
          <Box gap="200" alignItems="Center" wrap="Wrap">
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
      <Box justifyContent="End">
        <Button
          size="300"
          variant="Primary"
          radii="300"
          disabled={!canCreate || !!duplicate}
          before={creating ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined}
          onClick={handleCreate}
        >
          <Text size="B300">Create badge</Text>
        </Button>
      </Box>
    </SettingsCard>
  );
}

/** Badge cards for the "Status & badges" tab; renders straight into the tab grid. */
export function BadgeEditor() {
  const mx = useMatrixClient();
  const optionsRooms = useOptionsRooms(mx);

  if (optionsRooms.length === 0) {
    return (
      <SettingsCard
        icon={Icons.Star}
        title="Badges"
        description="Set up the Diddy Options room first."
      />
    );
  }

  return (
    <>
      <YourBadges />
      <BadgeLibrary />
      <CreateBadge />
    </>
  );
}
