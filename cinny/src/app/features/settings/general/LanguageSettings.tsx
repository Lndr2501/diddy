// Settings → Appearance → Language: pick the UI language, export a file to translate, load an own
// language file (docs/translating.md).
import React, { MouseEventHandler, useEffect, useRef, useState } from 'react';
import { Box, Button, config, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import FileSaver from 'file-saver';
import { useTranslation } from 'react-i18next';
import { stopPropagation } from '../../../utils/keyboard';
import {
  applyLanguage,
  availableLanguageCodes,
  loadBundledLanguageFile,
  loadLanguageFile,
  resolveLanguage,
  sourceMeta,
  sourceTexts,
  SOURCE_LANGUAGE,
} from '../../../i18n';
import {
  readCustomLanguages,
  readLanguagePref,
  removeCustomLanguage,
  saveCustomLanguage,
  SYSTEM_LANGUAGE,
  writeLanguagePref,
} from '../../../state/language';
import {
  completionPercent,
  describeProblems,
  flattenLocale,
  LocaleFile,
  localeTemplate,
  MAX_LOCALE_FILE_BYTES,
  validateLocale,
} from '../../../utils/localeFiles';
import { canSaveWithDialog, saveTextFileAs } from '../../../plugins/tauri';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';

type LanguageInfo = { code: string; name: string; percent: number; custom: boolean };

const readLanguages = async (): Promise<LanguageInfo[]> => {
  const source = sourceTexts();
  const custom = readCustomLanguages();
  const infos = await Promise.all(
    availableLanguageCodes().map(async (code) => {
      const file = await loadLanguageFile(code);
      if (!file) return undefined;
      return {
        code,
        name: file._meta?.name || code,
        percent: code === SOURCE_LANGUAGE ? 100 : completionPercent(flattenLocale(file), source),
        custom: code in custom,
      };
    })
  );
  return infos
    .filter((info): info is LanguageInfo => info !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
};

type Notice = { tone: 'error' | 'success'; text: string };

export function LanguageSettings() {
  const { t } = useTranslation();
  const [pref, setPref] = useState(readLanguagePref);
  const [languages, setLanguages] = useState<LanguageInfo[]>([]);
  const [menu, setMenu] = useState<RectCords>();
  const [notice, setNotice] = useState<Notice>();
  const fileInput = useRef<HTMLInputElement>(null);
  const active = resolveLanguage(pref);

  const refresh = () => {
    readLanguages()
      .then(setLanguages)
      .catch(() => undefined);
  };
  useEffect(refresh, []);

  const choose = (next: string) => {
    setMenu(undefined);
    writeLanguagePref(next);
    setPref(next);
    setNotice(undefined);
    applyLanguage(next).catch(() => undefined);
  };

  const label = (info?: LanguageInfo): string =>
    info ? t('settings.language.option', { name: info.name, percent: info.percent }) : '';
  const activeInfo = languages.find((info) => info.code === active);
  const current =
    pref === SYSTEM_LANGUAGE
      ? t('settings.language.systemWith', { name: activeInfo?.name ?? active })
      : label(activeInfo) || pref;

  const openMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenu(evt.currentTarget.getBoundingClientRect());
  };

  const exportTemplate = async () => {
    setNotice(undefined);
    const source = sourceTexts();
    const file = active === SOURCE_LANGUAGE ? undefined : await loadLanguageFile(active);
    const meta = file?._meta ?? sourceMeta();
    const template = localeTemplate(meta, file ? flattenLocale(file) : {}, source);
    const text = `${JSON.stringify(template, null, 2)}\n`;
    const name = `${meta.code}.json`;
    try {
      if (!canSaveWithDialog()) {
        FileSaver.saveAs(new Blob([text], { type: 'application/json' }), name);
        setNotice({ tone: 'success', text: t('settings.language.exported', { name }) });
        return;
      }
      const path = await saveTextFileAs(name, text, { name: 'JSON', extensions: ['json'] });
      if (path) setNotice({ tone: 'success', text: t('settings.language.exported', { name: path }) });
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const loadFile = async (picked: File) => {
    setNotice(undefined);
    if (picked.size > MAX_LOCALE_FILE_BYTES) {
      setNotice({ tone: 'error', text: t('settings.language.tooBig') });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await picked.text());
    } catch (e) {
      setNotice({
        tone: 'error',
        text: t('settings.language.notJson', { error: e instanceof Error ? e.message : '' }),
      });
      return;
    }
    const problems = validateLocale(data, sourceTexts());
    if (problems.length > 0) {
      setNotice({
        tone: 'error',
        text: `${t('settings.language.invalid')}\n${describeProblems(problems)}`,
      });
      return;
    }
    const file = data as LocaleFile;
    try {
      saveCustomLanguage(file);
    } catch {
      setNotice({ tone: 'error', text: t('settings.language.storageFull') });
      return;
    }
    choose(file._meta.code);
    setNotice({ tone: 'success', text: t('settings.language.loaded', { name: file._meta.name }) });
    refresh();
  };

  const removeCustom = async (code: string) => {
    removeCustomLanguage(code);
    const bundled = await loadBundledLanguageFile(code).catch(() => undefined);
    // the bundled file of the same language takes over again; otherwise back to the system
    choose(bundled || pref !== code ? pref : SYSTEM_LANGUAGE);
    refresh();
  };

  const customActive = languages.find((info) => info.code === active && info.custom);

  return (
    <InsetSection title={t('settings.language.section')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.language.title')}
          description={t('settings.language.description')}
          after={
            <>
              <Button
                size="300"
                variant="Secondary"
                outlined
                fill="Soft"
                radii="300"
                after={<Icon size="300" src={Icons.ChevronBottom} />}
                onClick={openMenu}
              >
                <Text size="T300">{current}</Text>
              </Button>
              <PopOut
                anchor={menu}
                offset={5}
                position="Bottom"
                align="End"
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      onDeactivate: () => setMenu(undefined),
                      clickOutsideDeactivates: true,
                      isKeyForward: (evt: KeyboardEvent) =>
                        evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
                      isKeyBackward: (evt: KeyboardEvent) =>
                        evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <Menu>
                      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                        <MenuItem
                          size="300"
                          radii="300"
                          variant={pref === SYSTEM_LANGUAGE ? 'Primary' : 'Surface'}
                          onClick={() => choose(SYSTEM_LANGUAGE)}
                        >
                          <Text size="T300">{t('settings.language.system')}</Text>
                        </MenuItem>
                        {languages.map((info) => (
                          <MenuItem
                            key={info.code}
                            size="300"
                            radii="300"
                            variant={pref === info.code ? 'Primary' : 'Surface'}
                            onClick={() => choose(info.code)}
                          >
                            <Text size="T300">
                              {label(info)}
                              {info.custom ? ` · ${t('settings.language.ownFile')}` : ''}
                            </Text>
                          </MenuItem>
                        ))}
                      </Box>
                    </Menu>
                  </FocusTrap>
                }
              />
            </>
          }
        />
        <InsetRow
          title={t('settings.language.translate')}
          description={t('settings.language.translateDescription')}
          after={
            <Box gap="200" wrap="Wrap" justifyContent="End">
              <Button size="300" variant="Secondary" fill="Soft" radii="300" onClick={exportTemplate}>
                <Text size="B300">{t('settings.language.export')}</Text>
              </Button>
              <Button
                size="300"
                variant="Secondary"
                fill="Soft"
                radii="300"
                onClick={() => fileInput.current?.click()}
              >
                <Text size="B300">{t('settings.language.load')}</Text>
              </Button>
              {customActive && (
                <Button
                  size="300"
                  variant="Critical"
                  fill="Soft"
                  radii="300"
                  onClick={() => removeCustom(customActive.code)}
                >
                  <Text size="B300">{t('settings.language.remove')}</Text>
                </Button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(evt) => {
                  const picked = evt.currentTarget.files?.[0];
                  // the same file can be picked again after fixing it
                  // eslint-disable-next-line no-param-reassign
                  evt.currentTarget.value = '';
                  if (picked) loadFile(picked);
                }}
              />
            </Box>
          }
        >
          {notice && (
            <Text
              size="T200"
              style={{
                whiteSpace: 'pre-wrap',
                color: notice.tone === 'error' ? 'var(--diddy-danger, #e5484d)' : undefined,
              }}
            >
              {notice.text}
            </Text>
          )}
        </InsetRow>
      </InsetGroup>
    </InsetSection>
  );
}
