import React, { useState } from 'react';
import classNames from 'classnames';
import { Box, Button, Icon, Icons, Text } from 'folds';
import { usePluginDock } from '../../state/pluginDock';
import { getActivePlugins } from '../../plugins/userPlugins';
import { useUserPlugins } from '../../state/userPlugins';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import {
  InsetGroup,
  InsetItem,
  InsetRow,
  InsetSection,
  SettingsPage,
} from '../settings/inset-list';
import { Settings, SettingsPages } from '../settings';
import * as settingsCss from '../settings/styles.css';
import * as sheetCss from '../../components/sheet/Sheet.css';
import { PluginFrame } from './PluginFrame';

type PluginsPanelProps = {
  requestClose: () => void;
};
/** The active plugins as cards, opened from the Plugins tab of the sidebar. */
export function PluginsPanel({ requestClose }: PluginsPanelProps) {
  const plugins = useUserPlugins();
  const { styles } = usePluginDock();
  const active = getActivePlugins(plugins);
  const compact = useScreenSizeContext() === ScreenSize.Mobile;
  const [manage, setManage] = useState(false);

  if (manage) {
    return <Settings initialPage={SettingsPages.PluginsPage} requestClose={requestClose} />;
  }

  return (
    <div className={classNames(settingsCss.Content, compact && settingsCss.ContentCompact)}>
      <SettingsPage title="Plugins" requestClose={requestClose}>
        {active.length === 0 && (
          <InsetGroup>
            <InsetRow
              title="No active plugins"
              description="Turn a plugin on or add a new one in the plugin settings."
            />
          </InsetGroup>
        )}
        {active.map((plugin) => (
          <InsetSection key={plugin.id} title={plugin.name}>
            <InsetGroup>
              <InsetItem>
                <PluginFrame plugin={plugin} look={styles[plugin.id]} />
              </InsetItem>
            </InsetGroup>
          </InsetSection>
        ))}
        <Box justifyContent="Center">
          <Button
            className={sheetCss.Pill}
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="Pill"
            onClick={() => setManage(true)}
            before={<Icon src={Icons.Setting} size="100" />}
          >
            <Text size="B300">Manage Plugins</Text>
          </Button>
        </Box>
      </SettingsPage>
    </div>
  );
}
