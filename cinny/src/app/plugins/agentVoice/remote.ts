import { MAX_ACTIVE_MS } from './session';

// Telling the others in the call (#57), and what the desktop shell reports.

/** To-device event sent to the devices of the other call members (ephemeral, not stored in rooms). */
export const AGENT_VOICE_EVENT = 'app.diddy.agent_voice';

export type AgentVoicePayload = { room_id: string; active: boolean; ts: number };

/** Validates an incoming payload; anything else is ignored. */
export const parseAgentPayload = (content: unknown): AgentVoicePayload | undefined => {
  if (!content || typeof content !== 'object') return undefined;
  const c = content as Record<string, unknown>;
  if (typeof c.room_id !== 'string' || !c.room_id.startsWith('!') || c.room_id.length > 255) {
    return undefined;
  }
  if (typeof c.active !== 'boolean' || typeof c.ts !== 'number' || !Number.isFinite(c.ts)) {
    return undefined;
  }
  return { room_id: c.room_id, active: c.active, ts: c.ts };
};

/**
 * Who of the others in the call currently talks to an agent. Newest message per sender wins, an
 * active state expires after MAX_ACTIVE_MS (a lost "stopped" message must not stick).
 */
export class RemoteAgentVoices {
  private entries = new Map<string, { ts: number; until: number }>();

  private lastTs = new Map<string, number>();

  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  /** Returns true when the set of talking users changed. */
  public receive(sender: string, payload: AgentVoicePayload, roomId: string): boolean {
    if (payload.room_id !== roomId) return false;
    const last = this.lastTs.get(sender);
    if (last !== undefined && payload.ts <= last) return false;
    this.lastTs.set(sender, payload.ts);
    const had = this.entries.has(sender);
    if (payload.active)
      this.entries.set(sender, { ts: payload.ts, until: this.now() + MAX_ACTIVE_MS });
    else this.entries.delete(sender);
    return had !== payload.active;
  }

  /** Keeps only call members; drops expired entries. Returns true when something changed. */
  public prune(members?: Set<string>): boolean {
    const now = this.now();
    let changed = false;
    this.entries.forEach((entry, userId) => {
      if (entry.until <= now || (members && !members.has(userId))) {
        this.entries.delete(userId);
        changed = true;
      }
    });
    return changed;
  }

  public clear(): void {
    this.entries.clear();
    this.lastTs.clear();
  }

  public users(): string[] {
    return [...this.entries.keys()];
  }
}

// --- external trigger ------------------------------------------------------------------------

/** What the desktop shell reports: the system reading of the hotkey (null: cannot read) and the trigger. */
export type NativeAgentState = { key: boolean | null; trigger: boolean };

export const parseNativeState = (value: unknown): NativeAgentState | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.trigger !== 'boolean') return undefined;
  return { key: typeof v.key === 'boolean' ? v.key : null, trigger: v.trigger };
};
