import type { Level, MovingLaser, MovingPlatform, PatrolDrone } from "../game/types";

export const ANCHORED_MOTION_MODEL = "anchored" as const;
export type MotionModel = typeof ANCHORED_MOTION_MODEL;

type MovingObject = MovingPlatform | PatrolDrone | MovingLaser;

const movingCollections = ["platforms", "drones", "movingLasers"] as const;

export const usesAnchoredMotionModel = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (value as { motionModel?: unknown }).motionModel === ANCHORED_MOTION_MODEL;

const convertLegacyMovingObject = (object: MovingObject): void => {
  const distance = Number.isFinite(object.distance) ? Math.max(0, object.distance) : 0;
  if (object.axis === "x") object.x -= distance;
  else object.y -= distance;
  object.distance = distance * 2;
  object.phase = (Number.isFinite(object.phase) ? object.phase || 0 : 0) + Math.PI / 2;
};

export const migrateLegacyMotionModel = <T extends Level>(level: T): T => {
  for (const kind of movingCollections) {
    for (const object of level[kind] || []) {
      convertLegacyMovingObject(object as MovingObject);
    }
  }
  level.motionModel = ANCHORED_MOTION_MODEL;
  return level;
};

export const markAnchoredMotionModel = <T extends Level>(level: T): T => {
  level.motionModel = ANCHORED_MOTION_MODEL;
  return level;
};

export const normalizeLevelMotionModel = <T extends Level>(level: T, alreadyAnchored: boolean): T =>
  alreadyAnchored ? markAnchoredMotionModel(level) : migrateLegacyMotionModel(level);
