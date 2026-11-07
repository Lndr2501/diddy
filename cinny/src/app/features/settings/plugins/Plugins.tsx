import React, { FormEventHandler, useState } from 'react';
import { Box, Button, color, config, Icon, Icons, Input, Switch, Text } from 'folds';
import {
  DOCK_DEFAULT_HEIGHT,
  DOCK_MAX_HEIGHT,
  DOCK_MIN_HEIGHT,
  MAX_CUSTOM_CSS,
  MAX_ZOOM,
  MIN_ZOOM,
  PluginStyle,
  setPluginPinned,
  setPluginStyle,
  usePluginDock,
} from '../../../state/pluginDock';
import { InsetGroup, InsetItem, InsetRow, InsetSection, SettingsPage } from '../inset-list';
import * as sheetCss from '../../../components/sheet/Sheet.css';
import { BreakWord } from '../../../styles/Text.css';
import { APP_REPO_URL } from '../../../appInfo';
import { BUILTIN_URL_PREFIX, MAX_PLUGINS, UserPlugin } from '../../../plugins/userPlugins';
import { getBuiltinPlugins } from '../../../plugins/builtinPlugins';
import {
  addBuiltinUserPlugin,
  addUserPlugin,
  removeUserPlugin,
  setUserPluginEnabled,
  useUserPlugins,
} from '../../../state/userPlugins';
import { PluginFrame } from '../../plugins/PluginFrame';

const DOCS_URL = `${APP_REPO_URL}/blob/main/docs/plugins.md`;

function AddPluginForm({ full }: { full: boolean }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string>();

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const result = addUserPlugin({ name, url });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setName('');
    setUrl('');
  };

  return (
    <Box as="form" direction="Column" gap="300" onSubmit={handleSubmit} noValidate>
      <Box gap="200" wrap="Wrap">
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 160, flexBasis: 160 }}>
          <Text as="label" htmlFor="diddy-plugin-name" size="L400">
            Name
          </Text>
          <Input
            id="diddy-plugin-name"
            value={name}
            onChange={(evt) => {
              setName(evt.currentTarget.value);
              setError(undefined);
            }}
            placeholder="Weather"
            maxLength={80}
            autoComplete="off"
            variant="Secondary"
            radii="300"
            disabled={full}
          />
        </Box>
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 220, flexBasis: 260 }}>
          <Text as="label" htmlFor="diddy-plugin-url" size="L400">
            Address
          </Text>
          <Input
            id="diddy-plugin-url"
            value={url}
            onChange={(evt) => {
              setUrl(evt.currentTarget.value);
              setError(undefined);
            }}
            placeholder="https://example.com/plugin.html"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            variant="Secondary"
            radii="300"
            disabled={full}
          />
        </Box>
      </Box>
      <Box alignItems="Center" justifyContent="SpaceBetween" gap="300" wrap="Wrap">
        <Text
          size="T200"
          role={error ? 'alert' : undefined}
          className={BreakWord}
          style={{ color: error ? color.Critical.Main : undefined, flex: '1 1 200px' }}
        >
          {error ??
            (full
              ? `You have reached the limit of ${MAX_PLUGINS} plugins.`
              : 'https:// addresses, or http://localhost while you build a plugin.')}
        </Text>
        <Button
          className={sheetCss.Pill}
          type="submit"
          variant="Primary"
          size="300"
          radii="Pill"
          disabled={full || !name.trim() || !url.trim()}
          before={<Icon src={Icons.Plus} size="100" />}
        >
          <Text size="B300">Add Plugin</Text>
        </Button>
      </Box>
    </Box>
  );
}

type PluginLookEditorProps = { id: string; look?: PluginStyle };
/**
 * Look of one plugin. Height and zoom shape its small card in the sidebar and work for every
 * plugin. The custom CSS is sent to the plugin with `diddy:init`; plugins that support it apply it.
 */
function PluginLookEditor({ id, look }: PluginLookEditorProps) {
  const field = { display: 'flex', alignItems: 'center', gap: config.space.S200 } as const;
  return (
    <Box direction="Column" gap="200">
      <Text size="L400">Sidebar card</Text>
      <div style={field}>
        <Text as="label" size="T200" htmlFor={`plugin-height-${id}`} style={{ width: 90 }}>
          Height (px)
        </Text>
        <input
          id={`plugin-height-${id}`}
          type="range"
          min={DOCK_MIN_HEIGHT}
          max={DOCK_MAX_HEIGHT}
          step={4}
          value={look?.height ?? DOCK_DEFAULT_HEIGHT}
          onChange={(evt) => setPluginStyle(id, { height: Number(evt.target.value) })}
          style={{ flexGrow: 1 }}
        />
        <Text size="T200" style={{ width: 36, textAlign: 'right' }}>
          {look?.height ?? DOCK_DEFAULT_HEIGHT}
        </Text>
      </div>
      <div style={field}>
        <Text as="label" size="T200" htmlFor={`plugin-zoom-${id}`} style={{ width: 90 }}>
          Zoom (%)
        </Text>
        <input
          id={`plugin-zoom-${id}`}
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={5}
          value={look?.zoom ?? MAX_ZOOM}
          onChange={(evt) => setPluginStyle(id, { zoom: Number(evt.target.value) })}
          style={{ flexGrow: 1 }}
        />
        <Text size="T200" style={{ width: 36, textAlign: 'right' }}>
          {look?.zoom ?? MAX_ZOOM}
        </Text>
      </div>
      <Text as="label" size="L400" htmlFor={`plugin-css-${id}`}>
        Custom CSS
      </Text>
      <textarea
        id={`plugin-css-${id}`}
        value={look?.css ?? ''}
        maxLength={MAX_CUSTOM_CSS}
        rows={4}
        spellCheck={false}
        placeholder=".temp { font-size: 18px; }"
        onChange={(evt) => setPluginStyle(id, { css: evt.target.value })}
        style={{
          width: '100%',
          resize: 'vertical',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          padding: config.space.S200,
          borderRadius: 8,
          background: 'transparent',
          color: 'inherit',
          border: `1px solid ${color.Surface.ContainerLine}`,
        }}
      />
      <Text size="T200" priority="300">
        Sent to the plugin, which decides whether to apply it. Height and zoom work for every
        plugin.
      </Text>
    </Box>
  );
}

type PluginRowProps = {
  plugin: UserPlugin;
  confirming: boolean;
  onConfirm: (confirming: boolean) => void;
};
function PluginRow({ plugin, confirming, onConfirm }: PluginRowProps) {
  const dock = usePluginDock();
  const pinned = dock.pinned.includes(plugin.id);
  const look = dock.styles[plugin.id];
  return (
    <InsetRow
      title={plugin.name}
      description={plugin.url}
      after={
        <Box alignItems="Center" gap="200" wrap="Wrap" justifyContent="End">
          {confirming ? (
            <>
              <Button
                className={sheetCss.Pill}
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="Pill"
                onClick={() => onConfirm(false)}
              >
                <Text size="B300">Cancel</Text>
              </Button>
              <Button
                className={sheetCss.Pill}
                variant="Critical"
                size="300"
                radii="Pill"
                onClick={() => {
                  onConfirm(false);
                  removeUserPlugin(plugin.id);
                }}
              >
                <Text size="B300">Remove</Text>
              </Button>
            </>
          ) : (
            <>
              {plugin.enabled && (
                <Box alignItems="Center" gap="100">
                  <Text size="T200" priority="300">
                    Sidebar
                  </Text>
                  <Switch
                    variant="Primary"
                    value={pinned}
                    onChange={(value) => setPluginPinned(plugin.id, value)}
                    aria-label={`Show ${plugin.name} in the sidebar`}
                  />
                </Box>
              )}
              <Switch
                variant="Primary"
                value={plugin.enabled}
                onChange={(enabled) => setUserPluginEnabled(plugin.id, enabled)}
                aria-label={plugin.enabled ? `Turn off ${plugin.name}` : `Turn on ${plugin.name}`}
              />
              <Button
                className={sheetCss.Pill}
                variant="Critical"
                fill="Soft"
                size="300"
                radii="Pill"
                onClick={() => onConfirm(true)}
                aria-label={`Remove ${plugin.name}`}
              >
                <Text size="B300">Remove</Text>
              </Button>
            </>
          )}
        </Box>
      }
    >
      {plugin.enabled && (
        <Box direction="Column" gap="300" style={{ marginTop: config.space.S300 }}>
          <PluginFrame plugin={plugin} look={look} />
          <PluginLookEditor id={plugin.id} look={look} />
        </Box>
      )}
    </InsetRow>
  );
}

type PluginsProps = {
  requestClose: () => void;
};
export function Plugins({ requestClose }: PluginsProps) {
  const plugins = useUserPlugins();
  const [confirmId, setConfirmId] = useState<string>();
  const full = plugins.length >= MAX_PLUGINS;

  const builtins = getBuiltinPlugins();

  return (
    <SettingsPage title="Plugins" requestClose={requestClose}>
      {builtins.length > 0 && (
        <InsetSection
          title="Built-in Plugins"
          footer="Ready to use: no account, no key. They run isolated like every other plugin and show up as small cards in the sidebar."
        >
          <InsetGroup>
            {builtins.map((builtin) => {
              const added = plugins.some((p) => p.url === `${BUILTIN_URL_PREFIX}${builtin.slug}`);
              return (
                <InsetRow
                  key={builtin.slug}
                  title={builtin.name}
                  description={builtin.description}
                  after={
                    <Button
                      className={sheetCss.Pill}
                      variant={added ? 'Secondary' : 'Primary'}
                      fill={added ? 'None' : 'Soft'}
                      size="300"
                      radii="Pill"
                      disabled={added || full}
                      onClick={() => {
                        const result = addBuiltinUserPlugin(builtin.slug, builtin.name);
                        if (!result.ok) return;
                        const created = result.value.find(
                          (p) => p.url === `${BUILTIN_URL_PREFIX}${builtin.slug}`
                        );
                        if (created) setPluginPinned(created.id, true);
                      }}
                    >
                      <Text size="B300">{added ? 'Added' : 'Add'}</Text>
                    </Button>
                  }
                />
              );
            })}
          </InsetGroup>
        </InsetSection>
      )}
      <InsetSection
        title="Add Plugin"
        footer={
          <>
            A plugin is a web page shown inside Diddy, for example a weather widget. It runs
            isolated from the app and never sees your account, messages or login. Only add pages you
            trust.{' '}
            <a href={DOCS_URL} target="_blank" rel="noreferrer noopener">
              How to build a plugin
            </a>
          </>
        }
      >
        <InsetGroup>
          <InsetItem>
            <AddPluginForm full={full} />
          </InsetItem>
        </InsetGroup>
      </InsetSection>
      <InsetSection
        title={`Your Plugins (${plugins.length}/${MAX_PLUGINS})`}
        footer="Active plugins appear in the Plugins tab of the sidebar. They are stored on this device only."
      >
        <InsetGroup>
          {plugins.length === 0 ? (
            <InsetRow
              title="No plugins yet"
              description="Add the address of a plugin above to see it here."
            />
          ) : (
            plugins.map((plugin) => (
              <PluginRow
                key={plugin.id}
                plugin={plugin}
                confirming={confirmId === plugin.id}
                onConfirm={(confirming) => setConfirmId(confirming ? plugin.id : undefined)}
              />
            ))
          )}
        </InsetGroup>
      </InsetSection>
    </SettingsPage>
  );
}
