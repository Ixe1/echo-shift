import { rectsOverlap } from "./geometry";
import { oscillatingOffsetAt } from "./motion";
import type {
  ActorBody,
  CorePickupEvent,
  EchoSensor,
  Core,
  Door,
  Hazard,
  Laser,
  Level,
  MovingLaser,
  PatrolDrone,
  PressurePlate,
  Rect,
  SpilledCore
} from "./types";

export type ObjectState = {
  activePlates: Set<string>;
  latchedPlates: Set<string>;
  timedSwitchTimers: Map<string, number>;
  openDoors: Set<string>;
  collectedCores: Set<string>;
  claimedCores: Set<string>;
  spilledCores: Map<string, SpilledCore>;
  blockedLasers: Set<string>;
  crates: Map<string, Rect>;
};

export const createObjectState = (level?: Level): ObjectState => {
  const activePlates = new Set<string>();
  const collectedCores = new Set<string>();
  return {
    activePlates,
    latchedPlates: new Set(),
    timedSwitchTimers: new Map(),
    openDoors: collectOpenDoors(level?.doors || [], activePlates, collectedCores, new Set()),
    collectedCores,
    claimedCores: new Set(),
    spilledCores: new Map(),
    blockedLasers: new Set(),
    crates: new Map((level?.crates || []).map((crate) => [crate.id, { x: crate.x, y: crate.y, w: crate.w, h: crate.h }]))
  };
};

export const updateObjects = (
  level: Level,
  actors: ActorBody[],
  previous: ObjectState,
  tick = 0,
  defeatedBossIds: ReadonlySet<string> = new Set()
): { state: ObjectState; switched: boolean; core: CorePickupEvent | null; cores: CorePickupEvent[] } => {
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
  const claimedCores = new Set(previous.claimedCores);
  const spilledCores = new Map([...previous.spilledCores.entries()].map(([id, core]) => [id, { ...core }]));
  const cores: CorePickupEvent[] = [];
  for (const item of level.cores || []) {
    const collector = actors.find((actor) => actor.alive && rectsOverlap(actor, item));
    if (!claimedCores.has(item.id) && collector) {
      claimedCores.add(item.id);
      collectedCores.add(item.id);
      cores.push({
        id: item.id,
        x: collector.x + collector.w / 2,
        y: collector.y + collector.h / 2
      });
    }
  }
  for (const [id, looseCore] of spilledCores) {
    if (looseCore.pickupDelayFrames > 0) continue;
    const collector = actors.find((actor) => actor.alive && rectsOverlap(actor, looseCore));
    if (!collector) continue;
    spilledCores.delete(id);
    claimedCores.add(looseCore.sourceId);
    collectedCores.add(looseCore.sourceId);
    cores.push({
      id: looseCore.sourceId,
      recovered: true,
      x: looseCore.x + looseCore.w / 2,
      y: looseCore.y + looseCore.h / 2
    });
  }

  const openDoors = collectOpenDoors(level.doors || [], activePlates, collectedCores, defeatedBossIds);
  const blockedLasers = collectBlockedLasers([...(level.lasers || []), ...(level.movingLasers || [])], crateRects, activePlates, tick);
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
      claimedCores,
      spilledCores,
      blockedLasers,
      crates: previous.crates
    },
    switched,
    core: cores[0] || null,
    cores
  };
};

export const closedDoorRects = (level: Level, openDoors: Set<string>): Rect[] =>
  (level.doors || [])
    .filter((door) => !openDoors.has(door.id))
    .map((door) => ({ x: door.x, y: door.y, w: door.w, h: door.h }));

export const actorTouchesHazard = (
  level: Level,
  actor: ActorBody,
  objectState: ObjectState,
  tick = 0
): boolean => actorHazardContact(level, actor, objectState, tick) !== null;

export type ActorHazardContact = {
  kind: "hazard" | "drone" | "laser";
  rect: Rect;
};

export const actorHazardContact = (
  level: Level,
  actor: ActorBody,
  objectState: ObjectState,
  tick = 0
): ActorHazardContact | null => {
  for (const laser of level.lasers || []) {
    if (!laserIsActive(laser, objectState.activePlates)) continue;
    if (!rectsOverlap(actor, laser)) continue;
    if (!objectState.blockedLasers.has(laser.id)) return { kind: "laser", rect: laser };
  }
  for (const laser of level.movingLasers || []) {
    const rect = movingLaserRectAt(laser, tick);
    if (!laserIsActive(laser, objectState.activePlates)) continue;
    if (!rectsOverlap(actor, rect)) continue;
    if (!objectState.blockedLasers.has(laser.id)) return { kind: "laser", rect };
  }
  for (const hazard of level.hazards || []) {
    if (rectsOverlap(actor, hazard)) return { kind: "hazard", rect: hazard };
  }
  for (const drone of level.drones || []) {
    const rect = droneRectAt(drone, tick);
    if (droneIsActive(drone, objectState.activePlates) && rectsOverlap(actor, rect)) return { kind: "drone", rect };
  }
  return null;
};

export const actorTouchesLaser = (
  level: Level,
  actor: ActorBody,
  objectState: ObjectState,
  tick = 0
): boolean => {
  for (const laser of level.lasers || []) {
    if (!laserIsActive(laser, objectState.activePlates)) continue;
    if (!rectsOverlap(actor, laser)) continue;
    if (!objectState.blockedLasers.has(laser.id)) return true;
  }

  for (const laser of level.movingLasers || []) {
    const rect = movingLaserRectAt(laser, tick);
    if (!laserIsActive(laser, objectState.activePlates)) continue;
    if (!rectsOverlap(actor, rect)) continue;
    if (!objectState.blockedLasers.has(laser.id)) return true;
  }

  return false;
};

export const playerTouchesHazard = actorTouchesHazard;

export const droneRectAt = (drone: PatrolDrone, tick: number): Rect => {
  const offset = oscillatingOffsetAt(drone.distance, drone.period, drone.phase || 0, tick);
  return {
    x: drone.x + (drone.axis === "x" ? offset : 0),
    y: drone.y + (drone.axis === "y" ? offset : 0),
    w: drone.w,
    h: drone.h
  };
};

export const droneIsActive = (drone: PatrolDrone, activePlates: Set<string>): boolean =>
  !(drone.disabledBy || []).some((id) => activePlates.has(id));

export const laserIsActive = (laser: Laser, activePlates: Set<string>): boolean => {
  const startsOn = laser.startsOn !== false;
  const disabled = (laser.disabledBy || []).some((id) => activePlates.has(id));
  return startsOn && !disabled;
};

export const movingLaserRectAt = (laser: MovingLaser, tick: number): Rect => {
  const offset = oscillatingOffsetAt(laser.distance, laser.period, laser.phase || 0, tick);
  return orientBeamRect(
    {
      x: laser.x + (laser.axis === "x" ? offset : 0),
      y: laser.y + (laser.axis === "y" ? offset : 0),
      w: laser.w,
      h: laser.h
    },
    movingLaserBeamAxis(laser)
  );
};

export const movingLaserBeamAxis = (laser: MovingLaser): "x" | "y" =>
  laser.beamAxis === "x" || laser.beamAxis === "y" ? laser.beamAxis : laser.axis === "x" ? "y" : "x";

const orientBeamRect = (rect: Rect, beamAxis: "x" | "y"): Rect => {
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const span = Math.max(rect.w, rect.h);
  const cross = Math.min(rect.w, rect.h);
  const w = beamAxis === "x" ? span : cross;
  const h = beamAxis === "x" ? cross : span;
  return {
    x: centerX - w / 2,
    y: centerY - h / 2,
    w,
    h
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

export const collectOpenDoors = (
  doors: Door[],
  activePlates: Set<string>,
  collectedCores: Set<string>,
  defeatedBossIds: ReadonlySet<string>
): Set<string> => {
  const open = new Set<string>();
  for (const door of doors) {
    const dependenciesSatisfied = (door.opensWith || []).every((id) => activePlates.has(id) || defeatedBossIds.has(id));
    const coreSatisfied = !door.requiresCore || collectedCores.has(door.requiresCore);
    const shouldOpen = dependenciesSatisfied && coreSatisfied;
    if (door.inverted ? !shouldOpen : shouldOpen) open.add(door.id);
  }
  return open;
};

const collectBlockedLasers = (lasers: Laser[], crates: Rect[], activePlates: Set<string>, tick: number): Set<string> => {
  const blocked = new Set<string>();
  for (const laser of lasers) {
    const startsOn = laser.startsOn !== false;
    const disabled = (laser.disabledBy || []).some((id) => activePlates.has(id));
    if (!startsOn || disabled) continue;
    const rect = "axis" in laser ? movingLaserRectAt(laser as MovingLaser, tick) : laser;
    if (crates.some((crate) => rectsOverlap(crate, rect))) {
      blocked.add(laser.id);
    }
  }
  return blocked;
};

export const doorRequiredCoreIds = (doors: Door[] = []): Set<string> => {
  const ids = new Set<string>();
  for (const door of doors) {
    if (door.requiresCore) ids.add(door.requiresCore);
  }
  return ids;
};

export const isMajorCore = (core: Core, requiredCoreIds: Set<string> = new Set()): boolean => core.size === "large" || requiredCoreIds.has(core.id);

const setChanged = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return true;
  for (const item of a) {
    if (!b.has(item)) return true;
  }
  return false;
};

export const isCoreVisible = (core: Core, collected: Set<string>): boolean => !collected.has(core.id);

export const isHazard = (hazard: Hazard): Hazard => hazard;
