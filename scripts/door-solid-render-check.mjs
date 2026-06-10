import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";

const url = process.env.PLAYTEST_URL || "http://localhost:5173/";
const outDir = process.env.PLAYTEST_OUT || "/tmp/echo-shift-door-solid-qa";
const browserPath =
  process.env.CHROME_PATH ||
  (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

mkdirSync(outDir, { recursive: true });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const isAllowedBrowserMessage = (msg) =>
  msg.type === "warning" &&
  msg.text.includes("GL Driver Message") &&
  msg.text.includes("GPU stall due to ReadPixels");

const startAudioGate = async (page) => {
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").click();
};

const waitForLevelIntro = async (page) => {
  await page.waitForFunction(
    () => {
      const phase = document.documentElement.dataset.echoShiftLevelIntro;
      return phase === "exiting" || phase === "idle";
    },
    null,
    { timeout: 12000 }
  );
};

const waitForToastClear = async (page) => {
  await page.waitForFunction(() => !document.querySelector("[data-toast]")?.classList.contains("show"));
};

const runInputRouteAtHudFrames = async (page, route) =>
  page.evaluate(async (routeToRun) => {
    const actionKeys = {
      idle: [],
      right: ["KeyD"],
      left: ["KeyA"]
    };
    const keyInfo = {
      KeyA: { key: "a", code: "KeyA", keyCode: 65 },
      KeyD: { key: "d", code: "KeyD", keyCode: 68 }
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
          const status = document.querySelector("[data-status]")?.textContent || "";
          if (frame >= target) {
            resolve(frame);
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
    let elapsed = 0;
    try {
      for (const [action, frames] of routeToRun) {
        setKeys(actionKeys[action] || []);
        elapsed += frames;
        await waitUntilFrame(startFrame + elapsed);
      }
    } finally {
      setKeys([]);
    }
    return readFrame();
  }, route);

const shimmerSamplePoints = [
  { id: "floor-480", x: 480, y: 486 },
  { id: "floor-520", x: 520, y: 486 },
  { id: "floor-640", x: 640, y: 486 },
  { id: "floor-760", x: 760, y: 486 },
  { id: "floor-880", x: 880, y: 486 },
  { id: "wall-480", x: 480, y: 220 },
  { id: "wall-520", x: 520, y: 220 },
  { id: "wall-640", x: 640, y: 220 },
  { id: "wall-760", x: 760, y: 220 },
  { id: "wall-880", x: 880, y: 220 }
];

const cameraSample = async (page) => {
  const raw = await page.evaluate(() => document.documentElement.dataset.echoShiftCameraSample || document.documentElement.dataset.echoShiftCameraSnap || "");
  const [zoom = "1", coords = "0,0"] = raw.split(":");
  const [x = "0", y = "0"] = coords.split(",");
  return { raw, zoom: Number(zoom), x: Number(x), y: Number(y) };
};

const loadDraftCameraSample = async (page, draftLevel, clickPosition = { x: 480, y: 280 }) => {
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [draftLevel] });
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.waitForFunction((name) => document.querySelector("[data-level]")?.textContent?.includes(name), draftLevel.name);
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: clickPosition });
  await waitForToastClear(page);
  return cameraSample(page);
};

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
};

const decodePng = (buffer) => {
  const signature = "89504e470d0a1a0a";
  assert(buffer.subarray(0, 8).toString("hex") === signature, "Screenshot is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert(data[10] === 0 && data[11] === 0 && data[12] === 0, "Unsupported PNG compression/filter/interlace mode");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  assert(width > 0 && height > 0 && bitDepth === 8 && (colorType === 2 || colorType === 6), `Unsupported PNG format ${width}x${height} depth ${bitDepth} type ${colorType}`);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = new Uint8Array(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const previousRowOffset = rowOffset - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? raw[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[previousRowOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? raw[previousRowOffset + x - bytesPerPixel] : 0;
      if (filter === 0) raw[rowOffset + x] = value;
      else if (filter === 1) raw[rowOffset + x] = (value + left) & 0xff;
      else if (filter === 2) raw[rowOffset + x] = (value + up) & 0xff;
      else if (filter === 3) raw[rowOffset + x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) raw[rowOffset + x] = (value + paethPredictor(left, up, upLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }
    sourceOffset += stride;
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < raw.length; source += bytesPerPixel, target += 4) {
    rgba[target] = raw[source];
    rgba[target + 1] = raw[source + 1];
    rgba[target + 2] = raw[source + 2];
    rgba[target + 3] = colorType === 6 ? raw[source + 3] : 255;
  }
  return { width, height, data: rgba };
};

const readCameraProjection = async (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing game canvas");
    const rawView = document.documentElement.dataset.echoShiftCameraWorldView || "";
    const [x = "0", y = "0", w = "1", h = "1"] = rawView.split(",");
    const rect = canvas.getBoundingClientRect();
    return {
      rawView,
      view: { x: Number(x), y: Number(y), w: Number(w), h: Number(h) },
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  });

const projectionKey = (projection) =>
  `${projection.rawView}:${projection.rect.x},${projection.rect.y},${projection.rect.w},${projection.rect.h}:${projection.viewport.w},${projection.viewport.h}`;

const screenshotWithStableProjection = async (page) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const before = await readCameraProjection(page);
    const image = decodePng(await page.screenshot({ fullPage: false }));
    const after = await readCameraProjection(page);
    if (projectionKey(before) === projectionKey(after)) return { image, projection: after };
    await page.waitForTimeout(50);
  }
  throw new Error("Camera projection changed during screenshot capture; shimmer probe could not sample an atomic frame");
};

const sampleWorldColors = async (page, points) => {
  const { image, projection } = await screenshotWithStableProjection(page);
  const scaleX = image.width / Math.max(1, projection.viewport.w);
  const scaleY = image.height / Math.max(1, projection.viewport.h);
  const patchSize = 5;
  const halfPatch = Math.floor(patchSize / 2);
  const readPatch = (x, y) => {
    const left = Math.round(x) - halfPatch;
    const top = Math.round(y) - halfPatch;
    if (left < 0 || top < 0 || left + patchSize > image.width || top + patchSize > image.height) {
      return { visible: false, r: 0, g: 0, b: 0, a: 0 };
    }
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const count = patchSize * patchSize;
    for (let yOffset = 0; yOffset < patchSize; yOffset += 1) {
      for (let xOffset = 0; xOffset < patchSize; xOffset += 1) {
        const index = ((top + yOffset) * image.width + left + xOffset) * 4;
        r += image.data[index];
        g += image.data[index + 1];
        b += image.data[index + 2];
        a += image.data[index + 3];
      }
    }
    return {
      visible: true,
      r: r / count,
      g: g / count,
      b: b / count,
      a: a / count
    };
  };
  return {
    camera: projection.view,
    samples: Object.fromEntries(
      points.map((point) => {
        const x = (projection.rect.x + ((point.x - projection.view.x) / projection.view.w) * projection.rect.w) * scaleX;
        const y = (projection.rect.y + ((point.y - projection.view.y) / projection.view.h) * projection.rect.h) * scaleY;
        return [point.id, readPatch(x, y)];
      })
    )
  };
};

const colorDelta = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b), Math.abs(a.a - b.a));

const assertStableWorldSamples = (label, before, after) => {
  const comparable = shimmerSamplePoints.flatMap((point) => {
    const a = before.samples[point.id];
    const b = after.samples[point.id];
    if (!a?.visible || !b?.visible || a.a < 80 || b.a < 80) return [];
    return [{ id: point.id, delta: colorDelta(a, b), before: a, after: b }];
  });
  const visibleBefore = shimmerSamplePoints.filter((point) => before.samples[point.id]?.visible && before.samples[point.id]?.a >= 80);
  const visibleAfter = shimmerSamplePoints.filter((point) => after.samples[point.id]?.visible && after.samples[point.id]?.a >= 80);
  assert(visibleBefore.some((sample) => sample.id.startsWith("floor-")), `${label} did not sample any visible floor pixels before camera movement: ${JSON.stringify({ before, after })}`);
  assert(visibleBefore.some((sample) => sample.id.startsWith("wall-")), `${label} did not sample any visible wall pixels before camera movement: ${JSON.stringify({ before, after })}`);
  assert(visibleAfter.some((sample) => sample.id.startsWith("floor-")), `${label} did not sample any visible floor pixels after camera movement: ${JSON.stringify({ before, after })}`);
  assert(visibleAfter.some((sample) => sample.id.startsWith("wall-")), `${label} did not sample any visible wall pixels after camera movement: ${JSON.stringify({ before, after })}`);
  for (const sample of comparable) {
    assert(
      sample.delta <= 42,
      `${label} ${sample.id} shifted by ${sample.delta.toFixed(1)} while camera moved: ${JSON.stringify(sample)}`
    );
  }
  return comparable.map((sample) => ({ id: sample.id, delta: Number(sample.delta.toFixed(1)) }));
};

const level = {
  id: "door-solid-render-qa",
  index: 0,
  name: "Door Solid Render QA",
  subtitle: "Placement and readability",
  motionModel: "anchored",
  start: { x: 24, y: 438 },
  exit: { x: 850, y: 438, w: 28, h: 38 },
  bounds: { x: 0, y: 0, w: 900, h: 540 },
  solids: [
    { id: "floor-a", x: 0, y: 480, w: 300, h: 40, sprite: "floor", tone: "steel" },
    { id: "floor-b", x: 300, y: 480, w: 300, h: 40, sprite: "floor", tone: "steel" },
    { id: "floor-c", x: 600, y: 480, w: 300, h: 40, sprite: "floor", tone: "steel" },
    { id: "left-wall-upper", x: -20, y: 0, w: 20, h: 260, sprite: "wall", tone: "glass" },
    { id: "left-wall-lower", x: -20, y: 260, w: 20, h: 280, sprite: "wall", tone: "glass" },
    { id: "right-wall", x: 900, y: 0, w: 20, h: 540, sprite: "wall", tone: "glass" },
    { id: "thin-wall", x: 92, y: 404, w: 20, h: 76, sprite: "wall", tone: "steel" },
    { id: "short-floor", x: 410, y: 450, w: 128, h: 30, sprite: "floor", tone: "steel" },
    { id: "block-a", x: 560, y: 420, w: 32, h: 60, sprite: "block", tone: "dark" },
    { id: "block-b", x: 592, y: 420, w: 32, h: 60, sprite: "block", tone: "dark" },
    { id: "top-only-overlay", x: 638, y: 120, w: 140, h: 18, sprite: "floor", tone: "steel", collision: "top-only" },
    { id: "solid-cover", x: 660, y: 106, w: 84, h: 54, sprite: "block", tone: "dark" },
    { id: "lower-floor-overlay", x: 132, y: 160, w: 150, h: 18, sprite: "floor", tone: "steel" },
    { id: "upper-floor-cover", x: 160, y: 120, w: 88, h: 98, sprite: "floor", tone: "steel" },
    { id: "lower-solid-floor", x: 300, y: 230, w: 150, h: 18, sprite: "floor", tone: "steel" },
    { id: "upper-top-only-cover", x: 328, y: 120, w: 88, h: 158, sprite: "floor", tone: "steel", collision: "top-only" },
    { id: "stepped-decor-base", x: 100, y: 80, w: 260, h: 60, sprite: "floor", material: "grass-organic" },
    { id: "stepped-decor-cover", x: 100, y: 48, w: 34, h: 32, sprite: "block", material: "wood-archive" },
    { id: "ceiling-decor-base", x: 430, y: 80, w: 260, h: 60, sprite: "floor", material: "grass-organic" },
    { id: "ceiling-decor-overhang", x: 462, y: 47, w: 32, h: 32, sprite: "block", material: "wood-archive" },
    { id: "garden-high-decor-base", x: 980, y: 120, w: 320, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-off-decor-base", x: 1340, y: 120, w: 260, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "off" },
    { id: "garden-swept-decor-base", x: 1640, y: 120, w: 340, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-object-decor-base", x: 2040, y: 120, w: 340, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-top-only-decor-base", x: 2440, y: 120, w: 300, h: 20, sprite: "floor", material: "grass-organic", collision: "top-only" },
    { id: "garden-covered-decor-base", x: 2780, y: 120, w: 260, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-covered-blocker", x: 2780, y: 88, w: 260, h: 32, sprite: "block", material: "wood-archive" },
    { id: "rain-copper-decor-base", x: 3100, y: 120, w: 360, h: 96, sprite: "floor", material: "copper-corrode", decorDensity: "high" },
    { id: "rain-copper-auto-base", x: 3500, y: 120, w: 300, h: 96, sprite: "floor", material: "copper-corrode" },
    { id: "rain-warning-auto-base", x: 3840, y: 120, w: 280, h: 60, sprite: "floor", material: "warning-industrial" },
    { id: "rain-glass-optin-wall", x: 4160, y: 70, w: 200, h: 180, sprite: "wall", material: "glass-energy", decorDensity: "high" },
    { id: "enclosed-top", x: 800, y: 400, w: 20, h: 20, sprite: "block", tone: "dark" },
    { id: "enclosed-left", x: 780, y: 420, w: 20, h: 20, sprite: "block", tone: "dark" },
    { id: "enclosed-center", x: 800, y: 420, w: 20, h: 20, sprite: "block", tone: "dark" },
    { id: "enclosed-right", x: 820, y: 420, w: 20, h: 20, sprite: "block", tone: "dark" },
    { id: "enclosed-bottom", x: 800, y: 440, w: 20, h: 20, sprite: "block", tone: "dark" }
  ],
  doors: [
    { id: "closed-a", x: 145, y: 400, w: 20, h: 80, opensWith: ["missing-a"] },
    { id: "closed-b", x: 218, y: 393, w: 20, h: 80, opensWith: ["missing-b"] },
    { id: "open-a", x: 305, y: 400, w: 20, h: 80, opensWith: [] },
    { id: "open-b", x: 378, y: 393, w: 20, h: 80 },
    { id: "tall-closed-26", x: 468, y: 180, w: 26, h: 300, opensWith: ["missing-tall-26"] },
    { id: "tall-open-26", x: 548, y: 180, w: 26, h: 300 },
    { id: "tall-closed-28", x: 628, y: 180, w: 28, h: 300, opensWith: ["missing-tall-28"] },
    { id: "tall-open-28", x: 708, y: 180, w: 28, h: 300 },
    { id: "hatch-closed", x: 120, y: 270, w: 120, h: 20, orientation: "horizontal", opensWith: ["missing-hatch"] },
    { id: "hatch-open", x: 300, y: 270, w: 120, h: 20, orientation: "horizontal" }
  ],
  plates: [],
  timedSwitches: [],
  lasers: [{ id: "decor-overlay-beam", x: 2050, y: 72, w: 280, h: 44, startsOn: true }],
  movingLasers: [{ id: "decor-overlay-sweeper", x: 2180, y: 72, w: 80, h: 32, axis: "x", distance: 80, period: 140, startsOn: true }],
  drones: [{ id: "decor-overlay-drone", x: 2180, y: 82, w: 32, h: 28, axis: "x", distance: 80, period: 120 }],
  cores: [{ id: "decor-overlay-core", x: 2250, y: 84, w: 24, h: 24, label: "D" }],
  hazards: [
    { id: "qa-vent", x: 760, y: 476, w: 72, h: 4 },
    { id: "decor-overlay-vent", x: 2180, y: 116, w: 120, h: 4 }
  ],
  crates: [{ id: "decor-overlay-crate", x: 2320, y: 92, w: 28, h: 28 }],
  monsters: [{ id: "decor-overlay-monster", kind: "sprout-hopper", x: 2100, y: 84, w: 48, h: 36 }],
  platforms: [{ id: "decor-sweep-platform", x: 1640, y: 40, w: 170, h: 120, axis: "x", distance: 170, period: 120 }],
  oneWays: [],
  conveyors: [],
  launchPads: [],
  echoSensors: [
    { id: "active-sensor", x: 18, y: 430, w: 46, h: 50, actors: "player" },
    { id: "inactive-sensor", x: 70, y: 430, w: 46, h: 50, actors: "echo" }
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

const cameraLevel = {
  ...level,
  id: "camera-scroll-qa",
  name: "Camera Scroll QA",
  subtitle: "Right-left reversal coverage",
  start: { x: 80, y: 426 },
  exit: { x: 2320, y: 398, w: 48, h: 62 },
  bounds: { x: 0, y: 0, w: 2400, h: 540 },
  solids: [
    { id: "floor", x: 0, y: 460, w: 2400, h: 60, sprite: "floor", tone: "steel" },
    { id: "sample-wall", x: 460, y: 150, w: 520, h: 160, sprite: "wall", tone: "glass" },
    { id: "left-wall", x: -26, y: 0, w: 26, h: 560, sprite: "wall", tone: "glass" },
    { id: "right-wall", x: 2400, y: 0, w: 26, h: 560, sprite: "wall", tone: "glass" }
  ],
  doors: [{ id: "camera-core-gate", x: 2180, y: 360, w: 28, h: 100, opensWith: [], requiresCore: "camera-core" }],
  cores: [{ id: "camera-core", x: 1900, y: 340, w: 24, h: 24, label: "C" }],
  echoSensors: []
};

const cameraTallLevel = {
  ...cameraLevel,
  id: "camera-scroll-qa-tall",
  name: "Camera Scroll QA Tall",
  bounds: { ...cameraLevel.bounds, h: 900 }
};

const cameraShortLevel = {
  ...cameraLevel,
  id: "camera-scroll-qa-short",
  name: "Camera Scroll QA Short",
  bounds: { ...cameraLevel.bounds, h: 480 }
};

const launchOptions = {
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
};

if (browserPath) launchOptions.executablePath = browserPath;

const browser = await chromium.launch(launchOptions);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const messages = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) messages.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (error) => messages.push({ type: "pageerror", text: error.message }));
  const assertNoUnexpectedBrowserMessages = (label, startIndex = 0) => {
    const relevantMessages = messages.slice(startIndex);
    const unexpectedMessages = relevantMessages.filter((msg) => !isAllowedBrowserMessage(msg));
    assert(unexpectedMessages.length === 0, `${label} console/page messages: ${JSON.stringify(unexpectedMessages)}`);
  };

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [level] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForTimeout(900);

  const diagnostics = await page.evaluate(() => ({
    doors: document.documentElement.dataset.echoShiftDoorAssetTransforms || "",
    solids: document.documentElement.dataset.echoShiftSolidAssetFrames || "",
    outlines: document.documentElement.dataset.echoShiftSolidOutlineRects || "",
    terrainDecor: document.documentElement.dataset.echoShiftTerrainDecorFrames || "",
    terrainDecorProps: document.documentElement.dataset.echoShiftTerrainDecorPropFrames || "",
    sensors: document.documentElement.dataset.echoShiftEchoSensorAssetFrames || "",
    hazards: document.documentElement.dataset.echoShiftHazardVentSpriteFrames || "",
    objectCount: Number(document.documentElement.dataset.echoShiftObjectAssetCount || "0"),
    background: document.documentElement.dataset.echoShiftBackgroundKey || "",
    backgroundFilter: document.documentElement.dataset.echoShiftBackgroundFilter || "",
    objectAtlasFilter: document.documentElement.dataset.echoShiftObjectAtlasFilter || "",
    terrainTileFilter: document.documentElement.dataset.echoShiftTerrainTileFilter || "",
    terrainDecorPropFilter: document.documentElement.dataset.echoShiftTerrainDecorPropFilter || "",
    canvas: {
      width: document.querySelector("canvas")?.clientWidth || 0,
      height: document.querySelector("canvas")?.clientHeight || 0
    }
  }));

  const doorEntries = diagnostics.doors.split("|").filter(Boolean);
  const solidEntries = diagnostics.solids.split(",").filter(Boolean);
  const solidDiagnosticsById = new Map(solidEntries.map((entry) => {
    const [id, frame, material, tileCount, collision, depth] = entry.split(":");
    return [id, {
      frame: Number(frame),
      material,
      tileCount: Number(tileCount),
      collision,
      depth: Number(depth)
    }];
  }));
  const parseDoorEntry = (entry) => {
    const match = entry.match(/^door:([^:]+):(\d+):logic:([\d-]+),([\d-]+),([\d-]+),([\d-]+):pos:([\d-]+),([\d-]+):origin:([.\d-]+),([.\d-]+):box:([\d-]+),([\d-]+),([\d-]+),([\d-]+):orientation:(vertical|horizontal):rotation:([\d-]+)$/);
    assert(match, `Malformed door diagnostic entry: ${entry}`);
    return {
      id: match[1],
      frame: Number(match[2]),
      logic: [Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])],
      pos: [Number(match[7]), Number(match[8])],
      origin: [Number(match[9]), Number(match[10])],
      box: [Number(match[11]), Number(match[12]), Number(match[13]), Number(match[14])],
      orientation: match[15],
      rotation: Number(match[16])
    };
  };
  const doorsById = new Map(doorEntries.map((entry) => {
    const parsed = parseDoorEntry(entry);
    return [parsed.id, parsed];
  }));
  const assertDoor = (id, expected) => {
    const door = doorsById.get(id);
    assert(door, `Missing door diagnostic for ${id}: ${diagnostics.doors}`);
    assert(door.frame === expected.frame, `Expected ${id} frame ${expected.frame}, got ${door.frame}`);
    assert(JSON.stringify(door.logic) === JSON.stringify(expected.logic), `Expected ${id} logic ${expected.logic}, got ${door.logic}`);
    assert(JSON.stringify(door.pos) === JSON.stringify(expected.pos), `Expected ${id} render position ${expected.pos}, got ${door.pos}`);
    assert(JSON.stringify(door.origin) === JSON.stringify(expected.origin || [0.5, 0]), `Expected ${id} origin ${expected.origin || [0.5, 0]}, got ${door.origin}`);
    assert(JSON.stringify(door.box) === JSON.stringify(expected.box), `Expected ${id} render box ${expected.box}, got ${door.box}`);
    assert(door.orientation === (expected.orientation || "vertical"), `Expected ${id} orientation ${expected.orientation || "vertical"}, got ${door.orientation}`);
    assert(door.rotation === (expected.rotation || 0), `Expected ${id} rotation ${expected.rotation || 0}, got ${door.rotation}`);
  };

  assert(doorEntries.length === 10, `Expected 10 door diagnostic entries, got ${doorEntries.length}: ${diagnostics.doors}`);
  assertDoor("closed-a", { frame: 8, logic: [145, 400, 20, 80], pos: [155, 400], box: [138, 400, 34, 80] });
  assertDoor("closed-b", { frame: 8, logic: [218, 393, 20, 80], pos: [228, 393], box: [211, 393, 34, 80] });
  assertDoor("open-a", { frame: 9, logic: [305, 400, 20, 80], pos: [315, 400], box: [298, 400, 34, 80] });
  assertDoor("open-b", { frame: 9, logic: [378, 393, 20, 80], pos: [388, 393], box: [371, 393, 34, 80] });
  assertDoor("tall-closed-26", { frame: 8, logic: [468, 180, 26, 300], pos: [481, 180], box: [459, 180, 45, 300] });
  assertDoor("tall-open-26", { frame: 9, logic: [548, 180, 26, 300], pos: [561, 180], box: [539, 180, 45, 300] });
  assertDoor("tall-closed-28", { frame: 8, logic: [628, 180, 28, 300], pos: [642, 180], box: [618, 180, 48, 300] });
  assertDoor("tall-open-28", { frame: 9, logic: [708, 180, 28, 300], pos: [722, 180], box: [698, 180, 48, 300] });
  assertDoor("hatch-closed", {
    frame: 8,
    logic: [120, 270, 120, 20],
    pos: [180, 280],
    origin: [0.5, 0.5],
    box: [120, 263, 120, 34],
    orientation: "horizontal",
    rotation: 90
  });
  assertDoor("hatch-open", {
    frame: 9,
    logic: [300, 270, 120, 20],
    pos: [360, 280],
    origin: [0.5, 0.5],
    box: [300, 263, 120, 34],
    orientation: "horizontal",
    rotation: 90
  });

  const parseOutlineEntry = (entry) => {
    const match = entry.match(/^([^:]+):([\d-]+),([\d-]+):([\d-]+)x([\d-]+):([0-9a-f]+):(\d+):(.+)$/);
    assert(match, `Malformed solid outline diagnostic entry: ${entry}`);
    return {
      id: match[1],
      rect: [Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])],
      color: match[6],
      depth: Number(match[7]),
      segments: new Set(match[8].split(";"))
    };
  };
  const outlinesById = new Map(diagnostics.outlines.split("|").filter(Boolean).map((entry) => {
    const parsed = parseOutlineEntry(entry);
    return [parsed.id, parsed];
  }));
  const assertOutline = (id, expected) => {
    const outline = outlinesById.get(id);
    assert(outline, `Missing outline diagnostic for ${id}: ${diagnostics.outlines}`);
    assert(outline.color === "43f7ff", `Expected ${id} cyan outline color, got ${outline.color}`);
    assert(outline.depth === 2, `Expected ${id} outline depth 2, got ${outline.depth}`);
    const expectedSegments = new Set(expected.segments);
    assert(
      outline.segments.size === expectedSegments.size,
      `Expected ${id} exact outline segments ${[...expectedSegments].join(";")}, got ${[...outline.segments].join(";")}`
    );
    for (const segment of expectedSegments) {
      assert(outline.segments.has(segment), `Expected ${id} outline segment ${segment}, got ${[...outline.segments].join(";")}`);
    }
  };
  const assertNoOutline = (id) => {
    assert(!outlinesById.has(id), `Expected ${id} to omit all outline segments, got ${diagnostics.outlines}`);
  };

  assert(diagnostics.solids.includes("floor-a:0"), `Expected floor atlas frame diagnostic, got ${diagnostics.solids}`);
  assert(diagnostics.solids.includes("floor-a:0:metal-lab"), `Expected legacy steel floor to map to metal-lab terrain, got ${diagnostics.solids}`);
  assert(diagnostics.solids.includes("thin-wall:1"), `Expected wall atlas frame diagnostic, got ${diagnostics.solids}`);
  assert(diagnostics.solids.includes("left-wall-upper:1:glass-energy"), `Expected legacy glass wall to map to glass-energy terrain, got ${diagnostics.solids}`);
  assert(diagnostics.solids.includes("enclosed-center:2"), `Expected enclosed center block frame diagnostic, got ${diagnostics.solids}`);
  const topOnlyOverlay = solidDiagnosticsById.get("top-only-overlay");
  const solidCover = solidDiagnosticsById.get("solid-cover");
  const lowerFloorOverlay = solidDiagnosticsById.get("lower-floor-overlay");
  const upperFloorCover = solidDiagnosticsById.get("upper-floor-cover");
  const lowerSolidFloor = solidDiagnosticsById.get("lower-solid-floor");
  const upperTopOnlyCover = solidDiagnosticsById.get("upper-top-only-cover");
  assert(topOnlyOverlay, `Missing top-only overlay solid diagnostic: ${diagnostics.solids}`);
  assert(solidCover, `Missing solid cover diagnostic: ${diagnostics.solids}`);
  assert(lowerFloorOverlay, `Missing lower floor overlay diagnostic: ${diagnostics.solids}`);
  assert(upperFloorCover, `Missing upper floor cover diagnostic: ${diagnostics.solids}`);
  assert(lowerSolidFloor, `Missing lower solid floor diagnostic: ${diagnostics.solids}`);
  assert(upperTopOnlyCover, `Missing upper top-only cover diagnostic: ${diagnostics.solids}`);
  assert(topOnlyOverlay.collision === "top-only", `Expected top-only overlay collision diagnostic, got ${JSON.stringify(topOnlyOverlay)}`);
  assert(solidCover.collision === "solid", `Expected solid cover collision diagnostic, got ${JSON.stringify(solidCover)}`);
  assert(lowerSolidFloor.collision === "solid", `Expected lower floor to stay solid, got ${JSON.stringify(lowerSolidFloor)}`);
  assert(upperTopOnlyCover.collision === "top-only", `Expected upper cover to be top-only, got ${JSON.stringify(upperTopOnlyCover)}`);
  assert(topOnlyOverlay.depth > solidCover.depth, `Expected top-only terrain to render above overlapping solid terrain, got ${JSON.stringify({ topOnlyOverlay, solidCover })}`);
  assert(lowerFloorOverlay.depth > upperFloorCover.depth, `Expected lower floor terrain to render above taller overlapping floor terrain, got ${JSON.stringify({ lowerFloorOverlay, upperFloorCover })}`);
  assert(lowerSolidFloor.depth > upperTopOnlyCover.depth, `Expected lower solid floor to render above higher top-only floor terrain, got ${JSON.stringify({ lowerSolidFloor, upperTopOnlyCover })}`);
  assertOutline("floor-a", {
    segments: ["top:0-300", "bottom:0-300", "left:480-520"]
  });
  assertOutline("floor-b", {
    segments: ["top:300-410", "top:538-600", "bottom:300-600"]
  });
  assertOutline("floor-c", {
    segments: ["top:600-900", "bottom:600-900", "right:480-520"]
  });
  assertOutline("short-floor", {
    segments: ["top:410-538", "left:450-480", "right:450-480"]
  });
  assertOutline("left-wall-upper", {
    segments: ["top:-20-0", "left:0-260", "right:0-260"]
  });
  assertOutline("left-wall-lower", {
    segments: ["bottom:-20-0", "left:260-540", "right:260-540"]
  });
  assertOutline("block-a", {
    segments: ["top:560-592", "bottom:560-592", "left:420-480"]
  });
  assertOutline("block-b", {
    segments: ["top:592-624", "bottom:592-624", "right:420-480"]
  });
  assertNoOutline("enclosed-center");
  assert(diagnostics.sensors.includes("echo-sensor:active-sensor:hidden:active"), `Expected active echo sensor to be hidden and active, got ${diagnostics.sensors}`);
  assert(diagnostics.sensors.includes("echo-sensor:inactive-sensor:hidden:inactive"), `Expected inactive echo sensor to be hidden and inactive, got ${diagnostics.sensors}`);
  assert(!diagnostics.sensors.includes(":9:"), `Hidden echo sensor diagnostics should not use door-open frame 9, got ${diagnostics.sensors}`);
  assert(diagnostics.hazards.includes("hazard-vent:qa-vent:0:"), `Expected hazard vent sprite diagnostics, got ${diagnostics.hazards}`);
  assert(diagnostics.hazards.includes(":796,488:90x74"), `Expected hazard vent placement diagnostics, got ${diagnostics.hazards}`);
  assert(
    diagnostics.terrainDecor.includes("solid:stepped-decor-base:surface:0:1:cap:grass-organic:") &&
      diagnostics.terrainDecor.includes(":134,64:30x32"),
    `Expected stepped terrain cap to clip to exposed mid-tile span, got ${diagnostics.terrainDecor}`
  );
  assert(
    !diagnostics.terrainDecor.includes("solid:stepped-decor-base:decor:0:1:"),
    `Expected stepped terrain decor to skip clipped edge column, got ${diagnostics.terrainDecor}`
  );
  assert(
    diagnostics.terrainDecor.includes("solid:stepped-decor-base:decor:0:6:decor:grass-organic:"),
    `Expected stepped terrain decor to still render on fully exposed eligible column, got ${diagnostics.terrainDecor}`
  );
  assert(
    diagnostics.terrainDecor.includes("solid:ceiling-decor-base:surface:0:1:cap:grass-organic:") &&
      diagnostics.terrainDecor.includes(":462,64:32x32"),
    `Expected low-overhang terrain cap to remain visible, got ${diagnostics.terrainDecor}`
  );
  assert(
    !diagnostics.terrainDecor.includes("solid:ceiling-decor-base:decor:0:1:"),
    `Expected low-overhang terrain decor to skip blocked column, got ${diagnostics.terrainDecor}`
  );
  assert(
    diagnostics.terrainDecor.includes("solid:ceiling-decor-base:decor:0:4:decor:grass-organic:"),
    `Expected low-overhang terrain decor to still render on clear eligible column, got ${diagnostics.terrainDecor}`
  );
  const terrainDecorPropEntries = diagnostics.terrainDecorProps.split("|").filter(Boolean);
  const newGardenFillerPropIds = [
    "tiny-flower-tuft",
    "glow-moss-clump",
    "seedling-sprout",
    "edge-leaf-clump",
    "thin-fern-spray",
    "curled-root-hook",
    "pink-flower-tuft",
    "small-mushroom-pair",
    "meadow-flower-clump",
    "curled-vine-sprout",
    "broken-root-nub",
    "broad-leaf-tuft"
  ];
  const rainhousePropIds = [
    "rain-copper-coil",
    "rain-patina-relay-box",
    "rain-wet-cable-loop",
    "rain-insulator-cluster",
    "rain-gutter-cap",
    "rain-dripping-pipes",
    "rain-warning-plate",
    "rain-glass-energy-node",
    "rain-cable-bank",
    "rain-wall-conduit-panel",
    "rain-copper-column-fragment",
    "rain-cracked-relay-cabinet",
    "rain-puddle-conduit",
    "rain-small-terminal",
    "rain-hanging-chain-cable",
    "rain-relay-mast"
  ];
  const steppedVisibleDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:stepped-decor-base:"));
  const ceilingVisibleDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:ceiling-decor-base:"));
  const gardenHighDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-high-decor-base:"));
  const gardenSweptDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-swept-decor-base:"));
  const gardenObjectDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-object-decor-base:"));
  const gardenTopOnlyDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-top-only-decor-base:"));
  const gardenCoveredDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-covered-decor-base:"));
  const rainCopperHighDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-copper-decor-base:"));
  const rainCopperAutoDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-copper-auto-base:"));
  const rainWarningAutoDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-warning-auto-base:"));
  const rainGlassOptinDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-glass-optin-wall:"));
  const gardenHighDecorSizes = new Set(
    gardenHighDecorProps.flatMap((entry) => {
      const match = entry.match(/:(\d+)x(\d+):[-.\d]+$/);
      return match ? [`${match[1]}x${match[2]}`] : [];
    })
  );
  assert(gardenHighDecorProps.length >= 3, `Expected high-density garden solid to render multiple decor props, got ${diagnostics.terrainDecorProps}`);
  assert(
    gardenHighDecorProps.some((entry) => entry.includes(":behind-surface-large:")),
    `Expected high-density garden solid to include a large background prop, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    gardenHighDecorProps.some((entry) => entry.includes(":surface-small:") || entry.includes(":surface-medium:")),
    `Expected high-density garden solid to include surface props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    gardenHighDecorSizes.size >= 2 && !gardenHighDecorSizes.has("32x32"),
    `Expected variable-size garden decor props, got ${[...gardenHighDecorSizes].join(", ")} from ${diagnostics.terrainDecorProps}`
  );
  assert(
    terrainDecorPropEntries.some((entry) => newGardenFillerPropIds.some((id) => entry.includes(`:${id}:`))),
    `Expected at least one new garden filler prop to be selected, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    terrainDecorPropEntries.some((entry) => rainhousePropIds.some((id) => entry.includes(`:${id}:`))),
    `Expected at least one Rainhouse prop to be selected, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    rainCopperHighDecorProps.length >= 3 &&
      rainCopperHighDecorProps.some((entry) => entry.includes(":behind-surface-large:")) &&
      rainCopperHighDecorProps.some((entry) => entry.includes(":surface-small:") || entry.includes(":surface-medium:")),
    `Expected high-density copper decor to include large and surface Rainhouse props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    rainCopperAutoDecorProps.length >= 2 && rainCopperAutoDecorProps.every((entry) => entry.includes(":copper-corrode:medium:")),
    `Expected copper-corrode auto decor to resolve to medium inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    rainWarningAutoDecorProps.length >= 1 && rainWarningAutoDecorProps.every((entry) => entry.includes(":warning-industrial:low:")),
    `Expected warning-industrial auto decor to resolve to low inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    rainGlassOptinDecorProps.some((entry) => entry.includes(":wall-decal:glass-energy:high:")),
    `Expected explicit glass-energy high density to allow wall-decal Rainhouse props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    steppedVisibleDecorProps.some((entry) => entry.includes(":behind-surface-large:")),
    `Expected visible in-bounds stepped garden strip to render a large prop for screenshot coverage, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    steppedVisibleDecorProps.filter((entry) => entry.includes(":surface-small:") || entry.includes(":surface-medium:")).length >= 2 &&
      ceilingVisibleDecorProps.some((entry) => entry.includes(":surface-small:") || entry.includes(":surface-medium:")),
    `Expected medium-density garden spans to receive deterministic surface fill, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    !diagnostics.terrainDecor.includes("solid:garden-off-decor-base:decor:"),
    `Expected decorDensity off to suppress legacy surface decor tiles, got ${diagnostics.terrainDecor}`
  );
  assert(
    !diagnostics.terrainDecorProps.includes("solid:garden-off-decor-base:"),
    `Expected decorDensity off to suppress inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    gardenSweptDecorProps.length >= 3,
    `Expected moving-platform paths not to suppress geometry-driven inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    gardenObjectDecorProps.length >= 3,
    `Expected gameplay objects not to suppress geometry-driven inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    gardenTopOnlyDecorProps.length >= 2 &&
      gardenTopOnlyDecorProps.every((entry) => entry.includes(":surface-small:") || entry.includes(":surface-medium:")),
    `Expected top-only garden ledges to render small/medium inferred surface props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    gardenTopOnlyDecorProps.every((entry, index, entries) => {
      const current = entry.match(/decor-prop:\d+:\d+:([^:]+):/)?.[1] || "";
      const previous = index > 0 ? entries[index - 1].match(/decor-prop:\d+:\d+:([^:]+):/)?.[1] || "" : "";
      return current !== previous;
    }),
    `Expected nearby top-only garden props to avoid immediate repeated prop ids, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    gardenCoveredDecorProps.length === 0,
    `Expected overlapping solid geometry to suppress inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(diagnostics.objectCount >= 25, `Expected synced object sprites, got ${diagnostics.objectCount}`);
  assert(diagnostics.backgroundFilter === "time-lab-prototype:0", `Expected background texture to use linear filtering, got ${diagnostics.backgroundFilter}`);
  assert(diagnostics.objectAtlasFilter === "object-atlas:0", `Expected object atlas texture to use linear filtering, got ${diagnostics.objectAtlasFilter}`);
  assert(diagnostics.terrainTileFilter === "terrain-tiles:0", `Expected terrain tile texture to use linear filtering, got ${diagnostics.terrainTileFilter}`);
  assert(diagnostics.terrainDecorPropFilter === "terrain-decor-props:46:0", `Expected terrain decor prop textures to use linear filtering, got ${diagnostics.terrainDecorPropFilter}`);
  assertNoUnexpectedBrowserMessages("Full graphics render");

  const fullGraphicsScreenshot = `${outDir}/door-solid-render-qa.png`;
  const lowChurnScreenshot = `${outDir}/door-solid-render-low-churn-qa.png`;
  await page.screenshot({ path: fullGraphicsScreenshot, fullPage: true });
  writeFileSync(`${outDir}/door-solid-render-qa.json`, JSON.stringify({ diagnostics, messages }, null, 2));

  const lowChurnMessageStart = messages.length;
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&lowChurnGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForTimeout(900);
  const lowChurnDiagnostics = await page.evaluate(() => ({
    doors: document.documentElement.dataset.echoShiftDoorAssetTransforms || "",
    outlines: document.documentElement.dataset.echoShiftSolidOutlineRects || "",
    sensors: document.documentElement.dataset.echoShiftEchoSensorAssetFrames || "",
    hazards: document.documentElement.dataset.echoShiftHazardVentSpriteFrames || ""
  }));
  assert(lowChurnDiagnostics.doors.includes("door:tall-closed-26:8:logic:468,180,26,300:pos:481,180:origin:0.5,0:box:459,180,45,300:orientation:vertical:rotation:0"), `Expected low-churn door diagnostics, got ${lowChurnDiagnostics.doors}`);
  assert(lowChurnDiagnostics.outlines.includes("floor-b:300,480:300x40:43f7ff:2:top:300-410;top:538-600;bottom:300-600"), `Expected low-churn merged floor outline diagnostics, got ${lowChurnDiagnostics.outlines}`);
  assert(lowChurnDiagnostics.sensors.includes("echo-sensor:active-sensor:hidden:active"), `Expected low-churn hidden sensor diagnostics, got ${lowChurnDiagnostics.sensors}`);
  assert(lowChurnDiagnostics.hazards.includes("hazard-vent:qa-vent:0:"), `Expected low-churn hazard vent diagnostics, got ${lowChurnDiagnostics.hazards}`);
  assert(!lowChurnDiagnostics.sensors.includes(":9:"), `Low-churn hidden echo sensor diagnostics should not use door-open frame 9, got ${lowChurnDiagnostics.sensors}`);
  await page.screenshot({ path: lowChurnScreenshot, fullPage: true });
  assertNoUnexpectedBrowserMessages("Low-churn render", lowChurnMessageStart);

  const cameraMessageStart = messages.length;
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [cameraLevel] });
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("[data-level]")?.textContent?.includes("Camera Scroll QA"));
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await waitForToastClear(page);
  const doorRequiredCoreFrames = await page.evaluate(() => document.documentElement.dataset.echoShiftCoreSpriteFrames || "");
  assert(
    doorRequiredCoreFrames.includes("camera-core:core-major:") && doorRequiredCoreFrames.includes(":large"),
    `Expected door-required draft core to use major core sprite, got ${doorRequiredCoreFrames}`
  );
  const cameraStart = await cameraSample(page);
  const pixelStart = await sampleWorldColors(page, shimmerSamplePoints);
  await runInputRouteAtHudFrames(page, [["right", 360]]);
  const cameraAfterRight = await cameraSample(page);
  const pixelAfterRight = await sampleWorldColors(page, shimmerSamplePoints);
  await runInputRouteAtHudFrames(page, [["left", 240]]);
  const cameraAfterLeft = await cameraSample(page);
  const pixelAfterLeft = await sampleWorldColors(page, shimmerSamplePoints);
  const cameraScroll = { start: cameraStart, afterRight: cameraAfterRight, afterLeft: cameraAfterLeft };
  assert(cameraAfterRight.x > cameraStart.x + 50, `Expected camera to scroll right on flat QA route, got ${JSON.stringify(cameraScroll)}`);
  assert(cameraAfterLeft.x < cameraAfterRight.x - 20, `Expected camera to scroll left after reversal, got ${JSON.stringify(cameraScroll)}`);
  const shimmerSamples = {
    right: assertStableWorldSamples("Desktop floor/wall shimmer probe after right scroll", pixelStart, pixelAfterRight),
    left: assertStableWorldSamples("Desktop floor/wall shimmer probe after left reversal", pixelAfterRight, pixelAfterLeft)
  };
  const cameraTallStart = await loadDraftCameraSample(page, cameraTallLevel);
  const cameraShortStart = await loadDraftCameraSample(page, cameraShortLevel);
  const cameraZoomByBounds = { reference: cameraStart, tall: cameraTallStart, short: cameraShortStart };
  assert(
    Math.abs(cameraTallStart.zoom - cameraStart.zoom) < 0.0001 && Math.abs(cameraShortStart.zoom - cameraStart.zoom) < 0.0001,
    `Expected base camera zoom to ignore level bounds height, got ${JSON.stringify(cameraZoomByBounds)}`
  );

  await page.setViewportSize({ width: 640, height: 480 });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [cameraLevel] });
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("[data-level]")?.textContent?.includes("Camera Scroll QA"));
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 320, y: 240 } });
  await waitForToastClear(page);
  const narrowStart = await cameraSample(page);
  const narrowPixelStart = await sampleWorldColors(page, shimmerSamplePoints);
  await runInputRouteAtHudFrames(page, [["right", 240]]);
  const narrowAfterRight = await cameraSample(page);
  const narrowPixelAfterRight = await sampleWorldColors(page, shimmerSamplePoints);
  await runInputRouteAtHudFrames(page, [["left", 180]]);
  const narrowAfterLeft = await cameraSample(page);
  const narrowPixelAfterLeft = await sampleWorldColors(page, shimmerSamplePoints);
  const narrowCameraScroll = { start: narrowStart, afterRight: narrowAfterRight, afterLeft: narrowAfterLeft };
  assert(narrowAfterRight.x > narrowStart.x + 50, `Expected narrow camera to scroll right on flat QA route, got ${JSON.stringify(narrowCameraScroll)}`);
  assert(narrowAfterLeft.x < narrowAfterRight.x - 20, `Expected narrow camera to scroll left after reversal, got ${JSON.stringify(narrowCameraScroll)}`);
  const narrowShimmerSamples = {
    right: assertStableWorldSamples("Narrow floor/wall shimmer probe after right scroll", narrowPixelStart, narrowPixelAfterRight),
    left: assertStableWorldSamples("Narrow floor/wall shimmer probe after left reversal", narrowPixelAfterRight, narrowPixelAfterLeft)
  };
  assertNoUnexpectedBrowserMessages("Camera scroll render", cameraMessageStart);

  console.log(JSON.stringify({ ok: true, screenshot: fullGraphicsScreenshot, lowChurnScreenshot, diagnostics, cameraScroll, shimmerSamples, narrowCameraScroll, narrowShimmerSamples }, null, 2));
} finally {
  await browser.close();
}
