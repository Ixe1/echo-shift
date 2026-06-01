import type { Rect } from "./types";

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rectCenter = (rect: Rect) => ({
  x: rect.x + rect.w / 2,
  y: rect.y + rect.h / 2
});

export const cloneRect = <T extends Rect>(rect: T): T => ({ ...rect });

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const formatFrames = (frames: number): string => {
  const totalSeconds = Math.max(0, Math.floor(frames / 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = `${totalSeconds % 60}`.padStart(2, "0");
  const centis = `${Math.floor(((frames % 60) / 60) * 100)}`.padStart(2, "0");
  return `${minutes}:${seconds}.${centis}`;
};
