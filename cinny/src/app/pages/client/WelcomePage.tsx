import React from 'react';
import { Box, Button, Icon, Icons, Text, config, toRem } from 'folds';
import { Page, PageHero, PageHeroSection } from '../../components/page';
import { AppLogo } from '../../components/app-logo/AppLogo';
import { APP_NAME, APP_VERSION, APP_REPO_URL, UPSTREAM_NAME, UPSTREAM_URL } from '../../appInfo';

export function WelcomePage() {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400, paddingBottom: config.space.S700 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          <PageHero
            icon={<AppLogo size={70} />}
            title={`Welcome to ${APP_NAME}`}
            subTitle={
              <span>
                A Matrix chat client based on{' '}
                <a href={UPSTREAM_URL} target="_blank" rel="noreferrer noopener">
                  {UPSTREAM_NAME}
                </a>
                .{' '}
                <a href={`${APP_REPO_URL}/releases`} target="_blank" rel="noreferrer noopener">
                  v{APP_VERSION}
                </a>
              </span>
            }
          >
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href={APP_REPO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  before={<Icon size="200" src={Icons.Code} />}
                >
                  <Text as="span" size="B400" truncate>
                    Source Code
                  </Text>
                </Button>
                <Button
                  as="a"
                  href={UPSTREAM_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  fill="Soft"
                  before={<Icon size="200" src={Icons.Heart} />}
                >
                  <Text as="span" size="B400" truncate>
                    {UPSTREAM_NAME} (upstream)
                  </Text>
                </Button>
              </Box>
            </Box>
          </PageHero>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
