import React, { KeyboardEvent, useId, useState } from 'react';
import { Box, color, Icon, IconSrc, Icons, Text, Tooltip, TooltipProvider } from 'folds';
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
import { BreakWord, LineClamp2, LineClamp3 } from '../../styles/Text.css';
import * as css from './styles.css';

/** Black or white, whichever is readable on the given hex background. */
export const readableTextOn = (hex: string): string => {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#FFFFFF';
};

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
const LINK_ICON: Record<LinkKind, IconSrc> = {
  github: Icons.Code,
  gitlab: Icons.BlockCode,
  linkedin: Icons.User,
  spotify: Icons.Headphone,
  youtube: Icons.Play,
  web: Icons.Globe,
};

const ACTIVITY_ICON: Record<ActivityKind, IconSrc> = {
  music: Icons.Headphone,
  game: Icons.Ball,
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

/** a pill tinted with the card's accent color, or the neutral surface color without one */
const tint = (accent?: string): React.CSSProperties | undefined =>
  accent
    ? {
        backgroundColor: `color-mix(in srgb, ${accent} 16%, ${color.SurfaceVariant.Container})`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent)`,
      }
    : undefined;

function Section({
  title,
  flat,
  children,
}: {
  title?: string;
  flat?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={classNames(css.Panel, flat && css.PanelFlat)}>
      {title && (
        <Text as="h3" size="L400" className={css.AboutLabel}>
          {title}
        </Text>
      )}
      {children}
    </section>
  );
}

export function AboutModule({ about, accent }: { about?: ProfileAbout; accent?: string }) {
  const entries = ABOUT_FIELDS.map((f) => [f, safeText(about?.[f], 40)] as const).filter(
    ([, v]) => !!v
  );
  if (entries.length === 0) return null;
  return (
    <Box gap="100" wrap="Wrap">
      {entries.map(([field, value]) => (
        <span key={field} className={css.Pill} style={tint(accent)}>
          <Icon
            className={css.PillIcon}
            size="50"
            src={ABOUT_ICON[field]}
            style={accent ? { color: accent, opacity: 1 } : undefined}
          />
          <Text as="span" size="T200" truncate>
            {value}
          </Text>
        </span>
      ))}
    </Box>
  );
}

export function BioModule({
  bio,
  compact,
  long,
}: {
  bio?: string;
  compact?: boolean;
  long?: boolean;
}) {
  const text = safeText(bio, 160);
  if (!text) return null;
  const body = (
    <Text
      size={compact ? 'T200' : 'T300'}
      className={classNames(BreakWord, css.AboutText, !long && (compact ? LineClamp2 : LineClamp3))}
      title={compact ? text : undefined}
    >
      {text}
    </Text>
  );
  if (compact) return body;
  return <Section title="About me">{body}</Section>;
}

export function ActivityModule({ profile, accent }: { profile?: DiddyProfile; accent?: string }) {
  const activity = profile?.activity;
  if (!activity) return null;
  const base = accent ?? color.Primary.Main;
  return (
    <Section title={ACTIVITY_LABEL[activity.kind]}>
      <div className={css.ActivityCard}>
        <div
          className={css.ActivityArt}
          style={{
            backgroundImage: `linear-gradient(135deg, ${base}, color-mix(in srgb, ${base} 55%, #000000))`,
            color: accent ? readableTextOn(accent) : color.Primary.OnMain,
          }}
        >
          <Icon size="400" src={ACTIVITY_ICON[activity.kind]} filled />
          {activity.kind === 'music' && (
            <span className={css.ActivityLive} aria-hidden="true">
              <span className={css.ActivityLiveBar} />
              <span className={css.ActivityLiveBar} />
              <span className={css.ActivityLiveBar} />
            </span>
          )}
        </div>
        <Box direction="Column" gap="100" style={{ minWidth: 0 }}>
          <Text size="T300" className={classNames(BreakWord, LineClamp2)}>
            <b>{activity.text}</b>
          </Text>
          {activity.detail && (
            <Text size="T200" priority="300" className={classNames(BreakWord, LineClamp2)}>
              {activity.detail}
            </Text>
          )}
        </Box>
      </div>
    </Section>
  );
}

export function InterestsModule({ interests, accent }: { interests?: string[]; accent?: string }) {
  if (!interests || interests.length === 0) return null;
  return (
    <Section title="Interests">
      <Box gap="100" wrap="Wrap">
        {interests.map((tag) => (
          <span key={tag} className={css.Pill} style={tint(accent)}>
            <Text as="span" size="T200" truncate>
              {tag}
            </Text>
          </span>
        ))}
      </Box>
    </Section>
  );
}

export function LinksModule({ links, accent }: { links?: DiddyProfile['links']; accent?: string }) {
  // links are checked again on display: only the validated https url of the right host is used
  const shown = (links ?? [])
    .map((l) => ({ kind: l.kind, href: safeLinkUrl(l.kind, l.url) }))
    .filter((l): l is { kind: LinkKind; href: string } => !!l.href);
  if (shown.length === 0) return null;
  return (
    <Section title="Links">
      <Box gap="200" wrap="Wrap">
        {shown.map((link) => (
          <TooltipProvider
            key={link.href}
            position="Top"
            offset={4}
            delay={200}
            tooltip={
              <Tooltip>
                <Box direction="Column">
                  <Text size="L400">{LINK_LABEL[link.kind]}</Text>
                  <Text size="T200" priority="300" truncate style={{ maxWidth: 220 }}>
                    {link.href}
                  </Text>
                </Box>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <a
                ref={triggerRef as React.Ref<HTMLAnchorElement>}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={`${LINK_LABEL[link.kind]}: ${link.href}`}
                className={css.LinkTile}
                style={tint(accent)}
              >
                <Icon size="100" src={LINK_ICON[link.kind]} />
              </a>
            )}
          </TooltipProvider>
        ))}
      </Box>
    </Section>
  );
}

const TABS: { id: string; label: string; icon: IconSrc; modules: CardModule[] }[] = [
  { id: 'info', label: 'Info', icon: Icons.User, modules: ['about', 'bio'] },
  { id: 'activity', label: 'Activity', icon: Icons.Play, modules: ['activity', 'interests'] },
  { id: 'links', label: 'Links', icon: Icons.Link, modules: ['links'] },
  { id: 'shared', label: 'Shared', icon: Icons.Hash, modules: ['sharedRooms'] },
];

type ProfileModulesProps = {
  profile?: DiddyProfile;
  accent?: string;
  /** the shared rooms chip lives with the other chips of the card; this renders it in its place */
  sharedRooms?: React.ReactNode;
  /** layout to use instead of the card's own (the big profile window has its own) */
  layout?: CardLayout;
};
/** The modules of a card in the order and layout the owner chose (#29). */
export function ProfileModules({
  profile,
  accent,
  sharedRooms,
  layout: layoutOverride,
}: ProfileModulesProps) {
  const layout: CardLayout = layoutOverride ?? profile?.cardLayout?.layout ?? 'standard';
  const settings = { ...profile?.cardLayout, layout };
  const modules = visibleModules(settings);
  const [tab, setTab] = useState('info');
  const baseId = useId();

  const render = (m: CardModule): React.ReactNode => {
    switch (m) {
      case 'about':
        return <AboutModule key={m} about={profile?.about} accent={accent} />;
      case 'bio':
        return (
          <BioModule
            key={m}
            bio={profile?.bio}
            compact={layout === 'compact'}
            long={layout === 'expanded' || layout === 'tabs'}
          />
        );
      case 'activity':
        return <ActivityModule key={m} profile={profile} accent={accent} />;
      case 'interests':
        return <InterestsModule key={m} interests={profile?.interests} accent={accent} />;
      case 'links':
        return <LinksModule key={m} links={profile?.links} accent={accent} />;
      case 'sharedRooms':
        return sharedRooms ? (
          <Section key={m} title="Shared rooms">
            <Box>{sharedRooms}</Box>
          </Section>
        ) : null;
      default:
        return null;
    }
  };

  if (layout !== 'tabs') {
    const rendered = modules.map(render).filter((n) => n !== null);
    if (rendered.length === 0) return null;
    return (
      <Box direction="Column" gap={layout === 'compact' ? '200' : '300'}>
        {rendered}
      </Box>
    );
  }

  // a tab is only offered when one of its modules has something to show
  const hasContent = (m: CardModule): boolean => {
    switch (m) {
      case 'about':
        return ABOUT_FIELDS.some((f) => !!safeText(profile?.about?.[f], 40));
      case 'bio':
        return !!safeText(profile?.bio, 160);
      case 'activity':
        return !!profile?.activity;
      case 'interests':
        return (profile?.interests?.length ?? 0) > 0;
      case 'links':
        return (profile?.links ?? []).some((l) => !!safeLinkUrl(l.kind, l.url));
      case 'sharedRooms':
        return !!sharedRooms;
      default:
        return false;
    }
  };
  const tabs = TABS.map((t) => ({
    ...t,
    modules: t.modules.filter((m) => modules.includes(m) && hasContent(m)),
  })).filter((t) => t.modules.length > 0);
  if (tabs.length === 0) return null;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === tab)
  );
  const active = tabs[activeIndex];

  const handleKey = (evt: KeyboardEvent<HTMLButtonElement>) => {
    if (evt.key !== 'ArrowRight' && evt.key !== 'ArrowLeft') return;
    evt.preventDefault();
    const step = evt.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(activeIndex + step + tabs.length) % tabs.length];
    setTab(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <Box direction="Column" gap="300">
      {tabs.length > 1 && (
        <div className={css.TabBar} role="tablist" aria-label="Profile">
          <span
            className={css.TabIndicator}
            style={{
              width: `calc((100% - 6px) / ${tabs.length})`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
          {tabs.map((t) => {
            const selected = t.id === active.id;
            return (
              <button
                key={t.id}
                id={`${baseId}-tab-${t.id}`}
                type="button"
                role="tab"
                className={css.Tab}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={handleKey}
              >
                <Icon
                  size="50"
                  src={t.icon}
                  filled={selected}
                  style={selected && accent ? { color: accent } : undefined}
                />
                <Text as="span" size="T200" truncate>
                  {t.label}
                </Text>
              </button>
            );
          })}
        </div>
      )}
      <div
        key={active.id}
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active.id}`}
        className={css.TabPanel}
      >
        {active.modules.map(render)}
      </div>
    </Box>
  );
}
