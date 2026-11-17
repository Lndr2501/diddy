import FileSaver from 'file-saver';
import React, {
  PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EventType } from 'matrix-js-sdk';
import classNames from 'classnames';
import { Avatar, Box, Button, Icon, Icons, Scroll, Switch, Text, toRem } from 'folds';
import { Page } from '../../../components/page';
import { canSaveWithDialog, saveTextFileAs } from '../../../plugins/tauri';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { useUserPresence } from '../../../hooks/useUserPresence';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import {
  useDiddyProfile,
  setMyProfile,
  getDiddyDebugInfo,
  useOwnProfileKnown,
} from '../../../plugins/diddy/profiles';
import {
  DiscoveredRoom,
  discoverSpaceRooms,
  looksLikeDiddyRoom,
} from '../../../plugins/diddy/discover';
import {
  addLightOptionsRoom,
  adoptRoomAsOptionsRoom,
  createOptionsRoom,
  isLightOptionsRoom,
  removeLightOptionsRoom,
  useOptionsRooms,
} from '../../../plugins/diddy/optionsRoom';
import {
  uploadDiddyMedia,
  uploadNameplateMedia,
  uploadProfileEffect,
  uploadProfileFrame,
  useMxcUrl,
} from '../../../plugins/diddy/media';
import { readNameplateZip } from '../../../plugins/diddy/nameplateZip';
import { readProfileEffectImage, readProfileEffectZip } from '../../../plugins/diddy/effectZip';
import { readProfileFrameImage, readProfileFrameZip } from '../../../plugins/diddy/frameZip';
import {
  MAX_FRAME_LAYER_BYTES,
  MAX_FRAME_LAYERS,
  MAX_FRAME_TOTAL_BYTES,
  PROFILE_FRAME_PRESETS,
} from '../../../plugins/diddy/profileFrame';
import { ProfileFrameBox } from '../../../components/diddy/ProfileFrame';
import { MAX_EFFECT_LAYERS, PROFILE_EFFECT_PRESETS } from '../../../plugins/diddy/profileEffect';
import {
  ProfileEffectOverlay,
  useProfileEffectAnimation,
} from '../../../components/diddy/ProfileEffect';
import {
  MAX_NAMEPLATE_VIDEO_SECONDS,
  isNameplateZip,
  NAMEPLATE_ACCEPT,
  NAMEPLATE_PRESETS,
  presetGradient,
} from '../../../plugins/diddy/nameplate';
import {
  CardStyle,
  ImagePos,
  NAME_FONTS,
  NameEffect,
  NameStyle,
  NameplateStyle,
  OPTIONS_ROOM_NAME,
} from '../../../plugins/diddy/types';
import { BadgeEditor } from './BadgeEditor';
import { setShareVersion, useShareVersion } from '../../../state/versionShare';
import { APP_VERSION } from '../../../appInfo';
import { DarkTheme, LightTheme } from '../../../hooks/useTheme';
import {
  AboutEditor,
  ActivityEditor,
  EditorTab,
  EditorTabs,
  InterestsEditor,
  LayoutEditor,
  LinksEditor,
} from './ProfileCardEditor';
import {
  AngleField,
  ClearButton,
  ColorField,
  Counter,
  Field,
  Hint,
  Segmented,
  SettingsCard,
  SliderField,
  StackField,
  UploadField,
} from './ProfileSettingsUI';
import * as css from './DiddyProfileSettings.css';
import { SettingsPageHeader } from '../inset-list';
import { DiddyName } from '../../../components/diddy/DiddyName';
import { DEFAULT_IMAGE_POS, PositionedImg } from '../../../components/diddy/PositionedImg';
import { UserAvatar } from '../../../components/user-avatar';
import { LegacyAvatarNotice } from './LegacyAvatarNotice';
import { ProfilePreviewProvider } from '../../../plugins/diddy/previewOverride';
import {
  ProfileDraft,
  PreviewTarget,
  mergeDraft,
  previewPresence,
  previewProfile,
  previewTargetForTab,
  stableKey,
  toDraft,
} from '../../../plugins/diddy/profilePreview';
import {
  exportProfile,
  importProfile,
  MAX_PROFILE_FILE_BYTES,
  PROFILE_FILE_NAME,
} from '../../../plugins/diddy/profileTransfer';
import { ProfilePreviewPanel } from './ProfilePreviews';
import { EditorLayout, stickyEditorLayout } from './editorLayout';
import { STATUS_OPTIONS } from '../../../components/user-panel/UserPanelFace';
import { StatusIcon } from '../../../components/presence/StatusIcon';
import { stateOfChosen } from '../../../utils/presenceState';
import { useTranslation } from 'react-i18next';
import { translate } from '../../../i18n';

type Draft = ProfileDraft;

const EFFECTS: NameEffect[] = ['none', 'glow', 'shadow', 'outline'];
const MAX_BIO = 160;

const EFFECT_LABEL: Record<NameEffect, string> = {
  get none() {
    return translate('settings.diddyProfile.none');
  },
  get glow() {
    return translate('settings.diddyProfile.glow');
  },
  get shadow() {
    return translate('settings.diddyProfile.shadow');
  },
  get outline() {
    return translate('settings.diddyProfile.outline');
  },
};

// --- image position editor ---------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type PositionEditorProps = {
  mxc: string;
  pos?: ImagePos;
  /** frame width in px and width / height ratio of the target */
  width: number;
  ratio: number;
  onChange: (pos: ImagePos | undefined) => void;
};
function PositionEditor({ mxc, pos, width, ratio, onChange }: PositionEditorProps) {
  const { t } = useTranslation();
  const url = useMxcUrl(mxc);
  const frameRef = useRef<HTMLDivElement>(null);
  const natural = useRef<{ w: number; h: number }>();
  const drag = useRef<{ px: number; py: number; start: ImagePos; fw: number; fh: number }>();
  const cur = pos ?? DEFAULT_IMAGE_POS;

  // Pixels the image moves on screen per 1% of focal point change (object-position overflow plus
  // the zoom scale around the focal point), per axis.
  const perPercent = (axis: 'x' | 'y', p: ImagePos, fw: number, fh: number): number => {
    const n = natural.current;
    const box = axis === 'x' ? fw : fh;
    let overflow = 0;
    if (n && n.w > 0 && n.h > 0) {
      const scale = Math.max(fw / n.w, fh / n.h);
      overflow = (axis === 'x' ? n.w : n.h) * scale - box;
    }
    return (p.zoom * overflow + box * (p.zoom - 1)) / 100;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, start: cur, fw: rect.width, fh: rect.height };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const kx = perPercent('x', d.start, d.fw, d.fh);
    const ky = perPercent('y', d.start, d.fw, d.fh);
    // dragging right moves the image right, i.e. the visible area (focal point) to the left
    const x = kx > 0.01 ? d.start.x - (e.clientX - d.px) / kx : d.start.x;
    const y = ky > 0.01 ? d.start.y - (e.clientY - d.py) / ky : d.start.y;
    onChange({
      x: round1(clampNum(x, 0, 100)),
      y: round1(clampNum(y, 0, 100)),
      zoom: d.start.zoom,
    });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = undefined;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (!url) return null;
  return (
    <StackField
      label={t('settings.diddyProfile.visiblePart')}
      hint={t('settings.diddyProfile.dragThePictureTo')}
    >
      <div
        ref={frameRef}
        className={css.CropFrame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={t('settings.diddyProfile.dragToChooseThe')}
        style={{ width: toRem(width), aspectRatio: String(ratio) }}
      >
        <PositionedImg
          src={url}
          pos={cur}
          onLoad={(e) => {
            natural.current = {
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            };
          }}
        />
      </div>
      <div className={css.Controls}>
        <SliderField
          value={cur.zoom}
          min={1}
          max={3}
          step={0.05}
          label={t('settings.diddyProfile.zoom')}
          format={(z) => `${z.toFixed(1)}x`}
          onChange={(zoom) =>
            onChange({ ...cur, zoom: clampNum(Math.round(zoom * 100) / 100, 1, 3) })
          }
        />
        <Button
          size="300"
          variant="Secondary"
          fill="None"
          radii="300"
          disabled={!pos}
          onClick={() => onChange(undefined)}
        >
          <Text size="B300">{t('settings.diddyProfile.reset')}</Text>
        </Button>
      </div>
    </StackField>
  );
}

// --- debug info --------------------------------------------------------------------------------

type DebugInfo = Awaited<ReturnType<typeof getDiddyDebugInfo>>;

function DebugPanel({ mx }: { mx: Parameters<typeof getDiddyDebugInfo>[0] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [info, setInfo] = useState<DebugInfo>();
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    Promise.resolve(getDiddyDebugInfo(mx))
      .then((result) => {
        if (alive) setInfo(result);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mx, open, tick]);

  return (
    <details
      className={css.Details}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <Text as="span" size="T300">
          {t('settings.diddyProfile.debugInfo')}
        </Text>
      </summary>
      <Box>
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          onClick={() => setTick((t) => t + 1)}
        >
          <Text size="B300">{t('settings.diddyProfile.refresh')}</Text>
        </Button>
      </Box>
      <div className={css.DebugScroll}>
        <table className={css.DebugTable}>
          <thead>
            <tr>
              <th>{t('settings.diddyProfile.room')}</th>
              <th>{t('settings.diddyProfile.mode')}</th>
              <th>{t('settings.diddyProfile.enc')}</th>
              <th>{t('settings.diddyProfile.members')}</th>
              <th>{t('settings.diddyProfile.stateEv')}</th>
              <th>{t('settings.diddyProfile.msgEv')}</th>
              <th>{t('settings.diddyProfile.accepted')}</th>
              <th>{t('settings.diddyProfile.dropped')}</th>
            </tr>
          </thead>
          <tbody>
            {(info?.rooms ?? []).map((r) => (
              <tr key={r.roomId} title={r.roomId}>
                <td>{r.name}</td>
                <td>{r.mode}</td>
                <td>
                  {r.encrypted ? t('settings.diddyProfile.yes') : t('settings.diddyProfile.no')}
                </td>
                <td>{r.joinedMembers}</td>
                <td>{r.stateEvents}</td>
                <td>{r.messageEvents}</td>
                <td>{r.profilesAccepted}</td>
                <td>
                  {Object.entries(r.dropped)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(' ') || '-'}
                </td>
              </tr>
            ))}
            {info && info.rooms.length === 0 && (
              <tr>
                <td colSpan={8}>{t('settings.diddyProfile.noDataRooms')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// --- page layout -------------------------------------------------------------------------------

/**
 * Measures the page column (layout, #105) and the settings scroll area (so the sticky preview
 * column is never taller than what is visible).
 */
const usePageLayout = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const scroller = el.parentElement;
    const measure = () => {
      setWidth(el.clientWidth);
      if (scroller) setViewport(scroller.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (scroller) observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  // keep the shown layout while the width only jitters around a threshold
  const shown = useRef<EditorLayout>();
  shown.current = stickyEditorLayout(width, shown.current);
  return { ref, layout: shown.current, viewport };
};

// --- main --------------------------------------------------------------------------------------

type DiddyProfileSettingsProps = {
  requestClose: () => void;
};
export function DiddyProfileSettings({ requestClose }: DiddyProfileSettingsProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const myId = mx.getSafeUserId();
  const userProfile = useUserProfile(myId);
  const livePresence = useUserPresence(myId);
  const displayName = userProfile.displayName ?? getMxIdLocalPart(myId) ?? myId;

  const optionsRooms = useOptionsRooms(mx);
  const hasOptionsRoom = optionsRooms.length > 0;
  const lightRooms = optionsRooms.filter((room) => isLightOptionsRoom(room));
  const stored = useDiddyProfile(mx, myId);
  // saving before the stored profile has loaded would replace it with the editor's empty start
  const profileKnown = useOwnProfileKnown(mx);
  const shareVersion = useShareVersion();

  const storedBase = useMemo(() => toDraft(stored), [stored]);
  const storedKey = stableKey(storedBase);
  const [localBase, setLocalBase] = useState<Draft>();
  const base = localBase ?? storedBase;
  const baseKey = stableKey(base);

  const [draft, setDraft] = useState<Draft>(base);
  const prevBaseKey = useRef(baseKey);
  useEffect(() => {
    const prev = prevBaseKey.current;
    prevBaseKey.current = baseKey;
    setDraft((d) => (stableKey(d) === prev ? base : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);
  useEffect(() => {
    setLocalBase(undefined);
  }, [storedKey]);

  const dirty = stableKey(draft) !== baseKey;
  const [tab, setTab] = useState<EditorTab>('identity');
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>('card');
  const openTab = (next: EditorTab) => {
    setTab(next);
    const suggested = previewTargetForTab(next);
    if (suggested) setPreviewTarget(suggested);
  };

  // the draft as other Diddy users will receive it, and the online state it gives (#105)
  const shown = useMemo(
    () => previewProfile(stored, draft, shareVersion ? APP_VERSION : undefined),
    [stored, draft, shareVersion]
  );
  const shownPresence = useMemo(
    () => previewPresence(draft.status, livePresence?.status),
    [draft.status, livePresence?.status]
  );
  const nameOverride = useMemo(
    () => ({ userId: myId, profile: shown, presence: shownPresence }),
    [myId, shown, shownPresence]
  );

  const page = usePageLayout();
  // one column: the preview sits above the editor and can be folded away
  const oneColumn = page.layout.columns === 'one';
  const [previewOpen, setPreviewOpen] = useState(true);

  const patchNameStyle = (p: Partial<NameStyle>) =>
    setDraft((d) => ({ ...d, nameStyle: { ...d.nameStyle, ...p } }));
  const patchCard = (p: Partial<CardStyle>) =>
    setDraft((d) => ({ ...d, card: { ...d.card, ...p } }));
  const patchPlate = (p: Partial<NameplateStyle>) =>
    setDraft((d) => ({ ...d, nameplate: { ...d.nameplate, ...p } }));
  const animateEffects = useProfileEffectAnimation();

  // setup
  const spaces = mx
    .getRooms()
    .filter((room) => room.isSpaceRoom() && room.getMyMembership() === 'join');
  const [spaceId, setSpaceId] = useState('');
  const [setupMode, setSetupMode] = useState<'new' | 'existing'>('new');
  const [roomName, setRoomName] = useState(OPTIONS_ROOM_NAME);
  const [existingRoomId, setExistingRoomId] = useState('');
  const [tagTopic, setTagTopic] = useState(true);
  const existingRooms = mx
    .getRooms()
    .filter((room) => !room.isSpaceRoom() && room.getMyMembership() === 'join')
    .sort((a, b) => a.name.localeCompare(b.name));
  const roomTopic = (roomId: string): string | undefined =>
    mx.getRoom(roomId)?.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent()?.topic;
  const isDiddyJoined = (roomId: string, name: string) =>
    looksLikeDiddyRoom(name, roomTopic(roomId));

  // rooms of the user's spaces (including the ones not joined yet)
  const [discovered, setDiscovered] = useState<DiscoveredRoom[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const discoverToken = useRef(0);
  const loadDiscovered = useCallback(() => {
    discoverToken.current += 1;
    const token = discoverToken.current;
    setDiscovering(true);
    discoverSpaceRooms(mx)
      .then((rooms) => {
        if (token === discoverToken.current) setDiscovered(rooms);
      })
      .catch(() => {
        if (token === discoverToken.current) setDiscovered([]);
      })
      .finally(() => {
        if (token === discoverToken.current) setDiscovering(false);
      });
  }, [mx]);
  useEffect(() => {
    if (setupMode === 'existing' && !hasOptionsRoom) loadDiscovered();
  }, [setupMode, hasOptionsRoom, loadDiscovered]);

  const unjoinedRooms = discovered
    .filter((d) => !mx.getRoom(d.roomId) || mx.getRoom(d.roomId)?.getMyMembership() !== 'join')
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedUnjoined = unjoinedRooms.find((d) => d.roomId === existingRoomId);
  const selectedJoined = existingRooms.find((room) => room.roomId === existingRoomId);
  let selectedIsDiddy = false;
  if (selectedUnjoined) {
    selectedIsDiddy = looksLikeDiddyRoom(selectedUnjoined.name, selectedUnjoined.topic);
  } else if (selectedJoined) {
    selectedIsDiddy = isDiddyJoined(selectedJoined.roomId, selectedJoined.name);
  }

  // preselect a room that is marked as a Diddy room
  useEffect(() => {
    if (setupMode !== 'existing' || existingRoomId) return;
    const joinedHit = existingRooms.find((room) => isDiddyJoined(room.roomId, room.name));
    const hit = joinedHit
      ? joinedHit.roomId
      : unjoinedRooms.find((d) => looksLikeDiddyRoom(d.name, d.topic))?.roomId;
    if (hit) setExistingRoomId(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupMode, discovered, existingRooms.length]);

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const [lightUsed, setLightUsed] = useState(false);
  const handleUseLight = () => {
    if (!existingRoomId) return;
    addLightOptionsRoom(existingRoomId);
    setSetupError(undefined);
    setLightUsed(true);
  };
  const joinAndWait = async (roomId: string, via?: string[]) => {
    await mx.joinRoom(roomId, { viaServers: via });
    for (let i = 0; i < 20; i += 1) {
      const room = mx.getRoom(roomId);
      if (
        room?.getMyMembership() === 'join' &&
        room.currentState.getStateEvents(EventType.RoomPowerLevels, '')
      ) {
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    }
    if (mx.getRoom(roomId)?.getMyMembership() !== 'join') {
      throw new Error('Joining the room takes too long. Try again in a moment.');
    }
  };
  const handleCreate = async () => {
    setCreating(true);
    setSetupError(undefined);
    setLightUsed(false);
    try {
      if (setupMode === 'existing') {
        if (!existingRoomId) throw new Error('Choose a room first.');
        if (selectedUnjoined) await joinAndWait(existingRoomId, selectedUnjoined.via);
        await adoptRoomAsOptionsRoom(mx, existingRoomId, tagTopic);
      } else {
        await createOptionsRoom(mx, spaceId || undefined, roomName);
      }
      setCreated(true);
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : t('settings.diddyProfile.couldNotCreateThe'));
    } finally {
      setCreating(false);
    }
  };

  // uploads
  const [busyKey, setBusyKey] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();
  const upload = async (key: string, file: File, apply: (mxc: string) => void) => {
    setBusyKey(key);
    setUploadError(undefined);
    try {
      apply(await uploadDiddyMedia(mx, file));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('settings.diddyProfile.uploadFailed'));
    } finally {
      setBusyKey(undefined);
    }
  };
  // a picture, or a short video plus its first frame as the still picture (#78)
  const uploadPlate = async (file: File) => {
    setBusyKey('plate');
    setUploadError(undefined);
    try {
      let plateFile = file;
      let plateColor: string | undefined;
      if (isNameplateZip(file)) {
        const zip = await readNameplateZip(await file.arrayBuffer());
        plateFile = new File([zip.data], zip.name, { type: zip.type });
        plateColor = zip.color;
      }
      const { imageMxc, videoMxc } = await uploadNameplateMedia(mx, plateFile);
      patchPlate({
        imageMxc,
        videoMxc,
        imagePos: undefined,
        ...(plateColor ? { color: plateColor } : {}),
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('settings.diddyProfile.uploadFailed'));
    } finally {
      setBusyKey(undefined);
    }
  };

  // a profile effect (#86): a ZIP in the collection layout or one animated picture
  const uploadEffect = async (file: File) => {
    setBusyKey('effect');
    setUploadError(undefined);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const imported = isNameplateZip(file)
        ? await readProfileEffectZip(data.buffer)
        : readProfileEffectImage(file.name, data);
      const effect = await uploadProfileEffect(mx, imported);
      setDraft((d) => ({ ...d, effect }));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('settings.diddyProfile.uploadFailed'));
    } finally {
      setBusyKey(undefined);
    }
  };

  // a profile frame (#87): a ZIP in the collection layout or one PNG / WebP
  const uploadFrame = async (file: File) => {
    setBusyKey('frame');
    setUploadError(undefined);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const imported = isNameplateZip(file)
        ? await readProfileFrameZip(data.buffer)
        : readProfileFrameImage(file.name, data);
      const frame = await uploadProfileFrame(mx, imported);
      setDraft((d) => ({ ...d, frame }));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('settings.diddyProfile.uploadFailed'));
    } finally {
      setBusyKey(undefined);
    }
  };

  // save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const handleSave = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const clean = JSON.parse(JSON.stringify(draft)) as Draft;
      // keeps everything the editor does not manage (shownBadges is written by BadgeEditor)
      await setMyProfile(mx, mergeDraft(stored, clean));
      setLocalBase(clean);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('settings.diddyProfile.couldNotSave'));
    } finally {
      setSaving(false);
    }
  };

  const ns = draft.nameStyle ?? {};
  const { gradient } = ns;
  const resetDraft = () => {
    setDraft(base);
    setSaveError(undefined);
  };
  const saveDisabled = saving || !dirty || busyKey !== undefined || !profileKnown;

  // export / import of the customization as a file (#157)
  const importInput = useRef<HTMLInputElement>(null);
  const [transfer, setTransfer] = useState<{ tone: 'error' | 'success'; text: string }>();
  const handleExport = async () => {
    const text = exportProfile(draft);
    try {
      if (!canSaveWithDialog()) {
        // browser and Linux shell: the browser's own download
        FileSaver.saveAs(new Blob([text], { type: 'application/json' }), PROFILE_FILE_NAME);
        setTransfer({
          tone: 'success',
          text: t('settings.diddyProfile.savedProfilefilename', {
            profileFileName: PROFILE_FILE_NAME,
          }),
        });
        return;
      }
      // desktop app: the user picks the folder and the name
      const path = await saveTextFileAs(PROFILE_FILE_NAME, text, {
        name: t('settings.diddyProfile.diddyProfile'),
        extensions: ['json'],
      });
      if (path)
        setTransfer({ tone: 'success', text: t('settings.diddyProfile.savedToPath', { path }) });
    } catch (e) {
      setTransfer({
        tone: 'error',
        text: e instanceof Error ? e.message : t('settings.diddyProfile.theFileCouldNot'),
      });
    }
  };
  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PROFILE_FILE_BYTES) {
      setTransfer({ tone: 'error', text: t('settings.diddyProfile.thisFileIsToo') });
      return;
    }
    const result = importProfile(await file.text());
    if (!result.ok) {
      setTransfer({ tone: 'error', text: result.error });
      return;
    }
    // fills the editor only; your status stays, nothing is saved until you press Save
    setDraft((d) => ({ ...result.draft, ...(d.status ? { status: d.status } : {}) }));
    setSaveError(undefined);
    setTransfer({
      tone: 'success',
      text: t('settings.diddyProfile.importedCheckThePreview'),
    });
  };
  let setupLabel = t('settings.diddyProfile.createDiddyOptionsRoom');
  if (setupMode === 'existing')
    setupLabel = selectedUnjoined
      ? t('settings.diddyProfile.joinAndUse')
      : t('settings.diddyProfile.useThisRoom');

  const setupCard = (
    <SettingsCard
      icon={Icons.Server}
      title={t('settings.diddyProfile.setUpTheData')}
      description={t('settings.diddyProfile.diddyNeedsAHidden')}
      footer={<Hint>{t('settings.diddyProfile.notAnAdminAsk')}</Hint>}
    >
      <Hint>{t('settings.diddyProfile.onAPrivateServer')}</Hint>
      <Field label={t('settings.diddyProfile.mode')}>
        <Segmented
          label={t('settings.diddyProfile.mode')}
          value={setupMode}
          options={[
            { id: 'new', label: t('settings.diddyProfile.createANewHidden') },
            { id: 'existing', label: t('settings.diddyProfile.useAnExistingRoom') },
          ]}
          onChange={(m) => {
            if (!creating) setSetupMode(m);
          }}
        />
      </Field>
      {setupMode === 'new' && (
        <>
          <Field label={t('settings.diddyProfile.roomName')}>
            <input
              className={css.Input}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={OPTIONS_ROOM_NAME}
              aria-label={t('settings.diddyProfile.roomName')}
              disabled={creating}
            />
          </Field>
          <Field label={t('settings.diddyProfile.createItIn')}>
            <select
              className={css.Input}
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              aria-label={t('settings.diddyProfile.createItIn')}
              disabled={creating}
            >
              <option value="">{t('settings.diddyProfile.noSpacePrivateRoom')}</option>
              {spaces.map((space) => (
                <option key={space.roomId} value={space.roomId}>
                  {space.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      {setupMode === 'existing' && (
        <>
          <Field label={t('settings.diddyProfile.room')}>
            <select
              className={css.Input}
              value={existingRoomId}
              onChange={(e) => setExistingRoomId(e.target.value)}
              aria-label={t('settings.diddyProfile.room')}
              disabled={creating}
            >
              <option value="">{t('settings.diddyProfile.chooseARoom')}</option>
              <optgroup label={t('settings.diddyProfile.yourRooms')}>
                {existingRooms.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.name}
                    {isDiddyJoined(room.roomId, room.name)
                      ? t('settings.diddyProfile.diddyRoom')
                      : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('settings.diddyProfile.roomsInYourSpaces')}>
                {unjoinedRooms.map((d) => (
                  <option key={d.roomId} value={d.roomId}>
                    {d.name} ({d.spaceName})
                    {looksLikeDiddyRoom(d.name, d.topic)
                      ? t('settings.diddyProfile.diddyRoom')
                      : ''}
                  </option>
                ))}
              </optgroup>
            </select>
            {selectedIsDiddy && (
              <span className={css.Badge}>{t('settings.diddyProfile.diddyRoom2')}</span>
            )}
          </Field>
          <Field
            label={t('settings.diddyProfile.spaces')}
            hint={
              (discovering && t('settings.diddyProfile.lookingInYourSpaces')) ||
              (unjoinedRooms.length === 0 && t('settings.diddyProfile.noUnjoinedRoomsFound')) ||
              undefined
            }
          >
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              disabled={discovering || creating}
              onClick={loadDiscovered}
            >
              <Text size="B300">{t('settings.diddyProfile.refresh')}</Text>
            </Button>
          </Field>
          <Field
            label={t('settings.diddyProfile.letOthersFindIt')}
            hint={t('settings.diddyProfile.addsDiddyOptionsTo')}
          >
            <Switch variant="Primary" value={tagTopic} onChange={setTagTopic} />
          </Field>
          <Hint>{t('settings.diddyProfile.theRoomIsThen')}</Hint>
        </>
      )}
      <div className={css.Controls}>
        <Button
          size="400"
          variant="Primary"
          radii="300"
          disabled={creating || created}
          onClick={handleCreate}
        >
          <Text size="B400">{creating ? t('settings.diddyProfile.working') : setupLabel}</Text>
        </Button>
        {created && <Hint tone="success">{t('settings.diddyProfile.roomCreatedYouCan')}</Hint>}
        {lightUsed && <Hint tone="success">{t('settings.diddyProfile.roomIsUsedIn')}</Hint>}
      </div>
      {setupError && <Hint tone="error">{setupError}</Hint>}
      {setupError &&
        setupMode === 'existing' &&
        existingRoomId &&
        !created &&
        mx.getRoom(existingRoomId)?.getMyMembership() === 'join' && (
          <div className={css.Controls}>
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              disabled={creating}
              onClick={handleUseLight}
            >
              <Text size="B300">{t('settings.diddyProfile.useWithoutAdminRights')}</Text>
            </Button>
            <Hint>{t('settings.diddyProfile.everyoneHasToChoose')}</Hint>
          </div>
        )}
    </SettingsCard>
  );

  const identityTab = (
    <>
      <SettingsCard
        icon={Icons.Eye}
        title={t('settings.diddyProfile.displayName')}
        description={t('settings.diddyProfile.howYourNameLooks')}
      >
        <ProfilePreviewProvider value={nameOverride}>
          <div className={css.NameStage}>
            {[
              { id: 'light', label: t('settings.diddyProfile.light'), theme: LightTheme },
              { id: 'dark', label: t('settings.diddyProfile.dark'), theme: DarkTheme },
            ].map((half) => (
              <div
                key={half.id}
                className={classNames(half.theme.classNames, css.NameStageHalf)}
                data-theme-preview={half.id}
              >
                <Text as="span" size="H2">
                  <DiddyName userId={myId} name={displayName} />
                </Text>
                <Text size="T200" priority="300">
                  {half.label}
                </Text>
              </div>
            ))}
          </div>
        </ProfilePreviewProvider>
      </SettingsCard>
      <SettingsCard
        icon={Icons.Alphabet}
        title={t('settings.diddyProfile.nameStyle')}
        description={t('settings.diddyProfile.fontEffectAndWeight')}
      >
        <Field label={t('settings.diddyProfile.font')}>
          <select
            className={css.Input}
            value={ns.font ?? 'default'}
            aria-label={t('settings.diddyProfile.font')}
            onChange={(e) => patchNameStyle({ font: e.target.value })}
          >
            {NAME_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.diddyProfile.effect')}>
          <Segmented
            label={t('settings.diddyProfile.effect')}
            value={ns.effect ?? 'none'}
            options={EFFECTS.map((eff) => ({ id: eff, label: EFFECT_LABEL[eff] }))}
            onChange={(effect) => patchNameStyle({ effect })}
          />
        </Field>
        <Field label={t('settings.diddyProfile.bold')}>
          <Switch
            variant="Primary"
            value={!!ns.bold}
            onChange={(on) => patchNameStyle({ bold: on })}
          />
        </Field>
        <Field label={t('settings.diddyProfile.italic')}>
          <Switch
            variant="Primary"
            value={!!ns.italic}
            onChange={(on) => patchNameStyle({ italic: on })}
          />
        </Field>
      </SettingsCard>
      <SettingsCard
        icon={Icons.Bulb}
        title={t('settings.diddyProfile.nameColor')}
        description={t('settings.diddyProfile.aSolidColorOr')}
      >
        <Field label={t('settings.diddyProfile.fill')}>
          <Segmented
            label={t('settings.diddyProfile.fill')}
            value={gradient ? 'gradient' : 'solid'}
            options={[
              { id: 'solid', label: t('settings.diddyProfile.solid') },
              { id: 'gradient', label: t('settings.diddyProfile.gradient') },
            ]}
            onChange={(mode) =>
              patchNameStyle({
                gradient:
                  mode === 'gradient'
                    ? gradient ?? { from: ns.color ?? '#7aa2f7', to: '#c084fc', angle: 90 }
                    : undefined,
              })
            }
          />
        </Field>
        {!gradient && (
          <Field label={t('settings.diddyProfile.color')}>
            <ColorField
              label={t('settings.diddyProfile.nameColor')}
              value={ns.color}
              fallback="#ffffff"
              onChange={(c) => patchNameStyle({ color: c })}
            />
            {ns.color && <ClearButton onClick={() => patchNameStyle({ color: undefined })} />}
          </Field>
        )}
        {gradient && (
          <>
            <Field label={t('settings.diddyProfile.colors')}>
              <ColorField
                label={t('settings.diddyProfile.gradientStart')}
                value={gradient.from}
                fallback="#7aa2f7"
                onChange={(c) => patchNameStyle({ gradient: { ...gradient, from: c } })}
              />
              <ColorField
                label={t('settings.diddyProfile.gradientEnd')}
                value={gradient.to}
                fallback="#c084fc"
                onChange={(c) => patchNameStyle({ gradient: { ...gradient, to: c } })}
              />
            </Field>
            <Field label={t('settings.diddyProfile.angle')}>
              <AngleField
                value={gradient.angle ?? 90}
                onChange={(angle) => patchNameStyle({ gradient: { ...gradient, angle } })}
              />
            </Field>
          </>
        )}
      </SettingsCard>
    </>
  );

  const cardTab = (
    <>
      <SettingsCard
        icon={Icons.Flag}
        title={t('settings.diddyProfile.headerAccent')}
        description={t('settings.diddyProfile.headerColorsAreUsed')}
        action={
          (draft.card?.from || draft.card?.to || draft.card?.angle !== undefined) && (
            <ClearButton
              label={t('settings.diddyProfile.clearHeader')}
              onClick={() => patchCard({ from: undefined, to: undefined, angle: undefined })}
            />
          )
        }
      >
        <Field label={t('settings.diddyProfile.headerColors')}>
          <ColorField
            label={t('settings.diddyProfile.headerStart')}
            value={draft.card?.from}
            fallback="#3a3f5c"
            onChange={(c) => patchCard({ from: c })}
          />
          <ColorField
            label={t('settings.diddyProfile.headerEnd')}
            value={draft.card?.to}
            fallback="#3a3f5c"
            onChange={(c) => patchCard({ to: c })}
          />
        </Field>
        <Field label={t('settings.diddyProfile.direction')}>
          <AngleField value={draft.card?.angle ?? 135} onChange={(angle) => patchCard({ angle })} />
        </Field>
        <Field label={t('settings.diddyProfile.accentColor')}>
          <ColorField
            label={t('settings.diddyProfile.accentColor')}
            value={draft.card?.accent}
            fallback="#7aa2f7"
            onChange={(c) => patchCard({ accent: c })}
          />
          {draft.card?.accent && <ClearButton onClick={() => patchCard({ accent: undefined })} />}
        </Field>
      </SettingsCard>
      <SettingsCard
        icon={Icons.Photo}
        title={t('settings.diddyProfile.banner')}
        description={t('settings.diddyProfile.anImageOrGif')}
      >
        <UploadField
          title={
            draft.card?.bannerMxc
              ? t('settings.diddyProfile.bannerImage')
              : t('settings.diddyProfile.noBannerYet')
          }
          hint={t('settings.diddyProfile.gifWebpOrPng')}
          accept="image/*"
          wide
          mxc={draft.card?.bannerMxc}
          busy={busyKey === 'banner'}
          onFile={(file) =>
            upload('banner', file, (mxc) => patchCard({ bannerMxc: mxc, bannerPos: undefined }))
          }
          onRemove={() => patchCard({ bannerMxc: undefined, bannerPos: undefined })}
        />
        {draft.card?.bannerMxc && (
          <PositionEditor
            mxc={draft.card.bannerMxc}
            pos={draft.card.bannerPos}
            width={420}
            ratio={640 / 192}
            onChange={(bannerPos) => patchCard({ bannerPos })}
          />
        )}
      </SettingsCard>
      <SettingsCard
        icon={Icons.Pencil}
        title={t('settings.diddyProfile.bio')}
        description={t('settings.diddyProfile.aShortTextUnder')}
        action={<Counter value={(draft.bio ?? '').length} max={MAX_BIO} />}
      >
        <textarea
          className={css.TextArea}
          rows={4}
          maxLength={MAX_BIO}
          value={draft.bio ?? ''}
          placeholder={t('settings.diddyProfile.tellPeopleABit')}
          aria-label={t('settings.diddyProfile.bio')}
          onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value.slice(0, MAX_BIO) }))}
        />
      </SettingsCard>
      <AboutEditor draft={draft} patch={setDraft} />
      <InterestsEditor key={baseKey} draft={draft} patch={setDraft} />
      <LinksEditor draft={draft} patch={setDraft} />
      <ActivityEditor draft={draft} patch={setDraft} />
    </>
  );

  const avatarSrc = userProfile.avatarUrl
    ? mxcUrlToHttp(mx, userProfile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;
  const avatarTab = (
    <>
      <SettingsCard
        icon={Icons.User}
        title={t('settings.diddyProfile.profilePicture')}
        description={t('settings.diddyProfile.yourProfilePictureIs')}
      >
        <div className={css.Controls}>
          <Avatar size="400" radii="Pill">
            <UserAvatar
              surface="account"
              userId={myId}
              src={avatarSrc}
              alt={displayName}
              renderFallback={() => <Text size="H4">{nameInitials(displayName)}</Text>}
            />
          </Avatar>
          <Hint>{t('settings.diddyProfile.changeItInSettings')}</Hint>
        </div>
      </SettingsCard>
      <SettingsCard
        icon={Icons.Bookmark}
        title={t('settings.diddyProfile.nameplate')}
        description={t('settings.diddyProfile.theBackgroundOtherDiddy')}
      >
        <Field label={t('settings.diddyProfile.style')}>
          <Segmented
            label={t('settings.diddyProfile.nameplateStyle')}
            value={draft.nameplate?.fit ?? 'fade'}
            options={[
              { id: 'fade', label: t('settings.diddyProfile.fadeIn') },
              { id: 'full', label: t('settings.diddyProfile.wholeRow') },
            ]}
            onChange={(fit) => patchPlate({ fit: fit === 'full' ? 'full' : undefined })}
          />
        </Field>
        <StackField label={t('settings.diddyProfile.gradient')}>
          <div
            className={css.PresetGrid}
            role="group"
            aria-label={t('settings.diddyProfile.gradientPresets')}
          >
            <button
              type="button"
              className={classNames(css.PresetSwatch, css.PresetNone)}
              aria-pressed={!draft.nameplate?.preset}
              onClick={() => patchPlate({ preset: undefined, flow: undefined })}
            >
              {t('settings.diddyProfile.none')}
            </button>
            {NAMEPLATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={css.PresetSwatch}
                aria-pressed={draft.nameplate?.preset === preset.id}
                style={{ backgroundImage: presetGradient(preset.id, 135) }}
                onClick={() => patchPlate({ preset: preset.id })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </StackField>
        {draft.nameplate?.preset ? (
          <Field label={t('settings.diddyProfile.flowing')}>
            <Switch
              variant="Primary"
              value={!!draft.nameplate.flow}
              onChange={(on) => patchPlate({ flow: on || undefined })}
            />
          </Field>
        ) : (
          <Field label={t('settings.diddyProfile.color')}>
            <ColorField
              label={t('settings.diddyProfile.nameplateColor')}
              value={draft.nameplate?.color}
              fallback="#7aa2f7"
              onChange={(c) => patchPlate({ color: c })}
            />
            {draft.nameplate?.color && (
              <ClearButton onClick={() => patchPlate({ color: undefined })} />
            )}
          </Field>
        )}
        <UploadField
          title={
            (draft.nameplate?.videoMxc && t('settings.diddyProfile.nameplateVideo')) ||
            (draft.nameplate?.imageMxc && t('settings.diddyProfile.nameplateImage')) ||
            t('settings.diddyProfile.pictureOrVideoOptional')
          }
          hint={t('settings.diddyProfile.pngJpgGifWebp', {
            maxNameplateVideoSeconds: MAX_NAMEPLATE_VIDEO_SECONDS,
          })}
          accept={NAMEPLATE_ACCEPT}
          acceptsFile={(file) => /^(image|video)\//.test(file.type) || isNameplateZip(file)}
          wide
          mxc={draft.nameplate?.imageMxc}
          busy={busyKey === 'plate'}
          onFile={uploadPlate}
          onRemove={() =>
            patchPlate({ imageMxc: undefined, videoMxc: undefined, imagePos: undefined })
          }
        />
        {draft.nameplate?.imageMxc && (
          <PositionEditor
            mxc={draft.nameplate.imageMxc}
            pos={draft.nameplate.imagePos}
            width={420}
            ratio={560 / 80}
            onChange={(imagePos) => patchPlate({ imagePos })}
          />
        )}
      </SettingsCard>
      <SettingsCard
        icon={Icons.Star}
        title={t('settings.diddyProfile.profileEffect')}
        description={t('settings.diddyProfile.anAnimatedOverlayOther')}
      >
        <StackField label={t('settings.diddyProfile.builtIn')}>
          <div
            className={css.PresetGrid}
            role="group"
            aria-label={t('settings.diddyProfile.profileEffectPresets')}
          >
            <button
              type="button"
              className={classNames(css.PresetSwatch, css.PresetNone)}
              aria-pressed={!draft.effect}
              onClick={() => setDraft((d) => ({ ...d, effect: undefined }))}
            >
              {t('settings.diddyProfile.none')}
            </button>
            {PROFILE_EFFECT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={classNames(css.PresetSwatch, css.EffectSwatch)}
                aria-pressed={!draft.effect?.layers && draft.effect?.preset === preset.id}
                onClick={() => setDraft((d) => ({ ...d, effect: { preset: preset.id } }))}
              >
                <ProfileEffectOverlay effect={{ preset: preset.id }} animate={animateEffects} />
                <span className={css.EffectSwatchLabel}>{preset.label}</span>
              </button>
            ))}
          </div>
        </StackField>
        <UploadField
          title={
            draft.effect?.layers
              ? t('settings.diddyProfile.ownLayers', {
                  name: draft.effect.name ?? t('settings.diddyProfile.yourEffect'),
                  count: draft.effect.layers.length,
                })
              : t('settings.diddyProfile.yourOwnEffectOptional')
          }
          hint={t('settings.diddyProfile.aZipWithKonfiguration', {
            maxEffectLayers: MAX_EFFECT_LAYERS,
          })}
          accept=".zip,application/zip,image/png,image/webp,image/gif"
          acceptsFile={(file) =>
            ['image/png', 'image/webp', 'image/gif'].includes(file.type) || isNameplateZip(file)
          }
          wide
          mxc={draft.effect?.previewMxc ?? draft.effect?.stillMxc ?? draft.effect?.layers?.[0]?.mxc}
          busy={busyKey === 'effect'}
          onFile={uploadEffect}
          onRemove={() => setDraft((d) => ({ ...d, effect: undefined }))}
        />
      </SettingsCard>
      <SettingsCard
        icon={Icons.Photo}
        title={t('settings.diddyProfile.profileFrame')}
        description={t('settings.diddyProfile.aDecorativeFrameOther')}
      >
        <StackField label={t('settings.diddyProfile.builtIn')}>
          <div
            className={css.PresetGrid}
            role="group"
            aria-label={t('settings.diddyProfile.profileFramePresets')}
          >
            <button
              type="button"
              className={classNames(css.PresetSwatch, css.PresetNone)}
              aria-pressed={!draft.frame}
              onClick={() => setDraft((d) => ({ ...d, frame: undefined }))}
            >
              {t('settings.diddyProfile.none')}
            </button>
            {PROFILE_FRAME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={classNames(css.PresetSwatch, css.FrameSwatch)}
                aria-pressed={!draft.frame?.layers && draft.frame?.preset === preset.id}
                onClick={() => setDraft((d) => ({ ...d, frame: { preset: preset.id } }))}
              >
                <ProfileFrameBox
                  frame={{ preset: preset.id }}
                  width={toRem(44)}
                  respectViewerSwitch={false}
                >
                  <div className={css.FrameSwatchCard} />
                </ProfileFrameBox>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </StackField>
        <UploadField
          title={
            draft.frame?.layers
              ? t('settings.diddyProfile.ownLayers', {
                  name: draft.frame.name ?? t('settings.diddyProfile.yourFrame'),
                  count: draft.frame.layers.length,
                })
              : t('settings.diddyProfile.yourOwnFrameOptional')
          }
          hint={`A ZIP with konfiguration.json and its layers (Ebenen/), a ZIP with a *top* and a *bottom* picture, or one PNG / WebP laid over the whole card. Up to ${MAX_FRAME_LAYERS} layers, ${
            MAX_FRAME_LAYER_BYTES / (1024 * 1024)
          } MB each, ${MAX_FRAME_TOTAL_BYTES / (1024 * 1024)} MB in total.`}
          accept=".zip,application/zip,image/png,image/webp"
          acceptsFile={(file) =>
            ['image/png', 'image/webp'].includes(file.type) || isNameplateZip(file)
          }
          wide
          mxc={draft.frame?.layers?.[0]?.mxc}
          busy={busyKey === 'frame'}
          onFile={uploadFrame}
          onRemove={() => setDraft((d) => ({ ...d, frame: undefined }))}
        />
      </SettingsCard>
    </>
  );

  const statusTab = (
    <>
      <SettingsCard
        icon={Icons.Smile}
        title={t('settings.diddyProfile.status')}
        description={t('settings.diddyProfile.shownNextToYour')}
      >
        <div className={css.ChipRow} role="group" aria-label={t('settings.diddyProfile.status')}>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.status}
              type="button"
              className={css.Pill}
              aria-pressed={(draft.status ?? 'online') === s.status}
              title={s.description}
              onClick={() => setDraft((d) => ({ ...d, status: s.status }))}
            >
              <StatusIcon state={stateOfChosen(s.status)} size={12} decorative />
              <Text as="span" size="T300">
                {s.label}
              </Text>
            </button>
          ))}
        </div>
      </SettingsCard>
      <BadgeEditor />
    </>
  );

  const privacyTab = (
    <>
      <SettingsCard
        icon={Icons.Server}
        title={t('settings.diddyProfile.dataRoom')}
        description={t('settings.diddyProfile.theHiddenRoomDiddy')}
        footer={
          lightRooms.length > 0 && <Hint>{t('settings.diddyProfile.messageModeNoAdmin')}</Hint>
        }
      >
        <div className={css.Group}>
          {optionsRooms.map((room) => {
            const light = isLightOptionsRoom(room);
            return (
              <div key={room.roomId} className={css.GroupRow}>
                <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
                  <Text size="T300" truncate>
                    {room.name}
                  </Text>
                  <Text size="T200" priority="300">
                    {light
                      ? t('settings.diddyProfile.messageMode')
                      : t('settings.diddyProfile.stateMode')}
                  </Text>
                </Box>
                {light && (
                  <Button
                    size="300"
                    variant="Critical"
                    fill="None"
                    radii="300"
                    onClick={() => {
                      removeLightOptionsRoom(room.roomId);
                      setLightUsed(false);
                    }}
                  >
                    <Text size="B300">{t('settings.diddyProfile.stopUsingThisRoom')}</Text>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </SettingsCard>
      <SettingsCard
        icon={Icons.ShieldLock}
        title={t('settings.diddyProfile.whatOthersSee')}
        description={t('settings.diddyProfile.everythingOnThisPage')}
      >
        <Hint>{t('settings.diddyProfile.yourProfileCardBadges')}</Hint>
        <Field
          label={t('settings.diddyProfile.showMyDiddyVersion')}
          hint={t('settings.diddyProfile.appversionSmallOnYour', { appVersion: APP_VERSION })}
        >
          <Switch variant="Primary" value={shareVersion} onChange={setShareVersion} />
        </Field>
      </SettingsCard>
      <SettingsCard
        icon={Icons.Terminal}
        title={t('settings.diddyProfile.diagnostics')}
        description={t('settings.diddyProfile.technicalDetailsAboutThe')}
      >
        <DebugPanel mx={mx} />
      </SettingsCard>
    </>
  );

  const tabContent: Record<EditorTab, React.ReactNode> = {
    identity: identityTab,
    card: cardTab,
    avatar: avatarTab,
    status: statusTab,
    layout: <LayoutEditor draft={draft} patch={setDraft} />,
    privacy: hasOptionsRoom ? privacyTab : null,
  };

  const showSaveBar = dirty && hasOptionsRoom;

  const headerActions = hasOptionsRoom ? (
    <>
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="profile-import-input"
        onChange={(evt) => {
          const file = evt.target.files?.[0];
          // the same file can be picked again
          evt.target.value = '';
          handleImportFile(file).catch(() =>
            setTransfer({ tone: 'error', text: t('settings.diddyProfile.theFileCouldNot2') })
          );
        }}
      />
      <Button
        size="300"
        variant="Secondary"
        fill="None"
        radii="300"
        before={<Icon size="100" src={Icons.Download} />}
        disabled={saving}
        onClick={() => {
          handleExport();
        }}
      >
        <Text size="B300">{t('settings.diddyProfile.export')}</Text>
      </Button>
      <Button
        size="300"
        variant="Secondary"
        fill="None"
        radii="300"
        before={<Icon size="100" src={Icons.ArrowTop} />}
        disabled={saving}
        onClick={() => importInput.current?.click()}
      >
        <Text size="B300">{t('settings.diddyProfile.import')}</Text>
      </Button>
      <Button
        size="300"
        variant="Secondary"
        fill="None"
        radii="300"
        before={<Icon size="100" src={Icons.Reload} />}
        disabled={saving || stableKey(draft) === stableKey({})}
        onClick={() => {
          setDraft({});
          setSaveError(undefined);
        }}
      >
        <Text size="B300">{t('settings.diddyProfile.resetToDefault')}</Text>
      </Button>
    </>
  ) : undefined;

  return (
    <Page>
      {/* the same slim header as every other settings page; save / cancel live in the save bar */}
      <SettingsPageHeader
        title={t('settings.diddyProfile.profile')}
        requestClose={requestClose}
        actions={headerActions}
      />
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <div
            ref={page.ref}
            className={css.Wrap}
            data-columns={page.layout.columns}
            data-compact={page.layout.compact}
            style={
              {
                '--pe-viewport-h': page.viewport ? `${page.viewport}px` : undefined,
                '--pe-savebar': showSaveBar ? toRem(72) : '0px',
              } as React.CSSProperties
            }
          >
            {!hasOptionsRoom && setupCard}
            <LegacyAvatarNotice
              legacyMxc={stored?.animatedAvatarMxc}
              matrixMxc={userProfile.avatarUrl}
            />

            <div className={css.Layout}>
              <div
                className={hasOptionsRoom ? css.Main : `${css.Main} ${css.Disabled}`}
                aria-disabled={!hasOptionsRoom}
                {...(hasOptionsRoom ? {} : ({ inert: '' } as object))}
              >
                <EditorTabs
                  tab={tab}
                  onChange={openTab}
                  hide={hasOptionsRoom ? undefined : ['privacy']}
                />
                {uploadError && <Hint tone="error">{uploadError}</Hint>}
                {transfer && <Hint tone={transfer.tone}>{transfer.text}</Hint>}
                <div className={css.Panel} role="tabpanel">
                  {tabContent[tab]}
                </div>
              </div>

              <aside
                className={css.PreviewColumn}
                aria-label={t('settings.diddyProfile.livePreview')}
              >
                <SettingsCard
                  icon={Icons.Eye}
                  title={t('settings.diddyProfile.preview')}
                  description={t('settings.diddyProfile.yourUnsavedChangesDrawn')}
                  action={
                    oneColumn && (
                      <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        aria-expanded={previewOpen}
                        onClick={() => setPreviewOpen((o) => !o)}
                      >
                        <Text size="B300">
                          {previewOpen
                            ? t('settings.diddyProfile.hide')
                            : t('settings.diddyProfile.show')}
                        </Text>
                      </Button>
                    )
                  }
                >
                  {(previewOpen || !oneColumn) && (
                    <ProfilePreviewPanel
                      userId={myId}
                      displayName={displayName}
                      avatarMxc={userProfile.avatarUrl}
                      profile={shown}
                      presence={shownPresence}
                      status={draft.status ?? 'online'}
                      target={previewTarget}
                      onTarget={setPreviewTarget}
                    />
                  )}
                </SettingsCard>
              </aside>
            </div>

            {showSaveBar && (
              <div className={css.SaveBar}>
                <Text size="T300">
                  {saveError ? (
                    <span className={css.ErrorText}>{saveError}</span>
                  ) : (
                    t('settings.diddyProfile.youHaveUnsavedChanges')
                  )}
                </Text>
                <Box gap="200" shrink="No">
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    disabled={saving}
                    onClick={resetDraft}
                  >
                    <Text size="B300">{t('settings.diddyProfile.cancel')}</Text>
                  </Button>
                  <Button
                    size="300"
                    variant="Primary"
                    radii="300"
                    disabled={saveDisabled}
                    onClick={handleSave}
                  >
                    <Text size="B300">
                      {saving
                        ? t('settings.diddyProfile.saving')
                        : t('settings.diddyProfile.saveChanges')}
                    </Text>
                  </Button>
                </Box>
              </div>
            )}
          </div>
        </Scroll>
      </Box>
    </Page>
  );
}
