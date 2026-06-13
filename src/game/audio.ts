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
  | "select"
  | "stormFloorBeam"
  | "cryoBeamFire"
  | "cryoFloorIceForm"
  | "archiveBookImpact"
  | "bossCoreHit"
  | "bossDefeatDeparture";

type AudioContextConstructor = new () => AudioContext;
type MusicLoopRegion = {
  start: number;
  end: number;
};
type WebMusicPlayback = {
  key: SoundtrackKey;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  loop: MusicLoopRegion;
  offset: number;
  startedAt: number;
};
type LoopedEffectPlayback = {
  id: string;
  name: ToneName;
  element: HTMLAudioElement;
  baseVolume: number;
  volumeScale: number;
  paused: boolean;
  blocked: boolean;
  started: boolean;
  sampleFailed: boolean;
  playAttempt: number;
  lastMarkedVolumeScale: number;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
  fallbackToken: number;
  fallbackSources: Set<AudioScheduledSourceNode>;
  fallbackNodes: Set<AudioNode>;
};
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
const MUSIC_LOOP_LOOKAHEAD_SECONDS = 0.012;
const MUSIC_LOOP_MIN_SECONDS = 1;
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
  echoLaserVaporized: { src: effectPath("echo_laser_vaporised.mp3"), volume: 0.42 },
  rewind: { src: effectPath("rewind.mp3"), volume: 0.36 },
  switch: { src: effectPath("switch.mp3"), volume: 0.82 },
  portal: { src: effectPath("portal.mp3"), volume: 0.68 },
  stormFloorBeam: { src: effectPath("storm_floor_beam.mp3"), volume: 0.26 },
  cryoBeamFire: { src: effectPath("cryo_beam_fire.mp3"), volume: 0.26 },
  cryoFloorIceForm: { src: effectPath("cryo_floor_ice_form.mp3"), volume: 0.32 },
  archiveBookImpact: { src: effectPath("archive_book_impact.mp3"), volume: 0.34 },
  bossCoreHit: { src: effectPath("boss_core_hit.mp3"), volume: 0.34 },
  bossDefeatDeparture: { src: effectPath("boss_defeat_departure.mp3"), volume: 0.24 }
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

const musicLoopRegionFor = (key: SoundtrackKey): MusicLoopRegion | null => {
  const soundtrack = soundtracks[key];
  const start = soundtrack.loopStartSeconds;
  const end = soundtrack.loopEndSeconds;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (typeof start !== "number" || typeof end !== "number") return null;
  if (start < 0 || end <= start + MUSIC_LOOP_MIN_SECONDS || end > soundtrack.durationSeconds + 0.5) return null;
  return { start, end };
};

export class SynthAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private webMusic: WebMusicPlayback | null = null;
  private musicKey: SoundtrackKey | null = null;
  private mediaMusicKey: SoundtrackKey | null = null;
  private musicPlaybackKey: SoundtrackKey | null = null;
  private musicCache = new Map<SoundtrackKey, HTMLAudioElement>();
  private mediaMusicReadyKeys = new Set<SoundtrackKey>();
  private mediaMusicReadyPromises = new Map<SoundtrackKey, Promise<boolean>>();
  private webMusicBufferCache = new Map<SoundtrackKey, Promise<AudioBuffer>>();
  private webMusicReadyKeys = new Set<SoundtrackKey>();
  private activeEffects = new Map<HTMLAudioElement, number>();
  private loopedEffects = new Map<string, LoopedEffectPlayback>();
  private fadingMusic = new Set<HTMLAudioElement>();
  private fadingWebMusic = new Set<WebMusicPlayback>();
  private recentEffectEvents: string[] = [];
  private effectLoopPlayAttempt = 0;
  private musicPlayAttempt = 0;
  private webMusicPlayAttempt = 0;
  private fadeToken = 0;
  private musicLoopWatchFrame: number | null = null;
  private musicLoopWatchToken = 0;
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
    if (this.webMusic) this.applyWebMusicVolume(this.webMusic);
    for (const playback of this.fadingWebMusic) this.applyWebMusicVolume(playback);
    for (const [element, baseVolume] of this.activeEffects) element.volume = baseVolume * this.fxOutputMultiplier();
    for (const playback of this.loopedEffects.values()) this.applyLoopedEffectVolume(playback);
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
    this.retryEffectLoops();
  }

  play(name: ToneName): void {
    this.resume();
    if (this.playSample(name)) return;
    this.playToneWhenReady(name);
  }

  startEffectLoop(name: ToneName, id: string = name, volumeScale = 1): void {
    this.resume();
    const settings = sampledEffects[name as keyof typeof sampledEffects];
    if (!settings || typeof Audio === "undefined") return;
    const safeVolumeScale = clampVolume(volumeScale, 1);
    const existing = this.loopedEffects.get(id);
    if (existing) {
      existing.name = name;
      existing.baseVolume = settings.volume;
      existing.volumeScale = safeVolumeScale;
      existing.paused = false;
      existing.sampleFailed = false;
      existing.blocked = false;
      existing.started = false;
      existing.element.loop = true;
      this.stopLoopedEffectFallback(existing);
      this.applyLoopedEffectVolume(existing);
      this.playLoopedEffect(existing);
      return;
    }

    const element = new Audio(settings.src);
    element.preload = "auto";
    element.loop = true;
    const playback: LoopedEffectPlayback = {
      id,
      name,
      element,
      baseVolume: settings.volume,
      volumeScale: safeVolumeScale,
      paused: false,
      blocked: false,
      started: false,
      sampleFailed: false,
      playAttempt: 0,
      lastMarkedVolumeScale: -1,
      fallbackTimer: null,
      fallbackToken: 0,
      fallbackSources: new Set(),
      fallbackNodes: new Set()
    };
    this.loopedEffects.set(id, playback);
    this.applyLoopedEffectVolume(playback);
    if (typeof element.addEventListener === "function") {
      element.addEventListener("error", () => this.failLoopedEffectSample(playback), { once: true });
    }
    this.playLoopedEffect(playback);
  }

  setEffectLoopVolume(id: string, volumeScale: number): void {
    const playback = this.loopedEffects.get(id);
    if (!playback) return;
    playback.volumeScale = clampVolume(volumeScale, playback.volumeScale);
    this.applyLoopedEffectVolume(playback);
    if (
      playback.volumeScale !== playback.lastMarkedVolumeScale &&
      (Math.abs(playback.volumeScale - playback.lastMarkedVolumeScale) >= 0.08 || playback.volumeScale === 0 || playback.volumeScale === 1)
    ) {
      playback.lastMarkedVolumeScale = playback.volumeScale;
      this.markEffectEvent(`loop-volume:${id}:${playback.volumeScale.toFixed(2)}`);
    }
  }

  stopEffectLoop(id: string): void {
    const playback = this.loopedEffects.get(id);
    if (!playback) return;
    playback.playAttempt = ++this.effectLoopPlayAttempt;
    this.loopedEffects.delete(id);
    this.stopLoopedEffectFallback(playback);
    playback.element.pause();
    playback.element.currentTime = 0;
    playback.element.volume = 0;
    this.markEffectEvent(`loop-stop:${id}`);
  }

  pauseEffectLoops(): void {
    for (const playback of this.loopedEffects.values()) {
      if (playback.paused) continue;
      playback.paused = true;
      playback.playAttempt = ++this.effectLoopPlayAttempt;
      playback.element.pause();
      this.stopLoopedEffectFallback(playback);
      this.markEffectEvent(`loop-pause:${playback.id}`);
    }
  }

  resumeEffectLoops(): void {
    for (const playback of this.loopedEffects.values()) {
      if (!playback.paused) continue;
      playback.paused = false;
      if (playback.sampleFailed) this.startLoopedEffectFallback(playback);
      else this.playLoopedEffect(playback);
      this.markEffectEvent(`loop-resume:${playback.id}`);
    }
  }

  private playTone(name: ToneName, volumeScale = 1): void {
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
    const outputVolume = settings.volume * clampVolume(volumeScale, 1);
    gain.gain.exponentialRampToValueAtTime(outputVolume, now + 0.015);
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
      shimmerGain.gain.exponentialRampToValueAtTime(outputVolume * 0.42, now + 0.02);
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
      void this.preloadMusic(key);
    }
  }

  preloadMusic(key: SoundtrackKey): Promise<boolean> {
    const loop = musicLoopRegionFor(key);
    if (loop && this.canUseWebMusic()) {
      return this.webMusicBufferFor(key)
        .then(() => true)
        .catch(() => {
          return this.preloadMediaMusic(key);
        });
    }

    return this.preloadMediaMusic(key);
  }

  isMusicReady(key: SoundtrackKey): boolean {
    const loop = musicLoopRegionFor(key);
    if (!loop || !this.canUseWebMusic()) return this.mediaMusicReadyKeys.has(key);
    return this.webMusicReadyKeys.has(key) || this.mediaMusicReadyKeys.has(key);
  }

  isMusicPlaying(key: SoundtrackKey): boolean {
    if (this.musicPlaybackKey !== key) return false;
    const playing = this.musicTransportIsPlaying(key);
    if (!playing) this.syncMusicPlayback(this.mediaMusicKey === key ? "stopped" : undefined);
    return playing;
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
    if (this.musicPlaybackKey !== key || options.restart) this.clearMusicPlayback();
    const loop = musicLoopRegionFor(key);
    if (loop && this.canUseWebMusic()) {
      if (!this.webMusicReadyKeys.has(key) && this.mediaMusicReadyKeys.has(key)) {
        this.playMediaMusic(key, options);
        return;
      }
      this.playWebMusic(key, loop, options);
      return;
    }
    this.playMediaMusic(key, options);
  }

  private playMediaMusic(key: SoundtrackKey, options: { restart?: boolean; fadeMs?: number } = {}): void {
    if (this.music && this.musicKey === key && this.mediaMusicKey === key && !options.restart) {
      this.applyMusicVolume(this.music);
      this.retryMusic();
      this.startMusicLoopWatch();
      return;
    }

    const next = this.musicElementFor(key);
    const restartingSameElement = this.music === next && options.restart;
    const previousWeb = this.webMusic;
    this.webMusic = null;
    this.stopStaleFadingMusic(next);
    this.stopStaleFadingWebMusic(previousWeb || undefined);
    this.fadingMusic.delete(next);
    const previous = this.music && this.music !== next ? this.music : null;
    this.prepareMusicElement(next);
    if (options.restart) {
      next.pause();
      next.currentTime = 0;
    }
    next.volume = restartingSameElement ? (this.musicMuted ? 0 : this.musicOutputVolume()) : this.musicMuted ? 0 : 0;
    this.music = next;
    this.musicKey = key;
    this.mediaMusicKey = key;

    const token = ++this.fadeToken;
    if (this.musicPaused) {
      this.stopMusicLoopWatch();
      next.pause();
      if (previous) this.stopMusicElement(previous);
      if (previousWeb) this.stopWebMusic(previousWeb);
      return;
    }

    this.playMusicElement(next);
    this.startMusicLoopWatch();
    if (restartingSameElement) {
      this.applyMusicVolume(next);
      return;
    }

    this.fadeMusic(previous, next, token, options.fadeMs);
    if (previousWeb) this.fadeWebMusic(previousWeb, null, token, options.fadeMs);
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    if (this.music) this.applyMusicVolume(this.music);
    if (this.webMusic) this.applyWebMusicVolume(this.webMusic);
  }

  pauseMusic(): void {
    if (!this.music && !this.webMusic && !this.musicKey) return;
    this.musicPaused = true;
    this.musicPlayAttempt += 1;
    this.stopMusicLoopWatch();
    if (this.music) this.music.pause();
    if (this.webMusic) this.pauseWebMusic(this.webMusic);
    this.stopAllFadingMusic();
    this.stopAllFadingWebMusic();
    this.clearMusicPlayback();
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
    this.webMusicPlayAttempt += 1;
    this.musicPaused = false;
    this.stopMusicLoopWatch();
    const currentMediaKey = this.mediaMusicKey;
    if (this.music) this.unloadMusicElement(this.music);
    if (currentMediaKey) {
      this.musicCache.delete(currentMediaKey);
      this.mediaMusicReadyKeys.delete(currentMediaKey);
      this.mediaMusicReadyPromises.delete(currentMediaKey);
    }
    this.music = null;
    this.mediaMusicKey = null;
    if (this.webMusic) this.stopWebMusic(this.webMusic);
    this.webMusic = null;
    this.stopAllFadingMusic();
    this.stopAllFadingWebMusic();
    this.musicKey = null;
    this.clearMusicPlayback();
    this.releaseUnusedMusic();
    if (import.meta.env.DEV && typeof document !== "undefined") {
      delete document.documentElement.dataset.echoShiftMusicKey;
    }
    this.markAudioState("stopped");
  }

  dispose(): void {
    this.fadeToken += 1;
    this.musicPlayAttempt += 1;
    this.webMusicPlayAttempt += 1;
    this.effectLoopPlayAttempt += 1;
    this.musicPaused = false;
    this.stopMusicLoopWatch();
    this.music = null;
    this.musicKey = null;
    this.mediaMusicKey = null;
    this.clearMusicPlayback();
    if (this.webMusic) this.stopWebMusic(this.webMusic);
    this.webMusic = null;
    for (const playback of this.fadingWebMusic) this.stopWebMusic(playback);
    this.fadingWebMusic.clear();
    for (const element of this.activeEffects.keys()) {
      this.unloadMusicElement(element);
    }
    this.activeEffects.clear();
    for (const playback of this.loopedEffects.values()) {
      this.stopLoopedEffectFallback(playback);
      this.unloadMusicElement(playback.element);
    }
    this.loopedEffects.clear();
    this.recentEffectEvents = [];
    if (import.meta.env.DEV && typeof document !== "undefined") {
      delete document.documentElement.dataset.echoShiftAudioEffects;
      delete document.documentElement.dataset.echoShiftMusicKey;
    }
    for (const element of this.musicCache.values()) {
      this.unloadMusicElement(element);
    }
    this.musicCache.clear();
    this.mediaMusicReadyKeys.clear();
    this.mediaMusicReadyPromises.clear();
    this.webMusicBufferCache.clear();
    this.webMusicReadyKeys.clear();
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
    context.onstatechange = () => {
      if (this.context !== context) return;
      this.markContextState(context.state);
    };
    this.master = context.createGain();
    this.applySynthVolume();
    this.master.connect(context.destination);
    this.markAudioState(context.state);
    return context;
  }

  private retryMusic(): void {
    if (this.webMusic) {
      if (this.webMusic.key !== this.musicKey) return;
      this.retryWebMusic(this.webMusic);
      return;
    }
    if (!this.music || this.mediaMusicKey !== this.musicKey || this.musicPaused) return;
    this.prepareMusicElement(this.music);
    this.playMusicElement(this.music);
    this.startMusicLoopWatch();
  }

  private preloadMediaMusic(key: SoundtrackKey): Promise<boolean> {
    const element = this.musicElementFor(key);
    if (this.mediaMusicIsReady(element)) {
      this.mediaMusicReadyKeys.add(key);
      return Promise.resolve(true);
    }

    const cached = this.mediaMusicReadyPromises.get(key);
    if (cached) return cached;

    const promise = new Promise<boolean>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null && typeof window !== "undefined") window.clearTimeout(timeoutId);
        if (typeof element.removeEventListener === "function") {
          element.removeEventListener("canplay", handleReady);
          element.removeEventListener("loadeddata", handleReady);
          element.removeEventListener("error", handleError);
        }
        this.mediaMusicReadyPromises.delete(key);
        if (ready) this.mediaMusicReadyKeys.add(key);
        else this.mediaMusicReadyKeys.delete(key);
        resolve(ready);
      };
      const handleReady = () => finish(true);
      const handleError = () => finish(false);

      if (typeof element.addEventListener === "function") {
        element.addEventListener("canplay", handleReady, { once: true });
        element.addEventListener("loadeddata", handleReady, { once: true });
        element.addEventListener("error", handleError, { once: true });
      }
      this.prepareMusicElement(element);
      if (this.mediaMusicIsReady(element)) {
        finish(true);
        return;
      }
      if (typeof element.addEventListener !== "function") {
        finish(true);
        return;
      }
      if (typeof window !== "undefined") timeoutId = window.setTimeout(() => finish(this.mediaMusicIsReady(element)), 4000);
    });

    this.mediaMusicReadyPromises.set(key, promise);
    return promise;
  }

  private mediaMusicIsReady(element: HTMLAudioElement): boolean {
    if (typeof element.readyState !== "number") return true;
    const haveCurrentData = typeof HTMLMediaElement === "undefined" ? 2 : HTMLMediaElement.HAVE_CURRENT_DATA;
    return element.readyState >= haveCurrentData;
  }

  private canUseWebMusic(): boolean {
    if (typeof fetch !== "function") return false;
    const context = this.ensureContext();
    return Boolean(context && typeof context.decodeAudioData === "function" && typeof context.createBufferSource === "function");
  }

  private webMusicBufferFor(key: SoundtrackKey): Promise<AudioBuffer> {
    const cached = this.webMusicBufferCache.get(key);
    if (cached) return cached;

    const promise = fetch(soundtracks[key].src)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load soundtrack ${key}`);
        return response.arrayBuffer();
      })
      .then((data) => {
        const context = this.ensureContext();
        if (!context) throw new Error("AudioContext unavailable");
        return context.decodeAudioData(data);
      })
      .then((buffer) => {
        this.webMusicReadyKeys.add(key);
        return buffer;
      })
      .catch((error) => {
        this.webMusicBufferCache.delete(key);
        this.webMusicReadyKeys.delete(key);
        throw error;
      });
    this.webMusicBufferCache.set(key, promise);
    return promise;
  }

  private playWebMusic(key: SoundtrackKey, loop: MusicLoopRegion, options: { restart?: boolean; fadeMs?: number } = {}): void {
    const current = this.webMusic;
    if (current && current.key === key && !options.restart) {
      this.musicKey = key;
      this.applyWebMusicVolume(current);
      this.retryWebMusic(current);
      return;
    }
    const restartSameTrack = Boolean(current && current.key === key && options.restart);
    const sameMediaTrack = Boolean(this.music && this.mediaMusicKey === key);

    const attempt = ++this.webMusicPlayAttempt;
    this.musicPaused = false;
    this.musicKey = key;
    if (sameMediaTrack && options.restart && this.music) {
      this.music.pause();
      this.music.currentTime = 0;
      this.applyMusicVolume(this.music);
      this.playMusicElement(this.music);
      this.startMusicLoopWatch();
    }
    if (!restartSameTrack && ((this.music && !sameMediaTrack) || (this.webMusic && this.webMusic.key !== key))) {
      const token = ++this.fadeToken;
      this.fadeOutCurrentMusic(token, Math.min(options.fadeMs ?? 260, 420));
    }
    void this.webMusicBufferFor(key)
      .then((buffer) => {
        if (attempt !== this.webMusicPlayAttempt || this.musicKey !== key) return;
        const context = this.ensureContext();
        if (!context) {
          this.playMediaMusic(key, options);
          return;
        }

        const previousMedia = this.music;
        let previousWeb = this.webMusic;
        this.music = null;
        this.mediaMusicKey = null;
        this.stopStaleFadingMusic(null);
        if (restartSameTrack && previousWeb) {
          this.fadingWebMusic.delete(previousWeb);
          this.stopWebMusic(previousWeb);
          previousWeb = null;
        }
        this.stopStaleFadingWebMusic(previousWeb || undefined);

        const gain = context.createGain();
        gain.gain.value = this.musicMuted ? 0 : 0;
        gain.connect(context.destination);
        const playback: WebMusicPlayback = {
          key,
          buffer,
          source: null,
          gain,
          loop,
          offset: 0,
          startedAt: context.currentTime
        };
        this.webMusic = playback;
        if (!this.musicPaused) this.startWebMusicSource(playback, 0);
        const token = ++this.fadeToken;
        if (this.musicPaused) {
          if (previousWeb) this.stopWebMusic(previousWeb);
          if (previousMedia) this.stopMusicElement(previousMedia);
        } else {
          this.fadeWebMusic(previousWeb, playback, token, options.fadeMs);
          this.fadeMusic(previousMedia, null, token, options.fadeMs);
          this.resumeContextForWebMusic(playback, attempt);
        }
      })
      .catch(() => {
        if (attempt !== this.webMusicPlayAttempt || this.musicKey !== key) return;
        this.playMediaMusic(key, options);
      });
  }

  private fadeOutCurrentMusic(token: number, fadeMs?: number): void {
    const previousMedia = this.music;
    const previousWeb = this.webMusic;
    this.music = null;
    this.mediaMusicKey = null;
    this.webMusic = null;
    this.stopMusicLoopWatch();
    if (previousMedia) this.fadeMusic(previousMedia, null, token, fadeMs);
    if (previousWeb) this.fadeWebMusic(previousWeb, null, token, fadeMs);
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
      this.markEffectEvent(`fallback:${name}`);
      this.playToneWhenReady(name);
    };
	    if (typeof element.addEventListener === "function") {
	      element.addEventListener("ended", release, { once: true });
	      element.addEventListener("error", fallback, { once: true });
	    }
    if (name === "archiveBookImpact") this.markEffectEvent("request:archiveBookImpact");

	    try {
      void element
        .play()
        .then(() => {
          this.markEffectEvent(`play:${name}`);
          if (typeof element.addEventListener !== "function") this.activeEffects.delete(element);
        })
        .catch(fallback);
    } catch {
      fallback();
    }
    return true;
  }

  private playLoopedEffect(playback: LoopedEffectPlayback): void {
    if (playback.sampleFailed) {
      this.startLoopedEffectFallback(playback);
      return;
    }
    const attempt = ++this.effectLoopPlayAttempt;
    playback.playAttempt = attempt;
    playback.blocked = false;
    try {
      void playback.element
        .play()
        .then(() => {
          const currentPlayback = this.loopedEffects.get(playback.id);
          if (currentPlayback === playback && playback.playAttempt === attempt && !playback.paused && this.mediaElementIsPlaying(playback.element)) {
            playback.blocked = false;
            playback.started = true;
            this.markEffectEvent(`loop-start:${playback.id}:${playback.name}`);
          } else {
            playback.started = false;
            if (currentPlayback !== playback || playback.paused) {
              playback.element.pause();
              playback.element.currentTime = 0;
            }
          }
        })
        .catch((error) => {
          if (this.loopedEffects.get(playback.id) === playback && playback.playAttempt === attempt) {
            if (!this.mediaPlayRejectionIsRecoverableBlock(error)) {
              this.failLoopedEffectSample(playback);
              return;
            }
            playback.blocked = true;
            playback.started = false;
            this.markEffectEvent(`loop-blocked:${playback.id}:${playback.name}`);
          }
        });
    } catch (error) {
      if (!this.mediaPlayRejectionIsRecoverableBlock(error)) {
        this.failLoopedEffectSample(playback);
      } else {
        playback.blocked = true;
        playback.started = false;
        this.markEffectEvent(`loop-blocked:${playback.id}:${playback.name}`);
      }
    }
  }

  private applyLoopedEffectVolume(playback: LoopedEffectPlayback): void {
    playback.element.volume = playback.baseVolume * playback.volumeScale * this.fxOutputMultiplier();
  }

  private retryEffectLoops(): void {
    for (const playback of this.loopedEffects.values()) {
      if (playback.paused) continue;
      if (playback.sampleFailed) {
        this.startLoopedEffectFallback(playback);
      } else if (playback.blocked || !playback.started || !this.mediaElementIsPlaying(playback.element)) {
        playback.started = false;
        this.playLoopedEffect(playback);
      }
    }
  }

  private failLoopedEffectSample(playback: LoopedEffectPlayback): void {
    if (this.loopedEffects.get(playback.id) !== playback || playback.sampleFailed) return;
    playback.sampleFailed = true;
    playback.blocked = false;
    playback.started = false;
    playback.element.pause();
    playback.element.currentTime = 0;
    playback.element.volume = 0;
    this.markEffectEvent(`loop-fallback:${playback.id}:${playback.name}`);
    this.startLoopedEffectFallback(playback);
  }

  private mediaPlayRejectionIsRecoverableBlock(error: unknown): boolean {
    const name = typeof error === "object" && error && "name" in error ? String((error as { name?: unknown }).name || "") : "";
    if (name === "NotAllowedError" || name === "SecurityError") return true;
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
    return message.includes("autoplay") || message.includes("permission") || message.includes("user gesture") || message.includes("blocked");
  }

  private startLoopedEffectFallback(playback: LoopedEffectPlayback): void {
    if (this.loopedEffects.get(playback.id) !== playback || playback.paused || !playback.sampleFailed || playback.fallbackTimer !== null) return;
    const token = ++playback.fallbackToken;
    const pulse = () => {
      if (this.loopedEffects.get(playback.id) !== playback || playback.paused || !playback.sampleFailed || playback.fallbackToken !== token) {
        playback.fallbackTimer = null;
        return;
      }
      if (playback.volumeScale > 0.01) this.playLoopedEffectFallbackToneWhenReady(playback);
      playback.fallbackTimer = setTimeout(pulse, 480);
    };
    playback.started = true;
    this.markEffectEvent(`loop-fallback-start:${playback.id}:${playback.name}`);
    pulse();
  }

  private stopLoopedEffectFallback(playback: LoopedEffectPlayback): void {
    playback.fallbackToken += 1;
    if (playback.fallbackTimer !== null) {
      clearTimeout(playback.fallbackTimer);
      playback.fallbackTimer = null;
    }
    this.stopLoopedEffectFallbackTones(playback);
  }

  private playLoopedEffectFallbackToneWhenReady(playback: LoopedEffectPlayback): void {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    if (context.state === "running") {
      this.playLoopedEffectFallbackTone(playback);
      return;
    }
    const token = playback.fallbackToken;
    void context
      .resume()
      .then(() => {
        this.markContextState(context.state);
        if (
          this.context === context &&
          context.state === "running" &&
          this.loopedEffects.get(playback.id) === playback &&
          !playback.paused &&
          playback.sampleFailed &&
          playback.fallbackToken === token
        ) {
          this.playLoopedEffectFallbackTone(playback);
        }
      })
      .catch(() => this.markAudioState("blocked"));
  }

  private playLoopedEffectFallbackTone(playback: LoopedEffectPlayback): void {
    if (!this.context || !this.master || this.context.state !== "running") return;
    const context = this.context;
    const now = context.currentTime;
    const gain = context.createGain();
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    const settings = this.settings(playback.name);
    const nodes = [osc, filter, gain];
    const release = () => {
      playback.fallbackSources.delete(osc);
      for (const node of nodes) {
        playback.fallbackNodes.delete(node);
        try {
          node.disconnect();
        } catch {
          // A node may already be disconnected during loop teardown.
        }
      }
    };

    osc.type = settings.type;
    osc.frequency.setValueAtTime(settings.start, now);
    osc.frequency.exponentialRampToValueAtTime(settings.end, now + settings.duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(settings.filter, now);
    gain.gain.setValueAtTime(0.0001, now);
    const outputVolume = settings.volume * clampVolume(playback.volumeScale, 1);
    gain.gain.exponentialRampToValueAtTime(outputVolume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    playback.fallbackSources.add(osc);
    for (const node of nodes) playback.fallbackNodes.add(node);
    osc.onended = release;
    osc.start(now);
    osc.stop(now + settings.duration + 0.02);
  }

  private stopLoopedEffectFallbackTones(playback: LoopedEffectPlayback): void {
    for (const source of [...playback.fallbackSources]) {
      source.onended = null;
      try {
        source.stop(0);
      } catch {
        // The source can already be stopped if the scheduled pulse naturally ended.
      }
    }
    playback.fallbackSources.clear();
    for (const node of [...playback.fallbackNodes]) {
      try {
        node.disconnect();
      } catch {
        // The node may already be disconnected by its ended handler.
      }
    }
    playback.fallbackNodes.clear();
  }

  private playToneWhenReady(name: ToneName, volumeScale = 1): void {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    if (context.state === "running") {
      this.playTone(name, volumeScale);
      return;
    }
    void context
      .resume()
      .then(() => {
        this.markContextState(context.state);
        if (this.context === context && context.state === "running") this.playTone(name, volumeScale);
      })
      .catch(() => this.markAudioState("blocked"));
  }

  private playMusicElement(element: HTMLAudioElement): void {
    const attempt = ++this.musicPlayAttempt;
    void element
      .play()
      .then(() => {
        if (this.music === element && attempt === this.musicPlayAttempt) {
          if (this.mediaMusicKey) {
            this.mediaMusicReadyKeys.add(this.mediaMusicKey);
            this.markMusicPlayback(this.mediaMusicKey, "playing");
          }
          this.markAudioState("playing");
        }
      })
      .catch(() => {
        if (this.music === element && attempt === this.musicPlayAttempt) {
          this.applyMusicVolume(element);
          this.markAudioState("blocked");
        }
      });
  }

  private startWebMusicSource(playback: WebMusicPlayback, offset: number): void {
    const context = this.ensureContext();
    if (!context) return;
    this.stopWebMusicSource(playback);
    const source = context.createBufferSource();
    source.buffer = playback.buffer;
    source.loop = true;
    source.loopStart = playback.loop.start;
    source.loopEnd = playback.loop.end;
    source.connect(playback.gain);
    playback.source = source;
    playback.offset = this.clampWebMusicOffset(playback, offset);
    playback.startedAt = context.currentTime;
    source.onended = () => {
      if (playback.source === source) playback.source = null;
    };
    source.start(0, playback.offset);
  }

  private retryWebMusic(playback: WebMusicPlayback): void {
    if (this.musicPaused) return;
    if (!playback.source) this.startWebMusicSource(playback, playback.offset);
    this.resumeContextForWebMusic(playback, this.webMusicPlayAttempt);
  }

  private pauseWebMusic(playback: WebMusicPlayback): void {
    playback.offset = this.webMusicCurrentOffset(playback);
    this.stopWebMusicSource(playback);
  }

  private stopWebMusic(playback: WebMusicPlayback): void {
    this.stopWebMusicSource(playback);
    try {
      playback.gain.disconnect();
    } catch {
      // A gain can already be disconnected if a fade was cancelled during teardown.
    }
  }

  private stopWebMusicSource(playback: WebMusicPlayback): void {
    const source = playback.source;
    playback.source = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // A source can already be stopped by the browser during rapid scene transitions.
    }
    try {
      source.disconnect();
    } catch {
      // A source can already be disconnected if a fade or teardown won the race.
    }
  }

  private resumeContextForWebMusic(playback: WebMusicPlayback, attempt: number): void {
    const context = this.ensureContext();
    if (!context) return;
    void context
      .resume()
      .then(() => {
        this.markContextState(context.state);
        if (this.markWebMusicPlaying(playback, attempt, context)) return;
      })
      .catch(() => this.markAudioState("blocked"));
    if (context.state === "running") this.markWebMusicPlaying(playback, attempt, context);
  }

  private markWebMusicPlaying(playback: WebMusicPlayback, attempt: number, context: AudioContext): boolean {
    if (this.webMusic !== playback || attempt !== this.webMusicPlayAttempt || this.musicPaused || context.state !== "running") return false;
    this.markMusicPlayback(playback.key, "playing");
    this.markAudioState("playing");
    return true;
  }

  private webMusicCurrentOffset(playback: WebMusicPlayback): number {
    const context = this.context;
    if (!context || !playback.source) return playback.offset;
    const raw = playback.offset + Math.max(0, context.currentTime - playback.startedAt);
    if (raw < playback.loop.end) return this.clampWebMusicOffset(playback, raw);
    const length = playback.loop.end - playback.loop.start;
    if (length <= 0) return playback.loop.start;
    return playback.loop.start + ((raw - playback.loop.end) % length);
  }

  private clampWebMusicOffset(playback: WebMusicPlayback, offset: number): number {
    if (!Number.isFinite(offset)) return 0;
    return Math.max(0, Math.min(Math.max(0, playback.buffer.duration - 0.001), offset));
  }

  private musicElementFor(key: SoundtrackKey): HTMLAudioElement {
    const cached = this.musicCache.get(key);
    if (cached) return cached;

    const element = new Audio(soundtracks[key].src);
    element.loop = !musicLoopRegionFor(key);
    element.preload = "metadata";
    this.installCustomMusicLoopFallback(element, key);
    element.addEventListener("pause", () => this.handleCurrentMediaMusicStopped(element));
    element.addEventListener("ended", () => this.handleCurrentMediaMusicStopped(element));
    this.musicCache.set(key, element);
    return element;
  }

  private installCustomMusicLoopFallback(element: HTMLAudioElement, key: SoundtrackKey): void {
    if (!musicLoopRegionFor(key) || typeof element.addEventListener !== "function") return;
    element.addEventListener("timeupdate", () => this.applyCustomMusicLoop(element, key));
    element.addEventListener("ended", () => {
      const loop = musicLoopRegionFor(key);
      if (!loop || this.music !== element || this.musicPaused) return;
      element.currentTime = loop.start;
      this.playMusicElement(element);
      this.startMusicLoopWatch();
    });
  }

  private prepareMusicElement(element: HTMLAudioElement): void {
    element.preload = "auto";
    const haveNothing = typeof HTMLMediaElement === "undefined" ? 0 : HTMLMediaElement.HAVE_NOTHING;
    if ((element.readyState || 0) === haveNothing) element.load();
  }

  private markMusicKey(key: SoundtrackKey): void {
    if (import.meta.env.DEV && typeof document !== "undefined") document.documentElement.dataset.echoShiftMusicKey = key;
  }

  private markMusicPlayback(key: SoundtrackKey, state: "playing"): void {
    this.musicPlaybackKey = key;
    if (import.meta.env.DEV && typeof document !== "undefined") {
      document.documentElement.dataset.echoShiftMusicPlayback = `${key}:${state}`;
    }
  }

  private musicTransportIsPlaying(key: SoundtrackKey): boolean {
    if (this.musicPaused) return false;
    if (this.webMusic?.key === key) return Boolean(this.webMusic.source && this.context?.state === "running");
    if (this.mediaMusicKey === key && this.music) return this.mediaElementIsPlaying(this.music);
    return false;
  }

  private mediaElementIsPlaying(element: HTMLMediaElement): boolean {
    return !element.paused && !element.ended;
  }

  private clearMusicPlayback(): void {
    this.musicPlaybackKey = null;
    if (import.meta.env.DEV && typeof document !== "undefined") {
      delete document.documentElement.dataset.echoShiftMusicPlayback;
    }
  }

  private syncMusicPlayback(stoppedAudioState?: string): void {
    const key = this.musicPlaybackKey;
    if (!key || this.musicTransportIsPlaying(key)) return;
    this.clearMusicPlayback();
    if (stoppedAudioState && !this.musicPaused) this.markAudioState(stoppedAudioState);
  }

  private handleCurrentMediaMusicStopped(element: HTMLAudioElement): void {
    if (this.music === element) this.syncMusicPlayback("stopped");
  }

  private markEffectEvent(event: string): void {
    if (!import.meta.env.DEV || typeof document === "undefined") return;
    this.recentEffectEvents.push(event);
    this.recentEffectEvents = this.recentEffectEvents.slice(-32);
    document.documentElement.dataset.echoShiftAudioEffects = this.recentEffectEvents.join("|");
  }

  private markContextState(state: string): void {
    this.markAudioState(this.musicPaused && state === "running" ? "paused" : state);
    this.syncMusicPlayback();
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

  private applyWebMusicVolume(playback: WebMusicPlayback): void {
    playback.gain.gain.value = this.musicMuted ? 0 : this.musicOutputVolume();
  }

  private startMusicLoopWatch(): void {
    if (!this.music || !this.musicKey || !musicLoopRegionFor(this.musicKey) || this.musicPaused) return;
    if (typeof requestAnimationFrame !== "function") return;
    if (this.musicLoopWatchFrame !== null) return;

    const token = ++this.musicLoopWatchToken;
    const step = () => {
      if (token !== this.musicLoopWatchToken) return;
      const current = this.music;
      const key = this.musicKey;
      if (!current || !key || this.musicPaused || !musicLoopRegionFor(key)) {
        this.musicLoopWatchFrame = null;
        return;
      }

      this.applyCustomMusicLoop(current, key);
      this.musicLoopWatchFrame = requestAnimationFrame(step);
    };

    this.musicLoopWatchFrame = requestAnimationFrame(step);
  }

  private stopMusicLoopWatch(): void {
    this.musicLoopWatchToken += 1;
    if (this.musicLoopWatchFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.musicLoopWatchFrame);
    }
    this.musicLoopWatchFrame = null;
  }

  private applyCustomMusicLoop(element: HTMLAudioElement, key: SoundtrackKey): void {
    const loop = musicLoopRegionFor(key);
    if (!loop || !Number.isFinite(element.currentTime)) return;
    if (element.currentTime < loop.end - MUSIC_LOOP_LOOKAHEAD_SECONDS) return;

    const length = loop.end - loop.start;
    const overflow = Math.max(0, element.currentTime - loop.end);
    const wrappedOverflow = length > 0 ? overflow % length : 0;
    element.currentTime = loop.start + Math.min(wrappedOverflow, Math.max(0, length - 0.001));
  }

  private fadeMusic(previous: HTMLAudioElement | null, next: HTMLAudioElement | null, token: number, fadeMs?: number): void {
    if (!next && !previous) return;
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
      if (next) next.volume = this.musicMuted ? 0 : this.musicOutputVolume() * eased;
      if (previous) previous.volume = this.musicMuted ? 0 : previousStart * (1 - eased);

      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      if (next) this.applyMusicVolume(next);
      if (previous) {
        this.stopMusicElement(previous);
      }
      this.releaseUnusedMusic();
    };

    requestAnimationFrame(step);
  }

  private fadeWebMusic(previous: WebMusicPlayback | null, next: WebMusicPlayback | null, token: number, fadeMs?: number): void {
    if (!next && !previous) return;
    const started = performance.now();
    const duration = Math.max(180, Math.min(1600, fadeMs ?? 760));
    const previousStart = previous?.gain.gain.value || 0;
    if (previous) this.fadingWebMusic.add(previous);

    const step = (now: number) => {
      if (token !== this.fadeToken) {
        if (previous) this.stopWebMusic(previous);
        return;
      }
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      if (next) next.gain.gain.value = this.musicMuted ? 0 : this.musicOutputVolume() * eased;
      if (previous) previous.gain.gain.value = this.musicMuted ? 0 : previousStart * (1 - eased);

      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      if (next) this.applyWebMusicVolume(next);
      if (previous) {
        this.fadingWebMusic.delete(previous);
        this.stopWebMusic(previous);
      }
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

  private stopStaleFadingMusic(except: HTMLAudioElement | null): void {
    for (const element of [...this.fadingMusic]) {
      if (element !== except) this.stopMusicElement(element);
    }
  }

  private stopAllFadingMusic(): void {
    for (const element of [...this.fadingMusic]) {
      this.stopMusicElement(element);
    }
  }

  private stopStaleFadingWebMusic(except?: WebMusicPlayback): void {
    for (const playback of [...this.fadingWebMusic]) {
      if (playback !== except) {
        this.fadingWebMusic.delete(playback);
        this.stopWebMusic(playback);
      }
    }
  }

  private stopAllFadingWebMusic(): void {
    for (const playback of [...this.fadingWebMusic]) {
      this.fadingWebMusic.delete(playback);
      this.stopWebMusic(playback);
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
      this.mediaMusicReadyKeys.delete(key);
      this.mediaMusicReadyPromises.delete(key);
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
      case "stormFloorBeam":
        return { start: 620, end: 520, duration: 0.34, volume: 0.18, filter: 2600, type: "sawtooth" as OscillatorType };
      case "cryoBeamFire":
        return { start: 740, end: 540, duration: 0.32, volume: 0.17, filter: 3000, type: "triangle" as OscillatorType };
      case "cryoFloorIceForm":
        return { start: 840, end: 220, duration: 0.22, volume: 0.16, filter: 2400, type: "sine" as OscillatorType };
      case "archiveBookImpact":
        return { start: 120, end: 70, duration: 0.22, volume: 0.2, filter: 1000, type: "triangle" as OscillatorType };
      case "bossCoreHit":
        return { start: 180, end: 820, duration: 0.2, volume: 0.24, filter: 2800, type: "square" as OscillatorType };
      case "bossDefeatDeparture":
        return { start: 110, end: 48, duration: 0.5, volume: 0.22, filter: 900, type: "sawtooth" as OscillatorType };
    }
  }
}

export const audio = new SynthAudio();
