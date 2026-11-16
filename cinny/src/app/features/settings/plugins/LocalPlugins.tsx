/**
 * Plugins without hosting (#98): add a plugin from an HTML file, from pasted code or from a
 * one-time import of a GitHub file or Gist. The HTML is stored on this device and shown with
 * `srcdoc` in the same sandbox as every other plugin.
 */
import React, { DragEventHandler, useEffect, useRef, useState } from 'react';
import { Box, Button, color, config, Icon, Icons, Input, Spinner, Text } from 'folds';
import * as sheetCss from '../../../components/sheet/Sheet.css';
import { BreakWord } from '../../../styles/Text.css';
import { MAX_PLUGINS, UserPlugin, localPluginUrl } from '../../../plugins/userPlugins';
import {
  checkPluginFile,
  defaultPluginName,
  fetchSourceHtml,
  formatSize,
  LocalOrigin,
  LocalPluginRecord,
  MAX_LOCAL_PLUGIN_BYTES,
  nameFromFileName,
  Result,
  sha256Hex,
  shortHash,
  toRawSourceUrl,
  validateLocalHtml,
} from '../../../plugins/localPlugins';
import { addLocalUserPlugin, replaceLocalUserPlugin } from '../../../state/userPlugins';
import { useLocalPluginRecord } from '../../../state/localPlugins';
import { setPluginPinned } from '../../../state/pluginDock';
import { SegmentedControl } from '../inset-list';
import { PluginFrame } from '../../plugins/PluginFrame';
import { useTranslation } from 'react-i18next';
import { translate } from '../../../i18n';

type Mode = 'file' | 'paste' | 'github';

const ACCEPT = '.html,.htm,text/html';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const textareaStyle: React.CSSProperties = {
  width: '100%',
  resize: 'vertical',
  fontFamily: MONO,
  fontSize: 12,
  padding: config.space.S200,
  borderRadius: 8,
  background: 'transparent',
  color: 'inherit',
  border: `1px solid ${color.Surface.ContainerLine}`,
};

const makeRecord = async (
  html: string,
  origin: LocalOrigin,
  extra: Partial<LocalPluginRecord> = {}
): Promise<LocalPluginRecord> => ({
  html,
  sha256: await sha256Hex(html),
  size: new TextEncoder().encode(html).length,
  origin,
  updatedAt: Date.now(),
  ...extra,
});

/** Reads a picked or dropped file and checks it is a plugin page. */
const readPluginFile = async (file: File): Promise<Result<string>> => {
  const check = checkPluginFile(file);
  if (!check.ok) return check;
  try {
    return validateLocalHtml(await file.text());
  } catch {
    return { ok: false, error: translate('settings.localPlugins.couldNotReadThe') };
  }
};

/** Fetches a GitHub/Gist link once (validated, size capped, with timeout). */
const importFromSource = async (
  input: string
): Promise<Result<{ html: string; rawUrl: string; kind: 'github' | 'gist'; label: string }>> => {
  const source = toRawSourceUrl(input);
  if (!source.ok) return source;
  const html = await fetchSourceHtml(source.value.rawUrl, (url, init) => fetch(url, init));
  if (!html.ok) return html;
  return { ok: true, value: { html: html.value, ...source.value } };
};

/** Debounced copy of a value, so the live preview does not reload on every key press. */
const useDebounced = <T,>(value: T, ms: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
};

const PREVIEW_PLUGIN: UserPlugin = {
  id: 'preview',
  get name() {
    return translate('settings.localPlugins.preview');
  },
  url: localPluginUrl('preview'),
  enabled: true,
  addedAt: 0,
};

function Message({ error, children }: { error?: string; children?: React.ReactNode }) {
  return (
    <Text
      size="T200"
      role={error ? 'alert' : undefined}
      className={BreakWord}
      style={{ color: error ? color.Critical.Main : undefined, flex: '1 1 200px' }}
    >
      {error ?? children}
    </Text>
  );
}

type FilePickerProps = {
  disabled?: boolean;
  label: string;
  onFile: (file: File) => void;
};
/** A button that opens the file picker; the file input itself stays hidden. */
function FilePickerButton({ disabled, label, onFile }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(evt) => {
          const file = evt.currentTarget.files?.[0];
          // allow picking the same file again (quick reload while developing)
          // eslint-disable-next-line no-param-reassign
          evt.currentTarget.value = '';
          if (file) onFile(file);
        }}
      />
      <Button
        className={sheetCss.Pill}
        type="button"
        variant="Secondary"
        fill="Soft"
        size="300"
        radii="Pill"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        before={<Icon src={Icons.File} size="100" />}
      >
        <Text size="B300">{label}</Text>
      </Button>
    </>
  );
}

function NameField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const { t } = useTranslation();
  return (
    <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 160, flexBasis: 160 }}>
      <Text as="label" htmlFor="diddy-local-plugin-name" size="L400">
        {t('settings.localPlugins.nameOptional')}
      </Text>
      <Input
        id="diddy-local-plugin-name"
        value={value}
        onChange={(evt) => onChange(evt.currentTarget.value)}
        placeholder={placeholder}
        maxLength={80}
        autoComplete="off"
        variant="Secondary"
        radii="300"
        disabled={disabled}
      />
    </Box>
  );
}

const pinNew = (plugins: UserPlugin[]) => {
  const created = plugins[plugins.length - 1];
  if (created) setPluginPinned(created.id, true);
};

export function AddLocalPluginForm({ full }: { full: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('file');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const preview = useDebounced(code, 600);
  const previewOk = mode === 'paste' && validateLocalHtml(preview).ok;

  const reset = (message: string) => {
    setError(undefined);
    setNotice(message);
    setName('');
  };

  const addFile = async (file: File) => {
    if (full || busy) return;
    setBusy(true);
    setNotice(undefined);
    const html = await readPluginFile(file);
    if (!html.ok) {
      setError(html.error);
      setBusy(false);
      return;
    }
    const record = await makeRecord(html.value, 'file', { fileName: file.name.slice(0, 200) });
    const pluginName = defaultPluginName(name, html.value, nameFromFileName(file.name) || t('settings.localPlugins.plugin'));
    const result = await addLocalUserPlugin(pluginName, record);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    pinNew(result.value);
    reset(t('settings.localPlugins.addedName', { name: result.value[result.value.length - 1].name }));
  };

  const addCode = async () => {
    const html = validateLocalHtml(code);
    if (!html.ok) {
      setError(html.error);
      return;
    }
    setBusy(true);
    const record = await makeRecord(html.value, 'paste');
    const result = await addLocalUserPlugin(
      defaultPluginName(name, html.value, t('settings.localPlugins.myPlugin')),
      record
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    pinNew(result.value);
    setCode('');
    reset(t('settings.localPlugins.addedName', { name: result.value[result.value.length - 1].name }));
  };

  const addSource = async () => {
    setBusy(true);
    setNotice(undefined);
    const imported = await importFromSource(source);
    if (!imported.ok) {
      setError(imported.error);
      setBusy(false);
      return;
    }
    const { html, rawUrl, kind, label } = imported.value;
    const record = await makeRecord(html, kind, {
      sourceUrl: source.trim().slice(0, 2048),
      rawUrl,
      fetchedAt: Date.now(),
    });
    const fallback = nameFromFileName(label.split('/').pop() ?? '') || t('settings.localPlugins.plugin');
    const result = await addLocalUserPlugin(defaultPluginName(name, html, fallback), record);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    pinNew(result.value);
    setSource('');
    reset(
      t('settings.localPlugins.importedNameShorthash', { name: result.value[result.value.length - 1].name, shortHash: shortHash(record.sha256) })
    );
  };

  const onDrop: DragEventHandler<HTMLDivElement> = (evt) => {
    evt.preventDefault();
    setDragging(false);
    const file = evt.dataTransfer.files?.[0];
    if (file) addFile(file);
  };

  const hint =
    mode === 'github'
      ? t('settings.localPlugins.loadedOnceAndStored')
      : t('settings.localPlugins.storedOnThisDevice', { size: formatSize(MAX_LOCAL_PLUGIN_BYTES) });

  return (
    <Box direction="Column" gap="300">
      <SegmentedControl<Mode>
        aria-label={t('settings.localPlugins.howToAddThe')}
        value={mode}
        onChange={(value) => {
          setMode(value);
          setError(undefined);
          setNotice(undefined);
        }}
        options={[
          { value: 'file', label: t('settings.localPlugins.fromFile') },
          { value: 'paste', label: t('settings.localPlugins.pasteCode') },
          { value: 'github', label: t('settings.localPlugins.githubGist') },
        ]}
      />
      <Box gap="200" wrap="Wrap">
        <NameField
          value={name}
          onChange={(value) => {
            setName(value);
            setError(undefined);
          }}
          disabled={full}
          placeholder={mode === 'file' ? t('settings.localPlugins.pageTitleOrFile') : t('settings.localPlugins.pageTitle')}
        />
      </Box>

      {mode === 'file' && (
        <div
          onDragOver={(evt) => {
            evt.preventDefault();
            if (!full) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: `1px dashed ${dragging ? color.Primary.Main : color.Surface.ContainerLine}`,
            borderRadius: 12,
            padding: config.space.S400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: config.space.S200,
            textAlign: 'center',
          }}
        >
          <Text size="T300">{t('settings.localPlugins.dropAnHtmlFile')}</Text>
          <FilePickerButton disabled={full || busy} label={t('settings.localPlugins.chooseFile')} onFile={addFile} />
        </div>
      )}

      {mode === 'paste' && (
        <Box direction="Column" gap="200">
          <Text as="label" size="L400" htmlFor="diddy-local-plugin-code">
            {t('settings.localPlugins.html')}
          </Text>
          <textarea
            id="diddy-local-plugin-code"
            value={code}
            rows={10}
            spellCheck={false}
            placeholder={t('settings.localPlugins.doctypeHtmlHtmlBody')}
            onChange={(evt) => {
              setCode(evt.target.value);
              setError(undefined);
              setNotice(undefined);
            }}
            disabled={full}
            style={textareaStyle}
          />
          {previewOk && (
            <>
              <Text size="L400">{t('settings.localPlugins.livePreview')}</Text>
              <PluginFrame plugin={PREVIEW_PLUGIN} previewHtml={preview} />
            </>
          )}
        </Box>
      )}

      {mode === 'github' && (
        <Box direction="Column" gap="100">
          <Text as="label" htmlFor="diddy-local-plugin-source" size="L400">
            {t('settings.localPlugins.githubFileOrGist')}
          </Text>
          <Input
            id="diddy-local-plugin-source"
            value={source}
            onChange={(evt) => {
              setSource(evt.currentTarget.value);
              setError(undefined);
              setNotice(undefined);
            }}
            placeholder={t('settings.localPlugins.httpsGithubComUser')}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            variant="Secondary"
            radii="300"
            disabled={full}
          />
        </Box>
      )}

      <Box alignItems="Center" justifyContent="SpaceBetween" gap="300" wrap="Wrap">
        <Message error={error}>
          {notice ?? (full ? t('settings.localPlugins.youHaveReachedThe', { maxPlugins: MAX_PLUGINS }) : hint)}
        </Message>
        {busy && <Spinner variant="Secondary" size="200" />}
        {mode === 'paste' && (
          <Button
            className={sheetCss.Pill}
            type="button"
            variant="Primary"
            size="300"
            radii="Pill"
            disabled={full || busy || !code.trim()}
            onClick={addCode}
            before={<Icon src={Icons.Plus} size="100" />}
          >
            <Text size="B300">{t('settings.localPlugins.addPlugin')}</Text>
          </Button>
        )}
        {mode === 'github' && (
          <Button
            className={sheetCss.Pill}
            type="button"
            variant="Primary"
            size="300"
            radii="Pill"
            disabled={full || busy || !source.trim()}
            onClick={addSource}
            before={<Icon src={Icons.Download} size="100" />}
          >
            <Text size="B300">{t('settings.localPlugins.import')}</Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}

const formatTime = (time: number | undefined): string => {
  if (!time) return '';
  try {
    return new Date(time).toLocaleString();
  } catch {
    return '';
  }
};

/** One line under a local plugin's name: where it came from, size and short hash. */
export function LocalPluginDescription({ plugin }: { plugin: UserPlugin }) {
  const { t } = useTranslation();
  const record = useLocalPluginRecord(plugin.id);
  if (record === undefined) return <>{t('settings.localPlugins.localPlugin')}</>;
  if (record === null) {
    return (
      <span style={{ color: color.Critical.Main }}>
        {t('settings.localPlugins.contentMissingOnThis')}
      </span>
    );
  }
  const hash = <code title={t('settings.localPlugins.sha256Sha256', { sha256: record.sha256 })}>{shortHash(record.sha256)}</code>;
  const source = record.rawUrl ? toRawSourceUrl(record.rawUrl) : undefined;
  if ((record.origin === 'github' || record.origin === 'gist') && source?.ok) {
    // link only to an address that passes the same checks as at import time
    const href =
      record.sourceUrl && toRawSourceUrl(record.sourceUrl).ok
        ? new URL(
            record.sourceUrl.includes('://') ? record.sourceUrl : `https://${record.sourceUrl}`
          ).href
        : source.value.rawUrl;
    return (
      <>
        {t('settings.localPlugins.from')}{' '}{record.origin === 'gist' ? t('settings.localPlugins.gist') : 'GitHub'}{' '}
        <a href={href} target="_blank" rel="noreferrer noopener">
          {source.value.label}
        </a>{' '}{t('settings.localPlugins.loadedTimeSize', { time: formatTime(record.fetchedAt), size: formatSize(record.size) })}{' '}{hash}
      </>
    );
  }
  const what = record.origin === 'file' ? t('settings.localPlugins.fileName', { name: record.fileName ?? '' }).trim() : t('settings.localPlugins.pastedCode');
  return (
    <>
      {t('settings.localPlugins.local')}{' '}{what} · {formatSize(record.size)} · {hash}
    </>
  );
}

type Pending = { record: LocalPluginRecord; changed: boolean };

/** Replace the stored HTML of a local plugin: from a file, edited code, or its GitHub source. */
export function LocalPluginTools({ plugin }: { plugin: UserPlugin }) {
  const { t } = useTranslation();
  const record = useLocalPluginRecord(plugin.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<Pending>();

  if (!record) return null;
  const fromSource = (record.origin === 'github' || record.origin === 'gist') && !!record.rawUrl;

  const done = (message: string) => {
    setError(undefined);
    setNotice(message);
  };

  const replaceFile = async (file: File) => {
    setBusy(true);
    setNotice(undefined);
    const html = await readPluginFile(file);
    if (!html.ok) {
      setError(html.error);
      setBusy(false);
      return;
    }
    const next = await makeRecord(html.value, 'file', { fileName: file.name.slice(0, 200) });
    await replaceLocalUserPlugin(plugin.id, next);
    setBusy(false);
    done(
      next.sha256 === record.sha256
        ? t('settings.localPlugins.reloadedTheContentIs')
        : t('settings.localPlugins.replacedShorthash', { shortHash: shortHash(next.sha256) })
    );
  };

  const saveCode = async () => {
    const html = validateLocalHtml(code);
    if (!html.ok) {
      setError(html.error);
      return;
    }
    setBusy(true);
    const next = await makeRecord(html.value, 'paste');
    await replaceLocalUserPlugin(plugin.id, next);
    setBusy(false);
    setEditing(false);
    done(t('settings.localPlugins.savedShorthash', { shortHash: shortHash(next.sha256) }));
  };

  const checkSource = async () => {
    if (!record.rawUrl) return;
    setBusy(true);
    setNotice(undefined);
    setPending(undefined);
    const html = await fetchSourceHtml(record.rawUrl, (url, init) => fetch(url, init));
    setBusy(false);
    if (!html.ok) {
      setError(html.error);
      return;
    }
    const next = await makeRecord(html.value, record.origin, {
      sourceUrl: record.sourceUrl,
      rawUrl: record.rawUrl,
      fetchedAt: Date.now(),
    });
    setError(undefined);
    setPending({ record: next, changed: next.sha256 !== record.sha256 });
  };

  const applyPending = async () => {
    if (!pending) return;
    await replaceLocalUserPlugin(plugin.id, pending.record);
    setPending(undefined);
    done(t('settings.localPlugins.updatedShorthash', { shortHash: shortHash(pending.record.sha256) }));
  };

  const pill = {
    className: sheetCss.Pill,
    type: 'button' as const,
    variant: 'Secondary' as const,
    fill: 'Soft' as const,
    size: '300' as const,
    radii: 'Pill' as const,
  };

  return (
    <Box direction="Column" gap="200">
      <Text size="L400">{t('settings.localPlugins.content')}</Text>
      <Box gap="200" wrap="Wrap" alignItems="Center">
        <FilePickerButton disabled={busy} label={t('settings.localPlugins.replaceFromFile')} onFile={replaceFile} />
        <Button
          {...pill}
          disabled={busy}
          onClick={() => {
            setCode(record.html);
            setEditing((value) => !value);
            setNotice(undefined);
            setError(undefined);
          }}
        >
          <Text size="B300">{editing ? t('settings.localPlugins.closeCode') : t('settings.localPlugins.editCode')}</Text>
        </Button>
        {fromSource && (
          <Button {...pill} disabled={busy} onClick={checkSource}>
            <Text size="B300">{t('settings.localPlugins.updateFromSource')}</Text>
          </Button>
        )}
        {busy && <Spinner variant="Secondary" size="200" />}
      </Box>
      {pending && (
        <Box alignItems="Center" gap="200" wrap="Wrap">
          <Message>
            {pending.changed
              ? t('settings.localPlugins.theSourceChangedShorthash', { shortHash: shortHash(record.sha256), shortHash2: shortHash(
                  pending.record.sha256
                ) })
              : t('settings.localPlugins.theSourceIsUnchanged', { shortHash: shortHash(record.sha256) })}
          </Message>
          <Button {...pill} onClick={() => setPending(undefined)}>
            <Text size="B300">{pending.changed ? t('settings.localPlugins.keepCurrent') : t('settings.localPlugins.ok')}</Text>
          </Button>
          {pending.changed && (
            <Button {...pill} variant="Primary" fill="Solid" onClick={applyPending}>
              <Text size="B300">{t('settings.localPlugins.replace')}</Text>
            </Button>
          )}
        </Box>
      )}
      {editing && (
        <Box direction="Column" gap="200">
          <textarea
            aria-label={t('settings.localPlugins.htmlOfName', { name: plugin.name })}
            value={code}
            rows={12}
            spellCheck={false}
            onChange={(evt) => {
              setCode(evt.target.value);
              setError(undefined);
            }}
            style={textareaStyle}
          />
          <Box justifyContent="End">
            <Button
              {...pill}
              variant="Primary"
              fill="Solid"
              disabled={busy || code === record.html}
              onClick={saveCode}
            >
              <Text size="B300">{t('settings.localPlugins.saveCode')}</Text>
            </Button>
          </Box>
        </Box>
      )}
      {(error || notice) && <Message error={error}>{notice}</Message>}
    </Box>
  );
}
