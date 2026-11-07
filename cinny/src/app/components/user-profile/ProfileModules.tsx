import React, { useState } from 'react';
import { Box, color, config, Icon, IconSrc, Icons, Text, toRem } from 'folds';
import classNames from 'classnames';
import { DiddyProfile } from '../../plugins/diddy/types';
import {
  ABOUT_FIELDS,
  ActivityKind,
  CardLayout,
  CardModule,
  LinkKind,
  ProfileAbout,
  safeLinkUrl,
  visibleModules,
} from '../../plugins/diddy/profileExtras';
import { safeText } from '../../plugins/diddy/sanitize';
import { BreakWord, LineClamp3 } from '../../styles/Text.css';
import * as css from './styles.css';

const ABOUT_ICON: Record<keyof ProfileAbout, IconSrc> = {
  pronouns: Icons.User,
  location: Icons.Pin,
  age: Icons.Clock,
  education: Icons.Bookmark,
  work: Icons.Terminal,
};

const LINK_LABEL: Record<LinkKind, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  linkedin: 'LinkedIn',
  spotify: 'Spotify',
  youtube: 'YouTube',
  web: 'Website',
};

const ACTIVITY_ICON: Record<ActivityKind, IconSrc> = {
  music: Icons.Headphone,
  game: Icons.Play,
  working: Icons.Terminal,
  learning: Icons.Bookmark,
  custom: Icons.Star,
};
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  music: 'Listening to',
  game: 'Playing',
  working: 'Working on',
  learning: 'Learning',
  custom: 'Activity',
};

const pill = (accent?: string) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  padding: `${toRem(4)} ${config.space.S200}`,
  borderRadius: config.radii.Pill,
  backgroundColor: accent
    ? `color-mix(in srgb, ${accent} 14%, ${color.SurfaceVariant.Container})`
    : color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  textDecoration: 'none',
});

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box direction="Column" gap="100">
      {title && (
        <Text size="L400" className={css.AboutLabel}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  );
}

export function AboutModule({ about, accent }: { about?: ProfileAbout; accent?: string }) {
  const entries = ABOUT_FIELDS.map((f) => [f, safeText(about?.[f], 40)] as const).filter(
    ([, v]) => !!v
  );
  if (entries.length === 0) return null;
  return (
    <Box gap="200" wrap="Wrap">
      {entries.map(([field, value]) => (
        <span key={field} style={pill(accent)}>
          <Icon size="50" src={ABOUT_ICON[field]} />
          <Text size="T200">{value}</Text>
        </span>
      ))}
    </Box>
  );
}

export function BioModule({ bio }: { bio?: string }) {
  const text = safeText(bio, 160);
  if (!text) return null;
  return (
    <Section title="About me">
      <Text size="T300" className={classNames(BreakWord, LineClamp3, css.AboutText)}>
        {text}
      </Text>
    </Section>
  );
}

export function ActivityModule({ profile, accent }: { profile?: DiddyProfile; accent?: string }) {
  const activity = profile?.activity;
  if (!activity) return null;
  return (
    <Section title="Activity">
      <Box
        alignItems="Center"
        gap="300"
        style={{ ...pill(accent), borderRadius: config.radii.R400 }}
      >
        <Icon size="200" src={ACTIVITY_ICON[activity.kind]} />
        <Box direction="Column">
          <Text size="T200" priority="300">
            {ACTIVITY_LABEL[activity.kind]}
          </Text>
          <Text size="T300" className={BreakWord}>
            {activity.text}
          </Text>
          {activity.detail && (
            <Text size="T200" priority="300" className={BreakWord}>
              {activity.detail}
            </Text>
          )}
        </Box>
      </Box>
    </Section>
  );
}

export function InterestsModule({ interests, accent }: { interests?: string[]; accent?: string }) {
  if (!interests || interests.length === 0) return null;
  return (
    <Section title="Interests">
      <Box gap="200" wrap="Wrap">
        {interests.map((tag) => (
          <span key={tag} style={pill(accent)}>
            <Text size="T200">{tag}</Text>
          </span>
        ))}
      </Box>
    </Section>
  );
}

export function LinksModule({ links, accent }: { links?: DiddyProfile['links']; accent?: string }) {
  // links are checked again on display: only https urls of the right host become anchors
  const shown = (links ?? []).filter((l) => !!safeLinkUrl(l.kind, l.url));
  if (shown.length === 0) return null;
  return (
    <Section title="Links">
      <Box gap="200" wrap="Wrap">
        {shown.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={link.url}
            style={pill(accent)}
          >
            <Icon size="50" src={Icons.External} />
            <Text size="T200">{LINK_LABEL[link.kind]}</Text>
          </a>
        ))}
      </Box>
    </Section>
  );
}

const TABS: { id: string; label: string; modules: CardModule[] }[] = [
  { id: 'info', label: 'Info', modules: ['about', 'bio'] },
  { id: 'activity', label: 'Activity', modules: ['activity', 'interests'] },
  { id: 'links', label: 'Links', modules: ['links'] },
  { id: 'shared', label: 'Shared', modules: ['sharedRooms'] },
];

type ProfileModulesProps = {
  profile?: DiddyProfile;
  accent?: string;
  /** the shared rooms chip lives with the other chips of the card; this renders it in its place */
  sharedRooms?: React.ReactNode;
};
/** The modules of a card in the order and layout the owner chose (#29). */
export function ProfileModules({ profile, accent, sharedRooms }: ProfileModulesProps) {
  const settings = profile?.cardLayout;
  const layout: CardLayout = settings?.layout ?? 'standard';
  const modules = visibleModules(settings);
  const [tab, setTab] = useState('info');

  const render = (m: CardModule): React.ReactNode => {
    switch (m) {
      case 'about':
        return <AboutModule key={m} about={profile?.about} accent={accent} />;
      case 'bio':
        return <BioModule key={m} bio={profile?.bio} />;
      case 'activity':
        return <ActivityModule key={m} profile={profile} accent={accent} />;
      case 'interests':
        return <InterestsModule key={m} interests={profile?.interests} accent={accent} />;
      case 'links':
        return <LinksModule key={m} links={profile?.links} accent={accent} />;
      case 'sharedRooms':
        return sharedRooms ? <React.Fragment key={m}>{sharedRooms}</React.Fragment> : null;
      default:
        return null;
    }
  };

  if (layout !== 'tabs') {
    return (
      <Box direction="Column" gap="300">
        {modules.map(render)}
      </Box>
    );
  }

  const tabs = TABS.map((t) => ({
    ...t,
    modules: t.modules.filter((m) => modules.includes(m)),
  })).filter((t) => t.modules.length > 0);
  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <Box direction="Column" gap="300">
      <Box gap="100" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active.id}
            onClick={() => setTab(t.id)}
            style={{
              ...pill(t.id === active.id ? accent ?? color.Primary.Main : undefined),
              border: 'none',
              cursor: 'pointer',
              font: 'inherit',
              opacity: t.id === active.id ? 1 : 0.75,
            }}
          >
            <Text size="T200">{t.label}</Text>
          </button>
        ))}
      </Box>
      {active.modules.map(render)}
    </Box>
  );
}
