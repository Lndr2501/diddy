import React, { ChangeEventHandler, useRef, useState } from 'react';
import classNames from 'classnames';
import { Box, Button, color, config, Icons, Spinner, Text, toRem } from 'folds';
import { BadgeChip } from '../../../components/diddy/BadgeChip';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useOptionsRooms } from '../../../plugins/diddy/optionsRoom';
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
import { ColorField, Counter, Field, Hint, SettingsCard } from './ProfileSettingsUI';
import { SPACE } from './editorSpace';
import { RADIUS_ROW } from '../../../components/sidebar/diddyTokens';
import { useTranslation } from 'react-i18next';

const DEFAULT_BADGE_COLOR = '#7AA2F7';
const MAX_EMOJI_CODEPOINTS = 6;

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

const normalizeColor = (c?: string): string => (c ?? '').trim().toLowerCase();

function BadgeLibrary() {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();
  const defs = useBadgeDefs(mx);
  const owned = useUserBadges(mx, myUserId);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  // two-step delete without window.confirm (not reliable inside the app's webview)
  const [confirmId, setConfirmId] = useState<string>();

  const canDelete = (badge: BadgeDef): boolean => !badge.global && badge.createdBy === myUserId;

  const handleDelete = async (badge: BadgeDef) => {
    setConfirmId(undefined);
    setBusyId(badge.id);
    setError(undefined);
    try {
      await deleteBadgeDef(mx, badge);
    } catch (e) {
      setError(errorMessage(e, t('settings.badgeEditor.failedToDeleteBadge')));
    } finally {
      setBusyId(undefined);
    }
  };

  const ownedIds = new Set(owned.map((b) => b.id));
  const query = filter.trim().toLowerCase();
  const visible = query ? defs.filter((b) => b.name.toLowerCase().includes(query)) : defs;

  const authorLabel = (badge: BadgeDef): string => {
    if (badge.global) return t('settings.badgeEditor.builtIn');
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
      setError(errorMessage(e, t('settings.badgeEditor.failedToUpdateBadge')));
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <SettingsCard
      icon={Icons.Category}
      title={t('settings.badgeEditor.badgeLibrary')}
      description={t('settings.badgeEditor.builtInAndCommunity', { count: owned.length, count2: defs.length })}
      footer={error && <Hint tone="error">{error}</Hint>}
    >
      <input
        className={classNames(css.Input, css.InputFull)}
        value={filter}
        onChange={(evt) => setFilter(evt.target.value)}
        placeholder={t('settings.badgeEditor.searchBadges')}
        aria-label={t('settings.badgeEditor.searchBadges')}
      />
      {visible.length === 0 ? (
        <Hint>{t('settings.badgeEditor.noBadgesMatchYour')}</Hint>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: SPACE.md,
            maxHeight: 440,
            overflowY: 'auto',
            padding: toRem(2),
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
                  padding: SPACE.md,
                  borderRadius: RADIUS_ROW,
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
                  <Text size="B300">{isOwned ? t('settings.badgeEditor.remove') : t('settings.badgeEditor.addToMe')}</Text>
                </Button>
                {canDelete(badge) && (
                  <Button
                    size="300"
                    radii="300"
                    variant="Critical"
                    fill="None"
                    disabled={busyId !== undefined}
                    onClick={() =>
                      confirmId === badge.id ? handleDelete(badge) : setConfirmId(badge.id)
                    }
                    onBlur={() => setConfirmId((id) => (id === badge.id ? undefined : id))}
                  >
                    <Text size="B300">
                      {confirmId === badge.id
                        ? t('settings.badgeEditor.reallyDeleteForEveryone')
                        : t('settings.badgeEditor.deleteFromLibrary')}
                    </Text>
                  </Button>
                )}
              </Box>
            );
          })}
        </div>
      )}
    </SettingsCard>
  );
}

function YourBadges() {
  const { t } = useTranslation();
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
      setError(errorMessage(e, t('settings.badgeEditor.failedToSaveShown')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={Icons.Star}
      title={t('settings.badgeEditor.equippedBadges')}
      description={t('settings.badgeEditor.pickUpToMaxshownbadges', { maxShownBadges: MAX_SHOWN_BADGES })}
      action={<Counter value={shownIds.length} max={MAX_SHOWN_BADGES} />}
      footer={error && <Hint tone="error">{error}</Hint>}
    >
      {owned.length === 0 ? (
        <Hint>
          {t('settings.badgeEditor.youDoNotHave')}
        </Hint>
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
    </SettingsCard>
  );
}

function CreateBadge() {
  const { t } = useTranslation();
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
    name: trimmedName || t('settings.badgeEditor.preview'),
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
      setError(t('settings.badgeEditor.pleaseChooseAnImage'));
      return;
    }
    setUploading(true);
    setError(undefined);
    try {
      setImageMxc(await uploadDiddyMedia(mx, file));
    } catch (e) {
      setError(errorMessage(e, t('settings.badgeEditor.failedToUploadImage')));
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
      setError(errorMessage(e, t('settings.badgeEditor.failedToAddBadge')));
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
      setError(errorMessage(e, t('settings.badgeEditor.failedToCreateBadge')));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SettingsCard
      icon={Icons.Plus}
      title={t('settings.badgeEditor.createCustomBadge')}
      description={t('settings.badgeEditor.aNewBadgeFor')}
      action={<BadgeChip badge={preview} size={32} />}
    >
      <Field label={t('settings.badgeEditor.name')}>
        <input
          className={css.Input}
          value={name}
          onChange={(evt) => setName(evt.target.value)}
          maxLength={32}
          placeholder={t('settings.badgeEditor.badgeName')}
          aria-label={t('settings.badgeEditor.badgeName')}
        />
      </Field>
      <Field
        label={t('settings.badgeEditor.emojiOrImage')}
        top
        hint={imageMxc ? t('settings.badgeEditor.usingAnUploadedImage') : t('settings.badgeEditor.typeAnEmojiOr')}
      >
        <Box direction="Column" gap="200" style={{ minWidth: 0 }}>
          <Box gap="200" alignItems="Center" wrap="Wrap">
            <input
              className={css.Input}
              value={emoji}
              onChange={(evt) => setEmoji(evt.target.value)}
              disabled={!!imageMxc}
              placeholder="😀"
              aria-label={t('settings.badgeEditor.emoji')}
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
              <Text size="B300">{t('settings.badgeEditor.uploadImage')}</Text>
            </Button>
            {imageMxc && (
              <Button
                size="300"
                radii="300"
                variant="Critical"
                fill="None"
                onClick={() => setImageMxc(undefined)}
              >
                <Text size="B300">{t('settings.badgeEditor.removeImage')}</Text>
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
          {emojiTooLong && <Hint tone="error">{t('settings.badgeEditor.useASingleEmoji')}</Hint>}
        </Box>
      </Field>
      <Field label={t('settings.badgeEditor.color')}>
        <ColorField
          label={t('settings.badgeEditor.badgeColor')}
          value={badgeColor}
          fallback={DEFAULT_BADGE_COLOR}
          onChange={setBadgeColor}
        />
      </Field>
      {duplicate && (
        <Box direction="Column" gap="200" alignItems="Start">
          <Text size="T200" style={{ color: color.Warning.Main }}>
            {t('settings.badgeEditor.thisBadgeAlreadyExists')}
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
              <Text size="B300">{t('settings.badgeEditor.useTheExistingBadge')}</Text>
            </Button>
          </Box>
        </Box>
      )}
      {error && <Hint tone="error">{error}</Hint>}
      <Box justifyContent="End">
        <Button
          size="300"
          variant="Primary"
          radii="300"
          disabled={!canCreate || !!duplicate}
          before={creating ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined}
          onClick={handleCreate}
        >
          <Text size="B300">{t('settings.badgeEditor.createBadge')}</Text>
        </Button>
      </Box>
    </SettingsCard>
  );
}

/** Badge cards for the "Status & badges" tab; renders straight into the tab grid. */
export function BadgeEditor() {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const optionsRooms = useOptionsRooms(mx);

  if (optionsRooms.length === 0) {
    return (
      <SettingsCard
        icon={Icons.Star}
        title={t('settings.badgeEditor.badges')}
        description={t('settings.badgeEditor.setUpTheDiddy')}
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
