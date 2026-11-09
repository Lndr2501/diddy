import React, { useEffect, useState } from 'react';
import { Box, Button, IconButton, Icon, Icons, Text, color, config, toRem } from 'folds';
import { useAtomValue } from 'jotai';
import { APP_VERSION } from '../../appInfo';
import { settingsAtom } from '../../state/settings';
import { canInvoke, invoke } from '../../plugins/tauri';
import {
  effectiveUpdateRepo,
  isUpdateWanted,
  parseRelease,
  releasesApiUrl,
} from '../../utils/updateCheck';

const DISMISSED_KEY = 'diddyUpdateDismissed';
const CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const readDismissed = (): string => {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? '';
  } catch {
    return '';
  }
};

type Release = { version: string; url: string };

/** Tells the user when GitHub has a newer Diddy release than the running app (#39). */
export function UpdateNotice() {
  const [release, setRelease] = useState<Release>();
  const { checkUpdatesAtStart, updateRepo } = useAtomValue(settingsAtom);
  const repo = effectiveUpdateRepo(updateRepo);

  // The desktop shell reads the same two settings before the main window opens (#120).
  useEffect(() => {
    if (!canInvoke()) return;
    invoke('updater_set_config', { enabled: checkUpdatesAtStart, repo }).catch(() => undefined);
  }, [checkUpdatesAtStart, repo]);

  useEffect(() => {
    if (!checkUpdatesAtStart) {
      setRelease(undefined);
      return undefined;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(releasesApiUrl(repo), {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const info = parseRelease(await res.json(), repo);
        if (cancelled || !info) return;
        if (isUpdateWanted(info.version, APP_VERSION, readDismissed())) {
          setRelease({ version: info.version, url: info.pageUrl });
        }
      } catch {
        // offline or rate limited: try again at the next interval
      }
    };
    const first = window.setTimeout(check, CHECK_DELAY_MS);
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [checkUpdatesAtStart, repo]);

  if (!release) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, release.version);
    } catch {
      // storage unavailable: the notice returns after the next start
    }
    setRelease(undefined);
  };

  return (
    <Box
      role="status"
      alignItems="Center"
      gap="300"
      style={{
        position: 'fixed',
        right: config.space.S400,
        bottom: config.space.S400,
        zIndex: 1000,
        maxWidth: toRem(360),
        padding: `${config.space.S200} ${config.space.S300}`,
        borderRadius: toRem(14),
        background: color.Surface.Container,
        color: color.Surface.OnContainer,
        border: `1px solid ${color.Surface.ContainerLine}`,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      }}
    >
      <Box grow="Yes" direction="Column">
        <Text size="T300">
          <b>Diddy {release.version}</b> is available
        </Text>
        <Text size="T200" priority="300">
          You have {APP_VERSION}.
        </Text>
      </Box>
      <Button
        as="a"
        href={release.url}
        target="_blank"
        rel="noreferrer noopener"
        size="300"
        radii="Pill"
        variant="Primary"
      >
        <Text size="B300">Download</Text>
      </Button>
      <IconButton size="300" radii="Pill" fill="None" aria-label="Dismiss" onClick={dismiss}>
        <Icon src={Icons.Cross} size="100" />
      </IconButton>
    </Box>
  );
}
