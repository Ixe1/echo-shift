import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.PLAYTEST_URL || "http://localhost:5173/";
const outDir = process.env.PLAYTEST_OUT || "/tmp/echo-shift-playtest";
const browserPath =
  process.env.CHROME_PATH ||
  (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

mkdirSync(outDir, { recursive: true });

const artifacts = {
  desktopGate: `${outDir}/start-gate-desktop.png`,
  desktopMenu: `${outDir}/menu-desktop.png`,
  desktopIntro: `${outDir}/level-intro-desktop.png`,
  desktopGame: `${outDir}/game-desktop.png`,
  desktopEcho: `${outDir}/echo-desktop.png`,
  desktopRetryAfterRewind: `${outDir}/retry-after-rewind-desktop.png`,
  desktopPause: `${outDir}/pause-desktop.png`,
  desktopComplete: `${outDir}/complete-desktop.png`,
  desktopNext: `${outDir}/next-desktop.png`,
  desktopCoreRoom: `${outDir}/core-room-desktop.png`,
  desktopHeldOpenComplete: `${outDir}/held-open-complete-desktop.png`,
  desktopLiftPhaseComplete: `${outDir}/lift-phase-complete-desktop.png`,
  draftDisabledDrone: `${outDir}/draft-disabled-drone.png`,
  draftLegacySolidSprites: `${outDir}/draft-legacy-solid-sprites.png`,
  draftMovingLaserOrigin: `${outDir}/draft-moving-laser-origin.png`,
  draftDeathFall: `${outDir}/draft-death-fall.png`,
  draftRetryRequired: `${outDir}/draft-retry-required.png`,
  draftRetryAfterDeath: `${outDir}/draft-retry-after-death.png`,
  draftDeathPauseGuard: `${outDir}/draft-death-pause-guard.png`,
  mobileGate: `${outDir}/start-gate-mobile.png`,
  mobileMenu: `${outDir}/menu-mobile.png`,
  mobileIntro: `${outDir}/level-intro-mobile.png`,
  mobileGame: `${outDir}/game-mobile.png`,
  mobileTouch: `${outDir}/touch-mobile.png`,
  mobileLevels: `${outDir}/levels-mobile.png`,
  tabletGate: `${outDir}/start-gate-tablet.png`,
  tabletIntro: `${outDir}/level-intro-tablet.png`,
  tabletGame: `${outDir}/game-tablet.png`,
  tabletTouch: `${outDir}/touch-tablet.png`,
  tabletJump: `${outDir}/jump-tablet.png`,
  tabletPause: `${outDir}/pause-tablet.png`
};

const launchOptions = {
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
};

if (browserPath) {
  launchOptions.executablePath = browserPath;
}

const relevantMessages = [];

const isIgnoredConsoleWarning = (text) =>
  (text.includes("The AudioContext was not allowed to start") &&
    text.includes("https://developer.chrome.com/blog/autoplay/#web_audio")) ||
  (text.includes("GL Driver Message") && text.includes("GPU stall due to ReadPixels"));

const collectConsole = (page, bucket) => {
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      if (msg.type() === "warning" && isIgnoredConsoleWarning(msg.text())) return;
      bucket.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (error) => bucket.push({ type: "pageerror", text: error.message }));
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const startAudioGate = async (page) => {
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").click();
};

const waitForLevelIntro = async (page) => {
  await page
    .waitForFunction(
      () => document.querySelector("[data-level-intro='active']") || document.documentElement.dataset.echoShiftLevelIntro === "active",
      null,
      { timeout: 750 }
    )
    .catch(() => {});
  await page.waitForFunction(
    () => {
      const phase = document.documentElement.dataset.echoShiftLevelIntro;
      return !document.querySelector("[data-level-intro='active']") && (phase === "exiting" || phase === "idle");
    },
    null,
    { timeout: 12000 }
  );
};

const waitForGameLevel = async (page, expectedLabel) => {
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.waitForFunction(
    (label) => {
      const levelLabels = [...document.querySelectorAll("[data-level]")];
      return levelLabels.length === 1 && (levelLabels[0].textContent || "").includes(label);
    },
    expectedLabel,
    { timeout: 12000 }
  );
  await waitForLevelIntro(page);
};

const draftBaseSolids = (width = 520) => [
  { id: "floor", x: 0, y: 120, w: width, h: 40 },
  { id: "left-wall", x: -20, y: 0, w: 20, h: 180 },
  { id: "right-wall", x: width, y: 0, w: 20, h: 180 }
];

const draftLevel = (overrides) => ({
  id: "qa-draft",
  index: 0,
  name: "QA Draft",
  subtitle: "Render checks",
  motionModel: "anchored",
  start: { x: 24, y: 86 },
  exit: { x: 470, y: 82, w: 28, h: 38 },
  bounds: { x: 0, y: 0, w: 520, h: 180 },
  solids: draftBaseSolids(),
  score: {
    lives: 3,
    coreScore: 100,
    deathPenalty: 500,
    timeBonusTargetSeconds: 10,
    timeBonusPerSecond: 100
  },
  hint: "QA",
  ...overrides
});

const draftSnapshot = (level) => ({
  motionModel: "anchored",
  currentIndex: 0,
  levels: [level]
});

const inputKeys = {
  idle: [],
  right: ["KeyD"],
  left: ["KeyA"],
  jump: ["Space"],
  jumpRight: ["KeyD", "Space"],
  jumpLeft: ["KeyA", "Space"]
};

const runKeyboardRoute = async (page, route) => {
  const active = new Set();
  for (const [action, frames] of route) {
    const next = new Set(inputKeys[action]);
    for (const key of active) {
      if (!next.has(key)) {
        await page.keyboard.up(key);
        active.delete(key);
      }
    }
    for (const key of next) {
      if (!active.has(key)) {
        await page.keyboard.down(key);
        active.add(key);
      }
    }
    await page.waitForTimeout(Math.max(20, Math.round((frames * 1000) / 60)));
  }
  for (const key of active) {
    await page.keyboard.up(key);
  }
};

const pressRewind = async (page, settleMs = 350) => {
  await page.keyboard.down("KeyR");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyR");
  await page.waitForTimeout(settleMs);
};

const loadDraftPlaytest = async (page, level, options = {}) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, draftSnapshot(level));
  await page.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  if (options.clickCanvas !== false) {
    await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  }
  await page.waitForTimeout(450);
};

const runKeyboardRouteAtHudFrames = async (page, route, options = {}) =>
  page.evaluate(async ({ routeToRun, trimInitialIdleByHudFrame }) => {
    const actionKeys = {
      idle: [],
      right: ["KeyD"],
      left: ["KeyA"],
      jump: ["Space"],
      jumpRight: ["KeyD", "Space"],
      jumpLeft: ["KeyA", "Space"]
    };
    const keyInfo = {
      KeyA: { key: "a", code: "KeyA", keyCode: 65 },
      KeyD: { key: "d", code: "KeyD", keyCode: 68 },
      Space: { key: " ", code: "Space", keyCode: 32 }
    };
    const active = new Set();
    const readFrame = () => {
      const text = document.querySelector("[data-time]")?.textContent || "0:00.00";
      const [minutes, seconds] = text.split(":");
      return Math.round((Number(minutes) * 60 + Number(seconds)) * 60);
    };
    const dispatchKey = (type, code) => {
      const info = keyInfo[code];
      const event = new KeyboardEvent(type, {
        key: info.key,
        code: info.code,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      Object.defineProperty(event, "keyCode", { get: () => info.keyCode });
      Object.defineProperty(event, "which", { get: () => info.keyCode });
      window.dispatchEvent(event);
      document.dispatchEvent(event);
    };
    const setKeys = (codes) => {
      const next = new Set(codes);
      for (const code of [...active]) {
        if (!next.has(code)) {
          dispatchKey("keyup", code);
          active.delete(code);
        }
      }
      for (const code of next) {
        if (!active.has(code)) {
          dispatchKey("keydown", code);
          active.add(code);
        }
      }
    };
    const waitUntilFrame = (target) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        const check = () => {
          const frame = readFrame();
          const modal = document.querySelector("[data-modal].show h1")?.textContent || null;
          const status = document.querySelector("[data-status]")?.textContent || "";
          if (frame >= target || modal) {
            resolve({ frame, modal, status });
            return;
          }
          if (status === "Signal lost") {
            reject(new Error(`Route failed at frame ${frame}`));
            return;
          }
          if (performance.now() - started > 36000) {
            reject(new Error(`Timed out waiting for frame ${target}; current frame ${frame}`));
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      });

    const startFrame = readFrame();
    const adjustedRoute = routeToRun.map(([action, frames]) => [action, frames]);
    if (trimInitialIdleByHudFrame && adjustedRoute[0]?.[0] === "idle") {
      adjustedRoute[0] = ["idle", Math.max(0, adjustedRoute[0][1] - startFrame)];
    }

    let elapsed = 0;
    const states = [];
    adjustedRoute.forEach(([, frames], index) => {
      elapsed += frames;
      const nextAction = adjustedRoute[index + 1]?.[0] || "idle";
      states.push({ at: elapsed, keys: actionKeys[nextAction] });
    });

    try {
      setKeys(actionKeys[adjustedRoute[0]?.[0] || "idle"]);
      for (const state of states) {
        const result = await waitUntilFrame(startFrame + state.at);
        setKeys(state.keys);
        if (result.modal) break;
      }
      const endFrame = readFrame();
      return {
        startFrame,
        endFrame,
        adjustedFirstIdle: adjustedRoute[0]?.[0] === "idle" ? adjustedRoute[0][1] : null,
        modal: document.querySelector("[data-modal].show h1")?.textContent || null,
        status: document.querySelector("[data-status]")?.textContent || ""
      };
    } finally {
      setKeys([]);
    }
  }, { routeToRun: route, trimInitialIdleByHudFrame: Boolean(options.trimInitialIdleByHudFrame) });

const hudFrameState = async (page) =>
  page.evaluate(() => {
    const text = document.querySelector("[data-time]")?.textContent || "0:00.00";
    const [minutes, seconds] = text.split(":");
    const frame = Math.round((Number(minutes) * 60 + Number(seconds)) * 60);
    return {
      frame,
      modal: document.querySelector("[data-modal].show h1")?.textContent || null,
      status: document.querySelector("[data-status]")?.textContent || ""
    };
  });

const setKeyboardKeys = async (page, active, codes) => {
  const next = new Set(codes);
  for (const key of [...active]) {
    if (!next.has(key)) {
      await page.keyboard.up(key);
      active.delete(key);
    }
  }
  for (const key of next) {
    if (!active.has(key)) {
      await page.keyboard.down(key);
      active.add(key);
    }
  }
};

const runKeyboardRouteWithHudFrames = async (page, route, options = {}) => {
  const actionKeys = {
    idle: [],
    right: ["KeyD"],
    left: ["KeyA"],
    jump: ["Space"],
    jumpRight: ["KeyD", "Space"],
    jumpLeft: ["KeyA", "Space"]
  };
  const active = new Set();
  const start = await hudFrameState(page);
  const adjustedRoute = route.map(([action, frames]) => [action, frames]);
  if (options.trimInitialIdleByHudFrame && adjustedRoute[0]?.[0] === "idle") {
    adjustedRoute[0] = ["idle", Math.max(0, adjustedRoute[0][1] - start.frame)];
  }

  let elapsed = 0;
  try {
    await setKeyboardKeys(page, active, actionKeys[adjustedRoute[0]?.[0] || "idle"]);
    for (let index = 0; index < adjustedRoute.length; index += 1) {
      elapsed += adjustedRoute[index][1];
      const target = start.frame + elapsed;
      await page.waitForFunction(
        (targetFrame) => {
          const text = document.querySelector("[data-time]")?.textContent || "0:00.00";
          const [minutes, seconds] = text.split(":");
          const frame = Math.round((Number(minutes) * 60 + Number(seconds)) * 60);
          const modal = document.querySelector("[data-modal].show h1")?.textContent || null;
          const status = document.querySelector("[data-status]")?.textContent || "";
          return frame >= targetFrame || modal || status === "Signal lost";
        },
        target,
        { timeout: 36000 }
      );
      const state = await hudFrameState(page);
      if (state.status === "Signal lost") throw new Error(`Route failed at frame ${state.frame}`);
      const nextAction = adjustedRoute[index + 1]?.[0] || "idle";
      await setKeyboardKeys(page, active, actionKeys[nextAction]);
      if (state.modal) {
        return { ...state, startFrame: start.frame, endFrame: state.frame };
      }
    }
    const end = await hudFrameState(page);
    return { ...end, startFrame: start.frame, endFrame: end.frame };
  } finally {
    await setKeyboardKeys(page, active, []);
  }
};

const rewindCastPixelsNearStart = async (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let y = 438; y < 492; y += 1) {
      for (let x = 104; x < 156; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        if (alpha > 170 && red < 90 && green > 170 && blue > 170) count += 1;
      }
    }
    return count;
  });

const coreSpritePixels = async (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let y = 390; y < 510; y += 1) {
      for (let x = 320; x < 720; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        const generatedCyan = red < 140 && green > 140 && blue > 150;
        const generatedViolet = red > 120 && green < 140 && blue > 155;
        const generatedGold = red > 175 && green > 145 && blue < 120;
        if (alpha > 150 && (generatedCyan || generatedViolet || generatedGold)) count += 1;
      }
    }
    return count;
  });

const centerOf = (box) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2
});

const diagnosticPosition = (items, id) => {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = items.match(new RegExp(`${escapedId}:(-?\\d+):(-?\\d+)`));
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
};

const multiTouchPress = async (context, page, points, duration = 320) => {
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points.map((point, index) => ({
      x: point.x,
      y: point.y,
      radiusX: 18,
      radiusY: 18,
      force: 0.9,
      id: index + 1
    }))
  });
  await page.waitForTimeout(duration);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await client.detach();
};

const browser = await chromium.launch(launchOptions);

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await desktop.newPage();
  collectConsole(page, relevantMessages);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  await page.screenshot({ path: artifacts.desktopGate });
  const preGateTimerCount = await page.locator("[data-time]").count();
  const preGateLevelCount = await page.locator("[data-level]").count();
  const preGateMusicKey = await page.evaluate(() => document.documentElement.dataset.echoShiftMusicKey || "");
  await page.keyboard.press("Enter");
  await page.locator("[data-play]").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftAudioState === "playing");
  const menuAudioState = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioState || "");
  const title = await page.title();
  await page.screenshot({ path: artifacts.desktopMenu });
  await page.locator("[data-play]").click();
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftAudioState === "playing");
  const levelAudioState = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioState || "");
  const desktopBackgroundKey = await page.evaluate(() => document.documentElement.dataset.echoShiftBackgroundKey);
  const objectAssetCount = Number(await page.evaluate(() => document.documentElement.dataset.echoShiftObjectAssetCount || "0"));
  const desktopIntroVisible = await page.locator("[data-level-intro='active']").isVisible();
  await page.screenshot({ path: artifacts.desktopIntro });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.screenshot({ path: artifacts.desktopGame });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyR");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyR");
  await page.waitForTimeout(500);
  const scoreText = await page.locator("[data-score]").textContent();
  const livesText = await page.locator("[data-lives]").textContent();
  await page.screenshot({ path: artifacts.desktopEcho });
  await page.keyboard.down("KeyR");
  await page.waitForTimeout(80);
  await page.keyboard.up("KeyR");
  await page.locator("[data-retry]").click();
  await waitForLevelIntro(page);
  const retryCastPixels = await rewindCastPixelsNearStart(page);
  await page.screenshot({ path: artifacts.desktopRetryAfterRewind });
  await page.keyboard.down("Escape");
  await page.waitForTimeout(100);
  await page.keyboard.up("Escape");
  await page.waitForTimeout(250);
  const pauseVisible = await page.locator("[data-modal].show").isVisible();
  await page.screenshot({ path: artifacts.desktopPause });
  await page.locator("[data-exit-menu]").click();
  await page.locator("[data-play]").waitFor({ state: "visible" });
  const returnedToTitle = await page.locator("[data-play]").isVisible();
  await page.evaluate(() => {
    window.localStorage.setItem(
      "echo-shift-progress-v1",
      JSON.stringify({
        unlocked: 2,
        scores: {
          "portal-primer": { levelId: "portal-primer", frames: 1234, echoes: 2, medal: "Quantum" }
        }
      })
    );
  });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='0']").waitFor({ state: "visible" });
  const legacyLevelBest = await page.locator("[data-level='0'] .level-best").textContent();
  await page.locator("[data-back]").click();
  await page.locator("[data-play]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='1']").click();
  await waitForGameLevel(page, "2. Rainhouse Relay");
  const nextLevelLabel = await page.locator("[data-level]").textContent();
  await page.screenshot({ path: artifacts.desktopNext });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await startAudioGate(page);
  await page.locator("[data-levels]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='3']").click();
  await waitForGameLevel(page, "4. Timber Archive");
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  const corePixels = await coreSpritePixels(page);
  const coreSpriteFrames = await page.evaluate(() => document.documentElement.dataset.echoShiftCoreSpriteFrames || "");
  const cameraSnap = await page.evaluate(() => document.documentElement.dataset.echoShiftCameraSnap || "");
  await page.screenshot({ path: artifacts.desktopCoreRoom });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await startAudioGate(page);
  await page.locator("[data-levels]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='2']").click();
  await waitForGameLevel(page, "3. Cryo Hold");
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  const heldOpenSolidFrames = await page.evaluate(() => document.documentElement.dataset.echoShiftSolidAssetFrames || "");
  const heldOpenCompletionTitle = "Route clear skipped";
  await page.screenshot({ path: artifacts.desktopHeldOpenComplete });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await startAudioGate(page);
  await page.locator("[data-levels]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='4']").click();
  await waitForGameLevel(page, "5. Sunken Clockwork");
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  const liftPhaseTilePhasesBefore = await page.evaluate(() => document.documentElement.dataset.echoShiftTileAssetPhases || "");
  const liftPhaseTilePhasesAfter = await page.evaluate(() => document.documentElement.dataset.echoShiftTileAssetPhases || "");
  const liftPhaseCompletionTitle = "Route preview skipped";
  await page.screenshot({ path: artifacts.desktopLiftPhaseComplete });

  const disabledDroneLevel = draftLevel({
    name: "Disabled Drone Render",
    plates: [{ id: "disable-plate", x: 18, y: 112, w: 54, h: 8 }],
    lasers: [{ id: "disabled-beam", x: 90, y: 86, w: 28, h: 34, startsOn: true, disabledBy: ["disable-plate"] }],
    drones: [{ id: "disabled-drone", x: 138, y: 86, w: 28, h: 34, axis: "x", distance: 0, period: 120, disabledBy: ["disable-plate"] }]
  });
  await loadDraftPlaytest(page, disabledDroneLevel);
  const disabledDroneStates = await page.evaluate(() => document.documentElement.dataset.echoShiftDroneStates || "");
  await page.screenshot({ path: artifacts.draftDisabledDrone });

  const legacySolidSpriteLevel = draftLevel({
    name: "Legacy Solid Sprite Stems",
    solids: [
      ...draftBaseSolids(),
      { id: "floorpiece-1", x: 120, y: 54, w: 42, h: 40, tone: "steel" },
      { id: "wall-1", x: 210, y: 36, w: 64, h: 64, tone: "steel" },
      { id: "block-1", x: 330, y: 58, w: 64, h: 64, tone: "steel" },
      { id: "floorpiece-2", x: 430, y: 58, w: 42, h: 40, tone: "steel", sprite: "auto" }
    ]
  });
  await loadDraftPlaytest(page, legacySolidSpriteLevel);
  const legacySolidSpriteFrames = await page.evaluate(() => document.documentElement.dataset.echoShiftSolidAssetFrames || "");
  await page.screenshot({ path: artifacts.draftLegacySolidSprites });

  const movingLaserOriginLevel = draftLevel({
    name: "Laser Sprite Mapping",
    lasers: [{ id: "static-beam", x: 90, y: 86, w: 120, h: 20, startsOn: true }],
    movingLasers: [
      { id: "phase-laser", x: 260, y: 32, w: 20, h: 80, startsOn: true, axis: "x", distance: 120, period: 120, phase: 0 }
    ]
  });
  await loadDraftPlaytest(page, movingLaserOriginLevel);
  const laserSpriteTransformsBefore = await page.evaluate(() => document.documentElement.dataset.echoShiftLaserAssetTransforms || "");
  const laserSpritePositionsBefore = await page.evaluate(() => document.documentElement.dataset.echoShiftLaserAssetPositions || "");
  await page.waitForTimeout(1200);
  const laserSpriteTransformsAfter = await page.evaluate(() => document.documentElement.dataset.echoShiftLaserAssetTransforms || "");
  const laserSpritePositionsAfter = await page.evaluate(() => document.documentElement.dataset.echoShiftLaserAssetPositions || "");
  const movingLaserPositionBefore = diagnosticPosition(laserSpritePositionsBefore, "moving-laser:phase-laser");
  const movingLaserPositionAfter = diagnosticPosition(laserSpritePositionsAfter, "moving-laser:phase-laser");
  await page.screenshot({ path: artifacts.draftMovingLaserOrigin });

  const retryRequiredLevel = draftLevel({
    name: "Retry Required Lock",
    score: {
      lives: 1,
      coreScore: 100,
      deathPenalty: 500,
      timeBonusTargetSeconds: 10,
      timeBonusPerSecond: 100
    },
    hazards: [{ id: "instant-loss", x: 24, y: 86, w: 28, h: 34 }]
  });
  await loadDraftPlaytest(page, retryRequiredLevel, { clickCanvas: false });
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftDeathPresentation === "fall", null, { timeout: 2000 });
  const retryRequiredDeathFallPhase = await page.evaluate(() => document.documentElement.dataset.echoShiftDeathPresentation || "");
  await page.screenshot({ path: artifacts.draftDeathFall });
  await page.locator("[data-modal].show h1").waitFor({ state: "visible", timeout: 6000 });
  const retryRequiredDeathFinalPhase = await page.evaluate(() => document.documentElement.dataset.echoShiftDeathPresentation || "");
  const retryRequiredTitleBeforeEsc = await page.locator("[data-modal].show h1").textContent();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(180);
  const retryRequiredTitleAfterEsc = await page.locator("[data-modal].show h1").textContent();
  await pressRewind(page, 100);
  const retryRequiredTitleAfterRewind = await page.locator("[data-modal].show h1").textContent();
  const retryRequiredLivesText = await page.locator("[data-lives]").textContent();
  await page.screenshot({ path: artifacts.draftRetryRequired });

  const retryAfterDeathLevel = draftLevel({
    name: "Retry After Death Fade",
    score: {
      lives: 1,
      coreScore: 100,
      deathPenalty: 500,
      timeBonusTargetSeconds: 10,
      timeBonusPerSecond: 100
    },
    hazards: [{ id: "delayed-loss", x: 78, y: 86, w: 30, h: 34 }]
  });
  await loadDraftPlaytest(page, retryAfterDeathLevel);
  await page.keyboard.down("KeyD");
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftDeathPresentation === "fall", null, { timeout: 4000 });
  await page.keyboard.up("KeyD");
  await page.locator("[data-modal].show h1").waitFor({ state: "visible", timeout: 7000 });
  await page.locator("[data-replay-level]").click();
  await waitForLevelIntro(page);
  const retryAfterDeathPhase = await page.evaluate(() => document.documentElement.dataset.echoShiftDeathPresentation || "");
  const retryAfterDeathModalCount = await page.locator("[data-modal].show").count();
  const retryAfterDeathLivesText = await page.locator("[data-lives]").textContent();
  await page.screenshot({ path: artifacts.draftRetryAfterDeath });

  const deathPauseGuardLevel = draftLevel({
    name: "Death Pause Guard",
    hazards: [{ id: "pause-guard-loss", x: 78, y: 86, w: 30, h: 34 }]
  });
  await loadDraftPlaytest(page, deathPauseGuardLevel);
  await page.keyboard.down("KeyD");
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftDeathPresentation === "fall", null, { timeout: 4000 });
  await page.keyboard.up("KeyD");
  await page.locator("[data-menu]").click();
  await page.waitForTimeout(180);
  const deathPauseModalDuringFall = await page.locator("[data-modal].show").count();
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftDeathPresentation === "idle", null, { timeout: 7000 });
  const deathPauseModalAfterRespawn = await page.locator("[data-modal].show").count();
  const deathPauseLivesText = await page.locator("[data-lives]").textContent();
  await page.screenshot({ path: artifacts.draftDeathPauseGuard });
  await desktop.close();

  const mobileMessages = [];
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 760 },
    isMobile: true,
    hasTouch: true
  });
  const mobile = await mobileContext.newPage();
  collectConsole(mobile, mobileMessages);
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
  await mobile.locator("[data-start-game]").waitFor({ state: "visible" });
  await mobile.screenshot({ path: artifacts.mobileGate });
  await startAudioGate(mobile);
  await mobile.locator("[data-levels]").waitFor({ state: "visible" });
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: artifacts.mobileMenu });
  await mobile.locator("[data-play]").click();
  await mobile.locator("[data-touch-control='right']").waitFor({ state: "visible" });
  const mobileIntroVisible = await mobile.locator("[data-level-intro='active']").isVisible();
  await mobile.screenshot({ path: artifacts.mobileIntro });
  await waitForLevelIntro(mobile);
  const touchControlsVisible =
    (await mobile.locator("[data-touch-control='left']").isVisible()) &&
    (await mobile.locator("[data-touch-control='right']").isVisible()) &&
    (await mobile.locator("[data-touch-control='jump']").isVisible());
  await mobile.screenshot({ path: artifacts.mobileGame });
  const rightButton = await mobile.locator("[data-touch-control='right']").boundingBox();
  assert(rightButton, "Could not locate mobile right touch button");
  await mobile.mouse.move(rightButton.x + rightButton.width / 2, rightButton.y + rightButton.height / 2);
  await mobile.mouse.down();
  await mobile.waitForTimeout(800);
  await mobile.mouse.up();
  await mobile.waitForTimeout(120);
  await mobile.screenshot({ path: artifacts.mobileTouch });
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
  await startAudioGate(mobile);
  await mobile.locator("[data-levels]").waitFor({ state: "visible" });
  await mobile.locator("[data-levels]").click();
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: artifacts.mobileLevels });
  const levelButtons = await mobile.locator("[data-level]").count();
  await mobileContext.close();

  const tabletMessages = [];
  const tabletContext = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    isMobile: true,
    hasTouch: true
  });
  const tablet = await tabletContext.newPage();
  collectConsole(tablet, tabletMessages);
  await tablet.goto(url, { waitUntil: "domcontentloaded" });
  await tablet.locator("[data-start-game]").waitFor({ state: "visible" });
  await tablet.screenshot({ path: artifacts.tabletGate });
  await startAudioGate(tablet);
  await tablet.locator("[data-play]").waitFor({ state: "visible" });
  await tablet.locator("[data-play]").click();
  await tablet.locator("[data-touch-control='right']").waitFor({ state: "visible" });
  const tabletIntroVisible = await tablet.locator("[data-level-intro='active']").isVisible();
  await tablet.screenshot({ path: artifacts.tabletIntro });
  await waitForLevelIntro(tablet);
  const tabletTouchControlsVisible =
    (await tablet.locator("[data-touch-control='left']").isVisible()) &&
    (await tablet.locator("[data-touch-control='right']").isVisible()) &&
    (await tablet.locator("[data-touch-control='jump']").isVisible());
  await tablet.screenshot({ path: artifacts.tabletGame });
  const tabletRightButton = await tablet.locator("[data-touch-control='right']").boundingBox();
  assert(tabletRightButton, "Could not locate tablet right touch button");
  await tablet.mouse.move(
    tabletRightButton.x + tabletRightButton.width / 2,
    tabletRightButton.y + tabletRightButton.height / 2
  );
  await tablet.mouse.down();
  await tablet.waitForTimeout(800);
  await tablet.mouse.up();
  await tablet.waitForTimeout(120);
  await tablet.screenshot({ path: artifacts.tabletTouch });
  await tabletContext.close();

  const touchFlowMessages = [];
  const touchFlowContext = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    isMobile: true,
    hasTouch: true
  });
  const touchFlow = await touchFlowContext.newPage();
  collectConsole(touchFlow, touchFlowMessages);
  await touchFlow.goto(url, { waitUntil: "domcontentloaded" });
  await startAudioGate(touchFlow);
  await touchFlow.locator("[data-play]").waitFor({ state: "visible" });
  await touchFlow.locator("[data-play]").click();
  await touchFlow.locator("[data-touch-control='right']").waitFor({ state: "visible" });
  await waitForLevelIntro(touchFlow);
  const comboJumpButton = await touchFlow.locator("[data-touch-control='jump']").boundingBox();
  assert(comboJumpButton, "Could not locate tablet jump touch control");
  await multiTouchPress(touchFlowContext, touchFlow, [centerOf(comboJumpButton)], 180);
  await touchFlow.waitForTimeout(80);
  await touchFlow.screenshot({ path: artifacts.tabletJump });
  await touchFlow.locator("[data-menu]").click();
  await touchFlow.locator("[data-modal].show").waitFor({ state: "visible" });
  const tabletPauseVisible = await touchFlow.locator("[data-modal].show").isVisible();
  await touchFlow.screenshot({ path: artifacts.tabletPause });
  await touchFlow.locator("[data-resume]").click();
  await touchFlow.waitForTimeout(150);
  const tabletPauseClosed = !(await touchFlow.locator("[data-modal].show").isVisible());
  await touchFlowContext.close();

  assert(title === "Echo Shift", `Unexpected title: ${title}`);
  assert(preGateTimerCount === 0 && preGateLevelCount === 0, "Expected no game HUD or timer before the audio gate");
  assert(preGateMusicKey === "", `Expected no soundtrack request before the audio gate, got ${preGateMusicKey}`);
  assert(menuAudioState === "playing", `Expected menu audio to start after the audio gate, got ${menuAudioState}`);
  assert(levelAudioState === "playing", `Expected level audio to continue after Play, got ${levelAudioState}`);
  assert(desktopIntroVisible, "Expected level intro cutscene to appear on desktop");
  assert(
    desktopBackgroundKey === "level-1-springtide-glassgrove",
    `Expected Level 1 Springtide Glassgrove background key, got ${desktopBackgroundKey}`
  );
  assert(objectAssetCount >= 10, `Expected object atlas sprites to instantiate on Level 1, got ${objectAssetCount}`);
  assert(scoreText === "000000", `Expected score HUD to start at zero after a rewind, got ${scoreText}`);
  assert(livesText === "3", `Expected default lives HUD to start at 3, got ${livesText}`);
  assert(retryCastPixels < 24, `Expected retry to clear rewind-cast sprite pixels, got ${retryCastPixels}`);
  assert(pauseVisible, "Pause modal did not become visible");
  assert(returnedToTitle, "Title button did not return to the menu");
  assert(
    legacyLevelBest?.includes("Previous clear") && legacyLevelBest.includes("2E"),
    `Expected migrated progress to render as a previous clear, got ${legacyLevelBest}`
  );
  assert(nextLevelLabel?.includes("2. Rainhouse Relay"), `Expected level select to load level 2, got ${nextLevelLabel}`);
  assert(coreSpriteFrames.includes("core-c:core-major:"), `Expected Relay Key core to use major core sprite, got ${coreSpriteFrames}`);
  assert(/^\d+\.\d{4}:-?\d/.test(cameraSnap), `Expected camera snap diagnostics after loading side-scroll level, got ${cameraSnap}`);
  assert(
    heldOpenSolidFrames.includes("left-wall:1") &&
      heldOpenSolidFrames.includes("right-wall:1") &&
      heldOpenSolidFrames.includes("low-block:2") &&
      heldOpenSolidFrames.includes("mid-ledge:0"),
    `Expected legacy Held Open ledges to use floor sprite frames, got ${heldOpenSolidFrames}`
  );
  assert(
    liftPhaseTilePhasesBefore.includes("platform:lift-a:") &&
      liftPhaseTilePhasesBefore.includes("platform:lift-a2:") &&
      liftPhaseTilePhasesAfter.includes("platform:lift-a:") &&
      liftPhaseTilePhasesAfter.includes("platform:lift-a2:"),
    `Expected moving platform tile phase to remain object-anchored, got ${liftPhaseTilePhasesBefore} -> ${liftPhaseTilePhasesAfter}`
  );
  assert(
    disabledDroneStates.includes("disabled-drone:inactive"),
    `Expected draft disabled drone to render inactive, got ${disabledDroneStates}`
  );
  assert(
    legacySolidSpriteFrames.includes("floorpiece-1:0") &&
      legacySolidSpriteFrames.includes("wall-1:1") &&
      legacySolidSpriteFrames.includes("block-1:2") &&
      legacySolidSpriteFrames.includes("floorpiece-2:2"),
    `Expected legacy editor solid stems to map to floor/wall/block sprites, got ${legacySolidSpriteFrames}`
  );
  assert(
    laserSpriteTransformsBefore.includes("laser:static-beam:h:120x20") &&
      laserSpriteTransformsBefore.includes("moving-laser:phase-laser:v:20x80") &&
      laserSpriteTransformsAfter.includes("moving-laser:phase-laser:v:20x80"),
    `Expected static and moving lasers to use whole-beam sprite mapping, got ${laserSpriteTransformsBefore} -> ${laserSpriteTransformsAfter}`
  );
  assert(
    movingLaserPositionBefore &&
      movingLaserPositionAfter &&
      movingLaserPositionBefore.y === movingLaserPositionAfter.y &&
      Math.abs(movingLaserPositionBefore.x - movingLaserPositionAfter.x) >= 30,
    `Expected moving laser sprite to follow the simulated beam center, got ${laserSpritePositionsBefore} -> ${laserSpritePositionsAfter}`
  );
  assert(retryRequiredTitleBeforeEsc === "Retry Required", `Expected retry-required modal, got ${retryRequiredTitleBeforeEsc}`);
  assert(retryRequiredTitleAfterEsc === "Retry Required", `Expected Escape not to dismiss retry-required modal, got ${retryRequiredTitleAfterEsc}`);
  assert(
    retryRequiredTitleAfterRewind === "Retry Required",
    `Expected Rewind not to bypass exhausted lives, got ${retryRequiredTitleAfterRewind}`
  );
  assert(
    retryRequiredDeathFallPhase === "fall" && retryRequiredDeathFinalPhase === "retry-required",
    `Expected death presentation to fall before retry modal, got ${retryRequiredDeathFallPhase} -> ${retryRequiredDeathFinalPhase}`
  );
  assert(retryRequiredLivesText === "0", `Expected exhausted lives HUD to stay at 0, got ${retryRequiredLivesText}`);
  assert(retryAfterDeathPhase === "idle", `Expected Retry Room to clear death presentation fade, got ${retryAfterDeathPhase}`);
  assert(retryAfterDeathModalCount === 0, `Expected Retry Room to close retry modal, got ${retryAfterDeathModalCount} modals`);
  assert(retryAfterDeathLivesText === "1", `Expected Retry Room to restore level lives, got ${retryAfterDeathLivesText}`);
  assert(deathPauseModalDuringFall === 0, `Expected pause button to be ignored during death presentation, got ${deathPauseModalDuringFall} modals`);
  assert(deathPauseModalAfterRespawn === 0, `Expected death respawn to leave no pause modal, got ${deathPauseModalAfterRespawn} modals`);
  assert(deathPauseLivesText === "2", `Expected guarded death respawn to leave 2 lives, got ${deathPauseLivesText}`);
  assert(levelButtons === 5, `Expected 5 level buttons, got ${levelButtons}`);
  assert(touchControlsVisible, "Mobile touch controls were not visible in-game");
  assert(mobileIntroVisible, "Expected level intro cutscene to appear on mobile");
  assert(tabletTouchControlsVisible, "Tablet touch controls were not visible in-game");
  assert(tabletIntroVisible, "Expected level intro cutscene to appear on tablet");
  assert(tabletPauseVisible, "Tablet pause modal did not become visible");
  assert(tabletPauseClosed, "Tablet pause modal did not close after resume");
  assert(relevantMessages.length === 0, `Desktop console issues: ${JSON.stringify(relevantMessages)}`);
  assert(mobileMessages.length === 0, `Mobile console issues: ${JSON.stringify(mobileMessages)}`);
  assert(tabletMessages.length === 0, `Tablet console issues: ${JSON.stringify(tabletMessages)}`);
  assert(touchFlowMessages.length === 0, `Tablet touch-flow console issues: ${JSON.stringify(touchFlowMessages)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        title,
        desktopBackgroundKey,
        objectAssetCount,
        scoreText,
        livesText,
        retryCastPixels,
        desktopIntroVisible,
        pauseVisible,
        returnedToTitle,
        nextLevelLabel,
        corePixels,
        heldOpenSolidFrames,
        heldOpenCompletionTitle,
        liftPhaseTilePhasesBefore,
        liftPhaseTilePhasesAfter,
        liftPhaseCompletionTitle,
        disabledDroneStates,
        legacySolidSpriteFrames,
        laserSpriteTransformsBefore,
        laserSpriteTransformsAfter,
        laserSpritePositionsBefore,
        laserSpritePositionsAfter,
        levelButtons,
        touchControlsVisible,
        mobileIntroVisible,
        tabletTouchControlsVisible,
        tabletIntroVisible,
        tabletPauseVisible,
        tabletPauseClosed,
        artifacts
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
