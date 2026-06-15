import { clamp, rectsOverlap } from "./geometry";
import { oscillatingOffsetAt } from "./motion";
import { solidHasFullCollision, solidHasTopOnlyCollision } from "./solidCollision";
import type { ActorBody, Conveyor, InputFrame, MovingPlatform, OneWayPlatform, Rect, Solid } from "./types";

const PLAYER_WIDTH = 24;
const PLAYER_HEIGHT = 34;
const MAX_SPEED = 205;
const GROUND_ACCEL = 50;
const AIR_ACCEL = 32;
const FRICTION = 0.77;
const GRAVITY = 0.72;
const MAX_FALL = 13.5;
const JUMP_SPEED = -12.3;
const COYOTE_FRAMES = 7;
const JUMP_BUFFER_FRAMES = 7;
const LEDGE_FORGIVENESS_VERTICAL = 10;
const LEDGE_FORGIVENESS_HORIZONTAL = 8;
const LAUNCH_CONTROL_ACCEL_SCALE = 0.35;
const LAUNCH_FLOAT_GRAVITY_SCALE = 0.92;
const LAUNCH_FLOAT_MAX_FALL_SCALE = 0.88;

export const makeActor = (
  id: string,
  kind: ActorBody["kind"],
  start: { x: number; y: number }
): ActorBody => ({
  id,
  kind,
  x: start.x,
  y: start.y,
  w: PLAYER_WIDTH,
  h: PLAYER_HEIGHT,
  vx: 0,
  vy: 0,
  onGround: false,
  coyote: 0,
  jumpBuffer: 0,
  launchCooldown: 0,
  launchControlLock: 0,
  launchFloatFrames: 0,
  prevJump: false,
  facing: 1,
  standingOn: null,
  alive: true
});

export const actorFoot = (actor: ActorBody): Rect => ({
  x: actor.x + 2,
  y: actor.y + actor.h - 2,
  w: actor.w - 4,
  h: 5
});

export type PlatformFrame = {
  platform: MovingPlatform;
  current: Rect;
  previous: Rect;
};

export type DynamicCollisionState = {
  oneWays?: OneWayPlatform[];
  conveyors?: Conveyor[];
  crates?: Map<string, Rect>;
  actorBlockers?: Rect[];
  ice?: Rect[];
};

type CollisionRect = Rect & {
  platformId?: string;
  oneWay?: boolean;
  conveyor?: Conveyor;
  crateId?: string;
};

export type MoveResult = {
  jumped: boolean;
  landed: boolean;
};

export const platformRectAt = (platform: MovingPlatform, tick: number): Rect => {
  const offset = oscillatingOffsetAt(platform.distance, platform.period, platform.phase || 0, tick);
  return {
    x: platform.x + (platform.axis === "x" ? offset : 0),
    y: platform.y + (platform.axis === "y" ? offset : 0),
    w: platform.w,
    h: platform.h
  };
};

export const platformFramesAt = (
  platforms: MovingPlatform[] | undefined,
  tick: number
): PlatformFrame[] =>
  (platforms || []).map((platform) => ({
    platform,
    current: platformRectAt(platform, tick),
    previous: platformRectAt(platform, Math.max(0, tick - 1))
  }));

export const moveActor = (
  actor: ActorBody,
  input: InputFrame,
  solids: Solid[],
  doors: Rect[],
  platforms: PlatformFrame[],
  bounds: Rect,
  dynamic: DynamicCollisionState = {}
): MoveResult => {
  const wasGrounded = actor.onGround;
  const platformFrame = actor.standingOn
    ? platforms.find((item) => item.platform.id === actor.standingOn)
    : undefined;

  if (platformFrame && actor.onGround) {
    actor.x += platformFrame.current.x - platformFrame.previous.x;
    actor.y += platformFrame.current.y - platformFrame.previous.y;
  }

  const launchControlLocked = actor.launchControlLock > 0;
  if (actor.launchControlLock > 0) actor.launchControlLock -= 1;
  const launchFloatActive = actor.launchFloatFrames > 0;
  if (actor.launchFloatFrames > 0) actor.launchFloatFrames -= 1;

  const slipperyGround = actor.onGround && (dynamic.ice || []).some((ice) => rectsOverlap(actorFoot(actor), ice));
  const launchAccelScale = launchControlLocked && !actor.onGround ? LAUNCH_CONTROL_ACCEL_SCALE : 1;
  const groundAccelScale = slipperyGround ? 0.28 : 1;
  const accel = (actor.onGround ? GROUND_ACCEL * groundAccelScale : AIR_ACCEL) * launchAccelScale;
  if (input.left && !input.right) {
    actor.vx -= accel;
    actor.facing = -1;
  } else if (input.right && !input.left) {
    actor.vx += accel;
    actor.facing = 1;
  } else if (actor.onGround) {
    actor.vx *= slipperyGround ? 0.985 : FRICTION;
  }

  actor.vx = clamp(actor.vx, -MAX_SPEED / 60, MAX_SPEED / 60);
  const jumpPressed = input.jump && !actor.prevJump;
  actor.prevJump = input.jump;

  if (actor.onGround) actor.coyote = COYOTE_FRAMES;
  else actor.coyote = Math.max(0, actor.coyote - 1);

  if (jumpPressed) actor.jumpBuffer = JUMP_BUFFER_FRAMES;
  else actor.jumpBuffer = Math.max(0, actor.jumpBuffer - 1);

  let jumped = false;
  if (actor.jumpBuffer > 0 && actor.coyote > 0) {
    actor.vy = JUMP_SPEED;
    actor.onGround = false;
    actor.coyote = 0;
    actor.jumpBuffer = 0;
    actor.standingOn = null;
    jumped = true;
  }

  if (!launchControlLocked && !input.jump && actor.vy < -4.6) {
    actor.vy *= 0.82;
  }

  const gravity = launchFloatActive ? GRAVITY * LAUNCH_FLOAT_GRAVITY_SCALE : GRAVITY;
  const maxFall = launchFloatActive ? MAX_FALL * LAUNCH_FLOAT_MAX_FALL_SCALE : MAX_FALL;
  actor.vy = clamp(actor.vy + gravity, -30, maxFall);
  actor.onGround = false;
  actor.standingOn = null;

  const fullSolidRects = solids.filter(solidHasFullCollision);
  const collisionRects: CollisionRect[] = [
    ...fullSolidRects,
    ...doors,
    ...(dynamic.conveyors || []).map((conveyor) => ({ ...conveyor, conveyor }))
  ];
  const oneWayRects: CollisionRect[] = [
    ...solids.filter(solidHasTopOnlyCollision).map((solid) => ({ ...solid, oneWay: true })),
    ...(dynamic.oneWays || []).map((oneWay) => ({ ...oneWay, oneWay: true })),
    ...platforms.map((platform) => ({
      ...platform.current,
      oneWay: true,
      platformId: platform.platform.id
    }))
  ];
  const ledgeRects: CollisionRect[] = [...fullSolidRects, ...oneWayRects];
  const platformCrateBlockers: Rect[] = platforms.map((platform) => ({ ...platform.current }));
  const crateRects = crateCollisionRects(dynamic.crates);
  const attemptedVx = actor.vx;

  actor.x += actor.vx;
  resolveAxis(
    actor,
    [...collisionRects, ...crateRects],
    "x",
    bounds,
    dynamic.crates,
    actor.y,
    dynamic.actorBlockers,
    platformCrateBlockers
  );

  const previousY = actor.y;
  actor.y += actor.vy;
  resolveAxis(actor, [...collisionRects, ...oneWayRects, ...crateRects], "y", bounds, dynamic.crates, previousY, dynamic.actorBlockers);
  if (!actor.onGround && Math.abs(attemptedVx) >= 0.05 && actor.vy > 0) {
    tryApplyLedgeForgiveness(
      actor,
      ledgeRects,
      [...collisionRects, ...crateRects, ...(dynamic.actorBlockers || [])],
      bounds,
      previousY,
      attemptedVx
    );
  }

  applyConveyor(
    actor,
    dynamic.conveyors || [],
    [...collisionRects, ...crateRects],
    bounds,
    dynamic.crates,
    dynamic.actorBlockers,
    platformCrateBlockers
  );

  actor.x = clamp(actor.x, bounds.x, bounds.x + bounds.w - actor.w);
  if (actor.y + actor.h > bounds.y + bounds.h) {
    actor.alive = false;
  }

  const landed = !wasGrounded && actor.onGround;
  return { jumped, landed };
};

const resolveAxis = (
  actor: ActorBody,
  solids: CollisionRect[],
  axis: "x" | "y",
  bounds: Rect,
  crates?: Map<string, Rect>,
  previousY = actor.y,
  actorBlockers: Rect[] = [],
  crateBlockers: Rect[] = []
): void => {
  for (const solid of solids) {
    if (solid.oneWay && axis === "x") continue;
    if (solid.oneWay && (actor.vy <= 0 || previousY + actor.h > solid.y + 3)) continue;
    if (!rectsOverlap(actor, solid)) continue;
    if (axis === "x") {
      if (solid.crateId && crates && actor.vx !== 0) {
        pushCrate(solid.crateId, actor.vx, crates, solids, bounds, actorBlockers, crateBlockers);
        const crate = crates.get(solid.crateId);
        if (crate) {
          solid.x = crate.x;
          solid.y = crate.y;
          solid.w = crate.w;
          solid.h = crate.h;
        }
        if (!rectsOverlap(actor, solid)) continue;
      }
      if (actor.vx > 0) actor.x = solid.x - actor.w;
      else if (actor.vx < 0) actor.x = solid.x + solid.w;
      actor.vx = 0;
    } else {
      if (actor.vy > 0) {
        actor.y = solid.y - actor.h;
        actor.vy = 0;
        actor.onGround = true;
        actor.launchFloatFrames = 0;
        actor.standingOn = "platformId" in solid && solid.platformId ? solid.platformId : null;
      } else if (actor.vy < 0) {
        actor.y = solid.y + solid.h;
        actor.vy = 0;
      }
    }
  }
};

const tryApplyLedgeForgiveness = (
  actor: ActorBody,
  supports: CollisionRect[],
  blockers: Rect[],
  bounds: Rect,
  previousY: number,
  attemptedVx: number
): void => {
  if (Math.abs(attemptedVx) < 0.05) return;
  if (actor.vy <= 0) return;
  const previousBottom = previousY + actor.h;
  const currentBottom = actor.y + actor.h;

  for (const support of supports) {
    if (currentBottom < support.y - 3 || currentBottom > support.y + LEDGE_FORGIVENESS_VERTICAL) continue;
    if (previousBottom > support.y + LEDGE_FORGIVENESS_VERTICAL) continue;

    let snapX: number | null = null;
    if (attemptedVx > 0) {
      const edge = support.x;
      const actorRight = actor.x + actor.w;
      if (actorRight < edge - 0.5 || actorRight > edge + LEDGE_FORGIVENESS_HORIZONTAL) continue;
      snapX = edge - actor.w + LEDGE_FORGIVENESS_HORIZONTAL;
    } else {
      const edge = support.x + support.w;
      if (actor.x > edge + 0.5 || actor.x < edge - LEDGE_FORGIVENESS_HORIZONTAL) continue;
      snapX = edge - LEDGE_FORGIVENESS_HORIZONTAL;
    }

    const standingRect = {
      x: Math.max(bounds.x, Math.min(snapX, bounds.x + bounds.w - actor.w)),
      y: support.y - actor.h,
      w: actor.w,
      h: actor.h
    };
    if (blockers.some((blocker) => rectsOverlap(standingRect, blocker))) continue;

    actor.x = standingRect.x;
    actor.y = standingRect.y;
    actor.vy = 0;
    actor.onGround = true;
    actor.coyote = COYOTE_FRAMES;
    actor.launchFloatFrames = 0;
    actor.standingOn = "platformId" in support && support.platformId ? support.platformId : null;
    return;
  }
};

const crateCollisionRects = (crates?: Map<string, Rect>): CollisionRect[] =>
  [...(crates || new Map()).entries()].map(([id, rect]) => ({ ...rect, crateId: id }));

const pushCrate = (
  id: string,
  amount: number,
  crates: Map<string, Rect>,
  collisionRects: CollisionRect[],
  bounds: Rect,
  actorBlockers: Rect[] = [],
  crateBlockers: Rect[] = []
): void => {
  const crate = crates.get(id);
  if (!crate) return;
  const next = { ...crate, x: crate.x + amount };
  if (next.x < bounds.x || next.x + next.w > bounds.x + bounds.w) return;
  const blockers = collisionRects.filter((rect) => rect.crateId !== id && !rect.oneWay);
  blockers.push(...crateBlockers);
  blockers.push(...actorBlockers);
  if (blockers.some((blocker) => rectsOverlap(next, blocker))) return;
  crate.x = next.x;
};

const applyConveyor = (
  actor: ActorBody,
  conveyors: Conveyor[],
  collisionRects: CollisionRect[],
  bounds: Rect,
  crates?: Map<string, Rect>,
  actorBlockers: Rect[] = [],
  crateBlockers: Rect[] = []
): void => {
  if (!actor.onGround) return;
  const foot = actorFoot(actor);
  const conveyor = conveyors.find((item) => Math.abs(foot.y + foot.h - item.y) <= 7 && rectsOverlap(foot, item));
  if (!conveyor) return;
  const beltDelta = conveyor.direction * conveyor.speed;
  if (beltDelta === 0) return;
  const previousVx = actor.vx;
  actor.x += beltDelta;
  actor.vx = beltDelta;
  resolveAxis(actor, [...collisionRects, ...crateCollisionRects(crates)], "x", bounds, crates, actor.y, actorBlockers, crateBlockers);
  actor.vx = previousVx;
};
