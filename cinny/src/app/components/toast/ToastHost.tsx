import React, {
  KeyboardEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { Icon, Icons } from 'folds';
import { AppToast, dismissToastAtom, toastsAtom } from '../../state/toasts';
import {
  TOAST_DURATION_MS,
  TOAST_GAP,
  TOAST_HEIGHT,
  TOAST_PEEK,
  TOAST_SWIPE_DISMISS,
  toastPlacement,
} from '../../plugins/toastLogic';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { getInboxInvitesPath } from '../../pages/pathUtils';
import { useHasCustomTitleBar } from '../titlebar/TitleBar';
import { TITLE_BAR_HEIGHT } from '../titlebar/TitleBar.css';
import * as css from './ToastHost.css';

const LEAVE_MS = 260;
const CLICK_SLOP = 4;

type ToastCardProps = {
  toast: AppToast;
  index: number;
  expanded: boolean;
  leaving: boolean;
  onOpen: (toast: AppToast) => void;
  onClose: (key: string) => void;
};

function ToastCard({ toast, index, expanded, leaving, onOpen, onClose }: ToastCardProps) {
  // enter from above on the next frame, so the transition has a starting point
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // auto-dismiss; hovering the stack pauses every timer, an update restarts it
  const remainingRef = useRef(TOAST_DURATION_MS);
  useEffect(() => {
    remainingRef.current = TOAST_DURATION_MS;
  }, [toast.stamp]);
  useEffect(() => {
    if (expanded || leaving) return undefined;
    const started = Date.now();
    const timer = window.setTimeout(() => onClose(toast.key), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(remainingRef.current - (Date.now() - started), 1000);
    };
  }, [expanded, leaving, toast.key, toast.stamp, onClose]);

  // swipe up to dismiss
  const dragRef = useRef<{ y: number; moved: boolean } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { y: event.clientY, moved: false };
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = event.clientY - drag.y;
    if (Math.abs(dy) > CLICK_SLOP && !drag.moved) {
      drag.moved = true;
      setDragging(true);
    }
    if (!drag.moved) return;
    // up follows the finger, down only gives a little
    setDragY(dy < 0 ? dy : dy * 0.2);
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag) return;
    if (drag.moved) {
      // released: let the card glide on from where it is (up and away, or back into place)
      setDragging(false);
      setDragY(0);
      if (event.clientY - drag.y < -TOAST_SWIPE_DISMISS) onClose(toast.key);
      return;
    }
    onOpen(toast);
  };
  const handlePointerCancel = () => {
    dragRef.current = null;
    setDragging(false);
    setDragY(0);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(toast);
    } else if (event.key === 'Escape' || event.key === 'Delete') {
      event.preventDefault();
      onClose(toast.key);
    }
  };

  const place = toastPlacement(index, expanded);
  const hidden = !mounted || leaving;
  const y = hidden ? -TOAST_HEIGHT - 16 : place.y + dragY;
  const opacity = hidden ? 0 : place.opacity;

  return (
    <div
      className={css.Toast}
      role="button"
      data-behind={!expanded && index > 0}
      data-dragging={dragging}
      style={{
        transform: `translateY(${y}px) scale(${place.scale})`,
        opacity,
        zIndex: 100 - index,
      }}
      tabIndex={index === 0 || expanded ? 0 : -1}
      aria-label={`${toast.title}: ${toast.body}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    >
      <span className={css.Content}>
        <span className={css.Avatar} data-highlight={!!toast.highlight} aria-hidden>
          {toast.avatarUrl ? (
            <img className={css.AvatarImg} src={toast.avatarUrl} alt="" draggable={false} />
          ) : (
            (toast.title.trim()[0] ?? '?').toUpperCase()
          )}
        </span>
        <span className={css.Text}>
          <span className={css.Title}>{toast.title}</span>
          <span className={css.Body}>{toast.body}</span>
        </span>
      </span>
      <button
        type="button"
        className={css.Close}
        aria-label="Dismiss notification"
        tabIndex={-1}
        onClick={() => onClose(toast.key)}
      >
        <Icon src={Icons.Cross} size="50" />
      </button>
    </div>
  );
}

/**
 * In-app notification toasts at the top of the window: newest in front, older ones peek out
 * below and fan out on hover. Click opens the room, swipe up or the close button dismisses.
 */
export function ToastHost() {
  const toasts = useAtomValue(toastsAtom);
  const dismiss = useSetAtom(dismissToastAtom);
  const { navigateRoom } = useRoomNavigate();
  const navigate = useNavigate();
  const customTitleBar = useHasCustomTitleBar();

  const [expanded, setExpanded] = useState(false);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, number>());

  const close = useCallback(
    (key: string) => {
      if (timers.current.has(key)) return;
      setLeaving((prev) => new Set(prev).add(key));
      const timer = window.setTimeout(() => {
        timers.current.delete(key);
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        dismiss(key);
      }, LEAVE_MS);
      timers.current.set(key, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // the stack is gone: nothing left to hover
  useEffect(() => {
    if (toasts.length === 0) setExpanded(false);
  }, [toasts.length]);

  const open = useCallback(
    (toast: AppToast) => {
      window.focus();
      if (toast.roomId) navigateRoom(toast.roomId);
      else navigate(getInboxInvitesPath());
      close(toast.key);
    },
    [navigateRoom, navigate, close]
  );

  const visible = toasts.filter((t) => !leaving.has(t.key));
  const height = expanded
    ? visible.length * (TOAST_HEIGHT + TOAST_GAP)
    : TOAST_HEIGHT + Math.max(visible.length - 1, 0) * TOAST_PEEK;

  if (toasts.length === 0) return null;

  return (
    <section
      className={css.Host}
      aria-live="polite"
      aria-label="Notifications"
      style={{
        top: (customTitleBar ? TITLE_BAR_HEIGHT : 0) + 12,
        height,
        // expanded, the gaps between the cards belong to the stack so it does not collapse
        pointerEvents: expanded ? 'auto' : undefined,
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      {toasts.map((toast) => {
        const isLeaving = leaving.has(toast.key);
        const index = isLeaving ? 0 : visible.indexOf(toast);
        return (
          <ToastCard
            key={toast.key}
            toast={toast}
            index={index}
            expanded={expanded}
            leaving={isLeaving}
            onOpen={open}
            onClose={close}
          />
        );
      })}
    </section>
  );
}
