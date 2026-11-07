import React, { useEffect, useState } from 'react';
import { Box, Text, Icon, Icons, Button, config, toRem } from 'folds';
import { AppLogo } from '../../../components/app-logo/AppLogo';
import { APP_NAME, APP_REPO_URL, APP_VERSION, UPSTREAM_NAME, UPSTREAM_URL } from '../../../appInfo';
import { clearCacheAndReload } from '../../../../client/initMatrix';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { InsetGroup, InsetItem, InsetRow, InsetSection, SettingsPage } from '../inset-list';
import * as sheetCss from '../../../components/sheet/Sheet.css';
import { canInvoke, invoke } from '../../../plugins/tauri';
import { copyToClipboard } from '../../../utils/dom';

type AboutProps = {
  requestClose: () => void;
};
export function About({ requestClose }: AboutProps) {
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

  return (
    <SettingsPage title="About" requestClose={requestClose}>
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
              Version {APP_VERSION}
            </Text>
            <Text priority="400">A Matrix chat client based on {UPSTREAM_NAME}.</Text>
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
              <Text size="B300">Source Code</Text>
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
      <InsetSection title="Options">
        <InsetGroup>
          <InsetRow
            title="Clear Cache & Reload"
            description="Clear all your locally stored data and reload from server."
            after={
              <Button
                className={sheetCss.Pill}
                onClick={() => clearCacheAndReload(mx)}
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="Pill"
              >
                <Text size="B300">Clear Cache</Text>
              </Button>
            }
          />
        </InsetGroup>
      </InsetSection>
      {desktop && (
        <InsetSection
          title="Diagnostics"
          footer="The log file holds technical events and errors, no message texts. Attach it to a bug report."
        >
          <InsetGroup>
            <InsetRow
              title="Log file"
              description={logPath ?? 'Not available'}
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
                    <Text size="B300">Open Folder</Text>
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
                    <Text size="B300">{copied ? 'Copied' : 'Copy Path'}</Text>
                  </Button>
                </Box>
              }
            />
          </InsetGroup>
        </InsetSection>
      )}
      <InsetSection title="Credits">
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
                  The{' '}
                  <a
                    href="https://github.com/matrix-org/matrix-js-sdk"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    matrix-js-sdk
                  </a>{' '}
                  is ©{' '}
                  <a href="https://matrix.org/foundation" rel="noreferrer noopener" target="_blank">
                    The Matrix.org Foundation C.I.C
                  </a>{' '}
                  used under the terms of{' '}
                  <a
                    href="http://www.apache.org/licenses/LICENSE-2.0"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Apache 2.0
                  </a>
                  .
                </Text>
              </li>
              <li>
                <Text size="T300">
                  The{' '}
                  <a
                    href="https://github.com/mozilla/twemoji-colr"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    twemoji-colr
                  </a>{' '}
                  font is ©{' '}
                  <a href="https://mozilla.org/" target="_blank" rel="noreferrer noopener">
                    Mozilla Foundation
                  </a>{' '}
                  used under the terms of{' '}
                  <a
                    href="http://www.apache.org/licenses/LICENSE-2.0"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Apache 2.0
                  </a>
                  .
                </Text>
              </li>
              <li>
                <Text size="T300">
                  The{' '}
                  <a href="https://twemoji.twitter.com" target="_blank" rel="noreferrer noopener">
                    Twemoji
                  </a>{' '}
                  emoji art is ©{' '}
                  <a href="https://twemoji.twitter.com" target="_blank" rel="noreferrer noopener">
                    Twitter, Inc and other contributors
                  </a>{' '}
                  used under the terms of{' '}
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    CC-BY 4.0
                  </a>
                  .
                </Text>
              </li>
              <li>
                <Text size="T300">
                  The{' '}
                  <a
                    href="https://material.io/design/sound/sound-resources.html"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Material sound resources
                  </a>{' '}
                  are ©{' '}
                  <a href="https://google.com" target="_blank" rel="noreferrer noopener">
                    Google
                  </a>{' '}
                  used under the terms of{' '}
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    CC-BY 4.0
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
