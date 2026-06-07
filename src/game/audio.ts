import type { SoundtrackKey } from "./types";
import { soundtracks } from "./soundtracks";

type ToneName =
  | "jump"
  | "land"
  | "rewind"
  | "switch"
  | "core"
  | "bigCore"
  | "launch"
  | "death"
  | "playerLaserVaporized"
  | "echoLaserVaporized"
  | "portal"
  | "select";

type AudioContextConstructor = new () => AudioContext;
export type AudioMixSettings = {
  masterVolume: number;
  fxVolume: number;
  musicVolume: number;
};

const unlockEvents = ["pointerdown", "keydown", "touchstart"] as const;
const windowRecoveryEvents = ["focus", "pageshow"] as const;
const documentRecoveryEvents = ["visibilitychange"] as const;
const effectPath = (file: string): string => `/assets/audio/effects/${file}`;
const AUDIO_SETTINGS_KEY = "echo-shift-audio-settings-v1";
const DEFAULT_AUDIO_SETTINGS: AudioMixSettings = {
  masterVolume: 1,
  fxVolume: 1,
  musicVolume: 1
};
const sampledEffects = {
  jump: { src: effectPath("player_jump.mp3"), volume: 0.48 },
  core: { src: effectPath("core_pickup.mp3"), volume: 0.5 },
  bigCore: { src: effectPath("big_core_pickup.mp3"), volume: 0.56 },
  launch: { src: effectPath("spring_launch_pad.mp3"), volume: 0.58 },
  death: { src: effectPath("player_death.mp3"), volume: 0.58 },
  playerLaserVaporized: { src: effectPath("player_laser_vaporised.mp3"), volume: 0.58 },
  echoLaserVaporized: { src: effectPath("echo_laser_vaporised.mp3"), volume: 0.42 }
} as const satisfies Partial<Record<ToneName, { src: string; volume: number }>>;

const clampVolume = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

const readAudioSettings = (): AudioMixSettings => {
  if (typeof window === "undefined") return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioMixSettings>;
    return {
      masterVolume: clampVolume(parsed.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
      fxVolume: clampVolume(parsed.fxVolume, DEFAULT_AUDIO_SETTINGS.fxVolume),
      musicVolume: clampVolume(parsed.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume)
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
};

const writeAudioSettings = (settings: AudioMixSettings): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
};

export class SynthAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicKey: SoundtrackKey | null = null;
  private musicCache = new Map<SoundtrackKey, HTMLAudioElement>();
  private activeEffects = new Map<HTMLAudioElement, number>();
  private fadingMusic = new Set<HTMLAudioElement>();
  private musicPlayAttempt = 0;
  private fadeToken = 0;
  private musicMuted = false;
  private musicPaused = false;
  private unlockListenersInstalled = false;
  private recoveryListenersInstalled = false;
  private settingsState = readAudioSettings();
  private readonly synthBaseVolume = 0.18;
  private readonly musicBaseVolume = 0.28;
  private readonly maxCachedMusicElements = 3;

  getSettings(): AudioMixSettings {
    return { ...this.settingsState };
  }

  setSettings(settings: Partial<AudioMixSettings>): void {
    this.settingsState = {
      masterVolume: clampVolume(settings.masterVolume, this.settingsState.masterVolume),
      fxVolume: clampVolume(settings.fxVolume, this.settingsState.fxVolume),
      musicVolume: clampVolume(settings.musicVolume, this.settingsState.musicVolume)
    };
    writeAudioSettings(this.settingsState);
    this.applySynthVolume();
    if (this.music) this.applyMusicVolume(this.music);
    for (const [element, baseVolume] of this.activeEffects) element.volume = baseVolume * this.fxOutputMultiplier();
  }

  unlock(): void {
    this.resume();
    if (this.musicKey) this.prepareMusicElement(this.musicElementFor(this.musicKey));
  }

  resume(): void {
    this.installUnlockListeners();
    this.installRecoveryListeners();
    const context = this.ensureContext();
    if (context) {
      void context
        .resume()
        .then(() => this.markContextState(context.state))
        .catch(() => this.markAudioState("blocked"));
    }
    if (!this.musicPaused) this.retryMusic();
  }

  play(name: ToneName): void {
    this.resume();
    if (this.playSample(name)) return;
    this.playToneWhenReady(name);
  }

  private playTone(name: ToneName): void {
    if (!this.context || !this.master || this.context.state !== "running") return;
    const context = this.context;
    const now = context.currentTime;
    const gain = context.createGain();
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    const settings = this.settings(name);

    osc.type = settings.type;
    osc.frequency.setValueAtTime(settings.start, now);
    osc.frequency.exponentialRampToValueAtTime(settings.end, now + settings.duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(settings.filter, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(settings.volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    this.disconnectWhenEnded(osc, osc, filter, gain);
    osc.start(now);
    osc.stop(now + settings.duration + 0.02);

    if (name === "rewind" || name === "core" || name === "portal") {
      const shimmer = context.createOscillator();
      const shimmerGain = context.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(settings.end * 1.5, now);
      shimmer.frequency.exponentialRampToValueAtTime(settings.start * 1.2, now + settings.duration * 0.85);
      shimmerGain.gain.setValueAtTime(0.0001, now);
      shimmerGain.gain.exponentialRampToValueAtTime(settings.volume * 0.42, now + 0.02);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration * 1.35);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(this.master);
      this.disconnectWhenEnded(shimmer, shimmer, shimmerGain);
      shimmer.start(now + 0.01);
      shimmer.stop(now + settings.duration * 1.35 + 0.02);
    }
  }

  startMusic(): void {
    this.playMusic("menu");
  }

  preloadSoundtracks(): void {
    for (const key of Object.keys(soundtracks) as SoundtrackKey[]) {
      this.prepareMusicElement(this.musicElementFor(key));
    }
  }

  playMusic(key: SoundtrackKey, options: { restart?: boolean; fadeMs?: number } = {}): void {
    this.installUnlockListeners();
    this.installRecoveryListeners();
    this.musicPaused = false;
    if (this.context) {
      void this.context
        .resume()
        .then(() => this.markContextState(this.context?.state || "running"))
        .catch(() => this.markAudioState("blocked"));
    }
    this.markMusicKey(key);
    if (this.music && this.musicKey === key && !options.restart) {
      this.applyMusicVolume(this.music);
      this.retryMusic();
      return;
    }

    const next = this.musicElementFor(key);
    this.stopStaleFadingMusic(next);
    this.fadingMusic.delete(next);
    const previous = this.music && this.music !== next ? this.music : null;
    this.prepareMusicElement(next);
    if (options.restart) {
      next.pause();
      next.currentTime = 0;
    }
    next.volume = this.musicMuted ? 0 : 0;
    this.music = next;
    this.musicKey = key;

    const token = ++this.fadeToken;
    this.playMusicElement(next);

    this.fadeMusic(previous, next, token, options.fadeMs);
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    if (this.music) this.applyMusicVolume(this.music);
  }

  pauseMusic(): void {
    if (!this.music) return;
    this.musicPaused = true;
    this.musicPlayAttempt += 1;
    this.music.pause();
    this.markAudioState("paused");
  }

  resumeMusic(): void {
    if (!this.musicPaused) return;
    this.musicPaused = false;
    this.resume();
  }

  stopMusic(): void {
    this.fadeToken += 1;
    this.musicPlayAttempt += 1;
    this.musicPaused = false;
    const currentKey = this.musicKey;
    if (this.music) this.unloadMusicElement(this.music);
    if (currentKey) this.musicCache.delete(currentKey);
    this.music = null;
    this.musicKey = null;
    this.releaseUnusedMusic();
    if (import.meta.env.DEV && typeof document !== "undefined") delete document.documentElement.dataset.echoShiftMusicKey;
    this.markAudioState("stopped");
  }

  dispose(): void {
    this.fadeToken += 1;
    this.musicPlayAttempt += 1;
    this.musicPaused = false;
    this.music = null;
    this.musicKey = null;
    for (const element of this.activeEffects.keys()) {
      this.unloadMusicElement(element);
    }
    this.activeEffects.clear();
    for (const element of this.musicCache.values()) {
      this.unloadMusicElement(element);
    }
    this.musicCache.clear();
    if (this.unlockListenersInstalled && typeof window !== "undefined") {
      const options = { capture: true };
      for (const eventName of unlockEvents) {
        window.removeEventListener(eventName, this.handleUnlockGesture, options);
      }
    }
    if (this.recoveryListenersInstalled) {
      const options = { capture: true };
      if (typeof window !== "undefined") {
        for (const eventName of windowRecoveryEvents) {
          window.removeEventListener(eventName, this.handleRecoveryEvent, options);
        }
      }
      if (typeof document !== "undefined") {
        for (const eventName of documentRecoveryEvents) {
          document.removeEventListener(eventName, this.handleRecoveryEvent, options);
        }
      }
    }
    this.unlockListenersInstalled = false;
    this.recoveryListenersInstalled = false;
    this.master?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.master = null;
    this.context = null;
    this.markAudioState("stopped");
  }

  private handleUnlockGesture = (): void => {
    this.resume();
  };

  private handleRecoveryEvent = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.resume();
  };

  private installUnlockListeners(): void {
    if (this.unlockListenersInstalled || typeof window === "undefined") return;
    this.unlockListenersInstalled = true;
    const options = { capture: true, passive: true };
    for (const eventName of unlockEvents) {
      window.addEventListener(eventName, this.handleUnlockGesture, options);
    }
  }

  private installRecoveryListeners(): void {
    if (this.recoveryListenersInstalled) return;
    this.recoveryListenersInstalled = true;
    const options = { capture: true, passive: true };
    if (typeof window !== "undefined") {
      for (const eventName of windowRecoveryEvents) {
        window.addEventListener(eventName, this.handleRecoveryEvent, options);
      }
    }
    if (typeof document !== "undefined") {
      for (const eventName of documentRecoveryEvents) {
        document.addEventListener(eventName, this.handleRecoveryEvent, options);
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const AudioContextClass =
      window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const context = new AudioContextClass();
    this.context = context;
    this.master = context.createGain();
    this.applySynthVolume();
    this.master.connect(context.destination);
    this.markAudioState(context.state);
    return context;
  }

  private retryMusic(): void {
    if (!this.music || this.musicPaused) return;
    this.prepareMusicElement(this.music);
    this.playMusicElement(this.music);
  }

  private playSample(name: ToneName): boolean {
    const settings = sampledEffects[name as keyof typeof sampledEffects];
    if (!settings || typeof Audio === "undefined") return false;

    const element = new Audio(settings.src);
    element.preload = "auto";
    element.volume = settings.volume * this.fxOutputMultiplier();
    this.activeEffects.set(element, settings.volume);
    let released = false;
    let fallbackPlayed = false;
    const release = () => {
      if (released) return;
      released = true;
      element.pause();
      this.activeEffects.delete(element);
    };
    const fallback = () => {
      if (fallbackPlayed || !this.activeEffects.has(element)) return;
      fallbackPlayed = true;
      release();
      this.playToneWhenReady(name);
    };
    if (typeof element.addEventListener === "function") {
      element.addEventListener("ended", release, { once: true });
      element.addEventListener("error", fallback, { once: true });
    }

    try {
      void element
        .play()
        .then(() => {
          if (typeof element.addEventListener !== "function") this.activeEffects.delete(element);
        })
        .catch(fallback);
    } catch {
      fallback();
    }
    return true;
  }

  private playToneWhenReady(name: ToneName): void {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    if (context.state === "running") {
      this.playTone(name);
      return;
    }
    void context
      .resume()
      .then(() => {
        this.markContextState(context.state);
        if (this.context === context && context.state === "running") this.playTone(name);
      })
      .catch(() => this.markAudioState("blocked"));
  }

  private playMusicElement(element: HTMLAudioElement): void {
    const attempt = ++this.musicPlayAttempt;
    void element
      .play()
      .then(() => {
        if (this.music === element && attempt === this.musicPlayAttempt) this.markAudioState("playing");
      })
      .catch(() => {
        if (this.music === element && attempt === this.musicPlayAttempt) {
          this.applyMusicVolume(element);
          this.markAudioState("blocked");
        }
      });
  }

  private musicElementFor(key: SoundtrackKey): HTMLAudioElement {
    const cached = this.musicCache.get(key);
    if (cached) return cached;

    const element = new Audio(soundtracks[key].src);
    element.loop = true;
    element.preload = "metadata";
    this.musicCache.set(key, element);
    return element;
  }

  private prepareMusicElement(element: HTMLAudioElement): void {
    element.preload = "auto";
    const haveNothing = typeof HTMLMediaElement === "undefined" ? 0 : HTMLMediaElement.HAVE_NOTHING;
    if ((element.readyState || 0) === haveNothing) element.load();
  }

  private markMusicKey(key: SoundtrackKey): void {
    if (import.meta.env.DEV && typeof document !== "undefined") document.documentElement.dataset.echoShiftMusicKey = key;
  }

  private markContextState(state: string): void {
    this.markAudioState(this.musicPaused && state === "running" ? "paused" : state);
  }

  private markAudioState(state: string): void {
    if (import.meta.env.DEV && typeof document !== "undefined") {
      const dataset = document.documentElement.dataset;
      if (state === "running" && dataset.echoShiftAudioState === "playing") return;
      dataset.echoShiftAudioState = state;
    }
  }

  private applyMusicVolume(element: HTMLAudioElement): void {
    element.volume = this.musicMuted ? 0 : this.musicOutputVolume();
  }

  private fadeMusic(previous: HTMLAudioElement | null, next: HTMLAudioElement, token: number, fadeMs?: number): void {
    const started = performance.now();
    const duration = Math.max(180, Math.min(1600, fadeMs ?? 760));
    const previousStart = previous?.volume || 0;
    if (previous) this.fadingMusic.add(previous);

    const step = (now: number) => {
      if (token !== this.fadeToken) {
        if (previous) this.stopMusicElement(previous);
        return;
      }
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      next.volume = this.musicMuted ? 0 : this.musicOutputVolume() * eased;
      if (previous) previous.volume = this.musicMuted ? 0 : previousStart * (1 - eased);

      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      this.applyMusicVolume(next);
      if (previous) {
        this.stopMusicElement(previous);
      }
      this.releaseUnusedMusic();
    };

    requestAnimationFrame(step);
  }

  private stopMusicElement(element: HTMLAudioElement): void {
    this.fadingMusic.delete(element);
    if (element === this.music) return;
    element.pause();
    element.currentTime = 0;
    element.volume = 0;
  }

  private stopStaleFadingMusic(except: HTMLAudioElement): void {
    for (const element of [...this.fadingMusic]) {
      if (element !== except) this.stopMusicElement(element);
    }
  }

  private disconnectWhenEnded(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
    source.onended = () => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // A node can already be disconnected if a browser ends/cancels it during teardown.
        }
      }
    };
  }

  private releaseUnusedMusic(): void {
    if (this.musicCache.size <= this.maxCachedMusicElements) return;
    const keep = this.musicKey;
    for (const [key, element] of this.musicCache) {
      if (this.musicCache.size <= this.maxCachedMusicElements) return;
      if (key === keep) continue;
      this.unloadMusicElement(element);
      this.musicCache.delete(key);
    }
  }

  private unloadMusicElement(element: HTMLAudioElement): void {
    element.pause();
    element.removeAttribute("src");
    element.load();
  }

  private applySynthVolume(): void {
    if (!this.master) return;
    this.master.gain.value = this.synthBaseVolume * this.fxOutputMultiplier();
  }

  private fxOutputMultiplier(): number {
    return this.settingsState.masterVolume * this.settingsState.fxVolume;
  }

  private musicOutputVolume(): number {
    return this.musicBaseVolume * this.settingsState.masterVolume * this.settingsState.musicVolume;
  }

  private settings(name: ToneName) {
    switch (name) {
      case "jump":
        return { start: 260, end: 520, duration: 0.11, volume: 0.24, filter: 2200, type: "square" as OscillatorType };
      case "land":
        return { start: 140, end: 90, duration: 0.09, volume: 0.12, filter: 900, type: "triangle" as OscillatorType };
      case "rewind":
        return { start: 720, end: 80, duration: 0.36, volume: 0.26, filter: 2600, type: "sawtooth" as OscillatorType };
      case "switch":
        return { start: 380, end: 520, duration: 0.08, volume: 0.18, filter: 1800, type: "square" as OscillatorType };
      case "core":
        return { start: 520, end: 1100, duration: 0.2, volume: 0.22, filter: 3200, type: "triangle" as OscillatorType };
      case "bigCore":
        return { start: 420, end: 1250, duration: 0.26, volume: 0.25, filter: 3400, type: "triangle" as OscillatorType };
      case "launch":
        return { start: 190, end: 720, duration: 0.16, volume: 0.26, filter: 2600, type: "square" as OscillatorType };
      case "death":
        return { start: 220, end: 35, duration: 0.42, volume: 0.24, filter: 800, type: "sawtooth" as OscillatorType };
      case "playerLaserVaporized":
        return { start: 980, end: 120, duration: 0.28, volume: 0.26, filter: 3000, type: "sawtooth" as OscillatorType };
      case "echoLaserVaporized":
        return { start: 760, end: 160, duration: 0.2, volume: 0.18, filter: 2600, type: "triangle" as OscillatorType };
      case "portal":
        return { start: 300, end: 900, duration: 0.28, volume: 0.28, filter: 3600, type: "sine" as OscillatorType };
      case "select":
        return { start: 420, end: 640, duration: 0.07, volume: 0.16, filter: 2400, type: "triangle" as OscillatorType };
    }
  }
}

export const audio = new SynthAudio();
