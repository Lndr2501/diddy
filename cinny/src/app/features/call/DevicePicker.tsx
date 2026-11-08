import React, { MouseEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  Box,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  toRem,
} from 'folds';
import {
  AudioDevice,
  isOutputSelectionSupported,
  requestDeviceAccess,
  setAudioInput,
  setAudioOutput,
  setInputVolume,
  setOutputVolume,
  useAudioDevices,
  useAudioPrefs,
} from '../../plugins/call/audioDevices';
import { switchLiveMicrophone, useSoundboard } from '../../plugins/call';
import { callEmbedAtom } from '../../state/callEmbed';
import { RangeInput } from '../../components/diddy/RangeInput';
import * as css from './styles.css';

type DeviceListProps = {
  devices: AudioDevice[];
  selected: string;
  disabled?: boolean;
  onSelect: (deviceId: string) => void;
};
function DeviceList({ devices, selected, disabled, onSelect }: DeviceListProps) {
  // A stored device that is not plugged in any more behaves like the system default.
  const effective = devices.some((d) => d.deviceId === selected) ? selected : '';
  const items: AudioDevice[] = [{ deviceId: '', label: 'System default' }, ...devices];

  return (
    <Box direction="Column" gap="100">
      {items.map((device) => (
        <MenuItem
          key={device.deviceId || 'default'}
          size="300"
          variant="Surface"
          radii="400"
          disabled={disabled}
          aria-pressed={effective === device.deviceId}
          after={effective === device.deviceId ? <Icon size="100" src={Icons.Check} /> : undefined}
          onClick={() => onSelect(device.deviceId)}
        >
          <Text size="T300" truncate style={{ flexGrow: 1 }}>
            {device.label}
          </Text>
        </MenuItem>
      ))}
    </Box>
  );
}

type VolumeSliderProps = {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};
function VolumeSlider({ label, value, disabled, onChange }: VolumeSliderProps) {
  return (
    <Box direction="Column" gap="100">
      <Box alignItems="Center" justifyContent="SpaceBetween">
        <Text size="T200" style={{ fontWeight: 500 }}>
          {label}
        </Text>
        <Text size="T200" priority="300">
          {Math.round(value * 100)}%
        </Text>
      </Box>
      <RangeInput
        aria-label={label}
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(evt) => onChange(Number(evt.target.value))}
        style={{ width: '100%' }}
      />
    </Box>
  );
}

const MENU_STYLE = { width: toRem(280), maxWidth: '100vw' };
const SECTION_STYLE = { padding: config.space.S300 };
const LIST_STYLE = { maxHeight: toRem(220), overflowY: 'auto' as const };

export function InputDeviceMenu() {
  const { inputs, permitted, refresh } = useAudioDevices();
  const { input, inputVolume } = useAudioPrefs();
  const callEmbed = useAtomValue(callEmbedAtom);
  const { inCall } = useSoundboard();

  const handleSelect = useCallback(
    async (deviceId: string) => {
      if (deviceId === input) return;
      setAudioInput(deviceId, inputs.find((d) => d.deviceId === deviceId)?.label ?? '');
      if (!callEmbed) return;
      // Preferred: swap the microphone inside our mixer. Fallback: toggle the mic so that Element
      // Call asks for it again.
      if (!(await switchLiveMicrophone())) callEmbed.control.restartMicrophone();
    },
    [callEmbed, input, inputs]
  );

  const handleReveal = async () => {
    await requestDeviceAccess();
    refresh();
  };

  return (
    <Menu className={css.PopoverMenu} style={MENU_STYLE}>
      <Box direction="Column" gap="200" style={SECTION_STYLE}>
        <Text size="T300" className={css.PopoverTitle}>
          Input device
        </Text>
        <div style={LIST_STYLE}>
          <DeviceList devices={inputs} selected={input} onSelect={handleSelect} />
        </div>
        {!permitted && (
          <MenuItem size="300" variant="Surface" radii="400" onClick={handleReveal}>
            <Text size="T200" priority="300" truncate>
              Allow microphone access to list devices
            </Text>
          </MenuItem>
        )}
      </Box>
      <div className={css.PopoverSeparator} />
      <Box direction="Column" gap="200" style={SECTION_STYLE}>
        <VolumeSlider label="Input volume" value={inputVolume} onChange={setInputVolume} />
        {callEmbed && !inCall && (
          <Text size="T200" priority="300">
            Device and volume changes may need a rejoin of the call.
          </Text>
        )}
      </Box>
    </Menu>
  );
}

export function OutputDeviceMenu() {
  const { outputs } = useAudioDevices();
  const { output, outputVolume } = useAudioPrefs();
  const supported = isOutputSelectionSupported();

  return (
    <Menu className={css.PopoverMenu} style={MENU_STYLE}>
      <Box direction="Column" gap="200" style={SECTION_STYLE}>
        <Text size="T300" className={css.PopoverTitle}>
          Output device
        </Text>
        <div style={LIST_STYLE}>
          <DeviceList
            devices={supported ? outputs : []}
            selected={output}
            disabled={!supported}
            onSelect={setAudioOutput}
          />
        </div>
        {!supported && (
          <Text size="T200" priority="300">
            Not supported on this system
          </Text>
        )}
      </Box>
      <div className={css.PopoverSeparator} />
      <Box direction="Column" gap="200" style={SECTION_STYLE}>
        <VolumeSlider label="Output volume" value={outputVolume} onChange={setOutputVolume} />
      </Box>
    </Menu>
  );
}

type DeviceChevronProps = {
  kind: 'input' | 'output';
  /** Small chevron for the user panel, larger one for the call control bar. */
  size?: 'panel' | 'bar';
  /** Extra class for the button (e.g. to match the neighbouring button). */
  className?: string;
};
/** Chevron button that opens the input or output device menu above itself. */
export function DeviceChevron({ kind, size = 'panel', className }: DeviceChevronProps) {
  const [cords, setCords] = useState<RectCords>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = cords !== undefined;

  const handleToggle: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (open) {
      setCords(undefined);
      return;
    }
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  // Close on a click outside or Escape. No focus trap, so dragging a slider never fights it.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (evt: PointerEvent) => {
      const target = evt.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setCords(undefined);
    };
    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') setCords(undefined);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const label = kind === 'input' ? 'Input device and volume' : 'Output device and volume';
  const bar = size === 'bar';

  return (
    <PopOut
      anchor={cords}
      position="Top"
      align={bar ? 'Center' : 'Start'}
      content={
        <div ref={menuRef}>{kind === 'input' ? <InputDeviceMenu /> : <OutputDeviceMenu />}</div>
      }
    >
      <IconButton
        ref={buttonRef}
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="400"
        className={className}
        onClick={handleToggle}
        aria-pressed={open}
        aria-label={label}
        title={label}
        // in the call bar the chevron is sized by the bar's split-button styles
        style={bar ? undefined : { width: toRem(16), height: toRem(28), minWidth: 0, marginLeft: toRem(-4) }}
      >
        <Icon size="50" src={Icons.ChevronBottom} />
      </IconButton>
    </PopOut>
  );
}
