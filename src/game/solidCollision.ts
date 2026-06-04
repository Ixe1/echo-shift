import type { Solid, SolidCollision } from "./types";

export const solidCollisionValues = ["solid", "top-only", "decorative"] as const satisfies readonly SolidCollision[];

export const normalizeSolidCollision = (value: unknown): SolidCollision | undefined =>
  solidCollisionValues.includes(value as SolidCollision) ? (value as SolidCollision) : undefined;

export const solidCollisionFor = (solid: Pick<Solid, "collision">): SolidCollision =>
  normalizeSolidCollision(solid.collision) || "solid";

export const solidHasFullCollision = (solid: Pick<Solid, "collision">): boolean =>
  solidCollisionFor(solid) === "solid";

export const solidHasTopOnlyCollision = (solid: Pick<Solid, "collision">): boolean =>
  solidCollisionFor(solid) === "top-only";

export const solidHasGameplayCollision = (solid: Pick<Solid, "collision">): boolean =>
  solidCollisionFor(solid) !== "decorative";
