import { legacySolidSprite } from "./solidSprites";
import type { Solid, TerrainMaterial } from "./types";

export const TERRAIN_TILE_KEY = "terrain-tiles";
export const TERRAIN_TILE_SIZE = 32;

export const terrainMaterialValues = [
  "metal-lab",
  "glass-energy",
  "warning-industrial",
  "grass-organic",
  "sand-ruin",
  "ice-cryo",
  "wood-archive",
  "copper-corrode"
] as const satisfies readonly TerrainMaterial[];

export const terrainMaterialLabels: Record<TerrainMaterial, string> = {
  "metal-lab": "Metal Lab",
  "glass-energy": "Glass Energy",
  "warning-industrial": "Warning Stripe",
  "grass-organic": "Grass Overgrowth",
  "sand-ruin": "Sand Ruin",
  "ice-cryo": "Cryo Ice",
  "wood-archive": "Wood Archive",
  "copper-corrode": "Copper Corrosion"
};

export const terrainTileRoles = ["floorTop", "floorFace", "wallFace", "blockFace"] as const;

export type TerrainTileRole = (typeof terrainTileRoles)[number];

export const TERRAIN_TILE_ROLE_COUNT = terrainTileRoles.length;

export const normalizeTerrainMaterial = (value: unknown): TerrainMaterial | undefined =>
  terrainMaterialValues.includes(value as TerrainMaterial) ? (value as TerrainMaterial) : undefined;

export const terrainMaterialForSolid = (
  solid: Pick<Solid, "id" | "tone" | "sprite" | "material">
): TerrainMaterial => {
  const explicit = normalizeTerrainMaterial(solid.material);
  if (explicit) return explicit;

  const sprite = solid.sprite || legacySolidSprite(solid);
  if (sprite === "warning" || solid.tone === "warning") return "warning-industrial";
  if (solid.tone === "glass") return "glass-energy";
  return "metal-lab";
};

export const terrainTileFrame = (material: TerrainMaterial, role: TerrainTileRole): number => {
  const materialIndex = terrainMaterialValues.indexOf(material);
  const roleIndex = terrainTileRoles.indexOf(role);
  return materialIndex * TERRAIN_TILE_ROLE_COUNT + roleIndex;
};
