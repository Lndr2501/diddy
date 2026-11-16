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
import {
  BUILTIN_URL_PREFIX,
  localPluginId,
  MAX_PLUGINS,
  UserPlugin,
} from '../../../plugins/userPlugins';
import { getBuiltinPlugins } from '../../../plugins/builtinPlugins';
import {
  addBuiltinUserPlugin,
  addUserPlugin,
  removeUserPlugin,
  setUserPluginEnabled,
  useUserPlugins,
} from '../../../state/userPlugins';
import { PluginFrame } from '../../plugins/PluginFrame';
import { AddLocalPluginForm, LocalPluginDescription, LocalPluginTools } from './LocalPlugins';
import { useTranslation } from 'react-i18next';

const DOCS_URL = `${APP_REPO_URL}/blob/main/docs/plugins.md`;

function AddPluginForm({ full }: { full: boolean }) {
  const { t } = useTranslation();
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
            {t('settings.plugins.name')}
          </Text>
          <Input
            id="diddy-plugin-name"
            value={name}
            onChange={(evt) => {
              setName(evt.currentTarget.value);
              setError(undefined);
            }}
            placeholder={t('settings.plugins.weather')}
            maxLength={80}
            autoComplete="off"
            variant="Secondary"
            radii="300"
            disabled={full}
          />
        </Box>
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 220, flexBasis: 260 }}>
          <Text as="label" htmlFor="diddy-plugin-url" size="L400">
            {t('settings.plugins.address')}
          </Text>
          <Input
            id="diddy-plugin-url"
            value={url}
            onChange={(evt) => {
              setUrl(evt.currentTarget.value);
              setError(undefined);
            }}
            placeholder={t('settings.plugins.httpsExampleComPlugin')}
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
              ? t('settings.plugins.youHaveReachedThe', { maxPlugins: MAX_PLUGINS })
              : t('settings.plugins.httpsAddressesOrHttp'))}
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
          <Text size="B300">{t('settings.plugins.addPlugin')}</Text>
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
  const { t } = useTranslation();
  const field = { display: 'flex', alignItems: 'center', gap: config.space.S200 } as const;
  return (
    <Box direction="Column" gap="200">
      <Text size="L400">{t('settings.plugins.sidebarCard')}</Text>
      <div style={field}>
        <Text as="label" size="T200" htmlFor={`plugin-height-${id}`} style={{ width: 90 }}>
          {t('settings.plugins.heightPx')}
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
          {t('settings.plugins.zoom')}
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
        {t('settings.plugins.customCss')}
      </Text>
      <textarea
        id={`plugin-css-${id}`}
        value={look?.css ?? ''}
        maxLength={MAX_CUSTOM_CSS}
        rows={4}
        spellCheck={false}
        placeholder={t('settings.plugins.tempFontSize18px')}
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
        {t('settings.plugins.sentToThePlugin')}
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
  const { t } = useTranslation();
  const dock = usePluginDock();
  const pinned = dock.pinned.includes(plugin.id);
  const look = dock.styles[plugin.id];
  const local = localPluginId(plugin.url) === plugin.id;
  return (
    <InsetRow
      title={plugin.name}
      description={local ? <LocalPluginDescription plugin={plugin} /> : plugin.url}
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
                <Text size="B300">{t('settings.plugins.cancel')}</Text>
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
                <Text size="B300">{t('settings.plugins.remove')}</Text>
              </Button>
            </>
          ) : (
            <>
              {plugin.enabled && (
                <Box alignItems="Center" gap="100">
                  <Text size="T200" priority="300">
                    {t('settings.plugins.sidebar')}
                  </Text>
                  <Switch
                    variant="Primary"
                    value={pinned}
                    onChange={(value) => setPluginPinned(plugin.id, value)}
                    aria-label={t('settings.plugins.showNameInThe', { name: plugin.name })}
                  />
                </Box>
              )}
              <Switch
                variant="Primary"
                value={plugin.enabled}
                onChange={(enabled) => setUserPluginEnabled(plugin.id, enabled)}
                aria-label={
                  plugin.enabled
                    ? t('settings.plugins.turnOffName', { name: plugin.name })
                    : t('settings.plugins.turnOnName', { name: plugin.name })
                }
              />
              <Button
                className={sheetCss.Pill}
                variant="Critical"
                fill="Soft"
                size="300"
                radii="Pill"
                onClick={() => onConfirm(true)}
                aria-label={t('settings.plugins.removeName', { name: plugin.name })}
              >
                <Text size="B300">{t('settings.plugins.remove')}</Text>
              </Button>
            </>
          )}
        </Box>
      }
    >
      {(plugin.enabled || local) && (
        <Box direction="Column" gap="300" style={{ marginTop: config.space.S300 }}>
          {plugin.enabled && <PluginFrame plugin={plugin} look={look} />}
          {local && <LocalPluginTools plugin={plugin} />}
          {plugin.enabled && <PluginLookEditor id={plugin.id} look={look} />}
        </Box>
      )}
    </InsetRow>
  );
}

type PluginsProps = {
  requestClose: () => void;
};
export function Plugins({ requestClose }: PluginsProps) {
  const { t } = useTranslation();
  const plugins = useUserPlugins();
  const [confirmId, setConfirmId] = useState<string>();
  const full = plugins.length >= MAX_PLUGINS;

  const builtins = getBuiltinPlugins();

  return (
    <SettingsPage title={t('settings.plugins.plugins')} requestClose={requestClose}>
      {builtins.length > 0 && (
        <InsetSection
          title={t('settings.plugins.builtInPlugins')}
          footer={t('settings.plugins.readyToUseNo')}
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
                      <Text size="B300">
                        {added ? t('settings.plugins.added') : t('settings.plugins.add')}
                      </Text>
                    </Button>
                  }
                />
              );
            })}
          </InsetGroup>
        </InsetSection>
      )}
      <InsetSection
        title={t('settings.plugins.addPlugin')}
        footer={
          <>
            {t('settings.plugins.aPluginIsA')}{' '}
            <a href={DOCS_URL} target="_blank" rel="noreferrer noopener">
              {t('settings.plugins.howToBuildA')}
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
        title={t('settings.plugins.withoutHosting')}
        footer={
          <>
            {t('settings.plugins.noServerNeededThe')}{' '}
            <a
              href={`${DOCS_URL}#ohne-hosting-aus-datei-code-oder-github`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('settings.plugins.more')}
            </a>
          </>
        }
      >
        <InsetGroup>
          <InsetItem>
            <AddLocalPluginForm full={full} />
          </InsetItem>
        </InsetGroup>
      </InsetSection>
      <InsetSection
        title={t('settings.plugins.yourPluginsCountMaxplugins', {
          count: plugins.length,
          maxPlugins: MAX_PLUGINS,
        })}
        footer={t('settings.plugins.activePluginsAppearIn')}
      >
        <InsetGroup>
          {plugins.length === 0 ? (
            <InsetRow
              title={t('settings.plugins.noPluginsYet')}
              description={t('settings.plugins.addABuiltIn')}
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
