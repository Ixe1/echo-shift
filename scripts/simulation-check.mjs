import { readFileSync } from "fs";
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
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const restoreGlobal = (key, value) => {
  if (value === undefined) delete globalThis[key];
  else Object.defineProperty(globalThis, key, { configurable: true, value });
};

const gameSceneMethodBody = (source, name) => {
  const match = new RegExp(`\\n  private ${name}(?:\\(|\\s*=)`).exec(source);
  const start = match ? match.index + 1 : -1;
  assert(start >= 0, `Expected GameScene ${name} method to exist`);
  const end = source.indexOf("\n  private ", start + `private ${name}`.length);
  return source.slice(start, end >= 0 ? end : undefined);
};

const verifyGameSceneAudioCleanupHooks = () => {
  const source = readFileSync("src/scenes/GameScene.ts", "utf8");
  const helperBody = gameSceneMethodBody(source, "clearAttemptScopedAudio");
  assert(
    helperBody.includes("audio.clearBlockedSamples()"),
    "Expected GameScene clearAttemptScopedAudio to clear blocked one-shot sample retries"
  );
  for (const method of [
    "startDeathPresentation",
    "finishDeathPresentation",
    "rewind",
    "startRetryPresentation",
    "finishRetryPresentation",
    "restartLevel",
    "completeLevel",
    "shutdownScene"
  ]) {
    const body = gameSceneMethodBody(source, method);
    assert(
      body.includes("this.clearAttemptScopedAudio()"),
      `Expected GameScene ${method} to clear attempt-scoped blocked one-shot samples`
    );
  }
};

const verifyAudioUnlockRetry = async (SynthAudio, soundtracks) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const listeners = new Map();
  const mediaElements = [];
  const startedTones = [];
  const startedMusicSources = [];
  const audioContexts = [];
  const pendingResumes = [];
  const pendingBlockedRejects = [];
  const pendingMediaPlayResolves = [];
  const pendingFetchResponses = [];
  const pendingMediaLoads = [];
  const forceRejectedMedia = new Set();
  const gainRampValues = [];
  let disconnectedNodes = 0;
  let deferBlockedRejects = false;
  let deferNextMediaPlayFor = null;
  let deferNextFetch = false;
  let deferNextMediaLoad = false;
  let failNextFetch = false;
  let mediaUnlocked = false;
  let visibilityState = "visible";
  let runAnimationFrames = true;

  const fakeParam = (trackGain = false) => ({
    value: 0,
    setValueAtTime(value) {
      this.value = value;
    },
    exponentialRampToValueAtTime(value) {
      this.value = value;
      if (trackGain) gainRampValues.push(value);
    }
  });
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.state = "suspended";
      this.onstatechange = null;
      audioContexts.push(this);
    }

    resume() {
      this.state = "running";
      this.onstatechange?.({ type: "statechange" });
      return new Promise((resolve) => pendingResumes.push(resolve));
    }

    createGain() {
      return { gain: fakeParam(true), connect() {}, disconnect() { disconnectedNodes += 1; } };
    }

    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        startOffset: null,
        stopped: false,
        onended: null,
        connect() {},
        disconnect() {
          disconnectedNodes += 1;
        },
        start(_when, offset = 0) {
          source.startOffset = offset;
          startedMusicSources.push(source);
        },
        stop() {
          source.stopped = true;
          source.onended?.();
        }
      };
      return source;
    }

    decodeAudioData() {
      return Promise.resolve({ duration: 180 });
    }

    createOscillator() {
      const oscillator = {
        type: "sine",
        stopped: false,
        onended: null,
        frequency: fakeParam(),
        connect() {},
        disconnect() {
          disconnectedNodes += 1;
        },
        start() {
          startedTones.push(oscillator);
        },
        stop() {
          oscillator.stopped = true;
          oscillator.onended?.();
        }
      };
      return oscillator;
    }

    createBiquadFilter() {
      return { type: "lowpass", frequency: fakeParam(), connect() {}, disconnect() { disconnectedNodes += 1; } };
    }

    close() {
      this.state = "closed";
      this.onstatechange?.({ type: "statechange" });
      return Promise.resolve();
    }
  }
  class FakeAudioElement {
	    constructor(src) {
	      this.src = src;
	      this.currentTime = 0;
	      this.loop = false;
	      this.preload = "";
	      this.volume = 1;
	      this.readyState = 0;
	      this.playCalls = 0;
	      this.playing = false;
	      this.ended = false;
	      this.listeners = new Map();
	      mediaElements.push(this);
	    }

	    get paused() {
	      return !this.playing;
	    }

    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    }

    dispatchEvent(type) {
      for (const handler of this.listeners.get(type) || []) handler({ type });
    }

    removeEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      this.listeners.set(
        type,
        handlers.filter((candidate) => candidate !== handler)
      );
    }

    load() {
      if (this.readyState >= 4) return;
      if (deferNextMediaLoad) {
        deferNextMediaLoad = false;
        pendingMediaLoads.push(this);
        return;
      }
      this.readyState = 4;
      this.dispatchEvent("loadeddata");
      this.dispatchEvent("canplay");
    }

    removeAttribute(name) {
      if (name === "src") this.src = "";
    }

    play() {
      this.playCalls += 1;
      if ([...forceRejectedMedia].some((fragment) => this.src.includes(fragment))) {
        return Promise.reject(new Error("forced media rejection"));
      }
      if (!mediaUnlocked) {
        if (deferBlockedRejects) {
          return new Promise((_, reject) => pendingBlockedRejects.push(reject));
        }
        return Promise.reject(new Error("blocked by autoplay policy"));
      }
      if (deferNextMediaPlayFor && this.src.includes(deferNextMediaPlayFor)) {
        deferNextMediaPlayFor = null;
        return new Promise((resolve) =>
          pendingMediaPlayResolves.push({
            src: this.src,
            resolve: () => {
              this.ended = false;
              this.playing = true;
              resolve();
            }
          })
        );
      }
      this.ended = false;
      this.playing = true;
      return Promise.resolve();
    }

    pause() {
      this.playing = false;
      this.dispatchEvent("pause");
    }
  }
  const addListener = (type, handler) => {
    const handlers = listeners.get(type) || [];
    handlers.push(handler);
    listeners.set(type, handlers);
  };
  const removeListener = (type, handler) => {
    const handlers = listeners.get(type) || [];
    listeners.set(
      type,
      handlers.filter((candidate) => candidate !== handler)
    );
  };
  const fakeWindow = {
    AudioContext: FakeAudioContext,
    addEventListener: addListener,
    removeEventListener: removeListener,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis)
  };
  const fakeDocument = {
    documentElement: { dataset: {} },
    get visibilityState() {
      return visibilityState;
    },
    addEventListener: addListener,
    removeEventListener: removeListener
  };
  const dispatchEvent = (type) => {
    for (const handler of listeners.get(type) || []) {
      handler({ type, key: "Enter" });
    }
  };
  const dispatchUnlock = (type) => {
    mediaUnlocked = true;
    dispatchEvent(type);
  };
  const resolveResumes = () => {
    for (const resolve of pendingResumes.splice(0)) resolve();
  };
  const rejectBlockedPlays = () => {
    for (const reject of pendingBlockedRejects.splice(0)) reject(new Error("blocked by autoplay policy"));
  };
  const resolvePendingMediaPlays = () => {
    for (const pending of pendingMediaPlayResolves.splice(0)) pending.resolve();
  };
  const resolvePendingMediaPlaysMatching = (fragment) => {
    for (let index = pendingMediaPlayResolves.length - 1; index >= 0; index -= 1) {
      const pending = pendingMediaPlayResolves[index];
      if (!pending.src.includes(fragment)) continue;
      pendingMediaPlayResolves.splice(index, 1);
      pending.resolve();
    }
  };
  const makeFetchResponse = () => ({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  const resolvePendingFetches = () => {
    for (const resolve of pendingFetchResponses.splice(0)) resolve(makeFetchResponse());
  };
  const resolvePendingMediaLoads = () => {
    for (const element of pendingMediaLoads.splice(0)) {
      element.readyState = 4;
      element.dispatchEvent("loadeddata");
      element.dispatchEvent("canplay");
    }
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudioElement });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: () => {
      if (failNextFetch) {
        failNextFetch = false;
        return Promise.resolve({ ok: false, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
      }
      if (!deferNextFetch) return Promise.resolve(makeFetchResponse());
      deferNextFetch = false;
      return new Promise((resolve) => pendingFetchResponses.push(resolve));
    }
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback) => {
      if (runAnimationFrames) callback(performance.now() + 1000);
      return 1;
    }
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: () => undefined });

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
    assert(audio.isMusicPlaying("menu"), "Expected started menu music to report as playing");
    audio.pauseMusic();
    assert(!audio.isMusicPlaying("menu"), "Expected paused menu music not to report as playing");
    assert(
      !document.documentElement.dataset.echoShiftMusicPlayback,
      `Expected pauseMusic to clear music playback diagnostic, got ${document.documentElement.dataset.echoShiftMusicPlayback}`
    );
    audio.resumeMusic();
    await settlePromises();
    assert(menu.playing && audio.isMusicPlaying("menu"), "Expected resumeMusic to restart menu playback diagnostics");
    deferNextMediaPlayFor = "Main Menu";
    const menuRestartPlayCalls = menu.playCalls;
    audio.playMusic("menu", { restart: true });
    assert(!menu.playing, "Expected same-key menu restart to pause while replay is pending");
    assert(!audio.isMusicPlaying("menu"), "Expected same-key restart not to report music playing before replay resolves");
    assert(
      !document.documentElement.dataset.echoShiftMusicPlayback,
      `Expected same-key restart to clear music playback diagnostic until replay resolves, got ${document.documentElement.dataset.echoShiftMusicPlayback}`
    );
    resolvePendingMediaPlaysMatching("Main Menu");
    await settlePromises();
    assert(
      menu.playCalls === menuRestartPlayCalls + 1 && menu.playing && audio.isMusicPlaying("menu"),
      "Expected same-key restart to report playing only after replay resolves"
    );
    const menuCallsBeforeTransportLoss = menu.playCalls;
    menu.pause();
    assert(
      !document.documentElement.dataset.echoShiftMusicPlayback,
      `Expected browser-paused menu transport to clear music playback diagnostic, got ${document.documentElement.dataset.echoShiftMusicPlayback}`
    );
    assert(
      document.documentElement.dataset.echoShiftAudioState === "stopped",
      `Expected browser-paused menu transport to stop audio-state diagnostic, got ${document.documentElement.dataset.echoShiftAudioState}`
    );
    assert(!audio.isMusicPlaying("menu"), "Expected browser-paused menu transport not to report as playing");
    dispatchEvent("focus");
    await settlePromises();
    assert(
      menu.playCalls > menuCallsBeforeTransportLoss && menu.playing && audio.isMusicPlaying("menu"),
      "Expected focus recovery to restart browser-paused menu transport"
    );
    assert(
      document.documentElement.dataset.echoShiftMusicPlayback === "menu:playing",
      `Expected recovered menu transport to restore music playback diagnostic, got ${document.documentElement.dataset.echoShiftMusicPlayback}`
    );
    menu.ended = true;
    menu.dispatchEvent("ended");
    assert(
      !document.documentElement.dataset.echoShiftMusicPlayback,
      `Expected ended menu transport to clear music playback diagnostic, got ${document.documentElement.dataset.echoShiftMusicPlayback}`
    );
    assert(
      document.documentElement.dataset.echoShiftAudioState === "stopped",
      `Expected ended menu transport to stop audio-state diagnostic, got ${document.documentElement.dataset.echoShiftAudioState}`
    );
    assert(!audio.isMusicPlaying("menu"), "Expected ended menu transport not to report as playing");
    dispatchEvent("focus");
    await settlePromises();
    assert(menu.playing && audio.isMusicPlaying("menu"), "Expected focus recovery to restart ended menu transport");
    assert(
      document.documentElement.dataset.echoShiftAudioState === "playing",
      `Expected recovered ended menu transport to restore playing audio-state diagnostic, got ${document.documentElement.dataset.echoShiftAudioState}`
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
    const sampledCueChecks = [
      ["rewind", "rewind"],
      ["switch", "switch"],
      ["portal", "portal"],
      ["stormFloorBeam", "storm_floor_beam"],
      ["cryoBeamFire", "cryo_beam_fire"],
      ["cryoFloorIceForm", "cryo_floor_ice_form"],
      ["archiveBookImpact", "archive_book_impact"],
      ["bossCoreHit", "boss_core_hit"]
    ];
    for (const [name, fragment] of sampledCueChecks) {
      audio.play(name);
      await settlePromises();
      const effect = mediaElements.find((element) => element.src.includes(fragment) && element.playing);
      assert(effect, `Expected sampled ${name} SFX to play from ${fragment}`);
    }
    mediaUnlocked = false;
    const tonesBeforeBlockedOneShot = startedTones.length;
    const elementsBeforeBlockedOneShot = mediaElements.length;
    audio.play("stormFloorBeam");
    await settlePromises();
    const blockedStormFloorBeam = mediaElements
      .slice(elementsBeforeBlockedOneShot)
      .find((element) => element.src.includes("storm_floor_beam"));
    assert(
      blockedStormFloorBeam?.playCalls === 1 && !blockedStormFloorBeam.playing,
      `Expected blocked one-shot sample to wait for unlock, got ${JSON.stringify({
        playCalls: blockedStormFloorBeam?.playCalls,
        playing: blockedStormFloorBeam?.playing
      })}`
    );
    assert(
      startedTones.length === tonesBeforeBlockedOneShot &&
        document.documentElement.dataset.echoShiftAudioEffects?.includes("blocked:stormFloorBeam") &&
        !document.documentElement.dataset.echoShiftAudioEffects?.includes("fallback:stormFloorBeam"),
      `Expected recoverably blocked one-shot sample not to synth-fallback, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    dispatchUnlock("keydown");
    await settlePromises();
    assert(
      blockedStormFloorBeam.playCalls >= 2 && blockedStormFloorBeam.playing,
      `Expected blocked one-shot sample to retry after unlock, got ${JSON.stringify({
        playCalls: blockedStormFloorBeam.playCalls,
        playing: blockedStormFloorBeam.playing
      })}`
    );
    assert(
      document.documentElement.dataset.echoShiftAudioEffects?.includes("play:stormFloorBeam"),
      `Expected retried one-shot sample to mark play diagnostic, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    mediaUnlocked = false;
    const elementsBeforeFocusRecoveryOneShot = mediaElements.length;
    audio.play("cryoBeamFire");
    await settlePromises();
    const blockedCryoBeamFire = mediaElements
      .slice(elementsBeforeFocusRecoveryOneShot)
      .find((element) => element.src.includes("cryo_beam_fire"));
    assert(
      blockedCryoBeamFire?.playCalls === 1 && !blockedCryoBeamFire.playing,
      `Expected focus-recovery one-shot sample to wait while blocked, got ${JSON.stringify({
        playCalls: blockedCryoBeamFire?.playCalls,
        playing: blockedCryoBeamFire?.playing
      })}`
    );
    mediaUnlocked = true;
    dispatchEvent("focus");
    await settlePromises();
    assert(
      blockedCryoBeamFire.playCalls >= 2 && blockedCryoBeamFire.playing,
      `Expected blocked one-shot sample to retry on focus recovery, got ${JSON.stringify({
        playCalls: blockedCryoBeamFire.playCalls,
        playing: blockedCryoBeamFire.playing
      })}`
    );
    mediaUnlocked = false;
    const elementsBeforeClearedOneShot = mediaElements.length;
    audio.play("bossCoreHit");
    await settlePromises();
    const clearedBossCoreHit = mediaElements
      .slice(elementsBeforeClearedOneShot)
      .find((element) => element.src.includes("boss_core_hit"));
    assert(
      clearedBossCoreHit?.playCalls === 1 && !clearedBossCoreHit.playing,
      `Expected clearable one-shot sample to wait while blocked, got ${JSON.stringify({
        playCalls: clearedBossCoreHit?.playCalls,
        playing: clearedBossCoreHit?.playing
      })}`
    );
    audio.clearBlockedSamples();
    mediaUnlocked = true;
    dispatchEvent("focus");
    await settlePromises();
    assert(
      clearedBossCoreHit.playCalls === 1 && !clearedBossCoreHit.playing,
      `Expected cleared blocked one-shot sample not to replay after focus, got ${JSON.stringify({
        playCalls: clearedBossCoreHit.playCalls,
        playing: clearedBossCoreHit.playing
      })}`
    );
    mediaUnlocked = false;
    const elementsBeforeLateClearedOneShot = mediaElements.length;
    audio.play("archiveBookImpact");
    await settlePromises();
    const lateClearedArchiveImpact = mediaElements
      .slice(elementsBeforeLateClearedOneShot)
      .find((element) => element.src.includes("archive_book_impact"));
    assert(
      lateClearedArchiveImpact?.playCalls === 1 && !lateClearedArchiveImpact.playing,
      `Expected late-clear one-shot sample to wait while blocked, got ${JSON.stringify({
        playCalls: lateClearedArchiveImpact?.playCalls,
        playing: lateClearedArchiveImpact?.playing
      })}`
    );
    mediaUnlocked = true;
    deferNextMediaPlayFor = "archive_book_impact";
    dispatchEvent("focus");
    await settlePromises();
    assert(
      lateClearedArchiveImpact.playCalls === 2 && !lateClearedArchiveImpact.playing,
      `Expected focus recovery to start one deferred retry before cleanup, got ${JSON.stringify({
        playCalls: lateClearedArchiveImpact.playCalls,
        playing: lateClearedArchiveImpact.playing
      })}`
    );
    audio.clearBlockedSamples();
    resolvePendingMediaPlaysMatching("archive_book_impact");
    await settlePromises();
    assert(
      lateClearedArchiveImpact.playCalls === 2 && !lateClearedArchiveImpact.playing && lateClearedArchiveImpact.currentTime === 0,
      `Expected late-resolving cleared one-shot sample not to play after cleanup, got ${JSON.stringify({
        playCalls: lateClearedArchiveImpact.playCalls,
        playing: lateClearedArchiveImpact.playing,
        currentTime: lateClearedArchiveImpact.currentTime
      })}`
    );
    mediaUnlocked = false;
    const elementsBeforeResolvedRetryCleanup = mediaElements.length;
    audio.play("cryoFloorIceForm");
    await settlePromises();
    const resolvedRetryCleanupIce = mediaElements
      .slice(elementsBeforeResolvedRetryCleanup)
      .find((element) => element.src.includes("cryo_floor_ice_form"));
    assert(
      resolvedRetryCleanupIce?.playCalls === 1 && !resolvedRetryCleanupIce.playing,
      `Expected resolved-retry cleanup sample to wait while blocked, got ${JSON.stringify({
        playCalls: resolvedRetryCleanupIce?.playCalls,
        playing: resolvedRetryCleanupIce?.playing
      })}`
    );
    mediaUnlocked = true;
    dispatchEvent("focus");
    await settlePromises();
    assert(
      resolvedRetryCleanupIce.playCalls === 2 && resolvedRetryCleanupIce.playing,
      `Expected blocked sample retry to resolve and start before cleanup, got ${JSON.stringify({
        playCalls: resolvedRetryCleanupIce.playCalls,
        playing: resolvedRetryCleanupIce.playing
      })}`
    );
    audio.clearBlockedSamples();
    await settlePromises();
    assert(
      resolvedRetryCleanupIce.playCalls === 2 && !resolvedRetryCleanupIce.playing && resolvedRetryCleanupIce.currentTime === 0,
      `Expected resolved retried one-shot sample to stop on cleanup, got ${JSON.stringify({
        playCalls: resolvedRetryCleanupIce.playCalls,
        playing: resolvedRetryCleanupIce.playing,
        currentTime: resolvedRetryCleanupIce.currentTime
      })}`
    );
    audio.startEffectLoop("bossDefeatDeparture", "test-boss-defeat", 1);
    await settlePromises();
    const bossDefeatLoop = mediaElements.find((element) => element.src.includes("boss_defeat_departure"));
    assert(bossDefeatLoop?.loop && bossDefeatLoop.playing, "Expected boss defeat departure SFX to start as a loop");
    assert(
      document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-start:test-boss-defeat:bossDefeatDeparture"),
      `Expected loop-start diagnostic for boss defeat departure, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    audio.setEffectLoopVolume("test-boss-defeat", 0.5);
    assert(bossDefeatLoop.volume > 0 && bossDefeatLoop.volume < 0.13, `Expected loop volume to scale with FX volume, got ${bossDefeatLoop.volume}`);
    const bossDefeatLoopCallsBeforeTransportLoss = bossDefeatLoop.playCalls;
    bossDefeatLoop.pause();
    dispatchEvent("focus");
    await settlePromises();
    assert(
      bossDefeatLoop.playCalls > bossDefeatLoopCallsBeforeTransportLoss && bossDefeatLoop.playing,
      "Expected focus recovery to restart a browser-paused boss defeat loop"
    );
    audio.pauseEffectLoops();
    assert(!bossDefeatLoop.playing, "Expected pauseEffectLoops to pause the active boss defeat loop");
    audio.resumeEffectLoops();
    await settlePromises();
    assert(bossDefeatLoop.playing, "Expected resumeEffectLoops to restart the active boss defeat loop");
    audio.stopEffectLoop("test-boss-defeat");
    assert(!bossDefeatLoop.playing && bossDefeatLoop.currentTime === 0, "Expected stopEffectLoop to reset the boss defeat loop element");
    assert(
      document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-stop:test-boss-defeat"),
      `Expected loop-stop diagnostic for boss defeat departure, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    mediaUnlocked = false;
    audio.startEffectLoop("bossDefeatDeparture", "blocked-boss-defeat", 1);
    await settlePromises();
    const blockedBossDefeatLoop = mediaElements.find((element) => element.src.includes("boss_defeat_departure") && element !== bossDefeatLoop);
    assert(
      blockedBossDefeatLoop?.playCalls === 1 && !blockedBossDefeatLoop.playing,
      `Expected blocked boss defeat loop to attempt once before unlock, got ${JSON.stringify({
        playCalls: blockedBossDefeatLoop?.playCalls,
        playing: blockedBossDefeatLoop?.playing
      })}`
    );
    assert(
      document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-blocked:blocked-boss-defeat:bossDefeatDeparture"),
      `Expected loop-blocked diagnostic for blocked boss defeat loop, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    dispatchUnlock("keydown");
    await settlePromises();
    assert(
      blockedBossDefeatLoop.playCalls >= 2 && blockedBossDefeatLoop.playing,
      `Expected unlock recovery to retry blocked boss defeat loop, got ${JSON.stringify({
        playCalls: blockedBossDefeatLoop.playCalls,
        playing: blockedBossDefeatLoop.playing
      })}`
    );
    audio.stopEffectLoop("blocked-boss-defeat");
    mediaUnlocked = true;
    deferNextMediaPlayFor = "boss_defeat_departure";
    audio.startEffectLoop("bossDefeatDeparture", "late-pause-boss-defeat", 1);
    await settlePromises();
    const latePauseBossDefeatLoop = mediaElements.find(
      (element) =>
        element.src.includes("boss_defeat_departure") &&
        element !== bossDefeatLoop &&
        element !== blockedBossDefeatLoop
    );
    assert(
      latePauseBossDefeatLoop?.playCalls === 1 && !latePauseBossDefeatLoop.playing,
      `Expected deferred boss defeat loop play to remain pending before pause, got ${JSON.stringify({
        playCalls: latePauseBossDefeatLoop?.playCalls,
        playing: latePauseBossDefeatLoop?.playing
      })}`
    );
    audio.pauseEffectLoops();
    latePauseBossDefeatLoop.currentTime = 0.67;
    resolvePendingMediaPlays();
    await settlePromises();
    assert(!latePauseBossDefeatLoop.playing, "Expected late-resolving paused boss defeat loop play to be paused again");
    assert(latePauseBossDefeatLoop.currentTime === 0, "Expected late-resolving paused boss defeat loop to rewind before resume");
    assert(
      !document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-start:late-pause-boss-defeat:bossDefeatDeparture"),
      `Expected late-resolving paused loop not to mark loop-start, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    audio.resumeEffectLoops();
    await settlePromises();
    assert(
      latePauseBossDefeatLoop.playCalls >= 2 && latePauseBossDefeatLoop.playing,
      "Expected resumeEffectLoops to restart the paused loop after a late play resolution"
    );
    audio.stopEffectLoop("late-pause-boss-defeat");
    deferNextMediaPlayFor = "boss_defeat_departure";
    audio.startEffectLoop("bossDefeatDeparture", "late-stop-boss-defeat", 1);
    await settlePromises();
    const lateStopBossDefeatLoop = mediaElements.find(
      (element) =>
        element.src.includes("boss_defeat_departure") &&
        element !== bossDefeatLoop &&
        element !== blockedBossDefeatLoop &&
        element !== latePauseBossDefeatLoop
    );
    assert(
      lateStopBossDefeatLoop?.playCalls === 1 && !lateStopBossDefeatLoop.playing,
      `Expected deferred boss defeat loop play to remain pending before stop, got ${JSON.stringify({
        playCalls: lateStopBossDefeatLoop?.playCalls,
        playing: lateStopBossDefeatLoop?.playing
      })}`
    );
    lateStopBossDefeatLoop.currentTime = 0.52;
    audio.stopEffectLoop("late-stop-boss-defeat");
    resolvePendingMediaPlays();
    await settlePromises();
    assert(!lateStopBossDefeatLoop.playing, "Expected late-resolving stopped boss defeat loop play to be paused again");
    assert(lateStopBossDefeatLoop.currentTime === 0, "Expected late-resolving stopped boss defeat loop to rewind");
    assert(
      !document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-start:late-stop-boss-defeat:bossDefeatDeparture"),
      `Expected late-resolving stopped loop not to mark loop-start, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    const tonesBeforeLoopFallback = startedTones.length;
    audio.startEffectLoop("bossDefeatDeparture", "fallback-boss-defeat", 1);
    await settlePromises();
    const fallbackBossDefeatLoop = mediaElements.find(
      (element) =>
        element.src.includes("boss_defeat_departure") &&
        element !== bossDefeatLoop &&
        element !== blockedBossDefeatLoop &&
        element !== latePauseBossDefeatLoop &&
        element !== lateStopBossDefeatLoop
    );
    fallbackBossDefeatLoop.dispatchEvent("error");
    await settlePromises();
    assert(!fallbackBossDefeatLoop.playing, "Expected failed boss defeat loop sample to stop its media element");
    assert(
      document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-fallback:fallback-boss-defeat:bossDefeatDeparture"),
      `Expected loop-fallback diagnostic for failed boss defeat loop sample, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    assert(startedTones.length > tonesBeforeLoopFallback, "Expected failed boss defeat loop sample to pulse a synth fallback");
    const fullScaleFallbackTone = startedTones.at(-1);
    const fullScaleFallbackGain = Math.max(...gainRampValues.slice(-8));
    audio.setEffectLoopVolume("fallback-boss-defeat", 0.25);
    const tonesBeforeScaledFallback = startedTones.length;
    const gainValuesBeforeScaledFallback = gainRampValues.length;
    audio.pauseEffectLoops();
    assert(fullScaleFallbackTone?.stopped, "Expected pauseEffectLoops to stop the active fallback boss defeat synth pulse");
    audio.resumeEffectLoops();
    await settlePromises();
    assert(startedTones.length > tonesBeforeScaledFallback, "Expected resumed fallback boss loop to pulse another synth tone");
    const reducedScaleFallbackTone = startedTones.at(-1);
    const reducedScaleFallbackGain = Math.max(...gainRampValues.slice(gainValuesBeforeScaledFallback));
    assert(
      reducedScaleFallbackGain > 0 && reducedScaleFallbackGain < fullScaleFallbackGain * 0.5,
      `Expected fallback synth pulse to scale down with loop volume, got full ${fullScaleFallbackGain} and reduced ${reducedScaleFallbackGain}`
    );
    audio.stopEffectLoop("fallback-boss-defeat");
    assert(reducedScaleFallbackTone?.stopped, "Expected stopEffectLoop to stop the active fallback boss defeat synth pulse");

    const tonesBeforeRejectedLoopFallback = startedTones.length;
    forceRejectedMedia.add("boss_defeat_departure");
    audio.startEffectLoop("bossDefeatDeparture", "rejected-loop-boss-defeat", 1);
    await settlePromises();
    forceRejectedMedia.clear();
    const rejectedLoopBossDefeat = mediaElements.find(
      (element) =>
        element.src.includes("boss_defeat_departure") &&
        element !== bossDefeatLoop &&
        element !== blockedBossDefeatLoop &&
        element !== latePauseBossDefeatLoop &&
        element !== lateStopBossDefeatLoop &&
        element !== fallbackBossDefeatLoop
    );
    assert(
      rejectedLoopBossDefeat?.playCalls === 1 && !rejectedLoopBossDefeat.playing,
      `Expected rejected boss defeat loop sample to stop after one play attempt, got ${JSON.stringify({
        playCalls: rejectedLoopBossDefeat?.playCalls,
        playing: rejectedLoopBossDefeat?.playing
      })}`
    );
    assert(
      document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-fallback:rejected-loop-boss-defeat:bossDefeatDeparture"),
      `Expected rejected loop play to use synth fallback, got ${document.documentElement.dataset.echoShiftAudioEffects}`
    );
    assert(startedTones.length > tonesBeforeRejectedLoopFallback, "Expected rejected loop play to pulse a synth fallback");
    audio.stopEffectLoop("rejected-loop-boss-defeat");

    const tonesBeforeRejectedSample = startedTones.length;
    forceRejectedMedia.add("player_jump");
    audio.play("jump");
    await settlePromises();
    forceRejectedMedia.clear();
    assert(
      startedTones.length > tonesBeforeRejectedSample,
      "Expected rejected sampled jump SFX to fall back to a synth tone"
    );

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

    assert(!audio.isMusicReady("boss"), "Expected an untouched looped boss soundtrack not to be Web Audio ready before preload");
    deferNextFetch = true;
    audio.playMusic("boss");
    await settlePromises();
    assert(pendingFetchResponses.length === 1, "Expected deferred Web Audio fetch for pending boss soundtrack");
    assert(!menu.playing, "Expected menu music to stop while a different looped soundtrack is still loading");
    resolvePendingFetches();
    await settlePromises();
    assert(audio.isMusicReady("boss"), "Expected resolved Web Audio boss soundtrack to be marked ready");

    audio.playMusic("menu", { restart: true });
    await settlePromises();
    assert(menu.playing, "Expected menu music restart to recover after pending boss music test");

    deferNextMediaLoad = true;
    const tutorialPreload = audio.preloadMusic("tutorial");
    await settlePromises();
    assert(!audio.isMusicReady("tutorial"), "Expected deferred tutorial media preload not to be ready immediately");
    assert(pendingMediaLoads.length === 1, "Expected deferred media load for tutorial soundtrack");
    resolvePendingMediaLoads();
    await tutorialPreload;
    assert(audio.isMusicReady("tutorial"), "Expected tutorial media soundtrack to be ready after media load resolves");

	    runAnimationFrames = false;
	    audio.playMusic("level-1");
	    await settlePromises();
	    const levelOneFadePauseSource = startedMusicSources.at(-1);
	    const levelOneContext = audioContexts.at(-1);
	    assert(audio.isMusicPlaying("level-1"), "Expected started Web Audio level music to report as playing");
	    levelOneContext.state = "suspended";
	    levelOneContext.onstatechange?.({ type: "statechange" });
	    assert(
	      !document.documentElement.dataset.echoShiftMusicPlayback,
	      `Expected suspended Web Audio context to clear music playback diagnostic, got ${document.documentElement.dataset.echoShiftMusicPlayback}`
	    );
	    assert(
	      document.documentElement.dataset.echoShiftAudioState === "suspended",
	      `Expected suspended Web Audio context to update audio-state diagnostic, got ${document.documentElement.dataset.echoShiftAudioState}`
	    );
	    assert(!audio.isMusicPlaying("level-1"), "Expected suspended Web Audio context not to report level music as playing");
	    dispatchEvent("focus");
	    await settlePromises();
	    assert(audio.isMusicPlaying("level-1"), "Expected focus recovery to restore Web Audio music playback state");
	    assert(
	      document.documentElement.dataset.echoShiftMusicPlayback === "level-1:playing",
	      `Expected recovered Web Audio context to restore music playback diagnostic, got ${document.documentElement.dataset.echoShiftMusicPlayback}`
	    );
	    assert(!menu.playing, "Expected outgoing menu music to stop once the requested Web Audio track is ready");
    audio.pauseMusic();
    assert(!menu.playing, "Expected pause to stop outgoing media music while media-to-Web fade is pending");
    assert(levelOneFadePauseSource.stopped, "Expected pause to stop current Web Audio music during media-to-Web fade");
    runAnimationFrames = true;

    audio.playMusic("menu", { restart: true });
    await settlePromises();
    assert(menu.playing, "Expected menu music restart to recover after paused media-to-Web transition");

    runAnimationFrames = false;
    failNextFetch = true;
    audio.playMusic("level-4");
    await settlePromises();
    const levelFourFallback = mediaElements.find((element) => element.src === soundtracks["level-4"].src);
    assert(
      levelFourFallback?.playing,
      "Expected failed Web Audio soundtrack load to fall back to the requested media soundtrack"
    );
    assert(audio.isMusicReady("level-4"), "Expected ready fallback media to count as ready for a looped soundtrack");
    const pendingFetchesBeforeFallbackRestart = pendingFetchResponses.length;
    const levelFourFallbackPlayCalls = levelFourFallback.playCalls;
    audio.playMusic("level-4", { restart: true });
    await settlePromises();
    assert(
      pendingFetchResponses.length === pendingFetchesBeforeFallbackRestart,
      "Expected same-key ready fallback restart not to start another Web Audio fetch"
    );
    assert(
      levelFourFallback.playing && levelFourFallback.playCalls === levelFourFallbackPlayCalls + 1 && levelFourFallback.volume > 0,
      "Expected same-key HTML fallback restart to keep playing at normal volume without a second fade"
    );
    audio.stopMusic();
    runAnimationFrames = true;

    audio.playMusic("menu", { restart: true });
    await settlePromises();
    assert(menu.playing, "Expected menu music restart to recover after failed Web Audio fallback");

    deferNextFetch = true;
    runAnimationFrames = false;
    const menuPlayCallsBeforePendingLoop = menu.playCalls;
    audio.playMusic("level-2");
    await settlePromises();
    assert(pendingFetchResponses.length === 1, "Expected deferred Web Audio fetch for pending looped soundtrack");
    audio.pauseMusic();
    audio.resumeMusic();
    await settlePromises();
    assert(
      menu.playCalls === menuPlayCallsBeforePendingLoop,
      "Expected resume during pending Web Audio decode not to replay the previous media soundtrack"
    );
    resolvePendingFetches();
    await settlePromises();
    const pendingLevelTwoSource = startedMusicSources.at(-1);
    assert(pendingLevelTwoSource?.loop === true, "Expected pending looped soundtrack to start with Web Audio after decode resolves");
    assert(
      pendingLevelTwoSource.loopStart === soundtracks["level-2"].loopStartSeconds &&
        pendingLevelTwoSource.loopEnd === soundtracks["level-2"].loopEndSeconds,
      "Expected pending looped soundtrack to keep authored Web Audio loop points after pause/resume"
    );
    audio.stopMusic();
    runAnimationFrames = true;

    deferNextFetch = true;
    const musicSourcesBeforeSilentPending = startedMusicSources.length;
    audio.playMusic("level-3");
    await settlePromises();
    assert(pendingFetchResponses.length === 1, "Expected deferred Web Audio fetch for pending soundtrack from silence");
    audio.pauseMusic();
    resolvePendingFetches();
    await settlePromises();
    assert(
      startedMusicSources.length === musicSourcesBeforeSilentPending,
      "Expected paused pending soundtrack from silence not to start until music resumes"
    );
    audio.resumeMusic();
    await settlePromises();
    const resumedPendingLevelThreeSource = startedMusicSources.at(-1);
    assert(
      startedMusicSources.length === musicSourcesBeforeSilentPending + 1 &&
        resumedPendingLevelThreeSource.loopStart === soundtracks["level-3"].loopStartSeconds &&
        resumedPendingLevelThreeSource.loopEnd === soundtracks["level-3"].loopEndSeconds,
      "Expected pending soundtrack from silence to start with authored loop points after resume"
    );
    audio.stopMusic();

    runAnimationFrames = false;
    failNextFetch = true;
    audio.playMusic("final-boss");
    audio.pauseMusic();
    await settlePromises();
    const pausedFinalBossFallback = mediaElements.find((element) => element.src === soundtracks["final-boss"].src);
    assert(
      pausedFinalBossFallback && pausedFinalBossFallback.playCalls === 0 && !pausedFinalBossFallback.playing,
      "Expected paused Web Audio load failure to queue the requested fallback media without starting it"
    );
    audio.resumeMusic();
    await settlePromises();
    assert(pausedFinalBossFallback.playing, "Expected queued fallback media to start after resume");
    audio.stopMusic();
    runAnimationFrames = true;

    audio.playMusic("level-1");
    await settlePromises();
    const levelOneLoopStart = soundtracks["level-1"].loopStartSeconds;
    const levelOneLoopEnd = soundtracks["level-1"].loopEndSeconds;
    const levelOneSource = startedMusicSources.at(-1);
    assert(levelOneLoopStart === 8.97 && levelOneLoopEnd === 43.311, "Expected Level 1 soundtrack loop points to match selected audition values");
    assert(levelOneSource?.loop === true, "Expected level music with authored loop points to use Web Audio looping");
    assert(levelOneSource.loopStart === levelOneLoopStart, `Expected Web Audio loopStart ${levelOneLoopStart}, got ${levelOneSource.loopStart}`);
    assert(levelOneSource.loopEnd === levelOneLoopEnd, `Expected Web Audio loopEnd ${levelOneLoopEnd}, got ${levelOneSource.loopEnd}`);
    assert(levelOneSource.startOffset === 0, `Expected first level music play to start at 0, got ${levelOneSource.startOffset}`);
    audioContexts.at(-1).currentTime += 17.25;
    runAnimationFrames = false;
    audio.playMusic("level-1", { restart: true });
    await settlePromises();
    const restartedLevelOneSource = startedMusicSources.at(-1);
    assert(restartedLevelOneSource !== levelOneSource, "Expected restarted Web Audio music to create a fresh buffer source");
    assert(restartedLevelOneSource.startOffset === 0, `Expected retry/replay music restart to start level track at 0, got ${restartedLevelOneSource.startOffset}`);
    assert(levelOneSource.stopped, "Expected same-track restart to stop the previous Web Audio music source before fade completion");
    runAnimationFrames = true;

    runAnimationFrames = false;
    const activeWebSourceBeforePendingTransition = restartedLevelOneSource;
    const musicSourcesBeforePendingWebTransition = startedMusicSources.length;
    deferNextFetch = true;
    audio.playMusic("level-5");
    await settlePromises();
    assert(pendingFetchResponses.length === 1, "Expected deferred Web Audio fetch for pending Web-to-Web transition");
    audio.pauseMusic();
    assert(activeWebSourceBeforePendingTransition.stopped, "Expected pause to stop the outgoing Web Audio source during a pending Web-to-Web transition");
    audio.resumeMusic();
    await settlePromises();
    assert(
      startedMusicSources.length === musicSourcesBeforePendingWebTransition,
      "Expected resume during pending Web-to-Web transition not to restart the stale outgoing Web Audio track"
    );
    resolvePendingFetches();
    await settlePromises();
    const pendingLevelFiveSource = startedMusicSources.at(-1);
    assert(
      startedMusicSources.length === musicSourcesBeforePendingWebTransition + 1 &&
        pendingLevelFiveSource.loopStart === soundtracks["level-5"].loopStartSeconds &&
        pendingLevelFiveSource.loopEnd === soundtracks["level-5"].loopEndSeconds,
      "Expected pending Web-to-Web transition to start the requested soundtrack with authored loop points after decode"
    );
    audio.stopMusic();
    runAnimationFrames = true;

    audio.playMusic("level-1", { restart: true });
    await settlePromises();
    const crossfadeOutgoingLevelOneSource = startedMusicSources.at(-1);
    runAnimationFrames = false;
    audio.playMusic("level-2");
    await settlePromises();
    const levelTwoSourceBeforePause = startedMusicSources.at(-1);
    assert(crossfadeOutgoingLevelOneSource.stopped, "Expected outgoing Web Audio source to stop once the requested track is ready");
    audio.pauseMusic();
    assert(crossfadeOutgoingLevelOneSource.stopped, "Expected pause to stop outgoing Web Audio source while fade is pending");
    assert(levelTwoSourceBeforePause.stopped, "Expected pause to stop current Web Audio source");

    audio.playMusic("level-2", { restart: true });
    await settlePromises();
    const levelTwoSourceBeforeStop = startedMusicSources.at(-1);
    audio.playMusic("level-3");
    await settlePromises();
    const levelThreeSourceBeforeStop = startedMusicSources.at(-1);
    assert(levelTwoSourceBeforeStop.stopped, "Expected previous Web Audio source to stop once the next requested track is ready");
    audio.stopMusic();
    assert(levelTwoSourceBeforeStop.stopped, "Expected stopMusic to stop outgoing Web Audio source while fade is pending");
    assert(levelThreeSourceBeforeStop.stopped, "Expected stopMusic to stop current Web Audio source");
    runAnimationFrames = true;

    mediaUnlocked = false;
    audio.playMusic("tutorial");
    await settlePromises();
    const tutorialMusic = mediaElements.find((element) => element.src.includes("Tutorial"));
    assert(tutorialMusic?.playCalls === 1 && !tutorialMusic.playing, "Expected tutorial music switch to be blocked before recovery");
    mediaUnlocked = true;
    dispatchEvent("focus");
    await settlePromises();
    assert(tutorialMusic.playCalls >= 2 && tutorialMusic.playing, "Expected focus recovery to retry and start blocked tutorial music");

    mediaUnlocked = false;
    audio.playMusic("menu", { restart: true });
    await settlePromises();
    assert(menu.playCalls >= 3 && !menu.playing, "Expected menu music restart to be blocked before visibility recovery");
    mediaUnlocked = true;
    visibilityState = "hidden";
    dispatchEvent("visibilitychange");
    await settlePromises();
    const menuCallsBeforeVisibleRecovery = menu.playCalls;
    assert(menu.playing === false, "Expected hidden visibilitychange not to retry blocked music");
    visibilityState = "visible";
    dispatchEvent("visibilitychange");
    await settlePromises();
	    assert(menu.playCalls > menuCallsBeforeVisibleRecovery && menu.playing, "Expected visible recovery to retry and start blocked menu music");

	    mediaUnlocked = true;
	    const lateDisposeAudio = new SynthAudio();
	    const mediaElementsBeforeLateDispose = mediaElements.length;
	    deferNextMediaPlayFor = "boss_defeat_departure";
	    lateDisposeAudio.startEffectLoop("bossDefeatDeparture", "late-dispose-boss-defeat", 1);
	    await settlePromises();
	    const lateDisposeBossDefeatLoop = mediaElements
	      .slice(mediaElementsBeforeLateDispose)
	      .find((element) => element.src.includes("boss_defeat_departure") && element.loop && !element.playing);
	    assert(lateDisposeBossDefeatLoop?.playCalls === 1, "Expected boss defeat loop play to be pending before dispose");
	    lateDisposeBossDefeatLoop.currentTime = 0.48;
	    lateDisposeAudio.dispose();
	    resolvePendingMediaPlaysMatching("boss_defeat_departure");
	    await settlePromises();
	    assert(!lateDisposeBossDefeatLoop.playing, "Expected late-resolving disposed boss defeat loop play to be paused again");
	    assert(lateDisposeBossDefeatLoop.currentTime === 0, "Expected late-resolving disposed boss defeat loop to rewind");
	    assert(
	      !document.documentElement.dataset.echoShiftAudioEffects?.includes("loop-start:late-dispose-boss-defeat:bossDefeatDeparture"),
	      `Expected late-resolving disposed loop not to mark loop-start, got ${document.documentElement.dataset.echoShiftAudioEffects}`
	    );

	    audio.playMusic("menu", { restart: true });
	    await settlePromises();
	    assert(document.documentElement.dataset.echoShiftMusicKey === "menu", "Expected menu music key diagnostic before dispose");
	    audio.startEffectLoop("bossDefeatDeparture", "dispose-boss-defeat", 1);
	    await settlePromises();
    const disposeBossDefeatLoop = mediaElements.find((element) => element.src.includes("boss_defeat_departure") && element.loop && element.playing);
    assert(disposeBossDefeatLoop, "Expected boss defeat loop to be active before audio disposal");
    const tonesBeforeDisposedSampleReject = startedTones.length;
    deferBlockedRejects = true;
    mediaUnlocked = false;
    audio.play("jump");
    await settlePromises();
    audio.dispose();
    assert(
      !disposeBossDefeatLoop.playing && disposeBossDefeatLoop.src === "",
      `Expected audio.dispose to stop and unload active boss defeat loop, got ${JSON.stringify({
        playing: disposeBossDefeatLoop.playing,
        src: disposeBossDefeatLoop.src
      })}`
    );
	    assert(
	      document.documentElement.dataset.echoShiftAudioEffects === undefined,
	      `Expected audio.dispose to clear effect diagnostics, got ${document.documentElement.dataset.echoShiftAudioEffects}`
	    );
	    assert(
	      document.documentElement.dataset.echoShiftMusicKey === undefined,
	      `Expected audio.dispose to clear music key diagnostic, got ${document.documentElement.dataset.echoShiftMusicKey}`
	    );
    rejectBlockedPlays();
    await settlePromises();
    assert(
      startedTones.length === tonesBeforeDisposedSampleReject,
      "Expected late sampled SFX rejection after dispose not to start a fallback tone"
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("document", previousDocument);
    restoreGlobal("Audio", previousAudio);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("requestAnimationFrame", previousRequestAnimationFrame);
    restoreGlobal("cancelAnimationFrame", previousCancelAnimationFrame);
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
  const { encodeInputFrame } = await server.ssrLoadModule("/src/game/recording.ts");
  const { levels } = await server.ssrLoadModule("/src/data/levels.ts");
  const { level1SpringtideSprint } = await server.ssrLoadModule("/src/data/level-1-springtide-sprint.ts");
  const { tutorialLevel } = await server.ssrLoadModule("/src/data/tutorialLevel.ts");
  const { doorRequiredCoreIds, isMajorCore, movingLaserRectAt } = await server.ssrLoadModule("/src/game/objects.ts");
  const { EDITOR_DRAFT_STORAGE_KEY, readEditorDraftSnapshot } = await server.ssrLoadModule("/src/data/editorDraft.ts");
  const { getBestScores, isBetterLevelScore, recordLevelScore } = await server.ssrLoadModule("/src/game/progress.ts");
  const {
    CORES_PER_BONUS_LIFE,
    campaignCoreCount,
    campaignLivesForLevel,
    registerCampaignCorePickup,
    resetCampaignVitals,
    syncCampaignLives
  } = await server.ssrLoadModule("/src/game/session.ts");
  const { soundtrackForBoss, soundtrackForLevel, soundtracks } = await server.ssrLoadModule("/src/game/soundtracks.ts");
  const { backgroundForLevel, levelBackgrounds } = await server.ssrLoadModule("/src/game/backgrounds.ts");
  const { backgroundAmbienceForLevel, backgroundAmbienceIsActive } = await server.ssrLoadModule("/src/game/backgroundAmbience.ts");
  const { terrainMaterialForSolid } = await server.ssrLoadModule("/src/game/terrainMaterials.ts");
  const {
    effectiveSolidDecorDensity,
    normalizeSolidDecorDensity,
    terrainDecorPropsForMaterial
  } = await server.ssrLoadModule("/src/game/terrainDecorProps.ts");
  const {
    bossAttackActiveFramesFor,
    bossAttackCycleFramesFor,
    bossAttackWindupFramesFor,
    BOSS_DEFEAT_PAUSE_FRAMES,
    bossIsVulnerable,
    DEFAULT_MONSTER_SCORE,
    defaultMonsterMotionForKind,
    defaultMonsterSpeedForKind,
    monsterAnimationProfileForKind,
    monsterKinds,
    monsterRectAt,
    monsterScore,
    monsterVisualTransformForKind
  } = await server.ssrLoadModule("/src/game/enemies.ts");
  const { SynthAudio } = await server.ssrLoadModule("/src/game/audio.ts");

  const bossNeedsAttackDodge = (boss) => {
    const cycleFrame = boss.activeFrames % bossAttackCycleFramesFor(boss);
    return boss.phase === "active" && cycleFrame >= bossAttackWindupFramesFor(boss) - 1 && !bossIsVulnerable(boss);
  };

  const runBossUntilVulnerable = (simulation, bossId) => {
    for (let frameIndex = 0; frameIndex < 420; frameIndex += 1) {
      const snapshots = simulation.bossSnapshots();
      const snapshot = snapshots.find((boss) => boss.id === bossId);
      if (snapshot && bossIsVulnerable(snapshot)) return snapshot;
      const danger = snapshots.find(bossNeedsAttackDodge);
      if (danger) {
        const levelCenterX = simulation.level.bounds.x + simulation.level.bounds.w / 2;
        const bodyCenterX = danger.body.x + danger.body.w / 2;
        const dodgeX = bodyCenterX < levelCenterX ? simulation.level.bounds.x + simulation.level.bounds.w - 56 : simulation.level.bounds.x + 32;
        Object.assign(simulation.player, { x: dodgeX, y: 18, vx: 0, vy: 0, onGround: false });
      }
      simulation.step(idle);
    }
    throw new Error(`Expected boss ${bossId} to expose a vulnerability window`);
  };

  const runBossUntilAttack = (simulation, bossId) => {
    for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
      const snapshots = simulation.bossSnapshots();
      const snapshot = snapshots.find((boss) => boss.id === bossId);
      const cycleFrame = snapshot ? snapshot.activeFrames % bossAttackCycleFramesFor(snapshot) : 0;
      if (snapshot?.attacks.length > 0 && cycleFrame < bossAttackWindupFramesFor(snapshot) + bossAttackActiveFramesFor(snapshot) - 1) return snapshot;
      const danger = snapshots.find(bossNeedsAttackDodge);
      if (danger) {
        const levelCenterX = simulation.level.bounds.x + simulation.level.bounds.w / 2;
        const bodyCenterX = danger.body.x + danger.body.w / 2;
        const dodgeX = bodyCenterX < levelCenterX ? simulation.level.bounds.x + simulation.level.bounds.w - 56 : simulation.level.bounds.x + 32;
        Object.assign(simulation.player, { x: dodgeX, y: 18, vx: 0, vy: 0, onGround: false });
      }
      simulation.step(idle);
    }
    throw new Error(`Expected boss ${bossId} to start an attack window`);
  };

  const runBossUntilSoundCue = (simulation, bossId, cue, maxFrames = 260) => {
    for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
      const event = simulation.step(idle);
      const soundCue = event.bossSoundCues.find((item) => item.id === bossId && item.cue === cue);
      if (soundCue) {
        const snapshot = simulation.bossSnapshots().find((boss) => boss.id === bossId);
        return { event, soundCue, snapshot };
      }
    }
    throw new Error(`Expected boss ${bossId} to emit ${cue} within ${maxFrames} frames`);
  };

  const countBossSoundCuesUntilActiveWindowEnds = (simulation, bossId, cues) => {
    const counts = new Map(cues.map((cue) => [cue, 0]));
    for (let guard = 0; guard < 180; guard += 1) {
      const snapshot = simulation.bossSnapshots().find((boss) => boss.id === bossId);
      if (!snapshot) break;
      const cycleFrame = snapshot.activeFrames % bossAttackCycleFramesFor(snapshot);
      if (cycleFrame >= bossAttackWindupFramesFor(snapshot) + bossAttackActiveFramesFor(snapshot)) break;
      const event = simulation.step(idle);
      for (const cue of cues) {
        counts.set(cue, (counts.get(cue) || 0) + event.bossSoundCues.filter((item) => item.id === bossId && item.cue === cue).length);
      }
    }
    return counts;
  };

  const runBossUntilWarning = (simulation, bossId, minProgress = 0.85) => {
    for (let frameIndex = 0; frameIndex < 160; frameIndex += 1) {
      const snapshots = simulation.bossSnapshots();
      const snapshot = snapshots.find((boss) => boss.id === bossId);
      if (snapshot && snapshot.activeFrames > 0 && snapshot.attackWarnings.length > 0 && snapshot.attacks.length === 0) {
        const cycleFrame = snapshot.activeFrames % bossAttackCycleFramesFor(snapshot);
        const progress = cycleFrame / Math.max(1, bossAttackWindupFramesFor(snapshot));
        if (progress >= minProgress) return snapshot;
      }
      const danger = snapshots.find(bossNeedsAttackDodge);
      if (danger) {
        const levelCenterX = simulation.level.bounds.x + simulation.level.bounds.w / 2;
        const bodyCenterX = danger.body.x + danger.body.w / 2;
        const dodgeX = bodyCenterX < levelCenterX ? simulation.level.bounds.x + simulation.level.bounds.w - 56 : simulation.level.bounds.x + 32;
        Object.assign(simulation.player, { x: dodgeX, y: 18, vx: 0, vy: 0, onGround: false });
      }
      simulation.step(idle);
    }
    throw new Error(`Expected boss ${bossId} to show an attack warning`);
  };

  const assertBossMotionSmoothForFrames = (simulation, bossId, frames, maxAxisStep, label) => {
    let previous = simulation.bossSnapshots().find((boss) => boss.id === bossId);
    let maxDx = 0;
    let maxDy = 0;
    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      simulation.step(idle);
      const current = simulation.bossSnapshots().find((boss) => boss.id === bossId);
      assert(previous && current, `Expected ${label} snapshots to remain available while checking boss motion`);
      const dx = Math.abs(current.body.x - previous.body.x);
      const dy = Math.abs(current.body.y - previous.body.y);
      maxDx = Math.max(maxDx, dx);
      maxDy = Math.max(maxDy, dy);
      assert(
        dx <= maxAxisStep && dy <= maxAxisStep,
        `Expected ${label} to avoid zappy movement, moved ${JSON.stringify({ dx, dy, maxAxisStep, previous: previous.body, current: current.body })}`
      );
      previous = current;
    }
    return { snapshot: previous, maxDx, maxDy };
  };

  const upwardHitBoss = (simulation, snapshot) => {
    const spot = snapshot.weakSpot;
    const playerWidth = simulation.player.w || 24;
    const floorTop = (simulation.level.solids || [])
      .filter((solid) => solid.w >= playerWidth && solid.y >= spot.y)
      .reduce((min, solid) => Math.min(min, solid.y), Number.POSITIVE_INFINITY);
    const standingTop = Number.isFinite(floorTop) ? floorTop - simulation.player.h - 1 : spot.y + spot.h + 2;
    const hitTop = snapshot.weakSpotKind === "core" ? spot.y + spot.h - 6 : Math.min(spot.y + spot.h + 2, standingTop);
    Object.assign(simulation.player, {
      x: spot.x + spot.w / 2 - playerWidth / 2,
      y: hitTop,
      vx: 0,
      vy: snapshot.weakSpotKind === "core" ? -14 : -8,
      onGround: false
    });
    return simulation.step(idle);
  };

  const jumpHitBoss = (simulation, snapshot) => {
    const spot = snapshot.weakSpot;
    const playerWidth = simulation.player.w || 24;
    const floorTop = (simulation.level.solids || [])
      .filter((solid) => solid.w >= playerWidth && solid.y >= spot.y)
      .reduce((min, solid) => Math.min(min, solid.y), Number.POSITIVE_INFINITY);
    assert(Number.isFinite(floorTop), `Expected a floor under boss weak spot for jump-hit test, got spot ${JSON.stringify(spot)}`);
    Object.assign(simulation.player, {
      x: spot.x + spot.w / 2 - playerWidth / 2,
      y: floorTop - simulation.player.h,
      vx: 0,
      vy: 0,
      onGround: true,
      coyote: 7,
      prevJump: false
    });
    for (let frameIndex = 0; frameIndex < 64; frameIndex += 1) {
      const events = simulation.step(frameIndex < 44 ? jump : idle);
      if (events.bossHit) return events;
    }
    return { bossHit: null };
  };

  const standUnderBossWeakSpot = (simulation, snapshot) => {
    const spot = snapshot.weakSpot;
    const playerWidth = simulation.player.w || 24;
    const floorTop = (simulation.level.solids || [])
      .filter((solid) => solidSupportsGameplay(solid) && solid.w >= playerWidth && solid.y >= spot.y && solid.x < spot.x + spot.w && solid.x + solid.w > spot.x)
      .reduce((min, solid) => Math.min(min, solid.y), Number.POSITIVE_INFINITY);
    assert(Number.isFinite(floorTop), `Expected a floor under boss weak spot for standing-hit test, got spot ${JSON.stringify(spot)}`);
    const standingTop = floorTop - simulation.player.h;
    const standingGap = standingTop - (spot.y + spot.h);
    assert(standingGap >= 6, `Expected boss weak spot to stay clearly above a standing player, got gap ${standingGap}`);
    Object.assign(simulation.player, {
      x: spot.x + spot.w / 2 - playerWidth / 2,
      y: standingTop,
      vx: 0,
      vy: 0,
      onGround: true,
      coyote: 7,
      prevJump: false
    });
    return simulation.step(idle);
  };

  const placePlayerAtShockEdge = (simulation, shock) => {
    const playerWidth = simulation.player.w || 24;
    const floorTop = (simulation.level.solids || [])
      .filter((solid) => solidSupportsGameplay(solid) && solid.y >= shock.y + shock.h - 1 && solid.x < shock.x + shock.w && solid.x + solid.w > shock.x)
      .reduce((min, solid) => Math.min(min, solid.y), Number.POSITIVE_INFINITY);
    assert(Number.isFinite(floorTop), `Expected a floor under storm boss floor shock ${JSON.stringify(shock)}`);
    Object.assign(simulation.player, {
      x: shock.x - playerWidth + 4,
      y: floorTop - simulation.player.h,
      vx: 0,
      vy: 0,
      onGround: true,
      coyote: 7,
      prevJump: false
    });
  };

  const placePlayerOnFloorEffect = (simulation, floorEffect, xOffset = 8) => {
    const playerWidth = simulation.player.w || 24;
    const floorTop = (simulation.level.solids || [])
      .filter(
        (solid) =>
          solidSupportsGameplay(solid) &&
          solid.y >= floorEffect.y + floorEffect.h - 1 &&
          solid.x < floorEffect.x + floorEffect.w &&
          solid.x + solid.w > floorEffect.x
      )
      .reduce((min, solid) => Math.min(min, solid.y), Number.POSITIVE_INFINITY);
    assert(Number.isFinite(floorTop), `Expected a floor under boss floor effect ${JSON.stringify(floorEffect)}`);
    Object.assign(simulation.player, {
      x: floorEffect.x + xOffset,
      y: floorTop - simulation.player.h,
      vx: 0,
      vy: 0,
      onGround: true,
      coyote: 7,
      prevJump: false
    });
    assert(simulation.player.x + playerWidth <= floorEffect.x + floorEffect.w, `Expected player to fit on floor effect ${JSON.stringify(floorEffect)}`);
  };

  const assertAttackStartsFromBoss = (snapshot, label) => {
    assert(snapshot.attacks.length > 0, `${label}: expected an active boss attack`);
    const attack = snapshot.attacks[0];
    assert(
      attack.originX >= snapshot.body.x - 1 && attack.originX <= snapshot.body.x + snapshot.body.w + 1,
      `${label}: expected attack origin x to be inside boss body, got ${attack.originX} for ${JSON.stringify(snapshot.body)}`
    );
    assert(
      attack.originY >= snapshot.body.y - 1 && attack.originY <= snapshot.body.y + snapshot.body.h + 1,
      `${label}: expected attack origin y to be inside boss body, got ${attack.originY} for ${JSON.stringify(snapshot.body)}`
    );
    if (attack.kind === "vertical") {
      assert(attack.y >= attack.originY - 1, `${label}: expected vertical attack to start at the boss, got y=${attack.y}, originY=${attack.originY}`);
    } else {
      assert(
        Math.abs(attack.y + attack.h / 2 - attack.originY) <= 2,
        `${label}: expected horizontal attack lane to pass through boss origin, got ${JSON.stringify(attack)}`
      );
    }
  };

  assert(levels.length === 4, `Expected 4 handcrafted levels, found ${levels.length}`);
  resetCampaignVitals();
  assert(campaignLivesForLevel(levels[0]) === 3, `Expected finite campaign lives to default to 3, got ${campaignLivesForLevel(levels[0])}`);
  assert(campaignLivesForLevel(tutorialLevel) === null, `Expected unlimited tutorial lives to bypass campaign lives, got ${campaignLivesForLevel(tutorialLevel)}`);
  for (let index = 1; index < CORES_PER_BONUS_LIFE; index += 1) {
    const award = registerCampaignCorePickup("bonus-test", `core-${index}`);
    assert(award.counted && award.livesAwarded === 0, `Expected core ${index} to count without a life award, got ${JSON.stringify(award)}`);
  }
  const bonusAward = registerCampaignCorePickup("bonus-test", `core-${CORES_PER_BONUS_LIFE}`);
  assert(
    bonusAward.counted && bonusAward.livesAwarded === 1 && bonusAward.lives === 4,
    `Expected ${CORES_PER_BONUS_LIFE}th core to award one life, got ${JSON.stringify(bonusAward)}`
  );
  const duplicateAward = registerCampaignCorePickup("bonus-test", `core-${CORES_PER_BONUS_LIFE}`);
  assert(!duplicateAward.counted && duplicateAward.livesAwarded === 0, `Expected duplicate core pickup to be ignored, got ${JSON.stringify(duplicateAward)}`);
  assert(campaignCoreCount() === CORES_PER_BONUS_LIFE, `Expected campaign core count to stop at ${CORES_PER_BONUS_LIFE}, got ${campaignCoreCount()}`);
  resetCampaignVitals(1);
  for (let index = 1; index < CORES_PER_BONUS_LIFE; index += 1) registerCampaignCorePickup("same-frame-death", `core-${index}`);
  syncCampaignLives(0);
  const sameFrameDeathAward = registerCampaignCorePickup("same-frame-death", `core-${CORES_PER_BONUS_LIFE}`);
  assert(
    sameFrameDeathAward.livesAwarded === 1 && sameFrameDeathAward.lives === 1,
    `Expected threshold core after same-frame death sync to leave one life, got ${JSON.stringify(sameFrameDeathAward)}`
  );
  resetCampaignVitals();
  assert(levels[3].id === "relay-key", `Expected Timber Archive to be the final campaign level, got ${levels[3].id}`);
  assert(levels[3].completion === "boss-defeat", "Expected Timber Archive to complete on boss defeat");
  assert(
    (levels[3].bosses || []).some((boss) => boss.kind === "archive-custodian" && boss.soundtrackKey === "final-boss"),
    "Expected final Timber Archive level to include an Archive Custodian using final boss music"
  );
  assert(
    levels[3].solids.some((solid) => solid.id === "archive-boss-floor" && solid.erodesWith === "archive-book" && solid.erosionTiles === 2),
    "Expected Timber Archive boss floor to be archive-book erodible"
  );
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
  assert(Boolean(levelBackgrounds["level-1-springtide-garden-fit"]), "Expected Springtide Garden full-plate background");
  assert(Boolean(levelBackgrounds["level-2-rainhouse-relay-fit"]), "Expected Rainhouse Relay full-plate background");
  assert(Boolean(levelBackgrounds["level-3-cryo-conservatory"]), "Expected Cryo Conservatory level background");
  assert(Boolean(levelBackgrounds["level-3-cryo-grove-fit"]), "Expected Cryo Grove full-plate background");
  assert(Boolean(levelBackgrounds["level-4-timber-archive"]), "Expected Timber Archive level background");
  assert(Boolean(levelBackgrounds["level-4-timber-archive-fit"]), "Expected Timber Archive full-plate background");
  assert(Boolean(levelBackgrounds["level-5-sunken-clockwork"]), "Expected Sunken Clockwork level background");
  assert(Boolean(levelBackgrounds["level-5-sunken-clockwork-fit"]), "Expected Sunken Clockwork full-plate background");
  assert(backgroundForLevel(levels[0], 0).key === "level-1-springtide-garden-fit", "Expected Level 1 to use Springtide Garden full-plate background");
  assert(backgroundForLevel(levels[1], 1).key === "level-2-rainhouse-relay-fit", "Expected Level 2 to use Rainhouse Relay full-plate background");
  assert(backgroundForLevel(levels[2], 2).key === "level-3-cryo-grove-fit", "Expected Level 3 to use Cryo Grove full-plate background");
  assert(backgroundForLevel(levels[3], 3).key === "level-4-timber-archive-fit", "Expected Level 4 to use Timber Archive full-plate background");
  assert(
    levels.every((level, index) => backgroundForLevel(level, index).renderMode === "fit-level"),
    "Expected campaign levels to use fit-level background render mode"
  );
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
  assert(soundtrackForLevel(levels[3], 3).key === "level-4", "Expected Level 4 to use Level 4 music");
  assert(soundtrackForLevel({ ...levels[3], soundtrackKey: undefined }, 5).key === "level-1", "Expected missing retired level-6 slot to use safe fallback");
  assert(soundtrackForLevel({ ...levels[3], soundtrackKey: "missing-track" }, 5).key === "level-1", "Expected unknown soundtrack key to use safe fallback");
  assert(soundtrackForLevel({ ...levels[3], soundtrackKey: "menu" }, 5).key === "level-1", "Expected menu soundtrack key to be ignored for levels");
  assert(soundtrackForLevel({ ...levels[3], soundtrackKey: "boss" }, 5).key === "level-1", "Expected boss music key to be ignored for levels");
  assert(soundtrackForLevel({ ...levels[0], index: 9, soundtrackKey: undefined }, 1).key === "level-2", "Expected auto soundtrack fallback to use runtime level slot, not authored index");
  assert(soundtrackForBoss({ soundtrackKey: "level-3" }).key === "level-3", "Expected boss soundtrack override to allow level MP3 keys");
  assert(soundtrackForBoss({ soundtrackKey: "tutorial" }).key === "tutorial", "Expected boss soundtrack override to allow tutorial MP3");
  assert(soundtrackForBoss({ soundtrackKey: "menu" }).key === "boss", "Expected menu soundtrack key to be ignored for bosses");
  assert(soundtrackForBoss({ soundtrackKey: "missing-track" }).key === "boss", "Expected unknown boss soundtrack key to use boss fallback");
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
  assert(normalizeSolidDecorDensity("high") === "high", "Expected solid decor density high to normalize");
  assert(normalizeSolidDecorDensity("dense") === undefined, "Expected unknown solid decor density to be ignored");
  assert(
    effectiveSolidDecorDensity({ decorDensity: undefined }, "grass-organic") === "medium",
    "Expected grass-organic auto decor density to resolve to medium"
  );
  assert(
    effectiveSolidDecorDensity({ decorDensity: "off" }, "grass-organic") === "off",
    "Expected explicit off decor density to disable inferred props"
  );
  assert(
    effectiveSolidDecorDensity({ decorDensity: undefined }, "wood-archive") === "medium",
    "Expected wood-archive auto decor density to resolve to medium"
  );
  assert(
    tutorialLevel.solids.find((solid) => solid.id === "crate-marker")?.decorDensity === "off",
    "Expected tutorial crate marker to opt out of inferred wood-archive props"
  );
  assert(
    level1SpringtideSprint.solids.find((solid) => solid.id === "block-11")?.decorDensity === "off",
    "Expected Level 1 sprint wood marker block to opt out of inferred wood-archive props"
  );
  assert(
    terrainDecorPropsForMaterial("grass-organic").some((prop) => prop.category === "behind-surface-large" && prop.w !== prop.h),
    "Expected garden decor props to include variable-size large background props"
  );
  assert(
    terrainDecorPropsForMaterial("wood-archive").some((prop) => prop.category === "wall-decal" && prop.id === "timber-carved-panel"),
    "Expected wood-archive decor props to include Timber wall decals"
  );
  verifyGameSceneAudioCleanupHooks();
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
                    id: "bad-draft-monster-motion",
                    name: "Bad Draft Monster Motion",
                    monsters: [{ id: "partial-motion-monster", kind: "sprout-hopper", x: 120, y: 86, w: 28, h: 34, axis: "x", distance: 120 }]
                  }
                ]
              })
            : null
      }
    }
  });
  const malformedMonsterDraft = readEditorDraftSnapshot();
  if (previousWindow === undefined) delete globalThis.window;
  else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  assert(malformedMonsterDraft === null, "Expected draft reader to reject incomplete monster movement tuples");

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
  const coreFarmingFramesBeforeRewind = coreFarmingSim.totalFrames;
  assert(!coreFarmingSim.rewindToEcho(), "Short core pickup attempt should return without adding an echo");
  assert(coreFarmingSim.score === 100, `Short rewind should preserve current score, got ${coreFarmingSim.score}`);
  assert(coreFarmingSim.totalFrames === coreFarmingFramesBeforeRewind, `Short rewind should preserve visible time, got ${coreFarmingSim.totalFrames}`);
  assert(coreFarmingSim.objectState.collectedCores.has("core-a"), "Short rewind should preserve collected cores");
  assert(coreFarmingSim.player.x === coreLevel.start.x && coreFarmingSim.player.y === coreLevel.start.y, "Short rewind should still return the player to start");
  const paddedIdleRewindSim = new RoomSimulation(baseLevel);
  paddedIdleRewindSim.step(right);
  runFrames(paddedIdleRewindSim, 17, idle);
  assert(!paddedIdleRewindSim.rewindToEcho(), "Sub-threshold input padded by idle frames should not create an echo");
  assert(paddedIdleRewindSim.echoRecordings.length === 0, "Padded-idle rewind should not store an echo recording");

  const echoCoreLevel = {
    ...baseLevel,
    cores: [{ id: "core-echo", x: 118, y: 88, w: 20, h: 20 }]
  };
  const echoCoreSim = new RoomSimulation(echoCoreLevel);
  runFrames(echoCoreSim, 20, right);
  Object.assign(echoCoreSim.player, { x: 118, y: 86, vx: 0, vy: 0, onGround: true });
  const echoCoreFramesBeforeRewind = echoCoreSim.totalFrames;
  assert(echoCoreSim.rewindToEcho(), "Expected core setup attempt to become an echo");
  assert(echoCoreSim.totalFrames === echoCoreFramesBeforeRewind, `Rewind should preserve visible time, got ${echoCoreSim.totalFrames}`);
  assert(echoCoreSim.player.x === echoCoreLevel.start.x && echoCoreSim.player.y === echoCoreLevel.start.y, "Rewind should return player to start after anchoring echo");
  assert(echoCoreSim.echoes[0].x === 118 && echoCoreSim.echoes[0].y === 86, "Rewind should leave the echo at the anchor location");
  let echoCoreEvent = null;
  for (let i = 0; i < 4; i += 1) {
    const event = echoCoreSim.step(idle);
    if (event.core) {
      echoCoreEvent = event.core;
      break;
    }
  }
  assert(echoCoreEvent, "Echo did not collect the core from its anchor");
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
    Math.abs(launchFloatLandingSim.player.vy - -11.58) < 0.001,
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
  assert(deathSim.score === 0, `Death without prior score should keep score at 0, got ${deathSim.score}`);
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
  assert(lifeResetSim.score === 100, `Death should not subtract collected-core score before respawn, got ${lifeResetSim.score}`);
  lifeResetSim.resetLifeAttempt();
  assert(lifeResetSim.deaths === 1, `Life reset should preserve death count, got ${lifeResetSim.deaths}`);
  assert(lifeResetSim.livesRemaining() === 2, `Life reset should preserve lost life, got ${lifeResetSim.livesRemaining()} lives`);
  assert(lifeResetSim.totalFrames === 0, `Life reset should restart visible time, got ${lifeResetSim.totalFrames}`);
  assert(lifeResetSim.score === 0, `Life reset should restart visible score, got ${lifeResetSim.score}`);
  assert(!lifeResetSim.dead && lifeResetSim.player.alive, "Life reset should respawn a live player");

  const exhaustedLivesSim = new RoomSimulation(deathLevel, { lives: 2 });
  const firstDeath = exhaustedLivesSim.step(idle);
  exhaustedLivesSim.resetAttempt(false);
  const secondDeath = exhaustedLivesSim.step(idle);
  assert(firstDeath.died && !firstDeath.livesExhausted, "First two-life death should not require retry");
  assert(secondDeath.died && secondDeath.livesExhausted, "Second two-life death should require retry");
  assert(exhaustedLivesSim.livesRemaining() === 0, `Expected no lives remaining, got ${exhaustedLivesSim.livesRemaining()}`);

  const carriedLivesSim = new RoomSimulation(deathLevel, { lives: exhaustedLivesSim.livesRemaining() });
  assert(carriedLivesSim.livesRemaining() === 0, `Expected carried lives to initialize a new room at 0, got ${carriedLivesSim.livesRemaining()}`);
  carriedLivesSim.setLivesRemaining(3);
  carriedLivesSim.resetLevel(3);
  assert(carriedLivesSim.livesRemaining() === 3, `Expected reset with explicit global lives to restore 3, got ${carriedLivesSim.livesRemaining()}`);

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
  runFrames(monsterStompSim, 20, idle);
  monsterStompSim.currentRecording = Array.from({ length: 20 }, () => encodeInputFrame(right));
  assert(monsterStompSim.rewindToEcho(), "Expected monster stomp timeline to anchor an echo");
  assert(monsterStompSim.killedMonsterIds.has("stompable-test"), "Rewind should preserve killed monsters");
  assert(monsterStompSim.score === 250, `Rewind should preserve current monster score, got ${monsterStompSim.score}`);

  const forgivingMonsterStompSim = new RoomSimulation(monsterLevel);
  Object.assign(forgivingMonsterStompSim.player, { x: 42, y: 69, vx: 0, vy: 0, onGround: false });
  const forgivingMonsterStomp = forgivingMonsterStompSim.step(idle);
  assert(
    forgivingMonsterStomp.monsterKills.length === 1 && !forgivingMonsterStompSim.dead,
    "Expected slightly late centered top contact to kill stompable monster"
  );

  const edgeOverhangMonsterSim = new RoomSimulation(monsterLevel);
  Object.assign(edgeOverhangMonsterSim.player, { x: 20, y: 69, vx: 0, vy: 0, onGround: false });
  const edgeOverhangMonster = edgeOverhangMonsterSim.step(idle);
  assert(
    edgeOverhangMonster.monsterKills.length === 1 && !edgeOverhangMonsterSim.dead,
    "Expected top-foot contact on monster overhang to kill stompable monster"
  );

  const lowerSideMonsterSim = new RoomSimulation(monsterLevel);
  Object.assign(lowerSideMonsterSim.player, { x: 20, y: 86, vx: 0, vy: 0, onGround: false });
  const lowerSideMonster = lowerSideMonsterSim.step(idle);
  assert(lowerSideMonster.died && lowerSideMonsterSim.dead, "Expected lower side contact to remain lethal when player is not above the monster");

  const topContactBottomVulnerableSim = new RoomSimulation({
    ...baseLevel,
    monsters: [{ id: "bottom-only-top-test", kind: "glasswing-wisp", x: 40, y: 96, w: 28, h: 24 }]
  });
  Object.assign(topContactBottomVulnerableSim.player, { x: 42, y: 69, vx: 0, vy: 0, onGround: false });
  const topContactBottomVulnerable = topContactBottomVulnerableSim.step(idle);
  assert(
    topContactBottomVulnerable.died && topContactBottomVulnerableSim.dead,
    "Expected top contact on bottom-vulnerable monster to remain lethal"
  );

  const monsterSideSim = new RoomSimulation({
    ...baseLevel,
    monsters: [{ id: "side-danger-test", kind: "sprout-hopper", x: 20, y: 86, w: 28, h: 34 }]
  });
  const monsterSide = monsterSideSim.step(idle);
  assert(monsterSide.died && monsterSideSim.dead, "Expected side monster collision to kill player");
  const movingMonster = { id: "moving-monster-test", kind: "sprout-hopper", x: 20, y: 86, w: 28, h: 34, axis: "x", distance: 80, period: 120, phase: 0 };
  assert(monsterRectAt(movingMonster, 0).x === 20, `Expected moving monster to start at authored x, got ${JSON.stringify(monsterRectAt(movingMonster, 0))}`);
  assert(Math.round(monsterRectAt(movingMonster, 60).x) === 100, `Expected moving monster to reach path end halfway through cycle, got ${JSON.stringify(monsterRectAt(movingMonster, 60))}`);
  const defaultMonsterSpeeds = monsterKinds.map((kind) => defaultMonsterSpeedForKind(kind));
  assert(
    new Set(defaultMonsterSpeeds).size === monsterKinds.length,
    `Expected each monster kind to define a distinct default speed, got ${JSON.stringify(Object.fromEntries(monsterKinds.map((kind) => [kind, defaultMonsterSpeedForKind(kind)])))}`
  );
  const defaultMonsterScores = Object.fromEntries(monsterKinds.map((kind) => [kind, monsterScore({ kind })]));
  assert(
    Object.values(defaultMonsterScores).every((score) => score === DEFAULT_MONSTER_SCORE),
    `Expected every monster kind to default to ${DEFAULT_MONSTER_SCORE} score, got ${JSON.stringify(defaultMonsterScores)}`
  );
  const sproutDefaults = defaultMonsterMotionForKind("sprout-hopper");
  assert(
    sproutDefaults.axis === "x" && sproutDefaults.distance === 120 && sproutDefaults.period === 180,
    `Expected sprout default motion to preserve the editor baseline, got ${JSON.stringify(sproutDefaults)}`
  );
  const glasswingDefaults = defaultMonsterMotionForKind("glasswing-wisp");
  assert(
    glasswingDefaults.axis === "y" && glasswingDefaults.distance === 96 && glasswingDefaults.period !== sproutDefaults.period,
    `Expected glasswing defaults to use a distinct vertical motion profile, got ${JSON.stringify(glasswingDefaults)}`
  );
  const defaultRootMonster = { id: "root-default-test", kind: "root-roller", x: 30, y: 86, w: 28, h: 34, ...defaultMonsterMotionForKind("root-roller") };
  const defaultRootHalfway = monsterRectAt(defaultRootMonster, Math.round(defaultRootMonster.period / 2));
  assert(
    Math.round(defaultRootHalfway.x) === defaultRootMonster.x + defaultRootMonster.distance,
    `Expected applied default monster motion to move along its default path, got ${JSON.stringify({ defaultRootMonster, defaultRootHalfway })}`
  );
  const staticRootMonster = { id: "root-static-test", kind: "root-roller", x: 30, y: 86, w: 28, h: 34 };
  assert(
    monsterRectAt(staticRootMonster, 120).x === 30 && monsterRectAt(staticRootMonster, 120).y === 86,
    `Expected static monsters without authored motion to stay static, got ${JSON.stringify(monsterRectAt(staticRootMonster, 120))}`
  );
  assert(
    monsterAnimationProfileForKind("glasswing-wisp").frameInterval !== monsterAnimationProfileForKind("storm-snail").frameInterval,
    "Expected monster animation profiles to vary by kind"
  );
  const expectedMonsterAnimationStyles = {
    "sprout-hopper": "hop",
    "glasswing-wisp": "hover",
    "root-roller": "grounded-roll",
    "gutter-skimmer": "grounded-glide",
    "copper-leech": "hanging-sway",
    "storm-snail": "heavy-grounded",
    "frost-crawler": "grounded-crawl",
    "cryo-puffer": "pulse-float",
    "shard-wisp": "hover",
    bookbeetle: "grounded-crawl",
    "page-mote": "hover",
    "index-mimic": "heavy-grounded",
    "gear-tick": "mechanical-step",
    "pendulum-drone": "pendulum-sway",
    "sand-winder": "slither"
  };
  const monsterAnimationStyles = Object.fromEntries(monsterKinds.map((kind) => [kind, monsterAnimationProfileForKind(kind).style]));
  assert(
    JSON.stringify(monsterAnimationStyles) === JSON.stringify(expectedMonsterAnimationStyles),
    `Expected monster animation styles to keep distinct archetypes, got ${JSON.stringify(monsterAnimationStyles)}`
  );
  const groundedNoLiftKinds = ["root-roller", "gutter-skimmer", "storm-snail", "frost-crawler", "bookbeetle", "index-mimic", "gear-tick", "sand-winder"];
  for (const kind of groundedNoLiftKinds) {
    const profile = monsterAnimationProfileForKind(kind);
    const transform = monsterVisualTransformForKind(kind, 11, 1);
    assert(profile.liftAmplitude === 0, `Expected ${kind} to have no vertical lift in its grounded profile, got ${JSON.stringify(profile)}`);
    assert(transform.yOffset === 0, `Expected ${kind} visual transform to stay foot-locked, got ${JSON.stringify(transform)}`);
  }
  assert(
    monsterVisualTransformForKind("sprout-hopper", 7, 1).yOffset <= -14,
    `Expected sprout hopper to have a visible sprite-only hop, got ${JSON.stringify(monsterVisualTransformForKind("sprout-hopper", 7, 1))}`
  );
  assert(
    Math.abs(monsterVisualTransformForKind("glasswing-wisp", 9, 1).yOffset) >= 10 &&
      Math.abs(monsterVisualTransformForKind("glasswing-wisp", 9, 1).rotation) >= 0.1,
    `Expected glasswing wisp to have an obvious hover/tilt transform, got ${JSON.stringify(monsterVisualTransformForKind("glasswing-wisp", 9, 1))}`
  );
  assert(
    monsterAnimationProfileForKind("sprout-hopper").style !== monsterAnimationProfileForKind("root-roller").style,
    "Expected sprout hopper and root roller to use different visual animation archetypes"
  );

  const undersideMonsterSim = new RoomSimulation({
    ...baseLevel,
    monsters: [{ id: "under-test", kind: "copper-leech", x: 40, y: 50, w: 28, h: 24, score: 200 }]
  });
  Object.assign(undersideMonsterSim.player, { x: 42, y: 76, vx: 0, vy: -4, onGround: false });
  const undersideKill = undersideMonsterSim.step(idle);
  assert(undersideKill.monsterKills.length === 1, "Expected upward underside hit to kill vulnerable monster");

  const undersideOverhangMonsterSim = new RoomSimulation({
    ...baseLevel,
    monsters: [{ id: "under-overhang-test", kind: "copper-leech", x: 40, y: 50, w: 28, h: 24, score: 200 }]
  });
  Object.assign(undersideOverhangMonsterSim.player, { x: 20, y: 76, vx: 0, vy: -4, onGround: false });
  const undersideOverhangKill = undersideOverhangMonsterSim.step(idle);
  assert(
    undersideOverhangKill.monsterKills.length === 1 && !undersideOverhangMonsterSim.dead,
    "Expected upward head contact on monster underside overhang to kill bottom-vulnerable monster"
  );

  const bossLevel = {
    ...baseLevel,
    doors: [
      { id: "boss-door", x: 4, y: 4, w: 12, h: 12, opensWith: ["boss-test"] },
      { id: "boss-inverted-door", x: 22, y: 4, w: 12, h: 12, opensWith: ["boss-test"], inverted: true },
      { id: "boss-hatch", x: 40, y: 4, w: 48, h: 12, opensWith: ["boss-test"], orientation: "horizontal" },
      { id: "boss-inverted-hatch", x: 96, y: 4, w: 48, h: 12, opensWith: ["boss-test"], orientation: "horizontal", inverted: true }
    ],
    bosses: [{ id: "boss-test", kind: "storm-relay-warden", x: 40, y: 20, w: 220, h: 130, entrySide: "right", introSeconds: 17, health: 1, score: 1200 }]
  };
  const bossGateSim = new RoomSimulation(bossLevel);
  Object.assign(bossGateSim.player, { x: bossLevel.exit.x, y: bossLevel.exit.y, vx: 0, vy: 0 });
  bossGateSim.step(idle);
  assert(!bossGateSim.won, "Boss level exit should stay locked before boss defeat");
  assert(!bossGateSim.exitUnlocked(), "Boss level exit unlock state should be false before boss defeat");
  const initialInvertedHatchLevel = {
    ...baseLevel,
    start: { x: 20, y: 86 },
    bounds: { x: 0, y: 0, w: 320, h: 220 },
    solids: [
      { id: "lower-floor", x: 0, y: 160, w: 320, h: 40 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    doors: [{ id: "initial-inverted-hatch", x: 0, y: 120, w: 120, h: 12, opensWith: ["boss-test"], orientation: "horizontal", inverted: true }],
    bosses: [{ id: "boss-test", kind: "storm-relay-warden", x: 220, y: 20, w: 80, h: 80, entrySide: "right", introSeconds: 1, health: 1, score: 1200 }]
  };
  const initialInvertedHatchSim = new RoomSimulation(initialInvertedHatchLevel);
  assert(initialInvertedHatchSim.objectState.openDoors.has("initial-inverted-hatch"), "Expected inverted boss hatch to start open before the first frame");
  initialInvertedHatchSim.step(idle);
  assert(!initialInvertedHatchSim.player.onGround, "Expected initially open inverted boss hatch not to catch the player on frame one");
  assert(initialInvertedHatchSim.player.y > initialInvertedHatchLevel.start.y, "Expected player to begin falling through initially open inverted boss hatch");
  const bossIntroSim = new RoomSimulation(bossLevel);
  bossIntroSim.player.x = 260;
  assert(bossIntroSim.bossSnapshots().length === 0, "Idle boss should not expose a visible body snapshot before intro");
  bossIntroSim.player.x = bossLevel.start.x;
  const bossStart = bossIntroSim.step(idle);
  assert(bossStart.bossIntroStarted === "boss-test", "Expected boss arena overlap to start boss intro");
  assert(bossStart.bossCheckpointActivated === "boss-test", "Expected boss entry to create a checkpoint");
  const bossIntroSnapshot = bossIntroSim.bossSnapshots()[0];
  assert(bossIntroSnapshot?.introTotalFrames === 17 * 60, `Expected boss intro snapshot to use configured intro frames, got ${bossIntroSnapshot?.introTotalFrames}`);
  assert(bossIntroSnapshot?.weakSpotKind === "bottom", `Expected storm boss weak spot to default to bottom, got ${bossIntroSnapshot?.weakSpotKind}`);
  assert(
    bossIntroSnapshot?.body.x > bossLevel.bosses[0].x + bossLevel.bosses[0].w + 500,
    `Expected right-entry boss intro to begin off-screen, got ${JSON.stringify(bossIntroSnapshot?.body)}`
  );
  const centerEntryLevel = {
    ...bossLevel,
    bosses: [{ ...bossLevel.bosses[0], id: "center-entry-boss", entrySide: "center" }]
  };
  const centerEntrySim = new RoomSimulation(centerEntryLevel);
  centerEntrySim.step(idle);
  const centerEntrySnapshot = centerEntrySim.bossSnapshots()[0];
  assert(
    centerEntrySnapshot?.body.y < centerEntryLevel.bosses[0].y - 500,
    `Expected center-entry boss intro to begin above the viewport, got ${JSON.stringify(centerEntrySnapshot?.body)}`
  );
  assert(!bossIntroSim.dead, "Boss intro should not damage player on first contact");
  runFrames(bossIntroSim, 17 * 60 - 2, idle);
  const introBossState = bossIntroSim.bossStates.get("boss-test");
  assert(introBossState?.phase === "intro", `Expected boss to remain in intro before 17s completes, got ${introBossState?.phase}`);
  assert(!bossIntroSim.dead, "Boss intro should be harmless for the full transition window");
  bossIntroSim.step(idle);
  const activeBossState = bossIntroSim.bossStates.get("boss-test");
  assert(activeBossState?.phase === "active", `Expected boss to activate after 17s, got ${activeBossState?.phase}`);
  assert(activeBossState?.activeFrames === 0, `Expected boss active frames to start at 0, got ${activeBossState?.activeFrames}`);
  assert(bossIntroSim.bossSnapshots()[0].attacks.length === 0, "Expected boss active phase to start with a clear attack wind-up");
  assert(!bossIsVulnerable(bossIntroSim.bossSnapshots()[0]), "Expected boss weak point to stay guarded at the start of the active phase");
  const stormIntroLiftStart = bossIntroSim.bossSnapshots()[0];
  runFrames(bossIntroSim, 12, idle);
  const stormIntroLiftLater = bossIntroSim.bossSnapshots()[0];
  const stormIntroLiftDelta = stormIntroLiftStart.body.y - stormIntroLiftLater.body.y;
  assert(
    stormIntroLiftDelta > 0.2 && stormIntroLiftDelta < 18,
    `Expected storm boss to lift gradually after intro, moved ${stormIntroLiftDelta}px from ${stormIntroLiftStart.body.y} to ${stormIntroLiftLater.body.y}`
  );
  const stormLaneLevel = {
    ...bossLevel,
    bosses: [{ ...bossLevel.bosses[0], introSeconds: 1, health: 2 }]
  };
  const stormLaneSim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormLaneSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  stormLaneSim.step(idle);
  runFrames(stormLaneSim, 60, idle);
  const targetPlayerCenterX = 172;
  Object.assign(stormLaneSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const stormAttackSnapshot = runBossUntilAttack(stormLaneSim, "boss-test");
  assertAttackStartsFromBoss(stormAttackSnapshot, "storm boss downward attack");
  const stormAttack = stormAttackSnapshot.attacks[0];
  assert(stormAttack.kind === "vertical", `Expected storm boss to fire downward, got ${stormAttack.kind}`);
  assert(stormAttack.h > stormAttack.w * 2, `Expected storm beam to be a tall lane hazard, got ${JSON.stringify(stormAttack)}`);
  assert(
    Math.abs(stormAttack.originX - targetPlayerCenterX) <= 24,
    `Expected storm boss first attack lane to target player x ${targetPlayerCenterX}, got ${stormAttack.originX}`
  );
  assert(
    stormAttack.y + stormAttack.h >= stormLaneLevel.bosses[0].y + stormLaneLevel.bosses[0].h - 12,
    `Expected storm beam to reach the player lane floor, got ${JSON.stringify(stormAttack)}`
  );
  assert(stormAttackSnapshot.floorShocks.length === 1, `Expected active storm beam to heat one floor tile, got ${stormAttackSnapshot.floorShocks.length}`);
  const stormShock = stormAttackSnapshot.floorShocks[0];
  const stormFloor = stormLaneLevel.solids.find((solid) => solid.id === "floor");
  assert(stormFloor && stormShock.y + stormShock.h === stormFloor.y, `Expected storm floor shock to sit on top of the floor, got ${JSON.stringify(stormShock)}`);
  assert(stormShock.w === 136, `Expected storm floor shock to include one extra 32px tile on each side, got ${JSON.stringify(stormShock)}`);
  const stormSoundCueSim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormSoundCueSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  stormSoundCueSim.step(idle);
  runFrames(stormSoundCueSim, 60, idle);
  Object.assign(stormSoundCueSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const stormSoundCue = runBossUntilSoundCue(stormSoundCueSim, "boss-test", "storm-floor-beam", 380);
  const stormSoundCycle = stormSoundCue.snapshot.activeFrames % bossAttackCycleFramesFor(stormSoundCue.snapshot);
  assert(
    stormSoundCycle === bossAttackWindupFramesFor("storm-relay-warden"),
    `Expected storm beam SFX cue at active-window start, got cycle ${stormSoundCycle}`
	  );
	  assert(stormSoundCue.snapshot.floorShocks.length === 1, "Expected storm beam SFX cue to coincide with active floor shock");
	  Object.assign(stormSoundCueSim.player, { x: 32, y: 86, vx: 0, vy: 0, onGround: true });
	  const stormBeamWindowCueCounts = countBossSoundCuesUntilActiveWindowEnds(stormSoundCueSim, "boss-test", ["storm-floor-beam"]);
	  const stormBeamWindowCueCount =
	    stormSoundCue.event.bossSoundCues.filter((cue) => cue.id === "boss-test" && cue.cue === "storm-floor-beam").length +
	    (stormBeamWindowCueCounts.get("storm-floor-beam") || 0);
	  assert(stormBeamWindowCueCount === 1, `Expected exactly one storm beam SFX cue in the active window, got ${stormBeamWindowCueCount}`);
	  const stormLaterWindowSim = new RoomSimulation(stormLaneLevel);
	  Object.assign(stormLaterWindowSim.player, { x: 32, y: 86, vx: 0, vy: 0, onGround: true });
	  stormLaterWindowSim.step(idle);
	  runFrames(stormLaterWindowSim, 60, idle);
	  const stormLaterWindowState = stormLaterWindowSim.bossStates.get("boss-test");
	  stormLaterWindowState.activeFrames =
	    bossAttackCycleFramesFor("storm-relay-warden") + bossAttackWindupFramesFor("storm-relay-warden") - 1;
	  stormLaterWindowState.recoveryFrames = 0;
	  stormLaterWindowState.invulnerableFrames = 0;
	  const stormSecondSoundEvent = stormLaterWindowSim.step(idle);
	  const stormSecondSoundCue = {
	    event: stormSecondSoundEvent,
	    snapshot: stormLaterWindowSim.bossSnapshots().find((boss) => boss.id === "boss-test")
	  };
	  const stormSecondSoundCycle = stormSecondSoundCue.snapshot.activeFrames % bossAttackCycleFramesFor(stormSecondSoundCue.snapshot);
	  assert(
	    stormSecondSoundCycle === bossAttackWindupFramesFor("storm-relay-warden"),
	    `Expected later storm beam SFX cue at active-window start, got cycle ${stormSecondSoundCycle}`
	  );
	  assert(
	    stormSecondSoundEvent.bossSoundCues.some((cue) => cue.id === "boss-test" && cue.cue === "storm-floor-beam"),
	    `Expected later storm beam SFX cue on the beam-start frame, got ${JSON.stringify(stormSecondSoundEvent.bossSoundCues)}`
	  );
	  const stormSecondBeamWindowCueCounts = countBossSoundCuesUntilActiveWindowEnds(stormLaterWindowSim, "boss-test", ["storm-floor-beam"]);
	  const stormSecondBeamWindowCueCount =
	    stormSecondSoundEvent.bossSoundCues.filter((cue) => cue.id === "boss-test" && cue.cue === "storm-floor-beam").length +
	    (stormSecondBeamWindowCueCounts.get("storm-floor-beam") || 0);
	  assert(stormSecondBeamWindowCueCount === 1, `Expected exactly one later storm beam SFX cue in the active window, got ${stormSecondBeamWindowCueCount}`);

  const stormTallLiftLevel = {
    ...baseLevel,
    start: { x: 80, y: 286 },
    exit: { x: 372, y: 322, w: 28, h: 38 },
    bounds: { x: 0, y: 0, w: 420, h: 420 },
    solids: [
      { id: "floor", x: 0, y: 360, w: 420, h: 40 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 420 },
      { id: "right-wall", x: 420, y: 0, w: 20, h: 420 }
    ],
    bosses: [{ id: "tall-boss", kind: "storm-relay-warden", x: 40, y: 20, w: 320, h: 300, entrySide: "right", introSeconds: 1, health: 2, score: 1200 }]
  };
  const stormMissedCycleSim = new RoomSimulation(stormTallLiftLevel);
  Object.assign(stormMissedCycleSim.player, { x: 120, y: 286, vx: 0, vy: 0, onGround: false });
  stormMissedCycleSim.step(idle);
  runFrames(stormMissedCycleSim, 60, idle);
  const stormMissedVulnerable = runBossUntilVulnerable(stormMissedCycleSim, "tall-boss");
  Object.assign(stormMissedCycleSim.player, { x: 32, y: 326, vx: 0, vy: 0, onGround: true });
  const stormFramesUntilNextCycle =
    bossAttackCycleFramesFor(stormMissedVulnerable) - (stormMissedVulnerable.activeFrames % bossAttackCycleFramesFor(stormMissedVulnerable));
  runFrames(stormMissedCycleSim, stormFramesUntilNextCycle, idle);
  const stormMissedLiftStart = stormMissedCycleSim.bossSnapshots()[0];
  const stormMissedSmoothMotion = assertBossMotionSmoothForFrames(stormMissedCycleSim, "tall-boss", 12, 7.5, "storm missed-window lift");
  const stormMissedLiftLater = stormMissedSmoothMotion.snapshot;
  const stormMissedLiftDelta = stormMissedLiftStart.body.y - stormMissedLiftLater.body.y;
  assert(
    stormMissedLiftDelta > 0.2 && stormMissedLiftDelta < 12,
    `Expected storm boss to lift gradually after a missed weak point, moved ${stormMissedLiftDelta}px from ${stormMissedLiftStart.body.y} to ${stormMissedLiftLater.body.y}`
  );

  const stormShockDeathSim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormShockDeathSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  stormShockDeathSim.step(idle);
  runFrames(stormShockDeathSim, 60, idle);
  Object.assign(stormShockDeathSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const stormShockDeathAttack = runBossUntilAttack(stormShockDeathSim, "boss-test");
  placePlayerAtShockEdge(stormShockDeathSim, stormShockDeathAttack.floorShocks[0]);
  const stormShockDeath = stormShockDeathSim.step(idle);
  assert(stormShockDeath.died && stormShockDeathSim.dead, "Expected active storm floor shock edge to kill the player");

  const stormShockSafeSim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormShockSafeSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  stormShockSafeSim.step(idle);
  runFrames(stormShockSafeSim, 60, idle);
  Object.assign(stormShockSafeSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const stormShockSafeAttack = runBossUntilAttack(stormShockSafeSim, "boss-test");
  const stormShockSafeRect = stormShockSafeAttack.floorShocks[0];
  const stormShockSafeVulnerable = runBossUntilVulnerable(stormShockSafeSim, "boss-test");
  assert(stormShockSafeVulnerable.floorShocks.length === 0, "Expected storm floor shock to clear after the beam active window");
  placePlayerAtShockEdge(stormShockSafeSim, stormShockSafeRect);
  const stormShockSafeStep = stormShockSafeSim.step(idle);
  assert(!stormShockSafeStep.died && !stormShockSafeSim.dead, "Expected old storm floor shock tiles to be safe after the beam ends");

  const stormEdgeLaneSim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormEdgeLaneSim.player, { x: 252, y: 86, vx: 0, vy: 0, onGround: true });
  stormEdgeLaneSim.step(idle);
  runFrames(stormEdgeLaneSim, 60, idle);
  Object.assign(stormEdgeLaneSim.player, { x: 252, y: 86, vx: 0, vy: 0, onGround: true });
  const stormEdgeAttackSnapshot = runBossUntilAttack(stormEdgeLaneSim, "boss-test");
  const stormEdgeAttack = stormEdgeAttackSnapshot.attacks[0];
  const stormEdgeBodyCenterX = stormEdgeAttackSnapshot.body.x + stormEdgeAttackSnapshot.body.w / 2;
  assert(stormEdgeAttack.kind === "vertical", `Expected storm edge-lane attack to stay vertical, got ${stormEdgeAttack.kind}`);
  assert(
    Math.abs(stormEdgeAttack.originX - stormEdgeBodyCenterX) <= 1,
    `Expected storm edge-lane beam origin to match reachable body lane, got origin ${stormEdgeAttack.originX} and body center ${stormEdgeBodyCenterX}`
  );
  const guardedHitSim = new RoomSimulation(bossLevel);
  guardedHitSim.player.x = bossLevel.start.x;
  guardedHitSim.step(idle);
  runFrames(guardedHitSim, 17 * 60 - 1, idle);
  assert(upwardHitBoss(guardedHitSim, guardedHitSim.bossSnapshots()[0]).bossHit === null, "Expected guarded boss weak point to reject an early upward hit");
  const bossVulnerableSnapshot = runBossUntilVulnerable(bossIntroSim, "boss-test");
  assert(bossVulnerableSnapshot.attacks.length === 0, "Expected boss vulnerability window to open after the attack resolves");
  const bossHit = upwardHitBoss(bossIntroSim, bossVulnerableSnapshot);
  assert(bossHit.bossHit?.id === "boss-test", "Expected upward weak-point hit to damage active boss");
  assert(bossHit.bossDefeated?.score === 1200, `Expected boss defeat score event, got ${JSON.stringify(bossHit.bossDefeated)}`);
  assert(!bossHit.bossPortalUnlocked, "Expected boss defeat to delay exit portal unlock until departure finishes");
  assert(bossHit.switched, "Expected boss defeat to emit switched when boss-dependent doors change");
  assert(bossIntroSim.objectState.openDoors.has("boss-door"), "Expected boss-dependent door to open on the boss defeat step");
  assert(!bossIntroSim.objectState.openDoors.has("boss-inverted-door"), "Expected inverted boss-dependent door to close on the boss defeat step");
  assert(bossIntroSim.objectState.openDoors.has("boss-hatch"), "Expected horizontal boss-dependent hatch to open on the boss defeat step");
  assert(!bossIntroSim.objectState.openDoors.has("boss-inverted-hatch"), "Expected inverted horizontal boss hatch to close on the boss defeat step");
  const departingBoss = bossIntroSim.bossSnapshots().find((boss) => boss.id === "boss-test");
  assert(departingBoss?.phase === "departing", `Expected boss defeat to start departure phase, got ${departingBoss?.phase}`);
  assert(
    departingBoss.departurePauseFrames === BOSS_DEFEAT_PAUSE_FRAMES,
    `Expected boss defeat pause to start at ${BOSS_DEFEAT_PAUSE_FRAMES}, got ${departingBoss.departurePauseFrames}`
  );
  assert(departingBoss.departureFrames === 0, `Expected boss departure to start at frame 0, got ${departingBoss.departureFrames}`);
  assert(!bossIntroSim.exitUnlocked(), "Expected boss level exit to stay locked while defeated boss departs");
  assert(bossIntroSim.score === 1200, `Expected boss defeat score to apply, got ${bossIntroSim.score}`);
  const departureStartX = departingBoss.body.x;
  const departureStartY = departingBoss.body.y;
  let pauseUnlockEvent = null;
  let pauseEndSnapshot = departingBoss;
  for (let guard = 0; guard < BOSS_DEFEAT_PAUSE_FRAMES; guard += 1) {
    const event = bossIntroSim.step(idle);
    const snapshot = bossIntroSim.bossSnapshots().find((boss) => boss.id === "boss-test");
    if (event.bossPortalUnlocked || event.won) pauseUnlockEvent = event;
    if (snapshot) {
      pauseEndSnapshot = snapshot;
      assert(snapshot.departureFrames === 0, `Expected departure movement to stay at frame 0 during defeat pause, got ${snapshot.departureFrames}`);
    }
  }
  assert(!pauseUnlockEvent, "Expected boss portal unlock to wait until after the defeat pause and departure movement");
  assert(pauseEndSnapshot.departurePauseFrames === 0, `Expected defeat pause to finish before movement, got ${pauseEndSnapshot.departurePauseFrames}`);
  assert(
    Math.abs(pauseEndSnapshot.body.x - departureStartX) <= 0.01 && Math.abs(pauseEndSnapshot.body.y - departureStartY) <= 0.01,
    `Expected boss body to hold position during defeat pause, got start ${JSON.stringify(departingBoss.body)} and pause end ${JSON.stringify(pauseEndSnapshot.body)}`
  );
  let portalUnlockEvent = null;
  let departingMidpoint = null;
  for (let guard = 0; guard < departingBoss.departureTotalFrames + 20; guard += 1) {
    const event = bossIntroSim.step(idle);
    const snapshot = bossIntroSim.bossSnapshots().find((boss) => boss.id === "boss-test");
    if (!departingMidpoint && snapshot?.phase === "departing" && snapshot.departureFrames >= Math.floor(departingBoss.departureTotalFrames / 2)) {
      departingMidpoint = snapshot;
    }
    if (event.bossPortalUnlocked) {
      portalUnlockEvent = event;
      break;
    }
  }
  assert(departingMidpoint?.body.x > departureStartX + 20, `Expected departing boss to drift right before portal unlock, got ${JSON.stringify(departingMidpoint?.body)}`);
  assert(portalUnlockEvent?.bossPortalUnlocked, "Expected exit portal to unlock after boss departure finishes");
  assert(bossIntroSim.exitUnlocked(), "Expected boss level exit to unlock after boss departure");
  assert(bossIntroSim.bossStates.get("boss-test")?.phase === "defeated", "Expected boss to be marked defeated after departure finishes");
  const bossExitCampSim = new RoomSimulation(bossLevel);
  bossExitCampSim.player.x = bossLevel.start.x;
  bossExitCampSim.step(idle);
  runFrames(bossExitCampSim, 17 * 60 - 1, idle);
  const bossExitCampVulnerable = runBossUntilVulnerable(bossExitCampSim, "boss-test");
  const bossExitCampHit = upwardHitBoss(bossExitCampSim, bossExitCampVulnerable);
  assert(bossExitCampHit.bossDefeated?.id === "boss-test", "Expected exit-camping fixture to defeat the boss");
  Object.assign(bossExitCampSim.player, {
    x: bossLevel.exit.x + bossLevel.exit.w / 2 - bossExitCampSim.player.w / 2,
    y: bossLevel.exit.y + bossLevel.exit.h - bossExitCampSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  let bossExitCampUnlock = null;
  for (let guard = 0; guard < BOSS_DEFEAT_PAUSE_FRAMES + bossExitCampVulnerable.departureTotalFrames + 30; guard += 1) {
    const event = bossExitCampSim.step(idle);
    if (event.bossPortalUnlocked) {
      bossExitCampUnlock = event;
      break;
    }
  }
  assert(bossExitCampUnlock?.bossPortalUnlocked, "Expected exit-camping fixture to emit a portal unlock event");
  assert(!bossExitCampUnlock.won && !bossExitCampSim.won, "Expected portal unlock and exit completion to be separated when player waits in the exit");
  const bossExitCampWin = bossExitCampSim.step(idle);
  assert(bossExitCampWin.won && bossExitCampSim.won, "Expected exit-camping fixture to complete on the step after portal unlock");

  const bossDefeatCompletionLevel = {
    ...bossLevel,
    completion: "boss-defeat"
  };
  const bossDefeatCompletionExitSim = new RoomSimulation(bossDefeatCompletionLevel);
  Object.assign(bossDefeatCompletionExitSim.player, { x: bossDefeatCompletionLevel.exit.x, y: bossDefeatCompletionLevel.exit.y, vx: 0, vy: 0 });
  bossDefeatCompletionExitSim.step(idle);
  assert(!bossDefeatCompletionExitSim.won, "Boss-defeat completion should ignore exit contact before the boss is defeated");
  const bossDefeatCompletionSim = new RoomSimulation(bossDefeatCompletionLevel);
  bossDefeatCompletionSim.player.x = bossDefeatCompletionLevel.start.x;
  bossDefeatCompletionSim.step(idle);
  runFrames(bossDefeatCompletionSim, 17 * 60 - 1, idle);
  const bossDefeatCompletionVulnerable = runBossUntilVulnerable(bossDefeatCompletionSim, "boss-test");
  const bossDefeatCompletionHit = upwardHitBoss(bossDefeatCompletionSim, bossDefeatCompletionVulnerable);
  assert(bossDefeatCompletionHit.bossDefeated?.id === "boss-test", "Expected boss-defeat completion fixture to defeat the boss");
  let bossDefeatCompletionEvent = null;
  for (let guard = 0; guard < BOSS_DEFEAT_PAUSE_FRAMES + bossDefeatCompletionVulnerable.departureTotalFrames + 30; guard += 1) {
    const event = bossDefeatCompletionSim.step(idle);
    if (event.won) {
      bossDefeatCompletionEvent = event;
      break;
    }
  }
  assert(bossDefeatCompletionEvent?.won, "Expected boss-defeat level to complete when defeated boss departure finishes");
  assert(!bossDefeatCompletionEvent.bossPortalUnlocked, "Boss-defeat completion should not emit portal unlock");
  assert(bossDefeatCompletionSim.won, "Expected boss-defeat completion simulation to be won");
  const noBossDefeatCompletionLevel = {
    ...baseLevel,
    completion: "boss-defeat",
    bosses: []
  };
  const noBossDefeatCompletionSim = new RoomSimulation(noBossDefeatCompletionLevel);
  Object.assign(noBossDefeatCompletionSim.player, { x: noBossDefeatCompletionLevel.exit.x, y: noBossDefeatCompletionLevel.exit.y, vx: 0, vy: 0 });
  const noBossDefeatCompletion = noBossDefeatCompletionSim.step(idle);
  assert(noBossDefeatCompletion.won && noBossDefeatCompletionSim.won, "Boss-defeat levels without bosses should fall back to normal exit completion");
  const stormRecoverySim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormRecoverySim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  stormRecoverySim.step(idle);
  runFrames(stormRecoverySim, 60, idle);
  const stormRecoveryVulnerable = runBossUntilVulnerable(stormRecoverySim, "boss-test");
  const stormStandingHitSim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormStandingHitSim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  stormStandingHitSim.step(idle);
  runFrames(stormStandingHitSim, 60, idle);
  const stormStandingVulnerable = runBossUntilVulnerable(stormStandingHitSim, "boss-test");
  const stormStandingHit = standUnderBossWeakSpot(stormStandingHitSim, stormStandingVulnerable);
  assert(stormStandingHit.bossHit === null, "Expected standing under the storm boss vulnerable underside not to register without a jump");
  assert(stormStandingHitSim.bossSnapshots()[0].health === 2, "Expected storm boss health to stay unchanged after standing under its weak spot");
  const stormJumpHitSim = new RoomSimulation(stormLaneLevel);
  Object.assign(stormJumpHitSim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  stormJumpHitSim.step(idle);
  runFrames(stormJumpHitSim, 60, idle);
  const stormJumpVulnerable = runBossUntilVulnerable(stormJumpHitSim, "boss-test");
  const stormJumpHit = jumpHitBoss(stormJumpHitSim, stormJumpVulnerable);
  assert(stormJumpHit.bossHit?.id === "boss-test", "Expected a normal floor jump to hit the storm boss vulnerable underside");
  const stormRecoveryHit = upwardHitBoss(stormRecoverySim, stormRecoveryVulnerable);
  assert(stormRecoveryHit.bossHit?.health === 1, "Expected first storm boss hit to leave one health for the repeat cycle");
  assert(!stormRecoveryHit.bossDefeated, "Expected first storm boss hit not to defeat a two-health boss");
  const stormAfterHit = stormRecoverySim.bossSnapshots()[0];
  assert(stormAfterHit.recoveryFrames > 0, "Expected storm boss to enter recovery after a nonfatal hit");
  assert(!bossIsVulnerable(stormAfterHit), "Expected storm boss to close its weak spot after a successful nonfatal hit");
  assert(stormAfterHit.attacks.length === 0 && stormAfterHit.floorShocks.length === 0, "Expected storm boss recovery to clear beam and floor shock hazards");
  const stormImmediateRetry = upwardHitBoss(stormRecoverySim, stormAfterHit);
  assert(stormImmediateRetry.bossHit === null, "Expected storm boss to ignore an immediate repeat hit during recovery immunity");
  assert(stormRecoverySim.bossSnapshots()[0].health === 1, "Expected storm boss health to stay unchanged after an immediate repeat hit attempt");
  const stormRecoveryPauseStart = stormRecoverySim.bossSnapshots()[0];
  runFrames(stormRecoverySim, 30, idle);
  const stormRecoveryPause = stormRecoverySim.bossSnapshots()[0];
  assert(stormRecoveryPause.recoveryFrames > 0, "Expected storm boss recovery pause to still be active");
  assert(
    Math.abs(stormRecoveryPause.body.y - stormRecoveryPauseStart.body.y) <= 6,
    `Expected storm boss to pause before rising, from ${stormRecoveryPauseStart.body.y} to ${stormRecoveryPause.body.y}`
  );
  assert(stormRecoveryPause.attacks.length === 0 && stormRecoveryPause.floorShocks.length === 0, "Expected storm boss recovery pause to stay harmless");
  runFrames(stormRecoverySim, 70, idle);
  const stormRecoveryRising = stormRecoverySim.bossSnapshots()[0];
  const stormRecoveryRiseDelta = stormRecoveryPause.body.y - stormRecoveryRising.body.y;
  assert(
    stormRecoveryRiseDelta > 0.5,
    `Expected storm boss to rise after its post-hit pause, from ${stormRecoveryPause.body.y} to ${stormRecoveryRising.body.y}`
  );
  runFrames(stormRecoverySim, 55, idle);
  const stormRecoveryPatrolStart = stormRecoverySim.bossSnapshots()[0];
  runFrames(stormRecoverySim, 24, idle);
  const stormRecoveryPatrolLater = stormRecoverySim.bossSnapshots()[0];
  assert(
    Math.abs(stormRecoveryPatrolLater.body.x - stormRecoveryPatrolStart.body.x) > 0.5,
    `Expected storm boss to patrol sideways during recovery lane selection, from ${stormRecoveryPatrolStart.body.x} to ${stormRecoveryPatrolLater.body.x}`
  );
  let recoveryFrames = 0;
  while (stormRecoverySim.bossSnapshots()[0]?.recoveryFrames > 0 && recoveryFrames < 220) {
    stormRecoverySim.step(idle);
    recoveryFrames += 1;
  }
  const stormRecovered = stormRecoverySim.bossSnapshots()[0];
  assert(stormRecovered.recoveryFrames === 0, `Expected storm boss recovery to finish, got ${stormRecovered.recoveryFrames}`);
  assert(
    stormRecovered.attacks.length === 0 && !bossIsVulnerable(stormRecovered),
    "Expected storm boss to restart in a harmless windup after recovery"
  );
  assert(
    stormRecovered.activeFrames % bossAttackCycleFramesFor(stormRecovered) < bossAttackWindupFramesFor(stormRecovered),
    `Expected storm boss recovered cycle to restart before the beam window, got frame ${stormRecovered.activeFrames}`
  );

	  const archiveLevel = {
	    ...bossLevel,
	    bosses: [{ ...bossLevel.bosses[0], kind: "archive-custodian", introSeconds: 1, health: 2, score: 1600 }]
	  };
  const archiveLowFloorLevel = {
    ...baseLevel,
    id: "archive-low-floor-targeting",
    start: { x: 220, y: 226 },
    exit: { x: 760, y: 242, w: 32, h: 38 },
    bounds: { x: 0, y: 0, w: 860, h: 340 },
    solids: [
      { id: "floor", x: 0, y: 280, w: 860, h: 60 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 340 },
      { id: "right-wall", x: 860, y: 0, w: 20, h: 340 }
    ],
    bosses: [
      {
        id: "archive-low-floor-boss",
        kind: "archive-custodian",
        x: 80,
        y: 90,
        w: 360,
        h: 160,
        entrySide: "center",
        introSeconds: 1,
        health: 2,
        score: 1600
      }
    ]
  };
  const archiveSteppedFloorLevel = {
    ...archiveLowFloorLevel,
    id: "archive-stepped-floor-targeting",
    start: { x: 129, y: 226 },
    solids: [
      { id: "floor", x: 0, y: 280, w: 860, h: 60 },
      { id: "archive-left-shelf", x: 96, y: 220, w: 66, h: 16, collision: "top-only" },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 340 },
      { id: "right-wall", x: 860, y: 0, w: 20, h: 340 }
    ]
  };
	  assert(
	    bossAttackCycleFramesFor("archive-custodian") > bossAttackCycleFramesFor("cryo-conservator") - 40,
	    `Expected archive boss to use a deliberate readable attack cycle, got ${bossAttackCycleFramesFor("archive-custodian")}`
	  );
	  const runArchiveUntil = (simulation, bossId, predicate, maxFrames = 320) => {
	    for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
	      const snapshot = simulation.bossSnapshots().find((boss) => boss.id === bossId);
	      if (snapshot && predicate(snapshot)) return snapshot;
	      simulation.step(idle);
	    }
	    throw new Error(`Expected archive boss ${bossId} to reach requested state`);
	  };
	  const safeArchiveDodgeX = (warnings, bounds, playerWidth = 24) => {
	    const sorted = [...warnings].sort((a, b) => a.x - b.x);
	    const candidates = [bounds.x + 30, bounds.x + bounds.w - playerWidth - 30];
	    for (let index = 0; index < sorted.length - 1; index += 1) {
	      const left = sorted[index].x + sorted[index].w;
	      const right = sorted[index + 1].x;
	      if (right - left >= playerWidth + 8) candidates.push((left + right - playerWidth) / 2);
	    }
	    return candidates.find((x) => !sorted.some((warning) => rectsOverlap({ x, y: warning.y - 34, w: playerWidth, h: 34 }, warning))) ?? candidates[0];
	  };
	  const archiveWarningSim = new RoomSimulation(archiveLevel);
	  Object.assign(archiveWarningSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
	  archiveWarningSim.step(idle);
	  runFrames(archiveWarningSim, 60, idle);
	  Object.assign(archiveWarningSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
	  const archiveWarning = runBossUntilWarning(archiveWarningSim, "boss-test", 0.65);
	  assert(archiveWarning.attackWarnings.length >= 2, `Expected full-health archive warm-up to warn multiple falling book landings, got ${archiveWarning.attackWarnings.length}`);
	  assert(
	    archiveWarning.attackWarnings.every((warning) => warning.kind === "falling" && warning.attackType === "archive-book" && warning.attackPhase === "warning"),
	    `Expected archive warm-up warnings to be falling book landing shadows, got ${JSON.stringify(archiveWarning.attackWarnings)}`
	  );

	  const archiveLowFloorWarningSim = new RoomSimulation(archiveLowFloorLevel);
  Object.assign(archiveLowFloorWarningSim.player, {
    x: archiveLowFloorLevel.start.x,
    y: 280 - archiveLowFloorWarningSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
	  archiveLowFloorWarningSim.step(idle);
	  runFrames(archiveLowFloorWarningSim, 60, idle);
	  const archiveLowFloorWarning = runBossUntilWarning(archiveLowFloorWarningSim, "archive-low-floor-boss", 0.65);
	  const archiveLowFloorLanding = archiveLowFloorWarning.attackWarnings.find((warning) => warning.kind === "falling" && warning.attackType === "archive-book");
	  assert(Boolean(archiveLowFloorLanding), `Expected low-floor archive warm-up to warn a falling book landing, got ${JSON.stringify(archiveLowFloorWarning.attackWarnings)}`);
	  assert(
	    archiveLowFloorWarning.attackWarnings.some((warning) => rectsOverlap(archiveLowFloorWarningSim.player, { ...warning, y: archiveLowFloorWarningSim.player.y, h: archiveLowFloorWarningSim.player.h })),
	    `Expected low-floor archive warning landings to include the sampled player lane, got player ${JSON.stringify(archiveLowFloorWarningSim.player)} and warnings ${JSON.stringify(archiveLowFloorWarning.attackWarnings)}`
	  );

  const archiveLowFloorAttackSim = new RoomSimulation(archiveLowFloorLevel);
  Object.assign(archiveLowFloorAttackSim.player, {
    x: archiveLowFloorLevel.start.x,
    y: 280 - archiveLowFloorAttackSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
	  archiveLowFloorAttackSim.step(idle);
	  runFrames(archiveLowFloorAttackSim, 60, idle);
	  const archiveLowFloorAttackWarning = runBossUntilWarning(archiveLowFloorAttackSim, "archive-low-floor-boss", 0.65);
	  Object.assign(archiveLowFloorAttackSim.player, {
	    x: safeArchiveDodgeX(archiveLowFloorAttackWarning.attackWarnings, archiveLowFloorAttackSim.level.bounds, archiveLowFloorAttackSim.player.w),
	    y: 18,
	    vx: 0,
	    vy: 0,
	    onGround: false
	  });
	  const archiveLowFloorAttack = runArchiveUntil(
	    archiveLowFloorAttackSim,
	    "archive-low-floor-boss",
	    (snapshot) => snapshot.attacks.some((attack) => attack.attackPhase === "impact")
	  );
	  const archiveLowFloorImpact = archiveLowFloorAttack.attacks.find((attack) => attack.attackPhase === "impact");
	  Object.assign(archiveLowFloorAttackSim.player, {
	    x: archiveLowFloorImpact.x + archiveLowFloorImpact.w / 2 - archiveLowFloorAttackSim.player.w / 2,
	    y: archiveLowFloorImpact.y + archiveLowFloorImpact.h - archiveLowFloorAttackSim.player.h,
	    vx: 0,
	    vy: 0,
	    onGround: true
	  });
	  assert(Boolean(archiveLowFloorAttack), "Expected low-floor archive boss to reach an active attack window");
	  assert(
	    archiveLowFloorAttack.attacks.some((attack) => attack.kind === "falling" && attack.attackPhase === "impact" && rectsOverlap(archiveLowFloorAttackSim.player, attack)),
	    `Expected low-floor archive book impact to cover the sampled player, got player ${JSON.stringify(archiveLowFloorAttackSim.player)} and attacks ${JSON.stringify(archiveLowFloorAttack.attacks)}`
	  );
	  assert(
	    !rectsOverlap(archiveLowFloorAttackSim.player, archiveLowFloorAttack.body),
	    `Expected low-floor archive body to stay clear during falling books, got player ${JSON.stringify(archiveLowFloorAttackSim.player)} and body ${JSON.stringify(archiveLowFloorAttack.body)}`
	  );
	  assert(
	    archiveLowFloorAttackSim.player.y - (archiveLowFloorAttack.body.y + archiveLowFloorAttack.body.h) >= 32,
    `Expected low-floor archive body to remain visibly above the player during attack, got player ${JSON.stringify(archiveLowFloorAttackSim.player)} and body ${JSON.stringify(archiveLowFloorAttack.body)}`
  );

  const archiveSteppedWarningSim = new RoomSimulation(archiveSteppedFloorLevel);
  Object.assign(archiveSteppedWarningSim.player, {
    x: archiveSteppedFloorLevel.start.x,
    y: 280 - archiveSteppedWarningSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  archiveSteppedWarningSim.step(idle);
  runFrames(archiveSteppedWarningSim, 60, idle);
  const archiveSteppedWarning = runBossUntilWarning(archiveSteppedWarningSim, "archive-low-floor-boss", 0.65);
  const archiveShelfWarning = archiveSteppedWarning.attackWarnings.find((warning) => warning.originX < 170);
  const archiveFloorWarning = archiveSteppedWarning.attackWarnings.find((warning) => warning.originX > 250);
  assert(
    archiveShelfWarning && Math.round(archiveShelfWarning.y + archiveShelfWarning.h) === 220,
    `Expected archive shelf warning to land on the raised shelf, got ${JSON.stringify(archiveSteppedWarning.attackWarnings)}`
  );
  assert(
    archiveFloorWarning && Math.round(archiveFloorWarning.y + archiveFloorWarning.h) === 280,
    `Expected archive floor warning to land on the lower floor, got ${JSON.stringify(archiveSteppedWarning.attackWarnings)}`
  );
  Object.assign(archiveSteppedWarningSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
  const archiveSteppedImpact = runArchiveUntil(
    archiveSteppedWarningSim,
    "archive-low-floor-boss",
    (snapshot) => snapshot.attacks.some((attack) => attack.attackPhase === "impact")
  );
  const archiveShelfImpact = archiveSteppedImpact.attacks.find((attack) => attack.attackPhase === "impact" && attack.originX < 170);
  const archiveFloorImpact = archiveSteppedImpact.attacks.find((attack) => attack.attackPhase === "impact" && attack.originX > 250);
  assert(
    archiveShelfImpact && Math.round(archiveShelfImpact.y + archiveShelfImpact.h) === 220,
    `Expected archive shelf impact to land on the raised shelf, got ${JSON.stringify(archiveSteppedImpact.attacks)}`
  );
  assert(
    archiveFloorImpact && Math.round(archiveFloorImpact.y + archiveFloorImpact.h) === 280,
    `Expected archive floor impact to land on the lower floor, got ${JSON.stringify(archiveSteppedImpact.attacks)}`
  );

  const archiveDeepTrackingLevel = {
    ...archiveLowFloorLevel,
    id: "archive-deep-floor-tracking",
    start: { x: 220, y: 586 },
    exit: { x: 760, y: 582, w: 32, h: 38 },
    bounds: { x: 0, y: 0, w: 860, h: 780 },
    solids: [
      { id: "floor", x: 0, y: 620, w: 860, h: 160 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 780 },
      { id: "right-wall", x: 860, y: 0, w: 20, h: 780 }
    ]
  };
  const archiveDeepTrackingSim = new RoomSimulation(archiveDeepTrackingLevel);
  Object.assign(archiveDeepTrackingSim.player, {
    x: archiveDeepTrackingLevel.start.x,
    y: 226,
    vx: 0,
    vy: 0,
    onGround: false
  });
  archiveDeepTrackingSim.step(idle);
  runFrames(archiveDeepTrackingSim, 60, idle);
  Object.assign(archiveDeepTrackingSim.player, {
    x: archiveDeepTrackingLevel.start.x,
    y: 620 - archiveDeepTrackingSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  const archiveDeepTrackingWarning = runBossUntilWarning(archiveDeepTrackingSim, "archive-low-floor-boss", 0.65);
  const deepWarningOriginY = Math.min(...archiveDeepTrackingWarning.attackWarnings.map((warning) => warning.originY));
  Object.assign(archiveDeepTrackingSim.player, {
    x: safeArchiveDodgeX(archiveDeepTrackingWarning.attackWarnings, archiveDeepTrackingSim.level.bounds, archiveDeepTrackingSim.player.w),
    y: 620 - archiveDeepTrackingSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  const archiveDeepTrackingAttack = runArchiveUntil(
    archiveDeepTrackingSim,
    "archive-low-floor-boss",
    (snapshot) => snapshot.attacks.some((attack) => attack.attackPhase === "impact")
  );
  const archiveDeepTrackingImpact = archiveDeepTrackingAttack.attacks.find((attack) => attack.attackPhase === "impact");
  const deepBoss = archiveDeepTrackingLevel.bosses[0];
  const deepBossBodyH = Math.max(58, Math.min(150, deepBoss.h * 0.45));
  const deepBossMarginY = Math.min(24, Math.max(6, deepBoss.h * 0.05));
  const originalArchiveMaxCenterY = deepBoss.y + deepBoss.h - deepBossMarginY - deepBossBodyH / 2;
  const deepArchiveBodyCenterY = archiveDeepTrackingAttack.body.y + archiveDeepTrackingAttack.body.h / 2;
  const deepPlayerCenterY = archiveDeepTrackingSim.player.y + archiveDeepTrackingSim.player.h / 2;
  assert(
    deepArchiveBodyCenterY > originalArchiveMaxCenterY + 120,
    `Expected archive boss to track below original arena max center ${originalArchiveMaxCenterY}, got ${deepArchiveBodyCenterY}`
  );
  assert(
    deepArchiveBodyCenterY <= deepPlayerCenterY - 90,
    `Expected archive boss to stay in the upper player viewport, got boss center ${deepArchiveBodyCenterY} and player center ${deepPlayerCenterY}`
  );
  assert(
    deepWarningOriginY > deepBoss.y + 90 && archiveDeepTrackingImpact?.originY > deepBoss.y + 90,
    `Expected archive book origins to follow the lowered boss body, got warning origin ${deepWarningOriginY}, impact origin ${archiveDeepTrackingImpact?.originY}, boss y ${deepBoss.y}`
  );
  assert(
    archiveDeepTrackingImpact && Math.round(archiveDeepTrackingImpact.y + archiveDeepTrackingImpact.h) === 620,
    `Expected deep archive book impact to land on the player's current lower floor, got ${JSON.stringify(archiveDeepTrackingAttack.attacks)}`
  );

  const archiveAttackSim = new RoomSimulation(archiveLevel);
  Object.assign(archiveAttackSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
	  archiveAttackSim.step(idle);
	  runFrames(archiveAttackSim, 60, idle);
	  Object.assign(archiveAttackSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
	  const archiveAttackSnapshot = runBossUntilAttack(archiveAttackSim, "boss-test");
	  assert(
	    archiveAttackSnapshot.attacks.length >= 2 && archiveAttackSnapshot.attacks.every((attack) => attack.kind === "falling" && attack.attackType === "archive-book"),
	    `Expected full-health archive boss to drop one volley of multiple falling books, got ${JSON.stringify(archiveAttackSnapshot.attacks)}`
	  );
	  const archiveBookImpactSim = new RoomSimulation(archiveLevel);
	  Object.assign(archiveBookImpactSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
	  archiveBookImpactSim.step(idle);
	  runFrames(archiveBookImpactSim, 60, idle);
	  const archiveImpactSnapshot = runArchiveUntil(
	    archiveBookImpactSim,
	    "boss-test",
	    (snapshot) => snapshot.attacks.some((attack) => attack.attackPhase === "impact")
	  );
	  const archiveImpact = archiveImpactSnapshot.attacks.find((attack) => attack.attackPhase === "impact");
	  Object.assign(archiveBookImpactSim.player, {
	    x: archiveImpact.x + archiveImpact.w / 2 - 12,
	    y: archiveImpact.y + archiveImpact.h - archiveBookImpactSim.player.h,
	    vx: 0,
	    vy: 0,
	    onGround: true
	  });
	  const archiveBookDeath = archiveBookImpactSim.step(idle);
	  assert(archiveBookDeath.died && archiveBookImpactSim.dead, "Expected active archive book impact to kill the player");

  const archiveBookImpactSoundSim = new RoomSimulation(archiveLevel);
  Object.assign(archiveBookImpactSoundSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
  archiveBookImpactSoundSim.step(idle);
  runFrames(archiveBookImpactSoundSim, 60, idle);
  const archiveBookImpactCue = runBossUntilSoundCue(archiveBookImpactSoundSim, "boss-test", "archive-book-impact", 420);
  const archiveBookImpactCueCount = archiveBookImpactCue.event.bossSoundCues.filter((cue) => cue.cue === "archive-book-impact").length;
  const archiveBookImpactCount = archiveBookImpactCue.snapshot.attacks.filter((attack) => attack.attackPhase === "impact").length;
  assert(
    archiveBookImpactCueCount === 1 && archiveBookImpactCount >= 2,
    `Expected one mixed archive book impact SFX for a multi-book volley, got ${archiveBookImpactCueCount} cues for ${archiveBookImpactCount} impact books`
  );
  assert(
    archiveBookImpactCue.soundCue.y > archiveBookImpactCue.snapshot.body.y + archiveBookImpactCue.snapshot.body.h,
    `Expected archive book impact SFX to be located below the boss body, got cue ${JSON.stringify(archiveBookImpactCue.soundCue)} and body ${JSON.stringify(archiveBookImpactCue.snapshot.body)}`
  );
  const archiveBookImpactCueFollowup = archiveBookImpactSoundSim.step(idle);
  assert(
    !archiveBookImpactCueFollowup.bossSoundCues.some((cue) => cue.cue === "archive-book-impact"),
    `Expected archive book impact SFX not to repeat on the next frame, got ${JSON.stringify(archiveBookImpactCueFollowup.bossSoundCues)}`
  );
  archiveBookImpactSoundSim.resetLifeAttempt();
  const archiveBookImpactCueAfterResetStart = archiveBookImpactSoundSim.step(idle);
  assert(
    !archiveBookImpactCueAfterResetStart.bossSoundCues.some((cue) => cue.cue === "archive-book-impact"),
    `Expected archive book impact SFX not to replay immediately after checkpoint reset, got ${JSON.stringify(archiveBookImpactCueAfterResetStart.bossSoundCues)}`
  );
  runFrames(archiveBookImpactSoundSim, 60, idle);
  Object.assign(archiveBookImpactSoundSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
  const archiveBookImpactReplayCue = runBossUntilSoundCue(archiveBookImpactSoundSim, "boss-test", "archive-book-impact", 420);
  const archiveBookImpactReplayCueCount = archiveBookImpactReplayCue.event.bossSoundCues.filter((cue) => cue.cue === "archive-book-impact").length;
  assert(
    archiveBookImpactReplayCueCount === 1,
    `Expected archive book impact SFX to replay after checkpoint reset, got ${archiveBookImpactReplayCueCount} cues after reset vs ${archiveBookImpactCueCount} before reset`
  );

  const runArchiveUntilFinalImpact = (simulation, bossId) =>
    runArchiveUntil(
      simulation,
      bossId,
      (snapshot) => snapshot.attacks.some((attack) => attack.attackPhase === "impact" && (attack.progress || 0) >= 0.999),
      420
    );
  const runArchiveUntilErosion = (simulation, bossId, previousRevision, maxFrames = 1800) => {
    for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
      simulation.step(idle);
      const snapshot = simulation.snapshot();
      const bossSnapshot = simulation.bossSnapshots().find((boss) => boss.id === bossId);
      if (snapshot.terrainRevision > previousRevision && bossSnapshot) return bossSnapshot;
    }
    throw new Error(`Expected archive boss ${bossId} to erode terrain`);
  };
  const handledArchiveImpactCount = (simulation) => {
    const handled = simulation.handledArchiveImpactKeys;
    assert(handled instanceof Set, "Expected RoomSimulation archive impact keys to be inspectable in simulation checks");
    return handled.size;
  };
  const archiveNoErosionSim = new RoomSimulation(archiveLowFloorLevel);
  Object.assign(archiveNoErosionSim.player, {
    x: archiveLowFloorLevel.start.x,
    y: 280 - archiveNoErosionSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  archiveNoErosionSim.step(idle);
  runFrames(archiveNoErosionSim, 60, idle);
  Object.assign(archiveNoErosionSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
  const noErosionRevision = archiveNoErosionSim.snapshot().terrainRevision;
  runArchiveUntilFinalImpact(archiveNoErosionSim, "archive-low-floor-boss");
  const noErosionFloor = archiveNoErosionSim.snapshot().solids.filter((solid) => solid.id === "floor");
  assert(archiveNoErosionSim.snapshot().terrainRevision === noErosionRevision, "Expected unmarked archive floor to leave terrain revision unchanged");
  assert(noErosionFloor.length === 1 && noErosionFloor[0].w === 860, `Expected unmarked archive floor not to erode, got ${JSON.stringify(noErosionFloor)}`);

  const archiveMarkedBlockLevel = {
    ...archiveLowFloorLevel,
    id: "archive-block-erosion-guard",
    solids: [
      { id: "erode-block", x: 0, y: 280, w: 860, h: 60, sprite: "block", erodesWith: "archive-book", erosionTiles: 2 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 340 },
      { id: "right-wall", x: 860, y: 0, w: 20, h: 340 }
    ]
  };
  const archiveMarkedBlockSim = new RoomSimulation(archiveMarkedBlockLevel);
  Object.assign(archiveMarkedBlockSim.player, {
    x: archiveMarkedBlockLevel.start.x,
    y: 280 - archiveMarkedBlockSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  archiveMarkedBlockSim.step(idle);
  runFrames(archiveMarkedBlockSim, 60, idle);
  Object.assign(archiveMarkedBlockSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
  const markedBlockRevision = archiveMarkedBlockSim.snapshot().terrainRevision;
  runArchiveUntilFinalImpact(archiveMarkedBlockSim, "archive-low-floor-boss");
  const markedBlockSolids = archiveMarkedBlockSim.snapshot().solids.filter((solid) => solid.id === "erode-block");
  assert(archiveMarkedBlockSim.snapshot().terrainRevision === markedBlockRevision, "Expected marked non-floor block not to erode");
  assert(markedBlockSolids.length === 1 && markedBlockSolids[0].w === 860, `Expected marked non-floor block to stay intact, got ${JSON.stringify(markedBlockSolids)}`);

  const archiveErosionLevel = {
    ...archiveLowFloorLevel,
    id: "archive-floor-erosion",
    solids: [
      { id: "erode-floor", x: 0, y: 280, w: 860, h: 128, erodesWith: "archive-book", erosionTiles: 2 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 340 },
      { id: "right-wall", x: 860, y: 0, w: 20, h: 340 }
    ]
  };
  const archiveErosionSim = new RoomSimulation(archiveErosionLevel);
  Object.assign(archiveErosionSim.player, {
    x: archiveErosionLevel.start.x,
    y: 280 - archiveErosionSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  archiveErosionSim.step(idle);
  runFrames(archiveErosionSim, 60, idle);
  Object.assign(archiveErosionSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
  const preErosionRevision = archiveErosionSim.snapshot().terrainRevision;
  const archiveFinalImpact = runArchiveUntilErosion(archiveErosionSim, "archive-low-floor-boss", preErosionRevision);
  const finalImpactBooks = archiveFinalImpact.attacks.filter((attack) => attack.attackPhase === "impact" && (attack.progress || 0) >= 0.999);
  assert(finalImpactBooks.length >= 1, `Expected final archive impact before erosion, got ${JSON.stringify(archiveFinalImpact.attacks)}`);
  const erodedSnapshot = archiveErosionSim.snapshot();
  const erodedPieces = erodedSnapshot.solids.filter((solid) => solid.id.startsWith("erode-floor"));
  const originalErosionArea = 860 * 128;
  const erodedArea = originalErosionArea - erodedPieces.reduce((sum, solid) => sum + solid.w * solid.h, 0);
  const topLayerArea = erodedPieces.filter((solid) => solid.y === 280 && solid.h === 32).reduce((sum, solid) => sum + solid.w * solid.h, 0);
  const lowerLayer = erodedPieces.find((solid) => solid.y === 312 && solid.w === 860 && solid.h === 96);
  assert(erodedSnapshot.terrainRevision > preErosionRevision, "Expected archive floor erosion to bump terrain revision");
  assert(erodedPieces.length >= 1, `Expected erodible floor to leave runtime pieces, got ${JSON.stringify(erodedSnapshot.solids)}`);
  assert(
    erodedArea >= 32 * 32 && erodedArea <= finalImpactBooks.length * 2 * 32 * 32 && erodedArea % (32 * 32) === 0,
    `Expected successful book piles to chip 1-2 top-surface tiles each, got eroded area ${erodedArea} from ${JSON.stringify(erodedPieces)}`
  );
  assert(
    lowerLayer && lowerLayer.erodesWith === "archive-book",
    `Expected erosion to preserve a deeper erodible floor layer instead of deleting full columns, got ${JSON.stringify(erodedPieces)}`
  );
  assert(
    topLayerArea === 860 * 32 - erodedArea,
    `Expected only the top 32px layer to lose chipped area, got top layer area ${topLayerArea} and eroded area ${erodedArea}`
  );
  archiveErosionSim.resetLifeAttempt();
  const restoredErosionFloor = archiveErosionSim.snapshot().solids.filter((solid) => solid.id === "erode-floor");
  assert(
    restoredErosionFloor.length === 1 && restoredErosionFloor[0].w === 860 && restoredErosionFloor[0].h === 128,
    `Expected boss checkpoint reset to restore eroded floor, got ${JSON.stringify(restoredErosionFloor)}`
  );

  const archivePostRecoveryErosionSim = new RoomSimulation(archiveErosionLevel);
  Object.assign(archivePostRecoveryErosionSim.player, {
    x: archiveErosionLevel.start.x,
    y: 280 - archivePostRecoveryErosionSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  archivePostRecoveryErosionSim.step(idle);
  runFrames(archivePostRecoveryErosionSim, 60, idle);
  const repeatedArchiveTarget = { x: 36, y: 18, vx: 0, vy: 0, onGround: false };
  Object.assign(archivePostRecoveryErosionSim.player, repeatedArchiveTarget);
  runArchiveUntilFinalImpact(archivePostRecoveryErosionSim, "archive-low-floor-boss");
  const handledBeforeRecoveryHit = handledArchiveImpactCount(archivePostRecoveryErosionSim);
  assert(handledBeforeRecoveryHit >= 1, "Expected first archive impact to register handled erosion keys before recovery");
  const archivePostRecoveryVulnerable = runBossUntilVulnerable(archivePostRecoveryErosionSim, "archive-low-floor-boss");
  const archivePostRecoveryHit = upwardHitBoss(archivePostRecoveryErosionSim, archivePostRecoveryVulnerable);
  assert(archivePostRecoveryHit.bossHit?.health === 1, "Expected archive recovery erosion test to leave one boss health");
  for (let guard = 0; guard < 180 && archivePostRecoveryErosionSim.bossSnapshots()[0]?.recoveryFrames > 0; guard += 1) {
    archivePostRecoveryErosionSim.step(idle);
  }
  Object.assign(archivePostRecoveryErosionSim.player, repeatedArchiveTarget);
  const postRecoveryRevision = archivePostRecoveryErosionSim.snapshot().terrainRevision;
  const handledBeforePostRecoveryImpact = handledArchiveImpactCount(archivePostRecoveryErosionSim);
  runArchiveUntilFinalImpact(archivePostRecoveryErosionSim, "archive-low-floor-boss");
  const handledAfterPostRecoveryImpact = handledArchiveImpactCount(archivePostRecoveryErosionSim);
  assert(
    handledAfterPostRecoveryImpact > handledBeforePostRecoveryImpact,
    `Expected archive impact keys to advance after nonfatal recovery, got before ${handledBeforePostRecoveryImpact} and after ${handledAfterPostRecoveryImpact}`
  );
  if (archivePostRecoveryErosionSim.snapshot().terrainRevision === postRecoveryRevision) {
    runArchiveUntilErosion(archivePostRecoveryErosionSim, "archive-low-floor-boss", postRecoveryRevision);
  }
  assert(
    archivePostRecoveryErosionSim.snapshot().terrainRevision > postRecoveryRevision,
    "Expected archive floor to remain erodible after nonfatal boss recovery"
  );

	  const archiveDodgeSim = new RoomSimulation(archiveLevel);
	  Object.assign(archiveDodgeSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
	  archiveDodgeSim.step(idle);
	  runFrames(archiveDodgeSim, 60, idle);
	  const archiveDodgeWarning = runBossUntilWarning(archiveDodgeSim, "boss-test", 0.65);
	  Object.assign(archiveDodgeSim.player, {
	    x: safeArchiveDodgeX(archiveDodgeWarning.attackWarnings, archiveDodgeSim.level.bounds, archiveDodgeSim.player.w),
	    y: 86,
	    vx: 0,
	    vy: 0,
	    onGround: true
	  });
	  runFrames(archiveDodgeSim, bossAttackWindupFramesFor("archive-custodian") + bossAttackActiveFramesFor("archive-custodian") + 8, idle);
	  assert(!archiveDodgeSim.dead, "Expected player to survive archive falling books after moving into a warned safe gap");

  const archiveMissedCycleSim = new RoomSimulation(archiveLowFloorLevel);
  Object.assign(archiveMissedCycleSim.player, {
    x: archiveLowFloorLevel.start.x,
    y: 280 - archiveMissedCycleSim.player.h,
    vx: 0,
    vy: 0,
    onGround: true
  });
  archiveMissedCycleSim.step(idle);
  runFrames(archiveMissedCycleSim, 60, idle);
  const archiveMissedVulnerable = runBossUntilVulnerable(archiveMissedCycleSim, "archive-low-floor-boss");
  Object.assign(archiveMissedCycleSim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
  const archiveFramesUntilNextCycle =
    bossAttackCycleFramesFor(archiveMissedVulnerable) - (archiveMissedVulnerable.activeFrames % bossAttackCycleFramesFor(archiveMissedVulnerable));
  runFrames(archiveMissedCycleSim, archiveFramesUntilNextCycle, idle);
  const archiveMissedLiftStart = archiveMissedCycleSim.bossSnapshots()[0];
  const archiveMissedSmoothMotion = assertBossMotionSmoothForFrames(archiveMissedCycleSim, "archive-low-floor-boss", 12, 7.5, "archive missed-window lift");
  const archiveMissedLiftLater = archiveMissedSmoothMotion.snapshot;
  const archiveMissedLiftDelta = archiveMissedLiftStart.body.y - archiveMissedLiftLater.body.y;
  assert(
    archiveMissedLiftDelta > 0.2 && archiveMissedLiftDelta < 12,
    `Expected archive boss to lift gradually after a missed core window, moved ${archiveMissedLiftDelta}px from ${archiveMissedLiftStart.body.y} to ${archiveMissedLiftLater.body.y}`
  );

	  const archiveRecoverySim = new RoomSimulation(archiveLevel);
  Object.assign(archiveRecoverySim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  archiveRecoverySim.step(idle);
  runFrames(archiveRecoverySim, 60, idle);
  const archiveVulnerable = runBossUntilVulnerable(archiveRecoverySim, "boss-test");
  assert(archiveVulnerable.weakSpotKind === "core", `Expected archive boss weak spot to be an exposed core, got ${archiveVulnerable.weakSpotKind}`);
  const archiveFirstHit = upwardHitBoss(archiveRecoverySim, archiveVulnerable);
	  assert(archiveFirstHit.bossHit?.health === 1, "Expected first archive core hit to leave one health for phase two");
	  assert(!archiveFirstHit.bossDefeated, "Expected first archive core hit not to defeat a two-health boss");
	  const archiveAfterHit = archiveRecoverySim.bossSnapshots()[0];
	  assert(archiveAfterHit.recoveryFrames > 0, "Expected archive boss to enter recovery after a nonfatal core hit");
	  assert(archiveAfterHit.attacks.length === 0 && archiveAfterHit.attackWarnings.length === 0, "Expected archive recovery to clear falling book hazards");
	  const archiveImmediateRetry = upwardHitBoss(archiveRecoverySim, archiveAfterHit);
	  assert(archiveImmediateRetry.bossHit === null, "Expected archive boss to ignore immediate repeat core hits during recovery");
	  for (let guard = 0; guard < 180 && archiveRecoverySim.bossSnapshots()[0]?.recoveryFrames > 0; guard += 1) {
	    archiveRecoverySim.step(idle);
	  }
	  const archivePhaseTwoWarning = runBossUntilWarning(archiveRecoverySim, "boss-test", 0.65);
	  assert(
	    archivePhaseTwoWarning.attackWarnings.length >= 2 &&
	      archivePhaseTwoWarning.attackWarnings.every((warning) => warning.kind === "falling" && warning.round === 1),
	    `Expected half-health archive first warm-up to warn falling book round one, got ${JSON.stringify(archivePhaseTwoWarning.attackWarnings)}`
	  );
	  const archivePhaseTwoAttack = runBossUntilAttack(archiveRecoverySim, "boss-test");
	  assert(
	    archivePhaseTwoAttack.attacks.length >= 2 &&
	      archivePhaseTwoAttack.attacks.every((attack) => attack.kind === "falling" && attack.round === 1),
	    `Expected half-health archive first attack to fire falling book round one, got ${JSON.stringify(archivePhaseTwoAttack.attacks)}`
	  );
	  Object.assign(archiveRecoverySim.player, { x: 36, y: 18, vx: 0, vy: 0, onGround: false });
	  const archivePhaseTwoSecondWarning = runArchiveUntil(
	    archiveRecoverySim,
	    "boss-test",
	    (snapshot) => snapshot.attackWarnings.some((warning) => warning.kind === "falling" && warning.round === 2) && snapshot.attacks.length === 0
	  );
	  assert(
	    archivePhaseTwoSecondWarning.attackWarnings.length >= 2 &&
	      archivePhaseTwoSecondWarning.attackWarnings.every((warning) => warning.round === 2 && warning.attackPhase === "warning"),
	    `Expected half-health archive to warn a second falling book round before vulnerability, got ${JSON.stringify(archivePhaseTwoSecondWarning.attackWarnings)}`
	  );
		  const archivePhaseTwoSecondAttack = runArchiveUntil(
		    archiveRecoverySim,
		    "boss-test",
		    (snapshot) => snapshot.attacks.some((attack) => attack.kind === "falling" && attack.round === 2)
		  );
		  assert(
		    archivePhaseTwoSecondAttack.attacks.length >= 2 &&
		      archivePhaseTwoSecondAttack.attacks.every((attack) => attack.round === 2 && attack.attackType === "archive-book"),
		    `Expected half-health archive second attack to fire a second falling book round, got ${JSON.stringify(archivePhaseTwoSecondAttack.attacks)}`
		  );
	  const archivePhaseTwoSecondImpactCue = runBossUntilSoundCue(archiveRecoverySim, "boss-test", "archive-book-impact", 420);
	  const archivePhaseTwoSecondImpactCueCount = archivePhaseTwoSecondImpactCue.event.bossSoundCues.filter((cue) => cue.cue === "archive-book-impact").length;
	  const archivePhaseTwoSecondImpactCount = archivePhaseTwoSecondImpactCue.snapshot.attacks.filter(
	    (attack) => attack.round === 2 && attack.attackPhase === "impact"
	  ).length;
	  assert(
	    archivePhaseTwoSecondImpactCueCount === 1 && archivePhaseTwoSecondImpactCount >= 2,
	    `Expected one mixed archive book impact SFX for round two, got ${archivePhaseTwoSecondImpactCueCount} cues for ${archivePhaseTwoSecondImpactCount} impacts`
	  );
	  const archivePhaseTwoSecondImpactFollowup = archiveRecoverySim.step(idle);
	  assert(
	    !archivePhaseTwoSecondImpactFollowup.bossSoundCues.some((cue) => cue.cue === "archive-book-impact"),
	    `Expected archive round-two impact SFX not to repeat on the next frame, got ${JSON.stringify(archivePhaseTwoSecondImpactFollowup.bossSoundCues)}`
	  );
		  const archiveFinalVulnerable = runBossUntilVulnerable(archiveRecoverySim, "boss-test");
  const archiveFinalHit = upwardHitBoss(archiveRecoverySim, archiveFinalVulnerable);
  assert(archiveFinalHit.bossDefeated?.score === 1600, `Expected second archive core hit to defeat the boss, got ${JSON.stringify(archiveFinalHit.bossDefeated)}`);

  const cryoLevel = {
    ...bossLevel,
    bosses: [{ ...bossLevel.bosses[0], kind: "cryo-conservator", introSeconds: 1, health: 2 }]
  };
  assert(
    bossAttackWindupFramesFor("cryo-conservator") < bossAttackWindupFramesFor("storm-relay-warden"),
    `Expected cryo wind-up to be faster than storm, got cryo ${bossAttackWindupFramesFor("cryo-conservator")} and storm ${bossAttackWindupFramesFor("storm-relay-warden")}`
  );
  assert(
    bossAttackWindupFramesFor("cryo-conservator") <= 96,
    `Expected cryo wind-up to be noticeably tighter than before, got ${bossAttackWindupFramesFor("cryo-conservator")}`
  );
  const cryoWarningSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoWarningSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  cryoWarningSim.step(idle);
  runFrames(cryoWarningSim, 60, idle);
  Object.assign(cryoWarningSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const cryoWarning = runBossUntilWarning(cryoWarningSim, "boss-test");
  assert(cryoWarning.attackWarnings.length === 1, `Expected full-health cryo warm-up to warn one lane, got ${cryoWarning.attackWarnings.length}`);
  assert(cryoWarning.attacks.length === 0, "Expected cryo warm-up warning not to create active damage");
  assert(
    cryoWarning.attackWarnings.every((warning) => warning.originX >= cryoWarning.body.x && warning.originX <= cryoWarning.body.x + cryoWarning.body.w),
    `Expected cryo warning lane to stay within the boss body, got body ${JSON.stringify(cryoWarning.body)} and warnings ${JSON.stringify(cryoWarning.attackWarnings)}`
  );
  assert(
    Math.abs(cryoWarning.attackWarnings[0].originX - targetPlayerCenterX) <= 36,
    `Expected cryo warm-up lane to target player x ${targetPlayerCenterX}, got ${cryoWarning.attackWarnings[0].originX}`
  );
  Object.assign(cryoWarningSim.player, {
    x: cryoWarning.attackWarnings[0].x + cryoWarning.attackWarnings[0].w / 2 - 12,
    y: 86,
    vx: 0,
    vy: 0,
    onGround: true
  });
  const cryoWarningStep = cryoWarningSim.step(idle);
  assert(!cryoWarningStep.died && !cryoWarningSim.dead, "Expected cryo warning beam to be non-damaging before the active fire window");

  const cryoLaneSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoLaneSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  cryoLaneSim.step(idle);
  runFrames(cryoLaneSim, 60, idle);
  Object.assign(cryoLaneSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const cryoAttackSnapshot = runBossUntilAttack(cryoLaneSim, "boss-test");
  assertAttackStartsFromBoss(cryoAttackSnapshot, "cryo boss downward attack");
  assert(cryoAttackSnapshot.attackWarnings.length === 0, "Expected cryo warning lanes to clear once active beams fire");
  const cryoAttack = cryoAttackSnapshot.attacks[0];
  assert(cryoAttack.kind === "vertical", `Expected cryo boss to fire downward, got ${cryoAttack.kind}`);
  assert(cryoAttack.h > cryoAttack.w * 2, `Expected cryo beam to be a tall lane hazard, got ${JSON.stringify(cryoAttack)}`);
  assert(
    cryoAttack.originX >= cryoAttackSnapshot.body.x && cryoAttack.originX <= cryoAttackSnapshot.body.x + cryoAttackSnapshot.body.w,
    `Expected cryo beam origin to stay within the boss body, got body ${JSON.stringify(cryoAttackSnapshot.body)} and attack ${JSON.stringify(cryoAttack)}`
  );
  assert(
    Math.abs(cryoAttack.originX - targetPlayerCenterX) <= 28,
    `Expected cryo boss first attack lane to target player x ${targetPlayerCenterX}, got ${cryoAttack.originX}`
  );
  assert(cryoAttackSnapshot.floorIce.length === 1, `Expected active cryo beam to freeze one floor lane, got ${cryoAttackSnapshot.floorIce.length}`);
  const cryoIce = cryoAttackSnapshot.floorIce[0];
  assert(cryoIce.w === 128, `Expected cryo floor ice to cover a 128px lane, got ${JSON.stringify(cryoIce)}`);
  assert(cryoIce.lifeFrames === 1260, `Expected cryo floor ice to last 21 seconds, got ${JSON.stringify(cryoIce)}`);
  const cryoSoundCueSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoSoundCueSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  cryoSoundCueSim.step(idle);
  runFrames(cryoSoundCueSim, 60, idle);
  Object.assign(cryoSoundCueSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const cryoBeamCue = runBossUntilSoundCue(cryoSoundCueSim, "boss-test", "cryo-beam-fire", 340);
  const cryoSoundCycle = cryoBeamCue.snapshot.activeFrames % bossAttackCycleFramesFor(cryoBeamCue.snapshot);
  assert(
    cryoSoundCycle === bossAttackWindupFramesFor("cryo-conservator"),
    `Expected cryo beam SFX cue at active-window start, got cycle ${cryoSoundCycle}`
  );
  assert(
    cryoBeamCue.event.bossSoundCues.some((cue) => cue.id === "boss-test" && cue.cue === "cryo-floor-ice-form"),
    `Expected cryo floor ice SFX cue on the beam-start volley, got ${JSON.stringify(cryoBeamCue.event.bossSoundCues)}`
	  );
	  assert(cryoBeamCue.snapshot.floorIce.length === 1, "Expected cryo SFX cue to coincide with created floor ice");
	  Object.assign(cryoSoundCueSim.player, { x: 32, y: 86, vx: 0, vy: 0, onGround: true });
	  const cryoWindowCueCounts = countBossSoundCuesUntilActiveWindowEnds(cryoSoundCueSim, "boss-test", ["cryo-beam-fire", "cryo-floor-ice-form"]);
  const cryoBeamWindowCueCount =
    cryoBeamCue.event.bossSoundCues.filter((cue) => cue.id === "boss-test" && cue.cue === "cryo-beam-fire").length +
    (cryoWindowCueCounts.get("cryo-beam-fire") || 0);
  const cryoIceWindowCueCount =
    cryoBeamCue.event.bossSoundCues.filter((cue) => cue.id === "boss-test" && cue.cue === "cryo-floor-ice-form").length +
    (cryoWindowCueCounts.get("cryo-floor-ice-form") || 0);
	  assert(cryoBeamWindowCueCount === 1, `Expected exactly one cryo beam SFX cue in the active window, got ${cryoBeamWindowCueCount}`);
	  assert(cryoIceWindowCueCount === 1, `Expected exactly one cryo floor ice SFX cue in the active window, got ${cryoIceWindowCueCount}`);
	  const cryoPostCue = cryoSoundCueSim.step(idle);
	  assert(
	    !cryoPostCue.bossSoundCues.some((cue) => cue.cue === "cryo-floor-ice-form"),
	    `Expected cryo floor ice SFX not to repeat on the next frame, got ${JSON.stringify(cryoPostCue.bossSoundCues)}`
	  );
	  const cryoLaterWindowSim = new RoomSimulation(cryoLevel);
	  Object.assign(cryoLaterWindowSim.player, { x: 32, y: 86, vx: 0, vy: 0, onGround: true });
	  cryoLaterWindowSim.step(idle);
	  runFrames(cryoLaterWindowSim, 60, idle);
	  const cryoLaterWindowState = cryoLaterWindowSim.bossStates.get("boss-test");
	  cryoLaterWindowState.activeFrames =
	    bossAttackCycleFramesFor("cryo-conservator") + bossAttackWindupFramesFor("cryo-conservator") - 1;
	  cryoLaterWindowState.recoveryFrames = 0;
	  cryoLaterWindowState.invulnerableFrames = 0;
	  const cryoSecondBeamEvent = cryoLaterWindowSim.step(idle);
	  const cryoSecondBeamCue = {
	    event: cryoSecondBeamEvent,
	    snapshot: cryoLaterWindowSim.bossSnapshots().find((boss) => boss.id === "boss-test")
	  };
	  const cryoSecondSoundCycle = cryoSecondBeamCue.snapshot.activeFrames % bossAttackCycleFramesFor(cryoSecondBeamCue.snapshot);
	  assert(
	    cryoSecondSoundCycle === bossAttackWindupFramesFor("cryo-conservator"),
	    `Expected later cryo beam SFX cue at active-window start, got cycle ${cryoSecondSoundCycle}`
	  );
	  assert(
	    cryoSecondBeamEvent.bossSoundCues.some((cue) => cue.id === "boss-test" && cue.cue === "cryo-beam-fire"),
	    `Expected later cryo beam SFX cue on the beam-start volley, got ${JSON.stringify(cryoSecondBeamEvent.bossSoundCues)}`
	  );
	  assert(
	    cryoSecondBeamEvent.bossSoundCues.some((cue) => cue.id === "boss-test" && cue.cue === "cryo-floor-ice-form"),
	    `Expected later cryo floor ice SFX cue on the beam-start volley, got ${JSON.stringify(cryoSecondBeamCue.event.bossSoundCues)}`
	  );
	  const cryoSecondWindowCueCounts = countBossSoundCuesUntilActiveWindowEnds(cryoLaterWindowSim, "boss-test", ["cryo-beam-fire", "cryo-floor-ice-form"]);
	  const cryoSecondBeamWindowCueCount =
	    cryoSecondBeamEvent.bossSoundCues.filter((cue) => cue.id === "boss-test" && cue.cue === "cryo-beam-fire").length +
	    (cryoSecondWindowCueCounts.get("cryo-beam-fire") || 0);
	  const cryoSecondIceWindowCueCount =
	    cryoSecondBeamEvent.bossSoundCues.filter((cue) => cue.id === "boss-test" && cue.cue === "cryo-floor-ice-form").length +
	    (cryoSecondWindowCueCounts.get("cryo-floor-ice-form") || 0);
	  assert(cryoSecondBeamWindowCueCount === 1, `Expected exactly one later cryo beam SFX cue in the active window, got ${cryoSecondBeamWindowCueCount}`);
	  assert(cryoSecondIceWindowCueCount === 1, `Expected exactly one later cryo floor ice SFX cue in the active window, got ${cryoSecondIceWindowCueCount}`);
  const cryoDefeatPauseLevel = {
    ...bossLevel,
    bosses: [{ ...bossLevel.bosses[0], kind: "cryo-conservator", introSeconds: 1, health: 1 }]
  };
  const cryoDefeatPauseSim = new RoomSimulation(cryoDefeatPauseLevel);
  Object.assign(cryoDefeatPauseSim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  cryoDefeatPauseSim.step(idle);
  runFrames(cryoDefeatPauseSim, 60, idle);
  const cryoDefeatVulnerable = runBossUntilVulnerable(cryoDefeatPauseSim, "boss-test");
  const cryoDefeatHit = upwardHitBoss(cryoDefeatPauseSim, cryoDefeatVulnerable);
  assert(cryoDefeatHit.bossDefeated?.id === "boss-test", "Expected one-health cryo boss to be defeated by a vulnerable hit");
  const cryoDeparting = cryoDefeatPauseSim.bossSnapshots()[0];
  assert(
    cryoDeparting.departurePauseFrames === BOSS_DEFEAT_PAUSE_FRAMES && cryoDeparting.departureFrames === 0,
    `Expected cryo boss defeat to start with pause before movement, got ${JSON.stringify({
      pause: cryoDeparting.departurePauseFrames,
      frame: cryoDeparting.departureFrames
    })}`
  );
  const cryoDepartureStart = { x: cryoDeparting.body.x, y: cryoDeparting.body.y };
  let cryoPauseUnlock = null;
  for (let guard = 0; guard < BOSS_DEFEAT_PAUSE_FRAMES; guard += 1) {
    const event = cryoDefeatPauseSim.step(idle);
    if (event.bossPortalUnlocked || event.won) cryoPauseUnlock = event;
    const snapshot = cryoDefeatPauseSim.bossSnapshots()[0];
    assert(snapshot.departureFrames === 0, `Expected cryo departure movement to wait for pause, got ${snapshot.departureFrames}`);
  }
  const cryoAfterPause = cryoDefeatPauseSim.bossSnapshots()[0];
  assert(!cryoPauseUnlock, "Expected cryo boss portal unlock to wait until after pause and departure movement");
  assert(
    cryoAfterPause.departurePauseFrames === 0 &&
      Math.abs(cryoAfterPause.body.x - cryoDepartureStart.x) <= 0.01 &&
      Math.abs(cryoAfterPause.body.y - cryoDepartureStart.y) <= 0.01,
    `Expected cryo boss to hold position through defeat pause, got start ${JSON.stringify(cryoDepartureStart)} and after ${JSON.stringify(cryoAfterPause.body)}`
  );
  let cryoDepartureUnlock = null;
  let cryoDepartureMoved = null;
  for (let guard = 0; guard < cryoDeparting.departureTotalFrames + 20; guard += 1) {
    const event = cryoDefeatPauseSim.step(idle);
    const snapshot = cryoDefeatPauseSim.bossSnapshots()[0];
    if (!cryoDepartureMoved && snapshot?.phase === "departing" && snapshot.departureFrames >= Math.floor(cryoDeparting.departureTotalFrames / 2)) {
      cryoDepartureMoved = snapshot;
    }
    if (event.bossPortalUnlocked) {
      cryoDepartureUnlock = event;
      break;
    }
  }
  assert(cryoDepartureMoved?.body.x > cryoDepartureStart.x + 20, `Expected cryo boss to move after defeat pause, got ${JSON.stringify(cryoDepartureMoved?.body)}`);
  assert(cryoDepartureUnlock?.bossPortalUnlocked, "Expected cryo boss departure to unlock the portal after movement finishes");

  const cryoBeamDeathSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoBeamDeathSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  cryoBeamDeathSim.step(idle);
  runFrames(cryoBeamDeathSim, 60, idle);
  Object.assign(cryoBeamDeathSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const cryoBeamDeathAttack = runBossUntilAttack(cryoBeamDeathSim, "boss-test");
  Object.assign(cryoBeamDeathSim.player, {
    x: cryoBeamDeathAttack.attacks[0].x + cryoBeamDeathAttack.attacks[0].w / 2 - 12,
    y: 86,
    vx: 0,
    vy: 0,
    onGround: true
  });
  const cryoBeamDeath = cryoBeamDeathSim.step(idle);
  assert(cryoBeamDeath.died && cryoBeamDeathSim.dead, "Expected active cryo beam to kill the player");

  const cryoIceSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoIceSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  cryoIceSim.step(idle);
  runFrames(cryoIceSim, 60, idle);
  Object.assign(cryoIceSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  runBossUntilAttack(cryoIceSim, "boss-test");
  const cryoIceVulnerable = runBossUntilVulnerable(cryoIceSim, "boss-test");
  assert(cryoIceVulnerable.floorIce.length === 1, "Expected cryo floor ice to persist into the vulnerable cooldown");
  assert(cryoIceVulnerable.floorIce[0].remainingFrames > 1040, `Expected cryo ice to retain most of its 21 second life during cooldown, got ${JSON.stringify(cryoIceVulnerable.floorIce[0])}`);
  placePlayerOnFloorEffect(cryoIceSim, cryoIceVulnerable.floorIce[0], 8);
  cryoIceSim.player.vx = 2;
  const cryoIceStep = cryoIceSim.step(idle);
  assert(!cryoIceStep.died && !cryoIceSim.dead, "Expected post-beam cryo floor ice not to kill the player");
  assert(cryoIceSim.player.vx > 1.9, `Expected cryo floor ice to preserve slide velocity, got ${cryoIceSim.player.vx}`);

  const cryoMissedCycleSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoMissedCycleSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  cryoMissedCycleSim.step(idle);
  runFrames(cryoMissedCycleSim, 60, idle);
  const cryoMissedVulnerable = runBossUntilVulnerable(cryoMissedCycleSim, "boss-test");
  Object.assign(cryoMissedCycleSim.player, { x: 32, y: 18, vx: 0, vy: 0, onGround: false });
  const cryoFramesUntilNextCycle =
    bossAttackCycleFramesFor(cryoMissedVulnerable) - (cryoMissedVulnerable.activeFrames % bossAttackCycleFramesFor(cryoMissedVulnerable));
  runFrames(cryoMissedCycleSim, cryoFramesUntilNextCycle, idle);
  const cryoMissedLiftStart = cryoMissedCycleSim.bossSnapshots()[0];
  const cryoMissedSmoothMotion = assertBossMotionSmoothForFrames(cryoMissedCycleSim, "boss-test", 12, 7.5, "cryo missed-window lift");
  const cryoMissedLiftLater = cryoMissedSmoothMotion.snapshot;
  const cryoMissedLiftDelta = cryoMissedLiftStart.body.y - cryoMissedLiftLater.body.y;
  assert(
    cryoMissedLiftDelta > 0.2 && cryoMissedLiftDelta < 12,
    `Expected cryo boss to lift gradually after a missed weak point, moved ${cryoMissedLiftDelta}px from ${cryoMissedLiftStart.body.y} to ${cryoMissedLiftLater.body.y}`
  );

  const cryoStandingHitSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoStandingHitSim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  cryoStandingHitSim.step(idle);
  runFrames(cryoStandingHitSim, 60, idle);
  const cryoStandingVulnerable = runBossUntilVulnerable(cryoStandingHitSim, "boss-test");
  const cryoStandingHit = standUnderBossWeakSpot(cryoStandingHitSim, cryoStandingVulnerable);
  assert(cryoStandingHit.bossHit === null, "Expected standing under the cryo boss vulnerable underside not to register without a jump");
  assert(cryoStandingHitSim.bossSnapshots()[0].health === 2, "Expected cryo boss health to stay unchanged after standing under its weak spot");

  const cryoJumpHitSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoJumpHitSim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  cryoJumpHitSim.step(idle);
  runFrames(cryoJumpHitSim, 60, idle);
  const cryoJumpVulnerable = runBossUntilVulnerable(cryoJumpHitSim, "boss-test");
  const cryoJumpHit = jumpHitBoss(cryoJumpHitSim, cryoJumpVulnerable);
  assert(cryoJumpHit.bossHit?.id === "boss-test", "Expected a normal floor jump to hit the cryo boss vulnerable underside");

  const cryoRecoverySim = new RoomSimulation(cryoLevel);
  Object.assign(cryoRecoverySim.player, { x: bossLevel.start.x, y: 86, vx: 0, vy: 0, onGround: true });
  cryoRecoverySim.step(idle);
  runFrames(cryoRecoverySim, 60, idle);
  const cryoRecoveryVulnerable = runBossUntilVulnerable(cryoRecoverySim, "boss-test");
  const cryoRecoveryHit = upwardHitBoss(cryoRecoverySim, cryoRecoveryVulnerable);
  assert(cryoRecoveryHit.bossHit?.health === 1, "Expected first cryo boss hit to leave one health for the repeat cycle");
  assert(!cryoRecoveryHit.bossDefeated, "Expected first cryo boss hit not to defeat a two-health boss");
  const cryoAfterHit = cryoRecoverySim.bossSnapshots()[0];
  assert(cryoAfterHit.recoveryFrames > 0, "Expected cryo boss to enter recovery after a nonfatal hit");
  assert(!bossIsVulnerable(cryoAfterHit), "Expected cryo boss to close its weak spot after a successful nonfatal hit");
  assert(cryoAfterHit.attacks.length === 0, "Expected cryo boss recovery to clear beam hazards");
  assert(cryoAfterHit.floorIce.length === 1, "Expected cryo boss recovery to keep existing floor ice terrain control");
  const cryoImmediateRetry = upwardHitBoss(cryoRecoverySim, cryoAfterHit);
  assert(cryoImmediateRetry.bossHit === null, "Expected cryo boss to ignore an immediate repeat hit during recovery immunity");
  assert(cryoRecoverySim.bossSnapshots()[0].health === 1, "Expected cryo boss health to stay unchanged after an immediate repeat hit attempt");
  const cryoRecoveryPauseStart = cryoRecoverySim.bossSnapshots()[0];
  runFrames(cryoRecoverySim, 30, idle);
  const cryoRecoveryPause = cryoRecoverySim.bossSnapshots()[0];
  assert(
    Math.abs(cryoRecoveryPause.body.y - cryoRecoveryPauseStart.body.y) <= 6,
    `Expected cryo boss to pause before rising, from ${cryoRecoveryPauseStart.body.y} to ${cryoRecoveryPause.body.y}`
  );
  runFrames(cryoRecoverySim, 80, idle);
  const cryoRecoveryRising = cryoRecoverySim.bossSnapshots()[0];
  assert(
    cryoRecoveryPause.body.y - cryoRecoveryRising.body.y > 0.5,
    `Expected cryo boss to rise after its post-hit pause, from ${cryoRecoveryPause.body.y} to ${cryoRecoveryRising.body.y}`
  );

  const cryoNarrowDualSim = new RoomSimulation(cryoLevel);
  Object.assign(cryoNarrowDualSim.player, { x: targetPlayerCenterX - 12, y: 86, vx: 0, vy: 0, onGround: true });
  cryoNarrowDualSim.step(idle);
  runFrames(cryoNarrowDualSim, 60, idle);
  const cryoNarrowOpeningAttack = runBossUntilAttack(cryoNarrowDualSim, "boss-test");
  assert(cryoNarrowOpeningAttack.attacks.length === 1, `Expected full-health narrow cryo fixture to fire one beam, got ${cryoNarrowOpeningAttack.attacks.length}`);
  const cryoNarrowVulnerable = runBossUntilVulnerable(cryoNarrowDualSim, "boss-test");
  const cryoNarrowHit = upwardHitBoss(cryoNarrowDualSim, cryoNarrowVulnerable);
  assert(cryoNarrowHit.bossHit?.health === 1, "Expected narrow cryo fixture to reach half health after first hit");
  for (let guard = 0; guard < 260 && cryoNarrowDualSim.bossSnapshots()[0]?.recoveryFrames > 0; guard += 1) {
    cryoNarrowDualSim.step(idle);
  }
  Object.assign(cryoNarrowDualSim.player, { x: 240 - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const cryoNarrowWarning = runBossUntilWarning(cryoNarrowDualSim, "boss-test");
  const cryoNarrowWarningLanes = cryoNarrowWarning.attackWarnings.map((warning) => Math.round(warning.originX)).sort((a, b) => a - b);
  assert(cryoNarrowWarning.attackWarnings.length === 2, `Expected half-health narrow cryo warm-up to warn two lanes, got ${cryoNarrowWarning.attackWarnings.length}`);
  assert(
    cryoNarrowWarning.attackWarnings.every((warning) => warning.originX >= cryoNarrowWarning.body.x && warning.originX <= cryoNarrowWarning.body.x + cryoNarrowWarning.body.w),
    `Expected half-health narrow cryo warnings to stay within the boss body, got body ${JSON.stringify(cryoNarrowWarning.body)} and warnings ${JSON.stringify(cryoNarrowWarning.attackWarnings)}`
  );
  assert(
    cryoNarrowWarningLanes[1] - cryoNarrowWarningLanes[0] > 70,
    `Expected half-health narrow cryo warning lanes to stay separated, got ${cryoNarrowWarningLanes.join(",")}`
  );
  const cryoNarrowAttack = runBossUntilAttack(cryoNarrowDualSim, "boss-test");
  const cryoNarrowAttackLanes = cryoNarrowAttack.attacks.map((attack) => Math.round(attack.originX)).sort((a, b) => a - b);
  assert(cryoNarrowAttack.attacks.length === 2, `Expected half-health narrow cryo boss to fire two beams, got ${cryoNarrowAttack.attacks.length}`);
  assert(
    cryoNarrowAttack.attacks.every((attack) => attack.originX >= cryoNarrowAttack.body.x && attack.originX <= cryoNarrowAttack.body.x + cryoNarrowAttack.body.w),
    `Expected half-health narrow cryo beams to stay within the boss body, got body ${JSON.stringify(cryoNarrowAttack.body)} and attacks ${JSON.stringify(cryoNarrowAttack.attacks)}`
  );
  assert(
    cryoNarrowAttackLanes.every((lane, index) => Math.abs(lane - cryoNarrowWarningLanes[index]) <= 12),
    `Expected narrow cryo beams to match warned lanes ${cryoNarrowWarningLanes.join(",")}, got ${cryoNarrowAttackLanes.join(",")}`
  );
  const cryoNarrowIceCenters = cryoNarrowAttack.floorIce.map((ice) => Math.round(ice.x + ice.w / 2));
  for (const lane of cryoNarrowAttackLanes) {
    assert(
      cryoNarrowIceCenters.some((center) => Math.abs(center - lane) <= 36),
      `Expected narrow half-health cryo lane ${lane} to preserve its own floor ice, got centers ${cryoNarrowIceCenters.join(",")}`
    );
  }

  const cryoStackLevel = {
    ...cryoLevel,
    exit: { x: 700, y: 82, w: 28, h: 38 },
    bounds: { x: 0, y: 0, w: 760, h: 180 },
    solids: [
      { id: "floor", x: 0, y: 120, w: 760, h: 40 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 180 },
      { id: "right-wall", x: 760, y: 0, w: 20, h: 180 }
    ],
    bosses: [{ ...cryoLevel.bosses[0], x: 20, y: 20, w: 700, h: 130 }]
  };
  const cryoDualSim = new RoomSimulation(cryoStackLevel);
  Object.assign(cryoDualSim.player, { x: 100 - 12, y: 86, vx: 0, vy: 0, onGround: true });
  cryoDualSim.step(idle);
  runFrames(cryoDualSim, 60, idle);
  const cryoDualOpeningAttack = runBossUntilAttack(cryoDualSim, "boss-test");
  assert(cryoDualOpeningAttack.attacks.length === 1, `Expected full-health cryo boss to fire one beam, got ${cryoDualOpeningAttack.attacks.length}`);
  const cryoDualVulnerable = runBossUntilVulnerable(cryoDualSim, "boss-test");
  const cryoDualHit = upwardHitBoss(cryoDualSim, cryoDualVulnerable);
  assert(cryoDualHit.bossHit?.health === 1, "Expected cryo boss to reach half health after first hit");
  Object.assign(cryoDualSim.player, { x: 80, y: 86, vx: 0, vy: 0, onGround: true });
  for (let guard = 0; guard < 260 && cryoDualSim.bossSnapshots()[0]?.recoveryFrames > 0; guard += 1) {
    cryoDualSim.step(idle);
  }
  const cryoDualReady = cryoDualSim.bossSnapshots()[0];
  assert(cryoDualReady.health === 1 && cryoDualReady.recoveryFrames === 0, `Expected cryo boss ready at half health, got ${JSON.stringify({ health: cryoDualReady.health, recoveryFrames: cryoDualReady.recoveryFrames })}`);
  Object.assign(cryoDualSim.player, { x: 554 - 12, y: 86, vx: 0, vy: 0, onGround: true });
  const cryoDualWarning = runBossUntilWarning(cryoDualSim, "boss-test");
  const cryoDualWarningLanes = cryoDualWarning.attackWarnings.map((warning) => Math.round(warning.originX)).sort((a, b) => a - b);
  assert(cryoDualWarning.attackWarnings.length === 2, `Expected half-health cryo warm-up to warn two lanes, got ${cryoDualWarning.attackWarnings.length}`);
  assert(
    cryoDualWarning.attackWarnings.every((warning) => warning.originX >= cryoDualWarning.body.x && warning.originX <= cryoDualWarning.body.x + cryoDualWarning.body.w),
    `Expected half-health cryo warning lanes to stay within the boss body, got body ${JSON.stringify(cryoDualWarning.body)} and warnings ${JSON.stringify(cryoDualWarning.attackWarnings)}`
  );
  assert(
    cryoDualWarningLanes[1] - cryoDualWarningLanes[0] > 100,
    `Expected half-health cryo warning lanes to be visibly separated, got ${cryoDualWarningLanes.join(",")}`
  );
  const cryoDualAttack = runBossUntilAttack(cryoDualSim, "boss-test");
  const cryoDualAttackLanes = cryoDualAttack.attacks.map((attack) => Math.round(attack.originX)).sort((a, b) => a - b);
  assert(cryoDualAttack.attacks.length === 2, `Expected half-health cryo boss to fire two beams, got ${cryoDualAttack.attacks.length}`);
  assert(
    cryoDualAttack.attacks.every((attack) => attack.originX >= cryoDualAttack.body.x && attack.originX <= cryoDualAttack.body.x + cryoDualAttack.body.w),
    `Expected half-health cryo beams to stay within the boss body, got body ${JSON.stringify(cryoDualAttack.body)} and attacks ${JSON.stringify(cryoDualAttack.attacks)}`
  );
  assert(
    cryoDualAttackLanes.every((lane, index) => Math.abs(lane - cryoDualWarningLanes[index]) <= 12),
    `Expected active cryo beams to match warned lanes ${cryoDualWarningLanes.join(",")}, got ${cryoDualAttackLanes.join(",")}`
  );
  const cryoDualIceCenters = cryoDualAttack.floorIce.map((ice) => Math.round(ice.x + ice.w / 2));
  for (const lane of cryoDualAttackLanes) {
    assert(
      cryoDualIceCenters.some((center) => Math.abs(center - lane) <= 70),
      `Expected half-health cryo beam lane ${lane} to create or refresh floor ice, got centers ${cryoDualIceCenters.join(",")}`
    );
  }

  const cryoStackSim = new RoomSimulation(cryoStackLevel);
  Object.assign(cryoStackSim.player, { x: 190, y: 86, vx: 0, vy: 0, onGround: true });
  cryoStackSim.step(idle);
  runFrames(cryoStackSim, 60, idle);
  const cryoStackTargets = [100, 250, 400, 554];
  const cryoStackCenters = new Set();
  const cryoStackCounts = [];
  const cryoStackDetails = [];
  let cryoMaxStack = 0;
  for (const targetX of cryoStackTargets) {
    Object.assign(cryoStackSim.player, { x: targetX - 12, y: 86, vx: 0, vy: 0, onGround: true });
    const stackAttack = runBossUntilAttack(cryoStackSim, "boss-test");
    cryoMaxStack = Math.max(cryoMaxStack, stackAttack.floorIce.length);
    cryoStackCounts.push(stackAttack.floorIce.length);
    cryoStackDetails.push(stackAttack.floorIce.map((ice) => `${Math.round(ice.x + ice.w / 2)}:${Math.round(ice.remainingFrames)}`).join("/"));
    for (const ice of stackAttack.floorIce) {
      cryoStackCenters.add(Math.round(ice.x + ice.w / 2));
    }
    assert(stackAttack.floorIce.length <= 4, `Expected cryo ice stack to stay capped at 4 patches, got ${stackAttack.floorIce.length}`);
    runBossUntilVulnerable(cryoStackSim, "boss-test");
  }
  const cryoStackSnapshot = cryoStackSim.bossSnapshots()[0];
  assert(
    cryoMaxStack >= 4,
    `Expected cryo ice to allow four consecutive overlapping lanes, got max stack ${cryoMaxStack}, counts ${cryoStackCounts.join(",")}, centers ${[...cryoStackCenters].join(",")}, details ${cryoStackDetails.join(",")}`
  );
  assert(cryoStackSnapshot.floorIce.length >= 3, `Expected cryo ice to preserve at least three active patches after repeated attacks, got ${cryoStackSnapshot.floorIce.length}`);
  assert(cryoStackSnapshot.floorIce.length <= 4, `Expected cryo ice to cap at 4 active patches, got ${cryoStackSnapshot.floorIce.length}`);
  assert(
    cryoStackCenters.size >= 4,
    `Expected stacked cryo ice sequence to preserve four lanes, got centers ${[...cryoStackCenters].join(",")}`
  );

  const multiBossLevel = {
    ...baseLevel,
    exit: { x: 580, y: 82, w: 28, h: 38 },
    bounds: { x: 0, y: 0, w: 640, h: 180 },
    solids: [
      { id: "floor", x: 0, y: 120, w: 640, h: 40 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 180 },
      { id: "right-wall", x: 640, y: 0, w: 20, h: 180 }
    ],
    doors: [
      { id: "boss-a-door", x: 4, y: 4, w: 12, h: 12, opensWith: ["boss-a"] },
      { id: "boss-b-door", x: 22, y: 4, w: 12, h: 12, opensWith: ["boss-b"] }
    ],
    bosses: [
      { id: "boss-a", kind: "storm-relay-warden", x: 60, y: 20, w: 220, h: 130, entrySide: "right", introSeconds: 1, health: 1, score: 700 },
      { id: "boss-b", kind: "storm-relay-warden", x: 330, y: 20, w: 220, h: 130, entrySide: "left", introSeconds: 1, health: 1, score: 900 }
    ]
  };
  const multiBossSim = new RoomSimulation(multiBossLevel);
  Object.assign(multiBossSim.player, { x: 62, y: 86, vx: 0, vy: 0, onGround: true });
  const multiBossStartA = multiBossSim.step(idle);
  assert(multiBossStartA.bossCheckpointActivated === "boss-a", "Expected first boss to create its checkpoint");
  assert(multiBossSim.bossCheckpointActive(), "Expected first boss checkpoint to be active during intro");
  runFrames(multiBossSim, 60, idle);
  const multiBossVulnerableA = runBossUntilVulnerable(multiBossSim, "boss-a");
  const multiBossDefeatA = upwardHitBoss(multiBossSim, multiBossVulnerableA);
  assert(multiBossDefeatA.bossDefeated?.id === "boss-a", "Expected first multi-boss defeat");
  assert(!multiBossDefeatA.bossPortalUnlocked, "Expected first multi-boss defeat to keep portal locked");
  assert(!multiBossSim.exitUnlocked(), "Expected multi-boss exit to remain locked after first boss");
  assert(!multiBossSim.bossCheckpointActive(), "Expected first boss checkpoint to clear after first boss defeat");
  let multiBossDepartureA = null;
  const multiBossDepartingA = multiBossSim.bossSnapshots().find((boss) => boss.id === "boss-a");
  for (let guard = 0; guard < BOSS_DEFEAT_PAUSE_FRAMES + (multiBossDepartingA?.departureTotalFrames || 170) + 20; guard += 1) {
    const event = multiBossSim.step(idle);
    if (event.bossDepartureFinished) {
      multiBossDepartureA = event;
      break;
    }
  }
  assert(multiBossDepartureA?.bossDepartureFinished === "boss-a", "Expected first sequential boss to emit departure finished before second boss starts");
  assert(!multiBossDepartureA.bossPortalUnlocked, "Expected first sequential boss departure not to unlock the portal while boss-b is idle");
  assert(!multiBossSim.bossFightInProgress(), "Expected boss fight to end after first boss departure while remaining boss is idle");
  assert(!multiBossSim.exitUnlocked(), "Expected multi-boss exit to remain locked after first boss departure");
  Object.assign(multiBossSim.player, { x: 332, y: 86, vx: 0, vy: 0, onGround: true });
  const multiBossStartB = multiBossSim.step(idle);
  assert(multiBossStartB.bossCheckpointActivated === "boss-b", "Expected second boss to create a fresh checkpoint");
  assert(multiBossSim.bossCheckpointActive(), "Expected second boss checkpoint to be active during intro");

  const overlappingBossLevel = {
    ...multiBossLevel,
    bosses: [
      { id: "music-boss-a", kind: "storm-relay-warden", x: 60, y: 20, w: 220, h: 130, entrySide: "right", introSeconds: 1, health: 1, soundtrackKey: "level-2" },
      { id: "music-boss-b", kind: "storm-relay-warden", x: 60, y: 20, w: 220, h: 130, entrySide: "left", introSeconds: 1, health: 1, soundtrackKey: "level-3" }
    ]
  };
  const overlappingBossSim = new RoomSimulation(overlappingBossLevel);
  Object.assign(overlappingBossSim.player, { x: 62, y: 86, vx: 0, vy: 0, onGround: true });
  const overlappingBossStart = overlappingBossSim.step(idle);
  assert(overlappingBossStart.bossIntroStarted === "music-boss-b", "Expected simultaneous boss intro event to match the final checkpoint owner");
  assert(overlappingBossStart.bossCheckpointActivated === "music-boss-b", "Expected simultaneous boss checkpoint event to match the final checkpoint owner");
  assert(overlappingBossSim.bossCheckpointBossId() === "music-boss-b", "Expected later overlapping boss to own the active checkpoint");
  runFrames(overlappingBossSim, 60, idle);
  const overlappingVulnerable = runBossUntilVulnerable(overlappingBossSim, "music-boss-b");
  const overlappingDefeat = upwardHitBoss(overlappingBossSim, overlappingVulnerable);
  const overlappingHitIds = overlappingDefeat.bossHits.map((event) => event.id).sort();
  const overlappingDefeatIds = overlappingDefeat.bossDefeateds.map((event) => event.id).sort();
  assert(
    overlappingHitIds.join(",") === "music-boss-a,music-boss-b",
    `Expected overlapping boss hit event arrays to include both bosses, got ${overlappingHitIds.join(",")}`
  );
  assert(
    overlappingDefeatIds.join(",") === "music-boss-a,music-boss-b",
    `Expected overlapping boss defeat event arrays to include both bosses, got ${overlappingDefeatIds.join(",")}`
  );
  assert(overlappingDefeat.bossDefeated?.id === "music-boss-b", "Expected scalar boss defeat event to preserve latest processed boss for compatibility");
  assert(overlappingBossSim.score === 2000, `Expected overlapping boss defeat to score both bosses, got ${overlappingBossSim.score}`);
  assert(
    overlappingBossSim.bossStates.get("music-boss-a")?.phase === "departing" &&
      overlappingBossSim.bossStates.get("music-boss-b")?.phase === "departing",
    "Expected both overlapping bosses to enter departure after simultaneous defeat"
  );
  let overlappingDepartureFinish = null;
  for (let guard = 0; guard < BOSS_DEFEAT_PAUSE_FRAMES + overlappingVulnerable.departureTotalFrames + 30; guard += 1) {
    const event = overlappingBossSim.step(idle);
    if (event.bossDepartureFinishedIds.length > 0) {
      overlappingDepartureFinish = event;
      break;
    }
  }
  const overlappingDepartureIds = (overlappingDepartureFinish?.bossDepartureFinishedIds || []).slice().sort();
  assert(
    overlappingDepartureIds.join(",") === "music-boss-a,music-boss-b",
    `Expected overlapping boss departure finish arrays to include both bosses, got ${overlappingDepartureIds.join(",")}`
  );
  assert(overlappingDepartureFinish?.bossDepartureFinished === "music-boss-b", "Expected scalar departure finish event to preserve latest processed boss");
  assert(overlappingDepartureFinish.bossPortalUnlocked, "Expected overlapping boss departure finish to unlock the portal after both bosses finish");

  const simultaneousBossSim = new RoomSimulation(multiBossLevel);
  Object.assign(simultaneousBossSim.player, { x: 62, y: 86, vx: 0, vy: 0, onGround: true });
  simultaneousBossSim.step(idle);
  Object.assign(simultaneousBossSim.player, { x: 332, y: 86, vx: 0, vy: 0, onGround: true });
  simultaneousBossSim.step(idle);
  runFrames(simultaneousBossSim, 60, idle);
  assert(simultaneousBossSim.bossFightInProgress(), "Expected simultaneous multi-boss fight to be in progress before first defeat");
  const simultaneousBossVulnerableA = runBossUntilVulnerable(simultaneousBossSim, "boss-a");
  const simultaneousBossDefeatA = upwardHitBoss(simultaneousBossSim, simultaneousBossVulnerableA);
  assert(simultaneousBossDefeatA.bossDefeated?.id === "boss-a", "Expected first simultaneous boss defeat");
  assert(!simultaneousBossDefeatA.bossPortalUnlocked, "Expected simultaneous first boss defeat to keep portal locked");
  assert(simultaneousBossSim.bossFightInProgress(), "Expected boss fight to remain in progress while second boss is still active");
  simultaneousBossSim.step(idle);
  assert(simultaneousBossSim.objectState.openDoors.has("boss-a-door"), "Expected boss-a door to open before checkpoint death");
  const simultaneousBossAttackB = runBossUntilAttack(simultaneousBossSim, "boss-b");
  const simultaneousAttackB = simultaneousBossAttackB.attacks[0];
  Object.assign(simultaneousBossSim.player, {
    x: simultaneousAttackB.x + simultaneousAttackB.w / 2 - 12,
    y: simultaneousAttackB.y + simultaneousAttackB.h / 2 - 16,
    vx: 0,
    vy: 0,
    onGround: false
  });
  const simultaneousBossBDeath = simultaneousBossSim.step(idle);
  assert(simultaneousBossBDeath.died, "Expected second simultaneous boss attack collision to kill player");
  simultaneousBossSim.resetLifeAttempt();
  assert(simultaneousBossSim.bossStates.get("boss-a")?.phase === "defeated", "Expected checkpoint restore to preserve defeated non-owner boss");
  assert(simultaneousBossSim.objectState.openDoors.has("boss-a-door"), "Expected checkpoint restore to preserve door opened by defeated non-owner boss");

  const simultaneousCheckpointSim = new RoomSimulation(multiBossLevel);
  Object.assign(simultaneousCheckpointSim.player, { x: 62, y: 86, vx: 0, vy: 0, onGround: true });
  simultaneousCheckpointSim.step(idle);
  runFrames(simultaneousCheckpointSim, 60, idle);
  Object.assign(simultaneousCheckpointSim.player, { x: 332, y: 86, vx: 0, vy: 0, onGround: true });
  simultaneousCheckpointSim.step(idle);
  assert(simultaneousCheckpointSim.bossCheckpointActive(), "Expected second simultaneous boss to create a checkpoint");
  assert(simultaneousCheckpointSim.bossCheckpointBossId() === "boss-b", "Expected second simultaneous boss to own the active checkpoint");
  runFrames(simultaneousCheckpointSim, 60, idle);
  const simultaneousBossVulnerableB = runBossUntilVulnerable(simultaneousCheckpointSim, "boss-b");
  const simultaneousCheckpointDefeatB = upwardHitBoss(simultaneousCheckpointSim, simultaneousBossVulnerableB);
  assert(simultaneousCheckpointDefeatB.bossDefeated?.id === "boss-b", "Expected checkpoint-owning second boss defeat");
  assert(simultaneousCheckpointSim.bossCheckpointActive(), "Expected checkpoint to remain active while first simultaneous boss is still active");
  const simultaneousBossAAfterB = simultaneousCheckpointSim.bossSnapshots().find((boss) => boss.id === "boss-a");
  assert(simultaneousBossAAfterB, "Expected first simultaneous boss to remain active after second boss defeat");
  const simultaneousBossAttackA = runBossUntilAttack(simultaneousCheckpointSim, "boss-a");
  assertAttackStartsFromBoss(simultaneousBossAttackA, "simultaneous boss attack");
  const simultaneousAttackA = simultaneousBossAttackA.attacks[0];
  Object.assign(simultaneousCheckpointSim.player, {
    x: simultaneousAttackA.x + simultaneousAttackA.w / 2 - 12,
    y: simultaneousAttackA.y + simultaneousAttackA.h / 2 - 16,
    vx: 0,
    vy: 0,
    onGround: false
  });
  const simultaneousCheckpointDeath = simultaneousCheckpointSim.step(idle);
  assert(simultaneousCheckpointDeath.died, "Expected simultaneous checkpoint boss attack collision to kill player");
  simultaneousCheckpointSim.resetLifeAttempt();
  assert(simultaneousCheckpointSim.bossFightInProgress(), "Expected checkpoint restore to preserve an in-progress simultaneous boss fight");
  assert(simultaneousCheckpointSim.bossCheckpointBossId() === "boss-a", "Expected checkpoint restore to reassign checkpoint ownership to remaining boss");
  assert(simultaneousCheckpointSim.bossStates.get("boss-b")?.phase === "defeated", "Expected checkpoint restore to preserve defeated second boss");
  assert(simultaneousCheckpointSim.objectState.openDoors.has("boss-b-door"), "Expected checkpoint restore to preserve door opened by defeated second boss");

  const bossCheckpointLevel = {
    ...baseLevel,
    score: { ...baseLevel.score, coreScore: 1000 },
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
  const checkpointBossAttackSnapshot = runBossUntilAttack(bossCheckpointSim, "checkpoint-boss");
  assertAttackStartsFromBoss(checkpointBossAttackSnapshot, "checkpoint boss attack");
  const checkpointBossAttack = checkpointBossAttackSnapshot.attacks[0];
  Object.assign(bossCheckpointSim.player, {
    x: checkpointBossAttack.x + checkpointBossAttack.w / 2 - 12,
    y: checkpointBossAttack.y + checkpointBossAttack.h / 2 - 16,
    vx: 0,
    vy: 0,
    onGround: false
  });
  const checkpointDeath = bossCheckpointSim.step(idle);
  assert(checkpointDeath.died, "Expected boss attack collision to kill the player during checkpoint fight");
  bossCheckpointSim.resetLifeAttempt();
  assert(!bossCheckpointSim.dead, "Expected checkpoint life reset to respawn alive");
  assert(bossCheckpointSim.bossStates.get("checkpoint-boss")?.phase === "idle", "Expected checkpoint restore to reset boss fight to idle");
  assert(bossCheckpointSim.objectState.collectedCores.has("pre-boss-core"), "Expected checkpoint restore to preserve collected core");
  assert(bossCheckpointSim.score === 1000, `Expected checkpoint restore to preserve score without a death penalty, got ${bossCheckpointSim.score}`);
  assert(bossCheckpointSim.totalFrames === 1, `Expected checkpoint restore to preserve pre-boss frame count, got ${bossCheckpointSim.totalFrames}`);
  assert(bossCheckpointSim.currentRecording.length === 0, "Expected checkpoint restore to start a fresh continuous recording");
  const checkpointRewindTarget = { x: bossCheckpointSim.player.x, y: bossCheckpointSim.player.y };
  const checkpointRewindScore = bossCheckpointSim.score;
  const checkpointRewindFrames = bossCheckpointSim.totalFrames;
  Object.assign(bossCheckpointSim.player, { x: 150, y: 86, vx: 1.2, vy: 0, onGround: true });
  bossCheckpointSim.currentRecording = Array.from({ length: 20 }, () => encodeInputFrame(right));
  assert(bossCheckpointSim.rewindToEcho(), "Expected checkpoint rewind to anchor an echo");
  assert(bossCheckpointSim.bossCheckpointActive(), "Rewind should preserve the active boss checkpoint");
  assert(
    bossCheckpointSim.player.x === checkpointRewindTarget.x && bossCheckpointSim.player.y === checkpointRewindTarget.y,
    `Rewind should return player to checkpoint target ${JSON.stringify(checkpointRewindTarget)}, got ${bossCheckpointSim.player.x},${bossCheckpointSim.player.y}`
  );
  assert(bossCheckpointSim.echoes.at(-1)?.x === 150 && bossCheckpointSim.echoes.at(-1)?.y === 86, "Checkpoint rewind should leave echo at the current player position");
  assert(bossCheckpointSim.score === checkpointRewindScore, `Checkpoint rewind should preserve score, got ${bossCheckpointSim.score}`);
  assert(bossCheckpointSim.totalFrames === checkpointRewindFrames, `Checkpoint rewind should preserve time, got ${bossCheckpointSim.totalFrames}`);
  assert(bossCheckpointSim.objectState.collectedCores.has("pre-boss-core"), "Checkpoint rewind should preserve collected cores");

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
  Object.assign(replay.player, {
    vx: 1.75,
    vy: -4.5,
    onGround: false,
    coyote: 3,
    jumpBuffer: 2,
    launchCooldown: 5,
    launchControlLock: 6,
    launchFloatFrames: 7,
    prevJump: true,
    facing: -1
  });
  assert(replay.rewindToEcho(), "Expected deterministic setup attempt to become an echo");
  const echo = replay.echoes[0];
  const actual = {
    x: Number(echo.x.toFixed(3)),
    y: Number(echo.y.toFixed(3)),
    tick: replay.tick
  };
  assert(
    actual.x === expected.x && actual.y === expected.y && actual.tick === expected.tick,
    `Echo anchor diverged: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
  assert(
    echo.vx === 1.75 &&
      echo.vy === -4.5 &&
      !echo.onGround &&
      echo.coyote === 3 &&
      echo.jumpBuffer === 2 &&
      echo.launchCooldown === 5 &&
      echo.launchControlLock === 6 &&
      echo.launchFloatFrames === 7 &&
      echo.prevJump &&
      echo.facing === -1,
    `Echo anchor should preserve current player motion state, got ${JSON.stringify(echo)}`
  );
  assert(replay.player.x === deterministicLevel.start.x && replay.player.y === deterministicLevel.start.y, "Rewind should teleport the player to start after anchoring echo");

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
          "monster-defaults",
          "boss-intro-combat",
          "drone-disable-vaporization",
          "fall-death-freeze",
          "deterministic-anchor",
          "audio-unlock-retry",
          "game-scene-audio-cleanup-hooks",
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
