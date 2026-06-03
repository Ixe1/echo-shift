import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.PLAYTEST_URL || "http://localhost:5173/";
const outDir = process.env.PLAYTEST_OUT || "/tmp/echo-shift-playtest";
const browserPath =
  process.env.CHROME_PATH ||
  (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

mkdirSync(outDir, { recursive: true });

const artifacts = {
  desktopMenu: `${outDir}/menu-desktop.png`,
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
  draftEchoTintBefore: `${outDir}/draft-echo-tint-before.png`,
  draftEchoTintAfter: `${outDir}/draft-echo-tint-after.png`,
  mobileMenu: `${outDir}/menu-mobile.png`,
  mobileGame: `${outDir}/game-mobile.png`,
  mobileTouch: `${outDir}/touch-mobile.png`,
  mobileLevels: `${outDir}/levels-mobile.png`,
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
  text.includes("The AudioContext was not allowed to start") &&
  text.includes("https://developer.chrome.com/blog/autoplay/#web_audio");

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

const pulsedRightRoute = (totalFrames, jumpStarts, jumpFrames = 24) => {
  const route = [];
  let cursor = 0;
  for (const start of jumpStarts) {
    if (start > cursor) route.push(["right", start - cursor]);
    route.push(["jumpRight", jumpFrames]);
    cursor = start + jumpFrames;
  }
  if (totalFrames > cursor) route.push(["right", totalFrames - cursor]);
  return route.filter(([, frames]) => frames > 0);
};

// Public-input route for clearing the expanded Portal Primer without test hooks.
const firstRoomRoute = pulsedRightRoute(700, [287, 377, 405, 568, 599]);

// Public-input route for Level 3: record a plate echo, then clear the expanded side-scrolling lane.
const heldOpenEchoRoute = [
  ["right", 40],
  ["idle", 45]
];

const heldOpenClearRoute = [
  ["right", 114],
  ["jumpRight", 24],
  ["right", 131],
  ["jumpRight", 24],
  ["right", 24],
  ["jumpRight", 24],
  ["right", 145],
  ["jumpRight", 24],
  ["right", 163],
  ["jumpRight", 24],
  ["right", 50],
  ["jumpRight", 24],
  ["right", 101],
  ["jumpRight", 24],
  ["right", 35]
];

// Public-input route for Level 5: preview the expanded lift-phase lane without relying on a full clear route.
const liftPhaseClearRoute = [
  ["right", 102],
  ["jumpRight", 24],
  ["right", 187],
  ["jumpRight", 24],
  ["right", 24]
];

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
  perfectEchoes: 2,
  medalFrames: { gold: 600, silver: 900 },
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

const loadDraftPlaytest = async (page, level) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, draftSnapshot(level));
  await page.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "networkidle" });
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
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

const playerCentroidX = async (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const { width, height } = canvas;
    const data = context.getImageData(0, 0, width, height).data;
    let total = 0;
    let count = 0;
    for (let y = 400; y < 492; y += 1) {
      for (let x = 0; x < 240; x += 1) {
        const index = (y * width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        if (alpha > 160 && red < 130 && green > 150 && blue > 150) {
          total += x;
          count += 1;
        }
      }
    }
    return count > 0 ? total / count : null;
  });

const playerCentroid = async (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const { width } = canvas;
    const data = context.getImageData(0, 0, width, canvas.height).data;
    let totalX = 0;
    let totalY = 0;
    let count = 0;
    for (let y = 300; y < 492; y += 1) {
      for (let x = 0; x < 240; x += 1) {
        const index = (y * width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        if (alpha > 160 && red < 130 && green > 150 && blue > 150) {
          totalX += x;
          totalY += y;
          count += 1;
        }
      }
    }
    return count > 0 ? { x: totalX / count, y: totalY / count } : null;
  });

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

const inactiveDroneRenderPixels = async (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return { cyan: 0, red: 0 };
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { cyan: 0, red: 0 };
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let cyan = 0;
    let red = 0;
    for (let y = 70; y < 150; y += 1) {
      for (let x = 100; x < 240; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const redChannel = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        if (alpha <= 60) continue;
        if (redChannel < 120 && green > 120 && blue > 140) cyan += 1;
        if (redChannel > 180 && green < 120 && blue < 150) red += 1;
      }
    }
    return { cyan, red };
  });

const centerOf = (box) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2
});

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
  await page.locator("[data-play]").waitFor({ state: "visible" });
  const title = await page.title();
  await page.screenshot({ path: artifacts.desktopMenu });
  await page.locator("[data-play]").click();
  await page.waitForTimeout(600);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  const desktopBackgroundKey = await page.evaluate(() => document.documentElement.dataset.echoShiftBackgroundKey);
  const objectAssetCount = Number(await page.evaluate(() => document.documentElement.dataset.echoShiftObjectAssetCount || "0"));
  await page.screenshot({ path: artifacts.desktopGame });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyR");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyR");
  await page.waitForTimeout(500);
  const echoesText = await page.locator("[data-echoes]").textContent();
  await page.screenshot({ path: artifacts.desktopEcho });
  await page.keyboard.down("KeyR");
  await page.waitForTimeout(80);
  await page.keyboard.up("KeyR");
  await page.locator("[data-retry]").click();
  await page.waitForTimeout(120);
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
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-play]").waitFor({ state: "visible" });
  await page.evaluate(() => window.localStorage.clear());
  await page.locator("[data-play]").click();
  await page.waitForTimeout(650);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await runKeyboardRouteWithHudFrames(page, firstRoomRoute);
  await page.locator("[data-modal].show").waitFor({ state: "visible", timeout: 3000 });
  const completionTitle = await page.locator("[data-modal].show h1").textContent();
  const storedProgress = await page.evaluate(() => {
    const raw = window.localStorage.getItem("echo-shift-progress-v1");
    return raw ? JSON.parse(raw) : null;
  });
  await page.screenshot({ path: artifacts.desktopComplete });
  await page.locator("[data-next]").click();
  await page.waitForFunction(() => document.querySelector("[data-level]")?.textContent?.includes("2. First Afterimage"));
  const nextLevelLabel = await page.locator("[data-level]").textContent();
  await page.screenshot({ path: artifacts.desktopNext });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-levels]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='3']").click();
  await page.waitForTimeout(600);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await runKeyboardRoute(page, [["right", 245]]);
  const corePixels = await coreSpritePixels(page);
  await page.screenshot({ path: artifacts.desktopCoreRoom });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-levels]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='2']").click();
  await page.waitForTimeout(600);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  const heldOpenSolidFrames = await page.evaluate(() => document.documentElement.dataset.echoShiftSolidAssetFrames || "");
  await runKeyboardRouteWithHudFrames(page, heldOpenEchoRoute);
  await pressRewind(page, 80);
  await runKeyboardRouteWithHudFrames(page, heldOpenClearRoute);
  await page.locator("[data-modal].show").waitFor({ state: "visible", timeout: 3000 });
  const heldOpenCompletionTitle = await page.locator("[data-modal].show h1").textContent();
  await page.screenshot({ path: artifacts.desktopHeldOpenComplete });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-levels]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator("[data-level='4']").click();
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  const liftPhaseTilePhasesBefore = await page.evaluate(() => document.documentElement.dataset.echoShiftTileAssetPhases || "");
  const liftPhaseRouteResult = await runKeyboardRouteWithHudFrames(page, liftPhaseClearRoute);
  const liftPhaseTilePhasesAfter = await page.evaluate(() => document.documentElement.dataset.echoShiftTileAssetPhases || "");
  const liftPhaseCompletionTitle = liftPhaseRouteResult.modal || "Traversal preview";
  await page.screenshot({ path: artifacts.desktopLiftPhaseComplete });

  const disabledDroneLevel = draftLevel({
    name: "Disabled Drone Render",
    plates: [{ id: "disable-plate", x: 18, y: 112, w: 54, h: 8 }],
    lasers: [{ id: "disabled-beam", x: 90, y: 86, w: 28, h: 34, startsOn: true, disabledBy: ["disable-plate"] }],
    drones: [{ id: "disabled-drone", x: 138, y: 86, w: 28, h: 34, axis: "x", distance: 0, period: 120, disabledBy: ["disable-plate"] }]
  });
  await loadDraftPlaytest(page, disabledDroneLevel);
  const disabledDroneStates = await page.evaluate(() => document.documentElement.dataset.echoShiftDroneStates || "");
  const disabledDronePixels = await inactiveDroneRenderPixels(page);
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
  await page.waitForTimeout(1200);
  const laserSpriteTransformsAfter = await page.evaluate(() => document.documentElement.dataset.echoShiftLaserAssetTransforms || "");
  await page.screenshot({ path: artifacts.draftMovingLaserOrigin });

  const echoTintLevel = draftLevel({
    name: "Echo Tint Stability",
    hazards: [{ id: "echo-vaporizer", x: 260, y: 86, w: 36, h: 34 }]
  });
  await loadDraftPlaytest(page, echoTintLevel);
  await runKeyboardRoute(page, [["right", 90], ["idle", 20]]);
  await pressRewind(page);
  await runKeyboardRoute(page, [["right", 30], ["idle", 80]]);
  await pressRewind(page);
  await page.waitForTimeout(250);
  const echoTintBefore = await page.evaluate(() => document.documentElement.dataset.echoShiftVisibleEchoTints || "");
  await page.screenshot({ path: artifacts.draftEchoTintBefore });
  await page.waitForFunction(
    () => !(document.documentElement.dataset.echoShiftVisibleEchoTints || "").includes("echo-1:"),
    null,
    { timeout: 5000 }
  );
  const echoTintAfter = await page.evaluate(() => document.documentElement.dataset.echoShiftVisibleEchoTints || "");
  await page.screenshot({ path: artifacts.draftEchoTintAfter });
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
  await mobile.locator("[data-levels]").waitFor({ state: "visible" });
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: artifacts.mobileMenu });
  await mobile.locator("[data-play]").click();
  await mobile.locator("[data-touch-control='right']").waitFor({ state: "visible" });
  await mobile.waitForTimeout(450);
  const touchControlsVisible =
    (await mobile.locator("[data-touch-control='left']").isVisible()) &&
    (await mobile.locator("[data-touch-control='right']").isVisible()) &&
    (await mobile.locator("[data-touch-control='jump']").isVisible());
  const beforeTouchX = await playerCentroidX(mobile);
  await mobile.screenshot({ path: artifacts.mobileGame });
  const rightButton = await mobile.locator("[data-touch-control='right']").boundingBox();
  assert(rightButton, "Could not locate mobile right touch button");
  await mobile.mouse.move(rightButton.x + rightButton.width / 2, rightButton.y + rightButton.height / 2);
  await mobile.mouse.down();
  await mobile.waitForTimeout(800);
  await mobile.mouse.up();
  await mobile.waitForTimeout(120);
  const afterTouchX = await playerCentroidX(mobile);
  await mobile.screenshot({ path: artifacts.mobileTouch });
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
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
  await tablet.locator("[data-play]").waitFor({ state: "visible" });
  await tablet.locator("[data-play]").click();
  await tablet.locator("[data-touch-control='right']").waitFor({ state: "visible" });
  await tablet.waitForTimeout(450);
  const tabletTouchControlsVisible =
    (await tablet.locator("[data-touch-control='left']").isVisible()) &&
    (await tablet.locator("[data-touch-control='right']").isVisible()) &&
    (await tablet.locator("[data-touch-control='jump']").isVisible());
  const beforeTabletTouchX = await playerCentroidX(tablet);
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
  const afterTabletTouchX = await playerCentroidX(tablet);
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
  await touchFlow.locator("[data-play]").waitFor({ state: "visible" });
  await touchFlow.locator("[data-play]").click();
  await touchFlow.locator("[data-touch-control='right']").waitFor({ state: "visible" });
  await touchFlow.waitForTimeout(450);
  const beforeTouchJump = await playerCentroid(touchFlow);
  const comboJumpButton = await touchFlow.locator("[data-touch-control='jump']").boundingBox();
  assert(comboJumpButton, "Could not locate tablet jump touch control");
  await multiTouchPress(touchFlowContext, touchFlow, [centerOf(comboJumpButton)], 180);
  await touchFlow.waitForTimeout(80);
  const afterTouchJump = await playerCentroid(touchFlow);
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
  assert(
    desktopBackgroundKey === "level-1-time-lab-no-portals",
    `Expected Level 1 no-portal background key, got ${desktopBackgroundKey}`
  );
  assert(objectAssetCount >= 10, `Expected object atlas sprites to instantiate on Level 1, got ${objectAssetCount}`);
  assert(echoesText === "1", `Expected one echo after rewind, got ${echoesText}`);
  assert(retryCastPixels < 24, `Expected retry to clear rewind-cast sprite pixels, got ${retryCastPixels}`);
  assert(pauseVisible, "Pause modal did not become visible");
  assert(returnedToTitle, "Title button did not return to the menu");
  assert(completionTitle === "Room Clear", `Expected first room completion modal, got ${completionTitle}`);
  assert(storedProgress?.unlocked >= 2, `Expected completion to unlock level 2: ${JSON.stringify(storedProgress)}`);
  assert(storedProgress?.scores?.["portal-primer"], "Expected first room score to persist");
  assert(nextLevelLabel?.includes("2. First Afterimage"), `Expected Next Room to load level 2, got ${nextLevelLabel}`);
  assert(corePixels > 60, `Expected generated core/effect sprite pixels in Relay Key, got ${corePixels}`);
  assert(
    heldOpenSolidFrames.includes("left-wall:1") &&
      heldOpenSolidFrames.includes("right-wall:1") &&
      heldOpenSolidFrames.includes("low-block:0") &&
      heldOpenSolidFrames.includes("mid-ledge:0"),
    `Expected legacy Held Open ledges to use floor sprite frames, got ${heldOpenSolidFrames}`
  );
  assert(heldOpenCompletionTitle === "Room Clear", `Expected Held Open completion modal, got ${heldOpenCompletionTitle}`);
  assert(
    liftPhaseRouteResult.status !== "Signal lost" && liftPhaseRouteResult.endFrame >= liftPhaseRouteResult.startFrame + 320,
    `Expected Lift Phase traversal preview to remain alive through the visual route: ${JSON.stringify(liftPhaseRouteResult)}`
  );
  assert(
    liftPhaseTilePhasesBefore.includes("platform:lift-a:") &&
      liftPhaseTilePhasesBefore.includes("platform:lift-a2:") &&
      liftPhaseTilePhasesAfter.includes("platform:lift-a:") &&
      liftPhaseTilePhasesAfter.includes("platform:lift-a2:") &&
      liftPhaseTilePhasesBefore === liftPhaseTilePhasesAfter,
    `Expected moving platform tile phase to remain object-anchored, got ${liftPhaseTilePhasesBefore} -> ${liftPhaseTilePhasesAfter}`
  );
  assert(
    disabledDroneStates.includes("disabled-drone:inactive"),
    `Expected draft disabled drone to render inactive, got ${disabledDroneStates}`
  );
  assert(
    disabledDronePixels.cyan > 20 && disabledDronePixels.red < 20,
    `Expected inactive drone render to be cyan instead of red: ${JSON.stringify(disabledDronePixels)}`
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
    echoTintBefore.includes("echo-1:bd5cff") && echoTintBefore.includes("echo-2:50ffc2"),
    `Expected both echo tints before vaporization, got ${echoTintBefore}`
  );
  assert(
    !echoTintAfter.includes("echo-1:") && echoTintAfter.includes("echo-2:50ffc2"),
    `Expected surviving echo to keep cyan tint after earlier echo vaporized, got ${echoTintAfter}`
  );
  assert(levelButtons === 10, `Expected 10 level buttons, got ${levelButtons}`);
  assert(touchControlsVisible, "Mobile touch controls were not visible in-game");
  assert(beforeTouchX !== null && afterTouchX !== null, "Could not locate player pixels for touch movement check");
  assert(afterTouchX > beforeTouchX + 8, `Expected touch-right to move player right: ${beforeTouchX} -> ${afterTouchX}`);
  assert(tabletTouchControlsVisible, "Tablet touch controls were not visible in-game");
  assert(
    beforeTabletTouchX !== null && afterTabletTouchX !== null,
    "Could not locate player pixels for tablet touch movement check"
  );
  assert(
    afterTabletTouchX > beforeTabletTouchX + 8,
    `Expected tablet touch-right to move player right: ${beforeTabletTouchX} -> ${afterTabletTouchX}`
  );
  assert(beforeTouchJump && afterTouchJump, "Could not locate player pixels for tablet touch jump check");
  assert(
    afterTouchJump.y < beforeTouchJump.y - 8,
    `Expected touch jump to move player upward: ${JSON.stringify(beforeTouchJump)} -> ${JSON.stringify(afterTouchJump)}`
  );
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
        echoesText,
        retryCastPixels,
        pauseVisible,
        returnedToTitle,
        completionTitle,
        nextLevelLabel,
        corePixels,
        heldOpenSolidFrames,
        heldOpenCompletionTitle,
        liftPhaseRouteResult,
        liftPhaseTilePhasesBefore,
        liftPhaseTilePhasesAfter,
        liftPhaseCompletionTitle,
        disabledDroneStates,
        disabledDronePixels,
        legacySolidSpriteFrames,
        laserSpriteTransformsBefore,
        laserSpriteTransformsAfter,
        echoTintBefore,
        echoTintAfter,
        levelButtons,
        touchControlsVisible,
        mobileTouchDelta: Number((afterTouchX - beforeTouchX).toFixed(2)),
        tabletTouchControlsVisible,
        tabletTouchDelta: Number((afterTabletTouchX - beforeTabletTouchX).toFixed(2)),
        tabletJumpDeltaY: Number((afterTouchJump.y - beforeTouchJump.y).toFixed(2)),
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
