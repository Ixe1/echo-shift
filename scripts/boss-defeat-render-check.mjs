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
      return frames.includes("cryo-floor-ice:");
    },
    null,
    { timeout: 9000 }
  );

  const raw = await page.evaluate(() => document.documentElement.dataset.echoShiftBossEffectFrames || "");
  const match = raw.match(/cryo-floor-ice:([^|]+)/);
  const screenshot = `${outDir}/cryo-floor-ice-visible.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  return { diagnostic: match?.[0] || raw, screenshot };
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
	  await page.keyboard.down("ArrowRight");
	  await page.waitForTimeout(730);
	  await page.keyboard.up("ArrowRight");
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

  const raw = await page.evaluate(() => document.documentElement.dataset.echoShiftBossEffectFrames || "");
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
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(730);
  await page.keyboard.up("ArrowRight");
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
  const roundTwoScreenshot = `${outDir}/archive-round-two-warning.png`;
  await page.screenshot({ path: roundTwoScreenshot, fullPage: true });
  return { diagnostic: raw, screenshot, roundTwoWarning, roundTwoScreenshot };
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
  await alignPlayerWithBossWeakSpot(page, "render-boss", 1800, { stopOnVulnerable: true }).catch(() => undefined);
  await page.waitForFunction(
    () => {
      const frames = document.documentElement.dataset.echoShiftBossSpriteFrames || "";
      return frames.includes("render-boss:") && frames.includes(":active:vulnerable");
    },
    null,
    { timeout: 10000 }
  );

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
	  const spriteWidth = await readBossSpriteWidth(page);
	  assert(mid.x > early.x + 60, `Expected departing boss to move right, got early ${JSON.stringify(early)} and mid ${JSON.stringify(mid)}`);

  await page.waitForFunction(
    () => {
      const effects = document.documentElement.dataset.echoShiftBossEffectFrames || "";
      const match = effects.match(/render-boss:defeat-depart:(\d+)\/(\d+):bursts=(\d+):x=(-?\d+)/);
      return match && Number(match[1]) >= 160;
    },
    null,
    { timeout: 3500 }
	  );
	  const late = await readDepartureEffect(page);
	  const camera = await readCameraWorldView(page);
	  const spriteLeft = late.x - spriteWidth / 6;
  assert(
    spriteLeft > camera.x + camera.w,
    `Expected departing boss sprite to be off the right side of the camera before portal unlock, got ${JSON.stringify({ late, camera, spriteWidth, spriteLeft })}`
  );

  await page.waitForFunction(() => document.documentElement.dataset.echoShiftExitUnlocked === "true", null, { timeout: 5000 });
  const finalSprites = await page.evaluate(() => document.documentElement.dataset.echoShiftBossSpriteFrames || "");
  assert(!finalSprites.includes(":departing:"), `Expected boss sprite to stop rendering after departure, got ${finalSprites}`);
  const portalScreenshot = `${outDir}/boss-defeat-portal-unlocked.png`;
  await page.screenshot({ path: portalScreenshot, fullPage: true });

  const cameraFollow = await verifyBossCameraFollowsPlayer(page);
  const archiveAttack = await verifyArchiveAttackRender(page);
  const cryoFloorIce = await verifyCryoFloorIceRender(page);

  const unexpectedMessages = messages.filter((msg) => !isAllowedBrowserMessage(msg));
  assert(unexpectedMessages.length === 0, `Unexpected console/page messages: ${JSON.stringify(unexpectedMessages)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        departure: { early, mid, late, camera, spriteWidth },
        cameraFollow,
        archiveAttack,
        cryoFloorIce,
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
