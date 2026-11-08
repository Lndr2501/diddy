import React, { CSSProperties, ReactNode, forwardRef, useMemo, useState } from 'react';
import classNames from 'classnames';
import { ProfileFrame, ProfileFrameLayer } from '../../plugins/diddy/types';
import { sanitizeProfileFrame } from '../../plugins/diddy/sanitize';
import {
  FrameGeometry,
  ProfileFramePresetId,
  ResolvedFrame,
  fitCardWidth,
  frameFactors,
  frameLayerCss,
  framePaddingCss,
  resolveProfileFrame,
} from '../../plugins/diddy/profileFrame';
import { useMxcUrl } from '../../plugins/diddy/media';
import { useAvatarPrefs } from '../../state/avatarPrefs';
import * as css from './ProfileFrame.css';

/** Whether this viewer wants to see profile frames (Settings > General). */
export const useProfileFramesEnabled = (): boolean => useAvatarPrefs().profileFrames;

const W = 'var(--diddy-frame-w)';

// --- uploaded layers ----------------------------------------------------------------------------

function FrameLayerImg({ layer, geometry }: { layer: ProfileFrameLayer; geometry: FrameGeometry }) {
  const url = useMxcUrl(layer.mxc, undefined, { animated: true });
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  const place = frameLayerCss(layer.anchor, geometry, W);
  const fill = layer.anchor === 'fill';
  const box: CSSProperties = {
    left: place.left,
    right: place.right,
    top: place.top,
    bottom: place.bottom,
  };
  return (
    <div
      className={classNames(
        css.Layer,
        css.LayerOrder[layer.order],
        place.center && css.LayerCenter
      )}
      style={box}
    >
      <img
        className={classNames(css.LayerImg, fill && css.LayerImgFill)}
        src={url}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// --- built-in presets ---------------------------------------------------------------------------

const LEAF = 'M0 0 C 10 -12, 30 -12, 40 0 C 30 12, 10 12, 0 0 Z';

/** An original corner flourish: a curling stem with leaves and small flowers (600 x 400 units). */
function VineCorner({ className }: { className: string }) {
  const leaves: [number, number, number][] = [
    [120, 104, -30],
    [190, 116, 20],
    [270, 100, -25],
    [350, 114, 15],
    [430, 104, -20],
    [62, 170, 110],
    [48, 240, 70],
    [64, 310, 110],
  ];
  const flowers: [number, number, number][] = [
    [92, 112, 40],
    [236, 108, 28],
    [56, 215, 26],
  ];
  return (
    <svg
      className={classNames(css.Layer, css.LayerOrder.front, className)}
      viewBox="0 0 600 400"
      aria-hidden
    >
      <g fill="none" strokeLinecap="round">
        <path
          d="M56 380 C 40 300, 72 250, 56 180 C 44 130, 70 104, 120 110 C 200 120, 260 92, 330 108 C 400 124, 460 96, 540 108"
          stroke="#2f6b3a"
          strokeWidth="16"
        />
        <path
          d="M56 380 C 40 300, 72 250, 56 180 C 44 130, 70 104, 120 110 C 200 120, 260 92, 330 108 C 400 124, 460 96, 540 108"
          stroke="#5fa86a"
          strokeWidth="7"
        />
        <path
          d="M540 108 c 26 -4, 34 -30, 14 -36 c -14 -4, -20 10, -8 14"
          stroke="#5fa86a"
          strokeWidth="7"
        />
        <path d="M56 380 c 4 14, -10 18, -14 8" stroke="#5fa86a" strokeWidth="7" />
      </g>
      {leaves.map(([x, y, r]) => (
        <path
          key={`${x}-${y}`}
          d={LEAF}
          transform={`translate(${x} ${y}) rotate(${r}) scale(1.9)`}
          fill="#4f9a5a"
          stroke="#2f6b3a"
          strokeWidth="2"
        />
      ))}
      {flowers.map(([x, y, s]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx="0"
              cy={-s * 0.6}
              rx={s * 0.45}
              ry={s * 0.7}
              transform={`rotate(${a})`}
              fill="#f2a7c4"
              stroke="#b8547e"
              strokeWidth="1.5"
            />
          ))}
          <circle r={s * 0.35} fill="#ffd66b" stroke="#c99a2e" strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}

function FramePreset({ id }: { id: ProfileFramePresetId }) {
  const layer = (variant: keyof typeof css.Preset, order: 'front' | 'back' = 'front') => (
    <div className={classNames(css.Layer, css.LayerOrder[order], css.Preset[variant])} />
  );
  switch (id) {
    case 'glow':
      return layer('glow', 'back');
    case 'gold':
      return (
        <>
          {layer('goldOuter')}
          {layer('goldInner')}
        </>
      );
    case 'neon':
      return (
        <>
          {layer('neonOuter')}
          {layer('neonInner')}
        </>
      );
    case 'pixel':
      return layer('pixel', 'back');
    case 'vines':
      return (
        <>
          <VineCorner className={css.Preset.vinesTopLeft} />
          <VineCorner className={css.Preset.vinesBottomRight} />
        </>
      );
    default:
      return null;
  }
}

// --- the box ------------------------------------------------------------------------------------

/** The frame of a profile (sanitised again: the editor passes a draft), or none. */
export const useResolvedFrame = (
  frame: ProfileFrame | undefined,
  enabled: boolean
): ResolvedFrame | undefined =>
  useMemo(() => resolveProfileFrame(sanitizeProfileFrame(frame), enabled), [frame, enabled]);

type ProfileFrameBoxProps = {
  frame: ProfileFrame | undefined;
  /**
   * preferred card width (CSS length). Without it the card fills the container of the box (minus
   * the side overhangs of the frame).
   */
  width?: string;
  /** room the card and its side overhangs may take at most (CSS length), e.g. `100vw - 2rem` */
  available?: string;
  /** false ignores the viewer switch (the owner's own editor preview) */
  respectViewerSwitch?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * A profile card with its frame (#87). The frame needs room outside the card, so put this box
 * OUTSIDE anything that clips the card (the popover / dialog with its rounded corners) and let
 * the child fill the given width. Everything is sized in CSS from the card width, nothing is
 * measured, so a popover places the framed card in one go. The ref is the outermost element (a
 * focus trap can hold it).
 */
export const ProfileFrameBox = forwardRef<HTMLDivElement, ProfileFrameBoxProps>(
  (
    { frame, width, available = '100vw - 2rem', respectViewerSwitch = true, className, children },
    ref
  ) => {
    const viewerWants = useProfileFramesEnabled();
    const resolved = useResolvedFrame(frame, !respectViewerSwitch || viewerWants);
    const geometry: FrameGeometry = resolved?.geometry ?? {
      innerWidth: 1200,
      overflowTop: 0,
      overflowBottom: 0,
      overflowHorizontal: 0,
    };
    const cardWidth = width
      ? fitCardWidth(width, available, geometry)
      : `calc(100cqw / ${Math.round((1 + 2 * frameFactors(geometry).side) * 10000) / 10000})`;
    const pad = framePaddingCss(geometry, W);

    const box = (
      <div
        ref={width ? ref : undefined}
        className={classNames(css.Wrap, className)}
        style={
          {
            '--diddy-frame-w': cardWidth,
            '--diddy-frame-pad-y': pad.vertical,
            width: W,
            padding: `${pad.top} ${pad.side} ${pad.bottom}`,
          } as CSSProperties
        }
        data-frame={resolved?.kind === 'preset' ? resolved.id : resolved?.kind}
      >
        <div className={css.Stage}>
          {resolved?.kind === 'preset' && <FramePreset id={resolved.id} />}
          {resolved?.kind === 'layers' &&
            resolved.layers.map((layer, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <FrameLayerImg key={i} layer={layer} geometry={resolved.geometry} />
            ))}
          <div className={css.Card}>{children}</div>
        </div>
      </div>
    );
    return width ? (
      box
    ) : (
      <div ref={ref} className={css.Fluid}>
        {box}
      </div>
    );
  }
);
