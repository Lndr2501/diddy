import React, { useState } from 'react';
import classNames from 'classnames';
import { Box, Button, Icon, IconButton, IconSrc, Icons, Switch, Text, color } from 'folds';
import * as css from './DiddyProfileSettings.css';
import { DiddyProfile } from '../../../plugins/diddy/types';
import {
  ABOUT_FIELDS,
  ACTIVITY_KINDS,
  ActivityKind,
  BIG_PROFILE_AVATARS,
  BIG_PROFILE_BANNERS,
  BIG_PROFILE_LAYOUTS,
  BigProfileAvatar,
  BigProfileBanner,
  BigProfileLayout,
  BigProfileSettings,
  CARD_LAYOUTS,
  CARD_THEMES,
  CardTheme,
  CardLayout,
  CardLayoutSettings,
  CardModule,
  LAYOUT_MODULES,
  LinkKind,
  MAX_INTERESTS,
  MAX_LINKS,
  ProfileAbout,
  ProfileLink,
  guessLinkKind,
  safeLinkUrl,
} from '../../../plugins/diddy/profileExtras';
import { ACTIVITY_LABEL } from '../../../components/user-profile/ProfileModules';
import {
  ClearButton,
  Counter,
  Field,
  Hint,
  Segmented,
  SettingsCard,
  StackField,
} from './ProfileSettingsUI';
import { useTranslation } from 'react-i18next';
import { translate } from '../../../i18n';

type Draft = Omit<DiddyProfile, 'v' | 'shownBadges'>;
type PatchDraft = (fn: (d: Draft) => Draft) => void;

const ABOUT_LABEL: Record<keyof ProfileAbout, string> = {
  get pronouns() {
    return translate('settings.profileCardEditor.pronouns');
  },
  get location() {
    return translate('settings.profileCardEditor.location');
  },
  get age() {
    return translate('settings.profileCardEditor.age');
  },
  get education() {
    return translate('settings.profileCardEditor.schoolStudies');
  },
  get work() {
    return translate('settings.profileCardEditor.work');
  },
};
const ABOUT_PLACEHOLDER: Record<keyof ProfileAbout, string> = {
  pronouns: 'she/her',
  get location() {
    return translate('settings.profileCardEditor.berlin');
  },
  age: '27',
  get education() {
    return translate('settings.profileCardEditor.computerScience');
  },
  get work() {
    return translate('settings.profileCardEditor.developer');
  },
};

export function AboutEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const { t } = useTranslation();
  return (
    <SettingsCard
      icon={Icons.Info}
      title={t('settings.profileCardEditor.aboutYou')}
      description={t('settings.profileCardEditor.shortFactsShownAs')}
    >
      <div className={css.FormGrid}>
        {ABOUT_FIELDS.map((field) => (
          <StackField key={field} label={ABOUT_LABEL[field]}>
            <input
              className={css.Input}
              maxLength={field === 'age' ? 8 : 40}
              placeholder={ABOUT_PLACEHOLDER[field]}
              value={draft.about?.[field] ?? ''}
              onChange={(e) =>
                patch((d) => ({ ...d, about: { ...d.about, [field]: e.target.value } }))
              }
            />
          </StackField>
        ))}
      </div>
    </SettingsCard>
  );
}

export function InterestsEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const { t } = useTranslation();
  // the text keeps its commas while typing; the list in the draft is derived from it
  const [text, setText] = useState((draft.interests ?? []).join(', '));
  const list = draft.interests ?? [];
  return (
    <SettingsCard
      icon={Icons.Heart}
      title={t('settings.profileCardEditor.interests')}
      description={t('settings.profileCardEditor.shownAsTagsSeparate', {
        maxInterests: MAX_INTERESTS,
      })}
      action={<Counter value={list.length} max={MAX_INTERESTS} />}
    >
      <input
        className={classNames(css.Input, css.InputFull)}
        aria-label={t('settings.profileCardEditor.interests')}
        placeholder={t('settings.profileCardEditor.homelabMusicFilms')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = e.target.value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, MAX_INTERESTS);
          patch((d) => ({ ...d, interests: next.length > 0 ? next : undefined }));
        }}
      />
      {list.length > 0 && (
        <div className={css.ChipRow}>
          {list.map((tag) => (
            <span key={tag} className={css.Chip}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

const LINK_LABEL: Record<LinkKind, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  linkedin: 'LinkedIn',
  spotify: 'Spotify',
  youtube: 'YouTube',
  get web() {
    return translate('settings.profileCardEditor.website');
  },
};

export function LinksEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const { t } = useTranslation();
  const links: ProfileLink[] = draft.links ?? [];
  const setLinks = (next: ProfileLink[]) =>
    patch((d) => ({ ...d, links: next.length > 0 ? next : undefined }));
  return (
    <SettingsCard
      icon={Icons.Link}
      title={t('settings.profileCardEditor.links')}
      description={t('settings.profileCardEditor.githubGitlabLinkedinSpotify')}
      action={<Counter value={links.length} max={MAX_LINKS} />}
    >
      {links.length > 0 && (
        <div className={css.Group}>
          {links.map((link, i) => {
            const bad = link.url !== '' && !safeLinkUrl(link.kind, link.url);
            return (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className={css.GroupRow}>
                <Icon
                  size="100"
                  src={link.kind === 'web' ? Icons.Globe : Icons.Link}
                  style={{ opacity: 0.7, flexShrink: 0 }}
                />
                <Box direction="Column" grow="Yes" gap="100" style={{ minWidth: 0 }}>
                  <input
                    className={classNames(css.Input, css.InputFull)}
                    placeholder={t('settings.profileCardEditor.httpsGithubComYou')}
                    value={link.url}
                    aria-invalid={bad}
                    aria-label={t('settings.profileCardEditor.linkNumber', { number: i + 1 })}
                    onChange={(e) => {
                      const url = e.target.value;
                      setLinks(
                        links.map((l, j) => (j === i ? { kind: guessLinkKind(url), url } : l))
                      );
                    }}
                  />
                  <Hint tone={bad ? 'error' : undefined}>
                    {bad ? t('settings.profileCardEditor.notAValidHttps') : LINK_LABEL[link.kind]}
                  </Hint>
                </Box>
                <IconButton
                  size="300"
                  radii="300"
                  variant="Surface"
                  aria-label={t('settings.profileCardEditor.removeLink')}
                  onClick={() => setLinks(links.filter((_, j) => j !== i))}
                >
                  <Icon size="100" src={Icons.Cross} />
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
      {links.length < MAX_LINKS && (
        <Box>
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            radii="300"
            before={<Icon size="100" src={Icons.Plus} />}
            onClick={() => setLinks([...links, { kind: 'web', url: '' }])}
          >
            <Text size="B300">{t('settings.profileCardEditor.addLink')}</Text>
          </Button>
        </Box>
      )}
    </SettingsCard>
  );
}

export function ActivityEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const { t } = useTranslation();
  const { activity } = draft;
  const set = (next: Partial<NonNullable<Draft['activity']>>) =>
    patch((d) => ({
      ...d,
      activity: { kind: 'custom', text: '', ...d.activity, ...next },
    }));
  return (
    <SettingsCard
      icon={Icons.Play}
      title={t('settings.profileCardEditor.activity')}
      description={t('settings.profileCardEditor.whatYouAreUp')}
      action={
        activity && <ClearButton onClick={() => patch((d) => ({ ...d, activity: undefined }))} />
      }
    >
      <div className={css.FormGrid}>
        <StackField label={t('settings.profileCardEditor.kind')}>
          <select
            className={css.Input}
            value={activity?.kind ?? 'custom'}
            onChange={(e) => set({ kind: e.target.value as ActivityKind })}
          >
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_LABEL[k]}
              </option>
            ))}
          </select>
        </StackField>
        <StackField label={t('settings.profileCardEditor.text')}>
          <input
            className={css.Input}
            maxLength={60}
            placeholder={t('settings.profileCardEditor.legacy')}
            value={activity?.text ?? ''}
            onChange={(e) => set({ text: e.target.value })}
          />
        </StackField>
        <StackField label={t('settings.profileCardEditor.details')}>
          <input
            className={css.Input}
            maxLength={60}
            placeholder={t('settings.profileCardEditor.pixyUk')}
            value={activity?.detail ?? ''}
            onChange={(e) => set({ detail: e.target.value })}
          />
        </StackField>
      </div>
    </SettingsCard>
  );
}

const LAYOUT_INFO: Record<CardLayout, { label: string; text: string }> = {
  compact: {
    get label() {
      return translate('settings.profileCardEditor.compact');
    },
    get text() {
      return translate('settings.profileCardEditor.minimalSpaceSaving');
    },
  },
  standard: {
    get label() {
      return translate('settings.profileCardEditor.standard');
    },
    get text() {
      return translate('settings.profileCardEditor.balancedAndFamiliar');
    },
  },
  expanded: {
    get label() {
      return translate('settings.profileCardEditor.expanded');
    },
    get text() {
      return translate('settings.profileCardEditor.moreSpaceForDetails');
    },
  },
  tabs: {
    get label() {
      return translate('settings.profileCardEditor.tabs');
    },
    get text() {
      return translate('settings.profileCardEditor.organizedInTabs');
    },
  },
};
const BIG_LAYOUT_LABEL: Record<BigProfileLayout, string> = {
  get expanded() {
    return translate('settings.profileCardEditor.expanded');
  },
  get tabs() {
    return translate('settings.profileCardEditor.tabs');
  },
};
const BIG_BANNER_LABEL: Record<BigProfileBanner, string> = {
  get normal() {
    return translate('settings.profileCardEditor.normal');
  },
  get tall() {
    return translate('settings.profileCardEditor.tall');
  },
  get hero() {
    return translate('settings.profileCardEditor.extraTall');
  },
};
const BIG_AVATAR_LABEL: Record<BigProfileAvatar, string> = {
  get normal() {
    return translate('settings.profileCardEditor.normal');
  },
  get large() {
    return translate('settings.profileCardEditor.large');
  },
};

const MODULE_LABEL: Record<CardModule, string> = {
  get about() {
    return translate('settings.profileCardEditor.facts');
  },
  get bio() {
    return translate('settings.profileCardEditor.bio');
  },
  get activity() {
    return translate('settings.profileCardEditor.activity');
  },
  get interests() {
    return translate('settings.profileCardEditor.interests');
  },
  get links() {
    return translate('settings.profileCardEditor.links');
  },
  get sharedRooms() {
    return translate('settings.profileCardEditor.sharedRooms');
  },
};
const MODULE_ICON: Record<CardModule, IconSrc> = {
  about: Icons.Info,
  bio: Icons.Pencil,
  activity: Icons.Play,
  interests: Icons.Heart,
  links: Icons.Link,
  sharedRooms: Icons.Hash,
};

/** Little wireframe of a layout for the picker. */
function Wire({ layout }: { layout: CardLayout }) {
  const bar = (w: string, h = 4) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 2,
        background: color.SurfaceVariant.OnContainer,
        opacity: 0.3,
      }}
    />
  );
  return (
    <div className={css.LayoutWire}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
        <div
          style={{
            height: layout === 'compact' ? 12 : 22,
            borderRadius: 5,
            background: `linear-gradient(135deg, ${color.Primary.Main}, ${color.Primary.Container})`,
            opacity: 0.85,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: -2 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: color.SurfaceVariant.OnContainer,
              opacity: 0.45,
              flexShrink: 0,
            }}
          />
          {bar('50%', 6)}
        </div>
        {layout === 'tabs' && (
          <div style={{ display: 'flex', gap: 3 }}>
            <div
              style={{ width: '24%', height: 6, borderRadius: 3, background: color.Primary.Main }}
            />
            {bar('24%', 6)}
            {bar('24%', 6)}
          </div>
        )}
        {layout !== 'compact' && bar('90%')}
        {(layout === 'expanded' || layout === 'tabs') && bar('75%')}
        {layout === 'expanded' && (
          <div style={{ display: 'flex', gap: 3 }}>
            {bar('20%', 6)}
            {bar('20%', 6)}
            {bar('20%', 6)}
          </div>
        )}
        {layout === 'standard' && bar('60%')}
      </div>
    </div>
  );
}

const THEME_LABEL: Record<CardTheme, string> = {
  get auto() {
    return translate('settings.profileCardEditor.matchApp');
  },
  get light() {
    return translate('settings.profileCardEditor.light');
  },
  get dark() {
    return translate('settings.profileCardEditor.dark');
  },
};

export function LayoutEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState<CardModule>();
  const [over, setOver] = useState<CardModule>();
  const settings: CardLayoutSettings = draft.cardLayout ?? {};
  const layout: CardLayout = settings.layout ?? 'standard';
  const hidden = settings.hidden ?? [];
  const allowed = LAYOUT_MODULES[layout];
  const order = [
    ...(settings.order ?? []).filter((m) => allowed.includes(m)),
    ...allowed.filter((m) => !(settings.order ?? []).includes(m)),
  ];
  const setSettings = (next: CardLayoutSettings) => patch((d) => ({ ...d, cardLayout: next }));
  const big: BigProfileSettings = settings.big ?? {};
  // defaults are stored as "unset", so an untouched big profile keeps following the defaults
  const setBig = (change: BigProfileSettings) => {
    const next: BigProfileSettings = { ...big, ...change };
    (Object.keys(next) as (keyof BigProfileSettings)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    setSettings({ ...settings, big: Object.keys(next).length > 0 ? next : undefined });
  };
  const dropOn = (target: CardModule) => {
    setOver(undefined);
    if (!dragging || dragging === target) return;
    const next = order.filter((m) => m !== dragging);
    next.splice(next.indexOf(target), 0, dragging);
    setSettings({ ...settings, order: next });
    setDragging(undefined);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSettings({ ...settings, order: next });
  };
  return (
    <>
      <SettingsCard
        icon={Icons.Category}
        title={t('settings.profileCardEditor.layoutVariants')}
        description={t('settings.profileCardEditor.howYourProfileCard')}
      >
        <div className={css.LayoutGrid}>
          {CARD_LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              className={css.LayoutOption}
              aria-pressed={layout === l}
              onClick={() => setSettings({ ...settings, layout: l })}
            >
              {layout === l && (
                <span className={css.CheckMark} aria-hidden>
                  <Icon size="50" src={Icons.Check} />
                </span>
              )}
              <Wire layout={l} />
              <Box direction="Column" gap="100">
                <Text size="T300" style={{ fontWeight: 600 }}>
                  {LAYOUT_INFO[l].label}
                </Text>
                <Text size="T200" priority="300">
                  {LAYOUT_INFO[l].text}
                </Text>
              </Box>
            </button>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard
        icon={Icons.Sun}
        title={t('settings.profileCardEditor.look')}
        description={t('settings.profileCardEditor.colorsAndMotionOf')}
      >
        <Field label={t('settings.profileCardEditor.cardTheme')}>
          <Segmented
            label={t('settings.profileCardEditor.cardTheme')}
            value={settings.theme ?? 'auto'}
            options={CARD_THEMES.map((t) => ({ id: t, label: THEME_LABEL[t] }))}
            onChange={(t) => setSettings({ ...settings, theme: t === 'auto' ? undefined : t })}
          />
        </Field>
        <div className={css.Group}>
          <div className={css.GroupRow}>
            <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
              <Text size="T300">{t('settings.profileCardEditor.glassEffect')}</Text>
              <Text size="T200" priority="300">
                {t('settings.profileCardEditor.translucentCardWithBlur')}
              </Text>
            </Box>
            <Switch
              variant="Primary"
              value={!!settings.glass}
              onChange={(on) => setSettings({ ...settings, glass: on || undefined })}
            />
          </div>
          <div className={css.GroupRow}>
            <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
              <Text size="T300">{t('settings.profileCardEditor.calmCard')}</Text>
              <Text size="T200" priority="300">
                {t('settings.profileCardEditor.noHoverAnimations')}
              </Text>
            </Box>
            <Switch
              variant="Primary"
              value={!!settings.calm}
              onChange={(on) => setSettings({ ...settings, calm: on || undefined })}
            />
          </div>
        </div>
      </SettingsCard>
      <SettingsCard
        icon={Icons.User}
        title={t('settings.profileCardEditor.bigProfile')}
        description={t('settings.profileCardEditor.theLargeViewPeople')}
      >
        <Field label={t('settings.profileCardEditor.layout')}>
          <Segmented
            label={t('settings.profileCardEditor.bigProfileLayout')}
            value={big.layout ?? 'expanded'}
            options={BIG_PROFILE_LAYOUTS.map((l) => ({ id: l, label: BIG_LAYOUT_LABEL[l] }))}
            onChange={(l) => setBig({ layout: l === 'expanded' ? undefined : l })}
          />
        </Field>
        <Field label={t('settings.profileCardEditor.banner')}>
          <Segmented
            label={t('settings.profileCardEditor.bigProfileBanner')}
            value={big.banner ?? 'tall'}
            options={BIG_PROFILE_BANNERS.map((b) => ({ id: b, label: BIG_BANNER_LABEL[b] }))}
            onChange={(b) => setBig({ banner: b === 'tall' ? undefined : b })}
          />
        </Field>
        <Field label={t('settings.profileCardEditor.profilePicture')}>
          <Segmented
            label={t('settings.profileCardEditor.bigProfilePictureSize')}
            value={big.avatar ?? 'large'}
            options={BIG_PROFILE_AVATARS.map((a) => ({ id: a, label: BIG_AVATAR_LABEL[a] }))}
            onChange={(a) => setBig({ avatar: a === 'large' ? undefined : a })}
          />
        </Field>
      </SettingsCard>
      <SettingsCard
        icon={Icons.Sort}
        title={t('settings.profileCardEditor.modules')}
        description={t('settings.profileCardEditor.showHideAndReorder')}
        footer={
          (layout === 'compact' || layout === 'tabs') && (
            <Hint>
              {layout === 'compact'
                ? t('settings.profileCardEditor.theCompactLayoutOnly')
                : t('settings.profileCardEditor.inTheTabLayout')}
            </Hint>
          )
        }
      >
        <div className={css.Group}>
          {order.map((m, i) => (
            <div
              key={m}
              className={`${css.GroupRow} ${css.ModuleRow}`}
              draggable
              data-dragging={dragging === m}
              data-over={over === m && dragging !== m}
              onDragStart={() => setDragging(m)}
              onDragEnd={() => {
                setDragging(undefined);
                setOver(undefined);
              }}
              onDragOver={(e: React.DragEvent) => {
                e.preventDefault();
                if (over !== m) setOver(m);
              }}
              onDragLeave={() => setOver((o) => (o === m ? undefined : o))}
              onDrop={() => dropOn(m)}
            >
              <Icon size="100" src={Icons.VerticalDots} style={{ opacity: 0.4, flexShrink: 0 }} />
              <Icon size="100" src={MODULE_ICON[m]} style={{ opacity: 0.75, flexShrink: 0 }} />
              <Box grow="Yes" style={{ minWidth: 0 }}>
                <Text
                  size="T300"
                  style={hidden.includes(m) ? { opacity: 0.55 } : undefined}
                  truncate
                >
                  {MODULE_LABEL[m]}
                </Text>
              </Box>
              <IconButton
                size="300"
                radii="300"
                variant="Surface"
                aria-label={t('settings.profileCardEditor.moveUp')}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <Icon size="100" src={Icons.ArrowTop} />
              </IconButton>
              <IconButton
                size="300"
                radii="300"
                variant="Surface"
                aria-label={t('settings.profileCardEditor.moveDown')}
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon size="100" src={Icons.ArrowBottom} />
              </IconButton>
              <Switch
                variant="Primary"
                aria-label={t('settings.profileCardEditor.showValue', { value: MODULE_LABEL[m] })}
                value={!hidden.includes(m)}
                onChange={(on) =>
                  setSettings({
                    ...settings,
                    hidden: on ? hidden.filter((h) => h !== m) : [...hidden, m],
                  })
                }
              />
            </div>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}

export type EditorTab = 'identity' | 'card' | 'avatar' | 'status' | 'layout' | 'privacy';
// `short` is shown in the one-row tab strip, `label` is the accessible and hover name
const TABS: { id: EditorTab; label: string; short: string; icon: IconSrc }[] = [
  {
    id: 'identity',
    get label() {
      return translate('settings.profileCardEditor.identity');
    },
    get short() {
      return translate('settings.profileCardEditor.identity');
    },
    icon: Icons.User,
  },
  {
    id: 'card',
    get label() {
      return translate('settings.profileCardEditor.profileCard');
    },
    get short() {
      return translate('settings.profileCardEditor.card');
    },
    icon: Icons.Pencil,
  },
  {
    id: 'avatar',
    get label() {
      return translate('settings.profileCardEditor.avatarNameplate');
    },
    get short() {
      return translate('settings.profileCardEditor.avatar');
    },
    icon: Icons.Photo,
  },
  {
    id: 'status',
    get label() {
      return translate('settings.profileCardEditor.statusBadges');
    },
    get short() {
      return translate('settings.profileCardEditor.status');
    },
    icon: Icons.Star,
  },
  {
    id: 'layout',
    get label() {
      return translate('settings.profileCardEditor.layouts');
    },
    get short() {
      return translate('settings.profileCardEditor.layout');
    },
    icon: Icons.Category,
  },
  {
    id: 'privacy',
    get label() {
      return translate('settings.profileCardEditor.privacyData');
    },
    get short() {
      return translate('settings.profileCardEditor.privacy');
    },
    icon: Icons.ShieldLock,
  },
];

export function EditorTabs({
  tab,
  onChange,
  hide,
}: {
  tab: EditorTab;
  onChange: (t: EditorTab) => void;
  hide?: EditorTab[];
}) {
  const { t } = useTranslation();
  return (
    <div
      className={css.Tabs}
      role="tablist"
      aria-label={t('settings.profileCardEditor.profileSections')}
    >
      {TABS.filter((t) => !hide?.includes(t.id)).map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          className={css.Tab}
          aria-selected={tab === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => onChange(t.id)}
        >
          <span className={css.TabLabel}>{t.short}</span>
        </button>
      ))}
    </div>
  );
}
