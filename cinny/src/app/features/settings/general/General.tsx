import React, {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  Chip,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Switch,
  Text,
  toRem,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import FocusTrap from 'focus-trap-react';
import { useSetting } from '../../../state/hooks/settings';
import { DateFormat, MessageSpacing, settingsAtom } from '../../../state/settings';
import { KeySymbol } from '../../../utils/key-symbol';
import { isMacOS } from '../../../utils/user-agent';
import { isAppleEmojiInstalled } from '../../../utils/emojiFont';
import {
  DarkTheme,
  LightTheme,
  ThemeKind,
  useSystemThemeKind,
  useThemeNames,
  useThemes,
} from '../../../hooks/useTheme';
import { stopPropagation } from '../../../utils/keyboard';
import { useMessageLayoutItems } from '../../../hooks/useMessageLayout';
import { useMessageSpacingItems } from '../../../hooks/useMessageSpacing';
import { useDateFormatItems } from '../../../hooks/useDateFormat';
import { AppIconPicker } from './AppIconPicker';
import { BackgroundSettings, CustomThemeSettings } from './CustomThemeSettings';
import { LanguageSettings } from './LanguageSettings';
import { ThemeTiles } from './ThemeTiles';
import * as css from './General.css';
import { updateCallPrefs, useCallPrefs } from '../../../state/callPrefs';
import { SoundSettings } from './SoundSettings';
import { browserStorage, clearAllCallVolumes } from '../../../plugins/call/volumeMemory';
import { AgentVoiceSettings } from './AgentVoiceSettings';
import { WatchTogetherSettings } from './WatchTogetherSettings';
import { CameraDeviceList } from '../../call/DevicePicker';
import { AvatarSurface, setAvatarAnimation, useAvatarPrefs } from '../../../state/avatarPrefs';
import { resetDiddyOnboarding } from '../../../plugins/diddy/onboarding';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { canChangeAppIcon } from '../../../plugins/appIcon';
import {
  InsetGroup,
  InsetItem,
  InsetRow,
  InsetSection,
  SegmentedControl,
  SettingsPage,
} from '../inset-list';
import { useTranslation } from 'react-i18next';
import { translate } from '../../../i18n';

function ThemeSettings() {
  const { t } = useTranslation();
  const themes = useThemes();
  const themeNames = useThemeNames();
  const systemThemeKind = useSystemThemeKind();
  const [systemTheme, setSystemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [themeId, setThemeId] = useSetting(settingsAtom, 'themeId');
  const [lightThemeId, setLightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId, setDarkThemeId] = useSetting(settingsAtom, 'darkThemeId');

  const lightThemes = themes.filter((theme) => theme.kind === ThemeKind.Light);
  const darkThemes = themes.filter((theme) => theme.kind === ThemeKind.Dark);

  const selectedTheme = themes.find((theme) => theme.id === themeId) ?? LightTheme;
  const selectedLightTheme = lightThemes.find((theme) => theme.id === lightThemeId) ?? LightTheme;
  const selectedDarkTheme = darkThemes.find((theme) => theme.id === darkThemeId) ?? DarkTheme;

  return (
    <InsetSection title={t('settings.general.theme')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.general.matchSystemAppearance')}
          description={t('settings.general.switchBetweenALight')}
          after={<Switch variant="Primary" value={systemTheme} onChange={setSystemTheme} />}
        />
        {systemTheme ? (
          <>
            <InsetRow
              title={t('settings.general.lightAppearance')}
              description={
                systemThemeKind === ThemeKind.Light
                  ? t('settings.general.inUseNow')
                  : t('settings.general.usedWhenYourSystem')
              }
            >
              <ThemeTiles
                aria-label={t('settings.general.lightTheme')}
                themes={lightThemes}
                themeNames={themeNames}
                selectedId={selectedLightTheme.id}
                onSelect={(theme) => setLightThemeId(theme.id)}
              />
            </InsetRow>
            <InsetRow
              title={t('settings.general.darkAppearance')}
              description={
                systemThemeKind === ThemeKind.Dark
                  ? t('settings.general.inUseNow')
                  : t('settings.general.usedWhenYourSystem2')
              }
            >
              <ThemeTiles
                aria-label={t('settings.general.darkTheme')}
                themes={darkThemes}
                themeNames={themeNames}
                selectedId={selectedDarkTheme.id}
                onSelect={(theme) => setDarkThemeId(theme.id)}
              />
            </InsetRow>
          </>
        ) : (
          <InsetItem>
            <ThemeTiles
              aria-label={t('settings.general.theme')}
              themes={themes}
              themeNames={themeNames}
              selectedId={selectedTheme.id}
              onSelect={(theme) => setThemeId(theme.id)}
            />
          </InsetItem>
        )}
      </InsetGroup>
    </InsetSection>
  );
}

function PageZoomInput() {
  const [pageZoom, setPageZoom] = useSetting(settingsAtom, 'pageZoom');
  const [currentZoom, setCurrentZoom] = useState(`${pageZoom}`);

  const handleZoomChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setCurrentZoom(evt.target.value);
  };

  const handleZoomEnter: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setCurrentZoom(pageZoom.toString());
    }
    if (
      isKeyHotkey('enter', evt) &&
      'value' in evt.target &&
      typeof evt.target.value === 'string'
    ) {
      const newZoom = parseInt(evt.target.value, 10);
      if (Number.isNaN(newZoom)) return;
      const safeZoom = Math.max(Math.min(newZoom, 150), 75);
      setPageZoom(safeZoom);
      setCurrentZoom(safeZoom.toString());
    }
  };

  return (
    <Input
      style={{ width: toRem(100) }}
      variant={pageZoom === parseInt(currentZoom, 10) ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="75"
      max="150"
      value={currentZoom}
      onChange={handleZoomChange}
      onKeyDown={handleZoomEnter}
      after={<Text size="T300">%</Text>}
      outlined
    />
  );
}

function DisplaySettings() {
  const { t } = useTranslation();
  const [monochromeMode, setMonochromeMode] = useSetting(settingsAtom, 'monochromeMode');
  const [dynamicPageTitle, setDynamicPageTitle] = useSetting(settingsAtom, 'showDynamicPageTitle');
  const [directsInSpaces, setDirectsInSpaces] = useSetting(settingsAtom, 'showDirectsInSpaces');

  return (
    <InsetSection title={t('settings.general.display')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.general.monochromeMode')}
          after={<Switch variant="Primary" value={monochromeMode} onChange={setMonochromeMode} />}
        />
        <InsetRow
          title={t('settings.general.dynamicPageTitle')}
          description={t('settings.general.displayYourCurrentRoom')}
          after={
            <Switch variant="Primary" value={dynamicPageTitle} onChange={setDynamicPageTitle} />
          }
        />
        <InsetRow
          title={t('settings.general.directMessagesInSpaces')}
          description={t('settings.general.listYourDirectMessages')}
          after={
            <Switch variant="Primary" value={!!directsInSpaces} onChange={setDirectsInSpaces} />
          }
        />
        <InsetRow
          title={t('settings.general.pageZoom')}
          description={t('settings.general.between75And150')}
          after={<PageZoomInput />}
        />
      </InsetGroup>
    </InsetSection>
  );
}

const APPLE_EMOJI_HELP = 'https://github.com/Lndr2501/diddy#apple-emoji-unter-linux';

/** Apple Color Emoji is used whenever installed. It cannot be bundled, so say how to get it. */
function EmojiSettings() {
  const { t } = useTranslation();
  const installed = useMemo(() => isAppleEmojiInstalled(), []);
  return (
    <InsetSection title={t('settings.general.emoji')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.general.appleColorEmoji')}
          description={
            installed ? (
              t('settings.general.installedOnThisSystem')
            ) : (
              <>
                {t('settings.general.notInstalledOnThis')}{' '}
                <a href={APPLE_EMOJI_HELP} target="_blank" rel="noreferrer noopener">
                  {t('settings.general.seeHowToInstall')}
                </a>
                .
              </>
            )
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}

function AppIconSettings() {
  const { t } = useTranslation();
  if (!canChangeAppIcon()) return null;
  return (
    <InsetSection
      title={t('settings.general.appIcon')}
      footer={t('settings.general.iconShownInThe')}
    >
      <InsetGroup>
        <InsetItem>
          <AppIconPicker />
        </InsetItem>
      </InsetGroup>
    </InsetSection>
  );
}

type DateHintProps = {
  hasChanges: boolean;
  handleReset: () => void;
};
function DateHint({ hasChanges, handleReset }: DateHintProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<RectCords>();
  const categoryPadding = { padding: config.space.S200, paddingTop: 0 };

  const handleOpenMenu: MouseEventHandler<HTMLElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };
  return (
    <PopOut
      anchor={anchor}
      position="Top"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <Header size="300" style={{ padding: `0 ${config.space.S200}` }}>
              <Text size="L400">{t('settings.general.formatting')}</Text>
            </Header>

            <Box direction="Column">
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('settings.general.year')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    YY
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.twoDigitYear')}
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    YYYY
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.fourDigitYear')}
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('settings.general.month')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    M
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.theMonth')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    MM
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.twoDigitMonth')}
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    MMM
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.shortMonthName')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    MMMM
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.fullMonthName')}
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('settings.general.dayOfTheMonth')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    D
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.dayOfTheMonth2')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    DD
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.twoDigitDayOf')}
                    </Text>
                  </Text>
                </Box>
              </Box>
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('settings.general.dayOfTheWeek')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    d
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.dayOfTheWeek2')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    dd
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.twoLetterDayName')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    ddd
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.shortDayName')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    dddd
                    <Text as="span" size="Inherit" priority="300">
                      {t('settings.general.fullDayName')}
                    </Text>
                  </Text>
                </Box>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      {hasChanges ? (
        <IconButton
          tabIndex={-1}
          onClick={handleReset}
          type="reset"
          variant="Secondary"
          size="300"
          radii="300"
        >
          <Icon src={Icons.Cross} size="100" />
        </IconButton>
      ) : (
        <IconButton
          tabIndex={-1}
          onClick={handleOpenMenu}
          type="button"
          variant="Secondary"
          size="300"
          radii="300"
          aria-pressed={!!anchor}
        >
          <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.Info} />
        </IconButton>
      )}
    </PopOut>
  );
}

type CustomDateFormatProps = {
  value: string;
  onChange: (format: string) => void;
};
function CustomDateFormat({ value, onChange }: CustomDateFormatProps) {
  const { t } = useTranslation();
  const [dateFormatCustom, setDateFormatCustom] = useState(value);

  useEffect(() => {
    setDateFormatCustom(value);
  }, [value]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const format = evt.currentTarget.value;
    setDateFormatCustom(format);
  };

  const handleReset = () => {
    setDateFormatCustom(value);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();

    const target = evt.target as HTMLFormElement | undefined;
    const customDateFormatInput = target?.customDateFormatInput as HTMLInputElement | undefined;
    const format = customDateFormatInput?.value;
    if (!format) return;

    onChange(format);
  };

  const hasChanges = dateFormatCustom !== value;
  return (
    <Box as="form" onSubmit={handleSubmit} gap="200">
      <Box grow="Yes" direction="Column">
        <Input
          required
          name="customDateFormatInput"
          value={dateFormatCustom}
          onChange={handleChange}
          maxLength={16}
          autoComplete="off"
          variant="Secondary"
          radii="300"
          style={{ paddingRight: config.space.S200 }}
          after={<DateHint hasChanges={hasChanges} handleReset={handleReset} />}
        />
      </Box>
      <Button
        size="400"
        variant={hasChanges ? 'Success' : 'Secondary'}
        fill={hasChanges ? 'Solid' : 'Soft'}
        outlined
        radii="300"
        disabled={!hasChanges}
        type="submit"
      >
        <Text size="B400">{t('settings.general.save')}</Text>
      </Button>
    </Box>
  );
}

type PresetDateFormatProps = {
  value: string;
  onChange: (format: string) => void;
};
function PresetDateFormat({ value, onChange }: PresetDateFormatProps) {
  const { t } = useTranslation();
  const [menuCords, setMenuCords] = useState<RectCords>();
  const dateFormatItems = useDateFormatItems();

  const getDisplayDate = (format: string): string =>
    format !== '' ? dayjs().format(format) : t('settings.general.custom');

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (format: DateFormat) => {
    onChange(format);
    setMenuCords(undefined);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">
          {getDisplayDate(dateFormatItems.find((i) => i.format === value)?.format ?? value)}
        </Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
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
                {dateFormatItems.map((item) => (
                  <MenuItem
                    key={item.format}
                    size="300"
                    variant={value === item.format ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.format)}
                  >
                    <Text size="T300">{getDisplayDate(item.format)}</Text>
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}

function SelectDateFormat() {
  const { t } = useTranslation();
  const [dateFormatString, setDateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [selectedDateFormat, setSelectedDateFormat] = useState(dateFormatString);
  const customDateFormat = selectedDateFormat === '';

  const handlePresetChange = (format: string) => {
    setSelectedDateFormat(format);
    if (format !== '') {
      setDateFormatString(format);
    }
  };

  return (
    <InsetRow
      title={t('settings.general.dateFormat')}
      description={customDateFormat ? dayjs().format(dateFormatString) : undefined}
      after={<PresetDateFormat value={selectedDateFormat} onChange={handlePresetChange} />}
    >
      {customDateFormat && (
        <CustomDateFormat value={dateFormatString} onChange={setDateFormatString} />
      )}
    </InsetRow>
  );
}

function DateAndTime() {
  const { t } = useTranslation();
  const [hour24Clock, setHour24Clock] = useSetting(settingsAtom, 'hour24Clock');

  return (
    <InsetSection title={t('settings.general.dateTime')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.general.n24HourTimeFormat')}
          after={<Switch variant="Primary" value={hour24Clock} onChange={setHour24Clock} />}
        />
        <SelectDateFormat />
      </InsetGroup>
    </InsetSection>
  );
}

function Editor() {
  const { t } = useTranslation();
  const [enterForNewline, setEnterForNewline] = useSetting(settingsAtom, 'enterForNewline');
  const [isMarkdown, setIsMarkdown] = useSetting(settingsAtom, 'isMarkdown');
  const [hideActivity, setHideActivity] = useSetting(settingsAtom, 'hideActivity');

  return (
    <InsetSection title={t('settings.general.editor')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.general.enterForNewline')}
          description={t('settings.general.enterForNewlineDescription', {
            key: isMacOS() ? KeySymbol.Command : 'Ctrl',
          })}
          after={<Switch variant="Primary" value={enterForNewline} onChange={setEnterForNewline} />}
        />
        <InsetRow
          title={t('settings.general.markdownFormatting')}
          after={<Switch variant="Primary" value={isMarkdown} onChange={setIsMarkdown} />}
        />
        <InsetRow
          title={t('settings.general.hideTypingReadReceipts')}
          description={t('settings.general.turnOffBothTyping')}
          after={<Switch variant="Primary" value={hideActivity} onChange={setHideActivity} />}
        />
      </InsetGroup>
    </InsetSection>
  );
}

function SelectMessageLayout() {
  const { t } = useTranslation();
  const [messageLayout, setMessageLayout] = useSetting(settingsAtom, 'messageLayout');
  const messageLayoutItems = useMessageLayoutItems();

  return (
    <SegmentedControl<string>
      aria-label={t('settings.general.messageLayout')}
      options={messageLayoutItems.map((item) => ({
        value: String(item.layout),
        label: item.name,
      }))}
      value={String(messageLayout)}
      onChange={(layout) => {
        const item = messageLayoutItems.find((i) => String(i.layout) === layout);
        if (item) setMessageLayout(item.layout);
      }}
    />
  );
}

function SelectMessageSpacing() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [messageSpacing, setMessageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const messageSpacingItems = useMessageSpacingItems();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (layout: MessageSpacing) => {
    setMessageSpacing(layout);
    setMenuCords(undefined);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">
          {messageSpacingItems.find((i) => i.spacing === messageSpacing)?.name ?? messageSpacing}
        </Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
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
                {messageSpacingItems.map((item) => (
                  <MenuItem
                    key={item.spacing}
                    size="300"
                    variant={messageSpacing === item.spacing ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.spacing)}
                  >
                    <Text size="T300">{item.name}</Text>
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}

function Messages() {
  const { t } = useTranslation();
  const [legacyUsernameColor, setLegacyUsernameColor] = useSetting(
    settingsAtom,
    'legacyUsernameColor'
  );
  const [hideMembershipEvents, setHideMembershipEvents] = useSetting(
    settingsAtom,
    'hideMembershipEvents'
  );
  const [hideNickAvatarEvents, setHideNickAvatarEvents] = useSetting(
    settingsAtom,
    'hideNickAvatarEvents'
  );
  const [mediaAutoLoad, setMediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview, setUrlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview, setEncUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [showHiddenEvents, setShowHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');

  return (
    <>
      <InsetSection title={t('settings.general.messages')}>
        <InsetGroup>
          <InsetRow title={t('settings.general.messageLayout')} after={<SelectMessageLayout />} />
          <InsetRow title={t('settings.general.messageSpacing')} after={<SelectMessageSpacing />} />
          <InsetRow
            title={t('settings.general.legacyUsernameColor')}
            after={
              <Switch
                variant="Primary"
                value={legacyUsernameColor}
                onChange={setLegacyUsernameColor}
              />
            }
          />
        </InsetGroup>
      </InsetSection>

      <InsetSection title={t('settings.general.timeline')}>
        <InsetGroup>
          <InsetRow
            title={t('settings.general.hideMembershipChange')}
            after={
              <Switch
                variant="Primary"
                value={hideMembershipEvents}
                onChange={setHideMembershipEvents}
              />
            }
          />
          <InsetRow
            title={t('settings.general.hideProfileChange')}
            after={
              <Switch
                variant="Primary"
                value={hideNickAvatarEvents}
                onChange={setHideNickAvatarEvents}
              />
            }
          />
          <InsetRow
            title={t('settings.general.showHiddenEvents')}
            after={
              <Switch variant="Primary" value={showHiddenEvents} onChange={setShowHiddenEvents} />
            }
          />
        </InsetGroup>
      </InsetSection>

      <InsetSection title={t('settings.general.mediaPreviews')}>
        <InsetGroup>
          <InsetRow
            title={t('settings.general.disableMediaAutoLoad')}
            after={
              <Switch
                variant="Primary"
                value={!mediaAutoLoad}
                onChange={(v) => setMediaAutoLoad(!v)}
              />
            }
          />
          <InsetRow
            title={t('settings.general.urlPreview')}
            description={t('settings.general.cardsAndPicturesUnder')}
            after={<Switch variant="Primary" value={urlPreview} onChange={setUrlPreview} />}
          />
          <InsetRow
            title={t('settings.general.urlPreviewInEncrypted')}
            description={t('settings.general.diddyReadsThePage')}
            after={<Switch variant="Primary" value={encUrlPreview} onChange={setEncUrlPreview} />}
          />
        </InsetGroup>
      </InsetSection>
    </>
  );
}

export function WelcomeGuideSettings() {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const [shown, setShown] = useState(false);

  return (
    <InsetSection title="Diddy">
      <InsetGroup>
        <InsetRow
          title={t('settings.general.welcomeGuide')}
          description={t('settings.general.showTheSetupWalkthrough')}
          after={
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              onClick={() => {
                resetDiddyOnboarding(mx.getSafeUserId());
                setShown(true);
              }}
            >
              <Text size="B300">
                {shown ? t('settings.general.starting') : t('settings.general.showAgain')}
              </Text>
            </Button>
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}

const AVATAR_PLACES: { surface: AvatarSurface; title: string; description: string }[] = [
  {
    surface: 'profile',
    get title() {
      return translate('settings.general.profileCard');
    },
    get description() {
      return translate('settings.general.theBigPictureOn');
    },
  },
  {
    surface: 'chat',
    get title() {
      return translate('settings.general.chat');
    },
    get description() {
      return translate('settings.general.nextToMessagesReplies');
    },
  },
  {
    surface: 'members',
    get title() {
      return translate('settings.general.memberList');
    },
    get description() {
      return translate('settings.general.memberListMentionsAnd');
    },
  },
  {
    surface: 'account',
    get title() {
      return translate('settings.general.yourAccount');
    },
    get description() {
      return translate('settings.general.thePictureAtThe');
    },
  },
  {
    surface: 'call',
    get title() {
      return translate('settings.general.calls');
    },
    get description() {
      return translate('settings.general.participantsInVoiceChat');
    },
  },
];

function AnimatedAvatarSettings() {
  const { t } = useTranslation();
  const prefs = useAvatarPrefs();

  return (
    <InsetSection
      title={t('settings.general.animatedProfilePictures')}
      footer={t('settings.general.withReducedMotionTurned')}
    >
      <InsetGroup>
        <InsetRow
          title={t('settings.general.picturesMoveIn')}
          description={t('settings.general.whereAnimatedProfilePictures')}
        >
          <div
            className={css.ChipRow}
            role="group"
            aria-label={t('settings.general.picturesMoveIn')}
          >
            {AVATAR_PLACES.map(({ surface, title, description }) => {
              const on = prefs[surface];
              return (
                <Chip
                  key={surface}
                  variant={on ? 'Primary' : 'SurfaceVariant'}
                  fill={on ? 'Soft' : 'None'}
                  radii="Pill"
                  outlined
                  aria-pressed={on}
                  title={description}
                  before={on ? <Icon size="50" src={Icons.Check} /> : undefined}
                  onClick={() => setAvatarAnimation(surface, !on)}
                >
                  <Text size="T200">{title}</Text>
                </Chip>
              );
            })}
          </div>
        </InsetRow>
        <InsetRow
          title={t('settings.general.onlyWhileSpeaking')}
          description={t('settings.general.picturesStandStillAnd')}
          after={
            <Switch
              variant="Primary"
              value={prefs.speakingOnly}
              onChange={(value) => setAvatarAnimation('speakingOnly', value)}
            />
          }
        />
        <InsetRow
          title={t('settings.general.nameplates')}
          description={t('settings.general.movingBackgroundsBehindNames')}
          after={
            <Switch
              variant="Primary"
              value={prefs.nameplates}
              onChange={(value) => setAvatarAnimation('nameplates', value)}
            />
          }
        />
        <InsetRow
          title={t('settings.general.profileEffects')}
          description={t('settings.general.animatedOverlaysOtherPeople')}
          after={
            <Switch
              variant="Primary"
              value={prefs.profileEffects}
              onChange={(value) => setAvatarAnimation('profileEffects', value)}
            />
          }
        />
        <InsetRow
          title={t('settings.general.profileFrames')}
          description={t('settings.general.decorativeFramesOtherPeople')}
          after={
            <Switch
              variant="Primary"
              value={prefs.profileFrames}
              onChange={(value) => setAvatarAnimation('profileFrames', value)}
            />
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}

function CallSettings() {
  const { t } = useTranslation();
  const prefs = useCallPrefs();
  const [volumesReset, setVolumesReset] = useState(false);

  return (
    <InsetSection title={t('settings.general.calls')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.general.noiseSuppression')}
          description={t('settings.general.removesBackgroundNoiseSuch')}
          after={
            <Switch
              variant="Primary"
              value={prefs.noiseSuppression}
              onChange={(noiseSuppression) => updateCallPrefs({ noiseSuppression })}
            />
          }
        />
        <InsetRow
          title={t('settings.general.voiceProcessing')}
          description={t('settings.general.echoCancellationNoiseSuppression')}
          after={
            <Switch
              variant="Primary"
              value={prefs.echoCancellation}
              onChange={(echoCancellation) => updateCallPrefs({ echoCancellation })}
            />
          }
        />
        <InsetRow
          title={t('settings.general.camera')}
          description={t('settings.general.usedForVideoIn')}
        >
          <CameraDeviceList />
        </InsetRow>
        <InsetRow
          title={t('settings.general.volumesOfPeople')}
          description={t('settings.general.diddyRemembersTheVolume')}
          after={
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              disabled={volumesReset}
              onClick={() => {
                clearAllCallVolumes(browserStorage());
                setVolumesReset(true);
              }}
            >
              <Text size="B300">
                {volumesReset ? t('settings.general.reset') : t('settings.general.resetVolumes')}
              </Text>
            </Button>
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}

type PageProps = {
  requestClose: () => void;
};

/** Everything about reading and writing messages. */
export function ChatSettings({ requestClose }: PageProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.general.chat')} requestClose={requestClose}>
      <Messages />
      <Editor />
      <DateAndTime />
    </SettingsPage>
  );
}

/** Calls, the app's sounds and the voice extras. */
export function CallsSettings({ requestClose }: PageProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.general.callsAudio')} requestClose={requestClose}>
      <CallSettings />
      <SoundSettings />
      <AgentVoiceSettings />
      <WatchTogetherSettings />
    </SettingsPage>
  );
}

type AppearanceSettingsProps = {
  requestClose: () => void;
};
export function AppearanceSettings({ requestClose }: AppearanceSettingsProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.general.appearance')} requestClose={requestClose}>
      <LanguageSettings />
      <ThemeSettings />
      <CustomThemeSettings />
      <BackgroundSettings />
      <DisplaySettings />
      <EmojiSettings />
      <AnimatedAvatarSettings />
      <AppIconSettings />
    </SettingsPage>
  );
}
