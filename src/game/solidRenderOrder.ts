import { solidCollisionFor } from "./solidCollision";
import { legacySolidSprite } from "./solidSprites";
import type { Solid } from "./types";

export type SolidVisualRole = "floor" | "wall" | "block" | "warning";

const SOLID_BASE_RENDER_DEPTH = 1;
const SOLID_COLLISION_DEPTH_BIAS = {
  decorative: -0.35,
  solid: 0,
  "top-only": 0.04
} as const;

export const solidVisualRoleFor = (solid: Solid): SolidVisualRole => {
  const sprite = solid.sprite || legacySolidSprite(solid);
  if (sprite === "floor") return "floor";
  if (sprite === "wall") return "wall";
  if (sprite === "block") return "block";
  if (sprite === "warning") return "warning";
  if (solid.tone === "warning") return "warning";

  const width = Math.max(1, solid.w);
  const height = Math.max(1, solid.h);
  if (height >= width * 1.35) return "wall";
  if (width >= height * 2) return "floor";
  if (solid.tone === "glass") return "block";
  if (solid.tone === "dark") return "wall";
  return "block";
};

const solidVisualRoleDepthBias = (role: SolidVisualRole): number => {
  if (role === "floor" || role === "warning") return 0.08;
  if (role === "block") return 0.04;
  return 0;
};

const solidVerticalDepthBias = (solid: Solid): number => Math.max(0, Math.min(0.24, solid.y / 2200));

export const solidRenderDepth = (solid: Solid): number =>
  SOLID_BASE_RENDER_DEPTH +
  SOLID_COLLISION_DEPTH_BIAS[solidCollisionFor(solid)] +
  solidVisualRoleDepthBias(solidVisualRoleFor(solid)) +
  solidVerticalDepthBias(solid);
