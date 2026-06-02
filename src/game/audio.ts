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

export class SynthAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicKey: SoundtrackKey | null = null;
  private fadeToken = 0;
  private musicMuted = false;
  private readonly musicVolume = 0.28;

  resume(): void {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(context.destination);
    }
    void this.context.resume();
    void this.music?.play().catch(() => undefined);
  }

  play(name: ToneName): void {
    this.resume();
    if (!this.context || !this.master) return;
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
      shimmer.start(now + 0.01);
      shimmer.stop(now + settings.duration * 1.35 + 0.02);
    }
  }

  startMusic(): void {
    this.playMusic("menu");
  }

  playMusic(key: SoundtrackKey, options: { restart?: boolean } = {}): void {
    if (this.context) void this.context.resume();
    this.markMusicKey(key);
    if (this.music && this.musicKey === key && !options.restart) {
      this.applyMusicVolume(this.music);
      void this.music.play();
      return;
    }

    const previous = this.music;
    const next = new Audio(soundtracks[key].src);
    next.loop = true;
    next.preload = "auto";
    next.volume = this.musicMuted ? 0 : 0;
    this.music = next;
    this.musicKey = key;

    const token = ++this.fadeToken;
    void next.play().catch(() => {
      if (this.music === next) this.applyMusicVolume(next);
    });

    this.fadeMusic(previous, next, token);
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    if (this.music) this.applyMusicVolume(this.music);
  }

  stopMusic(): void {
    this.fadeToken += 1;
    this.music?.pause();
    this.music = null;
    this.musicKey = null;
    if (import.meta.env.DEV) delete document.documentElement.dataset.echoShiftMusicKey;
  }

  private markMusicKey(key: SoundtrackKey): void {
    if (import.meta.env.DEV) document.documentElement.dataset.echoShiftMusicKey = key;
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
      const progress = Math.min(1, (now - started) / duration);
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
    };

    requestAnimationFrame(step);
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
