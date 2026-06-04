import type { SoundtrackKey } from "./types";
import { soundtracks } from "./soundtracks";

type ToneName =
  | "jump"
  | "land"
  | "rewind"
  | "switch"
  | "core"
  | "death"
  | "portal"
  | "select";

type AudioContextConstructor = new () => AudioContext;

const unlockEvents = ["pointerdown", "keydown", "touchstart"] as const;

export class SynthAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicKey: SoundtrackKey | null = null;
  private musicCache = new Map<SoundtrackKey, HTMLAudioElement>();
  private musicPlayAttempt = 0;
  private fadeToken = 0;
  private musicMuted = false;
  private musicPaused = false;
  private unlockListenersInstalled = false;
  private readonly musicVolume = 0.28;
  private readonly maxCachedMusicElements = 3;

  unlock(): void {
    this.resume();
    if (this.musicKey) this.prepareMusicElement(this.musicElementFor(this.musicKey));
  }

  resume(): void {
    this.installUnlockListeners();
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
    if (!this.context || !this.master) return;
    if (this.context.state !== "running") {
      void this.context
        .resume()
        .then(() => {
          if (this.context?.state === "running") this.playTone(name);
        })
        .catch(() => this.markAudioState("blocked"));
      return;
    }
    this.playTone(name);
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

  playMusic(key: SoundtrackKey, options: { restart?: boolean } = {}): void {
    this.installUnlockListeners();
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

    this.fadeMusic(previous, next, token);
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
    this.unlockListenersInstalled = false;
    this.master?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.master = null;
    this.context = null;
    this.markAudioState("stopped");
  }

  private handleUnlockGesture = (): void => {
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

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const AudioContextClass =
      window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const context = new AudioContextClass();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(context.destination);
    this.markAudioState(context.state);
    return context;
  }

  private retryMusic(): void {
    if (this.music && !this.musicPaused) this.playMusicElement(this.music);
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
    element.volume = this.musicMuted ? 0 : this.musicVolume;
  }

  private fadeMusic(previous: HTMLAudioElement | null, next: HTMLAudioElement, token: number): void {
    const started = performance.now();
    const duration = 760;
    const previousStart = previous?.volume || 0;

    const step = (now: number) => {
      if (token !== this.fadeToken) return;
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      next.volume = this.musicMuted ? 0 : this.musicVolume * eased;
      if (previous) previous.volume = this.musicMuted ? 0 : previousStart * (1 - eased);

      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      this.applyMusicVolume(next);
      if (previous) {
        previous.pause();
        previous.currentTime = 0;
      }
      this.releaseUnusedMusic();
    };

    requestAnimationFrame(step);
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
      case "death":
        return { start: 220, end: 35, duration: 0.42, volume: 0.24, filter: 800, type: "sawtooth" as OscillatorType };
      case "portal":
        return { start: 300, end: 900, duration: 0.28, volume: 0.28, filter: 3600, type: "sine" as OscillatorType };
      case "select":
        return { start: 420, end: 640, duration: 0.07, volume: 0.16, filter: 2400, type: "triangle" as OscillatorType };
    }
  }
}

export const audio = new SynthAudio();
