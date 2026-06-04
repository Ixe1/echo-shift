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

export type SolidSprite = "auto" | "floor" | "wall" | "block" | "warning";
export type SolidCollision = "solid" | "top-only" | "decorative";
export type TerrainMaterial =
  | "metal-lab"
  | "glass-energy"
  | "warning-industrial"
  | "grass-organic"
  | "sand-ruin"
  | "ice-cryo"
  | "wood-archive"
  | "copper-corrode";

export type Solid = Rect & {
  id: string;
  tone?: "steel" | "glass" | "warning" | "dark";
  sprite?: SolidSprite;
  material?: TerrainMaterial;
  collision?: SolidCollision;
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
  disabledBy?: string[];
};

export type OneWayPlatform = Rect & {
  id: string;
};

export type Conveyor = Rect & {
  id: string;
  direction: -1 | 1;
  speed: number;
};

export type LaunchPad = Rect & {
  id: string;
  powerX?: number;
  powerY: number;
};

export type PressurePlate = Rect & {
  id: string;
  label?: string;
  once?: boolean;
};

export type TimedSwitch = Rect & {
  id: string;
  duration: number;
  label?: string;
};

export type EchoSensor = Rect & {
  id: string;
  actors?: "echo" | "player" | "both";
  label?: string;
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

export type MovingLaser = Laser & {
  axis: "x" | "y";
  distance: number;
  period: number;
  phase?: number;
};

export type CoreSize = "small" | "large";

export type Core = Rect & {
  id: string;
  label?: string;
  size?: CoreSize;
};

export type Hazard = Rect & {
  id: string;
};

export type PushableCrate = Rect & {
  id: string;
};

export type SoundtrackKey =
  | "menu"
  | "level-1"
  | "level-2"
  | "level-3"
  | "level-4"
  | "level-5"
  | "level-6"
  | "level-7"
  | "level-8"
  | "level-9"
  | "level-10";

export type LevelSoundtrackKey = Exclude<SoundtrackKey, "menu">;

export type LevelBackgroundKey =
  | "time-lab-prototype"
  | "level-1-time-lab-no-portals"
  | "level-2-time-lab-no-portals"
  | "level-3-time-lab-no-portals"
  | "level-4-time-lab-no-portals"
  | "level-1-readable-lab"
  | "level-2-readable-lab"
  | "level-3-readable-lab"
  | "level-4-readable-lab"
  | "level-5-readable-lab"
  | "level-6-readable-lab"
  | "level-7-readable-lab"
  | "level-8-readable-lab"
  | "level-9-readable-lab"
  | "level-10-readable-lab";

export type LevelBackgroundAmbiencePreset = "none" | "lab" | "security" | "reactor" | "data" | "maintenance";

export type LevelBackgroundAmbience = {
  preset?: LevelBackgroundAmbiencePreset;
  intensity?: number;
  color?: string;
  drift?: number;
  flicker?: number;
  particles?: number;
};

export type LevelScoreSettings = {
  lives: number;
  coreScore: number;
  deathPenalty: number;
  timeBonusTargetSeconds: number;
  timeBonusPerSecond: number;
};

export type Level = {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  motionModel?: "anchored";
  soundtrackKey?: LevelSoundtrackKey;
  backgroundKey?: LevelBackgroundKey;
  backgroundAmbience?: LevelBackgroundAmbience;
  start: Vec2;
  exit: Rect;
  bounds: Rect;
  solids: Solid[];
  platforms?: MovingPlatform[];
  oneWays?: OneWayPlatform[];
  conveyors?: Conveyor[];
  launchPads?: LaunchPad[];
  drones?: PatrolDrone[];
  plates?: PressurePlate[];
  timedSwitches?: TimedSwitch[];
  echoSensors?: EchoSensor[];
  doors?: Door[];
  lasers?: Laser[];
  movingLasers?: MovingLaser[];
  cores?: Core[];
  hazards?: Hazard[];
  crates?: PushableCrate[];
  score: LevelScoreSettings;
  hint: string;
};

export type LevelScore = {
  levelId: string;
  score: number;
  frames: number;
  echoes: number;
  deaths: number;
  cores: number;
  timeBonus: number;
  legacy?: boolean;
};

export type CorePickupEvent = Vec2 & {
  id: string;
};

export type StepEvents = {
  jumped: boolean;
  launched: boolean;
  landed: boolean;
  switched: boolean;
  core: CorePickupEvent | null;
  cores: CorePickupEvent[];
  died: boolean;
  livesExhausted: boolean;
  won: boolean;
};

export type SimulationSnapshot = {
  player: ActorBody;
  echoes: ActorBody[];
  activePlates: Set<string>;
  openDoors: Set<string>;
  collectedCores: Set<string>;
  blockedLasers: Set<string>;
  crates: Map<string, Rect>;
  tick: number;
  totalFrames: number;
  score: number;
  deaths: number;
  livesRemaining: number;
  dead: boolean;
  won: boolean;
};
