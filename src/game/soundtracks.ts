import type { Level } from "./types";

export type SoundtrackKey =
  | "menu"
  | "level-1"
  | "level-2"
  | "level-3"
  | "level-4"
  | "level-5"
  | "level-6"
  | "level-7"
  | "level-8"
  | "level-9"
  | "level-10";

export type Soundtrack = {
  key: SoundtrackKey;
  title: string;
  src: string;
  durationSeconds: number;
};

const soundtrackPath = (file: string): string => `/assets/audio/soundtracks/${file}`;

export const soundtracks: Record<SoundtrackKey, Soundtrack> = {
  menu: {
    key: "menu",
    title: "Echo Shift - Main Menu",
    src: soundtrackPath("Echo Shift - Main Menu.mp3"),
    durationSeconds: 94.8
  },
  "level-1": {
    key: "level-1",
    title: "Echo Shift - Level 1",
    src: soundtrackPath("Echo Shift - Level 1.mp3"),
    durationSeconds: 44.7
  },
  "level-2": {
    key: "level-2",
    title: "Echo Shift - Level 2",
    src: soundtrackPath("Echo Shift - Level 2.mp3"),
    durationSeconds: 58.4
  },
  "level-3": {
    key: "level-3",
    title: "Echo Shift - Level 3",
    src: soundtrackPath("Echo Shift - Level 3.mp3"),
    durationSeconds: 112.5
  },
  "level-4": {
    key: "level-4",
    title: "Echo Shift - Level 4",
    src: soundtrackPath("Echo Shift - Level 4.mp3"),
    durationSeconds: 117.6
  },
  "level-5": {
    key: "level-5",
    title: "Echo Shift - Level 5",
    src: soundtrackPath("Echo Shift - Level 5.mp3"),
    durationSeconds: 100.9
  },
  "level-6": {
    key: "level-6",
    title: "Echo Shift - Level 6",
    src: soundtrackPath("Echo Shift - Level 6.mp3"),
    durationSeconds: 129.9
  },
  "level-7": {
    key: "level-7",
    title: "Echo Shift - Level 7",
    src: soundtrackPath("Echo Shift - Level 7.mp3"),
    durationSeconds: 82.3
  },
  "level-8": {
    key: "level-8",
    title: "Echo Shift - Level 8",
    src: soundtrackPath("Echo Shift - Level 8.mp3"),
    durationSeconds: 98.9
  },
  "level-9": {
    key: "level-9",
    title: "Echo Shift - Level 9",
    src: soundtrackPath("Echo Shift - Level 9.mp3"),
    durationSeconds: 89.4
  },
  "level-10": {
    key: "level-10",
    title: "Echo Shift - Level 10",
    src: soundtrackPath("Echo Shift - Level 10.mp3"),
    durationSeconds: 164.8
  }
};

export const soundtrackForLevel = (level: Level): Soundtrack =>
  soundtracks[`level-${level.index + 1}` as SoundtrackKey];
