import type { Level, LevelBackgroundAmbience, LevelBackgroundAmbiencePreset } from "./types";

export type NormalizedBackgroundAmbience = Required<LevelBackgroundAmbience>;

export const backgroundAmbiencePresets: LevelBackgroundAmbiencePreset[] = [
  "none",
  "lab",
  "security",
  "reactor",
  "data",
  "maintenance"
];

export const backgroundAmbiencePresetLabels: Record<LevelBackgroundAmbiencePreset, string> = {
  none: "None",
  lab: "Lab Glow",
  security: "Security Scanner",
  reactor: "Reactor Pulse",
  data: "Data Stream",
  maintenance: "Maintenance Haze"
};

const presetDefaults: Record<LevelBackgroundAmbiencePreset, NormalizedBackgroundAmbience> = {
  none: { preset: "none", intensity: 0, color: "#43f7ff", drift: 0, flicker: 0, particles: 0 },
  lab: { preset: "lab", intensity: 0.42, color: "#43f7ff", drift: 0.34, flicker: 0.22, particles: 0.34 },
  security: { preset: "security", intensity: 0.44, color: "#ff4f6d", drift: 0.28, flicker: 0.54, particles: 0.18 },
  reactor: { preset: "reactor", intensity: 0.5, color: "#ffe35a", drift: 0.18, flicker: 0.46, particles: 0.24 },
  data: { preset: "data", intensity: 0.46, color: "#bd5cff", drift: 0.52, flicker: 0.34, particles: 0.38 },
  maintenance: { preset: "maintenance", intensity: 0.38, color: "#50ffc2", drift: 0.42, flicker: 0.18, particles: 0.32 }
};

const clamp01 = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

export const isBackgroundAmbiencePreset = (value: unknown): value is LevelBackgroundAmbiencePreset =>
  typeof value === "string" && backgroundAmbiencePresets.includes(value as LevelBackgroundAmbiencePreset);

export const isBackgroundAmbienceColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

export const normalizeBackgroundAmbience = (
  ambience: LevelBackgroundAmbience | undefined
): NormalizedBackgroundAmbience => {
  const preset = isBackgroundAmbiencePreset(ambience?.preset) ? ambience.preset : "none";
  const defaults = presetDefaults[preset];
  return {
    preset,
    intensity: preset === "none" ? 0 : clamp01(ambience?.intensity, defaults.intensity),
    color: isBackgroundAmbienceColor(ambience?.color) ? ambience.color.toLowerCase() : defaults.color,
    drift: preset === "none" ? 0 : clamp01(ambience?.drift, defaults.drift),
    flicker: preset === "none" ? 0 : clamp01(ambience?.flicker, defaults.flicker),
    particles: preset === "none" ? 0 : clamp01(ambience?.particles, defaults.particles)
  };
};

export const defaultBackgroundAmbienceForPreset = (
  preset: LevelBackgroundAmbiencePreset
): NormalizedBackgroundAmbience => ({ ...presetDefaults[preset] });

export const backgroundAmbienceForLevel = (level: Level): NormalizedBackgroundAmbience =>
  normalizeBackgroundAmbience(level.backgroundAmbience);

export const backgroundAmbienceIsActive = (ambience: NormalizedBackgroundAmbience): boolean =>
  ambience.preset !== "none" && ambience.intensity > 0;

