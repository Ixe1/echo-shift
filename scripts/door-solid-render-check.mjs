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

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
};

const decodePng = (buffer) => {
  assert(buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "Expected PNG screenshot buffer");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
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
      assert(data[12] === 0, "Interlaced PNG screenshots are not supported by this QA parser");
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  assert(width > 0 && height > 0, "Expected PNG screenshot dimensions");
  assert(bitDepth === 8 && (colorType === 2 || colorType === 6), `Unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(width * height * 4);
  const row = Buffer.alloc(stride);
  const previousRow = Buffer.alloc(stride);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset];
      inputOffset += 1;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previousRow[x] || 0;
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] || 0 : 0;
      if (filter === 0) row[x] = raw;
      else if (filter === 1) row[x] = (raw + left) & 255;
      else if (filter === 2) row[x] = (raw + up) & 255;
      else if (filter === 3) row[x] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (raw + paethPredictor(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 4;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
      pixels[target + 3] = colorType === 6 ? row[source + 3] : 255;
    }
    previousRow.set(row);
  }
  return { width, height, pixels };
};

const sampleCyanOutlinePixels = (buffer, cameraWorldView, rect, sides, options = {}) => {
  const png = decodePng(buffer);
  const view = cameraWorldView.split(",").map(Number);
  assert(view.length === 4 && view.every((value) => Number.isFinite(value)), `Expected camera world view, got ${cameraWorldView}`);
  const [viewX, viewY, viewW, viewH] = view;
  const toPng = (x, y) => ({
    x: Math.round(((x - viewX) / viewW) * png.width),
    y: Math.round(((y - viewY) / viewH) * png.height)
  });
  const isCyanOutlinePixel = (r, g, b, a) => a > 80 && r <= 145 && g >= 95 && b >= 110 && g > r + 32 && b > r + 38;
  const points = [];
  const pushHorizontal = (side, y) => {
    for (let x = rect.x + 3; x <= rect.x + rect.w - 3; x += 4) points.push({ ...toPng(x, y), side });
  };
  const pushVertical = (side, x) => {
    for (let y = rect.y + 3; y <= rect.y + rect.h - 3; y += 4) points.push({ ...toPng(x, y), side });
  };
  const offset = options.outside ? 0.5 : -0.5;
  if (sides.includes("top")) pushHorizontal("top", rect.y - offset);
  if (sides.includes("bottom")) pushHorizontal("bottom", rect.y + rect.h + offset);
  if (sides.includes("left")) pushVertical("left", rect.x - offset);
  if (sides.includes("right")) pushVertical("right", rect.x + rect.w + offset);
  let matchingPixels = 0;
  let sampledPixels = 0;
  let maxChannel = 0;
  const sampleRadius = Number.isFinite(options.sampleRadius) ? Math.max(0, Math.floor(options.sampleRadius)) : 1;
  const perSide = Object.fromEntries(
    sides.map((side) => [
      side,
      {
        matchingPixels: 0,
        sampledPixels: 0,
        maxChannel: 0,
        points: 0,
        hitPoints: 0
      }
    ])
  );
  for (const point of points) {
    const sideStats = perSide[point.side];
    sideStats.points += 1;
    let pointMatched = false;
    for (let y = point.y - sampleRadius; y <= point.y + sampleRadius; y += 1) {
      if (y < 0 || y >= png.height) continue;
      for (let x = point.x - sampleRadius; x <= point.x + sampleRadius; x += 1) {
        if (x < 0 || x >= png.width) continue;
        const pixelIndex = (y * png.width + x) * 4;
        const r = png.pixels[pixelIndex];
        const g = png.pixels[pixelIndex + 1];
        const b = png.pixels[pixelIndex + 2];
        const a = png.pixels[pixelIndex + 3];
        sampledPixels += 1;
        maxChannel = Math.max(maxChannel, r, g, b);
        sideStats.sampledPixels += 1;
        sideStats.maxChannel = Math.max(sideStats.maxChannel, r, g, b);
        if (isCyanOutlinePixel(r, g, b, a)) {
          matchingPixels += 1;
          sideStats.matchingPixels += 1;
          pointMatched = true;
        }
      }
    }
    if (pointMatched) sideStats.hitPoints += 1;
  }
  return { matchingPixels, sampledPixels, maxChannel, points: points.length, rect, sides, outside: Boolean(options.outside), sampleRadius, perSide };
};

const assertCyanOutlineSamples = (label, floorSample, wallSamples) => {
  assert(
    floorSample.matchingPixels >= 12,
    `Expected visible cyan floor outline pixels for ${label} so wall pixel sampling is meaningful, got ${JSON.stringify(floorSample)}`
  );
  for (const sample of wallSamples) {
    assert(
      sample.sampleRadius === 0,
      `Expected ${label} wall outline sampling to use exact perimeter pixels, got ${JSON.stringify(sample)}`
    );
    assert(
      sample.matchingPixels <= 12,
      `Expected ${label} wall perimeter to omit cyan outline pixels, got ${JSON.stringify(sample)}`
    );
    for (const [side, sideSample] of Object.entries(sample.perSide)) {
      assert(
        sideSample.matchingPixels <= 8,
        `Expected ${label} wall ${side} edge to omit a cyan outline stripe, got ${JSON.stringify(sample)}`
      );
    }
    assert(
      floorSample.matchingPixels >= sample.matchingPixels * 6,
      `Expected ${label} floor outline proof to strongly exceed any wall-edge cyan pixels, got floor ${JSON.stringify(floorSample)} wall ${JSON.stringify(sample)}`
    );
  }
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
    { id: "visible-glass-wall", x: 122, y: 300, w: 20, h: 70, sprite: "wall", material: "glass-energy", decorDensity: "high" },
    { id: "visible-cryo-wall", x: 156, y: 300, w: 20, h: 70, sprite: "wall", material: "ice-cryo", decorDensity: "high" },
    { id: "visible-timber-wall", x: 190, y: 300, w: 20, h: 70, sprite: "wall", material: "wood-archive", decorDensity: "high" },
    { id: "top-only-overlay", x: 638, y: 120, w: 140, h: 18, sprite: "floor", tone: "steel", collision: "top-only" },
    { id: "solid-cover", x: 660, y: 106, w: 84, h: 54, sprite: "block", tone: "dark" },
    { id: "lower-floor-overlay", x: 132, y: 160, w: 150, h: 18, sprite: "floor", tone: "steel" },
    { id: "upper-floor-cover", x: 160, y: 120, w: 88, h: 98, sprite: "floor", tone: "steel" },
    { id: "lower-solid-floor", x: 300, y: 230, w: 150, h: 18, sprite: "floor", tone: "steel" },
    { id: "upper-top-only-cover", x: 328, y: 120, w: 88, h: 158, sprite: "floor", tone: "steel", collision: "top-only" },
    { id: "stepped-decor-base", x: 100, y: 80, w: 260, h: 60, sprite: "floor", material: "grass-organic" },
    { id: "stepped-decor-cover", x: 100, y: 48, w: 34, h: 32, sprite: "block", material: "wood-archive", decorDensity: "off" },
    { id: "ceiling-decor-base", x: 430, y: 80, w: 260, h: 60, sprite: "floor", material: "grass-organic" },
    { id: "ceiling-decor-overhang", x: 462, y: 47, w: 32, h: 32, sprite: "block", material: "wood-archive", decorDensity: "off" },
    { id: "garden-high-decor-base", x: 980, y: 120, w: 320, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-off-decor-base", x: 1340, y: 120, w: 260, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "off" },
    { id: "garden-swept-decor-base", x: 1640, y: 120, w: 340, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-object-decor-base", x: 2040, y: 120, w: 340, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-top-only-decor-base", x: 2440, y: 120, w: 300, h: 20, sprite: "floor", material: "grass-organic", collision: "top-only" },
    { id: "garden-covered-decor-base", x: 2780, y: 120, w: 260, h: 96, sprite: "floor", material: "grass-organic", decorDensity: "high" },
    { id: "garden-covered-blocker", x: 2780, y: 88, w: 260, h: 32, sprite: "block", material: "wood-archive", decorDensity: "off" },
    { id: "rain-visible-copper-sample", x: 770, y: 78, w: 120, h: 64, sprite: "floor", material: "copper-corrode", decorDensity: "high" },
    { id: "rain-copper-decor-base", x: 3100, y: 120, w: 360, h: 96, sprite: "floor", material: "copper-corrode", decorDensity: "high" },
    { id: "rain-copper-auto-base", x: 3500, y: 120, w: 300, h: 96, sprite: "floor", material: "copper-corrode" },
    { id: "rain-warning-auto-base", x: 3840, y: 120, w: 280, h: 60, sprite: "floor", material: "warning-industrial" },
    { id: "rain-glass-optin-wall", x: 4160, y: 70, w: 200, h: 180, sprite: "wall", material: "glass-energy", decorDensity: "high" },
    { id: "cryo-visible-sample", x: 650, y: 260, w: 220, h: 70, sprite: "floor", material: "ice-cryo", decorDensity: "high" },
    { id: "cryo-high-decor-base", x: 4400, y: 120, w: 360, h: 96, sprite: "floor", material: "ice-cryo", decorDensity: "high" },
    { id: "cryo-auto-base", x: 4800, y: 120, w: 300, h: 96, sprite: "floor", material: "ice-cryo" },
    { id: "cryo-wall-decor-base", x: 5140, y: 70, w: 220, h: 190, sprite: "wall", material: "ice-cryo", decorDensity: "high" },
    { id: "timber-visible-sample", x: 390, y: 300, w: 220, h: 70, sprite: "floor", material: "wood-archive", decorDensity: "high" },
    { id: "timber-high-decor-base", x: 5480, y: 120, w: 380, h: 96, sprite: "floor", material: "wood-archive", decorDensity: "high" },
    { id: "timber-auto-base", x: 5900, y: 120, w: 300, h: 96, sprite: "floor", material: "wood-archive" },
    { id: "timber-wall-decor-base", x: 6240, y: 70, w: 240, h: 190, sprite: "wall", material: "wood-archive", decorDensity: "high" },
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
    timeBonusTargetSeconds: 10,
    timeBonusPerSecond: 100
  },
  hint: "QA"
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
    cameraWorldView: document.documentElement.dataset.echoShiftCameraWorldView || "",
    canvas: {
      width: document.querySelector("canvas")?.clientWidth || 0,
      height: document.querySelector("canvas")?.clientHeight || 0
    }
  }));

  const doorEntries = diagnostics.doors.split("|").filter(Boolean);
  const solidEntries = diagnostics.solids.split(",").filter(Boolean);
  const levelSolidsById = new Map(level.solids.map((solid) => [solid.id, solid]));
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
  assertNoOutline("left-wall-upper");
  assertNoOutline("left-wall-lower");
  assertNoOutline("right-wall");
  assertNoOutline("thin-wall");
  assertNoOutline("visible-glass-wall");
  assertNoOutline("visible-cryo-wall");
  assertNoOutline("visible-timber-wall");
  assertNoOutline("rain-glass-optin-wall");
  assertNoOutline("cryo-wall-decor-base");
  assertNoOutline("timber-wall-decor-base");
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
  const terrainDecorPlacements = diagnostics.terrainDecor.split("|").filter(Boolean).flatMap((entry) => {
    const match = entry.match(/^solid:([^:]+):(surface|decor):\d+:\d+:(cap|decor):([^:]+):(\d+):(-?\d+),(-?\d+):(\d+)x(\d+):(-?\d+(?:\.\d+)?)$/);
    return match
      ? [{
          solidId: match[1],
          kind: match[3],
          material: match[4],
          frame: Number(match[5]),
          x: Number(match[6]),
          y: Number(match[7]),
          w: Number(match[8]),
          h: Number(match[9]),
          depth: Number(match[10]),
          entry
        }]
      : [];
  });
  const parsedTerrainDecorProps = terrainDecorPropEntries.flatMap((entry) => {
    const match = entry.match(/^solid:([^:]+):decor-prop:[^:]+:[^:]+:([^:]+):([^:]+):([^:]+):(low|medium|high):(\d+):(-?\d+),(-?\d+):(\d+)x(\d+):(-?\d+(?:\.\d+)?)$/);
    return match
      ? [{
          solidId: match[1],
          propId: match[2],
          category: match[3],
          material: match[4],
          density: match[5],
          frame: Number(match[6]),
          x: Number(match[7]),
          y: Number(match[8]),
          w: Number(match[9]),
          h: Number(match[10]),
          depth: Number(match[11]),
          entry
        }]
      : [];
  });
  for (const placement of terrainDecorPlacements) {
    const solid = solidDiagnosticsById.get(placement.solidId);
    assert(solid, `Expected solid diagnostic for terrain decor placement ${placement.entry}`);
    assert(
      placement.depth < solid.depth,
      `Expected terrain ${placement.kind} decor to render behind ${placement.solidId}, got decor depth ${placement.depth} vs solid depth ${solid.depth}: ${placement.entry}`
    );
  }
  for (const prop of parsedTerrainDecorProps.filter((item) => item.category === "surface-small" || item.category === "surface-medium")) {
    const solid = solidDiagnosticsById.get(prop.solidId);
    assert(solid, `Expected solid diagnostic for terrain decor prop ${prop.entry}`);
    assert(
      prop.depth < solid.depth,
      `Expected surface decor prop to render behind ${prop.solidId}, got prop depth ${prop.depth} vs solid depth ${solid.depth}: ${prop.entry}`
    );
  }
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
  const cryoPropIds = [
    "cryo-frost-clump",
    "cryo-ice-shard-cluster",
    "cryo-frozen-cable-stub",
    "cryo-small-canister",
    "cryo-snow-crystal-mound",
    "cryo-frosted-vent",
    "cryo-cold-warning-plate",
    "cryo-glow-core-node",
    "cryo-hanging-icicles",
    "cryo-frozen-cable-bundle",
    "cryo-wall-frost-crack",
    "cryo-frozen-glass-panel",
    "cryo-tall-tank",
    "cryo-ice-column-fragment",
    "cryo-background-pod",
    "cryo-hanging-frost-cables"
  ];
  const timberPropIds = [
    "timber-loose-papers",
    "timber-tiny-book-stack",
    "timber-glow-moss-log",
    "timber-brass-data-tags",
    "timber-book-pile",
    "timber-broken-shelf-chunk",
    "timber-archive-crate",
    "timber-root-data-box",
    "timber-old-bookcase",
    "timber-timber-column",
    "timber-root-archive-trunk",
    "timber-archive-terminal",
    "timber-dangling-roots",
    "timber-hanging-tags-cables",
    "timber-hanging-lamps",
    "timber-carved-panel"
  ];
  const steppedVisibleDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:stepped-decor-base:"));
  const steppedCoverDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:stepped-decor-cover:"));
  const ceilingVisibleDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:ceiling-decor-base:"));
  const ceilingOverhangDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:ceiling-decor-overhang:"));
  const gardenHighDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-high-decor-base:"));
  const gardenSweptDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-swept-decor-base:"));
  const gardenObjectDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-object-decor-base:"));
  const gardenTopOnlyDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-top-only-decor-base:"));
  const gardenCoveredDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-covered-decor-base:"));
  const gardenCoveredBlockerDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:garden-covered-blocker:"));
  const rainVisibleDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-visible-copper-sample:"));
  const rainCopperHighDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-copper-decor-base:"));
  const rainCopperAutoDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-copper-auto-base:"));
  const rainWarningAutoDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-warning-auto-base:"));
  const rainGlassOptinDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:rain-glass-optin-wall:"));
  const cryoVisibleDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:cryo-visible-sample:"));
  const cryoHighDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:cryo-high-decor-base:"));
  const cryoAutoDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:cryo-auto-base:"));
  const cryoWallDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:cryo-wall-decor-base:"));
  const timberVisibleDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:timber-visible-sample:"));
  const timberHighDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:timber-high-decor-base:"));
  const timberAutoDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:timber-auto-base:"));
  const timberWallDecorProps = terrainDecorPropEntries.filter((entry) => entry.includes("solid:timber-wall-decor-base:"));
  const timberTopBySolidId = new Map([
    ["timber-visible-sample", 300],
    ["timber-high-decor-base", 120],
    ["timber-auto-base", 120],
    ["timber-wall-decor-base", 70]
  ]);
  for (const prop of parsedTerrainDecorProps.filter(
    (item) =>
      item.material === "wood-archive" &&
      (item.category === "surface-small" || item.category === "surface-medium" || item.category === "behind-surface-large") &&
      timberTopBySolidId.has(item.solidId)
  )) {
    const embed = prop.category === "behind-surface-large" ? 18 : 14;
    const top = timberTopBySolidId.get(prop.solidId);
    assert(
      prop.y + prop.h >= top + embed,
      `Expected archive decor prop to be embedded in ${prop.solidId} surface, got bottom ${prop.y + prop.h} vs top ${top}: ${prop.entry}`
    );
  }
  const timberDecorSizes = [...timberVisibleDecorProps, ...timberHighDecorProps, ...timberAutoDecorProps, ...timberWallDecorProps].flatMap((entry) => {
    const match = entry.match(/:(\d+)x(\d+):[-.\d]+$/);
    return match ? [{ w: Number(match[1]), h: Number(match[2]), entry }] : [];
  });
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
    rainVisibleDecorProps.some((entry) => entry.includes(":copper-corrode:high:")),
    `Expected visible Rainhouse copper sample to render for screenshot coverage, got ${diagnostics.terrainDecorProps}`
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
    terrainDecorPropEntries.some((entry) => cryoPropIds.some((id) => entry.includes(`:${id}:`))),
    `Expected at least one Cryo prop to be selected, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    cryoVisibleDecorProps.some((entry) => entry.includes(":ice-cryo:high:")),
    `Expected visible Cryo sample to render for screenshot coverage, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    cryoHighDecorProps.length >= 3 &&
      cryoHighDecorProps.some((entry) => entry.includes(":behind-surface-large:")) &&
      cryoHighDecorProps.some((entry) => entry.includes(":surface-small:") || entry.includes(":surface-medium:")),
    `Expected high-density ice-cryo decor to include large and surface Cryo props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    cryoAutoDecorProps.length >= 2 && cryoAutoDecorProps.every((entry) => entry.includes(":ice-cryo:medium:")),
    `Expected ice-cryo auto decor to resolve to medium inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    cryoWallDecorProps.some((entry) => entry.includes(":wall-decal:ice-cryo:high:")),
    `Expected high-density ice-cryo wall to render wall-decal props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    terrainDecorPropEntries.some((entry) => timberPropIds.some((id) => entry.includes(`:${id}:`))),
    `Expected at least one Timber prop to be selected, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    timberVisibleDecorProps.some((entry) => entry.includes(":wood-archive:high:")),
    `Expected visible Timber sample to render for screenshot coverage, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    timberHighDecorProps.length >= 3 &&
      timberHighDecorProps.some((entry) => entry.includes(":behind-surface-large:")) &&
      timberHighDecorProps.some((entry) => entry.includes(":surface-small:") || entry.includes(":surface-medium:")),
    `Expected high-density wood-archive decor to include large and surface Timber props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    timberAutoDecorProps.length >= 2 && timberAutoDecorProps.every((entry) => entry.includes(":wood-archive:medium:")),
    `Expected wood-archive auto decor to resolve to medium inferred props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    timberWallDecorProps.some((entry) => entry.includes(":wall-decal:wood-archive:high:")),
    `Expected high-density wood-archive wall to render wall-decal props, got ${diagnostics.terrainDecorProps}`
  );
  assert(
    timberDecorSizes.every((size) => size.w <= 104 && size.h <= 132),
    `Expected Timber decor props to stay normalized to garden/cryo scale, got ${timberDecorSizes.map((size) => `${size.w}x${size.h}`).join(", ")} from ${diagnostics.terrainDecorProps}`
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
    !diagnostics.terrainDecor.includes("solid:garden-covered-blocker:decor:"),
    `Expected wood-archive cover/blocker opt-out to suppress legacy tile decor, got ${diagnostics.terrainDecor}`
  );
  assert(
    steppedCoverDecorProps.length === 0 &&
      ceilingOverhangDecorProps.length === 0 &&
      gardenCoveredBlockerDecorProps.length === 0,
    `Expected wood-archive cover/blocker opt-outs to suppress inferred props, got ${diagnostics.terrainDecorProps}`
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
  assert(diagnostics.terrainDecorPropFilter === "terrain-decor-props:78:0", `Expected terrain decor prop textures to use linear filtering, got ${diagnostics.terrainDecorPropFilter}`);
  assertNoUnexpectedBrowserMessages("Full graphics render");

  const fullGraphicsScreenshot = `${outDir}/door-solid-render-qa.png`;
  const lowChurnScreenshot = `${outDir}/door-solid-render-low-churn-qa.png`;
  const fullGraphicsScreenshotBuffer = await page.screenshot({ path: fullGraphicsScreenshot, fullPage: true });
  const floorCyanSamples = sampleCyanOutlinePixels(fullGraphicsScreenshotBuffer, diagnostics.cameraWorldView, levelSolidsById.get("floor-a"), ["top"]);
  const wallCyanSamples = ["thin-wall", "visible-glass-wall", "visible-cryo-wall", "visible-timber-wall"].map((id) =>
    sampleCyanOutlinePixels(fullGraphicsScreenshotBuffer, diagnostics.cameraWorldView, levelSolidsById.get(id), ["left", "right"], { outside: true, sampleRadius: 0 })
  );
  assertCyanOutlineSamples("full-graphics", floorCyanSamples, wallCyanSamples);
  diagnostics.floorCyanSamples = floorCyanSamples;
  diagnostics.wallCyanSamples = wallCyanSamples;
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
    hazards: document.documentElement.dataset.echoShiftHazardVentSpriteFrames || "",
    cameraWorldView: document.documentElement.dataset.echoShiftCameraWorldView || ""
  }));
  assert(lowChurnDiagnostics.doors.includes("door:tall-closed-26:8:logic:468,180,26,300:pos:481,180:origin:0.5,0:box:459,180,45,300:orientation:vertical:rotation:0"), `Expected low-churn door diagnostics, got ${lowChurnDiagnostics.doors}`);
  assert(lowChurnDiagnostics.outlines.includes("floor-b:300,480:300x40:43f7ff:2:top:300-410;top:538-600;bottom:300-600"), `Expected low-churn merged floor outline diagnostics, got ${lowChurnDiagnostics.outlines}`);
  for (const id of [
    "left-wall-upper",
    "left-wall-lower",
    "right-wall",
    "thin-wall",
    "visible-glass-wall",
    "visible-cryo-wall",
    "visible-timber-wall",
    "rain-glass-optin-wall",
    "cryo-wall-decor-base",
    "timber-wall-decor-base"
  ]) {
    assert(!lowChurnDiagnostics.outlines.includes(`${id}:`), `Expected low-churn ${id} to omit all outline segments, got ${lowChurnDiagnostics.outlines}`);
  }
  assert(lowChurnDiagnostics.sensors.includes("echo-sensor:active-sensor:hidden:active"), `Expected low-churn hidden sensor diagnostics, got ${lowChurnDiagnostics.sensors}`);
  assert(lowChurnDiagnostics.hazards.includes("hazard-vent:qa-vent:0:"), `Expected low-churn hazard vent diagnostics, got ${lowChurnDiagnostics.hazards}`);
  assert(!lowChurnDiagnostics.sensors.includes(":9:"), `Low-churn hidden echo sensor diagnostics should not use door-open frame 9, got ${lowChurnDiagnostics.sensors}`);
  const lowChurnScreenshotBuffer = await page.screenshot({ path: lowChurnScreenshot, fullPage: true });
  const lowChurnFloorCyanSamples = sampleCyanOutlinePixels(lowChurnScreenshotBuffer, lowChurnDiagnostics.cameraWorldView, levelSolidsById.get("floor-b"), ["top"]);
  const lowChurnWallCyanSamples = ["thin-wall", "visible-glass-wall", "visible-cryo-wall", "visible-timber-wall"].map((id) =>
    sampleCyanOutlinePixels(lowChurnScreenshotBuffer, lowChurnDiagnostics.cameraWorldView, levelSolidsById.get(id), ["left", "right"], { outside: true, sampleRadius: 0 })
  );
  assertCyanOutlineSamples("low-churn", lowChurnFloorCyanSamples, lowChurnWallCyanSamples);
  lowChurnDiagnostics.floorCyanSamples = lowChurnFloorCyanSamples;
  lowChurnDiagnostics.wallCyanSamples = lowChurnWallCyanSamples;
  assertNoUnexpectedBrowserMessages("Low-churn render", lowChurnMessageStart);

  console.log(JSON.stringify({ ok: true, screenshot: fullGraphicsScreenshot, lowChurnScreenshot, diagnostics, lowChurnDiagnostics }, null, 2));
} finally {
  await browser.close();
}
