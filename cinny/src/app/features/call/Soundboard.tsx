import React, { ChangeEvent, MouseEventHandler, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  color,
  config,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  PopOut,
  RectCords,
  Text,
  toRem,
} from 'folds';
import { soundboard, useSoundboard } from '../../plugins/call';
import { canImportFromMyInstants } from '../../plugins/myinstants';
import { MyInstantsImport } from './MyInstantsImport';
import * as css from './styles.css';
import { RangeInput } from '../../components/diddy/RangeInput';

type SoundboardMenuProps = {
  onClose: () => void;
  onImport: () => void;
};
// Also opened from the "more" menu of the sidebar call panel (issue #31).
export function SoundboardMenu({ onClose, onImport }: SoundboardMenuProps) {
  const { clips, volume, inCall, playing } = useSoundboard();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState('');

  const visibleClips = filter.trim()
    ? clips.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : clips;

  const handleFiles = async (evt: ChangeEvent<HTMLInputElement>) => {
    const input = evt.target;
    const files = Array.from(input.files ?? []);
    input.value = '';
    setError(undefined);
    for (let i = 0; i < files.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await soundboard.addClip(files[i]);
      } catch (e) {
        setError(`${files[i].name}: ${e instanceof Error ? e.message : 'could not add'}`);
      }
    }
  };

  return (
    <Menu className={css.PopoverMenu} style={{ width: toRem(312), maxWidth: '100vw' }}>
      <Box direction="Column" gap="300" style={{ padding: config.space.S300 }}>
        <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
          <Text size="T300" className={css.PopoverTitle}>
            Soundboard
          </Text>
          <Box alignItems="Center" gap="100">
            <Button
              size="300"
              variant={playing ? 'Critical' : 'Secondary'}
              fill="Soft"
              disabled={!playing}
              onClick={() => soundboard.stopAll()}
            >
              <Text size="B300">Stop</Text>
            </Button>
            <Button
              size="300"
              variant="Primary"
              fill="Soft"
              onClick={() => fileRef.current?.click()}
            >
              <Text size="B300">Add sound</Text>
            </Button>
            <IconButton
              size="300"
              variant="Surface"
              fill="None"
              radii="300"
              aria-label="Close soundboard"
              onClick={onClose}
            >
              <Icon size="100" src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
        {canImportFromMyInstants() && (
          <Button size="300" variant="Secondary" fill="Soft" onClick={onImport}>
            <Text size="B300">Import from MyInstants</Text>
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFiles}
          style={{ display: 'none' }}
        />

        {clips.length === 0 ? (
          <Text size="T200" priority="300">
            No sounds yet. Add short clips (up to 20 seconds) and click them to play for everyone in
            the call.
          </Text>
        ) : (
          <>
            {clips.length > 8 && (
              <Input
                variant="Background"
                size="300"
                outlined
                placeholder={`Search ${clips.length} sounds`}
                value={filter}
                onChange={(evt) => setFilter((evt.target as HTMLInputElement).value)}
              />
            )}
            {/* Many sounds: the list scrolls, the controls above and below stay visible. */}
            <div style={{ maxHeight: toRem(260), overflowY: 'auto', paddingRight: 2 }}>
              <Box gap="200" wrap="Wrap">
                {visibleClips.map((clip) => (
                  <Box key={clip.id} alignItems="Center" gap="100">
                    <Button
                      size="300"
                      variant={playing === clip.id ? 'Primary' : 'Secondary'}
                      fill="Soft"
                      radii="Pill"
                      onClick={() =>
                        playing === clip.id ? soundboard.stopAll() : soundboard.play(clip.id)
                      }
                      title={clip.name}
                    >
                      <Text size="B300" truncate style={{ maxWidth: toRem(110) }}>
                        {clip.name}
                      </Text>
                    </Button>
                    <IconButton
                      size="300"
                      variant="Surface"
                      fill="None"
                      radii="300"
                      aria-label={`Remove ${clip.name}`}
                      onClick={() => soundboard.removeClip(clip.id)}
                    >
                      <Icon size="100" src={Icons.Cross} />
                    </IconButton>
                  </Box>
                ))}
                {visibleClips.length === 0 && (
                  <Text size="T200" priority="300">
                    No sound matches &quot;{filter}&quot;.
                  </Text>
                )}
              </Box>
            </div>
          </>
        )}

        <div className={css.PopoverSeparator} />
        <Box alignItems="Center" gap="300">
          <Text size="T200" style={{ fontWeight: 500 }}>
            Volume
          </Text>
          <RangeInput
            aria-label="Soundboard volume"
            min={0.05}
            max={1}
            step={0.05}
            value={volume}
            onChange={(evt) => soundboard.setVolume(Number(evt.target.value))}
            style={{ flexGrow: 1 }}
          />
        </Box>

        {!inCall && (
          <Text size="T200" priority="300">
            Others hear your sounds after you (re)join a call with at least one sound added.
          </Text>
        )}
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        )}
      </Box>
    </Menu>
  );
}

export function SoundboardButton() {
  const [cords, setCords] = useState<RectCords>();
  const [importing, setImporting] = useState(false);
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

  // Close on a click outside or Escape. No focus trap: the native file dialog of "Add sound"
  // takes focus away and a trap would leave the menu stuck open.
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

  return (
    <>
      {importing && <MyInstantsImport onClose={() => setImporting(false)} />}
      <PopOut
        anchor={cords}
        position="Top"
        align="Center"
        content={
          <div ref={menuRef}>
            <SoundboardMenu
              onClose={() => setCords(undefined)}
              onImport={() => {
                setCords(undefined);
                setImporting(true);
              }}
            />
          </div>
        }
      >
        <IconButton
          ref={buttonRef}
          className={css.ControlButton}
          variant="SurfaceVariant"
          fill="Soft"
          radii="Pill"
          size="400"
          onClick={handleToggle}
          aria-pressed={open}
          aria-label="Soundboard"
          title="Soundboard"
        >
          <Icon size="400" src={Icons.Play} filled={open} />
        </IconButton>
      </PopOut>
    </>
  );
}
