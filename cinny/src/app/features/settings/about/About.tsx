import React, { useEffect, useState } from 'react';
import { Box, Text, Icon, Icons, Button, Input, Switch, config, toRem } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import { settingsAtom } from '../../../state/settings';
import { DEFAULT_UPDATE_REPO, isValidUpdateRepo } from '../../../utils/updateCheck';
import { AppLogo } from '../../../components/app-logo/AppLogo';
import { APP_NAME, APP_REPO_URL, APP_VERSION, UPSTREAM_NAME, UPSTREAM_URL } from '../../../appInfo';
import { clearCacheAndReload } from '../../../../client/initMatrix';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { InsetGroup, InsetItem, InsetRow, InsetSection, SettingsPage } from '../inset-list';
import { WelcomeGuideSettings } from '../general/General';
import * as sheetCss from '../../../components/sheet/Sheet.css';
import { canInvoke, invoke } from '../../../plugins/tauri';
import { copyToClipboard } from '../../../utils/dom';
import { useTranslation } from 'react-i18next';

type AboutProps = {
  requestClose: () => void;
};
export function About({ requestClose }: AboutProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const desktop = canInvoke();
  const [logPath, setLogPath] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    invoke<string | null>('log_path')
      .then((path) => setLogPath(path ?? undefined))
      .catch(() => undefined);
  }, [desktop]);

  const settings = useAtomValue(settingsAtom);
  const setSettings = useSetAtom(settingsAtom);
  const [repoDraft, setRepoDraft] = useState(settings.updateRepo);
  const repoValid = isValidUpdateRepo(repoDraft);

  return (
    <SettingsPage title={t('settings.about.about')} requestClose={requestClose}>
      {/* centred hero like the macOS "About This Mac" window */}
      <Box
        direction="Column"
        alignItems="Center"
        gap="400"
        style={{ padding: `${toRem(24)} 0 ${toRem(8)}`, textAlign: 'center' }}
      >
        <Box shrink="No">
          <AppLogo size={96} />
        </Box>
        <Box direction="Column" alignItems="Center" gap="300">
          <Box direction="Column" alignItems="Center" gap="100">
            <Text size="H2">{APP_NAME}</Text>
            <Text size="T300" priority="300">
              {t('settings.about.versionAppversion', { appVersion: APP_VERSION })}
            </Text>
            <Text priority="400">
              {t('settings.about.aMatrixChatClient', { upstreamName: UPSTREAM_NAME })}
            </Text>
          </Box>

          <Box gap="200" wrap="Wrap" justifyContent="Center">
            <Button
              className={sheetCss.Pill}
              as="a"
              href={APP_REPO_URL}
              rel="noreferrer noopener"
              target="_blank"
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="Pill"
              before={<Icon src={Icons.Code} size="100" filled />}
            >
              <Text size="B300">{t('settings.about.sourceCode')}</Text>
            </Button>
            <Button
              className={sheetCss.Pill}
              as="a"
              href={UPSTREAM_URL}
              rel="noreferrer noopener"
              target="_blank"
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="Pill"
              before={<Icon src={Icons.Heart} size="100" filled />}
            >
              <Text size="B300">{UPSTREAM_NAME}</Text>
            </Button>
          </Box>
        </Box>
      </Box>
      <WelcomeGuideSettings />
      <InsetSection title={t('settings.about.options')}>
        <InsetGroup>
          <InsetRow
            title={t('settings.about.clearCacheReload')}
            description={t('settings.about.clearAllYourLocally')}
            after={
              <Button
                className={sheetCss.Pill}
                onClick={() => clearCacheAndReload(mx)}
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="Pill"
              >
                <Text size="B300">{t('settings.about.clearCache')}</Text>
              </Button>
            }
          />
        </InsetGroup>
      </InsetSection>
      <InsetSection
        title={t('settings.about.updates')}
        footer={
          desktop ? t('settings.about.atStartDiddyLooks') : t('settings.about.diddyShowsANotice')
        }
      >
        <InsetGroup>
          <InsetRow
            title={t('settings.about.checkForUpdates')}
            description={t('settings.about.lookForANewer')}
            after={
              <Switch
                variant="Primary"
                value={settings.checkUpdatesAtStart}
                onChange={(value: boolean) =>
                  setSettings({ ...settings, checkUpdatesAtStart: value })
                }
              />
            }
          />
          <InsetRow
            title={t('settings.about.updateRepository')}
            description={
              repoValid
                ? t('settings.about.githubOwnerNameThat')
                : t('settings.about.useTheFormOwner')
            }
            after={
              <Box gap="200" alignItems="Center">
                <Input
                  value={repoDraft}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const { value } = e.target;
                    setRepoDraft(value);
                    if (isValidUpdateRepo(value)) {
                      setSettings({ ...settings, updateRepo: value.trim() });
                    }
                  }}
                  variant={repoValid ? 'Background' : 'Critical'}
                  size="300"
                  radii="300"
                  aria-label={t('settings.about.updateRepository')}
                  spellCheck={false}
                  style={{ width: toRem(200) }}
                />
                <Button
                  className={sheetCss.Pill}
                  disabled={repoDraft === DEFAULT_UPDATE_REPO}
                  onClick={() => {
                    setRepoDraft(DEFAULT_UPDATE_REPO);
                    setSettings({ ...settings, updateRepo: DEFAULT_UPDATE_REPO });
                  }}
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="Pill"
                >
                  <Text size="B300">{t('settings.about.default')}</Text>
                </Button>
              </Box>
            }
          />
        </InsetGroup>
      </InsetSection>
      {desktop && (
        <InsetSection
          title={t('settings.about.diagnostics')}
          footer={t('settings.about.theLogFileHolds')}
        >
          <InsetGroup>
            <InsetRow
              title={t('settings.about.logFile')}
              description={logPath ?? t('settings.about.notAvailable')}
              after={
                <Box gap="200">
                  <Button
                    className={sheetCss.Pill}
                    onClick={() => invoke('open_log_folder').catch(() => undefined)}
                    variant="Secondary"
                    fill="Soft"
                    size="300"
                    radii="Pill"
                  >
                    <Text size="B300">{t('settings.about.openFolder')}</Text>
                  </Button>
                  <Button
                    className={sheetCss.Pill}
                    disabled={!logPath}
                    onClick={() => {
                      if (!logPath) return;
                      copyToClipboard(logPath);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                    variant="Secondary"
                    fill="Soft"
                    size="300"
                    radii="Pill"
                  >
                    <Text size="B300">
                      {copied ? t('settings.about.copied') : t('settings.about.copyPath')}
                    </Text>
                  </Button>
                </Box>
              }
            />
          </InsetGroup>
        </InsetSection>
      )}
      <InsetSection title={t('settings.about.credits')}>
        <InsetGroup>
          <InsetItem>
            <Box
              as="ul"
              direction="Column"
              gap="200"
              style={{
                margin: 0,
                paddingLeft: config.space.S400,
              }}
            >
              <li>
                <Text size="T300">
                  {t('settings.about.the')}{' '}
                  <a
                    href="https://github.com/matrix-org/matrix-js-sdk"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {t('settings.about.matrixJsSdk')}
                  </a>{' '}
                  {t('settings.about.is')}{' '}
                  <a href="https://matrix.org/foundation" rel="noreferrer noopener" target="_blank">
                    {t('settings.about.theMatrixOrgFoundation')}
                  </a>{' '}
                  {t('settings.about.usedUnderTheTerms')}{' '}
                  <a
                    href="http://www.apache.org/licenses/LICENSE-2.0"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {t('settings.about.apache20')}
                  </a>
                  .
                </Text>
              </li>
              <li>
                <Text size="T300">
                  {t('settings.about.the')}{' '}
                  <a href="https://twemoji.twitter.com" target="_blank" rel="noreferrer noopener">
                    {t('settings.about.twemoji')}
                  </a>{' '}
                  {t('settings.about.emojiArtIs')}{' '}
                  <a href="https://twemoji.twitter.com" target="_blank" rel="noreferrer noopener">
                    {t('settings.about.twitterIncAndOther')}
                  </a>{' '}
                  {t('settings.about.usedUnderTheTerms')}{' '}
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t('settings.about.ccBy40')}
                  </a>
                  .
                </Text>
              </li>
              <li>
                <Text size="T300">
                  {t('settings.about.the')}{' '}
                  <a
                    href="https://material.io/design/sound/sound-resources.html"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t('settings.about.materialSoundResources')}
                  </a>{' '}
                  {t('settings.about.are')}{' '}
                  <a href="https://google.com" target="_blank" rel="noreferrer noopener">
                    {t('settings.about.google')}
                  </a>{' '}
                  {t('settings.about.usedUnderTheTerms')}{' '}
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t('settings.about.ccBy40')}
                  </a>
                  .
                </Text>
              </li>
            </Box>
          </InsetItem>
        </InsetGroup>
      </InsetSection>
    </SettingsPage>
  );
}
