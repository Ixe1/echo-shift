import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.PLAYTEST_URL || "http://localhost:5173/";
const outDir = process.env.PLAYTEST_OUT || "/tmp/echo-shift-core-spill-qa";
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

const level = {
  id: "core-spill-render-qa",
  index: 0,
  name: "Core Spill Render QA",
  subtitle: "Spill presentation and HUD",
  motionModel: "anchored",
  start: { x: 24, y: 438 },
  exit: { x: 820, y: 438, w: 28, h: 38 },
  bounds: { x: 0, y: 0, w: 900, h: 540 },
  solids: [
    { id: "floor-a", x: 0, y: 480, w: 900, h: 40, sprite: "floor", tone: "steel" }
  ],
  doors: [],
  plates: [],
  timedSwitches: [],
  lasers: [],
  movingLasers: [],
  drones: [],
  cores: [
    { id: "spill-core-a", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-b", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-c", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-d", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-large-key", x: 24, y: 438, w: 24, h: 24, size: "large" }
  ],
  hazards: [{ id: "spill-spark", x: 128, y: 436, w: 62, h: 38 }],
  crates: [],
  monsters: [],
  platforms: [],
  oneWays: [],
  conveyors: [],
  launchPads: [],
  echoSensors: [],
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

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, { motionModel: "anchored", currentIndex: 0, levels: [level] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () =>
      Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0") > 0 &&
      (document.documentElement.dataset.echoShiftCoreSpriteFrames || "").includes("spill:") &&
      document.querySelector("[data-cores]")?.textContent?.trim() === "1",
    null,
    { timeout: 7000 }
  );

  const spillDiagnostics = await page.evaluate(() => ({
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || "",
    invulnerabilityFrames: Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0"),
    hudCores: document.querySelector("[data-cores]")?.textContent?.trim() || "",
    toast: document.querySelector("[data-toast]")?.textContent?.trim() || "",
    tutorialHint: document.querySelector("[data-tutorial-hint]")?.textContent?.trim() || "",
    deathPresentation: document.documentElement.dataset.echoShiftDeathPresentation || "",
    canvas: {
      width: document.querySelector("canvas")?.clientWidth || 0,
      height: document.querySelector("canvas")?.clientHeight || 0
    }
  }));
  await page.keyboard.up("ArrowRight");

  assert(spillDiagnostics.coreFrames.includes("spill:"), `Expected spilled core sprites in diagnostics, got ${spillDiagnostics.coreFrames}`);
  assert(spillDiagnostics.invulnerabilityFrames > 0, `Expected active core-save invulnerability, got ${spillDiagnostics.invulnerabilityFrames}`);
  assert(spillDiagnostics.hudCores === "1", `Expected HUD to show only carried cores immediately after spill, got ${spillDiagnostics.hudCores}`);
  assert(!spillDiagnostics.hudCores.includes("/"), `HUD should not include map-total core count, got ${spillDiagnostics.hudCores}`);
  assert(!/scatter|scattered|spill|lost/i.test(spillDiagnostics.toast), `Expected no scattered-core toast, got ${spillDiagnostics.toast}`);
  assert(!/scatter|scattered|spill|lost/i.test(spillDiagnostics.tutorialHint), `Expected no scattered-core hint, got ${spillDiagnostics.tutorialHint}`);
  assert(spillDiagnostics.deathPresentation === "idle", `Core-save should not enter death presentation, got ${spillDiagnostics.deathPresentation}`);
  assert(spillDiagnostics.canvas.width > 0 && spillDiagnostics.canvas.height > 0, `Expected visible canvas, got ${JSON.stringify(spillDiagnostics.canvas)}`);

  const unexpectedMessages = messages.filter((msg) => !isAllowedBrowserMessage(msg));
  assert(unexpectedMessages.length === 0, `Core spill render console/page messages: ${JSON.stringify(unexpectedMessages)}`);

  const screenshot = `${outDir}/core-spill-render-qa.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotDiagnostics = await page.evaluate(() => ({
    hudCores: document.querySelector("[data-cores]")?.textContent?.trim() || "",
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || ""
  }));
  writeFileSync(
    `${outDir}/core-spill-render-qa.json`,
    JSON.stringify({ diagnostics: spillDiagnostics, screenshotDiagnostics, messages }, null, 2)
  );
  console.log(JSON.stringify({ ok: true, screenshot, diagnostics: spillDiagnostics, screenshotDiagnostics }, null, 2));
} finally {
  await browser.close();
}
