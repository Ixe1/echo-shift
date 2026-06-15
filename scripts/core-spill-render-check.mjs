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

const parseSpillFrameMap = (frames) => {
  const map = new Map();
  for (const frame of frames.split("|")) {
    const match = frame.match(/^spill:(.*):time-effects:\d+:spill:(-?\d+),(-?\d+)$/);
    if (!match) continue;
    map.set(match[1], { x: Number(match[2]), y: Number(match[3]) });
  }
  return map;
};

const parseRect = (value) => {
  const [x, y, w, h] = value.split(",").map(Number);
  return { x, y, w, h };
};

const countSpillFrames = (frames) =>
  frames
    .split("|")
    .filter((frame) => frame.includes(":spill:")).length;

const gameSceneDiagnosticKeys = [
  "echoShiftScoreEligible",
  "echoShiftMusicLoading",
  "echoShiftLevelIntro",
  "echoShiftDeathPresentation",
  "echoShiftCameraSample",
  "echoShiftCameraSnap",
  "echoShiftCameraWorldView",
  "echoShiftBackgroundKey",
  "echoShiftBackgroundRenderMode",
  "echoShiftBackgroundDetailLayer",
  "echoShiftBackgroundPieces",
  "echoShiftBackgroundAmbience",
  "echoShiftBackgroundPreload",
  "echoShiftRoomAssetFailure",
  "echoShiftBackgroundFilter",
  "echoShiftPerfStats",
  "echoShiftVisibleEchoTints",
  "echoShiftDroneStates",
  "echoShiftObjectAssetCount",
  "echoShiftSolidAssetFrames",
  "echoShiftTerrainDecorFrames",
  "echoShiftTerrainDecorPropFrames",
  "echoShiftTileAssetPhases",
  "echoShiftTileAssetOrigins",
  "echoShiftLaserAssetTransforms",
  "echoShiftLaserAssetPositions",
  "echoShiftDoorAssetTransforms",
  "echoShiftCoreSpriteFrames",
  "echoShiftCoreInvulnerabilityFrames",
  "echoShiftPlayerSpriteState",
  "echoShiftExitUnlocked",
  "echoShiftBossCheckpoint",
  "echoShiftPlayerRect",
  "echoShiftBossWeakSpotRects",
  "echoShiftEchoSensorAssetFrames",
  "echoShiftLaunchPadSpriteFrames",
  "echoShiftHazardVentSpriteFrames",
  "echoShiftMonsterSpriteFrames",
  "echoShiftBossSpriteFrames",
  "echoShiftBossEffectFrames",
  "echoShiftSolidOutlineRects",
  "echoShiftObjectAtlasFilter",
  "echoShiftLaunchPadFilter",
  "echoShiftMonsterAtlasFilter",
  "echoShiftBossAtlasFilter",
  "echoShiftTerrainTileFilter",
  "echoShiftTerrainDecorPropFilter"
];

const isAllowedBrowserMessage = (msg) =>
  msg.type === "warning" &&
  msg.text.includes("GL Driver Message") &&
  msg.text.includes("GPU stall due to ReadPixels");

const startAudioGate = async (page) => {
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").click();
};

const waitForLevelIntro = async (page, messages) => {
  try {
    await page.waitForFunction(
      () => {
        const phase = document.documentElement.dataset.echoShiftLevelIntro;
        return phase === "exiting" || phase === "idle";
      },
      null,
      { timeout: 12000 }
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      phase: document.documentElement.dataset.echoShiftLevelIntro || "",
      boot: document.documentElement.dataset.echoShiftBootLoading || "",
      music: document.documentElement.dataset.echoShiftMusicLoading || "",
      startGateVisible: Boolean(document.querySelector("[data-start-game]")),
      bodyText: document.body.textContent?.slice(0, 240) || ""
    }));
    throw new Error(`Timed out waiting for level intro: ${JSON.stringify(diagnostics)}; messages=${JSON.stringify(messages)}; ${error.message}`);
  }
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
    { id: "spill-core-e", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-f", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-g", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-h", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-i", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-j", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-k", x: 24, y: 438, w: 18, h: 18 },
    { id: "spill-core-l", x: 24, y: 438, w: 18, h: 18 },
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

const protectedLevel = {
  id: "protected-core-save-render-qa",
  index: 0,
  name: "Protected Core Save Render QA",
  subtitle: "Key core save presentation",
  motionModel: "anchored",
  start: { x: 24, y: 438 },
  exit: { x: 820, y: 438, w: 28, h: 38 },
  bounds: { x: 0, y: 0, w: 900, h: 540 },
  solids: [
    { id: "floor-a", x: 0, y: 480, w: 900, h: 40, sprite: "floor", tone: "steel" }
  ],
  doors: [{ id: "protected-door", x: 260, y: 400, w: 20, h: 80, requiresCore: "protected-large-key" }],
  plates: [],
  timedSwitches: [],
  lasers: [],
  movingLasers: [],
  drones: [],
  cores: [{ id: "protected-large-key", x: 24, y: 438, w: 24, h: 24, size: "large" }],
  hazards: [{ id: "protected-spark", x: 128, y: 436, w: 62, h: 38 }],
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

const bonusLifeAfterLossLevel = {
  id: "bonus-life-after-core-loss-render-qa",
  index: 0,
  name: "Bonus Life After Core Loss Render QA",
  subtitle: "Current carried cores drive lives",
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
  lasers: [{ id: "bonus-loss-laser", x: 430, y: 420, w: 16, h: 60, startsOn: true }],
  movingLasers: [],
  drones: [],
  cores: Array.from({ length: 29 }, (_, index) => ({ id: `bonus-before-loss-core-${index}`, x: 24, y: 438, w: 18, h: 18 })),
  hazards: [{ id: "bonus-loss-spark", x: 128, y: 436, w: 62, h: 38 }],
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

  const installDraft = async (draftLevel) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate((snapshot) => {
      window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
    }, { motionModel: "anchored", currentIndex: 0, levels: [draftLevel] });
  };

  const freezeAnimationFrames = async () => {
    await page.evaluate(() => {
      const lastAnimationFrameId = window.requestAnimationFrame(() => undefined);
      for (let id = 1; id <= lastAnimationFrameId; id += 1) window.cancelAnimationFrame(id);
    });
  };

  await installDraft(level);
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page, messages);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => {
      const playerSpriteState = document.documentElement.dataset.echoShiftPlayerSpriteState || "";
      const playerAlpha = Number((playerSpriteState.match(/alpha:([0-9.]+)/) || [])[1] || "1");
      const spillPositions = (document.documentElement.dataset.echoShiftCoreSpriteFrames || "")
        .split("|")
        .filter((frame) => frame.includes(":spill:"))
        .map((frame) => {
          const match = frame.match(/:spill:(-?\d+),(-?\d+)$/);
          return match ? Number(match[1]) : null;
        })
        .filter((x) => x !== null);
      const spillSpread = spillPositions.length > 1 ? Math.max(...spillPositions) - Math.min(...spillPositions) : 0;
      return (
        Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0") > 0 &&
        spillPositions.length >= 2 &&
        spillSpread >= 8 &&
        document.querySelector("[data-cores]")?.textContent?.trim() === "1" &&
        playerSpriteState.includes("visible:1") &&
        playerSpriteState.includes("tint:ffe35a") &&
        playerAlpha < 0.95
      );
    },
    null,
    { timeout: 7000 }
  );
  const flickerDiagnostics = await page.evaluate(() => ({
    invulnerabilityFrames: Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0"),
    playerSpriteState: document.documentElement.dataset.echoShiftPlayerSpriteState || ""
  }));
  const temporalStart = await page.evaluate(() => ({
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || "",
    playerRect: document.documentElement.dataset.echoShiftPlayerRect || ""
  }));
  await page.keyboard.up("ArrowRight");
  await page.waitForFunction(
    (initialFrames) => {
      const frames = document.documentElement.dataset.echoShiftCoreSpriteFrames || "";
      return frames !== initialFrames && frames.split("|").filter((frame) => frame.includes(":spill:")).length >= 2;
    },
    temporalStart.coreFrames,
    { timeout: 2500 }
  );
  const temporalEnd = await page.evaluate(() => ({
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || "",
    playerRect: document.documentElement.dataset.echoShiftPlayerRect || ""
  }));
  const temporalStartSpills = parseSpillFrameMap(temporalStart.coreFrames);
  const temporalEndSpills = parseSpillFrameMap(temporalEnd.coreFrames);
  const playerRect = parseRect(temporalStart.playerRect);
  const playerCenterX = playerRect.x + playerRect.w / 2;
  const commonSpillIds = [...temporalStartSpills.keys()].filter((id) => temporalEndSpills.has(id));
  const movingAwayOrBallistic = commonSpillIds.filter((id) => {
    const start = temporalStartSpills.get(id);
    const end = temporalEndSpills.get(id);
    const startDirection = Math.sign(start.x + 9 - playerCenterX);
    const horizontalAway = startDirection !== 0 && (end.x - start.x) * startDirection >= -0.5;
    const verticalArc = Math.abs(end.y - start.y) >= 1;
    return horizontalAway || verticalArc;
  });
  assert(commonSpillIds.length >= 2, `Expected temporal spill samples to share multiple sprite ids, got ${JSON.stringify({ temporalStart, temporalEnd })}`);
  assert(
    movingAwayOrBallistic.length > 0,
    `Expected spilled-core sprites to keep ballistic/non-magnetic motion over time, got ${JSON.stringify({ temporalStart, temporalEnd })}`
  );
  await freezeAnimationFrames();

  const spillDiagnostics = await page.evaluate(() => ({
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || "",
    invulnerabilityFrames: Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0"),
    hudCores: document.querySelector("[data-cores]")?.textContent?.trim() || "",
    toast: document.querySelector("[data-toast]")?.textContent?.trim() || "",
    tutorialHint: document.querySelector("[data-tutorial-hint]")?.textContent?.trim() || "",
    deathPresentation: document.documentElement.dataset.echoShiftDeathPresentation || "",
    playerSpriteState: document.documentElement.dataset.echoShiftPlayerSpriteState || "",
    canvas: {
      width: document.querySelector("canvas")?.clientWidth || 0,
      height: document.querySelector("canvas")?.clientHeight || 0
    }
  }));

  assert(spillDiagnostics.coreFrames.includes("spill:"), `Expected spilled core sprites in diagnostics, got ${spillDiagnostics.coreFrames}`);
  const spillPositions = spillDiagnostics.coreFrames
    .split("|")
    .filter((frame) => frame.includes(":spill:"))
    .map((frame) => {
      const match = frame.match(/:spill:(-?\d+),(-?\d+)$/);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    });
  assert(
    spillPositions.length >= 2 && spillPositions.every(Boolean),
    `Expected spilled core diagnostics to include positions, got ${spillDiagnostics.coreFrames}`
  );
  const xs = spillPositions.map((position) => position.x);
  assert(Math.max(...xs) - Math.min(...xs) >= 8, `Expected spilled core positions to visibly separate, got ${JSON.stringify(spillPositions)}`);
  assert(spillDiagnostics.invulnerabilityFrames > 0, `Expected active core-save invulnerability, got ${spillDiagnostics.invulnerabilityFrames}`);
  assert(spillDiagnostics.hudCores === "1", `Expected HUD to show only carried cores immediately after spill, got ${spillDiagnostics.hudCores}`);
  assert(!spillDiagnostics.hudCores.includes("/"), `HUD should not include map-total core count, got ${spillDiagnostics.hudCores}`);
  assert(!/scatter|scattered|spill|lost/i.test(spillDiagnostics.toast), `Expected no scattered-core toast, got ${spillDiagnostics.toast}`);
  assert(!/scatter|scattered|spill|lost/i.test(spillDiagnostics.tutorialHint), `Expected no scattered-core hint, got ${spillDiagnostics.tutorialHint}`);
  assert(spillDiagnostics.deathPresentation === "idle", `Core-save should not enter death presentation, got ${spillDiagnostics.deathPresentation}`);
  assert(
    /visible:1:alpha:0\.[0-9]+:tint:ffe35a/.test(flickerDiagnostics.playerSpriteState),
    `Expected player sprite flicker/tint during core-save invulnerability, got ${flickerDiagnostics.playerSpriteState}`
  );
  assert(
    spillDiagnostics.playerSpriteState.includes("visible:1") && spillDiagnostics.playerSpriteState.includes("tint:ffe35a"),
    `Expected frozen spill diagnostics to keep the invulnerability tint, got ${spillDiagnostics.playerSpriteState}`
  );
  assert(spillDiagnostics.canvas.width > 0 && spillDiagnostics.canvas.height > 0, `Expected visible canvas, got ${JSON.stringify(spillDiagnostics.canvas)}`);

  const screenshot = `${outDir}/core-spill-render-qa.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotDiagnostics = await page.evaluate(() => ({
    hudCores: document.querySelector("[data-cores]")?.textContent?.trim() || "",
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || "",
    invulnerabilityFrames: Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0"),
    playerSpriteState: document.documentElement.dataset.echoShiftPlayerSpriteState || ""
  }));
  await page.keyboard.up("ArrowRight");
  assert(screenshotDiagnostics.hudCores === "1", `Core-spill screenshot should capture asserted HUD state 1, got ${screenshotDiagnostics.hudCores}`);
  assert(screenshotDiagnostics.coreFrames.includes("spill:"), `Core-spill screenshot should capture visible spill sprite state, got ${screenshotDiagnostics.coreFrames}`);
  assert(
    screenshotDiagnostics.coreFrames === spillDiagnostics.coreFrames &&
      screenshotDiagnostics.playerSpriteState === spillDiagnostics.playerSpriteState &&
      screenshotDiagnostics.invulnerabilityFrames === spillDiagnostics.invulnerabilityFrames,
    `Core-spill screenshot diagnostics should be same-frame as asserted diagnostics, got ${JSON.stringify({ before: spillDiagnostics, screenshot: screenshotDiagnostics })}`
  );

  await installDraft(bonusLifeAfterLossLevel);
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page, messages);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.waitForFunction(
    () => document.querySelector("[data-cores]")?.textContent?.trim() === "29" && document.querySelector("[data-lives]")?.textContent?.trim() === "3",
    null,
    { timeout: 7000 }
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () =>
      Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0") > 0 &&
      Number(document.querySelector("[data-cores]")?.textContent?.trim() || "0") < 29 &&
      document.querySelector("[data-lives]")?.textContent?.trim() === "3",
    null,
    { timeout: 7000 }
  );
  const postLossDiagnostics = await page.evaluate(() => ({
    hudCores: Number(document.querySelector("[data-cores]")?.textContent?.trim() || "0"),
    lives: document.querySelector("[data-lives]")?.textContent?.trim() || "",
    toast: document.querySelector("[data-toast]")?.textContent?.trim() || "",
    spillFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || ""
  }));
  await page.waitForFunction(
    ({ postLossCoreCount, postLossSpillCount }) => {
      const cores = Number(document.querySelector("[data-cores]")?.textContent?.trim() || "0");
      const currentSpillCount = (document.documentElement.dataset.echoShiftCoreSpriteFrames || "")
        .split("|")
        .filter((frame) => frame.includes(":spill:")).length;
      return (
        cores > postLossCoreCount &&
        cores < 30 &&
        currentSpillCount < postLossSpillCount &&
        document.querySelector("[data-lives]")?.textContent?.trim() === "3"
      );
    },
    { postLossCoreCount: postLossDiagnostics.hudCores, postLossSpillCount: countSpillFrames(postLossDiagnostics.spillFrames) },
    { timeout: 9000 }
  );
  const postRecoveryBonusDiagnostics = await page.evaluate(() => ({
    hudCores: Number(document.querySelector("[data-cores]")?.textContent?.trim() || "0"),
    lives: document.querySelector("[data-lives]")?.textContent?.trim() || "",
    toast: document.querySelector("[data-toast]")?.textContent?.trim() || "",
    spillFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || ""
  }));
  assert(postLossDiagnostics.lives === "3", `Expected no bonus life immediately after core loss below threshold, got ${JSON.stringify(postLossDiagnostics)}`);
  assert(
    countSpillFrames(postLossDiagnostics.spillFrames) > countSpillFrames(postRecoveryBonusDiagnostics.spillFrames),
    `Expected below-threshold recovery to consume a spilled loose core, got ${JSON.stringify({ postLossDiagnostics, postRecoveryBonusDiagnostics })}`
  );
  assert(
    postRecoveryBonusDiagnostics.lives === "3" && postRecoveryBonusDiagnostics.hudCores > postLossDiagnostics.hudCores && postRecoveryBonusDiagnostics.hudCores < 30,
    `Expected collecting below-threshold cores after a spill not to award a stale bonus life, got ${JSON.stringify({ postLossDiagnostics, postRecoveryBonusDiagnostics })}`
  );
  assert(!/bonus life/i.test(postRecoveryBonusDiagnostics.toast), `Expected no stale bonus-life toast below 30 carried cores, got ${postRecoveryBonusDiagnostics.toast}`);
  await page.waitForFunction(
    () => ["fall", "fade-out", "dead", "respawn"].includes(document.documentElement.dataset.echoShiftDeathPresentation || ""),
    null,
    { timeout: 9000 }
  );
  await page.keyboard.up("ArrowRight");
  await page.waitForFunction(
    () => {
      const lives = document.querySelector("[data-lives]")?.textContent?.trim();
      const cores = document.querySelector("[data-cores]")?.textContent?.trim();
      const phase = document.documentElement.dataset.echoShiftLevelIntro || "";
      return lives === "2" && cores === "29" && (phase === "exiting" || phase === "idle");
    },
    null,
    { timeout: 12000 }
  );
  const postRespawnBonusDiagnostics = await page.evaluate(() => ({
    hudCores: Number(document.querySelector("[data-cores]")?.textContent?.trim() || "0"),
    lives: document.querySelector("[data-lives]")?.textContent?.trim() || "",
    toast: document.querySelector("[data-toast]")?.textContent?.trim() || "",
    deathPresentation: document.documentElement.dataset.echoShiftDeathPresentation || "",
    levelIntro: document.documentElement.dataset.echoShiftLevelIntro || ""
  }));
  assert(
    postRespawnBonusDiagnostics.lives === "2" && postRespawnBonusDiagnostics.hudCores === 29,
    `Expected death/respawn after below-threshold recovery to restore only start cores and spend one life, got ${JSON.stringify(postRespawnBonusDiagnostics)}`
  );
  assert(!/bonus life/i.test(postRespawnBonusDiagnostics.toast), `Expected no stale bonus-life toast after death/respawn below 30 carried cores, got ${postRespawnBonusDiagnostics.toast}`);

  await installDraft(protectedLevel);
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page, messages);
  await page.locator("canvas").click({ position: { x: 480, y: 280 } });
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => {
      const playerSpriteState = document.documentElement.dataset.echoShiftPlayerSpriteState || "";
      const playerAlpha = Number((playerSpriteState.match(/alpha:([0-9.]+)/) || [])[1] || "1");
      return (
        Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0") > 0 &&
        !(document.documentElement.dataset.echoShiftCoreSpriteFrames || "").includes("spill:") &&
        (document.documentElement.dataset.echoShiftDoorAssetTransforms || "").includes("door:protected-door:9") &&
        document.querySelector("[data-cores]")?.textContent?.trim() === "1" &&
        playerSpriteState.includes("visible:1") &&
        playerSpriteState.includes("tint:ffe35a") &&
        playerAlpha < 0.95
      );
    },
    null,
    { timeout: 7000 }
  );
  await freezeAnimationFrames();
  const protectedDiagnostics = await page.evaluate(() => ({
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || "",
    doors: document.documentElement.dataset.echoShiftDoorAssetTransforms || "",
    invulnerabilityFrames: Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0"),
    hudCores: document.querySelector("[data-cores]")?.textContent?.trim() || "",
    toast: document.querySelector("[data-toast]")?.textContent?.trim() || "",
    tutorialHint: document.querySelector("[data-tutorial-hint]")?.textContent?.trim() || "",
    deathPresentation: document.documentElement.dataset.echoShiftDeathPresentation || "",
    playerSpriteState: document.documentElement.dataset.echoShiftPlayerSpriteState || ""
  }));

  assert(!protectedDiagnostics.coreFrames.includes("spill:"), `Protected key-core save should not create spill sprites, got ${protectedDiagnostics.coreFrames}`);
  assert(protectedDiagnostics.doors.includes("door:protected-door:9"), `Protected key-core should keep required door open, got ${protectedDiagnostics.doors}`);
  assert(protectedDiagnostics.invulnerabilityFrames > 0, `Expected protected save invulnerability, got ${protectedDiagnostics.invulnerabilityFrames}`);
  assert(protectedDiagnostics.hudCores === "1", `Protected key-core save should keep carried HUD at 1, got ${protectedDiagnostics.hudCores}`);
  assert(!protectedDiagnostics.hudCores.includes("/"), `Protected key-core HUD should not include map-total count, got ${protectedDiagnostics.hudCores}`);
  assert(!/scatter|scattered|spill|lost/i.test(protectedDiagnostics.toast), `Expected no protected-save scatter toast, got ${protectedDiagnostics.toast}`);
  assert(!/scatter|scattered|spill|lost/i.test(protectedDiagnostics.tutorialHint), `Expected no protected-save scatter hint, got ${protectedDiagnostics.tutorialHint}`);
  assert(protectedDiagnostics.deathPresentation === "idle", `Protected save should not enter death presentation, got ${protectedDiagnostics.deathPresentation}`);
  assert(
    /visible:1:alpha:0\.[0-9]+:tint:ffe35a/.test(protectedDiagnostics.playerSpriteState),
    `Expected protected-save player sprite flicker/tint during invulnerability, got ${protectedDiagnostics.playerSpriteState}`
  );

  const protectedScreenshot = `${outDir}/protected-core-save-render-qa.png`;
  await page.screenshot({ path: protectedScreenshot, fullPage: true });
  const protectedScreenshotDiagnostics = await page.evaluate(() => ({
    hudCores: document.querySelector("[data-cores]")?.textContent?.trim() || "",
    coreFrames: document.documentElement.dataset.echoShiftCoreSpriteFrames || "",
    invulnerabilityFrames: Number(document.documentElement.dataset.echoShiftCoreInvulnerabilityFrames || "0"),
    playerSpriteState: document.documentElement.dataset.echoShiftPlayerSpriteState || ""
  }));
  await page.keyboard.up("ArrowRight");
  assert(protectedScreenshotDiagnostics.hudCores === "1", `Protected-save screenshot should capture asserted HUD state 1, got ${protectedScreenshotDiagnostics.hudCores}`);
  assert(!protectedScreenshotDiagnostics.coreFrames.includes("spill:"), `Protected-save screenshot should capture no-spill state, got ${protectedScreenshotDiagnostics.coreFrames}`);
  assert(
    protectedScreenshotDiagnostics.coreFrames === protectedDiagnostics.coreFrames &&
      protectedScreenshotDiagnostics.playerSpriteState === protectedDiagnostics.playerSpriteState &&
      protectedScreenshotDiagnostics.invulnerabilityFrames === protectedDiagnostics.invulnerabilityFrames,
    `Protected-save screenshot diagnostics should be same-frame as asserted diagnostics, got ${JSON.stringify({ before: protectedDiagnostics, screenshot: protectedScreenshotDiagnostics })}`
  );

  await installDraft(protectedLevel);
  await page.goto(`${url}?playtestDraft=1&level=0&diagnostics=1&fullGraphics=1`, { waitUntil: "networkidle" });
  await startAudioGate(page);
  await page.locator("canvas").waitFor({ state: "visible" });
  await waitForLevelIntro(page, messages);
  await page.locator("[data-menu]").waitFor({ state: "visible", timeout: 7000 });
  await page.locator("[data-menu]").click();
  await page.locator("[data-exit-menu]").click({ force: true });
  await page.locator("[data-play]").waitFor({ state: "visible", timeout: 7000 });
  const staleSceneDiagnostics = await page.evaluate((keys) => {
    const { dataset } = document.documentElement;
    return keys
      .filter((key) => dataset[key] !== undefined)
      .map((key) => `${key}:${dataset[key]}`);
  }, gameSceneDiagnosticKeys);
  assert(staleSceneDiagnostics.length === 0, `Expected GameScene diagnostics to clear after returning to menu, got ${JSON.stringify(staleSceneDiagnostics)}`);

  const unexpectedMessages = messages.filter((msg) => !isAllowedBrowserMessage(msg));
  assert(unexpectedMessages.length === 0, `Core spill render console/page messages: ${JSON.stringify(unexpectedMessages)}`);

  writeFileSync(
    `${outDir}/core-spill-render-qa.json`,
    JSON.stringify(
      {
        diagnostics: spillDiagnostics,
        flickerDiagnostics,
        screenshotDiagnostics,
        postLossDiagnostics,
        postRecoveryBonusDiagnostics,
        postRespawnBonusDiagnostics,
        protectedDiagnostics,
        protectedScreenshotDiagnostics,
        messages
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        screenshot,
        protectedScreenshot,
        diagnostics: spillDiagnostics,
        flickerDiagnostics,
        screenshotDiagnostics,
        postLossDiagnostics,
        postRecoveryBonusDiagnostics,
        postRespawnBonusDiagnostics,
        protectedDiagnostics,
        protectedScreenshotDiagnostics
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
