import { createServer } from "vite";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const frame = (floorY = 120) => [
  { id: "floor", x: 0, y: floorY, w: 320, h: 40 },
  { id: "left-wall", x: -20, y: 0, w: 20, h: 180 },
  { id: "right-wall", x: 320, y: 0, w: 20, h: 180 }
];

const baseLevel = {
  id: "test-room",
  index: 0,
  name: "Test Room",
  subtitle: "Simulation",
  start: { x: 20, y: 86 },
  exit: { x: 280, y: 82, w: 28, h: 38 },
  bounds: { x: 0, y: 0, w: 320, h: 180 },
  solids: frame(),
  score: {
    lives: 3,
    coreScore: 100,
    deathPenalty: 500,
    timeBonusTargetSeconds: 10,
    timeBonusPerSecond: 100
  },
  hint: "test"
};

const right = { left: false, right: true, jump: false };
const left = { left: true, right: false, jump: false };
const idle = { left: false, right: false, jump: false };
const jump = { left: false, right: false, jump: true };
const jumpRight = { left: false, right: true, jump: true };
const jumpLeft = { left: true, right: false, jump: true };
const routeInputs = { idle, right, left, jump, jumpRight, jumpLeft };
const CLOSED_GATE_MAX_TOP = 220;

const runFrames = (simulation, frames, input) => {
  for (let i = 0; i < frames; i += 1) {
    simulation.step(input);
  }
};

const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const solidSupportsGameplay = (solid) => solid.collision !== "decorative";
const solidIsGroundFloorSegment = (solid) =>
  solidSupportsGameplay(solid) &&
  solid.collision !== "top-only" &&
  (solid.id === "floor" ||
    solid.id.startsWith("floor-") ||
    ((solid.id.startsWith("floorpiece-") || solid.sprite === "floor") && solid.y >= 430));
const solidIsRouteFloorLike = (solid) => solidIsGroundFloorSegment(solid) || solid.collision === "top-only" || solid.sprite === "floor";
const solidIsRouteSurfaceSegment = (solid) =>
  solidSupportsGameplay(solid) && solid.sprite === "floor" && solid.w >= 60 && solid.collision !== "decorative";

const oscillatingRectAt = (item, tick) => {
  const phase = item.phase || 0;
  const travel = Number.isFinite(item.distance) ? Math.max(0, item.distance) : 0;
  const cycle = Number.isFinite(item.period) ? Math.max(1, item.period) : 1;
  const offset = ((1 - Math.cos(((tick / cycle) * Math.PI * 2) + phase)) / 2) * travel;
  return {
    x: item.x + (item.axis === "x" ? offset : 0),
    y: item.y + (item.axis === "y" ? offset : 0),
    w: item.w,
    h: item.h
  };
};

const routeObstacleRects = (simulation) => {
  const actor = simulation.player;
  const footY = actor.y + actor.h;
  const activeLasers = (simulation.level.lasers || []).filter((laser) => {
    const startsOn = laser.startsOn !== false;
    const disabled = (laser.disabledBy || []).some((id) => simulation.objectState.activePlates.has(id));
    return (
      startsOn &&
      !disabled &&
      !simulation.objectState.blockedLasers.has(laser.id) &&
      laser.y < footY &&
      laser.y + laser.h > actor.y + 2
    );
  });
  const activeMovingLasers = (simulation.level.movingLasers || [])
    .filter((laser) => {
      const startsOn = laser.startsOn !== false;
      const disabled = (laser.disabledBy || []).some((id) => simulation.objectState.activePlates.has(id));
      return startsOn && !disabled && !simulation.objectState.blockedLasers.has(laser.id);
    })
    .map((laser) => oscillatingRectAt(laser, simulation.tick))
    .filter((laser) => laser.y < footY && laser.y + laser.h > actor.y + 2);
  const activeHazards = (simulation.level.hazards || []).filter(
    (hazard) => hazard.y < footY && hazard.y + hazard.h > actor.y + 2
  );
  const activeDrones = (simulation.level.drones || [])
    .filter((drone) => !(drone.disabledBy || []).some((id) => simulation.objectState.activePlates.has(id)))
    .map((drone) => oscillatingRectAt(drone, simulation.tick))
    .filter((drone) => drone.y < footY && drone.y + drone.h > actor.y + 2);
  const lowSolids = simulation.level.solids.filter(
    (solid) =>
      solidSupportsGameplay(solid) &&
      !solidIsRouteFloorLike(solid) &&
      !["left-wall", "right-wall"].includes(solid.id) &&
      solid.h <= 58 &&
      solid.y < footY &&
      solid.y + solid.h > actor.y + 10
  );
  return [...activeHazards, ...activeLasers, ...activeMovingLasers, ...activeDrones, ...lowSolids];
};

const supportRects = (simulation) => [
  ...simulation.level.solids.filter(solidSupportsGameplay),
  ...(simulation.level.oneWays || []),
  ...(simulation.level.conveyors || []),
  ...(simulation.level.platforms || []).map((platform) => oscillatingRectAt(platform, simulation.tick)),
  ...simulation.objectState.crates.values()
];

const hasSupportAhead = (simulation) => {
  const actor = simulation.player;
  const probe = {
    x: actor.x + actor.w,
    y: actor.y + actor.h + 3,
    w: 12,
    h: 10
  };
  return supportRects(simulation).some((support) => rectsOverlap(probe, support));
};

const shouldSmartJump = (simulation) => {
  const actor = simulation.player;
  if (!actor.onGround) return false;
  const aheadMin = actor.x + actor.w;
  const aheadMax = actor.x + actor.w + 18;
  const obstacleAhead = routeObstacleRects(simulation).some(
    (rect) => rect.x <= aheadMax && rect.x + rect.w >= aheadMin
  );
  return obstacleAhead || !hasSupportAhead(simulation);
};

const runSmartRight = (simulation, maxFrames, options = {}) => {
  let jumpFrames = 0;
  for (let i = 0; i < maxFrames; i += 1) {
    if (jumpFrames <= 0 && shouldSmartJump(simulation)) jumpFrames = 24;
    simulation.step({ left: false, right: true, jump: jumpFrames > 0 });
    jumpFrames -= 1;
    if (options.untilWin && simulation.won) return;
    if (typeof options.untilX === "number" && simulation.player.x >= options.untilX) return;
  }
};

const runRoute = (simulation, route) => {
  for (const step of route) {
    if (step[0] === "rewind") {
      assert(simulation.rewindToEcho(), `Expected ${simulation.level.name} route rewind to create an echo`);
      continue;
    }
    if (step[0] === "smartRight") {
      runSmartRight(simulation, step[1], { untilWin: true });
      continue;
    }
    if (step[0] === "smartRightUntilX") {
      runSmartRight(simulation, step[2], { untilX: step[1] });
      assert(
        simulation.player.x >= step[1],
        `Expected ${simulation.level.name} route to reach x=${step[1]}, got ${simulation.player.x.toFixed(1)}`
      );
      continue;
    }

    const [action, frames] = step;
    const input = routeInputs[action];
    assert(input, `Unknown route action: ${action}`);
    runFrames(simulation, frames, input);
  }
};

const settlePromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const restoreGlobal = (key, value) => {
  if (value === undefined) delete globalThis[key];
  else Object.defineProperty(globalThis, key, { configurable: true, value });
};

const verifyAudioUnlockRetry = async (SynthAudio, soundtracks) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousAudio = globalThis.Audio;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const listeners = new Map();
  const mediaElements = [];
  const startedTones = [];
  const pendingResumes = [];
  const pendingBlockedRejects = [];
  let disconnectedNodes = 0;
  let deferBlockedRejects = false;
  let mediaUnlocked = false;

  const fakeParam = () => ({
    value: 0,
    setValueAtTime(value) {
      this.value = value;
    },
    exponentialRampToValueAtTime(value) {
      this.value = value;
    }
  });
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.state = "suspended";
    }

    resume() {
      this.state = "running";
      return new Promise((resolve) => pendingResumes.push(resolve));
    }

    createGain() {
      return { gain: fakeParam(), connect() {}, disconnect() { disconnectedNodes += 1; } };
    }

    createOscillator() {
      const oscillator = {
        type: "sine",
        frequency: fakeParam(),
        connect() {},
        disconnect() {
          disconnectedNodes += 1;
        },
        start() {
          startedTones.push(oscillator);
        },
        stop() {}
      };
      return oscillator;
    }

    createBiquadFilter() {
      return { type: "lowpass", frequency: fakeParam(), connect() {}, disconnect() { disconnectedNodes += 1; } };
    }
  }
  class FakeAudioElement {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
      this.loop = false;
      this.preload = "";
      this.volume = 1;
      this.playCalls = 0;
      this.playing = false;
      mediaElements.push(this);
    }

    load() {}

    play() {
      this.playCalls += 1;
      if (!mediaUnlocked) {
        if (deferBlockedRejects) {
          return new Promise((_, reject) => pendingBlockedRejects.push(reject));
        }
        return Promise.reject(new Error("blocked by autoplay policy"));
      }
      this.playing = true;
      return Promise.resolve();
    }

    pause() {
      this.playing = false;
    }
  }
  const fakeWindow = {
    AudioContext: FakeAudioContext,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      listeners.set(
        type,
        handlers.filter((candidate) => candidate !== handler)
      );
    }
  };
  const dispatchUnlock = (type) => {
    mediaUnlocked = true;
    for (const handler of listeners.get(type) || []) {
      handler({ type, key: "Enter" });
    }
  };
  const resolveResumes = () => {
    for (const resolve of pendingResumes.splice(0)) resolve();
  };
  const rejectBlockedPlays = () => {
    for (const reject of pendingBlockedRejects.splice(0)) reject(new Error("blocked by autoplay policy"));
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { dataset: {} } } });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudioElement });
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: () => 0 });

  try {
    const audio = new SynthAudio();
    audio.playMusic("menu");
    await settlePromises();
    const menu = mediaElements.find((element) => element.src.includes("Main Menu"));
    assert(menu?.playCalls === 1, `Expected initial blocked menu play attempt, got ${menu?.playCalls}`);
    assert(document.documentElement.dataset.echoShiftAudioState === "blocked", "Expected blocked music state before input unlock");

    dispatchUnlock("keydown");
    await settlePromises();
    assert(menu.playCalls >= 2 && menu.playing, "Expected keydown unlock to retry and start menu music");
    assert(document.documentElement.dataset.echoShiftAudioState === "playing", "Expected playing music state after input unlock");
    resolveResumes();
    await settlePromises();
    assert(
      document.documentElement.dataset.echoShiftAudioState === "playing",
      "Expected later AudioContext resume resolution not to downgrade playing music state"
    );

    deferBlockedRejects = true;
    mediaUnlocked = false;
    audio.playMusic("menu");
    await settlePromises();
    mediaUnlocked = true;
    audio.playMusic("menu");
    await settlePromises();
    assert(document.documentElement.dataset.echoShiftAudioState === "playing", "Expected later retry to keep menu music playing");
    rejectBlockedPlays();
    await settlePromises();
    assert(
      document.documentElement.dataset.echoShiftAudioState === "playing",
      "Expected stale blocked media promise not to downgrade playing music state"
    );
    deferBlockedRejects = false;

    const elementsBeforeSfx = mediaElements.length;
    audio.play("jump");
    await settlePromises();
    const jumpEffect = mediaElements.find((element) => element.src.includes("player_jump"));
    assert(jumpEffect?.playing, "Expected sampled jump SFX to play after audio unlock");
    audio.play("core");
    audio.play("core");
    await settlePromises();
    const overlappingCoreEffects = mediaElements.filter((element) => element.src.includes("core_pickup"));
    assert(overlappingCoreEffects.length >= 2, "Expected repeated core SFX calls to create overlapping media elements");
    assert(mediaElements.length >= elementsBeforeSfx + 3, "Expected sampled SFX playback to allocate independent media elements");

    audio.play("land");
    await settlePromises();
    assert(startedTones.length >= 1, "Expected synth fallback SFX tone to start after audio context unlock");
    startedTones[0].onended?.();
    assert(disconnectedNodes >= 3, `Expected SFX nodes to disconnect after ending, got ${disconnectedNodes}`);

    const elementsBeforeUnlock = mediaElements.length;
    audio.unlock();
    assert(
      mediaElements.length === elementsBeforeUnlock,
      `Expected unlock to avoid preloading every soundtrack, got ${mediaElements.length} elements before level music`
    );

    audio.playMusic("level-1");
    await settlePromises();
    const levelOne = mediaElements.find((element) => element.src.includes("Level 1"));
    assert(levelOne?.playing, "Expected level music to play after the session audio gate");
    levelOne.currentTime = 17.25;
    audio.playMusic("level-1", { restart: true });
    await settlePromises();
    assert(levelOne.currentTime === 0, `Expected retry/replay music restart to seek level track to 0, got ${levelOne.currentTime}`);
    assert(levelOne.playCalls >= 2, `Expected restarted level music to play again, got ${levelOne.playCalls} calls`);
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("document", previousDocument);
    restoreGlobal("Audio", previousAudio);
    restoreGlobal("requestAnimationFrame", previousRequestAnimationFrame);
  }
};

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "silent"
});

try {
  const { RoomSimulation } = await server.ssrLoadModule("/src/game/state.ts");
  const { makeActor } = await server.ssrLoadModule("/src/game/player.ts");
  const { levels } = await server.ssrLoadModule("/src/data/levels.ts");
  const { tutorialLevel } = await server.ssrLoadModule("/src/data/tutorialLevel.ts");
  const { doorRequiredCoreIds, isMajorCore, movingLaserRectAt } = await server.ssrLoadModule("/src/game/objects.ts");
  const { EDITOR_DRAFT_STORAGE_KEY, readEditorDraftSnapshot } = await server.ssrLoadModule("/src/data/editorDraft.ts");
  const { getBestScores, isBetterLevelScore, recordLevelScore } = await server.ssrLoadModule("/src/game/progress.ts");
  const { soundtrackForLevel, soundtracks } = await server.ssrLoadModule("/src/game/soundtracks.ts");
  const { backgroundForLevel, levelBackgrounds } = await server.ssrLoadModule("/src/game/backgrounds.ts");
  const { backgroundAmbienceForLevel, backgroundAmbienceIsActive } = await server.ssrLoadModule("/src/game/backgroundAmbience.ts");
  const { terrainMaterialForSolid } = await server.ssrLoadModule("/src/game/terrainMaterials.ts");
  const { SynthAudio } = await server.ssrLoadModule("/src/game/audio.ts");

  assert(levels.length === 5, `Expected 5 handcrafted levels, found ${levels.length}`);
  assert(levels.some((level) => (level.plates || []).length > 0), "Expected at least one pressure-plate level");
  assert(levels.some((level) => (level.doors || []).length > 0), "Expected at least one door level");
  assert(levels.some((level) => (level.lasers || []).length > 0), "Expected at least one laser level");
  assert(levels.some((level) => (level.platforms || []).length > 0), "Expected at least one moving-platform level");
  assert(levels.some((level) => (level.drones || []).length > 0), "Expected at least one patrol-drone level");
  assert(levels.some((level) => (level.cores || []).length > 0), "Expected at least one core level");
  assert(levels.every((level) => level.motionModel === "anchored"), "Expected canonical source levels to be marked with anchored motion model");
  assert(
    levels.every(
      (level) =>
        level.score?.lives === 3 &&
        level.score.coreScore === 100 &&
        level.score.deathPenalty === 500 &&
        level.score.timeBonusPerSecond === 100 &&
        Number.isInteger(level.score.timeBonusTargetSeconds) &&
        level.score.timeBonusTargetSeconds > 0
    ),
    "Expected every handcrafted level to use score/time/lives settings"
  );
  assert(
    levels.every((level) => level.bounds.w >= 2400 && level.exit.x > 2200),
    "Expected every level to use expanded side-scrolling bounds and a distant exit"
  );
  const requiredCoreIds = new Set(levels.flatMap((level) => (level.doors || []).flatMap((door) => (door.requiresCore ? [door.requiresCore] : []))));
  const requiredCores = levels.flatMap((level) => (level.cores || []).filter((core) => requiredCoreIds.has(core.id)));
  assert(requiredCores.length > 0, "Expected handcrafted levels to contain door-required cores");
  assert(requiredCores.every((core) => core.size === "large"), `Expected door-required cores to use large visuals: ${JSON.stringify(requiredCores)}`);
  const draftRequiredCoreIds = doorRequiredCoreIds([{ id: "draft-door", x: 0, y: 0, w: 10, h: 10, requiresCore: "draft-core" }]);
  assert(isMajorCore({ id: "draft-core", x: 0, y: 0, w: 10, h: 10 }, draftRequiredCoreIds), "Door-required draft cores should use major visuals");
  assert(!isMajorCore({ id: "loose-core", x: 0, y: 0, w: 10, h: 10 }, draftRequiredCoreIds), "Unlinked draft cores should stay small by default");
  assert(Boolean(soundtracks.menu), "Expected a main menu soundtrack");
  assert(Boolean(levelBackgrounds["time-lab-prototype"]), "Expected prototype level background");
  assert(Boolean(levelBackgrounds["level-1-time-lab-no-portals"]), "Expected Level 1 no-portal background");
  assert(Boolean(levelBackgrounds["level-1-springtide-glassgrove"]), "Expected Springtide Glassgrove level background");
  assert(Boolean(levelBackgrounds["level-3-cryo-conservatory"]), "Expected Cryo Conservatory level background");
  assert(Boolean(levelBackgrounds["level-4-timber-archive"]), "Expected Timber Archive level background");
  assert(Boolean(levelBackgrounds["level-5-sunken-clockwork"]), "Expected Sunken Clockwork level background");
  assert(backgroundForLevel(levels[0], 0).key === "level-1-springtide-glassgrove", "Expected Level 1 to use Springtide Glassgrove background");
  assert(backgroundForLevel(levels[2], 2).key === "level-3-cryo-conservatory", "Expected Level 3 to use Cryo Conservatory background");
  assert(backgroundForLevel(levels[3], 3).key === "level-4-timber-archive", "Expected Level 4 to use Timber Archive background");
  assert(backgroundForLevel(levels[4], 4).key === "level-5-sunken-clockwork", "Expected Level 5 to use Sunken Clockwork background");
  assert(
    backgroundForLevel({ ...levels[1], backgroundKey: undefined }, 1).key === "time-lab-prototype",
    "Expected levels without explicit backgrounds to use prototype fallback"
  );
  assert(
    levels.every((level) => backgroundAmbienceIsActive(backgroundAmbienceForLevel(level))),
    "Expected every handcrafted level to use active background ambience"
  );
  assert(backgroundAmbienceForLevel({ ...levels[0], backgroundAmbience: undefined }).preset === "none", "Expected missing ambience to normalize to none");
  assert(Boolean(soundtracks.tutorial), "Expected a tutorial soundtrack");
  assert(Boolean(soundtracks.boss), "Expected a boss soundtrack");
  assert(tutorialLevel.soundtrackKey === "tutorial", `Expected tutorial to use tutorial music, got ${tutorialLevel.soundtrackKey}`);
  assert(tutorialLevel.score.lives === null, `Expected tutorial to use unlimited lives, got ${tutorialLevel.score.lives}`);
  assert(soundtrackForLevel(tutorialLevel).key === "tutorial", "Expected tutorial soundtrack key to resolve");
  assert(soundtrackForLevel({ ...levels[0], soundtrackKey: "tutorial" }).key === "tutorial", "Expected explicit tutorial soundtrack key to override index fallback");
  assert(soundtrackForLevel(levels[3], 3).key === "level-9", "Expected Level 4 to use Level 9 music");
  assert(soundtrackForLevel(levels[4], 4).key === "level-10", "Expected Level 5 to use final Level 10 music");
  assert(soundtrackForLevel({ ...levels[4], soundtrackKey: undefined }, 5).key === "level-1", "Expected missing retired level-6 slot to use safe fallback");
  assert(soundtrackForLevel({ ...levels[4], soundtrackKey: "missing-track" }, 5).key === "level-1", "Expected unknown soundtrack key to use safe fallback");
  assert(soundtrackForLevel({ ...levels[4], soundtrackKey: "menu" }, 5).key === "level-1", "Expected menu soundtrack key to be ignored for levels");
  assert(soundtrackForLevel({ ...levels[4], soundtrackKey: "boss" }, 5).key === "level-1", "Expected boss music key to be ignored for level music");
  assert(soundtrackForLevel({ ...levels[0], index: 9, soundtrackKey: undefined }, 1).key === "level-2", "Expected auto soundtrack fallback to use runtime level slot, not authored index");
  assert(
    terrainMaterialForSolid({ id: "legacy-floor", tone: "steel", sprite: "floor" }) === "metal-lab",
    "Expected legacy steel solids to fall back to metal-lab terrain"
  );
  assert(
    terrainMaterialForSolid({ id: "legacy-glass", tone: "glass", sprite: "wall" }) === "glass-energy",
    "Expected legacy glass tone to map to glass-energy terrain"
  );
  assert(
    terrainMaterialForSolid({ id: "explicit-sand", tone: "steel", sprite: "floor", material: "sand-ruin" }) === "sand-ruin",
    "Expected explicit terrain material to override legacy tone"
  );

  await verifyAudioUnlockRetry(SynthAudio, soundtracks);

  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key) =>
          key === EDITOR_DRAFT_STORAGE_KEY
            ? JSON.stringify({
                currentIndex: 0,
                levels: [
                  {
                    ...baseLevel,
                    id: "legacy-draft-motion",
                    name: "Legacy Draft Motion",
                    cores: [{ id: "draft-core", x: 110, y: 96, w: 24, h: 24, label: "D", size: "large" }],
                    drones: [{ id: "legacy-draft-drone", x: 160, y: 86, w: 28, h: 34, axis: "x", distance: 30, period: 120, phase: 0.25 }]
                  }
                ]
              })
            : null
      }
    }
  });
  const migratedDraft = readEditorDraftSnapshot();
  if (previousWindow === undefined) delete globalThis.window;
  else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  const migratedDraftDrone = migratedDraft?.levels[0]?.drones?.find((drone) => drone.id === "legacy-draft-drone");
  const migratedDraftCore = migratedDraft?.levels[0]?.cores?.find((core) => core.id === "draft-core");
  assert(migratedDraft?.motionModel === "anchored", "Expected legacy runtime draft snapshot to be marked anchored after migration");
  assert(migratedDraft?.levels[0]?.motionModel === "anchored", "Expected legacy runtime draft level to be marked anchored after migration");
  assert(migratedDraftCore?.size === "large", `Expected runtime draft reader to preserve large core size, got ${JSON.stringify(migratedDraftCore)}`);
  assert(
    migratedDraftDrone?.x === 130 &&
      migratedDraftDrone?.distance === 60 &&
      Math.abs((migratedDraftDrone?.phase || 0) - (0.25 + Math.PI / 2)) < 0.000001,
    `Expected runtime draft reader to migrate legacy center/radius drone motion, got ${JSON.stringify(migratedDraftDrone)}`
  );

  const levelIds = levels.map((level) => level.id);
  const levelIndexes = levels.map((level) => level.index);
  const duplicateLevelIds = levelIds.filter((id, index) => levelIds.indexOf(id) !== index);
  const duplicateLevelIndexes = levelIndexes.filter((index, position) => levelIndexes.indexOf(index) !== position);
  const misorderedLevelIndexes = levels
    .map((level, position) => ({ level, position }))
    .filter(({ level, position }) => level.index !== position)
    .map(({ level, position }) => `${level.id}:${level.index}->${position}`);
  assert(
    duplicateLevelIds.length === 0,
    `Expected unique level IDs, found duplicates: ${duplicateLevelIds.join(", ")}`
  );
  assert(
    duplicateLevelIndexes.length === 0,
    `Expected unique level indexes, found duplicates: ${duplicateLevelIndexes.join(", ")}`
  );
  assert(
    misorderedLevelIndexes.length === 0,
    `Expected level indexes to match array order, found mismatches: ${misorderedLevelIndexes.join(", ")}`
  );
  const missingSoundtrackIds = levels
    .filter((level) => !soundtrackForLevel(level))
    .map((level) => level.id);
  assert(
    missingSoundtrackIds.length === 0,
    `Expected every level to have a soundtrack; missing ${missingSoundtrackIds.join(", ")}`
  );

  const tutorialMovingLaser = tutorialLevel.movingLasers?.find((laser) => laser.id === "tutorial-moving-laser");
  assert(tutorialMovingLaser, "Expected tutorial to include a moving laser station");
  const tutorialStaticLaser = tutorialLevel.lasers?.find((laser) => laser.id === "tutorial-laser");
  assert(
    tutorialStaticLaser?.disabledBy?.includes("laser-timer") && tutorialMovingLaser.disabledBy?.includes("laser-timer"),
    "Expected tutorial timed switch to disable both tutorial lasers"
  );
  const tutorialMovingLaserRaised = movingLaserRectAt(tutorialMovingLaser, 0);
  assert(
    tutorialMovingLaserRaised.w > tutorialMovingLaserRaised.h && tutorialMovingLaserRaised.y + tutorialMovingLaserRaised.h <= 360,
    `Expected raised tutorial moving laser to be horizontal and high enough to pass under, got ${JSON.stringify(tutorialMovingLaserRaised)}`
  );
  const tutorialMovingLaserLowered = movingLaserRectAt(tutorialMovingLaser, Math.round(tutorialMovingLaser.period / 2));
  assert(
    tutorialMovingLaserLowered.w > tutorialMovingLaserLowered.h && tutorialMovingLaserLowered.y + tutorialMovingLaserLowered.h > 466,
    `Expected lowered tutorial moving laser to block the floor lane, got ${JSON.stringify(tutorialMovingLaserLowered)}`
  );
  const tutorialLaserStation = new RoomSimulation(tutorialLevel);
  Object.assign(tutorialLaserStation.player, {
    x: 3310,
    y: 466,
    vx: 0,
    vy: 0,
    onGround: true,
    coyote: 7,
    standingOn: null
  });
  runFrames(tutorialLaserStation, 190, right);
  assert(!tutorialLaserStation.dead, "Tutorial laser timer station should be crossable without dying");
  assert(
    tutorialLaserStation.player.x > 3900,
    `Expected tutorial laser station route to pass the moving laser, got x=${tutorialLaserStation.player.x.toFixed(1)}`
  );

  const bestScore = { levelId: "score-test", score: 1500, frames: 600, echoes: 3, deaths: 1, cores: 1, timeBonus: 1400 };
  const lowerScoreFewerDeaths = { levelId: "score-test", score: 1400, frames: 540, echoes: 0, deaths: 0, cores: 1, timeBonus: 1300 };
  const sameScoreFewerDeaths = { levelId: "score-test", score: 1500, frames: 660, echoes: 3, deaths: 0, cores: 1, timeBonus: 1400 };
  const sameScoreFewerEchoes = { levelId: "score-test", score: 1500, frames: 660, echoes: 2, deaths: 1, cores: 1, timeBonus: 1400 };
  const sameScoreFaster = { levelId: "score-test", score: 1500, frames: 540, echoes: 3, deaths: 1, cores: 1, timeBonus: 1400 };
  assert(!isBetterLevelScore(lowerScoreFewerDeaths, bestScore), "Lower score should not replace a higher score");
  assert(isBetterLevelScore(sameScoreFewerDeaths, bestScore), "Same score with fewer deaths should replace previous score");
  assert(isBetterLevelScore(sameScoreFewerEchoes, bestScore), "Same score/deaths with fewer echoes should replace previous score");
  assert(isBetterLevelScore(sameScoreFaster, bestScore), "Same score/deaths/echoes with faster time should replace previous score");

  const previousProgressWindow = globalThis.window;
  let storedLegacyProgress = JSON.stringify({
    unlocked: 4,
    scores: {
      "legacy-room": { levelId: "legacy-room", frames: 1234, echoes: 0, medal: "Quantum" }
    }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key) =>
          key === "echo-shift-progress-v1" ? storedLegacyProgress : null,
        setItem: (key, value) => {
          if (key === "echo-shift-progress-v1") storedLegacyProgress = value;
        }
      }
    }
  });
  const legacyScores = getBestScores();
  assert(legacyScores["legacy-room"], "Expected legacy medal-era score to remain visible after progress normalization");
  assert(legacyScores["legacy-room"].score === 0, `Expected legacy score to migrate as score 0, got ${legacyScores["legacy-room"].score}`);
  assert(legacyScores["legacy-room"].legacy === true, "Expected legacy score to carry replacement marker");
  assert(legacyScores["legacy-room"].frames === 1234, `Expected legacy frames to be preserved, got ${legacyScores["legacy-room"].frames}`);
  assert(legacyScores["legacy-room"].echoes === 0, `Expected legacy echoes to be preserved, got ${legacyScores["legacy-room"].echoes}`);
  recordLevelScore({ levelId: "legacy-room", score: 0, frames: 2400, echoes: 3, deaths: 1, cores: 0, timeBonus: 0 }, 0);
  const replacedLegacyScore = JSON.parse(storedLegacyProgress).scores["legacy-room"];
  if (previousProgressWindow === undefined) delete globalThis.window;
  else Object.defineProperty(globalThis, "window", { configurable: true, value: previousProgressWindow });
  assert(!replacedLegacyScore.legacy, `Expected real score to replace migrated legacy score, got ${JSON.stringify(replacedLegacyScore)}`);
  assert(
    replacedLegacyScore.deaths === 1 && replacedLegacyScore.echoes === 3,
    `Expected replacement score to be stored, got ${JSON.stringify(replacedLegacyScore)}`
  );

  const echoPlateLevel = {
    ...baseLevel,
    plates: [{ id: "plate-a", x: 94, y: 112, w: 58, h: 8 }],
    doors: [{ id: "door-a", x: 220, y: 70, w: 18, h: 50, opensWith: ["plate-a"] }]
  };
  const plateSim = new RoomSimulation(echoPlateLevel);
  runFrames(plateSim, 34, right);
  assert(plateSim.rewindToEcho(), "Expected first attempt to become an echo");
  runFrames(plateSim, 46, idle);
  assert(plateSim.echoRecordings.length === 1, "Expected exactly one stored echo");
  assert(plateSim.objectState.activePlates.has("plate-a"), "Echo did not activate the pressure plate");
  assert(plateSim.objectState.openDoors.has("door-a"), "Pressure plate did not open the linked door");

  const coreLevel = {
    ...baseLevel,
    cores: [{ id: "core-a", x: 22, y: 88, w: 20, h: 20 }],
    doors: [{ id: "core-door", x: 90, y: 70, w: 18, h: 50, opensWith: [], requiresCore: "core-a" }]
  };
  const coreSim = new RoomSimulation(coreLevel);
  const coreEvent = coreSim.step(idle);
  assert(coreSim.objectState.collectedCores.has("core-a"), "Player did not collect overlapping core");
  assert(coreSim.objectState.openDoors.has("core-door"), "Core-locked door did not open after collection");
  assert(coreEvent.core && coreEvent.core.x > 20 && coreEvent.core.x < 50, "Core pickup event did not report player location");
  assert(coreEvent.core?.id === "core-a", `Core pickup event did not report the collected core id: ${JSON.stringify(coreEvent.core)}`);
  assert(coreSim.score === 100, `Core pickup did not add score, got ${coreSim.score}`);

  const multiCoreLevel = {
    ...baseLevel,
    cores: [
      { id: "core-one", x: 18, y: 86, w: 18, h: 18 },
      { id: "core-two", x: 32, y: 86, w: 18, h: 18 }
    ]
  };
  const multiCoreSim = new RoomSimulation(multiCoreLevel);
  const multiCoreEvent = multiCoreSim.step(idle);
  assert(multiCoreSim.objectState.collectedCores.size === 2, "Expected overlapping cores to both collect in one frame");
  assert(multiCoreEvent.cores.length === 2, `Expected two core events in one frame, got ${JSON.stringify(multiCoreEvent.cores)}`);
  assert(multiCoreSim.score === 200, `Expected simultaneous cores to score 200, got ${multiCoreSim.score}`);

  const coreFarmingSim = new RoomSimulation(coreLevel);
  coreFarmingSim.step(idle);
  assert(coreFarmingSim.score === 100, "Expected overlapping core to add score before rewind");
  assert(!coreFarmingSim.rewindToEcho(), "Short core pickup attempt should reset without adding an echo");
  assert(coreFarmingSim.score === 0, `Rewind should remove discarded timeline core score, got ${coreFarmingSim.score}`);

  const echoCoreLevel = {
    ...baseLevel,
    cores: [{ id: "core-echo", x: 118, y: 88, w: 20, h: 20 }]
  };
  const echoCoreSim = new RoomSimulation(echoCoreLevel);
  runFrames(echoCoreSim, 34, right);
  assert(echoCoreSim.rewindToEcho(), "Expected core setup attempt to become an echo");
  let echoCoreEvent = null;
  for (let i = 0; i < 60; i += 1) {
    const event = echoCoreSim.step(idle);
    if (event.core) {
      echoCoreEvent = event.core;
      break;
    }
  }
  assert(echoCoreEvent, "Echo did not collect the core during replay");
  assert(echoCoreEvent.x > 100, `Echo core pickup event used the wrong origin: ${JSON.stringify(echoCoreEvent)}`);
  assert(echoCoreSim.score === 100, `Echo-collected core should add score once in the active timeline, got ${echoCoreSim.score}`);

  const laserLevel = {
    ...baseLevel,
    lasers: [{ id: "beam-a", x: 82, y: 88, w: 70, h: 28, startsOn: true }]
  };
  const laserSim = new RoomSimulation(laserLevel);
  laserSim.echoRecordings.push({ id: "echo-blocker", frames: [], createdAtFrame: 0 });
  laserSim.echoes = [makeActor("echo-blocker", "echo", { x: 96, y: 86 })];
  const laserEvent = laserSim.step(idle);
  assert(!laserSim.objectState.blockedLasers.has("beam-a"), "Echo should not block the laser beam");
  assert(!laserSim.echoes[0].alive, "Echo touching an active laser should vaporize");
  assert(laserEvent.echoLaserVaporized === 1, `Expected laser-vaporized echo event, got ${laserEvent.echoLaserVaporized}`);
  assert(laserSim.snapshot().echoes.length === 0, "Vaporized echo should be absent from snapshots");
  assert(!laserSim.dead, "Laser vaporizing an echo should not kill the player");

  const playerLaserDeathSim = new RoomSimulation({
    ...baseLevel,
    lasers: [{ id: "player-beam", x: 18, y: 86, w: 30, h: 34, startsOn: true }]
  });
  const playerLaserDeathEvent = playerLaserDeathSim.step(idle);
  assert(playerLaserDeathSim.dead, "Active laser overlap should kill the player");
  assert(playerLaserDeathEvent.playerLaserVaporized, "Expected player laser vaporization event for laser death");

  const vaporizedEchoInteractionSim = new RoomSimulation({
    ...laserLevel,
    plates: [{ id: "doomed-plate", x: 96, y: 112, w: 36, h: 8, once: true }],
    timedSwitches: [{ id: "doomed-timer", x: 96, y: 112, w: 36, h: 8, duration: 20 }],
    echoSensors: [{ id: "doomed-sensor", x: 96, y: 86, w: 28, h: 34 }],
    cores: [{ id: "doomed-core", x: 100, y: 90, w: 18, h: 18 }]
  });
  vaporizedEchoInteractionSim.echoRecordings.push({ id: "echo-doomed", frames: [], createdAtFrame: 0 });
  vaporizedEchoInteractionSim.echoes = [makeActor("echo-doomed", "echo", { x: 96, y: 86 })];
  const vaporizedEchoInteractionEvent = vaporizedEchoInteractionSim.step(idle);
  assert(!vaporizedEchoInteractionSim.echoes[0].alive, "Echo should vaporize before committing trigger/core state");
  assert(!vaporizedEchoInteractionSim.objectState.activePlates.has("doomed-plate"), "Vaporized echo should not leave plate active");
  assert(!vaporizedEchoInteractionSim.objectState.latchedPlates.has("doomed-plate"), "Vaporized echo should not latch one-shot plates");
  assert(!vaporizedEchoInteractionSim.objectState.activePlates.has("doomed-timer"), "Vaporized echo should not start timed switches");
  assert(!vaporizedEchoInteractionSim.objectState.timedSwitchTimers.has("doomed-timer"), "Vaporized echo should not leave timed switch timers");
  assert(!vaporizedEchoInteractionSim.objectState.activePlates.has("doomed-sensor"), "Vaporized echo should not activate echo sensors");
  assert(!vaporizedEchoInteractionSim.objectState.collectedCores.has("doomed-core"), "Vaporized echo should not collect cores");
  assert(!vaporizedEchoInteractionEvent.core, "Vaporized echo should not emit core pickup events");

  const cascadeVaporizeSim = new RoomSimulation({
    ...baseLevel,
    hazards: [{ id: "cascade-hazard", x: 96, y: 86, w: 28, h: 34 }],
    plates: [{ id: "cascade-plate", x: 96, y: 112, w: 36, h: 8 }],
    lasers: [{ id: "cascade-beam", x: 140, y: 88, w: 28, h: 28, startsOn: true, disabledBy: ["cascade-plate"] }]
  });
  cascadeVaporizeSim.echoRecordings.push({ id: "echo-1", frames: [], createdAtFrame: 0 });
  cascadeVaporizeSim.echoRecordings.push({ id: "echo-2", frames: [], createdAtFrame: 0 });
  cascadeVaporizeSim.echoes = [
    makeActor("echo-1", "echo", { x: 96, y: 86 }),
    makeActor("echo-2", "echo", { x: 140, y: 86 })
  ];
  cascadeVaporizeSim.step(idle);
  assert(!cascadeVaporizeSim.echoes[0].alive, "First cascade echo should vaporize on the hazard");
  assert(!cascadeVaporizeSim.echoes[1].alive, "Second cascade echo should vaporize after trigger state recomputes");
  assert(!cascadeVaporizeSim.objectState.activePlates.has("cascade-plate"), "Vaporized cascade echo should not keep laser disable plate active");

  const crateBlockedLaserSim = new RoomSimulation({
    ...laserLevel,
    crates: [{ id: "beam-crate", x: 96, y: 86, w: 28, h: 34 }]
  });
  crateBlockedLaserSim.step(idle);
  assert(crateBlockedLaserSim.objectState.blockedLasers.has("beam-a"), "Crate should still block the laser beam");

  const plateDisabledLaserLevel = {
    ...baseLevel,
    plates: [{ id: "beam-plate", x: 18, y: 112, w: 50, h: 8 }],
    lasers: [{ id: "plate-beam", x: 20, y: 86, w: 28, h: 34, startsOn: true, disabledBy: ["beam-plate"] }]
  };
  const plateDisabledLaserSim = new RoomSimulation(plateDisabledLaserLevel);
  plateDisabledLaserSim.step(idle);
  assert(plateDisabledLaserSim.objectState.activePlates.has("beam-plate"), "Plate did not activate for laser disable");
  assert(!plateDisabledLaserSim.dead, "Plate-disabled overlapping laser killed the player");

  const timedDisabledLaserLevel = {
    ...baseLevel,
    timedSwitches: [{ id: "timer-beam", x: 18, y: 112, w: 50, h: 8, duration: 20 }],
    lasers: [{ id: "timer-laser", x: 100, y: 86, w: 28, h: 34, startsOn: true, disabledBy: ["timer-beam"] }]
  };
  const timedDisabledLaserSim = new RoomSimulation(timedDisabledLaserLevel);
  timedDisabledLaserSim.step(idle);
  timedDisabledLaserSim.player.x = 100;
  runFrames(timedDisabledLaserSim, 12, idle);
  assert(!timedDisabledLaserSim.dead, "Timed-switch-disabled laser expired too early");
  runFrames(timedDisabledLaserSim, 28, idle);
  assert(timedDisabledLaserSim.dead, "Timed-switch-disabled laser did not reactivate after timer expiry");

  const inactiveLaserLevel = {
    ...baseLevel,
    start: { x: 20, y: 86 },
    lasers: [{ id: "inactive-beam", x: 82, y: 88, w: 70, h: 28, startsOn: false }]
  };
  const inactiveLaserSim = new RoomSimulation(inactiveLaserLevel);
  runFrames(inactiveLaserSim, 26, right);
  assert(inactiveLaserSim.rewindToEcho(), "Expected inactive laser setup attempt to become an echo");
  let inactiveLaserSwitched = false;
  for (let i = 0; i < 48; i += 1) {
    inactiveLaserSwitched ||= inactiveLaserSim.step(i < 32 ? right : idle).switched;
  }
  assert(!inactiveLaserSwitched, "Inactive laser overlap should not emit switch feedback");
  assert(!inactiveLaserSim.objectState.blockedLasers.has("inactive-beam"), "Inactive laser should not be tracked as blocked");

  const oneWayLandingLevel = {
    ...baseLevel,
    start: { x: 82, y: 72 },
    solids: [
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    oneWays: [{ id: "one-way-a", x: 60, y: 120, w: 120, h: 12 }]
  };
  const oneWayLandingSim = new RoomSimulation(oneWayLandingLevel);
  runFrames(oneWayLandingSim, 45, idle);
  assert(oneWayLandingSim.player.onGround, "Player did not land on one-way platform from above");
  assert(
    Math.abs(oneWayLandingSim.player.y + oneWayLandingSim.player.h - 120) < 0.01,
    `Player landed at wrong one-way height: ${oneWayLandingSim.player.y + oneWayLandingSim.player.h}`
  );
  const oneWayPassSim = new RoomSimulation(oneWayLandingLevel);
  oneWayPassSim.player.x = 82;
  oneWayPassSim.player.y = 132;
  oneWayPassSim.player.onGround = true;
  oneWayPassSim.player.coyote = 7;
  runFrames(oneWayPassSim, 18, jump);
  assert(oneWayPassSim.player.y < 112, `Player should jump up through one-way from below, got y=${oneWayPassSim.player.y}`);

  const topOnlySolidLevel = {
    ...baseLevel,
    start: { x: 82, y: 72 },
    solids: [
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 },
      { id: "top-only-floor", x: 60, y: 120, w: 120, h: 12, collision: "top-only" }
    ],
    oneWays: []
  };
  const topOnlyLandingSim = new RoomSimulation(topOnlySolidLevel);
  runFrames(topOnlyLandingSim, 45, idle);
  assert(topOnlyLandingSim.player.onGround, "Player did not land on top-only solid from above");
  assert(
    Math.abs(topOnlyLandingSim.player.y + topOnlyLandingSim.player.h - 120) < 0.01,
    `Player landed at wrong top-only solid height: ${topOnlyLandingSim.player.y + topOnlyLandingSim.player.h}`
  );
  const topOnlyPassSim = new RoomSimulation(topOnlySolidLevel);
  topOnlyPassSim.player.x = 82;
  topOnlyPassSim.player.y = 132;
  topOnlyPassSim.player.onGround = true;
  topOnlyPassSim.player.coyote = 7;
  runFrames(topOnlyPassSim, 18, jump);
  assert(topOnlyPassSim.player.y < 112, `Player should jump up through top-only solid from below, got y=${topOnlyPassSim.player.y}`);

  const decorativeSolidLevel = {
    ...baseLevel,
    start: { x: 82, y: 72 },
    solids: [
      { id: "decorative-band", x: 60, y: 120, w: 120, h: 12, collision: "decorative" },
      { id: "catch-floor", x: 0, y: 164, w: 320, h: 36 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    oneWays: []
  };
  const decorativeFallSim = new RoomSimulation(decorativeSolidLevel);
  runFrames(decorativeFallSim, 45, idle);
  assert(decorativeFallSim.player.onGround, "Player should land on catch floor after passing decorative solid");
  assert(
    Math.abs(decorativeFallSim.player.y + decorativeFallSim.player.h - 164) < 0.01,
    `Decorative solid should not stop player; landed at ${decorativeFallSim.player.y + decorativeFallSim.player.h}`
  );

  const movingPlatformLandingLevel = {
    ...baseLevel,
    start: { x: 132, y: 42 },
    solids: [
      { id: "catch-floor", x: 0, y: 164, w: 320, h: 36 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    platforms: [{ id: "one-way-lift", x: 112, y: 116, w: 88, h: 16, axis: "x", distance: 0, period: 90 }]
  };
  const movingPlatformLandingSim = new RoomSimulation(movingPlatformLandingLevel);
  runFrames(movingPlatformLandingSim, 45, idle);
  assert(movingPlatformLandingSim.player.onGround, "Player did not land on moving platform from above");
  assert(
    movingPlatformLandingSim.player.standingOn === "one-way-lift",
    `Expected player to stand on one-way-lift, got ${movingPlatformLandingSim.player.standingOn}`
  );
  assert(
    Math.abs(movingPlatformLandingSim.player.y + movingPlatformLandingSim.player.h - 116) < 0.01,
    `Player landed at wrong moving-platform height: ${movingPlatformLandingSim.player.y + movingPlatformLandingSim.player.h}`
  );

  const movingPlatformUndersideLevel = {
    ...baseLevel,
    start: { x: 132, y: 110 },
    solids: [
      { id: "floor", x: 0, y: 144, w: 320, h: 36 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    platforms: [{ id: "underside-lift", x: 112, y: 86, w: 88, h: 18, axis: "x", distance: 0, period: 90 }]
  };
  const movingPlatformUndersideSim = new RoomSimulation(movingPlatformUndersideLevel);
  runFrames(movingPlatformUndersideSim, 2, idle);
  runFrames(movingPlatformUndersideSim, 10, jump);
  assert(
    movingPlatformUndersideSim.player.y < 86,
    `Player should jump up through moving platform from below, got y=${movingPlatformUndersideSim.player.y}`
  );

  const movingPlatformSideLevel = {
    ...baseLevel,
    start: { x: 70, y: 110 },
    solids: [
      { id: "floor", x: 0, y: 144, w: 320, h: 36 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    platforms: [{ id: "side-pass-lift", x: 120, y: 110, w: 80, h: 18, axis: "x", distance: 0, period: 90 }]
  };
  const movingPlatformSideSim = new RoomSimulation(movingPlatformSideLevel);
  runFrames(movingPlatformSideSim, 2, idle);
  runFrames(movingPlatformSideSim, 42, right);
  assert(
    movingPlatformSideSim.player.x > 145,
    `Player should run through moving-platform side, got x=${movingPlatformSideSim.player.x}`
  );

  const travelingLiftPlatform = { id: "traveling-lift", x: 112, y: 104, w: 88, h: 16, axis: "y", distance: 26, period: 90 };
  const travelingLiftLevel = {
    ...baseLevel,
    start: { x: 132, y: 42 },
    solids: [
      { id: "catch-floor", x: 0, y: 164, w: 320, h: 36 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    platforms: [travelingLiftPlatform]
  };
  const travelingLiftSim = new RoomSimulation(travelingLiftLevel);
  runFrames(travelingLiftSim, 52, idle);
  assert(travelingLiftSim.player.onGround, "Player did not land on non-zero-distance moving platform");
  assert(
    travelingLiftSim.player.standingOn === "traveling-lift",
    `Expected player to stand on traveling-lift, got ${travelingLiftSim.player.standingOn}`
  );
  runFrames(travelingLiftSim, 16, idle);
  assert(
    travelingLiftSim.player.standingOn === "traveling-lift",
    "Player did not remain carried by non-zero-distance moving platform"
  );

  const conveyorLevel = {
    ...baseLevel,
    start: { x: 64, y: 86 },
    solids: [
      { id: "floor-left", x: 0, y: 120, w: 60, h: 40 },
      { id: "floor-right", x: 180, y: 120, w: 140, h: 40 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    conveyors: [{ id: "belt-a", x: 60, y: 120, w: 120, h: 20, direction: 1, speed: 1.6 }]
  };
  const conveyorSim = new RoomSimulation(conveyorLevel);
  runFrames(conveyorSim, 45, idle);
  assert(conveyorSim.player.x > 90, `Conveyor did not push idle player right, got x=${conveyorSim.player.x}`);

  const conveyorBlockedLevel = {
    ...baseLevel,
    start: { x: 64, y: 86 },
    solids: [
      { id: "floor-left", x: 0, y: 120, w: 60, h: 40 },
      { id: "floor-right", x: 180, y: 120, w: 140, h: 40 },
      { id: "crate-stop", x: 132, y: 70, w: 18, h: 50 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    conveyors: [{ id: "belt-blocked", x: 60, y: 120, w: 120, h: 20, direction: 1, speed: 3 }],
    crates: [{ id: "crate-blocked", x: 100, y: 86, w: 30, h: 34 }]
  };
  const conveyorBlockedSim = new RoomSimulation(conveyorBlockedLevel);
  runFrames(conveyorBlockedSim, 35, idle);
  const blockedCrate = conveyorBlockedSim.objectState.crates.get("crate-blocked");
  assert(blockedCrate, "Blocked conveyor crate missing from object state");
  assert(
    conveyorBlockedSim.player.x + conveyorBlockedSim.player.w <= blockedCrate.x + 0.01,
    `Conveyor pushed player through blocked crate: player ${conveyorBlockedSim.player.x}, crate ${blockedCrate.x}`
  );

  const walkOverLaunchLevel = {
    ...baseLevel,
    start: { x: 26, y: 86 },
    launchPads: [{ id: "launch-a", x: 20, y: 112, w: 70, h: 8, powerY: 13.5, powerX: 1 }]
  };
  const walkOverLaunchSim = new RoomSimulation(walkOverLaunchLevel);
  let walkedOverLaunch = walkOverLaunchSim.step(idle).launched;
  for (let i = 0; i < 8; i += 1) {
    walkedOverLaunch ||= walkOverLaunchSim.step(right).launched;
  }
  assert(!walkedOverLaunch, "Launch pad fired while being walked over instead of landed on from above");

  const launchLevel = {
    ...walkOverLaunchLevel,
    start: { x: 26, y: 38 }
  };
  const launchSim = new RoomSimulation(launchLevel);
  let launchEvent = null;
  for (let i = 0; i < 40; i += 1) {
    const event = launchSim.step(idle);
    if (event.launched) {
      launchEvent = event;
      break;
    }
  }
  assert(launchEvent?.launched, "Launch pad did not report a launch event");
  assert(launchEvent.launchPadId === "launch-a", `Launch pad did not report its id, got ${launchEvent.launchPadId}`);
  assert(
    Math.abs(launchSim.player.y + launchSim.player.h - 112) < 0.01,
    `Launch pad did not spring from its top face: foot=${launchSim.player.y + launchSim.player.h}`
  );
  assert(
    launchSim.player.vy < -12 && launchSim.player.vy > -13.5 && launchSim.player.vx === 1,
    `Launch pad did not apply a softened deterministic spring velocity: vx=${launchSim.player.vx}, vy=${launchSim.player.vy}`
  );
  launchSim.step(idle);
  assert(
    launchSim.player.vy < -11.5,
    `Launch pad spring velocity should not be jump-cut when jump is not held, got vy=${launchSim.player.vy}`
  );
  assert(!launchSim.step(idle).launched, "Launch pad re-fired while actor was still in spring launch cooldown");

  const launchFloatLandingLevel = {
    ...baseLevel,
    start: { x: 26, y: 38 },
    launchPads: [{ id: "launch-float-clear", x: 20, y: 112, w: 30, h: 8, powerY: 9, powerX: 4 }]
  };
  const launchFloatLandingSim = new RoomSimulation(launchFloatLandingLevel);
  let floatLaunchEvent = null;
  for (let i = 0; i < 40; i += 1) {
    const event = launchFloatLandingSim.step(idle);
    if (event.launched) {
      floatLaunchEvent = event;
      break;
    }
  }
  assert(floatLaunchEvent?.launched, "Launch pad did not fire in float-clear fixture");
  for (let i = 0; i < 90 && !launchFloatLandingSim.player.onGround; i += 1) {
    launchFloatLandingSim.step(idle);
  }
  assert(launchFloatLandingSim.player.onGround, "Launch float-clear fixture did not land back on normal floor");
  assert(
    launchFloatLandingSim.player.launchFloatFrames === 0,
    `Launch float should clear on landing before normal jumps, got ${launchFloatLandingSim.player.launchFloatFrames}`
  );
  launchFloatLandingSim.step(jump);
  assert(
    Math.abs(launchFloatLandingSim.player.vy - -12.23) < 0.001,
    `Normal jump after launch landing should keep baseline jump velocity, got ${launchFloatLandingSim.player.vy}`
  );

  const sideLaunchLevel = {
    ...baseLevel,
    start: { x: 45, y: 98 },
    solids: [
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    launchPads: [{ id: "launch-side", x: 20, y: 80, w: 50, h: 20, powerY: 13.5 }]
  };
  const sideLaunchSim = new RoomSimulation(sideLaunchLevel);
  const sideLaunchEvent = sideLaunchSim.step(idle);
  assert(!sideLaunchEvent.launched, "Launch pad fired from side/underside overlap");
  assert(sideLaunchSim.player.vy > 0, `Side-overlap launch pad should not reverse fall velocity, got ${sideLaunchSim.player.vy}`);

  const timedSwitchLevel = {
    ...baseLevel,
    timedSwitches: [{ id: "timer-a", x: 18, y: 112, w: 50, h: 8, duration: 20 }],
    doors: [{ id: "timer-door", x: 170, y: 70, w: 18, h: 50, opensWith: ["timer-a"] }]
  };
  const timedSim = new RoomSimulation(timedSwitchLevel);
  timedSim.step(idle);
  assert(timedSim.objectState.activePlates.has("timer-a"), "Timed switch did not become active on contact");
  assert(timedSim.objectState.openDoors.has("timer-door"), "Timed switch did not open linked door");
  timedSim.player.x = 100;
  runFrames(timedSim, 12, idle);
  assert(timedSim.objectState.activePlates.has("timer-a"), "Timed switch expired too early");
  runFrames(timedSim, 28, idle);
  assert(!timedSim.objectState.activePlates.has("timer-a"), "Timed switch did not expire after duration");

  const echoSensorLevel = {
    ...baseLevel,
    echoSensors: [{ id: "echo-sensor-a", x: 112, y: 84, w: 38, h: 40 }],
    doors: [{ id: "sensor-door", x: 210, y: 70, w: 18, h: 50, opensWith: ["echo-sensor-a"] }]
  };
  const echoSensorPlayerOnlySim = new RoomSimulation({ ...echoSensorLevel, start: { x: 112, y: 86 } });
  echoSensorPlayerOnlySim.step(idle);
  assert(!echoSensorPlayerOnlySim.objectState.activePlates.has("echo-sensor-a"), "Echo-only sensor should not activate for the player");
  const echoSensorSim = new RoomSimulation(echoSensorLevel);
  runFrames(echoSensorSim, 34, right);
  assert(echoSensorSim.rewindToEcho(), "Expected echo sensor setup attempt to become an echo");
  runFrames(echoSensorSim, 46, idle);
  assert(echoSensorSim.objectState.activePlates.has("echo-sensor-a"), "Echo did not activate echo sensor");
  assert(echoSensorSim.objectState.openDoors.has("sensor-door"), "Echo sensor did not open linked door");

  const movingLaserLevel = {
    ...baseLevel,
    movingLasers: [{ id: "sweeper-a", x: 20, y: 86, w: 40, h: 34, axis: "x", distance: 0, period: 120, startsOn: true }]
  };
  const movingLaserSim = new RoomSimulation(movingLaserLevel);
  movingLaserSim.step(idle);
  assert(movingLaserSim.dead, "Overlapping moving laser should kill the player");

  const autoVerticalMovingLaser = { id: "auto-vertical-sweeper", x: -20, y: 40, w: 100, h: 20, axis: "x", distance: 80, period: 120, startsOn: true };
  const autoVerticalMovingLaserRect = movingLaserRectAt(autoVerticalMovingLaser, 0);
  assert(
    autoVerticalMovingLaserRect.w === 20 && autoVerticalMovingLaserRect.h === 100,
    `Expected horizontal-travel moving laser to default to a vertical beam, got ${JSON.stringify(autoVerticalMovingLaserRect)}`
  );
  const autoVerticalMovingLaserSim = new RoomSimulation({ ...baseLevel, movingLasers: [autoVerticalMovingLaser] });
  autoVerticalMovingLaserSim.step(idle);
  assert(autoVerticalMovingLaserSim.dead, "Default horizontal-travel moving laser should collide as a vertical sweeper");

  const explicitHorizontalMovingLaser = { ...autoVerticalMovingLaser, id: "explicit-horizontal-sweeper", beamAxis: "x" };
  const explicitHorizontalMovingLaserRect = movingLaserRectAt(explicitHorizontalMovingLaser, 0);
  assert(
    explicitHorizontalMovingLaserRect.w === 100 && explicitHorizontalMovingLaserRect.h === 20,
    `Expected explicit horizontal moving laser beam to stay horizontal, got ${JSON.stringify(explicitHorizontalMovingLaserRect)}`
  );
  const explicitHorizontalMovingLaserSim = new RoomSimulation({ ...baseLevel, movingLasers: [explicitHorizontalMovingLaser] });
  explicitHorizontalMovingLaserSim.step(idle);
  assert(!explicitHorizontalMovingLaserSim.dead, "Explicit horizontal moving laser should not use the auto vertical collision shape");

  const crateLevel = {
    ...baseLevel,
    plates: [{ id: "crate-plate", x: 184, y: 112, w: 50, h: 8 }],
    crates: [{ id: "crate-a", x: 62, y: 86, w: 30, h: 34 }],
    doors: [{ id: "crate-door", x: 220, y: 70, w: 18, h: 50, opensWith: ["crate-plate"] }]
  };
  const crateSim = new RoomSimulation(crateLevel);
  runFrames(crateSim, 34, right);
  const crateAfterPush = crateSim.objectState.crates.get("crate-a");
  assert(crateAfterPush && crateAfterPush.x > 78, `Player did not push crate right, got ${JSON.stringify(crateAfterPush)}`);
  assert(crateSim.objectState.activePlates.has("crate-plate"), "Crate did not hold pressure plate after being pushed");
  assert(crateSim.objectState.openDoors.has("crate-door"), "Crate-held plate did not open linked door");

  const crateContentionLevel = {
    ...baseLevel,
    start: { x: 132, y: 86 },
    crates: [{ id: "crate-contended", x: 100, y: 86, w: 30, h: 34 }]
  };
  const crateContentionSim = new RoomSimulation(crateContentionLevel);
  crateContentionSim.echoRecordings.push({ id: "echo-pusher", frames: [right], createdAtFrame: 0 });
  crateContentionSim.echoes = [makeActor("echo-pusher", "echo", { x: 78, y: 86 })];
  crateContentionSim.step(idle);
  const contendedCrate = crateContentionSim.objectState.crates.get("crate-contended");
  assert(contendedCrate, "Contended crate missing from object state");
  assert(!rectsOverlap(contendedCrate, crateContentionSim.player), "Echo pushed crate into idle player");
  crateContentionSim.step(idle);
  assert(!rectsOverlap(contendedCrate, crateContentionSim.player), "Crate/player overlap persisted after contention frame");

  const cratePlatformBlockLevel = {
    ...baseLevel,
    start: { x: 58, y: 86 },
    platforms: [{ id: "crate-stop-lift", x: 150, y: 86, w: 70, h: 18, axis: "x", distance: 0, period: 90 }],
    crates: [{ id: "crate-vs-platform", x: 100, y: 86, w: 30, h: 34 }]
  };
  const cratePlatformBlockSim = new RoomSimulation(cratePlatformBlockLevel);
  runFrames(cratePlatformBlockSim, 90, right);
  const platformBlockedCrate = cratePlatformBlockSim.objectState.crates.get("crate-vs-platform");
  assert(platformBlockedCrate, "Platform-blocked crate missing from object state");
  assert(
    platformBlockedCrate.x + platformBlockedCrate.w <= 150.01,
    `Crate should not be pushed through moving-platform side, got x=${platformBlockedCrate.x}`
  );

  const deathLevel = {
    ...baseLevel,
    hazards: [{ id: "death-zone", x: 20, y: 86, w: 28, h: 34 }]
  };
  const deathSim = new RoomSimulation(deathLevel);
  const deathEvent = deathSim.step(idle);
  assert(deathSim.dead, "Expected overlapping hazard to kill the player");
  assert(deathEvent.died && !deathEvent.livesExhausted, "First death should not exhaust the default signal budget");
  assert(deathSim.deaths === 1, `Expected first death to increment death count, got ${deathSim.deaths}`);
  assert(deathSim.livesRemaining() === 2, `Expected two lives remaining after first death, got ${deathSim.livesRemaining()}`);
  assert(deathSim.score === 0, `Death penalty should floor score at 0, got ${deathSim.score}`);
  const deadTick = deathSim.tick;
  const deadFrames = deathSim.totalFrames;
  runFrames(deathSim, 30, right);
  assert(deathSim.tick === deadTick, "Dead attempt should not continue ticking");
  assert(deathSim.totalFrames === deadFrames, "Dead attempt should not continue scoring time");

  const lifeResetLevel = {
    ...baseLevel,
    cores: [{ id: "life-reset-core", x: 24, y: 86, w: 28, h: 34 }],
    hazards: [{ id: "life-reset-loss", x: 90, y: 86, w: 28, h: 34 }]
  };
  const lifeResetSim = new RoomSimulation(lifeResetLevel);
  lifeResetSim.step(idle);
  assert(lifeResetSim.totalFrames > 0, "Expected life-reset fixture to accrue visible time before death");
  assert(lifeResetSim.score > 0, "Expected life-reset fixture to accrue visible score before death");
  lifeResetSim.player.x = 90;
  lifeResetSim.player.y = 86;
  const lifeResetDeath = lifeResetSim.step(idle);
  assert(lifeResetDeath.died && lifeResetSim.deaths === 1, "Expected life-reset fixture to lose one life");
  lifeResetSim.resetLifeAttempt();
  assert(lifeResetSim.deaths === 1, `Life reset should preserve death count, got ${lifeResetSim.deaths}`);
  assert(lifeResetSim.livesRemaining() === 2, `Life reset should preserve lost life, got ${lifeResetSim.livesRemaining()} lives`);
  assert(lifeResetSim.totalFrames === 0, `Life reset should restart visible time, got ${lifeResetSim.totalFrames}`);
  assert(lifeResetSim.score === 0, `Life reset should restart visible score, got ${lifeResetSim.score}`);
  assert(!lifeResetSim.dead && lifeResetSim.player.alive, "Life reset should respawn a live player");

  const exhaustedLivesSim = new RoomSimulation({ ...deathLevel, score: { ...baseLevel.score, lives: 2 } });
  const firstDeath = exhaustedLivesSim.step(idle);
  exhaustedLivesSim.resetAttempt(false);
  const secondDeath = exhaustedLivesSim.step(idle);
  assert(firstDeath.died && !firstDeath.livesExhausted, "First two-life death should not require retry");
  assert(secondDeath.died && secondDeath.livesExhausted, "Second two-life death should require retry");
  assert(exhaustedLivesSim.livesRemaining() === 0, `Expected no lives remaining, got ${exhaustedLivesSim.livesRemaining()}`);

  const unlimitedLivesSim = new RoomSimulation({ ...deathLevel, score: { ...baseLevel.score, lives: null } });
  const unlimitedDeath = unlimitedLivesSim.step(idle);
  assert(unlimitedDeath.died && !unlimitedDeath.livesExhausted, "Unlimited lives should never require retry");
  assert(unlimitedLivesSim.livesRemaining() === null, `Expected unlimited lives to report null, got ${unlimitedLivesSim.livesRemaining()}`);

  const monsterLevel = {
    ...baseLevel,
    monsters: [{ id: "stompable-test", kind: "sprout-hopper", x: 40, y: 96, w: 28, h: 24, score: 250 }]
  };
  const monsterStompSim = new RoomSimulation(monsterLevel);
  Object.assign(monsterStompSim.player, { x: 42, y: 60, vx: 0, vy: 5, onGround: false });
  const monsterStomp = monsterStompSim.step(idle);
  assert(monsterStomp.monsterKills.length === 1, "Expected top stomp to kill stompable monster");
  assert(monsterStompSim.killedMonsterIds.has("stompable-test"), "Expected killed monster to persist in current attempt");
  assert(monsterStompSim.score === 250, `Expected monster score reward, got ${monsterStompSim.score}`);
  monsterStompSim.rewindToEcho();
  assert(!monsterStompSim.killedMonsterIds.has("stompable-test"), "Rewind/reset should restore killed monsters");
  assert(monsterStompSim.score === 0, `Rewind/reset should remove current-attempt monster score, got ${monsterStompSim.score}`);

  const monsterSideSim = new RoomSimulation({
    ...baseLevel,
    monsters: [{ id: "side-danger-test", kind: "sprout-hopper", x: 20, y: 86, w: 28, h: 34 }]
  });
  const monsterSide = monsterSideSim.step(idle);
  assert(monsterSide.died && monsterSideSim.dead, "Expected side monster collision to kill player");

  const undersideMonsterSim = new RoomSimulation({
    ...baseLevel,
    monsters: [{ id: "under-test", kind: "copper-leech", x: 40, y: 50, w: 28, h: 24, score: 200 }]
  });
  Object.assign(undersideMonsterSim.player, { x: 42, y: 76, vx: 0, vy: -4, onGround: false });
  const undersideKill = undersideMonsterSim.step(idle);
  assert(undersideKill.monsterKills.length === 1, "Expected upward underside hit to kill vulnerable monster");

  const bossLevel = {
    ...baseLevel,
    bosses: [{ id: "boss-test", kind: "storm-relay-warden", x: 40, y: 20, w: 220, h: 130, entrySide: "right", introSeconds: 17, health: 1, score: 1200 }]
  };
  const bossGateSim = new RoomSimulation(bossLevel);
  Object.assign(bossGateSim.player, { x: bossLevel.exit.x, y: bossLevel.exit.y, vx: 0, vy: 0 });
  bossGateSim.step(idle);
  assert(!bossGateSim.won, "Boss level exit should stay locked before boss defeat");
  assert(!bossGateSim.exitUnlocked(), "Boss level exit unlock state should be false before boss defeat");
  const bossIntroSim = new RoomSimulation(bossLevel);
  bossIntroSim.player.x = 260;
  assert(bossIntroSim.bossSnapshots().length === 0, "Idle boss should not expose a visible body snapshot before intro");
  bossIntroSim.player.x = bossLevel.start.x;
  const bossStart = bossIntroSim.step(idle);
  assert(bossStart.bossIntroStarted === "boss-test", "Expected boss arena overlap to start boss intro");
  assert(bossStart.bossCheckpointActivated === "boss-test", "Expected boss entry to create a checkpoint");
  const bossIntroSnapshot = bossIntroSim.bossSnapshots()[0];
  assert(bossIntroSnapshot?.introTotalFrames === 17 * 60, `Expected boss intro snapshot to use configured intro frames, got ${bossIntroSnapshot?.introTotalFrames}`);
  assert(bossIntroSnapshot?.weakSpotKind === "top", `Expected storm boss weak spot to default to top, got ${bossIntroSnapshot?.weakSpotKind}`);
  assert(!bossIntroSim.dead, "Boss intro should not damage player on first contact");
  runFrames(bossIntroSim, 17 * 60 - 2, idle);
  const introBossState = bossIntroSim.bossStates.get("boss-test");
  assert(introBossState?.phase === "intro", `Expected boss to remain in intro before 17s completes, got ${introBossState?.phase}`);
  assert(!bossIntroSim.dead, "Boss intro should be harmless for the full transition window");
  bossIntroSim.step(idle);
  const activeBossState = bossIntroSim.bossStates.get("boss-test");
  assert(activeBossState?.phase === "active", `Expected boss to activate after 17s, got ${activeBossState?.phase}`);
  const bossBody = bossIntroSim.bossSnapshots()[0].body;
  Object.assign(bossIntroSim.player, { x: bossBody.x + bossBody.w / 2 - 12, y: bossBody.y - 35, vx: 0, vy: 4, onGround: false });
  const bossHit = bossIntroSim.step(idle);
  assert(bossHit.bossHit?.id === "boss-test", "Expected top hit to damage active boss");
  assert(bossHit.bossDefeated?.score === 1200, `Expected boss defeat score event, got ${JSON.stringify(bossHit.bossDefeated)}`);
  assert(bossHit.bossPortalUnlocked, "Expected boss defeat to unlock the exit portal");
  assert(bossIntroSim.exitUnlocked(), "Expected boss level exit to unlock after boss defeat");
  assert(bossIntroSim.score === 1200, `Expected boss defeat score to apply, got ${bossIntroSim.score}`);

  const multiBossLevel = {
    ...baseLevel,
    exit: { x: 580, y: 82, w: 28, h: 38 },
    bounds: { x: 0, y: 0, w: 640, h: 180 },
    solids: [
      { id: "floor", x: 0, y: 120, w: 640, h: 40 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 180 },
      { id: "right-wall", x: 640, y: 0, w: 20, h: 180 }
    ],
    bosses: [
      { id: "boss-a", kind: "storm-relay-warden", x: 60, y: 20, w: 220, h: 130, entrySide: "right", introSeconds: 1, health: 1, score: 700 },
      { id: "boss-b", kind: "cryo-conservator", x: 330, y: 20, w: 220, h: 130, entrySide: "left", introSeconds: 1, health: 1, score: 900 }
    ]
  };
  const multiBossSim = new RoomSimulation(multiBossLevel);
  Object.assign(multiBossSim.player, { x: 62, y: 86, vx: 0, vy: 0, onGround: true });
  const multiBossStartA = multiBossSim.step(idle);
  assert(multiBossStartA.bossCheckpointActivated === "boss-a", "Expected first boss to create its checkpoint");
  assert(multiBossSim.bossCheckpointActive(), "Expected first boss checkpoint to be active during intro");
  runFrames(multiBossSim, 60, idle);
  const multiBossBodyA = multiBossSim.bossSnapshots().find((boss) => boss.id === "boss-a")?.body;
  assert(multiBossBodyA, "Expected first multi-boss body snapshot");
  Object.assign(multiBossSim.player, { x: multiBossBodyA.x + multiBossBodyA.w / 2 - 12, y: multiBossBodyA.y - 35, vx: 0, vy: 4, onGround: false });
  const multiBossDefeatA = multiBossSim.step(idle);
  assert(multiBossDefeatA.bossDefeated?.id === "boss-a", "Expected first multi-boss defeat");
  assert(!multiBossDefeatA.bossPortalUnlocked, "Expected first multi-boss defeat to keep portal locked");
  assert(!multiBossSim.exitUnlocked(), "Expected multi-boss exit to remain locked after first boss");
  assert(!multiBossSim.bossCheckpointActive(), "Expected first boss checkpoint to clear after first boss defeat");
  Object.assign(multiBossSim.player, { x: 332, y: 86, vx: 0, vy: 0, onGround: true });
  const multiBossStartB = multiBossSim.step(idle);
  assert(multiBossStartB.bossCheckpointActivated === "boss-b", "Expected second boss to create a fresh checkpoint");
  assert(multiBossSim.bossCheckpointActive(), "Expected second boss checkpoint to be active during intro");

  const bossCheckpointLevel = {
    ...baseLevel,
    score: { ...baseLevel.score, coreScore: 1000, deathPenalty: 100 },
    cores: [{ id: "pre-boss-core", x: 20, y: 86, w: 18, h: 18 }],
    bosses: [{ id: "checkpoint-boss", kind: "clockwork-regent", x: 78, y: 20, w: 190, h: 130, entrySide: "right", weakSpot: "core", introSeconds: 1, health: 2, score: 2000 }]
  };
  const bossCheckpointSim = new RoomSimulation(bossCheckpointLevel);
  bossCheckpointSim.step(idle);
  assert(bossCheckpointSim.objectState.collectedCores.has("pre-boss-core"), "Expected pre-boss core to be collected before checkpoint");
  assert(bossCheckpointSim.score === 1000, `Expected pre-boss score before checkpoint, got ${bossCheckpointSim.score}`);
  Object.assign(bossCheckpointSim.player, { x: 76, y: 86, vx: 0, vy: 0, onGround: true });
  const checkpointEvent = bossCheckpointSim.step(idle);
  assert(checkpointEvent.bossCheckpointActivated === "checkpoint-boss", "Expected boss checkpoint activation event");
  runFrames(bossCheckpointSim, 60, idle);
  const checkpointBossBody = bossCheckpointSim.bossSnapshots()[0].body;
  Object.assign(bossCheckpointSim.player, { x: checkpointBossBody.x + checkpointBossBody.w * 0.65, y: checkpointBossBody.y + checkpointBossBody.h * 0.45, vx: 0, vy: 0, onGround: false });
  const checkpointDeath = bossCheckpointSim.step(idle);
  assert(checkpointDeath.died, "Expected side/body boss collision to kill the player during checkpoint fight");
  bossCheckpointSim.resetLifeAttempt();
  assert(!bossCheckpointSim.dead, "Expected checkpoint life reset to respawn alive");
  assert(bossCheckpointSim.bossStates.get("checkpoint-boss")?.phase === "idle", "Expected checkpoint restore to reset boss fight to idle");
  assert(bossCheckpointSim.objectState.collectedCores.has("pre-boss-core"), "Expected checkpoint restore to preserve collected core");
  assert(bossCheckpointSim.score === 900, `Expected checkpoint restore to preserve score with one death penalty, got ${bossCheckpointSim.score}`);
  assert(bossCheckpointSim.totalFrames === 1, `Expected checkpoint restore to preserve pre-boss frame count, got ${bossCheckpointSim.totalFrames}`);

  const bonusSim = new RoomSimulation(baseLevel);
  runFrames(bonusSim, 60, idle);
  assert(bonusSim.timeBonus() === 900, `Expected 900 score time bonus after 1s under a 10s target, got ${bonusSim.timeBonus()}`);
  assert(bonusSim.finalScore() === 900, `Expected final score to include time bonus, got ${bonusSim.finalScore()}`);

  const droneLevel = {
    ...baseLevel,
    drones: [{ id: "drone-test", x: 20, y: 86, w: 28, h: 34, axis: "x", distance: 0, period: 120 }]
  };
  const droneSim = new RoomSimulation(droneLevel);
  droneSim.step(idle);
  assert(droneSim.dead, "Expected overlapping patrol drone to kill the player");

  const plateDisabledDroneLevel = {
    ...baseLevel,
    plates: [{ id: "drone-plate", x: 18, y: 112, w: 50, h: 8 }],
    drones: [{ id: "plate-drone", x: 20, y: 86, w: 28, h: 34, axis: "x", distance: 0, period: 120, disabledBy: ["drone-plate"] }]
  };
  const plateDisabledDroneSim = new RoomSimulation(plateDisabledDroneLevel);
  plateDisabledDroneSim.step(idle);
  assert(plateDisabledDroneSim.objectState.activePlates.has("drone-plate"), "Plate did not activate for drone disable");
  assert(!plateDisabledDroneSim.dead, "Plate-disabled overlapping drone killed the player");

  const timedDisabledDroneLevel = {
    ...baseLevel,
    timedSwitches: [{ id: "timer-drone", x: 18, y: 112, w: 50, h: 8, duration: 20 }],
    drones: [{ id: "timed-drone", x: 100, y: 86, w: 28, h: 34, axis: "x", distance: 0, period: 120, disabledBy: ["timer-drone"] }]
  };
  const timedDisabledDroneSim = new RoomSimulation(timedDisabledDroneLevel);
  timedDisabledDroneSim.step(idle);
  timedDisabledDroneSim.player.x = 100;
  runFrames(timedDisabledDroneSim, 12, idle);
  assert(!timedDisabledDroneSim.dead, "Timed-switch-disabled drone expired too early");
  runFrames(timedDisabledDroneSim, 28, idle);
  assert(timedDisabledDroneSim.dead, "Timed-switch-disabled drone did not reactivate after timer expiry");

  const echoDroneSim = new RoomSimulation({
    ...baseLevel,
    drones: [{ id: "echo-drone", x: 96, y: 86, w: 28, h: 34, axis: "x", distance: 0, period: 120 }]
  });
  echoDroneSim.echoRecordings.push({ id: "echo-drone-target", frames: [], createdAtFrame: 0 });
  echoDroneSim.echoes = [makeActor("echo-drone-target", "echo", { x: 96, y: 86 })];
  echoDroneSim.step(idle);
  assert(!echoDroneSim.echoes[0].alive, "Echo touching an active drone should vaporize");
  assert(!echoDroneSim.dead, "Drone vaporizing an echo should not kill the player");

  const fallLevel = {
    ...baseLevel,
    start: { x: 20, y: 20 },
    bounds: { x: 0, y: 0, w: 320, h: 90 },
    solids: [
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ]
  };
  const fallSim = new RoomSimulation(fallLevel);
  runFrames(fallSim, 90, idle);
  assert(fallSim.dead, "Falling out of bounds should mark the attempt dead");
  assert(!fallSim.player.alive, "Falling out of bounds should mark the player not alive");
  const fallTick = fallSim.tick;
  const fallFrames = fallSim.totalFrames;
  runFrames(fallSim, 30, right);
  assert(fallSim.tick === fallTick, "Out-of-bounds death should not continue ticking");
  assert(fallSim.totalFrames === fallFrames, "Out-of-bounds death should not continue scoring time");

  const deterministicLevel = {
    ...baseLevel,
    platforms: [{ id: "lift-test", x: 108, y: 96, w: 72, h: 14, axis: "y", distance: 24, period: 90 }]
  };
  const inputSequence = [
    ...Array.from({ length: 16 }, () => right),
    ...Array.from({ length: 8 }, () => jump),
    ...Array.from({ length: 30 }, () => right),
    ...Array.from({ length: 16 }, () => idle)
  ];
  const baseline = new RoomSimulation(deterministicLevel);
  for (const input of inputSequence) baseline.step(input);
  const expected = {
    x: Number(baseline.player.x.toFixed(3)),
    y: Number(baseline.player.y.toFixed(3)),
    tick: baseline.tick
  };
  const replay = new RoomSimulation(deterministicLevel);
  for (const input of inputSequence) replay.step(input);
  assert(replay.rewindToEcho(), "Expected deterministic setup attempt to become an echo");
  runFrames(replay, inputSequence.length, idle);
  const echo = replay.echoes[0];
  const actual = {
    x: Number(echo.x.toFixed(3)),
    y: Number(echo.y.toFixed(3)),
    tick: replay.tick
  };
  assert(
    actual.x === expected.x && actual.y === expected.y && actual.tick === expected.tick,
    `Echo replay diverged: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        levels: levels.length,
        checks: [
          "level-data",
          "tutorial-laser-station",
          "score-ranking",
          "legacy-progress-migration",
          "legacy-progress-replacement",
          "echo-plate-door",
          "core-door",
          "core-visual-contract",
          "multi-core-score",
          "echo-core-origin",
          "laser-disable-vaporization",
          "entity-toolkit",
          "death-freeze",
          "unlimited-lives",
          "monster-combat",
          "boss-intro-combat",
          "drone-disable-vaporization",
          "fall-death-freeze",
          "deterministic-replay",
          "audio-unlock-retry",
          "soundtrack-manifest",
          "draft-motion-migration",
          "side-scrolling-bounds"
        ]
      },
      null,
      2
    )
  );
} finally {
  await server.close();
}
