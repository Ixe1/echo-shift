import type { Solid, SolidDecorDensity, TerrainMaterial } from "./types";

export const TERRAIN_DECOR_PROP_TEXTURE_PREFIX = "terrain-decor-prop";

export const solidDecorDensityValues = ["auto", "off", "low", "medium", "high"] as const satisfies readonly SolidDecorDensity[];

export const solidDecorDensityLabels: Record<SolidDecorDensity, string> = {
  auto: "Auto",
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High"
};

export type TerrainDecorPropCategory =
  | "surface-small"
  | "surface-medium"
  | "behind-surface-large"
  | "overhang"
  | "wall-decal";

export type TerrainDecorAnchor = "bottom-left" | "bottom-center" | "top-left" | "wall-left";

export type TerrainDecorPropDefinition = {
  id: string;
  material: "grass-organic";
  category: TerrainDecorPropCategory;
  frame: number;
  w: number;
  h: number;
  anchor: TerrainDecorAnchor;
  minSegmentWidth: number;
  clearance: { w: number; h: number };
  densities: ReadonlyArray<Exclude<SolidDecorDensity, "auto" | "off">>;
  weight: number;
  depthOffset: number;
};

export const normalizeSolidDecorDensity = (value: unknown): SolidDecorDensity | undefined =>
  solidDecorDensityValues.includes(value as SolidDecorDensity) ? (value as SolidDecorDensity) : undefined;

export const terrainDecorPropTextureKey = (prop: Pick<TerrainDecorPropDefinition, "id">): string =>
  `${TERRAIN_DECOR_PROP_TEXTURE_PREFIX}:${prop.id}`;

export const terrainDecorPropSrc = (prop: Pick<TerrainDecorPropDefinition, "id">): string =>
  `/assets/sprites/terrain-decor-props/${prop.id}.png`;

export const effectiveSolidDecorDensity = (
  solid: Pick<Solid, "decorDensity">,
  material: TerrainMaterial
): SolidDecorDensity => {
  const density = normalizeSolidDecorDensity(solid.decorDensity) || "auto";
  if (density !== "auto") return density;
  return material === "grass-organic" ? "medium" : "off";
};

export const gardenTerrainDecorProps = [
  {
    id: "grass-tufts",
    material: "grass-organic",
    category: "surface-small",
    frame: 0,
    w: 56,
    h: 44,
    anchor: "bottom-left",
    minSegmentWidth: 48,
    clearance: { w: 50, h: 36 },
    densities: ["low", "medium", "high"],
    weight: 4,
    depthOffset: 0.21
  },
  {
    id: "wildflower-cluster",
    material: "grass-organic",
    category: "surface-small",
    frame: 1,
    w: 54,
    h: 42,
    anchor: "bottom-left",
    minSegmentWidth: 56,
    clearance: { w: 48, h: 36 },
    densities: ["low", "medium", "high"],
    weight: 3,
    depthOffset: 0.22
  },
  {
    id: "mushroom-pair",
    material: "grass-organic",
    category: "surface-small",
    frame: 2,
    w: 68,
    h: 48,
    anchor: "bottom-left",
    minSegmentWidth: 80,
    clearance: { w: 62, h: 42 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.21
  },
  {
    id: "sprout-leaves",
    material: "grass-organic",
    category: "surface-small",
    frame: 3,
    w: 56,
    h: 45,
    anchor: "bottom-left",
    minSegmentWidth: 48,
    clearance: { w: 50, h: 38 },
    densities: ["low", "medium", "high"],
    weight: 3,
    depthOffset: 0.21
  },
  {
    id: "moss-stone",
    material: "grass-organic",
    category: "surface-small",
    frame: 4,
    w: 82,
    h: 37,
    anchor: "bottom-left",
    minSegmentWidth: 72,
    clearance: { w: 74, h: 32 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.2
  },
  {
    id: "root-curl",
    material: "grass-organic",
    category: "surface-small",
    frame: 5,
    w: 55,
    h: 45,
    anchor: "bottom-left",
    minSegmentWidth: 72,
    clearance: { w: 50, h: 40 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.2
  },
  {
    id: "fern-cluster",
    material: "grass-organic",
    category: "surface-medium",
    frame: 6,
    w: 76,
    h: 70,
    anchor: "bottom-center",
    minSegmentWidth: 112,
    clearance: { w: 68, h: 62 },
    densities: ["medium", "high"],
    weight: 3,
    depthOffset: 0.18
  },
  {
    id: "flowering-shrub",
    material: "grass-organic",
    category: "surface-medium",
    frame: 7,
    w: 86,
    h: 78,
    anchor: "bottom-center",
    minSegmentWidth: 124,
    clearance: { w: 78, h: 70 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.18
  },
  {
    id: "leaf-bush",
    material: "grass-organic",
    category: "surface-medium",
    frame: 8,
    w: 86,
    h: 77,
    anchor: "bottom-center",
    minSegmentWidth: 132,
    clearance: { w: 78, h: 68 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.17
  },
  {
    id: "root-mound",
    material: "grass-organic",
    category: "surface-medium",
    frame: 9,
    w: 82,
    h: 57,
    anchor: "bottom-center",
    minSegmentWidth: 112,
    clearance: { w: 74, h: 50 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.16
  },
  {
    id: "slim-tree",
    material: "grass-organic",
    category: "behind-surface-large",
    frame: 10,
    w: 113,
    h: 150,
    anchor: "bottom-center",
    minSegmentWidth: 180,
    clearance: { w: 104, h: 140 },
    densities: ["medium", "high"],
    weight: 3,
    depthOffset: -0.24
  },
  {
    id: "broad-tree",
    material: "grass-organic",
    category: "behind-surface-large",
    frame: 11,
    w: 119,
    h: 160,
    anchor: "bottom-center",
    minSegmentWidth: 240,
    clearance: { w: 108, h: 148 },
    densities: ["high"],
    weight: 2,
    depthOffset: -0.26
  },
  {
    id: "root-arch",
    material: "grass-organic",
    category: "behind-surface-large",
    frame: 12,
    w: 160,
    h: 100,
    anchor: "bottom-center",
    minSegmentWidth: 260,
    clearance: { w: 148, h: 92 },
    densities: ["high"],
    weight: 1,
    depthOffset: -0.25
  },
  {
    id: "hanging-vines",
    material: "grass-organic",
    category: "overhang",
    frame: 13,
    w: 68,
    h: 90,
    anchor: "top-left",
    minSegmentWidth: 112,
    clearance: { w: 60, h: 80 },
    densities: ["medium", "high"],
    weight: 3,
    depthOffset: 0.08
  },
  {
    id: "dangling-roots",
    material: "grass-organic",
    category: "overhang",
    frame: 14,
    w: 58,
    h: 88,
    anchor: "top-left",
    minSegmentWidth: 96,
    clearance: { w: 50, h: 78 },
    densities: ["medium", "high"],
    weight: 3,
    depthOffset: 0.08
  },
  {
    id: "moss-strip",
    material: "grass-organic",
    category: "overhang",
    frame: 15,
    w: 78,
    h: 32,
    anchor: "top-left",
    minSegmentWidth: 128,
    clearance: { w: 70, h: 28 },
    densities: ["high"],
    weight: 2,
    depthOffset: 0.08
  },
  {
    id: "wall-vine",
    material: "grass-organic",
    category: "wall-decal",
    frame: 16,
    w: 40,
    h: 185,
    anchor: "wall-left",
    minSegmentWidth: 96,
    clearance: { w: 34, h: 170 },
    densities: ["medium", "high"],
    weight: 3,
    depthOffset: 0.06
  },
  {
    id: "root-creeper",
    material: "grass-organic",
    category: "wall-decal",
    frame: 17,
    w: 62,
    h: 180,
    anchor: "wall-left",
    minSegmentWidth: 128,
    clearance: { w: 54, h: 166 },
    densities: ["high"],
    weight: 2,
    depthOffset: 0.06
  },
  {
    id: "tiny-flower-tuft",
    material: "grass-organic",
    category: "surface-small",
    frame: 18,
    w: 60,
    h: 48,
    anchor: "bottom-left",
    minSegmentWidth: 64,
    clearance: { w: 54, h: 42 },
    densities: ["low", "medium", "high"],
    weight: 3,
    depthOffset: 0.22
  },
  {
    id: "glow-moss-clump",
    material: "grass-organic",
    category: "surface-small",
    frame: 19,
    w: 78,
    h: 38,
    anchor: "bottom-left",
    minSegmentWidth: 72,
    clearance: { w: 70, h: 32 },
    densities: ["low", "medium", "high"],
    weight: 3,
    depthOffset: 0.2
  },
  {
    id: "seedling-sprout",
    material: "grass-organic",
    category: "surface-small",
    frame: 20,
    w: 58,
    h: 56,
    anchor: "bottom-left",
    minSegmentWidth: 64,
    clearance: { w: 52, h: 50 },
    densities: ["low", "medium", "high"],
    weight: 2,
    depthOffset: 0.2
  },
  {
    id: "edge-leaf-clump",
    material: "grass-organic",
    category: "surface-small",
    frame: 21,
    w: 72,
    h: 44,
    anchor: "bottom-left",
    minSegmentWidth: 72,
    clearance: { w: 64, h: 38 },
    densities: ["low", "medium", "high"],
    weight: 3,
    depthOffset: 0.2
  },
  {
    id: "thin-fern-spray",
    material: "grass-organic",
    category: "surface-medium",
    frame: 22,
    w: 76,
    h: 74,
    anchor: "bottom-center",
    minSegmentWidth: 112,
    clearance: { w: 68, h: 66 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.18
  },
  {
    id: "curled-root-hook",
    material: "grass-organic",
    category: "surface-small",
    frame: 23,
    w: 58,
    h: 50,
    anchor: "bottom-left",
    minSegmentWidth: 72,
    clearance: { w: 52, h: 44 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.19
  },
  {
    id: "pink-flower-tuft",
    material: "grass-organic",
    category: "surface-medium",
    frame: 24,
    w: 74,
    h: 76,
    anchor: "bottom-center",
    minSegmentWidth: 112,
    clearance: { w: 66, h: 68 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.18
  },
  {
    id: "small-mushroom-pair",
    material: "grass-organic",
    category: "surface-small",
    frame: 25,
    w: 58,
    h: 62,
    anchor: "bottom-left",
    minSegmentWidth: 80,
    clearance: { w: 52, h: 56 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.2
  },
  {
    id: "meadow-flower-clump",
    material: "grass-organic",
    category: "surface-small",
    frame: 26,
    w: 76,
    h: 44,
    anchor: "bottom-left",
    minSegmentWidth: 76,
    clearance: { w: 68, h: 38 },
    densities: ["low", "medium", "high"],
    weight: 3,
    depthOffset: 0.21
  },
  {
    id: "curled-vine-sprout",
    material: "grass-organic",
    category: "surface-small",
    frame: 27,
    w: 52,
    h: 70,
    anchor: "bottom-left",
    minSegmentWidth: 76,
    clearance: { w: 46, h: 62 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.2
  },
  {
    id: "broken-root-nub",
    material: "grass-organic",
    category: "surface-medium",
    frame: 28,
    w: 78,
    h: 74,
    anchor: "bottom-center",
    minSegmentWidth: 112,
    clearance: { w: 70, h: 66 },
    densities: ["medium", "high"],
    weight: 2,
    depthOffset: 0.17
  },
  {
    id: "broad-leaf-tuft",
    material: "grass-organic",
    category: "surface-small",
    frame: 29,
    w: 72,
    h: 58,
    anchor: "bottom-left",
    minSegmentWidth: 76,
    clearance: { w: 64, h: 52 },
    densities: ["low", "medium", "high"],
    weight: 3,
    depthOffset: 0.2
  }
] as const satisfies readonly TerrainDecorPropDefinition[];

export const terrainDecorPropsForMaterial = (material: TerrainMaterial): readonly TerrainDecorPropDefinition[] =>
  material === "grass-organic" ? gardenTerrainDecorProps : [];
