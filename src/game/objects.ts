import { rectsOverlap } from "./geometry";
import { oscillatingOffsetAt } from "./motion";
import type {
  ActorBody,
  EchoSensor,
  Core,
  Door,
  Hazard,
  Laser,
  Level,
  MovingLaser,
  PatrolDrone,
  PressurePlate,
  Rect
} from "./types";

export type ObjectState = {
  activePlates: Set<string>;
  latchedPlates: Set<string>;
  timedSwitchTimers: Map<string, number>;
  openDoors: Set<string>;
  collectedCores: Set<string>;
  blockedLasers: Set<string>;
  crates: Map<string, Rect>;
};

export const createObjectState = (level?: Level): ObjectState => ({
  activePlates: new Set(),
  latchedPlates: new Set(),
  timedSwitchTimers: new Map(),
  openDoors: new Set(),
  collectedCores: new Set(),
  blockedLasers: new Set(),
  crates: new Map((level?.crates || []).map((crate) => [crate.id, { x: crate.x, y: crate.y, w: crate.w, h: crate.h }]))
});

export const updateObjects = (
  level: Level,
  actors: ActorBody[],
  previous: ObjectState,
  tick = 0
): { state: ObjectState; switched: boolean; core: { x: number; y: number } | null } => {
  const crateRects = [...previous.crates.values()];
  const timedSwitchTimers = updateTimedSwitchTimers(level, actors, crateRects, previous.timedSwitchTimers);
  const activePlates = collectActivePlates(level.plates || [], actors, crateRects, previous.latchedPlates);
  collectActiveTimedSwitches(timedSwitchTimers, activePlates);
  collectActiveEchoSensors(level.echoSensors || [], actors, activePlates);
  const latchedPlates = new Set(previous.latchedPlates);
  for (const plate of level.plates || []) {
    if (plate.once && activePlates.has(plate.id)) latchedPlates.add(plate.id);
  }

  const collectedCores = new Set(previous.collectedCores);
  let core: { x: number; y: number } | null = null;
  for (const item of level.cores || []) {
    const collector = actors.find((actor) => actor.alive && rectsOverlap(actor, item));
    if (!collectedCores.has(item.id) && collector) {
      collectedCores.add(item.id);
      core = {
        x: collector.x + collector.w / 2,
        y: collector.y + collector.h / 2
      };
    }
  }

  const openDoors = collectOpenDoors(level.doors || [], activePlates, collectedCores);
  const blockedLasers = collectBlockedLasers([...(level.lasers || []), ...(level.movingLasers || [])], actors, crateRects, activePlates, tick);
  const switched =
    setChanged(previous.activePlates, activePlates) ||
    setChanged(previous.openDoors, openDoors) ||
    setChanged(previous.blockedLasers, blockedLasers);

  return {
    state: {
      activePlates,
      latchedPlates,
      timedSwitchTimers,
      openDoors,
      collectedCores,
      blockedLasers,
      crates: previous.crates
    },
    switched,
    core
  };
};

export const closedDoorRects = (level: Level, openDoors: Set<string>): Rect[] =>
  (level.doors || [])
    .filter((door) => !openDoors.has(door.id))
    .map((door) => ({ x: door.x, y: door.y, w: door.w, h: door.h }));

export const playerTouchesHazard = (
  level: Level,
  player: ActorBody,
  objectState: ObjectState,
  tick = 0
): boolean => {
  if ((level.hazards || []).some((hazard) => rectsOverlap(player, hazard))) return true;
  if ((level.drones || []).some((drone) => rectsOverlap(player, droneRectAt(drone, tick)))) return true;

  for (const laser of level.lasers || []) {
    if (!laserIsActive(laser, objectState.activePlates)) continue;
    if (!rectsOverlap(player, laser)) continue;
    if (!objectState.blockedLasers.has(laser.id)) return true;
  }

  for (const laser of level.movingLasers || []) {
    const rect = movingLaserRectAt(laser, tick);
    if (!laserIsActive(laser, objectState.activePlates)) continue;
    if (!rectsOverlap(player, rect)) continue;
    if (!objectState.blockedLasers.has(laser.id)) return true;
  }

  return false;
};

export const droneRectAt = (drone: PatrolDrone, tick: number): Rect => {
  const offset = oscillatingOffsetAt(drone.distance, drone.period, drone.phase || 0, tick);
  return {
    x: drone.x + (drone.axis === "x" ? offset : 0),
    y: drone.y + (drone.axis === "y" ? offset : 0),
    w: drone.w,
    h: drone.h
  };
};

export const laserIsActive = (laser: Laser, activePlates: Set<string>): boolean => {
  const startsOn = laser.startsOn !== false;
  const disabled = (laser.disabledBy || []).some((id) => activePlates.has(id));
  return startsOn && !disabled;
};

export const movingLaserRectAt = (laser: MovingLaser, tick: number): Rect => {
  const offset = oscillatingOffsetAt(laser.distance, laser.period, laser.phase || 0, tick);
  return {
    x: laser.x + (laser.axis === "x" ? offset : 0),
    y: laser.y + (laser.axis === "y" ? offset : 0),
    w: laser.w,
    h: laser.h
  };
};

const collectActivePlates = (
  plates: PressurePlate[],
  actors: ActorBody[],
  crates: Rect[],
  latchedPlates: Set<string>
): Set<string> => {
  const active = new Set(latchedPlates);
  for (const plate of plates) {
    if (actors.some((actor) => actor.alive && rectsOverlap(actor, plate)) || crates.some((crate) => rectsOverlap(crate, plate))) {
      active.add(plate.id);
    }
  }
  return active;
};

const updateTimedSwitchTimers = (
  level: Level,
  actors: ActorBody[],
  crates: Rect[],
  previous: Map<string, number>
): Map<string, number> => {
  const timers = new Map<string, number>();
  for (const [id, remaining] of previous) {
    if (remaining > 1) timers.set(id, remaining - 1);
  }
  for (const timedSwitch of level.timedSwitches || []) {
    if (actors.some((actor) => actor.alive && rectsOverlap(actor, timedSwitch)) || crates.some((crate) => rectsOverlap(crate, timedSwitch))) {
      timers.set(timedSwitch.id, Math.max(1, Math.round(timedSwitch.duration)));
    }
  }
  return timers;
};

const collectActiveTimedSwitches = (timers: Map<string, number>, active: Set<string>): void => {
  for (const [id, remaining] of timers) {
    if (remaining > 0) active.add(id);
  }
};

const collectActiveEchoSensors = (sensors: EchoSensor[], actors: ActorBody[], active: Set<string>): void => {
  for (const sensor of sensors) {
    const actorMode = sensor.actors || "echo";
    if (
      actors.some(
        (actor) =>
          actor.alive &&
          rectsOverlap(actor, sensor) &&
          (actorMode === "both" || actor.kind === actorMode)
      )
    ) {
      active.add(sensor.id);
    }
  }
};

const collectOpenDoors = (
  doors: Door[],
  activePlates: Set<string>,
  collectedCores: Set<string>
): Set<string> => {
  const open = new Set<string>();
  for (const door of doors) {
    const platesSatisfied = (door.opensWith || []).every((id) => activePlates.has(id));
    const coreSatisfied = !door.requiresCore || collectedCores.has(door.requiresCore);
    const shouldOpen = platesSatisfied && coreSatisfied;
    if (door.inverted ? !shouldOpen : shouldOpen) open.add(door.id);
  }
  return open;
};

const collectBlockedLasers = (lasers: Laser[], actors: ActorBody[], crates: Rect[], activePlates: Set<string>, tick: number): Set<string> => {
  const blocked = new Set<string>();
  const echoes = actors.filter((actor) => actor.kind === "echo" && actor.alive);
  for (const laser of lasers) {
    const startsOn = laser.startsOn !== false;
    const disabled = (laser.disabledBy || []).some((id) => activePlates.has(id));
    if (!startsOn || disabled) continue;
    const rect = "axis" in laser ? movingLaserRectAt(laser as MovingLaser, tick) : laser;
    if (echoes.some((echo) => rectsOverlap(echo, rect)) || crates.some((crate) => rectsOverlap(crate, rect))) {
      blocked.add(laser.id);
    }
  }
  return blocked;
};

const setChanged = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return true;
  for (const item of a) {
    if (!b.has(item)) return true;
  }
  return false;
};

export const isCoreVisible = (core: Core, collected: Set<string>): boolean => !collected.has(core.id);

export const isHazard = (hazard: Hazard): Hazard => hazard;
