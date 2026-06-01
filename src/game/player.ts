import { clamp, rectsOverlap } from "./geometry";
import type { ActorBody, InputFrame, MovingPlatform, Rect, Solid } from "./types";

const PLAYER_WIDTH = 24;
const PLAYER_HEIGHT = 34;
const MAX_SPEED = 205;
const GROUND_ACCEL = 50;
const AIR_ACCEL = 32;
const FRICTION = 0.77;
const GRAVITY = 0.82;
const MAX_FALL = 15;
const JUMP_SPEED = -12.9;
const COYOTE_FRAMES = 7;
const JUMP_BUFFER_FRAMES = 7;

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

export type MoveResult = {
  jumped: boolean;
  landed: boolean;
};

export const platformRectAt = (platform: MovingPlatform, tick: number): Rect => {
  const phase = platform.phase || 0;
  const wave = Math.sin(((tick / platform.period) * Math.PI * 2) + phase);
  const offset = wave * platform.distance;
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
  bounds: Rect
): MoveResult => {
  const wasGrounded = actor.onGround;
  const platformFrame = actor.standingOn
    ? platforms.find((item) => item.platform.id === actor.standingOn)
    : undefined;

  if (platformFrame && actor.onGround) {
    actor.x += platformFrame.current.x - platformFrame.previous.x;
    actor.y += platformFrame.current.y - platformFrame.previous.y;
  }

  const accel = actor.onGround ? GROUND_ACCEL : AIR_ACCEL;
  if (input.left && !input.right) {
    actor.vx -= accel;
    actor.facing = -1;
  } else if (input.right && !input.left) {
    actor.vx += accel;
    actor.facing = 1;
  } else if (actor.onGround) {
    actor.vx *= FRICTION;
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

  if (!input.jump && actor.vy < -4.6) {
    actor.vy *= 0.78;
  }

  actor.vy = clamp(actor.vy + GRAVITY, -30, MAX_FALL);
  actor.onGround = false;
  actor.standingOn = null;

  const collisionRects: Array<Rect & { platformId?: string }> = [
    ...solids,
    ...doors,
    ...platforms.map((platform) => ({ ...platform.current, platformId: platform.platform.id }))
  ];

  actor.x += actor.vx;
  resolveAxis(actor, collisionRects, "x");

  actor.y += actor.vy;
  resolveAxis(actor, collisionRects, "y");

  actor.x = clamp(actor.x, bounds.x, bounds.x + bounds.w - actor.w);
  if (actor.y > bounds.y + bounds.h + 120) {
    actor.alive = false;
  }

  const landed = !wasGrounded && actor.onGround;
  return { jumped, landed };
};

const resolveAxis = (
  actor: ActorBody,
  solids: Array<Solid | (Rect & { platformId?: string })>,
  axis: "x" | "y",
): void => {
  for (const solid of solids) {
    if (!rectsOverlap(actor, solid)) continue;
    if (axis === "x") {
      if (actor.vx > 0) actor.x = solid.x - actor.w;
      else if (actor.vx < 0) actor.x = solid.x + solid.w;
      actor.vx = 0;
    } else {
      if (actor.vy > 0) {
        actor.y = solid.y - actor.h;
        actor.vy = 0;
        actor.onGround = true;
        actor.standingOn = "platformId" in solid && solid.platformId ? solid.platformId : null;
      } else if (actor.vy < 0) {
        actor.y = solid.y + solid.h;
        actor.vy = 0;
      }
    }
  }
};
