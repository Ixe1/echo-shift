import type { Level, LevelBackgroundKey } from "./types";

export type LevelBackground = {
  key: LevelBackgroundKey;
  title: string;
  src: string;
  sourceSize: {
    w: number;
    h: number;
  };
  repeat: "x";
};

export const levelBackgrounds: Record<LevelBackgroundKey, LevelBackground> = {
  "time-lab-prototype": {
    key: "time-lab-prototype",
    title: "Prototype Time Lab",
    src: "/assets/time-lab-background.png",
    sourceSize: { w: 1672, h: 941 },
    repeat: "x"
  },
  "level-1-time-lab-no-portals": {
    key: "level-1-time-lab-no-portals",
    title: "Level 1 Time Lab",
    src: "/assets/backgrounds/level-1-time-lab-no-portals.png",
    sourceSize: { w: 1881, h: 836 },
    repeat: "x"
  }
};

export const levelBackgroundKeys = Object.keys(levelBackgrounds) as LevelBackgroundKey[];

export const isLevelBackgroundKey = (value: unknown): value is LevelBackgroundKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(levelBackgrounds, value);

export const backgroundForLevel = (level: Level, _levelSlot = level.index): LevelBackground => {
  if (isLevelBackgroundKey(level.backgroundKey)) return levelBackgrounds[level.backgroundKey];
  return levelBackgrounds["time-lab-prototype"];
};
