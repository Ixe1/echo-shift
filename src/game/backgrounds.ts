import type { Level, LevelBackgroundKey } from "./types";

export type LevelBackgroundRenderMode = "repeat-x" | "fit-level";

export type LevelBackground = {
  key: LevelBackgroundKey;
  title: string;
  src: string;
  fallbackSrc?: string;
  sourceSize: {
    w: number;
    h: number;
  };
  renderMode: LevelBackgroundRenderMode;
};

export const levelBackgrounds: Record<LevelBackgroundKey, LevelBackground> = {
  "time-lab-prototype": {
    key: "time-lab-prototype",
    title: "Prototype Time Lab",
    src: "/assets/time-lab-background.webp",
    fallbackSrc: "/assets/time-lab-background.png",
    sourceSize: { w: 1672, h: 941 },
    renderMode: "repeat-x"
  },
  "level-1-time-lab-no-portals": {
    key: "level-1-time-lab-no-portals",
    title: "Level 1 Time Lab",
    src: "/assets/backgrounds/level-1-time-lab-no-portals.webp",
    fallbackSrc: "/assets/backgrounds/level-1-time-lab-no-portals.png",
    sourceSize: { w: 1881, h: 836 },
    renderMode: "repeat-x"
  },
  "level-2-time-lab-no-portals": {
    key: "level-2-time-lab-no-portals",
    title: "Level 2 Time Lab",
    src: "/assets/backgrounds/level-2-time-lab-no-portals.webp",
    fallbackSrc: "/assets/backgrounds/level-2-time-lab-no-portals.png",
    sourceSize: { w: 2200, h: 715 },
    renderMode: "repeat-x"
  },
  "level-3-time-lab-no-portals": {
    key: "level-3-time-lab-no-portals",
    title: "Level 3 Time Lab",
    src: "/assets/backgrounds/level-3-time-lab-no-portals.webp",
    fallbackSrc: "/assets/backgrounds/level-3-time-lab-no-portals.png",
    sourceSize: { w: 1916, h: 821 },
    renderMode: "repeat-x"
  },
  "level-4-time-lab-no-portals": {
    key: "level-4-time-lab-no-portals",
    title: "Level 4 Time Lab",
    src: "/assets/backgrounds/level-4-time-lab-no-portals.webp",
    fallbackSrc: "/assets/backgrounds/level-4-time-lab-no-portals.png",
    sourceSize: { w: 1881, h: 836 },
    renderMode: "repeat-x"
  },
  "level-1-springtide-glassgrove": {
    key: "level-1-springtide-glassgrove",
    title: "Springtide Glassgrove",
    src: "/assets/backgrounds/level-1-springtide-glassgrove.webp",
    fallbackSrc: "/assets/backgrounds/level-1-springtide-glassgrove.png",
    sourceSize: { w: 1694, h: 929 },
    renderMode: "repeat-x"
  },
  "level-1-springtide-garden-fit": {
    key: "level-1-springtide-garden-fit",
    title: "Springtide Garden Full-Plate",
    src: "/assets/backgrounds/level-1-springtide-garden-fit.webp",
    fallbackSrc: "/assets/backgrounds/level-1-springtide-garden-fit.jpg",
    sourceSize: { w: 4800, h: 1440 },
    renderMode: "fit-level"
  },
  "level-1-readable-lab": {
    key: "level-1-readable-lab",
    title: "Level 1 Calibration Atrium",
    src: "/assets/backgrounds/level-1-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-1-readable-lab.jpg",
    sourceSize: { w: 1881, h: 836 },
    renderMode: "repeat-x"
  },
  "level-2-rainhouse-relay": {
    key: "level-2-rainhouse-relay",
    title: "Rainhouse Relay",
    src: "/assets/backgrounds/level-2-rainhouse-relay.webp",
    fallbackSrc: "/assets/backgrounds/level-2-rainhouse-relay.png",
    sourceSize: { w: 1920, h: 819 },
    renderMode: "repeat-x"
  },
  "level-2-rainhouse-relay-fit": {
    key: "level-2-rainhouse-relay-fit",
    title: "Rainhouse Relay Full-Plate",
    src: "/assets/backgrounds/level-2-rainhouse-relay-fit.webp",
    fallbackSrc: "/assets/backgrounds/level-2-rainhouse-relay-fit.jpg",
    sourceSize: { w: 6800, h: 1440 },
    renderMode: "fit-level"
  },
  "level-2-readable-lab": {
    key: "level-2-readable-lab",
    title: "Level 2 Relay Chamber",
    src: "/assets/backgrounds/level-2-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-2-readable-lab.jpg",
    sourceSize: { w: 1920, h: 819 },
    renderMode: "repeat-x"
  },
  "level-3-readable-lab": {
    key: "level-3-readable-lab",
    title: "Level 3 Maintenance Wing",
    src: "/assets/backgrounds/level-3-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-3-readable-lab.jpg",
    sourceSize: { w: 1915, h: 821 },
    renderMode: "repeat-x"
  },
  "level-3-cryo-conservatory": {
    key: "level-3-cryo-conservatory",
    title: "Cryo Conservatory",
    src: "/assets/backgrounds/level-3-cryo-conservatory.webp",
    fallbackSrc: "/assets/backgrounds/level-3-cryo-conservatory.png",
    sourceSize: { w: 1920, h: 819 },
    renderMode: "repeat-x"
  },
  "level-3-cryo-grove-fit": {
    key: "level-3-cryo-grove-fit",
    title: "Cryo Grove Full-Plate",
    src: "/assets/backgrounds/level-3-cryo-grove-fit.webp",
    fallbackSrc: "/assets/backgrounds/level-3-cryo-grove-fit.jpg",
    sourceSize: { w: 6800, h: 1440 },
    renderMode: "fit-level"
  },
  "level-4-readable-lab": {
    key: "level-4-readable-lab",
    title: "Level 4 Relay Vault",
    src: "/assets/backgrounds/level-4-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-4-readable-lab.jpg",
    sourceSize: { w: 1881, h: 836 },
    renderMode: "repeat-x"
  },
  "level-4-timber-archive": {
    key: "level-4-timber-archive",
    title: "Timber Archive",
    src: "/assets/backgrounds/level-4-timber-archive.webp",
    fallbackSrc: "/assets/backgrounds/level-4-timber-archive.png",
    sourceSize: { w: 1920, h: 819 },
    renderMode: "repeat-x"
  },
  "level-4-timber-archive-fit": {
    key: "level-4-timber-archive-fit",
    title: "Timber Archive Full-Plate",
    src: "/assets/backgrounds/level-4-timber-archive-fit.webp",
    fallbackSrc: "/assets/backgrounds/level-4-timber-archive-fit.jpg",
    sourceSize: { w: 7200, h: 1440 },
    renderMode: "fit-level"
  },
  "level-5-readable-lab": {
    key: "level-5-readable-lab",
    title: "Level 5 Lift Machinery Bay",
    src: "/assets/backgrounds/level-5-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-5-readable-lab.jpg",
    sourceSize: { w: 1983, h: 793 },
    renderMode: "repeat-x"
  },
  "level-5-sunken-clockwork": {
    key: "level-5-sunken-clockwork",
    title: "Sunken Clockwork",
    src: "/assets/backgrounds/level-5-sunken-clockwork.webp",
    fallbackSrc: "/assets/backgrounds/level-5-sunken-clockwork.png",
    sourceSize: { w: 1921, h: 819 },
    renderMode: "repeat-x"
  },
  "level-5-sunken-clockwork-fit": {
    key: "level-5-sunken-clockwork-fit",
    title: "Sunken Clockwork Full-Plate",
    src: "/assets/backgrounds/level-5-sunken-clockwork-fit.webp",
    fallbackSrc: "/assets/backgrounds/level-5-sunken-clockwork-fit.jpg",
    sourceSize: { w: 6800, h: 1440 },
    renderMode: "fit-level"
  },
  "level-6-readable-lab": {
    key: "level-6-readable-lab",
    title: "Level 6 Security Corridor",
    src: "/assets/backgrounds/level-6-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-6-readable-lab.jpg",
    sourceSize: { w: 1881, h: 836 },
    renderMode: "repeat-x"
  },
  "level-7-readable-lab": {
    key: "level-7-readable-lab",
    title: "Level 7 Dual Reactor Hall",
    src: "/assets/backgrounds/level-7-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-7-readable-lab.jpg",
    sourceSize: { w: 1838, h: 856 },
    renderMode: "repeat-x"
  },
  "level-8-readable-lab": {
    key: "level-8-readable-lab",
    title: "Level 8 Cross Current Conduit",
    src: "/assets/backgrounds/level-8-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-8-readable-lab.jpg",
    sourceSize: { w: 1838, h: 856 },
    renderMode: "repeat-x"
  },
  "level-9-readable-lab": {
    key: "level-9-readable-lab",
    title: "Level 9 Phase Braid Loom",
    src: "/assets/backgrounds/level-9-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-9-readable-lab.jpg",
    sourceSize: { w: 1983, h: 793 },
    renderMode: "repeat-x"
  },
  "level-10-readable-lab": {
    key: "level-10-readable-lab",
    title: "Level 10 Synchronization Chamber",
    src: "/assets/backgrounds/level-10-readable-lab.webp",
    fallbackSrc: "/assets/backgrounds/level-10-readable-lab.jpg",
    sourceSize: { w: 1939, h: 811 },
    renderMode: "repeat-x"
  }
};

export const levelBackgroundKeys = Object.keys(levelBackgrounds) as LevelBackgroundKey[];

export const isLevelBackgroundKey = (value: unknown): value is LevelBackgroundKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(levelBackgrounds, value);

export const backgroundForLevel = (level: Level, _levelSlot = level.index): LevelBackground => {
  if (isLevelBackgroundKey(level.backgroundKey)) return levelBackgrounds[level.backgroundKey];
  return levelBackgrounds["time-lab-prototype"];
};
