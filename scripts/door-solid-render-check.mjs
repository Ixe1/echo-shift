import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

const startAudioGate = async (page) => {
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").click();
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
    { id: "tall-open-28", x: 708, y: 180, w: 28, h: 300 }
  ],
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

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [level] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForTimeout(900);

  const diagnostics = await page.evaluate(() => ({
    doors: document.documentElement.dataset.echoShiftDoorAssetTransforms || "",
    solids: document.documentElement.dataset.echoShiftSolidAssetFrames || "",
    outlines: document.documentElement.dataset.echoShiftSolidOutlineRects || "",
    sensors: document.documentElement.dataset.echoShiftEchoSensorAssetFrames || "",
    objectCount: Number(document.documentElement.dataset.echoShiftObjectAssetCount || "0"),
    background: document.documentElement.dataset.echoShiftBackgroundKey || "",
    canvas: {
      width: document.querySelector("canvas")?.clientWidth || 0,
      height: document.querySelector("canvas")?.clientHeight || 0
    }
  }));

  const doorEntries = diagnostics.doors.split("|").filter(Boolean);
  const parseDoorEntry = (entry) => {
    const match = entry.match(/^door:([^:]+):(\d+):logic:([\d-]+),([\d-]+),([\d-]+),([\d-]+):pos:([\d-]+),([\d-]+):origin:([.\d-]+),([.\d-]+):box:([\d-]+),([\d-]+),([\d-]+),([\d-]+)$/);
    assert(match, `Malformed door diagnostic entry: ${entry}`);
    return {
      id: match[1],
      frame: Number(match[2]),
      logic: [Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])],
      pos: [Number(match[7]), Number(match[8])],
      origin: [Number(match[9]), Number(match[10])],
      box: [Number(match[11]), Number(match[12]), Number(match[13]), Number(match[14])]
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
    assert(JSON.stringify(door.origin) === JSON.stringify([0.5, 0]), `Expected ${id} origin 0.5,0, got ${door.origin}`);
    assert(JSON.stringify(door.box) === JSON.stringify(expected.box), `Expected ${id} render box ${expected.box}, got ${door.box}`);
  };

  assert(doorEntries.length === 8, `Expected 8 door diagnostic entries, got ${doorEntries.length}: ${diagnostics.doors}`);
  assertDoor("closed-a", { frame: 8, logic: [145, 400, 20, 80], pos: [155, 400], box: [138, 400, 34, 80] });
  assertDoor("closed-b", { frame: 8, logic: [218, 393, 20, 80], pos: [228, 393], box: [211, 393, 34, 80] });
  assertDoor("open-a", { frame: 9, logic: [305, 400, 20, 80], pos: [315, 400], box: [298, 400, 34, 80] });
  assertDoor("open-b", { frame: 9, logic: [378, 393, 20, 80], pos: [388, 393], box: [371, 393, 34, 80] });
  assertDoor("tall-closed-26", { frame: 8, logic: [468, 180, 26, 300], pos: [481, 180], box: [459, 180, 45, 300] });
  assertDoor("tall-open-26", { frame: 9, logic: [548, 180, 26, 300], pos: [561, 180], box: [539, 180, 45, 300] });
  assertDoor("tall-closed-28", { frame: 8, logic: [628, 180, 28, 300], pos: [642, 180], box: [618, 180, 48, 300] });
  assertDoor("tall-open-28", { frame: 9, logic: [708, 180, 28, 300], pos: [722, 180], box: [698, 180, 48, 300] });

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
  assert(diagnostics.solids.includes("thin-wall:1"), `Expected wall atlas frame diagnostic, got ${diagnostics.solids}`);
  assert(diagnostics.solids.includes("enclosed-center:2"), `Expected enclosed center block frame diagnostic, got ${diagnostics.solids}`);
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
  assert(diagnostics.sensors.includes("echo-sensor:active-sensor:11:active"), `Expected active echo sensor to use active plate frame, got ${diagnostics.sensors}`);
  assert(diagnostics.sensors.includes("echo-sensor:inactive-sensor:2:inactive"), `Expected inactive echo sensor to use block frame, got ${diagnostics.sensors}`);
  assert(!diagnostics.sensors.includes(":9:"), `Echo sensor diagnostics should not use door-open frame 9, got ${diagnostics.sensors}`);
  assert(diagnostics.objectCount >= 25, `Expected synced object sprites, got ${diagnostics.objectCount}`);
  assert(messages.every((msg) => !msg.text.includes("Error")), `Console/page errors: ${JSON.stringify(messages)}`);

  const fullGraphicsScreenshot = `${outDir}/door-solid-render-qa.png`;
  const lowChurnScreenshot = `${outDir}/door-solid-render-low-churn-qa.png`;
  await page.screenshot({ path: fullGraphicsScreenshot, fullPage: true });
  writeFileSync(`${outDir}/door-solid-render-qa.json`, JSON.stringify({ diagnostics, messages }, null, 2));

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&lowChurnGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForTimeout(900);
  const lowChurnDiagnostics = await page.evaluate(() => ({
    doors: document.documentElement.dataset.echoShiftDoorAssetTransforms || "",
    outlines: document.documentElement.dataset.echoShiftSolidOutlineRects || "",
    sensors: document.documentElement.dataset.echoShiftEchoSensorAssetFrames || ""
  }));
  assert(lowChurnDiagnostics.doors.includes("door:tall-closed-26:8:logic:468,180,26,300:pos:481,180:origin:0.5,0:box:459,180,45,300"), `Expected low-churn door diagnostics, got ${lowChurnDiagnostics.doors}`);
  assert(lowChurnDiagnostics.outlines.includes("floor-b:300,480:300x40:43f7ff:2:top:300-410;top:538-600;bottom:300-600"), `Expected low-churn merged floor outline diagnostics, got ${lowChurnDiagnostics.outlines}`);
  assert(lowChurnDiagnostics.sensors.includes("echo-sensor:active-sensor:11:active"), `Expected low-churn sensor diagnostics, got ${lowChurnDiagnostics.sensors}`);
  assert(!lowChurnDiagnostics.sensors.includes(":9:"), `Low-churn echo sensor diagnostics should not use door-open frame 9, got ${lowChurnDiagnostics.sensors}`);
  await page.screenshot({ path: lowChurnScreenshot, fullPage: true });

  console.log(JSON.stringify({ ok: true, screenshot: fullGraphicsScreenshot, lowChurnScreenshot, diagnostics }, null, 2));
} finally {
  await browser.close();
}
