import type { Solid, SolidSprite } from "./types";

export const solidSpriteValues = ["auto", "floor", "wall", "block", "warning"] as const satisfies readonly SolidSprite[];

export const normalizeSolidSprite = (value: unknown): SolidSprite | undefined =>
  solidSpriteValues.includes(value as SolidSprite) ? (value as SolidSprite) : undefined;

export const legacySolidSprite = (solid: Pick<Solid, "id">): SolidSprite | undefined => {
  if (/^floorpiece-\d+$/.test(solid.id)) return "floor";
  if (/^wall-\d+$/.test(solid.id)) return "wall";
  if (/^block-\d+$/.test(solid.id)) return "block";
  return undefined;
};

export const normalizeSolid = (solid: Solid): Solid => ({
  ...solid,
  sprite: solid.sprite === undefined ? legacySolidSprite(solid) : solid.sprite
});
