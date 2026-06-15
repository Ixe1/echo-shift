import { rectsOverlap } from "./geometry";
import { oscillatingOffsetAt } from "./motion";
import { solidHasFullCollision } from "./solidCollision";
import type {
  ActorBody,
  CoreMagnetState,
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
  coreOffsets: Map<string, CoreMagnetState>;
  spilledCores: Map<string, SpilledCore>;
  blockedLasers: Set<string>;
  crates: Map<string, Rect>;
};

const CORE_MAGNET_RADIUS = 58;
const CORE_MAGNET_ACCEL = 0.24;
const CORE_MAGNET_HOME_ACCEL = 0.08;
const CORE_MAGNET_MAX_SPEED = 3.4;
const CORE_MAGNET_DRAG = 0.88;
const CORE_MAGNET_REST_EPSILON = 0.08;

type ObjectUpdateOptions = {
  collectCores?: boolean;
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
    coreOffsets: new Map(),
    spilledCores: new Map(),
    blockedLasers: new Set(),
    crates: new Map((level?.crates || []).map((crate) => [crate.id, { x: crate.x, y: crate.y, w: crate.w, h: crate.h }]))
  };
};

const offsetCoreRect = (core: Core, offset: Pick<CoreMagnetState, "x" | "y"> = { x: 0, y: 0 }): Core => ({
  ...core,
  x: core.x + offset.x,
  y: core.y + offset.y
});

const coreMagnetTarget = (core: Core, offset: Pick<CoreMagnetState, "x" | "y">, actor: ActorBody): { dx: number; dy: number; distance: number } => {
  const coreCenterX = core.x + offset.x + core.w / 2;
  const coreCenterY = core.y + offset.y + core.h / 2;
  const actorCenterX = actor.x + actor.w / 2;
  const actorCenterY = actor.y + actor.h / 2;
  const dx = actorCenterX - coreCenterX;
  const dy = actorCenterY - coreCenterY;
  return { dx, dy, distance: Math.hypot(dx, dy) };
};

const pointInsideRect = (point: { x: number; y: number }, rect: Rect): boolean =>
  point.x > rect.x && point.x < rect.x + rect.w && point.y > rect.y && point.y < rect.y + rect.h;

const segmentsIntersect = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean => {
  const cross = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y);
  const c1 = cross(a, b, c);
  const c2 = cross(a, b, d);
  const c3 = cross(c, d, a);
  const c4 = cross(c, d, b);
  if (c1 === 0 && onSegment(a, c, b)) return true;
  if (c2 === 0 && onSegment(a, d, b)) return true;
  if (c3 === 0 && onSegment(c, a, d)) return true;
  if (c4 === 0 && onSegment(c, b, d)) return true;
  return (c1 > 0) !== (c2 > 0) && (c3 > 0) !== (c4 > 0);
};

const segmentIntersectsRect = (from: { x: number; y: number }, to: { x: number; y: number }, rect: Rect): boolean => {
  if (pointInsideRect(from, rect) || pointInsideRect(to, rect)) return true;
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  return (
    segmentsIntersect(from, to, { x: left, y: top }, { x: right, y: top }) ||
    segmentsIntersect(from, to, { x: right, y: top }, { x: right, y: bottom }) ||
    segmentsIntersect(from, to, { x: right, y: bottom }, { x: left, y: bottom }) ||
    segmentsIntersect(from, to, { x: left, y: bottom }, { x: left, y: top })
  );
};

const coreCenter = (core: Core, offset: Pick<CoreMagnetState, "x" | "y"> = { x: 0, y: 0 }): { x: number; y: number } => ({
  x: core.x + offset.x + core.w / 2,
  y: core.y + offset.y + core.h / 2
});

const actorCenter = (actor: ActorBody): { x: number; y: number } => ({
  x: actor.x + actor.w / 2,
  y: actor.y + actor.h / 2
});

const coreMagnetBlocked = (
  core: Core,
  fromOffset: Pick<CoreMagnetState, "x" | "y">,
  toOffset: Pick<CoreMagnetState, "x" | "y">,
  actor: ActorBody,
  blockers: Rect[]
): boolean => {
  const currentCenter = coreCenter(core, fromOffset);
  const nextCenter = coreCenter(core, toOffset);
  const targetCenter = actorCenter(actor);
  const nextRect = offsetCoreRect(core, toOffset);
  return blockers.some(
    (blocker) =>
      rectsOverlap(nextRect, blocker) ||
      segmentIntersectsRect(currentCenter, nextCenter, blocker) ||
      segmentIntersectsRect(currentCenter, targetCenter, blocker)
  );
};

const clampCoreMagnetVelocity = (state: CoreMagnetState): void => {
  const speed = Math.hypot(state.vx, state.vy);
  if (speed <= CORE_MAGNET_MAX_SPEED || speed === 0) return;
  const scale = CORE_MAGNET_MAX_SPEED / speed;
  state.vx *= scale;
  state.vy *= scale;
};

const advanceCoreMagnetState = (
  core: Core,
  previous: CoreMagnetState | undefined,
  attractor: ActorBody | undefined,
  blockers: Rect[]
): CoreMagnetState | null => {
  const next: CoreMagnetState = previous ? { ...previous } : { x: 0, y: 0, vx: 0, vy: 0 };
  if (attractor?.alive) {
    const target = coreMagnetTarget(core, next, attractor);
    if (target.distance > 0 && target.distance <= CORE_MAGNET_RADIUS && !coreMagnetBlocked(core, next, next, attractor, blockers)) {
      const pull = CORE_MAGNET_ACCEL * (1 - target.distance / CORE_MAGNET_RADIUS + 0.35);
      next.vx += (target.dx / target.distance) * pull;
      next.vy += (target.dy / target.distance) * pull;
    } else {
      next.vx += -next.x * CORE_MAGNET_HOME_ACCEL;
      next.vy += -next.y * CORE_MAGNET_HOME_ACCEL;
    }
  } else {
    next.vx += -next.x * CORE_MAGNET_HOME_ACCEL;
    next.vy += -next.y * CORE_MAGNET_HOME_ACCEL;
  }
  next.vx *= CORE_MAGNET_DRAG;
  next.vy *= CORE_MAGNET_DRAG;
  clampCoreMagnetVelocity(next);
  const beforeMove = { x: next.x, y: next.y };
  next.x += next.vx;
  next.y += next.vy;
  if (attractor?.alive && coreMagnetBlocked(core, beforeMove, next, attractor, blockers)) {
    return previous ? { ...previous, vx: 0, vy: 0 } : null;
  }
  if (
    Math.abs(next.x) < CORE_MAGNET_REST_EPSILON &&
    Math.abs(next.y) < CORE_MAGNET_REST_EPSILON &&
    Math.abs(next.vx) < CORE_MAGNET_REST_EPSILON &&
    Math.abs(next.vy) < CORE_MAGNET_REST_EPSILON
  ) {
    return null;
  }
  return next;
};

export const updateObjects = (
  level: Level,
  actors: ActorBody[],
  previous: ObjectState,
  tick = 0,
  defeatedBossIds: ReadonlySet<string> = new Set(),
  options: ObjectUpdateOptions = {}
): { state: ObjectState; switched: boolean; core: CorePickupEvent | null; cores: CorePickupEvent[] } => {
  const collectCores = options.collectCores !== false;
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
  const coreOffsets = new Map<string, CoreMagnetState>();
  const spilledCores = new Map([...previous.spilledCores.entries()].map(([id, core]) => [id, { ...core }]));
  const cores: CorePickupEvent[] = [];
  const playerActor = actors.find((actor) => actor.kind === "player" && actor.alive);
  if (collectCores) {
    const magnetBlockers: Rect[] = [
      ...level.solids.filter(solidHasFullCollision),
      ...closedDoorRects(level, previous.openDoors),
      ...crateRects
    ];
    for (const item of level.cores || []) {
      if (claimedCores.has(item.id)) continue;
      const previousOffset = previous.coreOffsets.get(item.id);
      const wasCollected = Boolean(playerActor && rectsOverlap(playerActor, offsetCoreRect(item, previousOffset)));
      const nextOffset = wasCollected ? null : advanceCoreMagnetState(item, previousOffset, playerActor, magnetBlockers);
      const collected = wasCollected || Boolean(playerActor && rectsOverlap(playerActor, offsetCoreRect(item, nextOffset || undefined)));
      if (collected && playerActor) {
        claimedCores.add(item.id);
        collectedCores.add(item.id);
        cores.push({
          id: item.id,
          x: playerActor.x + playerActor.w / 2,
          y: playerActor.y + playerActor.h / 2
        });
        continue;
      }
      if (nextOffset) coreOffsets.set(item.id, nextOffset);
    }
    for (const [id, looseCore] of spilledCores) {
      if (looseCore.pickupDelayFrames > 0) continue;
      if (!playerActor || !rectsOverlap(playerActor, looseCore)) continue;
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
  } else {
    for (const [id, offset] of previous.coreOffsets) coreOffsets.set(id, { ...offset });
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
      coreOffsets,
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
