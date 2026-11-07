import React, { useState } from 'react';
import { Icon, Icons } from 'folds';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { SettingsSheet } from '../../../components/SettingsSheet';
import { PluginsPanel } from '../../../features/plugins/PluginsPanel';
import { useUserPlugins } from '../../../state/userPlugins';

/** Opens the user's plugins (#54). Only shown while at least one plugin is turned on. */
export function PluginsTab() {
  const plugins = useUserPlugins();
  const [opened, setOpened] = useState(false);
  const hasActive = plugins.some((plugin) => plugin.enabled);

  if (!hasActive && !opened) return null;

  const close = () => setOpened(false);

  return (
    <SidebarItem active={opened}>
      <SidebarItemTooltip tooltip="Plugins">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={() => setOpened(true)}>
            <Icon src={Icons.Category} filled={opened} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {opened && (
        <SettingsSheet requestClose={close} label="Plugins">
          <PluginsPanel requestClose={close} />
        </SettingsSheet>
      )}
    </SidebarItem>
  );
}
