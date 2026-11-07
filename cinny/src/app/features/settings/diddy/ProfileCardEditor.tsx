import React, { ReactNode, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Switch, Text, color } from 'folds';
import * as css from './DiddyProfileSettings.css';
import { DiddyProfile } from '../../../plugins/diddy/types';
import {
  ABOUT_FIELDS,
  ACTIVITY_KINDS,
  ActivityKind,
  CARD_LAYOUTS,
  CardLayout,
  CardLayoutSettings,
  CardModule,
  LAYOUT_MODULES,
  MAX_INTERESTS,
  MAX_LINKS,
  ProfileAbout,
  ProfileLink,
  guessLinkKind,
  safeLinkUrl,
} from '../../../plugins/diddy/profileExtras';
import { ACTIVITY_LABEL } from '../../../components/user-profile/ProfileModules';

type Draft = Omit<DiddyProfile, 'v' | 'shownBadges'>;
type PatchDraft = (fn: (d: Draft) => Draft) => void;

/** A rounded settings card, same look as the sections of the profile page. */
function Card({
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={css.Field}>
      <Text size="T300" priority="300">
        {label}
      </Text>
      <div className={css.Controls}>{children}</div>
    </div>
  );
}

const ABOUT_LABEL: Record<keyof ProfileAbout, string> = {
  pronouns: 'Pronouns',
  location: 'Location',
  age: 'Age',
  education: 'School / studies',
  work: 'Work',
};

export function AboutEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  return (
    <Card
      title="About you"
      description="Short facts shown as chips on your card. Every field is optional and only you decide what is public."
    >
      {ABOUT_FIELDS.map((field) => (
        <Field key={field} label={ABOUT_LABEL[field]}>
          <input
            className={css.Input}
            maxLength={field === 'age' ? 8 : 40}
            value={draft.about?.[field] ?? ''}
            onChange={(e) =>
              patch((d) => ({ ...d, about: { ...d.about, [field]: e.target.value } }))
            }
          />
        </Field>
      ))}
    </Card>
  );
}

export function InterestsEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  // the text keeps its commas while typing; the list in the draft is derived from it
  const [text, setText] = useState((draft.interests ?? []).join(', '));
  return (
    <Card
      title="Interests"
      description={`Shown as tags. Separate them with commas, up to ${MAX_INTERESTS}.`}
    >
      <input
        className={css.Input}
        placeholder="Homelab, Music, Films"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const list = e.target.value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, MAX_INTERESTS);
          patch((d) => ({ ...d, interests: list.length > 0 ? list : undefined }));
        }}
      />
    </Card>
  );
}

export function LinksEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const links: ProfileLink[] = draft.links ?? [];
  const setLinks = (next: ProfileLink[]) =>
    patch((d) => ({ ...d, links: next.length > 0 ? next : undefined }));
  return (
    <Card
      title="Links"
      description="GitHub, GitLab, LinkedIn, Spotify, YouTube or your own website. Only https addresses."
    >
      {links.map((link, i) => {
        const bad = link.url !== '' && !safeLinkUrl(link.kind, link.url);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <Box key={i} gap="200" alignItems="Center">
            <input
              className={css.Input}
              placeholder="https://github.com/you"
              value={link.url}
              aria-invalid={bad}
              onChange={(e) => {
                const url = e.target.value;
                setLinks(links.map((l, j) => (j === i ? { kind: guessLinkKind(url), url } : l)));
              }}
            />
            <IconButton
              size="300"
              variant="Surface"
              aria-label="Remove link"
              onClick={() => setLinks(links.filter((_, j) => j !== i))}
            >
              <Icon size="100" src={Icons.Cross} />
            </IconButton>
            {bad && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                not valid
              </Text>
            )}
          </Box>
        );
      })}
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
    </Card>
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
    <Card
      title="Activity"
      description="What you are up to, typed in by hand. Diddy does not read it from other apps."
    >
      <Field label="Kind">
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
      </Field>
      <Field label="Text">
        <input
          className={css.Input}
          maxLength={60}
          placeholder="Legacy"
          value={activity?.text ?? ''}
          onChange={(e) => set({ text: e.target.value })}
        />
      </Field>
      <Field label="Details">
        <input
          className={css.Input}
          maxLength={60}
          placeholder="PIXY (UK)"
          value={activity?.detail ?? ''}
          onChange={(e) => set({ detail: e.target.value })}
        />
      </Field>
      {activity && (
        <Box>
          <Button
            size="300"
            variant="Secondary"
            fill="None"
            radii="300"
            onClick={() => patch((d) => ({ ...d, activity: undefined }))}
          >
            <Text size="B300">Clear</Text>
          </Button>
        </Box>
      )}
    </Card>
  );
}

const LAYOUT_INFO: Record<CardLayout, { label: string; text: string }> = {
  compact: { label: 'Compact', text: 'Slim banner, name and bio. For quick looks.' },
  standard: { label: 'Standard', text: 'Banner, facts, links and shared rooms.' },
  expanded: { label: 'Expanded', text: 'Everything, including activity and interests.' },
  tabs: { label: 'Tabs', text: 'Info, Activity, Links and Shared in tabs.' },
};
const MODULE_LABEL: Record<CardModule, string> = {
  about: 'Facts',
  bio: 'Bio',
  activity: 'Activity',
  interests: 'Interests',
  links: 'Links',
  sharedRooms: 'Shared rooms',
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
        opacity: 0.35,
      }}
    />
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      <div
        style={{
          height: layout === 'compact' ? 10 : 18,
          borderRadius: 4,
          background: color.Primary.Container,
        }}
      />
      {bar('60%', 6)}
      {layout === 'tabs' && (
        <div style={{ display: 'flex', gap: 3 }}>
          {bar('22%')}
          {bar('22%')}
          {bar('22%')}
        </div>
      )}
      {layout !== 'compact' && bar('90%')}
      {(layout === 'expanded' || layout === 'tabs') && bar('75%')}
      {layout === 'expanded' && bar('50%')}
    </div>
  );
}

export function LayoutEditor({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const settings: CardLayoutSettings = draft.cardLayout ?? {};
  const layout: CardLayout = settings.layout ?? 'standard';
  const hidden = settings.hidden ?? [];
  const allowed = LAYOUT_MODULES[layout];
  const order = [
    ...(settings.order ?? []).filter((m) => allowed.includes(m)),
    ...allowed.filter((m) => !(settings.order ?? []).includes(m)),
  ];
  const setSettings = (next: CardLayoutSettings) => patch((d) => ({ ...d, cardLayout: next }));
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSettings({ ...settings, order: next });
  };
  return (
    <>
      <Card
        title="Card layout"
        description="How your card looks to others. The preview on the right updates right away."
      >
        <div
          className={css.Segment}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
        >
          {CARD_LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              className={css.SegmentButton}
              aria-pressed={layout === l}
              onClick={() => setSettings({ ...settings, layout: l })}
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                height: 'auto',
                padding: 10,
              }}
            >
              <Wire layout={l} />
              <Text size="T300">{LAYOUT_INFO[l].label}</Text>
              <Text size="T200" priority="300">
                {LAYOUT_INFO[l].text}
              </Text>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Modules" description="Show, hide and reorder the parts of your card.">
        {order.map((m, i) => (
          <Box key={m} alignItems="Center" gap="300">
            <Switch
              variant="Primary"
              value={!hidden.includes(m)}
              onChange={(on) =>
                setSettings({
                  ...settings,
                  hidden: on ? hidden.filter((h) => h !== m) : [...hidden, m],
                })
              }
            />
            <Box grow="Yes">
              <Text size="T300">{MODULE_LABEL[m]}</Text>
            </Box>
            <IconButton
              size="300"
              variant="Surface"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <Icon size="100" src={Icons.ArrowTop} />
            </IconButton>
            <IconButton
              size="300"
              variant="Surface"
              aria-label="Move down"
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              <Icon size="100" src={Icons.ArrowBottom} />
            </IconButton>
          </Box>
        ))}
        {layout === 'tabs' && (
          <Text size="T200" priority="300">
            In the tab layout the modules are grouped into tabs; the order applies inside a tab.
          </Text>
        )}
      </Card>
    </>
  );
}

export type EditorTab = 'identity' | 'card' | 'avatar' | 'status' | 'layout';
const TABS: { id: EditorTab; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'card', label: 'Profile card' },
  { id: 'avatar', label: 'Avatar & nameplate' },
  { id: 'status', label: 'Status & badges' },
  { id: 'layout', label: 'Layouts' },
];

export function EditorTabs({
  tab,
  onChange,
}: {
  tab: EditorTab;
  onChange: (t: EditorTab) => void;
}) {
  return (
    <div className={css.Segment} role="tablist" style={{ flexWrap: 'wrap' }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          className={css.SegmentButton}
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
        >
          <Text size="T300">{t.label}</Text>
        </button>
      ))}
    </div>
  );
}
