import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.PLAYTEST_URL || "http://localhost:5173/";
const outDir = process.env.PLAYTEST_OUT || "/tmp/echo-shift-boss-defeat-qa";
const browserPath =
  process.env.CHROME_PATH ||
  (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

mkdirSync(outDir, { recursive: true });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const isAllowedBrowserMessage = (msg) =>
  (msg.type === "warning" &&
    msg.text.includes("The AudioContext was not allowed to start") &&
    msg.text.includes("https://developer.chrome.com/blog/autoplay/#web_audio")) ||
  (msg.type === "warning" && msg.text.includes("GL Driver Message") && msg.text.includes("GPU stall due to ReadPixels"));

const startAudioGate = async (page) => {
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").click();
};

const waitForLevelIntro = async (page) => {
  await page.waitForFunction(
    () => {
      const phase = document.documentElement.dataset.echoShiftLevelIntro;
      return !document.querySelector("[data-level-intro='active']") && (!phase || phase === "exiting" || phase === "idle");
    },
    null,
    { timeout: 12000 }
  );
};

const readDepartureEffect = async (page) =>
  page.evaluate(() => {
    const raw = document.documentElement.dataset.echoShiftBossEffectFrames || "";
    const match = raw.match(/render-boss:defeat-depart:(\d+)\/(\d+):pause=(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
    return match
      ? {
          raw,
          frame: Number(match[1]),
          total: Number(match[2]),
          pause: Number(match[3]),
          pauseTotal: Number(match[4]),
          bursts: Number(match[5]),
          x: Number(match[6])
        }
      : { raw, frame: 0, total: 0, pause: 0, pauseTotal: 0, bursts: 0, x: 0 };
  });

const readBossDefeatLoopVolumes = async (page) =>
  page.evaluate(() => {
    const raw = document.documentElement.dataset.echoShiftAudioEffects || "";
    const volumes = [];
    const pattern = /loop-volume:boss-defeat:render-boss:([0-9.]+)/g;
    let match = pattern.exec(raw);
    while (match) {
      volumes.push(Number(match[1]));
      match = pattern.exec(raw);
    }
    return { raw, volumes };
  });

const audioEffectCount = (raw, eventName) => raw.split("|").filter((entry) => entry === eventName).length;
const audioEffectPrefixCount = (raw, prefix) => raw.split("|").filter((entry) => entry.startsWith(prefix)).length;

const startCompletionOrderProbe = async (page) =>
  page.evaluate(() => {
    window.__echoShiftCompletionOrder = [];
    window.__echoShiftCompletionOrderObserver?.disconnect?.();
    const record = (event) => window.__echoShiftCompletionOrder.push(event);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-echo-shift-music-key") {
          record(`music:${document.documentElement.dataset.echoShiftMusicKey || ""}`);
        }
        if (mutation.type === "attributes" && mutation.attributeName === "data-echo-shift-music-playback") {
          record(`music-playing:${document.documentElement.dataset.echoShiftMusicPlayback || ""}`);
        }
        if (mutation.type === "childList") {
          const title = document.querySelector(".complete-panel h1")?.textContent || "";
          if (title.includes("Timeline Complete")) record(`complete:${title}`);
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-echo-shift-music-key", "data-echo-shift-music-playback"]
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__echoShiftCompletionOrderObserver = observer;
  });

const readCompletionOrderProbe = async (page) =>
  page.evaluate(() => {
    window.__echoShiftCompletionOrderObserver?.disconnect?.();
    return window.__echoShiftCompletionOrder || [];
  });

const startPauseOnLevelMusicHandoffProbe = async (page) =>
  page.evaluate(() => {
    window.__echoShiftPauseOnLevelMusicHandoff = { fired: false };
    window.__echoShiftPauseOnLevelMusicHandoffObserver?.disconnect?.();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "attributes" || mutation.attributeName !== "data-echo-shift-music-key") continue;
        const state = window.__echoShiftPauseOnLevelMusicHandoff;
        if (state.fired || document.documentElement.dataset.echoShiftMusicKey !== "level-4") continue;
        state.fired = true;
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-echo-shift-music-key"]
    });
    window.__echoShiftPauseOnLevelMusicHandoffObserver = observer;
  });

const stopPauseOnLevelMusicHandoffProbe = async (page) =>
  page.evaluate(() => {
    const fired = Boolean(window.__echoShiftPauseOnLevelMusicHandoff?.fired);
    window.__echoShiftPauseOnLevelMusicHandoffObserver?.disconnect?.();
    return fired;
  });

const startRewindOnLevelMusicHandoffProbe = async (page) =>
  page.evaluate(() => {
    window.__echoShiftRewindOnLevelMusicHandoff = { fired: false };
    window.__echoShiftRewindOnLevelMusicHandoffObserver?.disconnect?.();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "attributes" || mutation.attributeName !== "data-echo-shift-music-key") continue;
        const state = window.__echoShiftRewindOnLevelMusicHandoff;
        if (state.fired || document.documentElement.dataset.echoShiftMusicKey !== "level-4") continue;
        state.fired = true;
        document.querySelector("[data-rewind]")?.click();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-echo-shift-music-key"]
    });
    window.__echoShiftRewindOnLevelMusicHandoffObserver = observer;
  });

const stopRewindOnLevelMusicHandoffProbe = async (page) =>
  page.evaluate(() => {
    const fired = Boolean(window.__echoShiftRewindOnLevelMusicHandoff?.fired);
    window.__echoShiftRewindOnLevelMusicHandoffObserver?.disconnect?.();
    return fired;
  });

const startRetryOnLevelMusicHandoffProbe = async (page) =>
  page.evaluate(() => {
    window.__echoShiftRetryOnLevelMusicHandoff = { fired: false };
    window.__echoShiftRetryOnLevelMusicHandoffObserver?.disconnect?.();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "attributes" || mutation.attributeName !== "data-echo-shift-music-key") continue;
        const state = window.__echoShiftRetryOnLevelMusicHandoff;
        if (state.fired || document.documentElement.dataset.echoShiftMusicKey !== "level-4") continue;
        state.fired = true;
        document.querySelector("[data-retry]")?.click();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true, cancelable: true }));
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-echo-shift-music-key"]
    });
    window.__echoShiftRetryOnLevelMusicHandoffObserver = observer;
  });

const stopRetryOnLevelMusicHandoffProbe = async (page) =>
  page.evaluate(() => {
    const fired = Boolean(window.__echoShiftRetryOnLevelMusicHandoff?.fired);
    window.__echoShiftRetryOnLevelMusicHandoffObserver?.disconnect?.();
    return fired;
  });

const readCameraWorldView = async (page) =>
  page.evaluate(() => {
    const raw = document.documentElement.dataset.echoShiftCameraWorldView || "";
    const [x = "0", y = "0", w = "1", h = "1"] = raw.split(",");
    return { raw, x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
  });

const readCameraSample = async (page) =>
  page.evaluate(() => {
    const raw = document.documentElement.dataset.echoShiftCameraSample || "";
    const [zoom = "0", position = "0,0"] = raw.split(":");
    const [x = "0", y = "0"] = position.split(",");
    return { raw, zoom: Number(zoom), x: Number(x), y: Number(y) };
  });

const readPlayerRect = async (page) =>
  page.evaluate(() => {
    const [x = "0", y = "0", w = "24", h = "34"] = (document.documentElement.dataset.echoShiftPlayerRect || "").split(",");
    return { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
  });

const movePlayerTowardX = async (page, targetX, timeoutMs = 1300) => {
  const startedAt = Date.now();
  let heldKey = null;
  try {
    while (Date.now() - startedAt < timeoutMs) {
      const player = await readPlayerRect(page);
      const delta = targetX - player.x;
      if (Math.abs(delta) <= 8) return player;
      const nextKey = delta > 0 ? "ArrowRight" : "ArrowLeft";
      if (heldKey !== nextKey) {
        if (heldKey) await page.keyboard.up(heldKey);
        await page.keyboard.down(nextKey);
        heldKey = nextKey;
      }
      await page.waitForTimeout(Math.min(90, Math.max(28, Math.abs(delta) * 4)));
    }
  } finally {
    if (heldKey) await page.keyboard.up(heldKey);
  }
  return readPlayerRect(page);
};

const dodgeArchiveWarnings = async (page, bounds) => {
  const targetX = await page.evaluate((levelBounds) => {
    const player = (() => {
      const [x = "0", , w = "24", h = "34"] = (document.documentElement.dataset.echoShiftPlayerRect || "").split(",");
      return { x: Number(x), w: Number(w), h: Number(h) };
    })();
    const warnings = (document.documentElement.dataset.echoShiftBossEffectFrames || "")
      .split("|")
      .filter((entry) => entry.startsWith("archive-book-warning:"))
      .flatMap((entry) => {
        const parts = entry.split(":");
        const [x = "0"] = (parts[3] || "0,0").split(",");
        const [w = "0"] = (parts[4] || "0x0").split("x");
        return [{ x: Number(x), w: Number(w) }];
      })
      .sort((a, b) => a.x - b.x);
    const candidates = [levelBounds.x + 32, levelBounds.x + levelBounds.w - player.w - 32];
    for (let index = 0; index < warnings.length - 1; index += 1) {
      const left = warnings[index].x + warnings[index].w;
      const right = warnings[index + 1].x;
      if (right - left >= player.w + 10) candidates.push((left + right - player.w) / 2);
    }
    return candidates
      .filter((x) => !warnings.some((warning) => x < warning.x + warning.w && x + player.w > warning.x))
      .sort((a, b) => Math.abs(a - player.x) - Math.abs(b - player.x))[0] ?? levelBounds.x + 32;
  }, bounds);
  return movePlayerTowardX(page, targetX);
};

const readBossSpriteWidth = async (page) =>
  page.evaluate(() => {
    const entry = (document.documentElement.dataset.echoShiftBossSpriteFrames || "")
      .split("|")
      .find((item) => item.startsWith("render-boss:") && item.includes(":departing:"));
    const size = entry?.split(":").at(-1) || "0x0";
    return Number(size.split("x")[0]);
  });

const readBossAlignment = async (page, bossId) =>
  page.evaluate((id) => {
    const [playerX = "0", , playerW = "0"] = (document.documentElement.dataset.echoShiftPlayerRect || "").split(",");
    const weakSpot = (document.documentElement.dataset.echoShiftBossWeakSpotRects || "")
      .split("|")
      .find((entry) => entry.startsWith(`${id}:`));
    const [, rect = "0,0,0,0", , guardState = "guarded"] = weakSpot?.split(":") || [];
    const [weakX = "0", , weakW = "0"] = rect.split(",");
    return {
      playerCenterX: Number(playerX) + Number(playerW) / 2,
      weakCenterX: Number(weakX) + Number(weakW) / 2,
      vulnerable: guardState === "vulnerable"
    };
  }, bossId);

const alignPlayerWithBossWeakSpot = async (page, bossId, timeoutMs = 2600, options = {}) => {
  const startedAt = Date.now();
  let heldKey = null;
  try {
    while (Date.now() - startedAt < timeoutMs) {
      const alignment = await readBossAlignment(page, bossId);
      if (options.stopOnVulnerable && alignment.vulnerable) return alignment;
      const delta = alignment.weakCenterX - alignment.playerCenterX;
      if (Math.abs(delta) <= 12) return alignment;
      const nextKey = delta > 0 ? "ArrowRight" : "ArrowLeft";
      if (heldKey !== nextKey) {
        if (heldKey) await page.keyboard.up(heldKey);
        await page.keyboard.down(nextKey);
        heldKey = nextKey;
      }
      await page.waitForTimeout(Math.min(90, Math.max(24, Math.abs(delta) * 5)));
    }
  } finally {
    if (heldKey) await page.keyboard.up(heldKey);
  }
  const alignment = await readBossAlignment(page, bossId);
  throw new Error(`Expected player to align with boss weak spot, got ${JSON.stringify(alignment)}`);
};

const waitForArchiveBooksToClear = async (page, bossId, timeoutMs = 10000) =>
  page.waitForFunction(
    (id) => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return (
        sprites.includes(`${id}:`) &&
        sprites.includes(":active:guarded") &&
        !sprites.includes(":attack:") &&
        !effects.includes("archive-book-falling:") &&
        !effects.includes("archive-book-impact:")
      );
    },
    bossId,
    { timeout: timeoutMs }
  );

const waitForBossVulnerableWithArchiveDodge = async (page, bossId, bounds, timeoutMs = 22000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const alignment = await readBossAlignment(page, bossId);
    if (alignment.vulnerable) return alignment;
    const effects = await page.evaluate(() => document.documentElement.dataset.echoShiftBossEffectFrames || "");
    if (
      effects.includes("archive-book-warning:") ||
      effects.includes("archive-book-falling:") ||
      effects.includes("archive-book-impact:")
    ) {
      await dodgeArchiveWarnings(page, bounds);
    } else {
      await alignPlayerWithBossWeakSpot(page, bossId, 700, { stopOnVulnerable: true }).catch(() => undefined);
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`Expected boss ${bossId} to expose a vulnerable window`);
};

const startWeakSpotJump = async (page, bossId) => {
  const alignment = await readBossAlignment(page, bossId);
  const delta = alignment.weakCenterX - alignment.playerCenterX;
  const correctionKey = Math.abs(delta) > 4 ? (delta > 0 ? "ArrowRight" : "ArrowLeft") : null;
  if (correctionKey) await page.keyboard.down(correctionKey);
  await page.keyboard.down("Space");
  return correctionKey;
};

const releaseWeakSpotJump = async (page, correctionKey) => {
  await page.keyboard.up("Space");
  if (correctionKey) await page.keyboard.up(correctionKey);
};

const draftLevel = {
  id: "boss-defeat-render-qa",
  index: 0,
  name: "Boss Defeat Render QA",
  subtitle: "Render checks",
  motionModel: "anchored",
  start: { x: 220, y: 226 },
  exit: { x: 760, y: 242, w: 32, h: 38 },
  bounds: { x: 0, y: 0, w: 860, h: 340 },
  solids: [
    { id: "floor", x: 0, y: 280, w: 860, h: 60, sprite: "floor", tone: "steel" },
    { id: "left-wall", x: -20, y: 0, w: 20, h: 340, sprite: "wall", tone: "glass" },
    { id: "right-wall", x: 860, y: 0, w: 20, h: 340, sprite: "wall", tone: "glass" }
  ],
  doors: [],
  plates: [],
  timedSwitches: [],
  lasers: [],
  movingLasers: [],
  drones: [],
  cores: [],
  hazards: [],
  crates: [],
  platforms: [],
  oneWays: [],
  conveyors: [],
  launchPads: [],
  echoSensors: [],
  bosses: [
    {
      id: "render-boss",
      kind: "archive-custodian",
      x: 80,
      y: 90,
      w: 360,
      h: 160,
      entrySide: "center",
      introSeconds: 1,
      health: 1,
      score: 1000
    }
  ],
  score: {
    lives: 3,
    coreScore: 100,
    deathPenalty: 500,
    timeBonusTargetSeconds: 10,
    timeBonusPerSecond: 100
  },
  hint: "QA"
};

const bossDefeatCompletionDraftLevel = {
  ...draftLevel,
  id: "boss-defeat-completion-music-qa",
  name: "Boss Defeat Completion Music QA",
  completion: "boss-defeat",
  soundtrackKey: "level-4",
  bosses: [
    {
      ...draftLevel.bosses[0],
      id: "completion-boss",
      soundtrackKey: "final-boss"
    }
  ]
};

const archiveAttackDraftLevel = {
  id: "archive-attack-render-qa",
  index: 0,
  name: "Archive Attack Render QA",
  subtitle: "Render checks",
  motionModel: "anchored",
  start: { x: 220, y: 226 },
  exit: { x: 760, y: 242, w: 32, h: 38 },
  bounds: { x: 0, y: 0, w: 860, h: 340 },
  solids: [
    { id: "floor", x: 0, y: 280, w: 860, h: 60, sprite: "floor", tone: "wood-archive" },
    { id: "left-wall", x: -20, y: 0, w: 20, h: 340, sprite: "wall", tone: "wood-archive" },
    { id: "right-wall", x: 860, y: 0, w: 20, h: 340, sprite: "wall", tone: "wood-archive" }
  ],
  doors: [],
  plates: [],
  timedSwitches: [],
  lasers: [],
  movingLasers: [],
  drones: [],
  cores: [],
  hazards: [],
  crates: [],
  platforms: [],
  oneWays: [],
  conveyors: [],
  launchPads: [],
  echoSensors: [],
  bosses: [
    {
      id: "archive-attack-boss",
      kind: "archive-custodian",
      x: 80,
      y: 90,
      w: 360,
      h: 160,
      entrySide: "center",
      introSeconds: 1,
      health: 2,
      score: 1000
    }
  ],
  score: {
    lives: 3,
    coreScore: 100,
    deathPenalty: 500,
    timeBonusTargetSeconds: 10,
    timeBonusPerSecond: 100
  },
  hint: "QA"
};

const overlappingBossAudioDraftLevel = {
  ...draftLevel,
  id: "overlapping-boss-audio-qa",
  name: "Overlapping Boss Audio QA",
  bosses: [
    {
      ...draftLevel.bosses[0],
      id: "scene-boss-a",
      health: 1,
      score: 1000
    },
    {
      ...draftLevel.bosses[0],
      id: "scene-boss-b",
      health: 1,
      score: 1000
    }
  ]
};

const cameraFollowDraftLevel = {
  id: "boss-camera-follow-qa",
  index: 0,
  name: "Boss Camera Follow QA",
  subtitle: "Camera remains on player during boss intro",
  motionModel: "anchored",
  start: { x: 1420, y: 450 },
  exit: { x: 2860, y: 438, w: 48, h: 62 },
  bounds: { x: 0, y: 0, w: 3000, h: 540 },
  solids: [
    { id: "floor", x: 0, y: 500, w: 3000, h: 60, sprite: "floor", tone: "steel" },
    { id: "left-wall", x: -26, y: 0, w: 26, h: 560, sprite: "wall", tone: "glass" },
    { id: "right-wall", x: 3000, y: 0, w: 26, h: 560, sprite: "wall", tone: "glass" }
  ],
  doors: [],
  plates: [],
  timedSwitches: [],
  lasers: [],
  movingLasers: [],
  drones: [],
  cores: [],
  hazards: [],
  crates: [],
  platforms: [],
  oneWays: [],
  conveyors: [],
  launchPads: [],
  echoSensors: [],
  bosses: [
    {
      id: "camera-follow-boss",
      kind: "archive-custodian",
      x: 1400,
      y: 120,
      w: 1200,
      h: 380,
      entrySide: "center",
      introSeconds: 1,
      health: 1,
      score: 1000
    }
  ],
  score: {
    lives: 3,
    coreScore: 100,
    deathPenalty: 500,
    timeBonusTargetSeconds: 10,
    timeBonusPerSecond: 100
  },
  hint: "QA"
};

const cryoFloorIceDraftLevel = {
  id: "cryo-floor-ice-render-qa",
  index: 0,
  name: "Cryo Floor Ice Render QA",
  subtitle: "Render checks",
  motionModel: "anchored",
  start: { x: 220, y: 226 },
  exit: { x: 760, y: 222, w: 32, h: 38 },
  bounds: { x: 0, y: 0, w: 860, h: 320 },
  solids: [
    { id: "floor", x: 0, y: 260, w: 860, h: 60, sprite: "floor", material: "ice-cryo", tone: "steel" },
    { id: "left-wall", x: -20, y: 0, w: 20, h: 320, sprite: "wall", tone: "glass" },
    { id: "right-wall", x: 860, y: 0, w: 20, h: 320, sprite: "wall", tone: "glass" }
  ],
  doors: [],
  plates: [],
  timedSwitches: [],
  lasers: [],
  movingLasers: [],
  drones: [],
  cores: [],
  hazards: [],
  crates: [],
  platforms: [],
  oneWays: [],
  conveyors: [],
  launchPads: [],
  echoSensors: [],
  bosses: [
    {
      id: "cryo-floor-ice-boss",
      kind: "cryo-conservator",
      x: 80,
      y: 70,
      w: 360,
      h: 190,
      entrySide: "top",
      weakSpot: "bottom",
      introSeconds: 1,
      health: 2,
      score: 1000
    }
  ],
  score: {
    lives: 3,
    coreScore: 100,
    deathPenalty: 500,
    timeBonusTargetSeconds: 10,
    timeBonusPerSecond: 100
  },
  hint: "QA"
};

const stormFloorBeamDraftLevel = {
  ...cryoFloorIceDraftLevel,
  id: "storm-floor-beam-render-qa",
  name: "Storm Floor Beam Render QA",
  soundtrackKey: "level-2",
  solids: [
    { id: "floor", x: 0, y: 260, w: 860, h: 60, sprite: "floor", material: "warning-industrial", tone: "steel" },
    { id: "left-wall", x: -20, y: 0, w: 20, h: 320, sprite: "wall", tone: "glass" },
    { id: "right-wall", x: 860, y: 0, w: 20, h: 320, sprite: "wall", tone: "glass" }
  ],
  bosses: [
    {
      id: "storm-floor-beam-boss",
      kind: "storm-relay-warden",
      x: 80,
      y: 70,
      w: 360,
      h: 190,
      entrySide: "top",
      weakSpot: "bottom",
      introSeconds: 1,
      health: 2,
      score: 1000
    }
  ]
};

const launchOptions = {
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
};

if (browserPath) launchOptions.executablePath = browserPath;

const browser = await chromium.launch(launchOptions);

const verifyBossCameraFollowsPlayer = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [cameraFollowDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(
    () => {
      const frames = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return frames.includes("camera-follow-boss:") && frames.includes(":active:");
    },
    null,
    { timeout: 12000 }
  );

  const sample = await readCameraSample(page);
  const view = await readCameraWorldView(page);
  const centerX = view.x + view.w / 2;
  const arenaCenterX = cameraFollowDraftLevel.bosses[0].x + cameraFollowDraftLevel.bosses[0].w / 2;
  assert(sample.zoom > 1.45, `Expected boss entry to keep normal player camera zoom, got ${JSON.stringify({ sample, view })}`);
  assert(
    centerX < arenaCenterX - 180,
    `Expected boss entry camera to remain nearer the player than the arena center, got ${JSON.stringify({ sample, view, centerX, arenaCenterX })}`
  );
  return { sample, view, centerX, arenaCenterX };
};

const verifyCryoFloorIceRender = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [cryoFloorIceDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.waitForFunction(
    () => {
      const frames = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const audio = document.documentElement.dataset.echoShiftAudioEffects || "";
      return frames.includes("cryo-floor-ice:") && audio.includes("play:cryoBeamFire") && audio.includes("play:cryoFloorIceForm");
    },
    null,
    { timeout: 9000 }
  );
  await page.waitForTimeout(1000);

  const raw = await page.evaluate(() => document.documentElement.dataset.echoShiftBossEffectFrames || "");
  const audioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  assert(
    audioEffectCount(audioDiagnostic, "play:cryoBeamFire") === 1,
    `Expected one cryo beam sample play in the opening active window, got ${audioDiagnostic}`
  );
  assert(
    audioEffectCount(audioDiagnostic, "play:cryoFloorIceForm") === 1,
    `Expected one cryo floor ice sample play in the opening active window, got ${audioDiagnostic}`
  );
  const match = raw.match(/cryo-floor-ice:([^|]+)/);
  const screenshot = `${outDir}/cryo-floor-ice-visible.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  return { diagnostic: match?.[0] || raw, audioDiagnostic, screenshot };
};

const verifyStormFloorBeamAudio = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [stormFloorBeamDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.waitForFunction(
    () => {
      const frames = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return frames.includes("storm-floor-beam-boss:") && frames.includes(":active:");
    },
    null,
    { timeout: 12000 }
  );
  await page.waitForFunction(
    () => {
      const audio = document.documentElement.dataset.echoShiftAudioEffects || "";
      return audio.includes("play:stormFloorBeam");
    },
    null,
    { timeout: 9000 }
  );
  await page.waitForTimeout(1000);
  const audioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  assert(
    audioEffectCount(audioDiagnostic, "play:stormFloorBeam") === 1,
    `Expected one storm beam sample play in the opening active window, got ${audioDiagnostic}`
  );

  return {
    effects: await page.evaluate(() => document.documentElement.dataset.echoShiftBossEffectFrames || ""),
    audioDiagnostic
  };
};

const verifyBossDefeatCompletionMusic = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [bossDefeatCompletionDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftMusicKey === "final-boss", null, { timeout: 9000 });
  await dodgeArchiveWarnings(page, bossDefeatCompletionDraftLevel.bounds);
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return (
        sprites.includes("completion-boss:") &&
        sprites.includes(":active:guarded") &&
        !sprites.includes(":attack:") &&
        !effects.includes("archive-book-falling:") &&
        !effects.includes("archive-book-impact:")
      );
    },
    null,
    { timeout: 10000 }
  );
  await waitForBossVulnerableWithArchiveDodge(page, "completion-boss", bossDefeatCompletionDraftLevel.bounds);
  await startCompletionOrderProbe(page);
  await startPauseOnLevelMusicHandoffProbe(page);
  const correction = await startWeakSpotJump(page, "completion-boss");
  try {
    await page.waitForFunction(
      () => {
        const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
        const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
        return effects.includes("completion-boss:defeat-depart") && sprites.includes(":departing:");
      },
      null,
      { timeout: 3000 }
    );
  } finally {
    await releaseWeakSpotJump(page, correction);
  }
  await page.waitForFunction(() => window.__echoShiftPauseOnLevelMusicHandoff?.fired === true, null, { timeout: 9000 });
  await page.waitForFunction(
    () => document.querySelector("[data-modal].show h1")?.textContent?.includes("Paused"),
    null,
    { timeout: 3000 }
  );
  await page.waitForTimeout(1000);
  const pausedState = await page.evaluate(() => ({
    modalTitle: document.querySelector("[data-modal].show h1")?.textContent || "",
    musicPlayback: document.documentElement.dataset.echoShiftMusicPlayback || ""
  }));
  assert(pausedState.modalTitle.includes("Paused"), `Expected pause modal during final music handoff, got ${JSON.stringify(pausedState)}`);
  assert(!pausedState.modalTitle.includes("Timeline Complete"), `Expected no victory while paused, got ${JSON.stringify(pausedState)}`);
  assert(
    pausedState.musicPlayback !== "level-4:playing",
    `Expected paused level music handoff not to report active playback, got ${JSON.stringify(pausedState)}`
  );
  await page.locator("[data-replay-level]").click();
  await page.waitForTimeout(400);
  const restartClickState = await page.evaluate(() => ({
    modalTitle: document.querySelector("[data-modal].show h1")?.textContent || "",
    musicKey: document.documentElement.dataset.echoShiftMusicKey || "",
    musicPlayback: document.documentElement.dataset.echoShiftMusicPlayback || ""
  }));
  assert(
    restartClickState.modalTitle.includes("Paused"),
    `Expected pause-menu restart to be locked during final handoff, got ${JSON.stringify(restartClickState)}`
  );
  assert(
    restartClickState.musicKey === "level-4",
    `Expected pause-menu restart not to reset the final handoff music key, got ${JSON.stringify(restartClickState)}`
  );
  await page.locator("[data-levels]").click();
  await page.waitForTimeout(400);
  const levelSelectClickState = await page.evaluate(() => ({
    modalTitle: document.querySelector("[data-modal].show h1")?.textContent || "",
    musicKey: document.documentElement.dataset.echoShiftMusicKey || ""
  }));
  assert(
    levelSelectClickState.modalTitle.includes("Paused"),
    `Expected pause-menu level select to be locked during final handoff, got ${JSON.stringify(levelSelectClickState)}`
  );
  assert(
    levelSelectClickState.musicKey === "level-4",
    `Expected pause-menu level select not to leave the final handoff, got ${JSON.stringify(levelSelectClickState)}`
  );
  await page.locator("[data-exit-menu]").click();
  await page.waitForTimeout(400);
  const titleClickState = await page.evaluate(() => ({
    modalTitle: document.querySelector("[data-modal].show h1")?.textContent || "",
    musicKey: document.documentElement.dataset.echoShiftMusicKey || ""
  }));
  assert(
    titleClickState.modalTitle.includes("Paused"),
    `Expected pause-menu title exit to be locked during final handoff, got ${JSON.stringify(titleClickState)}`
  );
  assert(
    titleClickState.musicKey === "level-4",
    `Expected pause-menu title exit not to leave the final handoff, got ${JSON.stringify(titleClickState)}`
  );
  await page.locator("[data-editor]").click();
  await page.waitForTimeout(400);
  const editorClickState = await page.evaluate(() => ({
    modalTitle: document.querySelector("[data-modal].show h1")?.textContent || "",
    musicKey: document.documentElement.dataset.echoShiftMusicKey || "",
    search: window.location.search
  }));
  assert(
    editorClickState.modalTitle.includes("Paused"),
    `Expected pause-menu editor exit to be locked during final handoff, got ${JSON.stringify(editorClickState)}`
  );
  assert(
    editorClickState.musicKey === "level-4" && editorClickState.search.includes("playtestDraft=1"),
    `Expected pause-menu editor exit not to leave the final handoff, got ${JSON.stringify(editorClickState)}`
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector("[data-modal].show h1")?.textContent?.includes("Paused"),
    null,
    { timeout: 3000 }
  );
  await page.waitForFunction(
    () => {
      const title = document.querySelector(".complete-panel h1")?.textContent || "";
      return title.includes("Timeline Complete");
    },
    null,
    { timeout: 7000 }
  );
  const completionOrder = await readCompletionOrderProbe(page);
  const pausedHandoffFired = await stopPauseOnLevelMusicHandoffProbe(page);
  const levelMusicIndex = completionOrder.findIndex((event) => event === "music-playing:level-4:playing");
  const completeIndex = completionOrder.findIndex((event) => event.startsWith("complete:"));
  assert(pausedHandoffFired, `Expected pause-on-handoff probe to fire, got order ${completionOrder.join(" -> ")}`);
  assert(
    levelMusicIndex >= 0 && completeIndex >= 0 && levelMusicIndex < completeIndex,
    `Expected level music playback to start before victory, got order ${completionOrder.join(" -> ")}`
  );

  return {
    musicKey: await page.evaluate(() => document.documentElement.dataset.echoShiftMusicKey || ""),
    completeTitle: await page.locator(".complete-panel h1").textContent(),
    completionOrder,
    pausedState,
    restartClickState,
    levelSelectClickState,
    titleClickState,
    editorClickState
  };
};

const verifyBossDefeatCompletionRewindLock = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [bossDefeatCompletionDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftMusicKey === "final-boss", null, { timeout: 9000 });
  await dodgeArchiveWarnings(page, bossDefeatCompletionDraftLevel.bounds);
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return (
        sprites.includes("completion-boss:") &&
        sprites.includes(":active:guarded") &&
        !sprites.includes(":attack:") &&
        !effects.includes("archive-book-falling:") &&
        !effects.includes("archive-book-impact:")
      );
    },
    null,
    { timeout: 10000 }
  );
  await waitForBossVulnerableWithArchiveDodge(page, "completion-boss", bossDefeatCompletionDraftLevel.bounds);
  await startCompletionOrderProbe(page);
  await startRewindOnLevelMusicHandoffProbe(page);
  const correction = await startWeakSpotJump(page, "completion-boss");
  try {
    await page.waitForFunction(
      () => {
        const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
        const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
        return effects.includes("completion-boss:defeat-depart") && sprites.includes(":departing:");
      },
      null,
      { timeout: 3000 }
    );
  } finally {
    await releaseWeakSpotJump(page, correction);
  }
  await page.waitForFunction(() => window.__echoShiftRewindOnLevelMusicHandoff?.fired === true, null, { timeout: 9000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.echoShiftMusicPlayback === "level-4:playing",
    null,
    { timeout: 9000 }
  );
  await page.waitForFunction(
    () => {
      const title = document.querySelector(".complete-panel h1")?.textContent || "";
      return title.includes("Timeline Complete");
    },
    null,
    { timeout: 7000 }
  );
  const rewindHandoffFired = await stopRewindOnLevelMusicHandoffProbe(page);
  const completionOrder = await readCompletionOrderProbe(page);
  const levelMusicIndex = completionOrder.findIndex((event) => event === "music-playing:level-4:playing");
  const completeIndex = completionOrder.findIndex((event) => event.startsWith("complete:"));
  const state = await page.evaluate(() => ({
    completeTitle: document.querySelector(".complete-panel h1")?.textContent || "",
    musicKey: document.documentElement.dataset.echoShiftMusicKey || "",
    musicPlayback: document.documentElement.dataset.echoShiftMusicPlayback || "",
    audioDiagnostic: document.documentElement.dataset.echoShiftAudioEffects || ""
  }));
  assert(rewindHandoffFired, `Expected rewind-on-handoff probe to fire, got ${JSON.stringify(state)}`);
  assert(
    state.completeTitle.includes("Timeline Complete"),
    `Expected rewind during final handoff to be locked and preserve final victory, got ${JSON.stringify(state)}`
  );
  assert(
    levelMusicIndex >= 0 && completeIndex >= 0 && levelMusicIndex < completeIndex,
    `Expected rewind-handoff route to start level music playback before victory, got order ${completionOrder.join(" -> ")}`
  );
  assert(
    !state.audioDiagnostic.includes("play:rewind"),
    `Expected final-handoff rewind click to be ignored without playing rewind SFX, got ${JSON.stringify(state)}`
  );
  return { ...state, completionOrder };
};

const verifyBossDefeatCompletionRetryLock = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [bossDefeatCompletionDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftMusicKey === "final-boss", null, { timeout: 9000 });
  await dodgeArchiveWarnings(page, bossDefeatCompletionDraftLevel.bounds);
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return (
        sprites.includes("completion-boss:") &&
        sprites.includes(":active:guarded") &&
        !sprites.includes(":attack:") &&
        !effects.includes("archive-book-falling:") &&
        !effects.includes("archive-book-impact:")
      );
    },
    null,
    { timeout: 10000 }
  );
  await waitForBossVulnerableWithArchiveDodge(page, "completion-boss", bossDefeatCompletionDraftLevel.bounds);
  await startCompletionOrderProbe(page);
  await startRetryOnLevelMusicHandoffProbe(page);
  const correction = await startWeakSpotJump(page, "completion-boss");
  try {
    await page.waitForFunction(
      () => {
        const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
        const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
        return effects.includes("completion-boss:defeat-depart") && sprites.includes(":departing:");
      },
      null,
      { timeout: 3000 }
    );
  } finally {
    await releaseWeakSpotJump(page, correction);
  }
  await page.waitForFunction(() => window.__echoShiftRetryOnLevelMusicHandoff?.fired === true, null, { timeout: 9000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.echoShiftMusicPlayback === "level-4:playing",
    null,
    { timeout: 9000 }
  );
  await page.waitForFunction(
    () => {
      const title = document.querySelector(".complete-panel h1")?.textContent || "";
      return title.includes("Timeline Complete");
    },
    null,
    { timeout: 7000 }
  );
  const retryHandoffFired = await stopRetryOnLevelMusicHandoffProbe(page);
  const completionOrder = await readCompletionOrderProbe(page);
  const levelMusicIndex = completionOrder.findIndex((event) => event === "music-playing:level-4:playing");
  const completeIndex = completionOrder.findIndex((event) => event.startsWith("complete:"));
  const state = await page.evaluate(() => ({
    completeTitle: document.querySelector(".complete-panel h1")?.textContent || "",
    musicKey: document.documentElement.dataset.echoShiftMusicKey || "",
    musicPlayback: document.documentElement.dataset.echoShiftMusicPlayback || "",
    audioDiagnostic: document.documentElement.dataset.echoShiftAudioEffects || ""
  }));
  assert(retryHandoffFired, `Expected retry-on-handoff probe to fire, got ${JSON.stringify(state)}`);
  assert(
    state.completeTitle.includes("Timeline Complete"),
    `Expected retry during final handoff to be locked and preserve final victory, got ${JSON.stringify(state)}`
  );
  assert(
    levelMusicIndex >= 0 && completeIndex >= 0 && levelMusicIndex < completeIndex,
    `Expected retry-handoff route to start level music playback before victory, got order ${completionOrder.join(" -> ")}`
  );
  assert(
    audioEffectCount(state.audioDiagnostic, "play:select") === 0,
    `Expected final-handoff retry click to be ignored without playing retry/select SFX, got ${JSON.stringify(state)}`
  );
  return { ...state, completionOrder };
};

const verifyArchiveAttackRender = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [archiveAttackDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
	  await page.waitForFunction(
	    () => {
	      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
	      const windup = effects.match(/archive-attack-boss:archive-windup:(\d+):/);
	      return Boolean(windup && Number(windup[1]) >= 20 && effects.includes("archive-book-warning:"));
	    },
	    null,
	    { timeout: 9000 }
	  );
  await dodgeArchiveWarnings(page, archiveAttackDraftLevel.bounds);
	  await page.waitForFunction(
	    () => {
	      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
	      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
	      return (
	        (effects.includes("archive-book-falling:") || effects.includes("archive-book-impact:")) &&
	        sprites.includes("archive-attack-boss:archive-custodian-clean") &&
	        sprites.includes(":attack:")
	      );
	    },
	    null,
    { timeout: 10000 }
  );
  await page.waitForFunction(
    () => (document.documentElement.dataset.echoShiftAudioEffects || "").includes("request:archiveBookImpact"),
    null,
    { timeout: 4000 }
  );
  await page.waitForFunction(
    () => (document.documentElement.dataset.echoShiftAudioEffects || "").includes("play:archiveBookImpact"),
    null,
    { timeout: 4000 }
  );

  const raw = await page.evaluate(() => document.documentElement.dataset.echoShiftBossEffectFrames || "");
  const audioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  const archiveImpactRequestCount = audioEffectCount(audioDiagnostic, "request:archiveBookImpact");
  const archiveImpactSamplePlayCount = audioEffectCount(audioDiagnostic, "play:archiveBookImpact");
  assert(
    archiveImpactRequestCount === 1,
    `Expected one mixed Archive impact SFX request for the opening multi-book volley, got ${archiveImpactRequestCount} from ${audioDiagnostic}`
  );
  assert(
    archiveImpactSamplePlayCount === 1,
    `Expected one sampled Archive impact SFX play for the opening volley, got ${archiveImpactSamplePlayCount} from ${audioDiagnostic}`
  );
  const screenshot = `${outDir}/archive-attack-active.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  await waitForArchiveBooksToClear(page, "archive-attack-boss");
  await alignPlayerWithBossWeakSpot(page, "archive-attack-boss");
  await page.waitForFunction(
    () => {
      const frames = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return frames.includes("archive-attack-boss:") && frames.includes(":active:vulnerable");
    },
    null,
    { timeout: 10000 }
  );
  const archiveHitCorrection = await startWeakSpotJump(page, "archive-attack-boss");
  try {
    await page.waitForFunction(
      () => {
        const frames = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
        return frames.includes("archive-attack-boss:") && frames.includes(":active:guarded") && !frames.includes(":vulnerable");
      },
      null,
      { timeout: 2500 }
    );
  } finally {
    await releaseWeakSpotJump(page, archiveHitCorrection);
  }
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      return effects.includes("archive-book-warning:r1:");
    },
    null,
    { timeout: 9000 }
  );
  await dodgeArchiveWarnings(page, archiveAttackDraftLevel.bounds);
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const match = effects.match(/archive-book-warning:r2:[^|]*:p(\d+)/);
      return Boolean(match && Number(match[1]) > 0 && Number(match[1]) < 100);
    },
    null,
    { timeout: 9000 }
  );
  const roundTwoWarning = await page.evaluate(() => {
    const raw = document.documentElement.dataset.echoShiftBossEffectFrames || "";
    return raw
      .split("|")
      .filter((entry) => entry.startsWith("archive-book-warning:r2:"))
      .join("|");
  });
  const roundTwoStartAudioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  const roundTwoStartArchiveImpactRequestCount = audioEffectCount(roundTwoStartAudioDiagnostic, "request:archiveBookImpact");
  const roundTwoStartArchiveImpactSamplePlayCount = audioEffectCount(roundTwoStartAudioDiagnostic, "play:archiveBookImpact");
  const roundTwoScreenshot = `${outDir}/archive-round-two-warning.png`;
  await page.screenshot({ path: roundTwoScreenshot, fullPage: true });
  await dodgeArchiveWarnings(page, archiveAttackDraftLevel.bounds);
  await page.waitForFunction(
    (previousCount) => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const audio = document.documentElement.dataset.echoShiftAudioEffects || "";
      const roundTwoImpact = effects.includes("archive-book-impact:r2:");
      const impactRequests = audio.split("|").filter((entry) => entry === "request:archiveBookImpact").length;
      return roundTwoImpact && impactRequests === previousCount + 1;
    },
    roundTwoStartArchiveImpactRequestCount,
    { timeout: 10000 }
  );
  await page.waitForFunction(
    (previousPlayCount) => {
      const audio = document.documentElement.dataset.echoShiftAudioEffects || "";
      const impactSamplePlays = audio.split("|").filter((entry) => entry === "play:archiveBookImpact").length;
      return impactSamplePlays >= previousPlayCount + 1;
    },
    roundTwoStartArchiveImpactSamplePlayCount,
    { timeout: 4000 }
  );
  const roundTwoAudioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  const roundTwoArchiveImpactRequestCount = audioEffectCount(roundTwoAudioDiagnostic, "request:archiveBookImpact");
  const roundTwoArchiveImpactSamplePlayCount = audioEffectCount(roundTwoAudioDiagnostic, "play:archiveBookImpact");
  assert(
    roundTwoArchiveImpactRequestCount === roundTwoStartArchiveImpactRequestCount + 1,
    `Expected one Archive impact SFX request for round two, got before=${roundTwoStartArchiveImpactRequestCount}, after=${roundTwoArchiveImpactRequestCount}, audio=${roundTwoAudioDiagnostic}`
  );
  assert(
    roundTwoArchiveImpactSamplePlayCount === roundTwoStartArchiveImpactSamplePlayCount + 1,
    `Expected sampled Archive impact SFX to play for round two, got before=${roundTwoStartArchiveImpactSamplePlayCount}, after=${roundTwoArchiveImpactSamplePlayCount}, audio=${roundTwoAudioDiagnostic}`
  );
  return {
    diagnostic: raw,
    audioDiagnostic,
    archiveImpactRequestCount,
    archiveImpactSamplePlayCount,
    screenshot,
    roundTwoWarning,
    roundTwoStartAudioDiagnostic,
    roundTwoStartArchiveImpactRequestCount,
    roundTwoStartArchiveImpactSamplePlayCount,
    roundTwoScreenshot,
    roundTwoAudioDiagnostic,
    roundTwoArchiveImpactRequestCount,
    roundTwoArchiveImpactSamplePlayCount
  };
};

const verifyOverlappingBossSceneAudio = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [overlappingBossAudioDraftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      const windup = effects.match(/scene-boss-a:archive-windup:(\d+):/);
      return Boolean(windup && Number(windup[1]) >= 20 && sprites.includes("scene-boss-a:") && sprites.includes("scene-boss-b:"));
    },
    null,
    { timeout: 9000 }
  );
  await dodgeArchiveWarnings(page, overlappingBossAudioDraftLevel.bounds);
  await waitForArchiveBooksToClear(page, "scene-boss-a");
  await waitForBossVulnerableWithArchiveDodge(page, "scene-boss-a", overlappingBossAudioDraftLevel.bounds);
  await page.waitForFunction(
    () => {
      const weakSpots = document.documentElement.dataset.echoShiftBossWeakSpotRects || "";
      const bossA = weakSpots.split("|").find((entry) => entry.startsWith("scene-boss-a:")) || "";
      const bossB = weakSpots.split("|").find((entry) => entry.startsWith("scene-boss-b:")) || "";
      return bossA.includes(":vulnerable") && bossB.includes(":vulnerable");
    },
    null,
    { timeout: 10000 }
  );

  const correction = await startWeakSpotJump(page, "scene-boss-a");
  let defeatAudioDiagnostic = "";
  try {
    await page.waitForFunction(
      () => {
        const audio = document.documentElement.dataset.echoShiftAudioEffects || "";
        const coreHits = audio.split("|").filter((entry) => entry === "play:bossCoreHit").length;
        return (
          coreHits >= 2 &&
          audio.includes("loop-start:boss-defeat:scene-boss-a:bossDefeatDeparture") &&
          audio.includes("loop-start:boss-defeat:scene-boss-b:bossDefeatDeparture")
        );
      },
      null,
      { timeout: 3000 }
    );
    defeatAudioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  } finally {
    await releaseWeakSpotJump(page, correction);
  }

  await page.waitForFunction(
    () => {
      const audio = document.documentElement.dataset.echoShiftAudioEffects || "";
      return audio.includes("loop-stop:boss-defeat:scene-boss-a") && audio.includes("loop-stop:boss-defeat:scene-boss-b");
    },
    null,
    { timeout: 8000 }
  );
  const stopAudioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  const coreHitPlays = audioEffectCount(defeatAudioDiagnostic, "play:bossCoreHit");
  const bossALoopStarts = audioEffectCount(defeatAudioDiagnostic, "loop-start:boss-defeat:scene-boss-a:bossDefeatDeparture");
  const bossBLoopStarts = audioEffectCount(defeatAudioDiagnostic, "loop-start:boss-defeat:scene-boss-b:bossDefeatDeparture");
  const bossALoopStops = audioEffectCount(stopAudioDiagnostic, "loop-stop:boss-defeat:scene-boss-a");
  const bossBLoopStops = audioEffectCount(stopAudioDiagnostic, "loop-stop:boss-defeat:scene-boss-b");
  assert(coreHitPlays === 2, `Expected overlapping boss defeat to play exactly two core-hit samples, got ${defeatAudioDiagnostic}`);
  assert(
    bossALoopStarts === 1 && bossBLoopStarts === 1,
    `Expected exactly one loop start per overlapping boss, got ${defeatAudioDiagnostic}`
  );
  assert(
    bossALoopStops === 1 && bossBLoopStops === 1,
    `Expected exactly one loop stop per overlapping boss, got ${stopAudioDiagnostic}`
  );
  assert(
    audioEffectPrefixCount(defeatAudioDiagnostic, "loop-start:boss-defeat:scene-boss-") === 2,
    `Expected no extra overlapping boss loop starts, got ${defeatAudioDiagnostic}`
  );
  assert(
    audioEffectPrefixCount(stopAudioDiagnostic, "loop-stop:boss-defeat:scene-boss-") === 2,
    `Expected no extra overlapping boss loop stops, got ${stopAudioDiagnostic}`
  );
  return {
    defeatAudioDiagnostic,
    stopAudioDiagnostic,
    coreHitPlays,
    bossALoopStarts,
    bossBLoopStarts,
    bossALoopStops,
    bossBLoopStops
  };
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const messages = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) messages.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (error) => messages.push({ type: "pageerror", text: error.message }));

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [draftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(() => (document.querySelector("[data-level]")?.textContent || "").includes("Boss Defeat Render QA"));
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      const windup = effects.match(/render-boss:archive-windup:(\d+):/);
	      return Boolean(windup && Number(windup[1]) >= 20 && sprites.includes("render-boss:archive-custodian-clean"));
    },
    null,
    { timeout: 9000 }
  );
  await dodgeArchiveWarnings(page, draftLevel.bounds);

	  await page.waitForFunction(
	    () => {
	      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
	      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
	      return (
	        sprites.includes("render-boss:") &&
	        sprites.includes(":active:guarded") &&
	        !sprites.includes(":attack:") &&
	        !effects.includes("archive-book-falling:") &&
	        !effects.includes("archive-book-impact:")
	      );
	    },
	    null,
	    { timeout: 10000 }
	  );
  await waitForBossVulnerableWithArchiveDodge(page, "render-boss", draftLevel.bounds);

  const defeatCorrection = await startWeakSpotJump(page, "render-boss");
  try {
    await page.waitForFunction(
      () => {
        const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
        const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
        return effects.includes("render-boss:defeat-depart") && sprites.includes(":departing:");
      },
      null,
      { timeout: 3000 }
    );
  } finally {
    await releaseWeakSpotJump(page, defeatCorrection);
  }

  await page.waitForFunction(
    () => (document.documentElement.dataset.echoShiftAudioEffects || "").includes("loop-start:boss-defeat:render-boss:bossDefeatDeparture"),
    null,
    { timeout: 2000 }
  );
  const defeatAudioDiagnostic = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "");
  assert(defeatAudioDiagnostic.includes("play:bossCoreHit"), `Expected boss core hit sample before defeat loop, got ${defeatAudioDiagnostic}`);
  const early = await readDepartureEffect(page);
  assert(early.total === 170, `Expected 170-frame boss departure diagnostic, got ${JSON.stringify(early)}`);
  assert(early.pauseTotal === 90 && early.pause > 0, `Expected 90-frame boss defeat pause diagnostic, got ${JSON.stringify(early)}`);
  assert(early.bursts > 0, `Expected active defeat overlay bursts early in departure, got ${JSON.stringify(early)}`);
  assert(
    (await page.evaluate(() => document.documentElement.dataset.echoShiftExitUnlocked || "")) === "false",
    "Expected exit portal to remain hidden while boss departure starts"
  );

  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const match = effects.match(/render-boss:defeat-depart:(\d+)\/(\d+):pause=(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
      return match && Number(match[3]) <= 66 && Number(match[5]) > 0;
    },
    null,
    { timeout: 2000 }
  );
  const departureScreenshot = `${outDir}/boss-defeat-departure.png`;
  await page.screenshot({ path: departureScreenshot, fullPage: true });

  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const match = effects.match(/render-boss:defeat-depart:(\d+)\/(\d+):pause=(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
      return match && Number(match[1]) >= 80 && Number(match[5]) > 0;
    },
    null,
    { timeout: 4500 }
	  );
	  const mid = await readDepartureEffect(page);
	  const spriteWidth = await readBossSpriteWidth(page);
  assert(mid.x > early.x + 60, `Expected departing boss to move right, got early ${JSON.stringify(early)} and mid ${JSON.stringify(mid)}`);
  const midLoopVolumes = await readBossDefeatLoopVolumes(page);
  const intermediateLoopVolumes = midLoopVolumes.volumes.filter((volume) => volume > 0.05 && volume < 0.95);
  const hasDescendingStep = midLoopVolumes.volumes.some((volume, index, volumes) => index > 0 && volume < volumes[index - 1] - 0.04);
  assert(
    intermediateLoopVolumes.length >= 3 &&
      intermediateLoopVolumes.some((volume) => volume > 0.75) &&
      intermediateLoopVolumes.some((volume) => volume < 0.6) &&
      hasDescendingStep,
    `Expected boss defeat loop volume to fade through multiple intermediate levels, got ${JSON.stringify(midLoopVolumes)}`
  );

  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const match = effects.match(/render-boss:defeat-depart:(\d+)\/(\d+):pause=(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
      return match && Number(match[1]) >= 160;
    },
    null,
    { timeout: 4000 }
  );
  const late = await readDepartureEffect(page);
  const camera = await readCameraWorldView(page);
  const spriteLeft = late.x - spriteWidth / 6;
  assert(
    spriteLeft > camera.x + camera.w,
    `Expected departing boss sprite to be off the right side of the camera before portal unlock, got ${JSON.stringify({ late, camera, spriteWidth, spriteLeft })}`
  );

  await page.waitForFunction(() => document.documentElement.dataset.echoShiftExitUnlocked === "true", null, { timeout: 5000 });
  assert(
    (await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects || "")).includes("loop-stop:boss-defeat:render-boss"),
    "Expected boss defeat loop to stop after departure finishes"
  );
  const finalSprites = await page.evaluate(() => document.documentElement.dataset.echoShiftBossSpriteFrames || "");
  assert(!finalSprites.includes(":departing:"), `Expected boss sprite to stop rendering after departure, got ${finalSprites}`);
  const portalScreenshot = `${outDir}/boss-defeat-portal-unlocked.png`;
  await page.screenshot({ path: portalScreenshot, fullPage: true });

  const cameraFollow = await verifyBossCameraFollowsPlayer(page);
  const archiveAttack = await verifyArchiveAttackRender(page);
  const overlappingBossAudio = await verifyOverlappingBossSceneAudio(page);
  const stormFloorBeam = await verifyStormFloorBeamAudio(page);
  const cryoFloorIce = await verifyCryoFloorIceRender(page);
  const bossDefeatCompletionMusic = await verifyBossDefeatCompletionMusic(page);
  const bossDefeatCompletionRewindLock = await verifyBossDefeatCompletionRewindLock(page);
  const bossDefeatCompletionRetryLock = await verifyBossDefeatCompletionRetryLock(page);

  const unexpectedMessages = messages.filter((msg) => !isAllowedBrowserMessage(msg));
  assert(unexpectedMessages.length === 0, `Unexpected console/page messages: ${JSON.stringify(unexpectedMessages)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        departure: { early, mid, late, camera, spriteWidth },
        cameraFollow,
        archiveAttack,
        overlappingBossAudio,
        stormFloorBeam,
        cryoFloorIce,
        bossDefeatCompletionMusic,
        bossDefeatCompletionRewindLock,
        bossDefeatCompletionRetryLock,
        screenshots: {
          departure: departureScreenshot,
          portal: portalScreenshot,
          archiveAttack: archiveAttack.screenshot,
          archiveRoundTwoWarning: archiveAttack.roundTwoScreenshot,
          cryoFloorIce: cryoFloorIce.screenshot
        }
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
