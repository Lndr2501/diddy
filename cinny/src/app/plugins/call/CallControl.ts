import { playCallSound } from './callSounds';
import { ClientWidgetApi } from 'matrix-widget-api';
import EventEmitter from 'events';
import { CallControlState } from './CallControlState';
import { diag } from '../diagnostics';
import { applyAudioOutput, subscribeAudioPrefs } from './audioDevices';
import { screenShareAudio } from './screenShareAudio';
import { ElementMediaStateDetail, ElementMediaStatePayload, ElementWidgetActions } from './types';

export enum CallControlEvent {
  StateUpdate = 'state_update',
}

export class CallControl extends EventEmitter implements CallControlState {
  private state: CallControlState;

  private call: ClientWidgetApi;

  private iframe: HTMLIFrameElement;

  private bodyMutationObserver: MutationObserver;

  private controlMutationObserver: MutationObserver;

  private mediaStatePromiseResolver: undefined | (() => void);

  private readonly stopAudioPrefs: () => void;

  private mediaObserver?: MutationObserver;

  private outputTimer?: number;

  /** <video> elements WE muted because the user is deafened (unmuted again on un-deafen). */
  private deafMutedVideos = new WeakSet<HTMLMediaElement>();

  private restarting = false;

  // Whether the microphone was live when the user deafened, so un-deafening can restore it.
  private micWasOnBeforeDeafen = false;

  private get document(): Document | undefined {
    return this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
  }

  private get screenshareButton(): HTMLElement | undefined {
    const screenshareBtn = this.document?.querySelector(
      '[data-testid="incall_screenshare"]'
    ) as HTMLElement | null;

    return screenshareBtn ?? undefined;
  }

  private get leaveButton(): Element | undefined {
    const leaveBtn = this.document?.querySelector('[data-testid="incall_leave"]');

    return leaveBtn ?? undefined;
  }

  private get settingsButton(): HTMLElement | undefined {
    const settingsButtonLeft = this.document?.querySelector(
      '[data-testid="settings-bottom-left"]'
    ) as HTMLButtonElement | undefined;
    const settingsButtonCenter = this.document?.querySelector(
      '[data-testid="settings-bottom-center"]'
    ) as HTMLButtonElement | undefined;

    return settingsButtonLeft ?? settingsButtonCenter ?? undefined;
  }

  private get reactionsButton(): HTMLElement | undefined {
    const reactionsButton = this.leaveButton?.previousElementSibling as HTMLElement | null;

    return reactionsButton ?? undefined;
  }

  private get spotlightButton(): HTMLInputElement | undefined {
    const spotlightButton = this.document?.querySelector(
      'input[value="spotlight"]'
    ) as HTMLInputElement | null;

    return spotlightButton ?? undefined;
  }

  private get gridButton(): HTMLInputElement | undefined {
    const gridButton = this.document?.querySelector(
      'input[value="grid"]'
    ) as HTMLInputElement | null;

    return gridButton ?? undefined;
  }

  private appliedDeafened = new WeakMap<HTMLMediaElement, boolean>();

  constructor(state: CallControlState, call: ClientWidgetApi, iframe: HTMLIFrameElement) {
    super();

    this.state = state;
    this.call = call;
    this.iframe = iframe;

    this.bodyMutationObserver = new MutationObserver(this.onBodyMutation.bind(this));
    this.controlMutationObserver = new MutationObserver(this.onControlMutation.bind(this));

    // Output device / volume preferences: apply when they change, and when Element Call adds or
    // removes media elements (somebody joins / shares), debounced.
    this.stopAudioPrefs = subscribeAudioPrefs(() => this.scheduleApplyOutput());
  }

  public getState(): CallControlState {
    return this.state;
  }

  public get microphone(): boolean {
    return this.state.microphone;
  }

  public get video(): boolean {
    return this.state.video;
  }

  public get sound(): boolean {
    return this.state.sound;
  }

  public get screenshare(): boolean {
    return this.state.screenshare;
  }

  public get spotlight(): boolean {
    return this.state.spotlight;
  }

  public async applyState() {
    await this.setMediaState({
      audio_enabled: this.microphone,
      video_enabled: this.video,
    });
    this.setSound();
    this.emitStateUpdate();
  }

  public startObserving() {
    if (!this.document) return;

    this.mediaObserver?.disconnect();
    this.mediaObserver = new MutationObserver(() => this.scheduleApplyOutput());
    this.mediaObserver.observe(this.document, { childList: true, subtree: true });
    this.scheduleApplyOutput();

    this.bodyMutationObserver.observe(this.document.body, {
      childList: true,
      subtree: false, // only direct children of body
    });
    this.onBodyMutation();
  }
  
  private onBodyMutation() {
    if (!this.document) return;

    this.document.body.style.setProperty('background', 'none', 'important');

    const controls = this.leaveButton?.parentElement?.parentElement;
    if (controls) {
      controls.style.setProperty('position', 'absolute');
      controls.style.setProperty('visibility', 'hidden');
    }

    this.observeControls();
  }

  private observeControls() {
    this.controlMutationObserver.disconnect();

    const screenshareBtn = this.screenshareButton;
    if (screenshareBtn) {
      this.controlMutationObserver.observe(screenshareBtn, {
        attributes: true,
        attributeFilter: ['data-kind'],
      });
    }
    const spotlightBtn = this.spotlightButton;
    if (spotlightBtn) {
      this.controlMutationObserver.observe(spotlightBtn, {
        attributes: true,
      });
    }

    this.onControlMutation();
  }

  public applySound() {
    this.setSound();
  }

  private async setMediaState(state: ElementMediaStatePayload) {
    const data = await this.call.transport.send(ElementWidgetActions.DeviceMute, state);
    return new Promise<typeof data>(resolve => {
      if (this.mediaStatePromiseResolver) {
        this.mediaStatePromiseResolver();
      }
      this.mediaStatePromiseResolver = () => resolve(data);
    });
  }

  private setSound(): void {
    this.applyOutput();
  }

  private scheduleApplyOutput(): void {
    window.clearTimeout(this.outputTimer);
    this.outputTimer = window.setTimeout(() => {
      this.outputTimer = undefined;
      this.applyOutput();
    }, 250);
  }

  /** True when the element plays back the system audio we capture for the screen share. */
  private static carriesLocalShareAudio(el: HTMLMediaElement): boolean {
    const stream = el.srcObject as MediaStream | null;
    if (!stream || typeof stream.getAudioTracks !== 'function') return false;
    return stream.getAudioTracks().some((track) => screenShareAudio.isCurrent(track));
  }

  /** Applies the chosen output device and output volume to the media elements of the call. */
  public applyOutput(): void {
    let callDocument: Document | undefined | null;
    try {
      callDocument = this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
    } catch {
      return;
    }
    const deafened = !this.sound;
    callDocument?.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => {
      const target = el;
      if (target.tagName === 'AUDIO') {
        // Only touch `muted` when our deafen state changed: a blanket write undid the per-user
        // mute of the call (#38).
        const before = this.appliedDeafened.get(target);
        if (before !== deafened) {
          this.appliedDeafened.set(target, deafened);
          // first sight while not deafened: keep whatever the call set (per-user mute)
          if (deafened || before === true) target.muted = deafened;
        }
      } else if (CallControl.carriesLocalShareAudio(target)) {
        // Never replay our own captured system audio locally (would echo / feed back).
        if (!target.muted) target.muted = true;
      } else if (deafened) {
        if (!target.muted) {
          target.muted = true;
          this.deafMutedVideos.add(target);
        }
      } else if (this.deafMutedVideos.has(target)) {
        this.deafMutedVideos.delete(target);
        target.muted = false;
      }
      applyAudioOutput(target);
    });
  }

  /**
   * Fallback to make Element Call re-acquire the microphone (used when the live swap in the
   * soundboard mixer is not available): turn the microphone off and on again.
   */
  public async restartMicrophone(): Promise<void> {
    if (this.restarting || !this.microphone) return;
    this.restarting = true;
    const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });
    const withTimeout = (promise: Promise<unknown>) => Promise.race([promise, wait(2000)]);
    try {
      await withTimeout(this.toggleMicrophone(true));
      await wait(250);
      if (!this.microphone) await withTimeout(this.toggleMicrophone(true));
    } finally {
      this.restarting = false;
    }
  }

  public onMediaState(evt: CustomEvent<ElementMediaStateDetail>) {
    const { data } = evt.detail;
    if (!data) return;

    const state = new CallControlState(
      data.audio_enabled ?? this.microphone,
      data.video_enabled ?? this.video,
      this.sound,
      this.screenshare,
      this.spotlight
    );

    this.state = state;
    this.emitStateUpdate();

    if (this.microphone && !this.sound) {
      this.toggleSound(true);
    }

    if (this.mediaStatePromiseResolver) {
      this.mediaStatePromiseResolver();
      this.mediaStatePromiseResolver = undefined;
    }
  }

  private onControlMutation() {
    const screenshare: boolean = this.screenshareButton?.getAttribute('data-kind') === 'primary';
    const spotlight: boolean = this.spotlightButton?.checked ?? false;

    if (screenshare !== this.screenshare) {
      playCallSound(screenshare ? 'streamStarted' : 'streamEnded');
    }
    this.state = new CallControlState(
      this.microphone,
      this.video,
      this.sound,
      screenshare,
      spotlight
    );
    this.emitStateUpdate();
  }

  public toggleMicrophone(silent = false) {
    if (!silent) playCallSound(this.microphone ? 'mute' : 'unmute');
    const payload: ElementMediaStatePayload = {
      audio_enabled: !this.microphone,
      video_enabled: this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleVideo() {
    playCallSound(this.video ? 'cameraOff' : 'cameraOn');
    const payload: ElementMediaStatePayload = {
      audio_enabled: this.microphone,
      video_enabled: !this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleSound(silent = false) {
    const sound = !this.sound;
    // Callers may pass an event (e.g. as an onClick handler): only a real `true` silences.
    const quiet = silent === true;

    const state = new CallControlState(
      this.microphone,
      this.video,
      sound,
      this.screenshare,
      this.spotlight
    );
    this.state = state;
    this.setSound();
    this.emitStateUpdate();

    if (!sound) {
      // Deafen: remember mic state, then mute it too.
      if (!quiet) playCallSound('deafen');
      this.micWasOnBeforeDeafen = this.microphone;
      if (this.microphone) {
        this.toggleMicrophone(true);
      }
      return;
    }

    // Un-deafen: bring the microphone back if it was live before.
    const restoreMic = this.micWasOnBeforeDeafen && !this.microphone;
    this.micWasOnBeforeDeafen = false;
    if (!quiet) playCallSound('undeafen');
    if (restoreMic) {
      this.toggleMicrophone(true);
    }
  }

  public toggleScreenshare() {
    const button = this.screenshareButton;
    if (button && !(button as HTMLButtonElement).disabled) {
      // Keep this synchronous: the embedded call needs the original user gesture for capture.
      // Its own controls are hidden, so focus the browsing context rather than that button.
      this.iframe.focus();
      this.iframe.contentWindow?.focus();
    }
    diag(
      `toggleScreenshare: button=${button ? 'found' : 'MISSING'} kind=${
        button?.getAttribute('data-kind') ?? '-'
      } disabled=${(button as HTMLButtonElement | undefined)?.disabled ?? '-'} focus=${
        this.document?.hasFocus() ?? '?'
      }`
    );
    button?.click();
  }

  public toggleSpotlight() {
    if (this.spotlight) {
      this.gridButton?.click();
      return;
    }
    this.spotlightButton?.click();
  }

  public toggleReactions() {
    this.reactionsButton?.click();
  }

  public toggleSettings() {
    this.settingsButton?.click();
  }

  public dispose() {
    playCallSound('disconnect');
    this.bodyMutationObserver.disconnect();
    this.controlMutationObserver.disconnect();
    this.stopAudioPrefs();
    this.mediaObserver?.disconnect();
    window.clearTimeout(this.outputTimer);
  }

  private emitStateUpdate() {
    this.emit(CallControlEvent.StateUpdate);
  }
}
