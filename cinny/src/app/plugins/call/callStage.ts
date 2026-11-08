/**
 * Diddy's own call stage (Discord-style): every person and every screen share is a tile of its
 * own, drawn by Diddy in the app window.
 *
 * Element Call (same-origin iframe) still runs the call: connection, audio, its menus and
 * dialogs. Diddy reads who is on the call from its media tiles and shows their video streams
 * (the same MediaStream objects, so nothing is decoded twice or re-negotiated). While the stage
 * is on, Element Call's own tile grids stay laid out but transparent: LiveKit keeps receiving
 * the video at the size Element Call shows it, and the tile menus still open from those tiles.
 *
 * Stable hooks used (see also callTheme.ts / callFrameMenu.ts):
 *   - [data-testid="videoTile"]           a media tile
 *   - data-id="…:screen-share"            a screen share tile (camera tiles have none or another)
 *   - [aria-label="@user:server"]         the owner of a tile (avatar label)
 *   - [data-testid="name_tag"]            the display name
 *   - [data-muted="true"]                 microphone muted
 *   - class substrings _speaking_, _inRoom_, _grid_
 */
import { tileUserId } from '../callFrameMenu';

export type StagePerson = {
  userId: string;
  name: string;
  speaking: boolean;
  muted: boolean;
  /** camera, only while it sends pictures */
  video?: MediaStream;
};

export type StageShare = {
  /** Element Call's id of the share tile (user, device, "screen-share") */
  id: string;
  userId: string;
  name: string;
  video?: MediaStream;
};

export type StageModel = {
  people: StagePerson[];
  shares: StageShare[];
};

export const EMPTY_STAGE: StageModel = { people: [], shares: [] };

const TILE = '[data-testid="videoTile"]';

type StreamLike = {
  id: string;
  getVideoTracks: () => { readyState: string; muted: boolean }[];
};
const isStream = (value: unknown): value is StreamLike =>
  !!value && typeof (value as StreamLike).getVideoTracks === 'function';

/** The tile's video stream while it actually shows pictures (a camera that is off has none). */
const liveVideo = (tile: Element): MediaStream | undefined => {
  const video = tile.querySelector('video');
  const stream = video?.srcObject;
  // not `instanceof MediaStream`: the stream belongs to the iframe's realm
  if (!video || !isStream(stream)) return undefined;
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live' || track.muted) return undefined;
  if (video.videoWidth === 0) return undefined;
  return stream as unknown as MediaStream;
};

const SCREEN_SHARE_SUFFIX = ':screen-share';

/** Who is on the call and which screen shares run, read from Element Call's tiles. */
export const readCallStage = (doc: Document | null | undefined): StageModel => {
  if (!doc) return EMPTY_STAGE;
  const people = new Map<string, StagePerson>();
  const shares: StageShare[] = [];
  doc.querySelectorAll(TILE).forEach((tile) => {
    const userId = tileUserId(tile);
    if (!userId) return;
    const name = tile.querySelector('[data-testid="name_tag"]')?.textContent?.trim() || userId;
    const dataId = tile.getAttribute('data-id') ?? '';
    const video = liveVideo(tile);
    if (dataId.endsWith(SCREEN_SHARE_SUFFIX)) {
      if (!shares.some((s) => s.id === dataId)) shares.push({ id: dataId, userId, name, video });
      return;
    }
    // a person can have two tiles (the spotlight and the grid): merge them
    const speaking = /(^|\s)_speaking_/.test(tile.className.toString());
    const muted = !!tile.querySelector('[data-muted="true"]');
    const known = people.get(userId);
    if (known) {
      known.speaking = known.speaking || speaking;
      known.muted = known.muted || muted;
      known.video = known.video ?? video;
      return;
    }
    people.set(userId, { userId, name, speaking, muted, video });
  });
  return { people: [...people.values()], shares };
};

/**
 * Your own speaking state, measured by Diddy (#76): Element Call leaves your tile without the
 * speaking class in one-on-one calls and whenever the server does not report you as a speaker.
 * Only marks you while your tile does not show you muted; never clears what Element Call shows.
 */
export const markSpeaking = (
  model: StageModel,
  userId: string | undefined,
  speaking: boolean
): StageModel => {
  if (!speaking || !userId) return model;
  const person = model.people.find((p) => p.userId === userId);
  if (!person || person.speaking || person.muted) return model;
  return {
    ...model,
    people: model.people.map((p) => (p === person ? { ...p, speaking: true } : p)),
  };
};

/** Who is speaking on the stage. */
export const stageSpeakers = (model: StageModel): Set<string> =>
  new Set(model.people.filter((p) => p.speaking).map((p) => p.userId));

/** A string that changes whenever anything visible on the stage changes. */
export const stageSignature = (model: StageModel): string =>
  [
    ...model.people.map(
      (p) => `p|${p.userId}|${p.name}|${p.speaking}|${p.muted}|${p.video?.id ?? ''}`
    ),
    ...model.shares.map((s) => `s|${s.id}|${s.name}|${s.video?.id ?? ''}`),
  ].join('\n');

const STYLE_ATTR = 'data-diddy-call-stage';
const STAGE_ATTR = 'data-diddy-stage';
/** On the call container while Element Call shows a menu or dialog that must take clicks. */
export const CALL_OVERLAY_ATTR = 'data-call-overlay';
/** On the call container while the Diddy stage is shown. */
export const CALL_STAGE_ATTR = 'data-call-stage';

// Element Call's tile grids stay laid out (LiveKit keeps the video coming at their size) but are
// not drawn. Menus and dialogs are portaled to <body>, outside the grids, so they stay visible.
const STAGE_CSS = `
html body[${STAGE_ATTR}] [class*="_inRoom_"] > [class*="_grid_"] {
  opacity: 0 !important;
}
`;

const OVERLAY = '[role="menu"], [role="dialog"], [role="listbox"]';

/**
 * Switch the Diddy stage on or off for the call in `iframe`. While it is on, the call container
 * lets clicks through to the stage, except while Element Call shows a menu or a dialog.
 * Returns a cleanup function (switches it off).
 */
export const enableCallStage = (iframe: HTMLIFrameElement | null | undefined): (() => void) => {
  const doc = iframe?.contentWindow?.document;
  const container = iframe?.parentElement;
  if (!iframe || !doc?.body || !container) return () => undefined;

  if (!doc.querySelector(`style[${STYLE_ATTR}]`)) {
    const style = doc.createElement('style');
    style.setAttribute(STYLE_ATTR, 'true');
    style.textContent = STAGE_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  doc.body.setAttribute(STAGE_ATTR, 'true');
  container.setAttribute(CALL_STAGE_ATTR, 'true');

  const syncOverlay = () => {
    container.toggleAttribute(CALL_OVERLAY_ATTR, !!doc.querySelector(OVERLAY));
  };
  syncOverlay();
  const observer = new MutationObserver(syncOverlay);
  observer.observe(doc.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    doc.body?.removeAttribute(STAGE_ATTR);
    container.removeAttribute(CALL_STAGE_ATTR);
    container.removeAttribute(CALL_OVERLAY_ATTR);
  };
};
