import { compareVersions } from './version';

/** Pure helpers for the update check (#120): repo validation, release parsing, asset choice. */
export const DEFAULT_UPDATE_REPO = 'Lndr2501/diddy';

export type ReleaseAsset = { name: string; url: string; size: number };
export type ReleaseInfo = {
  version: string;
  notes: string;
  pageUrl: string;
  assets: ReleaseAsset[];
};

/** "owner/name" as GitHub allows it. */
export const isValidUpdateRepo = (repo: string): boolean => {
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})$/.exec(repo.trim());
  if (!m) return false;
  return m[2] !== '.' && m[2] !== '..';
};

/** Trimmed repo when valid, else the default. */
export const effectiveUpdateRepo = (repo: string | undefined): string =>
  repo && isValidUpdateRepo(repo) ? repo.trim() : DEFAULT_UPDATE_REPO;

export const releasesApiUrl = (repo: string): string =>
  `https://api.github.com/repos/${effectiveUpdateRepo(repo)}/releases/latest`;

export const releasesPageUrl = (repo: string): string =>
  `https://github.com/${effectiveUpdateRepo(repo)}/releases/latest`;

/** Only GitHub hosts may serve a release page or download. */
export const isGithubUrl = (raw: string): boolean => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return (
      u.hostname === 'github.com' ||
      u.hostname.endsWith('.github.com') ||
      u.hostname.endsWith('.githubusercontent.com')
    );
  } catch {
    return false;
  }
};

/** Parses the GitHub "latest release" JSON. Drafts and pre-releases give undefined. */
export const parseRelease = (data: unknown, repo: string): ReleaseInfo | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  const d = data as Record<string, unknown>;
  if (d.draft === true || d.prerelease === true) return undefined;
  const version = typeof d.tag_name === 'string' ? d.tag_name.replace(/^v/, '').trim() : '';
  if (!/^\d+(\.\d+)*$/.test(version)) return undefined;
  const assets: ReleaseAsset[] = Array.isArray(d.assets)
    ? (d.assets as unknown[]).flatMap((a) => {
        if (typeof a !== 'object' || a === null) return [];
        const x = a as Record<string, unknown>;
        if (typeof x.name !== 'string' || typeof x.browser_download_url !== 'string') return [];
        if (!isGithubUrl(x.browser_download_url)) return [];
        return [
          {
            name: x.name,
            url: x.browser_download_url,
            size: typeof x.size === 'number' ? x.size : 0,
          },
        ];
      })
    : [];
  const htmlUrl = typeof d.html_url === 'string' && isGithubUrl(d.html_url) ? d.html_url : '';
  return {
    version,
    notes: typeof d.body === 'string' ? d.body : '',
    pageUrl: htmlUrl || releasesPageUrl(repo),
    assets,
  };
};

export type UpdatePlatform = 'mac' | 'linux' | 'windows' | 'other';

/** The download that fits this system, if the release has one. */
export const pickAsset = (
  assets: ReleaseAsset[],
  platform: UpdatePlatform,
  arch: 'arm64' | 'x64' | 'unknown' = 'unknown'
): ReleaseAsset | undefined => {
  const ext: Record<UpdatePlatform, string> = {
    mac: '.dmg',
    linux: '.appimage',
    windows: '.exe',
    other: '',
  };
  if (!ext[platform]) return undefined;
  const matches = assets.filter((a) => a.name.toLowerCase().endsWith(ext[platform]));
  const archNames = { arm64: ['aarch64', 'arm64'], x64: ['x86_64', 'x64', 'amd64'] } as const;
  if (arch !== 'unknown') {
    const own = matches.find((a) => archNames[arch].some((n) => a.name.toLowerCase().includes(n)));
    if (own) return own;
    const otherArch = arch === 'arm64' ? archNames.x64 : archNames.arm64;
    // a build named for the other architecture does not run here
    return matches.find((a) => !otherArch.some((n) => a.name.toLowerCase().includes(n)));
  }
  return matches[0];
};

/** True when `latest` is newer than `current` and the user has not skipped it. */
export const isUpdateWanted = (latest: string, current: string, skipped = ''): boolean =>
  compareVersions(latest, current) > 0 && latest !== skipped;
