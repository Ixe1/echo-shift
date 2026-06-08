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
      return !document.querySelector("[data-level-intro='active']") && (phase === "exiting" || phase === "idle");
    },
    null,
    { timeout: 12000 }
  );
};

const readDepartureEffect = async (page) =>
  page.evaluate(() => {
    const raw = document.documentElement.dataset.echoShiftBossEffectFrames || "";
    const match = raw.match(/render-boss:defeat-depart:(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
    return match
      ? {
          raw,
          frame: Number(match[1]),
          total: Number(match[2]),
          bursts: Number(match[3]),
          x: Number(match[4])
        }
      : { raw, frame: 0, total: 0, bursts: 0, x: 0 };
  });

const draftLevel = {
  id: "boss-defeat-render-qa",
  index: 0,
  name: "Boss Defeat Render QA",
  subtitle: "Render checks",
  motionModel: "anchored",
  start: { x: 220, y: 226 },
  exit: { x: 760, y: 222, w: 32, h: 38 },
  bounds: { x: 0, y: 0, w: 860, h: 320 },
  solids: [
    { id: "floor", x: 0, y: 260, w: 860, h: 60, sprite: "floor", tone: "steel" },
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
      id: "render-boss",
      kind: "archive-custodian",
      x: 80,
      y: 90,
      w: 360,
      h: 160,
      entrySide: "center",
      weakSpot: "bottom",
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
  }, { motionModel: "anchored", currentIndex: 0, levels: [draftLevel] });

  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(() => (document.querySelector("[data-level]")?.textContent || "").includes("Boss Defeat Render QA"));

  await page.waitForFunction(
    () => {
      const frames = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return frames.includes("render-boss:") && frames.includes(":active:vulnerable");
    },
    null,
    { timeout: 9000 }
  );

  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const sprites = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return effects.includes("render-boss:defeat-depart") && sprites.includes(":departing:");
    },
    null,
    { timeout: 2000 }
  );
  await page.keyboard.up("Space");

  const early = await readDepartureEffect(page);
  assert(early.total === 170, `Expected 170-frame boss departure diagnostic, got ${JSON.stringify(early)}`);
  assert(early.bursts > 0, `Expected active defeat overlay bursts early in departure, got ${JSON.stringify(early)}`);
  assert(
    (await page.evaluate(() => document.documentElement.dataset.echoShiftExitUnlocked || "")) === "false",
    "Expected exit portal to remain hidden while boss departure starts"
  );

  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const match = effects.match(/render-boss:defeat-depart:(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
      return match && Number(match[1]) >= 24 && Number(match[3]) > 0;
    },
    null,
    { timeout: 2000 }
  );
  const departureScreenshot = `${outDir}/boss-defeat-departure.png`;
  await page.screenshot({ path: departureScreenshot, fullPage: true });

  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const match = effects.match(/render-boss:defeat-depart:(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
      return match && Number(match[1]) >= 80 && Number(match[3]) > 0;
    },
    null,
    { timeout: 3500 }
  );
  const mid = await readDepartureEffect(page);
  assert(mid.x > early.x + 60, `Expected departing boss to move right, got early ${JSON.stringify(early)} and mid ${JSON.stringify(mid)}`);

  await page.waitForFunction(() => document.documentElement.dataset.echoShiftExitUnlocked === "true", null, { timeout: 5000 });
  const finalSprites = await page.evaluate(() => document.documentElement.dataset.echoShiftBossSpriteFrames || "");
  assert(!finalSprites.includes(":departing:"), `Expected boss sprite to stop rendering after departure, got ${finalSprites}`);
  const portalScreenshot = `${outDir}/boss-defeat-portal-unlocked.png`;
  await page.screenshot({ path: portalScreenshot, fullPage: true });

  const unexpectedMessages = messages.filter((msg) => !isAllowedBrowserMessage(msg));
  assert(unexpectedMessages.length === 0, `Unexpected console/page messages: ${JSON.stringify(unexpectedMessages)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        departure: { early, mid },
        screenshots: {
          departure: departureScreenshot,
          portal: portalScreenshot
        }
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
