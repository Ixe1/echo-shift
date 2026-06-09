import type { Boss, BossSoundtrackKey, Level, LevelSoundtrackKey, SoundtrackKey } from "./types";

export const soundtrackKeys = [
  "menu",
  "tutorial",
  "boss",
  "final-boss",
  "level-1",
  "level-2",
  "level-3",
  "level-4",
  "level-5"
] as const satisfies readonly SoundtrackKey[];

export type Soundtrack = {
  key: SoundtrackKey;
  title: string;
  src: string;
  durationSeconds: number;
  loopStartSeconds?: number;
  loopEndSeconds?: number;
};

const soundtrackPath = (file: string): string => `/assets/audio/soundtracks/${file}`;

export const soundtracks: Record<SoundtrackKey, Soundtrack> = {
  menu: {
    key: "menu",
    title: "Echo Shift - Main Menu",
    src: soundtrackPath("Echo Shift - Main Menu.mp3"),
    durationSeconds: 94.8
  },
  tutorial: {
    key: "tutorial",
    title: "Echo Shift - Tutorial",
    src: soundtrackPath("Echo Shift - Tutorial.mp3"),
    durationSeconds: 82.3
  },
  boss: {
    key: "boss",
    title: "Echo Shift - Boss",
    src: soundtrackPath("Echo Shift - Boss.mp3"),
    durationSeconds: 129.96,
    loopStartSeconds: 23.879,
    loopEndSeconds: 108.386
  },
  "final-boss": {
    key: "final-boss",
    title: "Echo Shift - Final Boss",
    src: soundtrackPath("Echo Shift - Final Boss.mp3"),
    durationSeconds: 64.16,
    loopStartSeconds: 12.248,
    loopEndSeconds: 42.975
  },
  "level-1": {
    key: "level-1",
    title: "Echo Shift - Level 1",
    src: soundtrackPath("Echo Shift - Level 1.mp3"),
    durationSeconds: 54.76,
    loopStartSeconds: 8.97,
    loopEndSeconds: 43.311
  },
  "level-2": {
    key: "level-2",
    title: "Echo Shift - Level 2",
    src: soundtrackPath("Echo Shift - Level 2.mp3"),
    durationSeconds: 80.64,
    loopStartSeconds: 15.751,
    loopEndSeconds: 69.482
  },
  "level-3": {
    key: "level-3",
    title: "Echo Shift - Level 3",
    src: soundtrackPath("Echo Shift - Level 3.mp3"),
    durationSeconds: 112.24,
    loopStartSeconds: 23.628,
    loopEndSeconds: 96.76
  },
  "level-4": {
    key: "level-4",
    title: "Echo Shift - Level 4",
    src: soundtrackPath("Echo Shift - Level 4.mp3"),
    durationSeconds: 93.4,
    loopStartSeconds: 11.129,
    loopEndSeconds: 78.505
  },
  "level-5": {
    key: "level-5",
    title: "Echo Shift - Level 5",
    src: soundtrackPath("Echo Shift - Level 5.mp3"),
    durationSeconds: 142.68,
    loopStartSeconds: 31.113,
    loopEndSeconds: 107.129
  }
};

export const levelSoundtrackKeys = soundtrackKeys.filter((key): key is LevelSoundtrackKey => key !== "menu" && key !== "boss" && key !== "final-boss");
export const bossSoundtrackKeys = soundtrackKeys.filter((key): key is BossSoundtrackKey => key !== "menu");

export const isSoundtrackKey = (value: unknown): value is SoundtrackKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(soundtracks, value);

export const isLevelSoundtrackKey = (value: unknown): value is LevelSoundtrackKey =>
  isSoundtrackKey(value) && value !== "menu" && value !== "boss" && value !== "final-boss";

export const isBossSoundtrackKey = (value: unknown): value is BossSoundtrackKey =>
  isSoundtrackKey(value) && value !== "menu";

export const defaultSoundtrackKeyForLevel = (level: Pick<Level, "index">, levelSlot = level.index): LevelSoundtrackKey => {
  const key = `level-${levelSlot + 1}` as SoundtrackKey;
  return isLevelSoundtrackKey(key) ? key : "level-1";
};

export const soundtrackForLevel = (level: Level, levelSlot = level.index): Soundtrack => {
  if (isLevelSoundtrackKey(level.soundtrackKey)) return soundtracks[level.soundtrackKey];
  return soundtracks[defaultSoundtrackKeyForLevel(level, levelSlot)];
};

export const soundtrackForBoss = (boss?: Pick<Boss, "soundtrackKey">): Soundtrack => {
  const key = boss?.soundtrackKey;
  if (isBossSoundtrackKey(key)) return soundtracks[key];
  return soundtracks.boss;
};
