export type Vec2 = {
  x: number;
  y: number;
};

export type Rect = Vec2 & {
  w: number;
  h: number;
};

export type InputFrame = {
  left: boolean;
  right: boolean;
  jump: boolean;
};

export type ActorKind = "player" | "echo";

export type ActorBody = Rect & {
  id: string;
  kind: ActorKind;
  vx: number;
  vy: number;
  onGround: boolean;
  coyote: number;
  jumpBuffer: number;
  prevJump: boolean;
  facing: -1 | 1;
  standingOn: string | null;
  alive: boolean;
};

export type Solid = Rect & {
  id: string;
  tone?: "steel" | "glass" | "warning" | "dark";
};

export type MovingPlatform = Rect & {
  id: string;
  axis: "x" | "y";
  distance: number;
  period: number;
  phase?: number;
};

export type PatrolDrone = Rect & {
  id: string;
  axis: "x" | "y";
  distance: number;
  period: number;
  phase?: number;
};

export type PressurePlate = Rect & {
  id: string;
  label?: string;
  once?: boolean;
};

export type Door = Rect & {
  id: string;
  opensWith?: string[];
  requiresCore?: string;
  inverted?: boolean;
};

export type Laser = Rect & {
  id: string;
  disabledBy?: string[];
  startsOn?: boolean;
};

export type Core = Rect & {
  id: string;
  label?: string;
};

export type Hazard = Rect & {
  id: string;
};

export type Level = {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  start: Vec2;
  exit: Rect;
  bounds: Rect;
  solids: Solid[];
  platforms?: MovingPlatform[];
  drones?: PatrolDrone[];
  plates?: PressurePlate[];
  doors?: Door[];
  lasers?: Laser[];
  cores?: Core[];
  hazards?: Hazard[];
  perfectEchoes: number;
  medalFrames: {
    gold: number;
    silver: number;
  };
  hint: string;
};

export type LevelScore = {
  levelId: string;
  frames: number;
  echoes: number;
  medal: Medal;
};

export type Medal = "Quantum" | "Gold" | "Silver" | "Bronze";

export type StepEvents = {
  jumped: boolean;
  landed: boolean;
  switched: boolean;
  core: Vec2 | null;
  died: boolean;
  won: boolean;
};

export type SimulationSnapshot = {
  player: ActorBody;
  echoes: ActorBody[];
  activePlates: Set<string>;
  openDoors: Set<string>;
  collectedCores: Set<string>;
  blockedLasers: Set<string>;
  tick: number;
  totalFrames: number;
  dead: boolean;
  won: boolean;
};
