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
      !["floor", "left-wall", "right-wall"].includes(solid.id) &&
      solid.h <= 58 &&
      solid.y < footY &&
      solid.y + solid.h > actor.y + 10
  );
  return [...activeHazards, ...activeLasers, ...activeMovingLasers, ...activeDrones, ...lowSolids];
};

const supportRects = (simulation) => [
  ...simulation.level.solids,
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

    audio.play("jump");
    await settlePromises();
    assert(startedTones.length >= 1, "Expected SFX tone to start after audio context unlock");
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
  const { doorRequiredCoreIds, isMajorCore } = await server.ssrLoadModule("/src/game/objects.ts");
  const { EDITOR_DRAFT_STORAGE_KEY, readEditorDraftSnapshot } = await server.ssrLoadModule("/src/data/editorDraft.ts");
  const { getBestScores, isBetterLevelScore, recordLevelScore } = await server.ssrLoadModule("/src/game/progress.ts");
  const { soundtrackForLevel, soundtracks } = await server.ssrLoadModule("/src/game/soundtracks.ts");
  const { backgroundForLevel, levelBackgrounds } = await server.ssrLoadModule("/src/game/backgrounds.ts");
  const { backgroundAmbienceForLevel, backgroundAmbienceIsActive } = await server.ssrLoadModule("/src/game/backgroundAmbience.ts");
  const { terrainMaterialForSolid } = await server.ssrLoadModule("/src/game/terrainMaterials.ts");
  const { SynthAudio } = await server.ssrLoadModule("/src/game/audio.ts");

  assert(levels.length === 10, `Expected 10 handcrafted levels, found ${levels.length}`);
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
  assert(Boolean(levelBackgrounds["level-10-readable-lab"]), "Expected final readable level background");
  assert(backgroundForLevel(levels[0], 0).key === "level-1-readable-lab", "Expected Level 1 to use readable background");
  assert(backgroundForLevel(levels[9], 9).key === "level-10-readable-lab", "Expected Level 10 to use readable background");
  assert(
    backgroundForLevel({ ...levels[1], backgroundKey: undefined }, 1).key === "time-lab-prototype",
    "Expected levels without explicit backgrounds to use prototype fallback"
  );
  assert(
    levels.every((level) => backgroundAmbienceIsActive(backgroundAmbienceForLevel(level))),
    "Expected every handcrafted level to use active background ambience"
  );
  assert(backgroundAmbienceForLevel({ ...levels[0], backgroundAmbience: undefined }).preset === "none", "Expected missing ambience to normalize to none");
  assert(soundtrackForLevel({ ...levels[0], soundtrackKey: "level-6" }).key === "level-6", "Expected explicit level soundtrack key to override index fallback");
  assert(soundtrackForLevel({ ...levels[5], soundtrackKey: undefined }, 5).key === "level-6", "Expected missing soundtrack key to fall back to level slot");
  assert(soundtrackForLevel({ ...levels[5], soundtrackKey: "missing-track" }, 5).key === "level-6", "Expected unknown soundtrack key to fall back to level slot");
  assert(soundtrackForLevel({ ...levels[5], soundtrackKey: "menu" }, 5).key === "level-6", "Expected menu soundtrack key to be ignored for levels");
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

  const handcraftedRoutes = [
    {
      id: "portal-primer",
      route: [["smartRight", 1400]]
    },
    {
      id: "first-afterimage",
      route: [["smartRightUntilX", 164, 120], ["idle", 45], ["rewind"], ["smartRight", 1600]]
    },
    {
      id: "held-open",
      route: [["smartRightUntilX", 194, 140], ["idle", 45], ["rewind"], ["smartRight", 1900]]
    },
    {
      id: "relay-key",
      route: [["smartRightUntilX", 200, 150], ["idle", 45], ["rewind"], ["smartRight", 2100]]
    },
    {
      id: "lift-phase",
      route: [["smartRightUntilX", 2700, 900], ["idle", 40], ["smartRight", 1000]]
    },
    {
      id: "laser-shadow",
      route: [["smartRightUntilX", 390, 260], ["idle", 45], ["rewind"], ["smartRight", 2200]],
      activePlates: ["beam-safe"]
    },
    {
      id: "dual-lock",
      route: [
        ["smartRightUntilX", 160, 120],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 332, 180],
        ["idle", 45],
        ["rewind"],
        ["smartRight", 2300]
      ]
    },
    {
      id: "cross-current",
      route: [["smartRightUntilX", 206, 150], ["idle", 45], ["rewind"], ["smartRight", 2500]]
    },
    {
      id: "phase-braid",
      route: [
        ["smartRightUntilX", 232, 150],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 1470, 720],
        ["idle", 45],
        ["rewind"],
        ["smartRight", 2600]
      ]
    },
    {
      id: "echo-shift",
      route: [
        ["smartRightUntilX", 220, 150],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 902, 500],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 1610, 720],
        ["idle", 45],
        ["rewind"],
        ["smartRight", 3200]
      ]
    }
  ];

  const levelIds = levels.map((level) => level.id);
  const levelIndexes = levels.map((level) => level.index);
  const routeIds = handcraftedRoutes.map((route) => route.id);
  const duplicateLevelIds = levelIds.filter((id, index) => levelIds.indexOf(id) !== index);
  const duplicateLevelIndexes = levelIndexes.filter((index, position) => levelIndexes.indexOf(index) !== position);
  const misorderedLevelIndexes = levels
    .map((level, position) => ({ level, position }))
    .filter(({ level, position }) => level.index !== position)
    .map(({ level, position }) => `${level.id}:${level.index}->${position}`);
  const duplicateRouteIds = routeIds.filter((id, index) => routeIds.indexOf(id) !== index);
  const routeIdSet = new Set(routeIds);
  const levelIdSet = new Set(levelIds);
  const missingRouteIds = levelIds.filter((id) => !routeIdSet.has(id));
  const extraRouteIds = routeIds.filter((id) => !levelIdSet.has(id));
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
  assert(
    duplicateRouteIds.length === 0,
    `Expected unique handcrafted route IDs, found duplicates: ${duplicateRouteIds.join(", ")}`
  );
  assert(
    missingRouteIds.length === 0 && extraRouteIds.length === 0,
    `Expected handcrafted routes to exactly match levels; missing ${missingRouteIds.join(", ") || "none"}, extra ${extraRouteIds.join(", ") || "none"}`
  );
  const missingSoundtrackIds = levels
    .filter((level) => !soundtrackForLevel(level))
    .map((level) => level.id);
  assert(
    missingSoundtrackIds.length === 0,
    `Expected every level to have a soundtrack; missing ${missingSoundtrackIds.join(", ")}`
  );

  const lowClosedGates = levels.flatMap((level) =>
    (level.doors || [])
      .filter((door) => door.y > CLOSED_GATE_MAX_TOP)
      .map((door) => `${level.id}:${door.id}@${door.y}`)
  );
  assert(
    lowClosedGates.length === 0,
    `Expected closed gate tops at or above y=${CLOSED_GATE_MAX_TOP}; low gates: ${lowClosedGates.join(", ")}`
  );

  const sparseCourseLevels = levels
    .filter((level) => level.solids.filter((solid) => solid.id === "floor" || solid.id.startsWith("floor-")).length < 3)
    .map((level) => level.id);
  assert(
    sparseCourseLevels.length === 0,
    `Expected every expanded level to have multiple floor segments/gaps; sparse levels: ${sparseCourseLevels.join(", ")}`
  );

  const bypassedFloorGates = [];
  for (const level of levels) {
    for (const door of (level.doors || []).filter((item) => item.y + item.h >= 490)) {
      const closedGateLevel = { ...level, plates: [], cores: [] };
      const simulation = new RoomSimulation(closedGateLevel);
      simulation.player.x = Math.max(level.bounds.x, door.x - 170);
      simulation.player.y = door.y + door.h - simulation.player.h;
      simulation.player.vx = 0;
      simulation.player.vy = 0;
      simulation.player.onGround = true;
      simulation.player.coyote = 7;
      simulation.player.standingOn = null;

      runFrames(simulation, 18, right);
      runFrames(simulation, 18, jumpRight);
      runFrames(simulation, 120, right);

      if (simulation.player.x > door.x + door.w) {
        bypassedFloorGates.push(`${level.id}:${door.id}`);
      }
    }
  }
  assert(
    bypassedFloorGates.length === 0,
    `Expected closed floor-height gates to stop jump bypasses; bypassed: ${bypassedFloorGates.join(", ")}`
  );

  const rightOnlyBypasses = [];
  for (const level of levels) {
    const simulation = new RoomSimulation(level);
    runFrames(simulation, Math.ceil(level.score.timeBonusTargetSeconds * 60 + 900), right);
    if (simulation.won) rightOnlyBypasses.push(level.id);
  }
  assert(
    rightOnlyBypasses.length === 0,
    `Expected no level to be clearable by holding right only; bypassed levels: ${rightOnlyBypasses.join(", ")}`
  );

  const routeSummaries = [];
  for (const routeSpec of handcraftedRoutes) {
    const level = levels.find((item) => item.id === routeSpec.id);
    assert(level, `Missing handcrafted route level: ${routeSpec.id}`);

    const simulation = new RoomSimulation(level);
    runRoute(simulation, routeSpec.route);

    assert(simulation.won, `${level.name} route should reach the portal`);
    assert(!simulation.dead, `${level.name} route should not end dead`);
    assert(simulation.finalScore() > 0, `${level.name} route should finish with a positive score`);

    const bonusSlack = Math.round(level.score.timeBonusTargetSeconds * 60 - simulation.totalFrames);
    assert(bonusSlack >= 420, `${level.name} route leaves only ${bonusSlack} time-bonus slack frames`);
    assert(
      simulation.totalFrames >= 600,
      `${level.name} route completed too quickly for the expanded side-scrolling soundtrack target: ${simulation.totalFrames}`
    );

    for (const laserId of routeSpec.blockedLasers || []) {
      assert(simulation.objectState.blockedLasers.has(laserId), `${level.name} route did not block ${laserId}`);
    }
    for (const plateId of routeSpec.activePlates || []) {
      assert(simulation.objectState.activePlates.has(plateId), `${level.name} route did not hold ${plateId}`);
    }

    routeSummaries.push({
      id: level.id,
      frames: simulation.totalFrames,
      echoes: simulation.echoRecordings.length,
      bonusSlack,
      score: simulation.finalScore()
    });
  }

  const heldOpen = levels[2];
  const heldOpenExpanded = new RoomSimulation(heldOpen);
  heldOpenExpanded.objectState.latchedPlates.add("plate-b");
  runSmartRight(heldOpenExpanded, 1900, { untilWin: true });
  assert(heldOpenExpanded.won, "Held Open expanded route should reach the portal with the gate held open");

  const liftPhase = levels[4];
  const lift = liftPhase.platforms?.find((platform) => platform.id === "lift-a");
  assert(lift, "Expected Lift Phase to include lift-a");
  const liftPhaseExpanded = new RoomSimulation(liftPhase);
  runRoute(liftPhaseExpanded, [["smartRightUntilX", 2700, 900], ["idle", 40], ["smartRight", 1000]]);
  assert(liftPhaseExpanded.won, "Lift Phase expanded route should reach the side-scrolling portal");

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
  laserSim.step(idle);
  assert(!laserSim.objectState.blockedLasers.has("beam-a"), "Echo should not block the laser beam");
  assert(!laserSim.echoes[0].alive, "Echo touching an active laser should vaporize");
  assert(laserSim.snapshot().echoes.length === 0, "Vaporized echo should be absent from snapshots");
  assert(!laserSim.dead, "Laser vaporizing an echo should not kill the player");

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

  const launchLevel = {
    ...baseLevel,
    start: { x: 26, y: 86 },
    launchPads: [{ id: "launch-a", x: 20, y: 112, w: 70, h: 8, powerY: 13.5, powerX: 1 }]
  };
  const launchSim = new RoomSimulation(launchLevel);
  const launchEvent = launchSim.step(idle);
  assert(launchEvent.launched, "Launch pad did not report a launch event");
  assert(launchSim.player.vy < -12 && launchSim.player.vx > 0, `Launch pad did not apply impulse: vx=${launchSim.player.vx}, vy=${launchSim.player.vy}`);

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

  const exhaustedLivesSim = new RoomSimulation({ ...deathLevel, score: { ...baseLevel.score, lives: 2 } });
  const firstDeath = exhaustedLivesSim.step(idle);
  exhaustedLivesSim.resetAttempt(false);
  const secondDeath = exhaustedLivesSim.step(idle);
  assert(firstDeath.died && !firstDeath.livesExhausted, "First two-life death should not require retry");
  assert(secondDeath.died && secondDeath.livesExhausted, "Second two-life death should require retry");
  assert(exhaustedLivesSim.livesRemaining() === 0, `Expected no lives remaining, got ${exhaustedLivesSim.livesRemaining()}`);

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
          "held-open-expanded-route",
          "lift-phase-expanded-route",
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
          "drone-disable-vaporization",
          "fall-death-freeze",
          "deterministic-replay",
          "audio-unlock-retry",
          "soundtrack-manifest",
          "draft-motion-migration",
          "side-scrolling-bounds",
          "closed-gate-top-contract",
          "closed-floor-gate-bypass",
          "multi-segment-level-density",
          "right-only-bypass-regression",
          "all-level-score-routes"
        ],
        routeSummaries
      },
      null,
      2
    )
  );
} finally {
  await server.close();
}
