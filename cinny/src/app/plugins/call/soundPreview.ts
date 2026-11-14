/**
 * One preview at a time for sounds you have not imported yet (MyInstants import, #205).
 * Starting another preview, clicking the playing one again or closing the dialog stops it.
 * A preview that is still downloading or decoding when it is stopped never starts.
 */

type PreviewNode = {
  buffer: unknown;
  onended: (() => void) | null;
  connect: (node: unknown) => unknown;
  disconnect: () => void;
  start: () => void;
  stop: () => void;
};

type PreviewGain = {
  gain: { value: number };
  connect: (node: unknown) => unknown;
  disconnect: () => void;
};

/** The part of AudioContext the preview needs (a fake one in the tests). */
export type PreviewContext = {
  destination: unknown;
  decodeAudioData: (data: ArrayBuffer) => Promise<unknown>;
  createBufferSource: () => PreviewNode;
  createGain: () => PreviewGain;
};

export type PreviewState = {
  /** The sound that is loading or playing, undefined when quiet. */
  key: string | undefined;
  loading: boolean;
};

export class SoundPreview {
  private listeners = new Set<() => void>();

  private state: PreviewState = { key: undefined, loading: false };

  /** Bumped by every start and stop; an older load that finishes late is dropped. */
  private generation = 0;

  private source?: PreviewNode;

  private gain?: PreviewGain;

  private readonly getContext: () => PreviewContext;

  constructor(getContext: () => PreviewContext) {
    this.getContext = getContext;
  }

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): PreviewState => this.state;

  private set(state: PreviewState) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }

  private release() {
    const { source, gain } = this;
    this.source = undefined;
    this.gain = undefined;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already ended
      }
      source.disconnect();
    }
    gain?.disconnect();
  }

  /** Stops whatever is loading or playing. */
  public stop() {
    this.generation += 1;
    this.release();
    if (this.state.key !== undefined || this.state.loading) {
      this.set({ key: undefined, loading: false });
    }
  }

  /**
   * Same key as the current preview: stop it. Otherwise stop the current one and play `key`.
   * `load` fetches the audio bytes; errors are passed on after the state is reset.
   */
  public async toggle(key: string, load: () => Promise<ArrayBuffer>, volume: number) {
    if (this.state.key === key) {
      this.stop();
      return;
    }
    this.stop();
    this.generation += 1;
    const mine = this.generation;
    this.set({ key, loading: true });
    try {
      const bytes = await load();
      if (mine !== this.generation) return;
      const ctx = this.getContext();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      if (mine !== this.generation) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        if (this.source !== source) return;
        this.stop();
      };
      this.source = source;
      this.gain = gain;
      source.start();
      this.set({ key, loading: false });
    } catch (e) {
      // a preview that was already replaced or stopped fails quietly
      if (mine !== this.generation) return;
      this.stop();
      throw e;
    }
  }
}
