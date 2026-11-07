import React from 'react';
import { Icon, IconButton, Icons, Text, toRem } from 'folds';
import { getActivePlugins } from '../../plugins/userPlugins';
import { useUserPlugins } from '../../state/userPlugins';
import { setPluginCollapsed, usePluginDock } from '../../state/pluginDock';
import { PluginFrame } from './PluginFrame';

/**
 * Pinned plugins as small cards above the user panel in the left column (switch on "Show in
 * sidebar" per plugin in Settings > Plugins). Each card can be collapsed to its title.
 */
export function PluginDock() {
  const plugins = useUserPlugins();
  const { pinned, collapsed, styles } = usePluginDock();
  const shown = getActivePlugins(plugins).filter((p) => pinned.includes(p.id));

  if (shown.length === 0) return null;

  return (
    <div
      style={{
        maxHeight: toRem(320),
        overflowY: 'auto',
        boxShadow: 'inset 0 -1px 0 color-mix(in srgb, currentColor 10%, transparent)',
      }}
    >
      {shown.map((plugin) => {
        const isCollapsed = collapsed.includes(plugin.id);
        return (
          <div key={plugin.id} style={{ padding: toRem(8) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: toRem(4) }}>
              <Text size="L400" style={{ flexGrow: 1, minWidth: 0 }} truncate>
                {plugin.name}
              </Text>
              <IconButton
                size="300"
                radii="Pill"
                variant="Surface"
                fill="None"
                aria-label={isCollapsed ? `Expand ${plugin.name}` : `Collapse ${plugin.name}`}
                aria-expanded={!isCollapsed}
                onClick={() => setPluginCollapsed(plugin.id, !isCollapsed)}
              >
                <Icon size="100" src={isCollapsed ? Icons.ChevronBottom : Icons.ChevronTop} />
              </IconButton>
            </div>
            {!isCollapsed && (
              <div style={{ marginTop: toRem(4) }}>
                <PluginFrame plugin={plugin} compact look={styles[plugin.id]} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
