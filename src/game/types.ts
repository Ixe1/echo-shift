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

export type Core = Rect & {
  id: string;
  label?: string;
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

export type LevelBackgroundKey = "time-lab-prototype" | "level-1-time-lab-no-portals";

export type Level = {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  soundtrackKey?: LevelSoundtrackKey;
  backgroundKey?: LevelBackgroundKey;
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
  launched: boolean;
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
  crates: Map<string, Rect>;
  tick: number;
  totalFrames: number;
  dead: boolean;
  won: boolean;
};
