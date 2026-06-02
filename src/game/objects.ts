import { rectsOverlap } from "./geometry";
import type {
  ActorBody,
  Core,
  Door,
  Hazard,
  Laser,
  Level,
  PatrolDrone,
  PressurePlate,
  Rect
} from "./types";

export type ObjectState = {
  activePlates: Set<string>;
  latchedPlates: Set<string>;
  openDoors: Set<string>;
  collectedCores: Set<string>;
  blockedLasers: Set<string>;
};

export const createObjectState = (): ObjectState => ({
  activePlates: new Set(),
  latchedPlates: new Set(),
  openDoors: new Set(),
  collectedCores: new Set(),
  blockedLasers: new Set()
});

export const updateObjects = (
  level: Level,
  actors: ActorBody[],
  previous: ObjectState
): { state: ObjectState; switched: boolean; core: { x: number; y: number } | null } => {
  const activePlates = collectActivePlates(level.plates || [], actors, previous.latchedPlates);
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
  const blockedLasers = collectBlockedLasers(level.lasers || [], actors);
  const switched =
    setChanged(previous.activePlates, activePlates) || setChanged(previous.openDoors, openDoors);

  return {
    state: {
      activePlates,
      latchedPlates,
      openDoors,
      collectedCores,
      blockedLasers
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

  return false;
};

export const droneRectAt = (drone: PatrolDrone, tick: number): Rect => {
  const phase = drone.phase || 0;
  const wave = Math.sin(((tick / drone.period) * Math.PI * 2) + phase);
  const offset = wave * drone.distance;
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

const collectActivePlates = (
  plates: PressurePlate[],
  actors: ActorBody[],
  latchedPlates: Set<string>
): Set<string> => {
  const active = new Set(latchedPlates);
  for (const plate of plates) {
    if (actors.some((actor) => actor.alive && rectsOverlap(actor, plate))) {
      active.add(plate.id);
    }
  }
  return active;
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

const collectBlockedLasers = (lasers: Laser[], actors: ActorBody[]): Set<string> => {
  const blocked = new Set<string>();
  const echoes = actors.filter((actor) => actor.kind === "echo" && actor.alive);
  for (const laser of lasers) {
    if (echoes.some((echo) => rectsOverlap(echo, laser))) {
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
