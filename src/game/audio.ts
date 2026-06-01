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
  private musicGain: GainNode | null = null;
  private musicStarted = false;

  resume(): void {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(context.destination);
    }
    void this.context.resume();
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
  }

  startMusic(): void {
    this.resume();
    if (!this.context || !this.master || this.musicStarted) return;
    this.musicStarted = true;
    const context = this.context;
    const musicGain = context.createGain();
    musicGain.gain.value = 0.045;
    musicGain.connect(this.master);
    this.musicGain = musicGain;

    const notes = [110, 146.83, 164.81, 220, 246.94, 329.63, 293.66, 220];
    notes.forEach((note, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = index % 3 === 0 ? "triangle" : "sine";
      osc.frequency.value = note;
      gain.gain.value = index % 2 === 0 ? 0.22 : 0.14;
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start();
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      lfo.frequency.value = 0.03 + index * 0.004;
      lfoGain.gain.value = 14;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
    });
  }

  setMusicMuted(muted: boolean): void {
    if (this.musicGain) {
      this.musicGain.gain.value = muted ? 0 : 0.045;
    }
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
