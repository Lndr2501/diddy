import React, { useState } from 'react';
import { Box, Button, Icon, IconButton, IconSrc, Icons, Switch, Text, color } from 'folds';
import * as css from './DiddyProfileSettings.css';
import { DiddyProfile } from '../../../plugins/diddy/types';
import {
  ABOUT_FIELDS,
  ACTIVITY_KINDS,
  ActivityKind,
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
import { Segmented, SettingsCard, StackField } from './ProfileSettingsUI';

type Draft = Omit<DiddyProfile, 'v' | 'shownBadges'>;
type PatchDraft = (fn: (d: Draft) => Draft) => void;

const ABOUT_LABEL: Record<keyof ProfileAbout, string> = {
  pronouns: 'Pronouns',
  location: 'Location',
  age: 'Age',
  education: 'School / studies',
  work: 'Work',
};
const ABOUT_PLACEHOLDER: Record<keyof ProfileAbout, string> = {
  pronouns: 'she/her',
  location: 'Berlin',
  age: '27',
  education: 'Computer science',
  work: 'Developer',
};

export function AboutEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  return (
    <SettingsCard
      icon={Icons.Info}
      title="About you"
      description="Short facts shown as chips on your card. Every field is optional."
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
  // the text keeps its commas while typing; the list in the draft is derived from it
  const [text, setText] = useState((draft.interests ?? []).join(', '));
  const list = draft.interests ?? [];
  return (
    <SettingsCard
      icon={Icons.Heart}
      title="Interests"
      description={`Shown as tags. Separate them with commas, up to ${MAX_INTERESTS}.`}
      action={
        <Text size="T200" priority="300">
          {list.length}/{MAX_INTERESTS}
        </Text>
      }
    >
      <input
        className={css.Input}
        style={{ maxWidth: '100%' }}
        placeholder="Homelab, Music, Films"
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
        <Box gap="200" wrap="Wrap">
          {list.map((tag) => (
            <span key={tag} className={css.Chip}>
              {tag}
            </span>
          ))}
        </Box>
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
  web: 'Website',
};

export function LinksEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const links: ProfileLink[] = draft.links ?? [];
  const setLinks = (next: ProfileLink[]) =>
    patch((d) => ({ ...d, links: next.length > 0 ? next : undefined }));
  return (
    <SettingsCard
      icon={Icons.Link}
      title="Links"
      description="GitHub, GitLab, LinkedIn, Spotify, YouTube or your own website. Only https addresses."
      action={
        <Text size="T200" priority="300">
          {links.length}/{MAX_LINKS}
        </Text>
      }
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
                    className={css.Input}
                    style={{ maxWidth: '100%' }}
                    placeholder="https://github.com/you"
                    value={link.url}
                    aria-invalid={bad}
                    aria-label={`Link ${i + 1}`}
                    onChange={(e) => {
                      const url = e.target.value;
                      setLinks(
                        links.map((l, j) => (j === i ? { kind: guessLinkKind(url), url } : l))
                      );
                    }}
                  />
                  <Text
                    size="T200"
                    priority="300"
                    style={bad ? { color: color.Critical.Main } : undefined}
                  >
                    {bad ? 'Not a valid https address' : LINK_LABEL[link.kind]}
                  </Text>
                </Box>
                <IconButton
                  size="300"
                  radii="300"
                  variant="Surface"
                  aria-label="Remove link"
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
            <Text size="B300">Add link</Text>
          </Button>
        </Box>
      )}
    </SettingsCard>
  );
}

export function ActivityEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const { activity } = draft;
  const set = (next: Partial<NonNullable<Draft['activity']>>) =>
    patch((d) => ({
      ...d,
      activity: { kind: 'custom', text: '', ...d.activity, ...next },
    }));
  return (
    <SettingsCard
      icon={Icons.Play}
      title="Activity"
      description="What you are up to, typed in by hand. Diddy does not read it from other apps."
      action={
        activity && (
          <Button
            size="300"
            variant="Secondary"
            fill="None"
            radii="300"
            onClick={() => patch((d) => ({ ...d, activity: undefined }))}
          >
            <Text size="B300">Clear</Text>
          </Button>
        )
      }
    >
      <div className={css.FormGrid}>
        <StackField label="Kind">
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
        <StackField label="Text">
          <input
            className={css.Input}
            maxLength={60}
            placeholder="Legacy"
            value={activity?.text ?? ''}
            onChange={(e) => set({ text: e.target.value })}
          />
        </StackField>
        <StackField label="Details">
          <input
            className={css.Input}
            maxLength={60}
            placeholder="PIXY (UK)"
            value={activity?.detail ?? ''}
            onChange={(e) => set({ detail: e.target.value })}
          />
        </StackField>
      </div>
    </SettingsCard>
  );
}

const LAYOUT_INFO: Record<CardLayout, { label: string; text: string }> = {
  compact: { label: 'Compact', text: 'Minimal, space-saving.' },
  standard: { label: 'Standard', text: 'Balanced and familiar.' },
  expanded: { label: 'Expanded', text: 'More space for details.' },
  tabs: { label: 'Tabs', text: 'Organized in tabs.' },
};
const MODULE_LABEL: Record<CardModule, string> = {
  about: 'Facts',
  bio: 'Bio',
  activity: 'Activity',
  interests: 'Interests',
  links: 'Links',
  sharedRooms: 'Shared rooms',
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
  auto: 'Match app',
  light: 'Light',
  dark: 'Dark',
};

export function LayoutEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
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
        wide
        icon={Icons.Category}
        title="Layout variants"
        description="Choose how your profile card is shown to others. The live preview updates right away."
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
        title="Look"
        description="Colors and motion of your card, the same for everyone who opens it."
      >
        <Box direction="Column" gap="200">
          <Text size="T300" priority="300">
            Card theme
          </Text>
          <Segmented
            label="Card theme"
            value={settings.theme ?? 'auto'}
            options={CARD_THEMES.map((t) => ({ id: t, label: THEME_LABEL[t] }))}
            onChange={(t) => setSettings({ ...settings, theme: t === 'auto' ? undefined : t })}
          />
        </Box>
        <div className={css.Group}>
          <div className={css.GroupRow}>
            <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
              <Text size="T300">Glass effect</Text>
              <Text size="T200" priority="300">
                Translucent card with blur
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
              <Text size="T300">Calm card</Text>
              <Text size="T200" priority="300">
                No hover animations
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
        icon={Icons.Sort}
        title="Modules"
        description="Show, hide and reorder the parts of your card. Drag a row or use the arrows."
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
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <Icon size="100" src={Icons.ArrowTop} />
              </IconButton>
              <IconButton
                size="300"
                radii="300"
                variant="Surface"
                aria-label="Move down"
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon size="100" src={Icons.ArrowBottom} />
              </IconButton>
              <Switch
                variant="Primary"
                aria-label={`Show ${MODULE_LABEL[m]}`}
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
        {layout === 'compact' && (
          <Text size="T200" priority="300">
            The compact layout only shows the bio. Pick another layout for more modules.
          </Text>
        )}
        {layout === 'tabs' && (
          <Text size="T200" priority="300">
            In the tab layout the modules are grouped into tabs; the order applies inside a tab.
          </Text>
        )}
      </SettingsCard>
    </>
  );
}

export type EditorTab = 'identity' | 'card' | 'avatar' | 'status' | 'layout' | 'privacy';
const TABS: { id: EditorTab; label: string; icon: IconSrc }[] = [
  { id: 'identity', label: 'Identity', icon: Icons.User },
  { id: 'card', label: 'Profile card', icon: Icons.Pencil },
  { id: 'avatar', label: 'Avatar & nameplate', icon: Icons.Photo },
  { id: 'status', label: 'Status & badges', icon: Icons.Star },
  { id: 'layout', label: 'Layouts', icon: Icons.Category },
  { id: 'privacy', label: 'Privacy & data', icon: Icons.ShieldLock },
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
  return (
    <div className={css.Tabs} role="tablist" aria-label="Profile sections">
      {TABS.filter((t) => !hide?.includes(t.id)).map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          className={css.Tab}
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
        >
          <Icon size="100" src={t.icon} filled={tab === t.id} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
