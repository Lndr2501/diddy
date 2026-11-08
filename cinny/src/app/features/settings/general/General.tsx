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
import { ThemeTiles } from './ThemeTiles';
import { updateCallPrefs, useCallPrefs } from '../../../state/callPrefs';
import { SoundSettings } from './SoundSettings';
import { AgentVoiceSettings } from './AgentVoiceSettings';
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

function ThemeSettings() {
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
    <InsetSection title="Theme">
      <InsetGroup>
        <InsetRow
          title="Match System Appearance"
          description="Switch between a light and a dark theme together with your system."
          after={<Switch variant="Primary" value={systemTheme} onChange={setSystemTheme} />}
        />
        {systemTheme ? (
          <>
            <InsetRow
              title="Light Appearance"
              description={
                systemThemeKind === ThemeKind.Light
                  ? 'In use now.'
                  : 'Used when your system is in light mode.'
              }
            >
              <ThemeTiles
                aria-label="Light theme"
                themes={lightThemes}
                themeNames={themeNames}
                selectedId={selectedLightTheme.id}
                onSelect={(theme) => setLightThemeId(theme.id)}
              />
            </InsetRow>
            <InsetRow
              title="Dark Appearance"
              description={
                systemThemeKind === ThemeKind.Dark
                  ? 'In use now.'
                  : 'Used when your system is in dark mode.'
              }
            >
              <ThemeTiles
                aria-label="Dark theme"
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
              aria-label="Theme"
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
  const [monochromeMode, setMonochromeMode] = useSetting(settingsAtom, 'monochromeMode');
  const [dynamicPageTitle, setDynamicPageTitle] = useSetting(settingsAtom, 'showDynamicPageTitle');

  return (
    <InsetSection title="Display">
      <InsetGroup>
        <InsetRow
          title="Monochrome Mode"
          after={<Switch variant="Primary" value={monochromeMode} onChange={setMonochromeMode} />}
        />
        <InsetRow
          title="Dynamic Page Title"
          description="Display your current room and space in the window title."
          after={
            <Switch variant="Primary" value={dynamicPageTitle} onChange={setDynamicPageTitle} />
          }
        />
        <InsetRow
          title="Page Zoom"
          description="Between 75% and 150%. Press Enter to apply."
          after={<PageZoomInput />}
        />
      </InsetGroup>
    </InsetSection>
  );
}

const APPLE_EMOJI_HELP = 'https://github.com/Lndr2501/diddy#apple-emoji-unter-linux';

/** Apple Color Emoji is used whenever installed. It cannot be bundled, so say how to get it. */
function EmojiSettings() {
  const installed = useMemo(() => isAppleEmojiInstalled(), []);
  return (
    <InsetSection title="Emoji">
      <InsetGroup>
        <InsetRow
          title="Apple Color Emoji"
          description={
            installed ? (
              'Installed on this system, so emoji look like on a Mac.'
            ) : (
              <>
                Not installed on this system, so your system emoji are shown. Apple emoji are used
                automatically once the font is installed.{' '}
                <a href={APPLE_EMOJI_HELP} target="_blank" rel="noreferrer noopener">
                  See how to install it
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
  if (!canChangeAppIcon()) return null;
  return (
    <InsetSection title="App Icon" footer="Icon shown in the Dock or taskbar.">
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
              <Text size="L400">Formatting</Text>
            </Header>

            <Box direction="Column">
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Year</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    YY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      Two-digit year
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    YYYY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Four-digit year
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Month</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    M
                    <Text as="span" size="Inherit" priority="300">
                      {': '}The month
                    </Text>
                  </Text>
                  <Text size="T300">
                    MM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-digit month
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    MMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Short month name
                    </Text>
                  </Text>
                  <Text size="T300">
                    MMMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Full month name
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Day of the Month</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    D
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Day of the month
                    </Text>
                  </Text>
                  <Text size="T300">
                    DD
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-digit day of the month
                    </Text>
                  </Text>
                </Box>
              </Box>
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Day of the Week</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    d
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Day of the week (Sunday = 0)
                    </Text>
                  </Text>
                  <Text size="T300">
                    dd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-letter day name
                    </Text>
                  </Text>
                  <Text size="T300">
                    ddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Short day name
                    </Text>
                  </Text>
                  <Text size="T300">
                    dddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Full day name
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
        <Text size="B400">Save</Text>
      </Button>
    </Box>
  );
}

type PresetDateFormatProps = {
  value: string;
  onChange: (format: string) => void;
};
function PresetDateFormat({ value, onChange }: PresetDateFormatProps) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const dateFormatItems = useDateFormatItems();

  const getDisplayDate = (format: string): string =>
    format !== '' ? dayjs().format(format) : 'Custom';

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
      title="Date Format"
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
  const [hour24Clock, setHour24Clock] = useSetting(settingsAtom, 'hour24Clock');

  return (
    <InsetSection title="Date & Time">
      <InsetGroup>
        <InsetRow
          title="24-Hour Time Format"
          after={<Switch variant="Primary" value={hour24Clock} onChange={setHour24Clock} />}
        />
        <SelectDateFormat />
      </InsetGroup>
    </InsetSection>
  );
}

function Editor() {
  const [enterForNewline, setEnterForNewline] = useSetting(settingsAtom, 'enterForNewline');
  const [isMarkdown, setIsMarkdown] = useSetting(settingsAtom, 'isMarkdown');
  const [hideActivity, setHideActivity] = useSetting(settingsAtom, 'hideActivity');

  return (
    <InsetSection title="Editor">
      <InsetGroup>
        <InsetRow
          title="ENTER for Newline"
          description={`Use ${
            isMacOS() ? KeySymbol.Command : 'Ctrl'
          } + ENTER to send message and ENTER for newline.`}
          after={<Switch variant="Primary" value={enterForNewline} onChange={setEnterForNewline} />}
        />
        <InsetRow
          title="Markdown Formatting"
          after={<Switch variant="Primary" value={isMarkdown} onChange={setIsMarkdown} />}
        />
        <InsetRow
          title="Hide Typing & Read Receipts"
          description="Turn off both typing status and read receipts to keep your activity private."
          after={<Switch variant="Primary" value={hideActivity} onChange={setHideActivity} />}
        />
      </InsetGroup>
    </InsetSection>
  );
}

function SelectMessageLayout() {
  const [messageLayout, setMessageLayout] = useSetting(settingsAtom, 'messageLayout');
  const messageLayoutItems = useMessageLayoutItems();

  return (
    <SegmentedControl<string>
      aria-label="Message Layout"
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
      <InsetSection title="Messages">
        <InsetGroup>
          <InsetRow title="Message Layout" after={<SelectMessageLayout />} />
          <InsetRow title="Message Spacing" after={<SelectMessageSpacing />} />
          <InsetRow
            title="Legacy Username Color"
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

      <InsetSection title="Timeline">
        <InsetGroup>
          <InsetRow
            title="Hide Membership Change"
            after={
              <Switch
                variant="Primary"
                value={hideMembershipEvents}
                onChange={setHideMembershipEvents}
              />
            }
          />
          <InsetRow
            title="Hide Profile Change"
            after={
              <Switch
                variant="Primary"
                value={hideNickAvatarEvents}
                onChange={setHideNickAvatarEvents}
              />
            }
          />
          <InsetRow
            title="Show Hidden Events"
            after={
              <Switch variant="Primary" value={showHiddenEvents} onChange={setShowHiddenEvents} />
            }
          />
        </InsetGroup>
      </InsetSection>

      <InsetSection title="Media & Previews">
        <InsetGroup>
          <InsetRow
            title="Disable Media Auto Load"
            after={
              <Switch
                variant="Primary"
                value={!mediaAutoLoad}
                onChange={(v) => setMediaAutoLoad(!v)}
              />
            }
          />
          <InsetRow
            title="Url Preview"
            after={<Switch variant="Primary" value={urlPreview} onChange={setUrlPreview} />}
          />
          <InsetRow
            title="Url Preview in Encrypted Room"
            after={<Switch variant="Primary" value={encUrlPreview} onChange={setEncUrlPreview} />}
          />
        </InsetGroup>
      </InsetSection>
    </>
  );
}

function WelcomeGuideSettings() {
  const mx = useMatrixClient();
  const [shown, setShown] = useState(false);

  return (
    <InsetSection title="Diddy">
      <InsetGroup>
        <InsetRow
          title="Welcome guide"
          description="Show the setup walkthrough for Diddy servers again."
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
              <Text size="B300">{shown ? 'Starting...' : 'Show again'}</Text>
            </Button>
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}

const AVATAR_PLACES: { surface: AvatarSurface; title: string; description: string }[] = [
  { surface: 'profile', title: 'Profile card', description: 'The big picture on a profile.' },
  {
    surface: 'chat',
    title: 'Chat',
    description: 'Next to messages, replies, search results and pins.',
  },
  {
    surface: 'members',
    title: 'Member list',
    description: 'Member list, mentions and who reacted or read.',
  },
  {
    surface: 'account',
    title: 'Your account',
    description: 'The picture at the bottom left and in settings.',
  },
  { surface: 'call', title: 'Calls', description: 'Participants in voice chat and call status.' },
];

function AnimatedAvatarSettings() {
  const prefs = useAvatarPrefs();

  return (
    <InsetSection title="Animated profile pictures">
      <InsetGroup>
        <InsetRow
          title="Only while speaking"
          description="The picture stands still and moves only while the person speaks in the call you are in."
          after={
            <Switch
              variant="Primary"
              value={prefs.speakingOnly}
              onChange={(value) => setAvatarAnimation('speakingOnly', value)}
            />
          }
        />
        {AVATAR_PLACES.map(({ surface, title, description }) => (
          <InsetRow
            key={surface}
            title={title}
            description={description}
            after={
              <Switch
                variant="Primary"
                value={prefs[surface]}
                onChange={(value) => setAvatarAnimation(surface, value)}
              />
            }
          />
        ))}
      </InsetGroup>
    </InsetSection>
  );
}

function CallSettings() {
  const prefs = useCallPrefs();

  return (
    <InsetSection title="Calls">
      <InsetGroup>
        <InsetRow
          title="Noise suppression"
          description="Removes background noise such as keyboard, fan and room noise from your microphone (RNNoise, open source). It runs inside Diddy and does not turn your music down. Applies the next time you join a call."
          after={
            <Switch
              variant="Primary"
              value={prefs.noiseSuppression}
              onChange={(noiseSuppression) => updateCallPrefs({ noiseSuppression })}
            />
          }
        />
        <InsetRow
          title="Voice processing"
          description="Echo cancellation, noise suppression and auto gain. Off keeps your music and other apps sounding normal and avoids short audio glitches when you join a call. Turn it on if you use speakers instead of headphones. Applies the next time you join a call."
          after={
            <Switch
              variant="Primary"
              value={prefs.echoCancellation}
              onChange={(echoCancellation) => updateCallPrefs({ echoCancellation })}
            />
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}

type GeneralProps = {
  requestClose: () => void;
};
export function General({ requestClose }: GeneralProps) {
  return (
    <SettingsPage title="General" requestClose={requestClose}>
      <AnimatedAvatarSettings />
      <CallSettings />
      <AgentVoiceSettings />
      <SoundSettings />
      <WelcomeGuideSettings />
      <DateAndTime />
      <Editor />
      <Messages />
    </SettingsPage>
  );
}

type AppearanceSettingsProps = {
  requestClose: () => void;
};
export function AppearanceSettings({ requestClose }: AppearanceSettingsProps) {
  return (
    <SettingsPage title="Appearance" requestClose={requestClose}>
      <ThemeSettings />
      <CustomThemeSettings />
      <BackgroundSettings />
      <DisplaySettings />
      <EmojiSettings />
      <AppIconSettings />
    </SettingsPage>
  );
}
