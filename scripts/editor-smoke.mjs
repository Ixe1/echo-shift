import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright";

const outDir = process.env.EDITOR_QA_OUT || "/tmp/echo-shift-editor-smoke";
const browserPath =
  process.env.CHROME_PATH ||
  (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

mkdirSync(outDir, { recursive: true });

const launchOptions = {
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
};

if (browserPath) {
  launchOptions.executablePath = browserPath;
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const objectKinds = [
  "solids",
  "oneWays",
  "conveyors",
  "platforms",
  "hazards",
  "launchPads",
  "plates",
  "timedSwitches",
  "echoSensors",
  "doors",
  "lasers",
  "movingLasers",
  "cores",
  "drones",
  "crates",
  "monsters",
  "bosses"
];

const messages = [];
const isAllowedBrowserMessage = (msg) =>
  msg.type === "warning" &&
  msg.text.includes("GL Driver Message") &&
  msg.text.includes("GPU stall due to ReadPixels");

const collectConsole = (page) => {
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      messages.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (error) => messages.push({ type: "pageerror", text: error.message }));
};

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

const dispatchChange = async (locator) => {
  await locator.evaluate((element) => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const openTab = async (page, tab) => {
  await page.locator(`[data-editor-tab='${tab}']`).click();
};

const setObjectField = async (page, field, value) => {
  const locator = page.locator(`[data-object-field='${field}']`);
  await locator.fill(String(value));
  await dispatchChange(locator);
};

const objectNumber = async (page, field) => Number(await page.locator(`[data-object-field='${field}']`).inputValue());

const editorView = async (page) => {
  const raw = await page.locator("[data-editor-canvas]").getAttribute("data-editor-view");
  assert(raw, "Editor canvas did not expose view data");
  return JSON.parse(raw);
};

const validationStatusAllowingWarnings = async (page) => {
  const locator = page.locator("[data-validation]");
  const status = await locator.getAttribute("data-editor-validation");
  const text = (await locator.textContent()) ?? "";
  if (text.toLowerCase().includes("error")) {
    return "issues";
  }
  const allowedWarningText = "warningFrostcap Echo Rush:boss-1 is outside level bounds.";
  return status === "clean" || text === allowedWarningText ? "clean" : status;
};

const worldToScreen = async (page, point) => {
  const canvas = page.locator("[data-editor-canvas]");
  const box = await canvas.boundingBox();
  assert(box, "Editor canvas has no bounding box");
  const view = await editorView(page);
  return {
    x: box.x + (point.x - view.x) * view.w,
    y: box.y + (point.y - view.y) * view.w
  };
};

const clickWorld = async (page, point) => {
  const screen = await worldToScreen(page, point);
  await page.mouse.click(screen.x, screen.y);
};

const dragWorld = async (page, start, end) => {
  const startScreen = await worldToScreen(page, start);
  const endScreen = await worldToScreen(page, end);
  await page.mouse.move(startScreen.x, startScreen.y);
  await page.mouse.down();
  await page.mouse.move(endScreen.x, endScreen.y);
  await page.mouse.up();
};

const panWorldWithAlt = async (page, start, end) => {
  await page.keyboard.down("Alt");
  try {
    await dragWorld(page, start, end);
  } finally {
    await page.keyboard.up("Alt");
  }
};

const dragToolToWorld = async (page, tool, point) => {
  await page.evaluate(({ toolName, worldPoint }) => {
    const canvas = document.querySelector("[data-editor-canvas]");
    const source = document.querySelector(`[data-tool='${toolName}']`);
    if (!(canvas instanceof HTMLCanvasElement) || !(source instanceof HTMLElement)) {
      throw new Error(`Missing drag source or canvas for ${toolName}`);
    }
    const view = JSON.parse(canvas.dataset.editorView || "{}");
    const canvasRect = canvas.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const clientX = canvasRect.left + (worldPoint.x - view.x) * view.w;
    const clientY = canvasRect.top + (worldPoint.y - view.y) * view.w;
    const dataTransfer = new DataTransfer();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      dataTransfer
    };

    source.dispatchEvent(
      new DragEvent("dragstart", {
        ...eventInit,
        clientX: sourceRect.left + sourceRect.width / 2,
        clientY: sourceRect.top + sourceRect.height / 2
      })
    );
    canvas.dispatchEvent(new DragEvent("dragover", { ...eventInit, clientX, clientY }));
    canvas.dispatchEvent(new DragEvent("drop", { ...eventInit, clientX, clientY }));
    source.dispatchEvent(new DragEvent("dragend", { ...eventInit, clientX, clientY }));
  }, {
    toolName: tool,
    worldPoint: point
  });
};

const server = await createServer({
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: Number(process.env.EDITOR_QA_PORT || 5187),
    strictPort: false
  }
});

await server.listen();
const url = server.resolvedUrls?.local?.[0] || "http://127.0.0.1:5173/";
const browser = await chromium.launch(launchOptions);

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.addInitScript(() => window.localStorage.clear());
  const page = await desktop.newPage();
  collectConsole(page);
  await page.goto(`${url}?editor=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(page);
  await page.locator("[data-play]").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute("data-play"));
  await page.keyboard.press("ArrowDown");
  const mainMenuFocusAfterArrow = await page.evaluate(() => document.activeElement?.textContent?.trim() || "");
  await page.locator("[data-options]").click();
  await page.locator("[data-options-audio]").click();
  await page.keyboard.press("Escape");
  const menuOptionsNestedBackTitle = await page.locator(".options-panel h1").textContent();
  await page.keyboard.press("Escape");
  await page.locator("[data-play]").waitFor({ state: "visible" });
  const menuOptionsRootBackTitle = await page.locator(".menu-panel h1").textContent();
  const inactiveEditorVisible = await page.locator("[data-level-editor]").isVisible();
  const lockedEditorVisible = await page.locator("[data-editor]").isVisible();
  const lockedLevelSelectVisible = await page.locator("[data-levels]").isVisible();
  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "r"]) {
    await page.keyboard.press(key);
  }
  await page.locator("[data-editor]").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.documentElement.dataset.echoShiftAudioEffects?.includes("play:extraLife"));
  await page.waitForFunction(() => document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute("data-levels"));
  const secretUnlockAudioEffects = await page.evaluate(() => document.documentElement.dataset.echoShiftAudioEffects);
  const secretUnlockStatusText = await page.locator("[data-secret-status]").textContent();
  const secretUnlockFocusText = await page.evaluate(() => document.activeElement?.textContent?.trim() || "");
  const secretEditorVisible = await page.locator("[data-editor]").isVisible();
  const secretLevelSelectVisible = await page.locator("[data-levels]").isVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await startAudioGate(page);
  await page.locator("[data-play]").waitFor({ state: "visible" });
  const reloadedEditorVisible = await page.locator("[data-editor]").isVisible();
  const reloadedLevelSelectVisible = await page.locator("[data-levels]").isVisible();
  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "r"]) {
    await page.keyboard.press(key);
  }
  await page.locator("[data-editor]").waitFor({ state: "visible" });
  await page.locator("[data-levels]").click();
  await page.locator(".level-button[data-level='0']").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement instanceof HTMLElement && document.activeElement.matches(".level-button[data-level='0']"));
  await page.keyboard.press("ArrowDown");
  const levelSelectFocusAfterArrow = await page.evaluate(() => document.activeElement?.textContent?.trim() || "");
  await page.keyboard.press("Escape");
  await page.locator("[data-play]").waitFor({ state: "visible" });
  await page.locator("[data-editor]").click();
  await page.locator("[data-level-editor]").waitFor({ state: "visible" });
  const menuEditorUrl = page.url();

  const barePlaytestContext = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await barePlaytestContext.addInitScript(() => window.localStorage.clear());
  const barePlaytestPage = await barePlaytestContext.newPage();
  collectConsole(barePlaytestPage);
  await barePlaytestPage.goto(`${url}?playtestDraft=1`, { waitUntil: "domcontentloaded" });
  await startAudioGate(barePlaytestPage);
  await barePlaytestPage.locator("[data-play]").waitFor({ state: "visible" });
  const barePlaytestEditorVisible = await barePlaytestPage.locator("[data-editor]").isVisible();
  const barePlaytestLevelSelectVisible = await barePlaytestPage.locator("[data-levels]").isVisible();
  await barePlaytestContext.close();

  const scoreEntryContext = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await scoreEntryContext.addInitScript(() => window.localStorage.clear());
  const scoreEntryPage = await scoreEntryContext.newPage();
  collectConsole(scoreEntryPage);
  await scoreEntryPage.goto(`${url}?editor=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(scoreEntryPage);
  await scoreEntryPage.locator("[data-play]").waitFor({ state: "visible" });
  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "r"]) {
    await scoreEntryPage.keyboard.press(key);
  }
  await scoreEntryPage.locator("[data-tutorial]").click();
  await scoreEntryPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  const tutorialScoreEligible = await scoreEntryPage.evaluate(() => document.documentElement.dataset.echoShiftScoreEligible);
  await scoreEntryPage.goto(`${url}?editor=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(scoreEntryPage);
  await scoreEntryPage.locator("[data-play]").waitFor({ state: "visible" });
  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "r"]) {
    await scoreEntryPage.keyboard.press(key);
  }
  await scoreEntryPage.locator("[data-levels]").click();
  await scoreEntryPage.locator(".level-button[data-level='0']").click();
  await scoreEntryPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  const levelSelectScoreEligible = await scoreEntryPage.evaluate(() => document.documentElement.dataset.echoShiftScoreEligible);
  const practicePropagationResult = await scoreEntryPage.evaluate(async () => {
    const { GameScene } = await import("/src/scenes/GameScene.ts");
    const scene = Object.create(GameScene.prototype);
    let started = null;
    Object.assign(scene, {
      tutorialMode: false,
      levelIndex: 0,
      scoreEligible: false,
      stopBossDefeatLoops: () => {},
      scene: {
        start: (key, data) => {
          started = { key, data };
        }
      }
    });
    scene.nextLevel();
    return started;
  });
  const gameplayGamepadResult = await scoreEntryPage.evaluate(async () => {
    const { GameScene } = await import("/src/scenes/GameScene.ts");
    const scene = Object.create(GameScene.prototype);
    let pauseCount = 0;
    let rewindCount = 0;
    let axisX = 0;
    let button0 = false;
    let button2 = false;
    let button9 = false;
    Object.assign(scene, {
      gamepadInput: { left: false, right: false, jump: false },
      heldGamepadActions: new Set(),
      gamepadGameplayNeedsNeutral: false,
      gamepadActionsNeedNeutral: false,
      pausedByHud: false,
      completeHandled: false,
      retryRequired: false,
      deathPresentation: null,
      virtualInput: { left: false, right: false, jump: false },
      keys: {
        left: { isDown: false },
        right: { isDown: false },
        up: { isDown: false },
        a: { isDown: false },
        d: { isDown: false },
        w: { isDown: false },
        space: { isDown: false },
        r: { isDown: false }
      },
      togglePause: () => {
        pauseCount += 1;
      },
      rewind: () => {
        rewindCount += 1;
      }
    });
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [
        {
          axes: [axisX, 0],
          buttons: Array.from({ length: 16 }, (_, index) => ({
            pressed: index === 0 ? button0 : index === 2 ? button2 : index === 9 ? button9 : false
          }))
        }
      ]
    });
    axisX = 1;
    button0 = true;
    scene.updateGamepadInput();
    const movingInput = scene.readInput();
    button9 = true;
    scene.updateGamepadInput();
    scene.updateGamepadInput();
    const pauseCountAfterHeld = pauseCount;
    button2 = true;
    scene.updateGamepadInput();
    scene.pausedByHud = true;
    axisX = -1;
    button0 = true;
    button2 = true;
    button9 = true;
    scene.updateGamepadInput();
    const blockedInput = { ...scene.gamepadInput };
    scene.pausedByHud = false;
    scene.updateGamepadInput();
    const stillLatchedInput = { ...scene.gamepadInput };
    button0 = false;
    button2 = false;
    button9 = false;
    axisX = 0;
    scene.updateGamepadInput();
    axisX = -1;
    scene.updateGamepadInput();
    const afterNeutralInput = scene.readInput();
    return {
      movingInput,
      pauseCountAfterHeld,
      rewindCount,
      blockedInput,
      stillLatchedInput,
      afterNeutralInput
    };
  });
  const campaignFinalIntegrationResult = await scoreEntryPage.evaluate(async () => {
    const { GameScene } = await import("/src/scenes/GameScene.ts");
    const { levels } = await import("/src/data/levels.ts");
    const { resetCampaignVitals } = await import("/src/game/session.ts");
    const scene = Object.create(GameScene.prototype);
    const modalCalls = [];
    const finalIndex = levels.length - 1;
    window.localStorage.removeItem("echo-shift-progress-v1");
    window.localStorage.removeItem("echo-shift-leaderboard-v1");
    resetCampaignVitals();
    Object.assign(scene, {
      completeHandled: false,
      pendingBossDefeatCompletion: false,
      scoreEligible: true,
      tutorialMode: false,
      level: { ...levels[finalIndex], index: finalIndex },
      levelIndex: finalIndex,
      simulation: {
        finalScore: () => 3456,
        totalFrames: 789,
        echoRecordings: [{ frames: [] }],
        deaths: 2,
        objectState: { collectedCores: new Set(["core-a", "core-b"]) },
        timeBonus: () => 321
      },
      stopBossDefeatLoops: () => {},
      clearAttemptScopedAudio: () => {},
      syncFiniteCampaignLives: () => {},
      cameras: { main: { flash: () => {} } },
      hud: {
        showTutorialComplete: () => {},
        showComplete: (...args) => {
          modalCalls.push(args);
        }
      }
    });
    scene.completeLevel();
    const options = modalCalls[0]?.[2];
    const progress = JSON.parse(window.localStorage.getItem("echo-shift-progress-v1") || "null");
    return {
      modalCalls: modalCalls.length,
      isFinalArg: modalCalls[0]?.[1],
      scoreEligible: options?.scoreEligible,
      scoreRecorded: options?.scoreRecorded,
      campaignSummary: options?.campaignSummary,
      leaderboardEntries: options?.leaderboardEntries,
      progressScore: progress?.scores?.[levels[finalIndex].id]?.score,
      unlocked: progress?.unlocked
    };
  });
  await scoreEntryPage.goto(`${url}?editor=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(scoreEntryPage);
  await scoreEntryPage.evaluate(() => {
    window.localStorage.setItem("echo-shift-progress-v1", "{broken");
  });
  await scoreEntryPage.locator("[data-play]").waitFor({ state: "visible" });
  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "r"]) {
    await scoreEntryPage.keyboard.press(key);
  }
  await scoreEntryPage.locator("[data-levels]").click();
  await scoreEntryPage.locator("[data-progress-warning]").waitFor({ state: "visible" });
  const damagedProgressWarning = await scoreEntryPage.locator("[data-progress-warning]").textContent();
  const damagedProgressBest = await scoreEntryPage.locator(".level-button[data-level='0'] .level-best").textContent();
  const controlsCopy = await scoreEntryPage.evaluate(async () => {
    const { controlBindings } = await import("/src/ui/options.ts");
    return controlBindings.find((binding) => binding.action === "Pause")?.binding || "";
  });
  await scoreEntryContext.close();

  const staleDraft = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const stalePage = await staleDraft.newPage();
  collectConsole(stalePage);
  await stalePage.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await stalePage.evaluate(() => {
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0.5,
        levels: [
          {
            id: "draft-index-smoke",
            index: 0,
            name: "Draft Index Smoke",
            subtitle: "",
            start: { x: 60, y: 450 },
            exit: { x: 850, y: 438, w: 48, h: 62 },
            bounds: { x: 0, y: 0, w: 960, h: 540 },
            solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
            perfectEchoes: 0,
            medalFrames: { gold: 1800, silver: 2400 },
            hint: ""
          },
          {
            id: "draft-index-smoke-b",
            index: 1,
            name: "Draft Index Smoke B",
            subtitle: "",
            start: { x: 60, y: 450 },
            exit: { x: 850, y: 438, w: 48, h: 62 },
            bounds: { x: 0, y: 0, w: 960, h: 540 },
            solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
            drones: [{ id: "legacy-draft-drone", x: 140, y: 420, w: 30, h: 24, axis: "x", distance: 40, period: 120, phase: 0 }],
            perfectEchoes: 0,
            medalFrames: { gold: 1800, silver: 2400 },
            hint: ""
          }
        ]
      })
    );
  });
  await stalePage.reload({ waitUntil: "domcontentloaded" });
  await stalePage.locator("[data-level-editor]").waitFor({ state: "visible" });
  const fractionalDraftLevelName = await stalePage.locator("[data-level-field='name']").inputValue();
  const fractionalDraftValidation = await stalePage.locator("[data-validation]").getAttribute("data-editor-validation");
  await openTab(stalePage, "objects");
  await stalePage.locator("[data-object-list] [data-kind='drones'][data-id='legacy-draft-drone']").click();
  const legacyDraftDronePathStart = await objectNumber(stalePage, "pathStart");
  const legacyDraftDronePathEnd = await objectNumber(stalePage, "pathEnd");
  const legacyDraftLevelExport = JSON.parse(await stalePage.locator("[data-export-json]").inputValue())[1];
  const legacyDraftDroneExport = legacyDraftLevelExport.drones.find((drone) => drone.id === "legacy-draft-drone");
  await staleDraft.close();

  const legacyBossDraft = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const legacyBossPage = await legacyBossDraft.newPage();
  collectConsole(legacyBossPage);
  await legacyBossPage.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await legacyBossPage.evaluate(() => {
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0,
        levels: [
          {
            id: "legacy-boss-draft",
            index: 0,
            name: "Legacy Boss Draft",
            subtitle: "",
            start: { x: 60, y: 450 },
            exit: { x: 850, y: 438, w: 48, h: 62 },
            bounds: { x: 0, y: 0, w: 960, h: 540 },
            solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
            bosses: [
              {
                id: "legacy-boss",
                kind: "clockwork-regent",
                x: 300,
                y: 180,
                w: 300,
                h: 220,
                entrySide: "right",
                checkpoint: { x: 240, y: 352 }
              }
            ],
            perfectEchoes: 0,
            medalFrames: { gold: 1800, silver: 2400 },
            hint: ""
          }
        ]
      })
    );
  });
  await legacyBossPage.reload({ waitUntil: "domcontentloaded" });
  await legacyBossPage.locator("[data-level-editor]").waitFor({ state: "visible" });
  const legacyBossExportLevel = JSON.parse(await legacyBossPage.locator("[data-export-json]").inputValue())[0];
  const legacyBossExport = legacyBossExportLevel.bosses.find((boss) => boss.id === "legacy-boss");
  await legacyBossDraft.close();

  const draftPlaytest = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const draftPlaytestPage = await draftPlaytest.newPage();
  collectConsole(draftPlaytestPage);
  await draftPlaytestPage.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await draftPlaytestPage.evaluate(() => window.localStorage.clear());
  await draftPlaytestPage.reload({ waitUntil: "domcontentloaded" });
  await draftPlaytestPage.locator("[data-level-editor]").waitFor({ state: "visible" });
  await draftPlaytestPage.locator("[data-level-select]").selectOption("1");
  const draftPlaytestName = draftPlaytestPage.locator("[data-level-field='name']");
  await draftPlaytestName.fill("Draft Playtest Smoke");
  await dispatchChange(draftPlaytestName);
  await draftPlaytestPage.locator("[data-level-field='soundtrackKey']").selectOption("tutorial");
  await draftPlaytestPage.locator("[data-level-field='rewindDisabled']").check();
  await draftPlaytestPage.locator("[data-playtest-draft]").click();
  await draftPlaytestPage.waitForURL(/playtestDraft=1/);
  await startAudioGate(draftPlaytestPage);
  await draftPlaytestPage.locator("[data-level]").waitFor({ state: "visible" });
  await draftPlaytestPage.waitForFunction(() => document.documentElement.dataset.echoShiftAudioState === "playing");
  await waitForLevelIntro(draftPlaytestPage);
  const draftPlaytestUrl = draftPlaytestPage.url();
  const draftPlaytestHudLevel = await draftPlaytestPage.locator("[data-level]").textContent();
  const draftPlaytestMusicKey = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftMusicKey);
  const draftPlaytestAudioState = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftAudioState);
  const draftPlaytestBackgroundKey = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftBackgroundKey);
  const draftPlaytestBackgroundRenderMode = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftBackgroundRenderMode);
  const draftPlaytestBackgroundDetailLayer = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftBackgroundDetailLayer);
  const draftPlaytestBackgroundPieces = Number(await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftBackgroundPieces));
  const draftPlaytestRewindDisabled = await draftPlaytestPage.locator("[data-rewind]").isDisabled();
  const draftPlaytestRetryCount = await draftPlaytestPage.locator("[data-retry]").count();
  await draftPlaytestPage.locator("canvas").click({ position: { x: 480, y: 270 } });
  await draftPlaytestPage.keyboard.press("r");
  await draftPlaytestPage.waitForFunction(() => document.querySelector("[data-toast]")?.textContent?.includes("Rewind disabled"));
  const draftPlaytestEchoTintsAfterR = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftVisibleEchoTints || "");
  const draftPlaytestRewindToast = await draftPlaytestPage.locator("[data-toast]").textContent();
  await draftPlaytestPage.keyboard.press("t");
  await draftPlaytestPage.waitForTimeout(700);
  const draftPlaytestIntroAfterT = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftLevelIntro || "");
  const draftPlaytestNoRetryToast = await draftPlaytestPage.locator("[data-toast]").textContent();
  const draftPlaytestModalAfterT = await draftPlaytestPage.locator("[data-modal].show").count();
  await draftPlaytestPage.screenshot({ path: `${outDir}/editor-playtest-draft.png`, fullPage: true });
  await draftPlaytestPage.locator("[data-menu]").click();
  const draftPauseReplayCount = await draftPlaytestPage.locator("[data-modal] [data-replay-level]").count();
  await draftPlaytestPage.locator("[data-modal] [data-options]").click();
  await draftPlaytestPage.locator("[data-options-audio]").click();
  await draftPlaytestPage.keyboard.press("Escape");
  const draftPauseOptionsNestedBackTitle = await draftPlaytestPage.locator("[data-modal].show h1").textContent();
  await draftPlaytestPage.keyboard.press("Escape");
  const draftPauseOptionsRootBackTitle = await draftPlaytestPage.locator("[data-modal].show h1").textContent();
  const draftEditorButton = draftPlaytestPage.locator("[data-modal] [data-editor]");
  await draftEditorButton.waitFor({ state: "visible" });
  await draftEditorButton.click();
  await draftPlaytestPage.waitForURL(/editor=1/);
  await draftPlaytestPage.locator("[data-level-editor]").waitFor({ state: "visible" });
  const draftReturnUrl = draftPlaytestPage.url();
  await draftPlaytest.close();

  const mobileFiniteDraft = {
    currentIndex: 0,
    levels: [
      {
        id: "mobile-finite-smoke",
        index: 0,
        name: "Mobile Finite Smoke",
        subtitle: "",
        rewindDisabled: true,
        start: { x: 60, y: 450 },
        exit: { x: 850, y: 438, w: 48, h: 62 },
        bounds: { x: 0, y: 0, w: 960, h: 540 },
        solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
        score: { lives: 3, coreScore: 100, timeBonusTargetSeconds: 30, timeBonusPerSecond: 100 },
        hint: ""
      }
    ]
  };
  const mobileFiniteContext = await browser.newContext({ viewport: { width: 390, height: 720 } });
  const mobileFinitePage = await mobileFiniteContext.newPage();
  collectConsole(mobileFinitePage);
  await mobileFinitePage.goto(url, { waitUntil: "domcontentloaded" });
  await mobileFinitePage.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, mobileFiniteDraft);
  await mobileFinitePage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(mobileFinitePage);
  await waitForLevelIntro(mobileFinitePage);
  const mobileFiniteRetryCount = await mobileFinitePage.locator("[data-retry]").count();
  const mobileFiniteRewindDisabled = await mobileFinitePage.locator("[data-rewind]").isDisabled();
  await mobileFinitePage.screenshot({ path: `${outDir}/editor-playtest-draft-mobile.png`, fullPage: true });
  await mobileFiniteContext.close();

  const gameOverDraft = {
    currentIndex: 0,
    levels: [
      {
        id: "game-over-smoke",
        index: 0,
        name: "Game Over Smoke",
        subtitle: "",
        start: { x: 60, y: 450 },
        exit: { x: 850, y: 438, w: 48, h: 62 },
        bounds: { x: 0, y: 0, w: 960, h: 540 },
        solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
        hazards: [{ id: "spawn-spark", x: 50, y: 440, w: 80, h: 80 }],
        score: { lives: 3, coreScore: 100, timeBonusTargetSeconds: 30, timeBonusPerSecond: 100 },
        hint: ""
      }
    ]
  };

  const gameOverContext = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const gameOverPage = await gameOverContext.newPage();
  collectConsole(gameOverPage);
  await gameOverPage.goto(url, { waitUntil: "domcontentloaded" });
  await gameOverPage.evaluate((snapshot) => {
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify(snapshot)
    );
  }, gameOverDraft);
  await gameOverPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(gameOverPage);
  await gameOverPage.locator("[data-modal].show h1").waitFor({ state: "visible", timeout: 32000 });
  const gameOverTitle = await gameOverPage.locator("[data-modal].show h1").textContent();
  const gameOverReplayCount = await gameOverPage.locator("[data-modal] [data-replay-level]").count();
  const gameOverLevelSelectVisible = await gameOverPage.locator("[data-modal] [data-levels]").isVisible();
  const gameOverRetryCount = await gameOverPage.locator("[data-retry]").count();
  const gameOverRewindHidden = await gameOverPage.locator("[data-rewind]").isHidden();
  const gameOverMenuHidden = await gameOverPage.locator("[data-menu]").isHidden();
  const gameOverTouchControlsHidden = await gameOverPage.locator(".touch-controls").isHidden();
  await gameOverPage.keyboard.press("r");
  await gameOverPage.keyboard.press("t");
  await gameOverPage.waitForTimeout(500);
  const gameOverTitleAfterKeys = await gameOverPage.locator("[data-modal].show h1").textContent();
  const gameOverLivesAfterKeys = await gameOverPage.locator("[data-lives]").textContent();
  const gameOverDeathPhaseAfterKeys = await gameOverPage.evaluate(() => document.documentElement.dataset.echoShiftDeathPresentation || "");
  await gameOverPage.screenshot({ path: `${outDir}/editor-game-over.png`, fullPage: true });
  await gameOverPage.locator("[data-modal] [data-levels]").click();
  await gameOverPage.locator("[data-level='0']").click();
  await gameOverPage.locator("[data-lives]").waitFor({ state: "visible" });
  const gameOverLevelSelectRestartLives = await gameOverPage.locator("[data-lives]").textContent();
  await gameOverContext.close();

  const mobileGameOverContext = await browser.newContext({ viewport: { width: 390, height: 720 } });
  const mobileGameOverPage = await mobileGameOverContext.newPage();
  collectConsole(mobileGameOverPage);
  await mobileGameOverPage.goto(url, { waitUntil: "domcontentloaded" });
  await mobileGameOverPage.evaluate((snapshot) => {
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(snapshot));
  }, gameOverDraft);
  await mobileGameOverPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(mobileGameOverPage);
  await mobileGameOverPage.locator("[data-modal].show h1").waitFor({ state: "visible", timeout: 32000 });
  const mobileGameOverTitle = await mobileGameOverPage.locator("[data-modal].show h1").textContent();
  const mobileGameOverReplayCount = await mobileGameOverPage.locator("[data-modal] [data-replay-level]").count();
  const mobileGameOverRetryCount = await mobileGameOverPage.locator("[data-retry]").count();
  const mobileGameOverRewindHidden = await mobileGameOverPage.locator("[data-rewind]").isHidden();
  const mobileGameOverMenuHidden = await mobileGameOverPage.locator("[data-menu]").isHidden();
  const mobileGameOverTouchControlsHidden = await mobileGameOverPage.locator(".touch-controls").isHidden();
  await mobileGameOverPage.screenshot({ path: `${outDir}/editor-game-over-mobile.png`, fullPage: true });
  await mobileGameOverContext.close();

  const directClearContext = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const directClearPage = await directClearContext.newPage();
  collectConsole(directClearPage);
  await directClearPage.goto(url, { waitUntil: "domcontentloaded" });
  await directClearPage.evaluate(() => {
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0,
        levels: [
          {
            id: "direct-clear-smoke",
            index: 0,
            name: "Direct Clear Smoke",
            subtitle: "",
            start: { x: 60, y: 450 },
            exit: { x: 40, y: 420, w: 120, h: 90 },
            bounds: { x: 0, y: 0, w: 960, h: 540 },
            solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
            score: { lives: 3, coreScore: 100, timeBonusTargetSeconds: 30, timeBonusPerSecond: 100 },
            hint: ""
          },
          {
            id: "direct-clear-next",
            index: 1,
            name: "Direct Clear Next",
            subtitle: "",
            start: { x: 60, y: 450 },
            exit: { x: 850, y: 438, w: 48, h: 62 },
            bounds: { x: 0, y: 0, w: 960, h: 540 },
            solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
            score: { lives: 3, coreScore: 100, timeBonusTargetSeconds: 30, timeBonusPerSecond: 100 },
            hint: ""
          }
        ]
      })
    );
  });
  await directClearPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(directClearPage);
  await directClearPage.locator("[data-modal].show h1").waitFor({ state: "visible", timeout: 12000 });
  const directClearTitle = await directClearPage.locator("[data-modal].show h1").textContent();
  const directClearReplayCount = await directClearPage.locator("[data-modal] [data-replay-level]").count();
  const directClearNextVisible = await directClearPage.locator("[data-modal] [data-next]").isVisible();
  const directClearProgress = await directClearPage.evaluate(() => window.localStorage.getItem("echo-shift-progress-v1"));
  const directClearLeaderboard = await directClearPage.evaluate(() => window.localStorage.getItem("echo-shift-leaderboard-v1"));
  await directClearContext.close();

  const corruptDraftPlaytest = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const corruptDraftPlaytestPage = await corruptDraftPlaytest.newPage();
  collectConsole(corruptDraftPlaytestPage);
  await corruptDraftPlaytestPage.goto(url, { waitUntil: "domcontentloaded" });
  await corruptDraftPlaytestPage.evaluate(() => {
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0,
        levels: [{ id: "broken-draft", name: "Broken Draft" }]
      })
    );
  });
  await corruptDraftPlaytestPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(corruptDraftPlaytestPage);
  await corruptDraftPlaytestPage.locator("[data-play]").waitFor({ state: "visible" });
  const corruptDraftBootedMenu = await corruptDraftPlaytestPage.locator("[data-play]").isVisible();
  const corruptDraftHudCount = await corruptDraftPlaytestPage.locator("[data-level]").count();
  await corruptDraftPlaytestPage.evaluate(() => {
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 1,
        levels: [
          {
            id: "valid-draft-room",
            index: 0,
            name: "Valid Draft Room",
            subtitle: "",
            start: { x: 60, y: 450 },
            exit: { x: 850, y: 438, w: 48, h: 62 },
            bounds: { x: 0, y: 0, w: 960, h: 540 },
            solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
            perfectEchoes: 0,
            medalFrames: { gold: 1800, silver: 2400 },
            hint: ""
          },
          { id: "broken-partial-room", name: "Broken Partial Room" }
        ]
      })
    );
  });
  await corruptDraftPlaytestPage.goto(`${url}?playtestDraft=1&level=1`, { waitUntil: "domcontentloaded" });
  await startAudioGate(corruptDraftPlaytestPage);
  await corruptDraftPlaytestPage.locator("[data-play]").waitFor({ state: "visible" });
  const mixedCorruptDraftBootedMenu = await corruptDraftPlaytestPage.locator("[data-play]").isVisible();
  const mixedCorruptDraftHudCount = await corruptDraftPlaytestPage.locator("[data-level]").count();
  await corruptDraftPlaytestPage.evaluate(() => {
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0,
        levels: [
          {
            id: "semantic-draft-room",
            index: 0.5,
            name: "Semantic Draft Room",
            subtitle: "",
            start: { x: 60, y: 450 },
            exit: { x: 850, y: 438, w: 48, h: 62 },
            bounds: { x: 0, y: 0, w: 960, h: 540 },
            solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
            perfectEchoes: 0,
            medalFrames: { gold: 1800.4, silver: 1200 },
            hint: ""
          }
        ]
      })
    );
  });
  await corruptDraftPlaytestPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(corruptDraftPlaytestPage);
  await corruptDraftPlaytestPage.locator("[data-play]").waitFor({ state: "visible" });
  const semanticCorruptDraftBootedMenu = await corruptDraftPlaytestPage.locator("[data-play]").isVisible();
  const semanticCorruptDraftHudCount = await corruptDraftPlaytestPage.locator("[data-level]").count();
  await corruptDraftPlaytestPage.evaluate(() => {
    const levelBase = {
      id: "bad-soundtrack-draft",
      index: 0,
      name: "Bad Soundtrack Draft",
      subtitle: "",
      start: { x: 60, y: 450 },
      exit: { x: 850, y: 438, w: 48, h: 62 },
      bounds: { x: 0, y: 0, w: 960, h: 540 },
      solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
      perfectEchoes: 0,
      medalFrames: { gold: 1800, silver: 2400 },
      hint: ""
    };
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0,
        levels: [{ ...levelBase, soundtrackKey: "missing-track" }]
      })
    );
  });
  await corruptDraftPlaytestPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(corruptDraftPlaytestPage);
  await corruptDraftPlaytestPage.locator("[data-play]").waitFor({ state: "visible" });
  const unknownSoundtrackDraftBootedMenu = await corruptDraftPlaytestPage.locator("[data-play]").isVisible();
  const unknownSoundtrackDraftHudCount = await corruptDraftPlaytestPage.locator("[data-level]").count();
  await corruptDraftPlaytestPage.evaluate(() => {
    const raw = window.localStorage.getItem("echo-shift-level-editor-draft-v1");
    if (!raw) throw new Error("Missing draft");
    const parsed = JSON.parse(raw);
    parsed.levels[0].soundtrackKey = "menu";
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(parsed));
  });
  await corruptDraftPlaytestPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(corruptDraftPlaytestPage);
  await corruptDraftPlaytestPage.locator("[data-play]").waitFor({ state: "visible" });
  const menuSoundtrackDraftBootedMenu = await corruptDraftPlaytestPage.locator("[data-play]").isVisible();
  const menuSoundtrackDraftHudCount = await corruptDraftPlaytestPage.locator("[data-level]").count();
  await corruptDraftPlaytestPage.evaluate(() => {
    const raw = window.localStorage.getItem("echo-shift-level-editor-draft-v1");
    if (!raw) throw new Error("Missing draft");
    const parsed = JSON.parse(raw);
    delete parsed.levels[0].soundtrackKey;
    parsed.levels[0].backgroundKey = "missing-background";
    window.localStorage.setItem("echo-shift-level-editor-draft-v1", JSON.stringify(parsed));
  });
  await corruptDraftPlaytestPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(corruptDraftPlaytestPage);
  await corruptDraftPlaytestPage.locator("[data-play]").waitFor({ state: "visible" });
  const unknownBackgroundDraftBootedMenu = await corruptDraftPlaytestPage.locator("[data-play]").isVisible();
  const unknownBackgroundDraftHudCount = await corruptDraftPlaytestPage.locator("[data-level]").count();
  await corruptDraftPlaytest.close();

  const mismatchedDraftSelect = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const mismatchedDraftSelectPage = await mismatchedDraftSelect.newPage();
  collectConsole(mismatchedDraftSelectPage);
  await mismatchedDraftSelectPage.goto(url, { waitUntil: "domcontentloaded" });
  await mismatchedDraftSelectPage.evaluate(() => {
    const levelBase = {
      subtitle: "",
      start: { x: 60, y: 450 },
      exit: { x: 850, y: 438, w: 48, h: 62 },
      bounds: { x: 0, y: 0, w: 960, h: 540 },
      solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
      perfectEchoes: 0,
      medalFrames: { gold: 1800, silver: 2400 },
      hint: ""
    };
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0,
        levels: [
          { ...levelBase, id: "draft-high-index", index: 9, name: "Draft High Index" },
          { ...levelBase, id: "draft-array-second", index: 0, name: "Draft Array Second" }
        ]
      })
    );
  });
  await mismatchedDraftSelectPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(mismatchedDraftSelectPage);
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  await waitForLevelIntro(mismatchedDraftSelectPage);
  await mismatchedDraftSelectPage.locator("[data-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-modal] [data-levels]").click();
  await mismatchedDraftSelectPage.locator(".level-button[data-level='1']").click();
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  const mismatchedDraftSelectedLevel = await mismatchedDraftSelectPage.locator(".hud [data-level]").textContent();
  const mismatchedDraftSelectedMusicKey = await mismatchedDraftSelectPage.evaluate(() => document.documentElement.dataset.echoShiftMusicKey);
  const mismatchedDraftSelectedUrl = mismatchedDraftSelectPage.url();
  await mismatchedDraftSelectPage.reload({ waitUntil: "domcontentloaded" });
  await startAudioGate(mismatchedDraftSelectPage);
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  await waitForLevelIntro(mismatchedDraftSelectPage);
  const mismatchedDraftReloadedLevel = await mismatchedDraftSelectPage.locator(".hud [data-level]").textContent();
  await mismatchedDraftSelectPage.locator("[data-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-modal] [data-exit-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-play]").waitFor({ state: "visible" });
  await mismatchedDraftSelectPage.locator("[data-play]").click();
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  await waitForLevelIntro(mismatchedDraftSelectPage);
  const mismatchedDraftTitlePlayLevel = await mismatchedDraftSelectPage.locator(".hud [data-level]").textContent();
  await mismatchedDraftSelectPage.locator("[data-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-modal] [data-exit-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-play]").waitFor({ state: "visible" });
  await mismatchedDraftSelectPage.locator("[data-editor]").click();
  await mismatchedDraftSelectPage.waitForURL(/editor=1/);
  await mismatchedDraftSelectPage.locator("[data-level-editor]").waitFor({ state: "visible" });
  const mismatchedDraftTitleEditorIndex = await mismatchedDraftSelectPage.locator("[data-level-select]").inputValue();
  const mismatchedDraftTitleEditorLevel = await mismatchedDraftSelectPage.locator("[data-level-select] option:checked").textContent();
  await mismatchedDraftSelectPage.locator("[data-playtest-draft]").click();
  await mismatchedDraftSelectPage.waitForURL(/playtestDraft=1/);
  await startAudioGate(mismatchedDraftSelectPage);
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  await waitForLevelIntro(mismatchedDraftSelectPage);
  await mismatchedDraftSelectPage.locator("[data-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-modal] [data-editor]").click();
  await mismatchedDraftSelectPage.waitForURL(/editor=1/);
  await mismatchedDraftSelectPage.locator("[data-level-editor]").waitFor({ state: "visible" });
  const mismatchedDraftReturnIndex = await mismatchedDraftSelectPage.locator("[data-level-select]").inputValue();
  const mismatchedDraftReturnLevel = await mismatchedDraftSelectPage.locator("[data-level-select] option:checked").textContent();
  const mismatchedDraftReturnAutoOption = await mismatchedDraftSelectPage.locator("[data-level-field='soundtrackKey'] option[value='']").textContent();
  await mismatchedDraftSelect.close();

  const mismatchedDraftCompletion = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const mismatchedDraftCompletionPage = await mismatchedDraftCompletion.newPage();
  collectConsole(mismatchedDraftCompletionPage);
  await mismatchedDraftCompletionPage.goto(url, { waitUntil: "domcontentloaded" });
  await mismatchedDraftCompletionPage.evaluate(() => {
    const levelBase = {
      subtitle: "",
      start: { x: 850, y: 438 },
      exit: { x: 850, y: 438, w: 48, h: 62 },
      bounds: { x: 0, y: 0, w: 960, h: 540 },
      solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
      perfectEchoes: 0,
      medalFrames: { gold: 1800, silver: 2400 },
      hint: ""
    };
    window.localStorage.setItem(
      "echo-shift-level-editor-draft-v1",
      JSON.stringify({
        currentIndex: 0,
        levels: [
          { ...levelBase, id: "draft-complete-high-index", index: 9, name: "Draft Complete High Index" },
          { ...levelBase, id: "draft-complete-array-last", index: 0, name: "Draft Complete Array Last" }
        ]
      })
    );
  });
  await mismatchedDraftCompletionPage.goto(`${url}?playtestDraft=1&level=0`, { waitUntil: "domcontentloaded" });
  await startAudioGate(mismatchedDraftCompletionPage);
  await mismatchedDraftCompletionPage.locator("[data-modal].show h1").waitFor({ state: "visible" });
  const mismatchedDraftFirstCompleteTitle = await mismatchedDraftCompletionPage.locator("[data-modal].show h1").textContent();
  const mismatchedDraftFirstNextVisible = await mismatchedDraftCompletionPage.locator("[data-modal] [data-next]").isVisible();
  await mismatchedDraftCompletionPage.locator("[data-modal] [data-next]").click();
  await mismatchedDraftCompletionPage.waitForFunction(() =>
    document.querySelector(".hud [data-level]")?.textContent?.includes("Draft Complete Array Last")
  );
  await mismatchedDraftCompletionPage.locator("[data-modal].show h1").waitFor({ state: "visible" });
  const mismatchedDraftLastCompleteTitle = await mismatchedDraftCompletionPage.locator("[data-modal].show h1").textContent();
  const mismatchedDraftLastNextCount = await mismatchedDraftCompletionPage.locator("[data-modal] [data-next]").count();
  const mismatchedDraftCompletionProgress = await mismatchedDraftCompletionPage.evaluate(() => window.localStorage.getItem("echo-shift-progress-v1"));
  const mismatchedDraftCompletionLeaderboard = await mismatchedDraftCompletionPage.evaluate(() => window.localStorage.getItem("echo-shift-leaderboard-v1"));
  await mismatchedDraftCompletion.close();

  const navigationHarness = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const navigationPage = await navigationHarness.newPage();
  collectConsole(navigationPage);
  await navigationPage.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await navigationPage.evaluate(async () => {
    const { bindMenuNavigation } = await import("/src/ui/menuNavigation.ts");
    document.body.innerHTML = `
      <main>
        <button id="outside">Outside</button>
        <section id="nav-root">
          <button id="first">First</button>
          <input id="slider" type="range" min="0" max="10" value="5" />
          <button id="last">Last</button>
        </section>
      </main>
    `;
    window.__echoShiftNavMoves = 0;
    window.__echoShiftNavBinding = bindMenuNavigation(document.getElementById("nav-root"), {
      autoFocus: false,
      trapFocus: true,
      onNavigate: () => {
        window.__echoShiftNavMoves += 1;
      }
    });
    document.getElementById("first").focus();
  });
  await navigationPage.keyboard.press("ArrowDown");
  const keyboardNavigationFocus = await navigationPage.evaluate(() => document.activeElement?.id);
  const keyboardNavigationMoves = await navigationPage.evaluate(() => window.__echoShiftNavMoves);
  await navigationPage.keyboard.press("ArrowRight");
  const rangeFocusAfterArrow = await navigationPage.evaluate(() => document.activeElement?.id);
  const rangeValueAfterArrow = await navigationPage.evaluate(() => document.getElementById("slider").value);
  const movesAfterRangeArrow = await navigationPage.evaluate(() => window.__echoShiftNavMoves);
  await navigationPage.evaluate(() => document.getElementById("last").focus());
  await navigationPage.keyboard.press("Tab");
  const trappedTabFocus = await navigationPage.evaluate(() => document.activeElement?.id);
  const gamepadHarnessResult = await navigationPage.evaluate(async () => {
    window.__echoShiftNavBinding.destroy();
    const { bindMenuNavigation } = await import("/src/ui/menuNavigation.ts");
    let buttonPressed = true;
    let axisX = 1;
    let axisY = 0;
    let clickCount = 0;
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [
        {
          axes: [axisX, axisY],
          buttons: buttons.map((button, index) => ({
            ...button,
            pressed: index === 0 ? buttonPressed : button.pressed
          }))
        }
      ]
    });
    document.body.innerHTML = `
      <section id="pad-root">
        <button id="pad-first">Pad First</button>
        <button id="pad-second">Pad Second</button>
      </section>
    `;
    document.getElementById("pad-first").addEventListener("click", () => {
      clickCount += 1;
    });
    const binding = bindMenuNavigation(document.getElementById("pad-root"), { autoFocus: false });
    document.getElementById("pad-first").focus();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const focusAfterHeldAxis = document.activeElement?.id;
    const clicksAfterHeldButton = clickCount;
    await new Promise((resolve) => setTimeout(resolve, 360));
    const focusAfterHeldAxisRepeatWindow = document.activeElement?.id;
    buttonPressed = false;
    axisX = 0;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    buttonPressed = true;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const clicksAfterFreshPress = clickCount;
    binding.destroy();

    buttonPressed = false;
    axisX = 1;
    document.body.innerHTML = `
      <section id="range-root">
        <button id="range-first">First</button>
        <input id="pad-slider" type="range" min="0" max="10" step="1" value="5" />
        <button id="range-last">Last</button>
      </section>
    `;
    const rangeBinding = bindMenuNavigation(document.getElementById("range-root"), { autoFocus: false });
    document.getElementById("pad-slider").focus();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rangeAfterHeldAxis = document.getElementById("pad-slider").value;
    axisX = 0;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    axisX = 1;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rangeAfterFreshAxis = document.getElementById("pad-slider").value;
    axisX = 0;
    axisY = 1;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rangeFocusAfterVerticalAxis = document.activeElement?.id;
    rangeBinding.destroy();

    axisX = 0;
    axisY = 0;
    document.body.innerHTML = `
      <section id="text-root">
        <button id="text-first">First</button>
        <input id="pad-name" type="text" value="Runner" />
        <button id="text-last">Last</button>
      </section>
    `;
    const textBinding = bindMenuNavigation(document.getElementById("text-root"), { autoFocus: false });
    document.getElementById("pad-name").focus();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    axisX = 1;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const textFocusAfterAxis = document.activeElement?.id;
    textBinding.destroy();
    return {
      focusAfterHeldAxis,
      clicksAfterHeldButton,
      focusAfterHeldAxisRepeatWindow,
      clicksAfterFreshPress,
      rangeAfterHeldAxis,
      rangeAfterFreshAxis,
      rangeFocusAfterVerticalAxis,
      textFocusAfterAxis
    };
  });
  await navigationHarness.close();

  const leaderboardHarness = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await leaderboardHarness.addInitScript(() => window.localStorage.clear());
  const leaderboardPage = await leaderboardHarness.newPage();
  collectConsole(leaderboardPage);
  await leaderboardPage.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  const leaderboardHarnessResult = await leaderboardPage.evaluate(async () => {
    const [{ Hud }, { addLocalLeaderboardEntry, getLocalLeaderboard, getLocalLeaderboardState }] = await Promise.all([
      import("/src/ui/hud.ts"),
      import("/src/game/leaderboard.ts")
    ]);
    document.body.innerHTML = `<div id="ui-root"></div>`;
    const hud = new Hud({
      onRewind: () => {},
      onPause: () => {},
      onTitle: () => {},
      onNext: () => {},
      onLevelSelect: () => {},
      onResume: () => {},
      onVirtualInput: () => {},
      onSaveLeaderboard: addLocalLeaderboardEntry,
      allowLevelSelect: false
    });
    const dialogSnapshot = () => {
      const dialog = document.querySelector("[data-modal] .panel");
      const labelId = dialog?.getAttribute("aria-labelledby") || "";
      return {
        role: dialog?.getAttribute("role") || "",
        modal: dialog?.getAttribute("aria-modal") || "",
        label: document.getElementById(labelId)?.textContent || ""
      };
    };
    const modalCoreText = () =>
      Array.from(document.querySelectorAll("[data-modal] .score-cell"))
        .find((cell) => cell.querySelector("strong")?.textContent?.trim() === "Cores")
        ?.querySelector("span")
        ?.textContent?.trim() || "";
    const dialogScore = {
      levelId: "dialog-smoke",
      score: 100,
      frames: 120,
      echoes: 0,
      deaths: 0,
      cores: 0,
      timeBonus: 0
    };
    hud.showPause("Dialog Smoke");
    const pauseDialog = dialogSnapshot();
    document.querySelector("[data-options]").click();
    const optionsDialog = dialogSnapshot();
    hud.showComplete({ ...dialogScore, cores: 4 }, false, { scoreEligible: false, campaignSummary: null, leaderboardEntries: [] });
    const roomCompleteCoreText = modalCoreText();
    hud.showTutorialComplete(dialogScore);
    const tutorialDialog = dialogSnapshot();
    const tutorialCoreText = modalCoreText();
    hud.showGameOver("Dialog Smoke");
    const gameOverDialog = dialogSnapshot();
    hud.showComplete(
      {
        levelId: "campaign-final",
        score: 5000,
        frames: 720,
        echoes: 2,
        deaths: 1,
        cores: 4,
        timeBonus: 1200
      },
      true,
      {
        scoreEligible: true,
        scoreRecorded: true,
        campaignSummary: { score: 9000, frames: 2048, deaths: 2, cores: 12, levels: 4 },
        leaderboardEntries: getLocalLeaderboard()
      }
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const initialFinalFocus = document.activeElement?.textContent?.trim() || "";
    const panel = document.querySelector(".complete-panel");
    const summary = document.querySelector(".campaign-summary");
    const panelRect = panel.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    const summaryTopVisible = summaryRect.top >= panelRect.top - 1 && summaryRect.top < panelRect.bottom;
    const finalDialogRole = panel.getAttribute("role");
    const finalDialogModal = panel.getAttribute("aria-modal");
    const finalDialogLabel = document.getElementById(panel.getAttribute("aria-labelledby") || "")?.textContent || "";
    const finalCoreText = modalCoreText();
    const input = document.querySelector("[data-leaderboard-name]");
    input.value = "<Ace>&!!!";
    const form = document.querySelector("[data-leaderboard-form]");
    const button = document.querySelector("[data-leaderboard-form] button[type='submit']");
    button.click();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const entries = JSON.parse(window.localStorage.getItem("echo-shift-leaderboard-v1") || "[]");
    const listText = document.querySelector("[data-leaderboard-list]")?.textContent || "";
    const buttonText = button.textContent;
    const buttonDisabled = button.disabled;
    const inputDisabled = input.disabled;
    const modalText = document.querySelector("[data-modal]")?.textContent || "";
    hud.destroy();
    window.localStorage.removeItem("echo-shift-leaderboard-v1");
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new Error("blocked");
    };
    const failedHud = new Hud({
      onRewind: () => {},
      onPause: () => {},
      onTitle: () => {},
      onNext: () => {},
      onLevelSelect: () => {},
      onResume: () => {},
      onVirtualInput: () => {},
      onSaveLeaderboard: addLocalLeaderboardEntry,
      allowLevelSelect: false
    });
    failedHud.showComplete(
      {
        levelId: "campaign-final",
        score: 5000,
        frames: 720,
        echoes: 2,
        deaths: 1,
        cores: 4,
        timeBonus: 1200
      },
      true,
      {
        scoreEligible: true,
        scoreRecorded: true,
        campaignSummary: { score: 9000, frames: 2048, deaths: 2, cores: 12, levels: 4 },
        leaderboardEntries: getLocalLeaderboard()
      }
    );
    document.querySelector("[data-leaderboard-form] button[type='submit']").click();
    const failedEntryStorage = window.localStorage.getItem("echo-shift-leaderboard-v1");
    const failedButton = document.querySelector("[data-leaderboard-form] button[type='submit']");
    const failedInput = document.querySelector("[data-leaderboard-name]");
    const toast = document.querySelector("[data-toast]");
    const failedButtonText = failedButton.textContent;
    const failedButtonDisabled = failedButton.disabled;
    const failedInputDisabled = failedInput.disabled;
    const failedToastRole = toast.getAttribute("role");
    const failedToastLive = toast.getAttribute("aria-live");
    const failedToastText = toast.textContent;
    await new Promise((resolve) => setTimeout(resolve, 1850));
    const failedToastTextAfterDismiss = toast.textContent;
    failedButton.click();
    const failedToastTextAfterRepeat = toast.textContent;
    failedHud.destroy();
    Storage.prototype.setItem = originalSetItem;
    window.localStorage.setItem("echo-shift-leaderboard-v1", "{broken");
    const damagedSave = addLocalLeaderboardEntry("Corrupt", { score: 1, frames: 1, deaths: 0, cores: 0, levels: 1 });
    const damagedStorage = window.localStorage.getItem("echo-shift-leaderboard-v1");
    const mixedDamagedStorage = JSON.stringify([
      {
        id: "valid",
        nickname: "Valid",
        score: 10,
        frames: 20,
        deaths: 0,
        cores: 1,
        levels: 1,
        completedAt: "2026-01-01T00:00:00.000Z"
      },
      { id: "bad", nickname: "Bad", completedAt: "2026-01-01T00:00:00.000Z" }
    ]);
    window.localStorage.setItem("echo-shift-leaderboard-v1", mixedDamagedStorage);
    const mixedDamagedSave = addLocalLeaderboardEntry("Mixed", { score: 2, frames: 2, deaths: 0, cores: 0, levels: 1 });
    const mixedDamagedAfterSave = window.localStorage.getItem("echo-shift-leaderboard-v1");
    const damagedHud = new Hud({
      onRewind: () => {},
      onPause: () => {},
      onTitle: () => {},
      onNext: () => {},
      onLevelSelect: () => {},
      onResume: () => {},
      onVirtualInput: () => {},
      onSaveLeaderboard: addLocalLeaderboardEntry,
      allowLevelSelect: false
    });
    const damagedLeaderboard = getLocalLeaderboardState();
    damagedHud.showComplete(
      {
        levelId: "campaign-final",
        score: 5000,
        frames: 720,
        echoes: 2,
        deaths: 1,
        cores: 4,
        timeBonus: 1200
      },
      true,
      {
        scoreEligible: true,
        scoreRecorded: true,
        campaignSummary: { score: 9000, frames: 2048, deaths: 2, cores: 12, levels: 4 },
        leaderboardEntries: damagedLeaderboard.entries,
        leaderboardMessage: damagedLeaderboard.ok ? undefined : damagedLeaderboard.message
      }
    );
    const damagedListText = document.querySelector("[data-leaderboard-list]")?.textContent || "";
    damagedHud.destroy();
    return {
      entries,
      listText,
      buttonText,
      buttonDisabled,
      inputDisabled,
      modalText,
      initialFinalFocus,
      summaryTopVisible,
      pauseDialog,
      optionsDialog,
      tutorialDialog,
      roomCompleteCoreText,
      tutorialCoreText,
      gameOverDialog,
      finalDialogRole,
      finalDialogModal,
      finalDialogLabel,
      finalCoreText,
      failedEntryStorage,
      failedButtonText,
      failedButtonDisabled,
      failedInputDisabled,
      failedToastRole,
      failedToastLive,
      failedToastText,
      failedToastTextAfterDismiss,
      failedToastTextAfterRepeat,
      damagedSaveOk: damagedSave.ok,
      damagedStorage,
      mixedDamagedSaveOk: mixedDamagedSave.ok,
      mixedDamagedAfterSave,
      damagedListText
    };
  });
  await leaderboardHarness.close();

  await page.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-level-editor]").waitFor({ state: "visible" });
  await page.locator("[data-editor-canvas]").waitFor({ state: "visible" });
  await page.locator("[data-level-select]").selectOption("0");
  const levelOptions = await page.locator("[data-level-select] option").count();
  const initialExportLevelCount = JSON.parse(await page.locator("[data-export-json]").inputValue()).length;
  const initialValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const leftSidebarOverflowY = await page.locator(".editor-sidebar.left").evaluate((element) => getComputedStyle(element).overflowY);
  const toolbarOverflowY = await page.locator(".toolbar-panel").evaluate((element) => getComputedStyle(element).overflowY);
  const inspectorOverflowY = await page.locator("[data-inspector]").evaluate((element) => getComputedStyle(element).overflowY);
  const paletteGroupLabels = await page.locator(".editor-tool-group-title").allTextContents();
  const scoreSettingsText = await page.locator("[data-score-settings]").textContent();
  const scoreSummaryText = await page.locator("[data-score-summary]").textContent();
  const initialValidationText = await page.locator("[data-validation]").textContent();
  const soundtrackSelect = page.locator("[data-level-field='soundtrackKey']");
  const soundtrackOptions = await soundtrackSelect.locator("option").allTextContents();
  await soundtrackSelect.selectOption("tutorial");
  const backgroundSelect = page.locator("[data-level-field='backgroundKey']");
  const backgroundOptions = await backgroundSelect.locator("option").allTextContents();
  await backgroundSelect.selectOption("time-lab-prototype");
  const ambiencePresetSelect = page.locator("[data-level-field='backgroundAmbience.preset']");
  const ambiencePresetOptions = await ambiencePresetSelect.locator("option").allTextContents();
  await ambiencePresetSelect.selectOption("security");
  const ambienceColorField = page.locator("[data-level-field='backgroundAmbience.color']");
  await ambienceColorField.evaluate((element) => {
    element.value = "#ff4f6d";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const ambienceIntensityField = page.locator("[data-level-field='backgroundAmbience.intensity']");
  await ambienceIntensityField.evaluate((element) => {
    element.value = "0.65";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const rewindDisabledCheckbox = page.locator("[data-level-field='rewindDisabled']");
  const rewindDisabledInitially = await rewindDisabledCheckbox.isChecked();
  await rewindDisabledCheckbox.check();
  const metadataExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const soundtrackExportKey = metadataExport.soundtrackKey;
  const backgroundExportKey = metadataExport.backgroundKey;
  const ambienceExport = metadataExport.backgroundAmbience;
  const rewindDisabledExport = metadataExport.rewindDisabled;

  const levelIdField = page.locator("[data-level-field='id']");
  await levelIdField.fill("rainhouse-relay");
  await dispatchChange(levelIdField);
  const duplicateLevelValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const duplicateLevelText = await page.locator("[data-validation]").textContent();
  await levelIdField.fill("springtide-sprint");
  await dispatchChange(levelIdField);
  const restoredLevelValidation = await validationStatusAllowingWarnings(page);

  const levelIndexField = page.locator("[data-level-field='index']");
  await levelIndexField.fill("1");
  await dispatchChange(levelIndexField);
  const invalidIndexValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const invalidIndexText = await page.locator("[data-validation]").textContent();
  await levelIndexField.fill("0");
  await dispatchChange(levelIndexField);
  const restoredIndexValidation = await validationStatusAllowingWarnings(page);

  await openTab(page, "export");
  await page.locator("[data-import-json]").fill("{broken json");
  await page.locator("[data-apply-import]").click();
  const malformedImportStatus = await page.locator("[data-editor-status]").textContent();
  const malformedImportValidation = await validationStatusAllowingWarnings(page);

  await openTab(page, "inspect");
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Object.defineProperty(window, "__restoreEditorStorage", {
      configurable: true,
      value: () => {
        Storage.prototype.setItem = originalSetItem;
      }
    });
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
  });
  const levelNameField = page.locator("[data-level-field='name']");
  await levelNameField.fill("Storage Smoke");
  await dispatchChange(levelNameField);
  const storageFailureStatus = await page.locator("[data-editor-status]").textContent();
  await page.evaluate(() => {
    window.__restoreEditorStorage();
    delete window.__restoreEditorStorage;
  });
  await levelNameField.fill("Portal Primer");
  await dispatchChange(levelNameField);

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='start']").click();
  const originalStartX = await page.locator("[data-object-field='x']").inputValue();
  await page.locator("[data-object-field='x']").fill("5000");
  await dispatchChange(page.locator("[data-object-field='x']"));
  const invalidStartValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const invalidStartText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-object-field='x']").fill(originalStartX);
  await dispatchChange(page.locator("[data-object-field='x']"));
  const restoredStartValidation = await validationStatusAllowingWarnings(page);

  await page.locator("[data-level-select]").selectOption("1");
  const shortDoorInitialValidation = await validationStatusAllowingWarnings(page);
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='doors']").click();
  const originalDoorY = await page.locator("[data-object-field='y']").inputValue();
  const originalDoorOrientation = await page.locator("[data-object-field='orientation']").inputValue();
  await page.locator("[data-object-field='orientation']").selectOption("vertical");
  await page.locator("[data-object-field='y']").fill("480");
  await dispatchChange(page.locator("[data-object-field='y']"));
  const shiftedDoorValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const shiftedDoorText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-object-field='y']").fill(originalDoorY);
  await dispatchChange(page.locator("[data-object-field='y']"));
  await page.locator("[data-object-field='orientation']").selectOption(originalDoorOrientation);
  const restoredDoorValidation = await validationStatusAllowingWarnings(page);
  await page.locator("[data-level-select]").selectOption("0");

  const canvas = page.locator("[data-editor-canvas]");
  const box = await canvas.boundingBox();
  assert(box, "Editor canvas has no bounding box");
  const zoomBeforeWheel = await page.locator("[data-zoom-readout]").textContent();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -260);
  await page.waitForFunction((before) => document.querySelector("[data-zoom-readout]")?.textContent !== before, zoomBeforeWheel);
  const zoomAfterWheel = await page.locator("[data-zoom-readout]").textContent();
  await page.locator("[data-zoom-out]").click();
  const zoomAfterButton = await page.locator("[data-zoom-readout]").textContent();
  await page.locator("[data-fit-level]").click();
  const viewBeforePan = await editorView(page);
  await panWorldWithAlt(page, { x: 1000, y: 220 }, { x: 900, y: 220 });
  const viewAfterPan = await editorView(page);
  await page.locator("[data-fit-level]").click();

  await dragToolToWorld(page, "lasers", { x: 1120, y: 420 });
  await page.locator("[data-object-field='id']").fill("smoke-laser-drop");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 1120);
  await setObjectField(page, "y", 420);
  const dragDropLaserExport = await page.locator("[data-export-json]").inputValue();
  const activeToolAfterDrop = await page.locator(".editor-tool.active").getAttribute("data-tool");
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='lasers'][data-id='smoke-laser-drop']").click();
  await page.keyboard.press("Delete");
  const keyboardDeleteExport = await page.locator("[data-export-json]").inputValue();
  const keyboardDeleteValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const keyboardDeleteValidationText = await page.locator("[data-validation]").textContent();

  await dragToolToWorld(page, "floor", { x: 1180, y: 420 });
  const floorPresetId = await page.locator("[data-object-field='id']").inputValue();
  const floorPresetWidth = await objectNumber(page, "w");
  const floorPresetHeight = await objectNumber(page, "h");
  const floorMaterialOptions = await page.locator("[data-object-field='material'] option").allTextContents();
  const floorPresetMaterialDefault = await page.locator("[data-object-field='material']").inputValue();
  const floorCollisionOptions = await page.locator("[data-object-field='collision'] option").allTextContents();
  const floorPresetCollisionDefault = await page.locator("[data-object-field='collision']").inputValue();
  const floorDecorOptions = await page.locator("[data-object-field='decorDensity'] option").allTextContents();
  const floorPresetDecorDefault = await page.locator("[data-object-field='decorDensity']").inputValue();
  await page.locator("[data-object-field='material']").selectOption("sand-ruin");
  await page.locator("[data-object-field='collision']").selectOption("top-only");
  await page.locator("[data-object-field='decorDensity']").selectOption("high");
  const floorPresetExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const floorPresetSprite = floorPresetExport.solids.find((solid) => solid.id === floorPresetId)?.sprite;
  const floorPresetMaterial = floorPresetExport.solids.find((solid) => solid.id === floorPresetId)?.material;
  const floorPresetCollision = floorPresetExport.solids.find((solid) => solid.id === floorPresetId)?.collision;
  const floorPresetDecorDensity = floorPresetExport.solids.find((solid) => solid.id === floorPresetId)?.decorDensity;
  await page.locator("[data-delete-object]").click();
  await page.locator("[data-tool='floor']").click();
  await dragWorld(page, { x: 1180, y: 420 }, { x: 1200, y: 440 });
  const clickDragFloorWidth = await objectNumber(page, "w");
  const clickDragFloorHeight = await objectNumber(page, "h");
  await page.locator("[data-delete-object]").click();
  await dragToolToWorld(page, "floor", { x: 1180, y: 420 });
  const userFloorId = await page.locator("[data-object-field='id']").inputValue();
  await setObjectField(page, "x", -80);
  const userFloorOutOfBoundsValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const userFloorOutOfBoundsText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-delete-object]").click();
  const userFloorCleanupValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const userFloorCleanupText = await page.locator("[data-validation]").textContent();
  await dragToolToWorld(page, "wall", { x: 1220, y: 300 });
  const wallPresetId = await page.locator("[data-object-field='id']").inputValue();
  const wallPresetWidth = await objectNumber(page, "w");
  const wallPresetHeight = await objectNumber(page, "h");
  const wallPresetExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const wallPresetSprite = wallPresetExport.solids.find((solid) => solid.id === wallPresetId)?.sprite;
  await page.locator("[data-delete-object]").click();
  await dragToolToWorld(page, "block", { x: 1260, y: 380 });
  const blockPresetId = await page.locator("[data-object-field='id']").inputValue();
  const blockPresetWidth = await objectNumber(page, "w");
  const blockPresetHeight = await objectNumber(page, "h");
  const blockPresetExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const blockPresetSprite = blockPresetExport.solids.find((solid) => solid.id === blockPresetId)?.sprite;
  await page.locator("[data-delete-object]").click();
  await dragToolToWorld(page, "floor", { x: 1290, y: 420 });
  const clearedSpritePresetId = await page.locator("[data-object-field='id']").inputValue();
  await page.locator("[data-object-field='sprite']").selectOption("");
  const clearedSpriteExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const clearedSpriteValue = clearedSpriteExport.solids.find((solid) => solid.id === clearedSpritePresetId)?.sprite;
  await page.locator("[data-delete-object]").click();

  await dragToolToWorld(page, "plates", { x: 300, y: 500 });
  const surfacePlateId = await page.locator("[data-object-field='id']").inputValue();
  const surfacePlateY = await objectNumber(page, "y");
  const surfacePlateBottom = surfacePlateY + (await objectNumber(page, "h"));
  await page.locator("[data-duplicate-object]").click();
  const duplicatedPlateY = await objectNumber(page, "y");
  const duplicatedPlateBottom = duplicatedPlateY + (await objectNumber(page, "h"));
  await page.locator("[data-delete-object]").click();
  await openTab(page, "objects");
  await page.locator(`[data-object-list] [data-kind='plates'][data-id='${surfacePlateId}']`).click();
  await page.keyboard.press("Control+C");
  const keyboardDuplicatedPlateId = await page.locator("[data-object-field='id']").inputValue();
  const keyboardDuplicatedPlateY = await objectNumber(page, "y");
  const keyboardDuplicatedPlateBottom = keyboardDuplicatedPlateY + (await objectNumber(page, "h"));
  await page.locator("[data-delete-object]").click();

  await dragToolToWorld(page, "lasers", { x: 1280, y: 500 });
  const surfaceLaserY = await objectNumber(page, "y");
  const surfaceLaserBottom = surfaceLaserY + (await objectNumber(page, "h"));
  await page.locator("[data-delete-object]").click();
  const surfaceSnapValidation = await validationStatusAllowingWarnings(page);

  await dragToolToWorld(page, "floor", { x: 920, y: 430 });
  await page.locator("[data-object-field='id']").fill("smoke-lower-solid-order");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 900);
  await setObjectField(page, "y", 430);
  await setObjectField(page, "w", 160);
  await setObjectField(page, "h", 20);
  await dragToolToWorld(page, "floor", { x: 960, y: 320 });
  await page.locator("[data-object-field='id']").fill("smoke-upper-top-only-order");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 940);
  await setObjectField(page, "y", 300);
  await setObjectField(page, "w", 100);
  await setObjectField(page, "h", 180);
  await page.locator("[data-object-field='collision']").selectOption("top-only");
  const editorSolidRenderOrder = (await page.locator("[data-editor-canvas]").getAttribute("data-editor-solid-render-order")) || "";
  const editorSolidRenderOrderIds = editorSolidRenderOrder.split(",").filter(Boolean).map((entry) => entry.split(":")[0]);
  const lowerSolidRenderOrderIndex = editorSolidRenderOrderIds.indexOf("smoke-lower-solid-order");
  const upperTopOnlyRenderOrderIndex = editorSolidRenderOrderIds.indexOf("smoke-upper-top-only-order");
  await page.locator("[data-delete-object]").click();
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='solids'][data-id='smoke-lower-solid-order']").click();
  await page.locator("[data-delete-object]").click();

  await dragToolToWorld(page, "plates", { x: 420, y: 500 });
  await page.locator("[data-object-field='id']").fill("laser-1");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const generatedGlobalPlateId = await page.locator("[data-object-field='id']").inputValue();
  await dragToolToWorld(page, "lasers", { x: 470, y: 500 });
  const generatedGlobalLaserId = await page.locator("[data-object-field='id']").inputValue();
  const generatedGlobalIdValidation = await validationStatusAllowingWarnings(page);
  const generatedGlobalIdText = await page.locator("[data-validation]").textContent();
  const generatedGlobalIdLevel = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const generatedGlobalObjectIds = objectKinds.flatMap((kind) => (generatedGlobalIdLevel[kind] || []).map((object) => object.id));
  await page.locator("[data-delete-object]").click();
  await openTab(page, "objects");
  await page.locator(`[data-object-list] [data-kind='plates'][data-id='${generatedGlobalPlateId}']`).click();
  await page.locator("[data-delete-object]").click();
  const generatedGlobalCleanupValidation = await validationStatusAllowingWarnings(page);

  await dragToolToWorld(page, "oneWays", { x: 700, y: 360 });
  await page.locator("[data-object-field='id']").fill("smoke-one-way");
  await dispatchChange(page.locator("[data-object-field='id']"));

  await dragToolToWorld(page, "conveyors", { x: 760, y: 500 });
  await page.locator("[data-object-field='id']").fill("smoke-conveyor");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await page.locator("[data-object-field='direction']").selectOption("-1");
  await setObjectField(page, "conveyorSpeed", 2.5);
  const toolkitConveyorY = await objectNumber(page, "y");
  const toolkitConveyorBottom = toolkitConveyorY + (await objectNumber(page, "h"));

  await dragToolToWorld(page, "launchPads", { x: 840, y: 500 });
  await page.locator("[data-object-field='id']").fill("smoke-launch");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "powerX", 1.5);
  await setObjectField(page, "powerY", 14);

  await dragToolToWorld(page, "timedSwitches", { x: 920, y: 500 });
  await page.locator("[data-object-field='id']").fill("smoke-timer");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "duration", 150);

  await dragToolToWorld(page, "echoSensors", { x: 980, y: 340 });
  await page.locator("[data-object-field='id']").fill("smoke-sensor");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await page.locator("[data-object-field='actors']").selectOption("both");

  await dragToolToWorld(page, "movingLasers", { x: 1100, y: 340 });
  await page.locator("[data-object-field='id']").fill("smoke-sweeper");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await page.locator("[data-object-field='axis']").selectOption("y");
  await setObjectField(page, "pathStart", 300);
  await setObjectField(page, "pathEnd", 420);
  await setObjectField(page, "speed", 160);
  const movingLaserSpeedBeforePathResize = Number(await page.locator("[data-object-field='speed']").inputValue());
  const movingLaserPeriodBeforePathResize = Number(await page.locator("[data-object-field='period']").inputValue());
  await setObjectField(page, "pathEnd", 460);
  const movingLaserSpeedAfterPathResize = Number(await page.locator("[data-object-field='speed']").inputValue());
  const movingLaserPeriodAfterPathResize = Number(await page.locator("[data-object-field='period']").inputValue());
  await page.locator("[data-object-field='disabledBy']").fill("smoke-timer");
  await dispatchChange(page.locator("[data-object-field='disabledBy']"));

  await dragToolToWorld(page, "drones", { x: 1180, y: 340 });
  await page.locator("[data-object-field='id']").fill("smoke-disabled-drone");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await page.locator("[data-object-field='disabledBy']").fill("smoke-timer");
  await dispatchChange(page.locator("[data-object-field='disabledBy']"));
  await page.locator("[data-object-field='disabledBy']").fill("missing-drone-trigger");
  await dispatchChange(page.locator("[data-object-field='disabledBy']"));
  const missingDroneTriggerValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const missingDroneTriggerText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-object-field='disabledBy']").fill("smoke-timer");
  await dispatchChange(page.locator("[data-object-field='disabledBy']"));

  await dragToolToWorld(page, "cores", { x: 1040, y: 360 });
  await page.locator("[data-object-field='id']").fill("smoke-core");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const toolkitCoreDefaultSize = await page.locator("[data-object-field='size']").inputValue();
  await page.locator("[data-object-field='size']").selectOption("large");
  const toolkitCoreSize = await page.locator("[data-object-field='size']").inputValue();
  const toolkitCoreWidthFieldCount = await page.locator("[data-object-field='w']").count();
  const toolkitCoreHeightFieldCount = await page.locator("[data-object-field='h']").count();
  const smokeCoreBeforeLockDrag = JSON.parse(await page.locator("[data-export-json]").inputValue())[0].cores.find((item) => item.id === "smoke-core");
  await page.locator("[data-tool='select']").click();
  await dragWorld(
    page,
    { x: smokeCoreBeforeLockDrag.x + smokeCoreBeforeLockDrag.w, y: smokeCoreBeforeLockDrag.y + smokeCoreBeforeLockDrag.h / 2 },
    { x: smokeCoreBeforeLockDrag.x + smokeCoreBeforeLockDrag.w + 60, y: smokeCoreBeforeLockDrag.y + smokeCoreBeforeLockDrag.h / 2 }
  );
  const smokeCoreAfterLockDrag = JSON.parse(await page.locator("[data-export-json]").inputValue())[0].cores.find((item) => item.id === "smoke-core");
  await page.locator("[data-tool='cores']").click();
  await dragWorld(page, { x: 1140, y: 360 }, { x: 1240, y: 420 });
  await page.locator("[data-object-field='id']").fill("smoke-drag-core");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const smokeDragCreatedCore = JSON.parse(await page.locator("[data-export-json]").inputValue())[0].cores.find((item) => item.id === "smoke-drag-core");

  await dragToolToWorld(page, "cores", { x: 1080, y: 360 });
  await page.locator("[data-object-field='id']").fill("smoke-required-core");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const requiredCoreDefaultSize = await page.locator("[data-object-field='size']").inputValue();
  await dragToolToWorld(page, "doors", { x: 1120, y: 180 });
  await page.locator("[data-object-field='id']").fill("smoke-required-door");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "requiresCore", "smoke-required-core");
  await page.locator("[data-object-field='orientation']").selectOption("horizontal");
  const requiredDoorOrientation = await page.locator("[data-object-field='orientation']").inputValue();
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='cores'][data-id='smoke-required-core']").click();
  const inferredRequiredCoreSize = await page.locator("[data-object-field='size']").inputValue();
  await page.locator("[data-object-field='size']").selectOption("small");
  const inferredRequiredCoreAfterSmall = await page.locator("[data-object-field='size']").inputValue();

  await dragToolToWorld(page, "movingLasers", { x: 1500, y: 360 });
  await page.locator("[data-object-field='id']").fill("smoke-resize-sweeper");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await page.locator("[data-object-field='axis']").selectOption("y");
  const movingLaserResizeX = await objectNumber(page, "x");
  const movingLaserResizeY = await objectNumber(page, "y");
  const movingLaserResizeWidth = await objectNumber(page, "w");
  await setObjectField(page, "pathStart", movingLaserResizeY);
  await setObjectField(page, "pathEnd", movingLaserResizeY + 80);
  const movingLaserPathWidthBeforeDrag = await objectNumber(page, "w");
  const movingLaserPathHeightBeforeDrag = await objectNumber(page, "h");
  const movingLaserPathStartBeforeDrag = await objectNumber(page, "pathStart");
  const movingLaserPathEndBeforeDrag = await objectNumber(page, "pathEnd");
  const movingLaserSpeedBeforeDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const movingLaserPeriodBeforeDrag = Number(await page.locator("[data-object-field='period']").inputValue());
  await page.locator("[data-tool='select']").click();
  await dragWorld(
    page,
    { x: movingLaserResizeX + movingLaserResizeWidth / 2, y: movingLaserResizeY },
    { x: movingLaserResizeX + movingLaserResizeWidth / 2, y: movingLaserResizeY - 40 }
  );
  const movingLaserPathWidthAfterDrag = await objectNumber(page, "w");
  const movingLaserPathHeightAfterDrag = await objectNumber(page, "h");
  const movingLaserPathStartAfterDrag = await objectNumber(page, "pathStart");
  const movingLaserPathEndAfterDrag = await objectNumber(page, "pathEnd");
  const movingLaserSpeedAfterDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const movingLaserPeriodAfterDrag = Number(await page.locator("[data-object-field='period']").inputValue());
  const movingLaserResizeHeightBefore = await objectNumber(page, "h");
  const movingLaserPathStartBeforeResize = await objectNumber(page, "pathStart");
  const movingLaserPathEndBeforeResize = await objectNumber(page, "pathEnd");
  const movingLaserResizeBottomY = (await objectNumber(page, "y")) + movingLaserResizeHeightBefore;
  await page.locator("[data-tool='select']").click();
  await dragWorld(
    page,
    { x: movingLaserResizeX + movingLaserResizeWidth / 2, y: movingLaserResizeBottomY },
    { x: movingLaserResizeX + movingLaserResizeWidth / 2, y: movingLaserResizeBottomY + 40 }
  );
  const movingLaserResizeHeightAfter = await objectNumber(page, "h");
  const movingLaserPathStartAfterResize = await objectNumber(page, "pathStart");
  const movingLaserPathEndAfterResize = await objectNumber(page, "pathEnd");
  await page.locator("[data-delete-object]").click();
  const movingLaserHandleCleanupValidation = await validationStatusAllowingWarnings(page);

  await dragToolToWorld(page, "monsters", { x: 1280, y: 500 });
  const monsterDefaultKind = await page.locator("[data-object-field='kind']").inputValue();
  const monsterDefaultAxis = await page.locator("[data-object-field='axis']").inputValue();
  const monsterDefaultSpeed = Number(await page.locator("[data-object-field='speed']").inputValue());
  const monsterDefaultScore = Number(await page.locator("[data-object-field='scoreValue']").inputValue());
  const monsterDefaultPathStart = await objectNumber(page, "pathStart");
  const monsterDefaultPathEnd = await objectNumber(page, "pathEnd");
  await page.locator("[data-object-field='kind']").selectOption("glasswing-wisp");
  const monsterWispAxis = await page.locator("[data-object-field='axis']").inputValue();
  const monsterWispSpeed = Number(await page.locator("[data-object-field='speed']").inputValue());
  const monsterWispScore = Number(await page.locator("[data-object-field='scoreValue']").inputValue());
  const monsterWispPathStart = await objectNumber(page, "pathStart");
  const monsterWispPathEnd = await objectNumber(page, "pathEnd");
  await page.locator("[data-object-field='id']").fill("smoke-monster");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await page.locator("[data-object-field='axis']").selectOption("y");
  await setObjectField(page, "pathStart", 440);
  await setObjectField(page, "pathEnd", 500);
  await setObjectField(page, "speed", 120);

  await dragToolToWorld(page, "crates", { x: 1220, y: 470 });
  await page.locator("[data-object-field='id']").fill("smoke-crate");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const toolkitCrateY = await objectNumber(page, "y");
  const toolkitCrateBottom = toolkitCrateY + (await objectNumber(page, "h"));

  await dragToolToWorld(page, "bosses", { x: 1540, y: 160 });
  await page.locator("[data-object-field='id']").fill("smoke-boss");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const bossStormWeakSpot = await page.locator("[data-object-field='weakSpot']").inputValue();
  const bossSoundtrackOptions = await page.locator("[data-object-field='soundtrackKey'] option").allTextContents();
  await page.locator("[data-object-field='soundtrackKey']").selectOption("level-3");
  await page.locator("[data-object-field='kind']").selectOption("cryo-conservator");
  const bossCryoWeakSpot = await page.locator("[data-object-field='weakSpot']").inputValue();
  const bossCheckpointFieldCount = await page.locator("[data-object-field='checkpointX'], [data-object-field='checkpointY']").count();
  const bossXBeforeDrag = await objectNumber(page, "x");
  const bossYBeforeDrag = await objectNumber(page, "y");
  await page.locator("[data-tool='select']").click();
  await dragWorld(
    page,
    { x: bossXBeforeDrag + 80, y: bossYBeforeDrag + 80 },
    { x: bossXBeforeDrag + 140, y: bossYBeforeDrag + 120 }
  );
  const bossXAfterDrag = await objectNumber(page, "x");
  const bossYAfterDrag = await objectNumber(page, "y");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
  const duplicatedBossX = await objectNumber(page, "x");
  const duplicatedBossY = await objectNumber(page, "y");
  const duplicatedBossId = await page.locator("[data-object-field='id']").inputValue();
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='doors'][data-id='smoke-required-door']").click();
  await page.locator("[data-object-field='opensWith']").fill("smoke-boss");
  await dispatchChange(page.locator("[data-object-field='opensWith']"));
  const bossDoorDependencyValidation = await validationStatusAllowingWarnings(page);

  const toolkitLevel = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const toolkitValidation = await validationStatusAllowingWarnings(page);
  const toolkitConveyor = toolkitLevel.conveyors.find((item) => item.id === "smoke-conveyor");
  const toolkitLaunch = toolkitLevel.launchPads.find((item) => item.id === "smoke-launch");
  const toolkitTimer = toolkitLevel.timedSwitches.find((item) => item.id === "smoke-timer");
  const toolkitSensor = toolkitLevel.echoSensors.find((item) => item.id === "smoke-sensor");
  const toolkitSweeper = toolkitLevel.movingLasers.find((item) => item.id === "smoke-sweeper");
  const toolkitDrone = toolkitLevel.drones.find((item) => item.id === "smoke-disabled-drone");
  const toolkitCore = toolkitLevel.cores.find((item) => item.id === "smoke-core");
  const toolkitRequiredCore = toolkitLevel.cores.find((item) => item.id === "smoke-required-core");
  const toolkitRequiredDoor = toolkitLevel.doors.find((item) => item.id === "smoke-required-door");
  const toolkitCrate = toolkitLevel.crates.find((item) => item.id === "smoke-crate");
  const toolkitMonster = toolkitLevel.monsters.find((item) => item.id === "smoke-monster");
  const toolkitBoss = toolkitLevel.bosses.find((item) => item.id === "smoke-boss");
  const toolkitDuplicatedBoss = toolkitLevel.bosses.find((item) => item.id === duplicatedBossId);

  await dragToolToWorld(page, "platforms", { x: 1320, y: 420 });
  await page.locator("[data-object-field='id']").fill("smoke-moving-surface");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await dragToolToWorld(page, "crates", { x: 1340, y: 400 });
  await page.locator("[data-object-field='id']").fill("smoke-moving-crate");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const movingSurfaceCrateY = await objectNumber(page, "y");
  await setObjectField(page, "y", 380);
  const movingSurfaceMountValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const movingSurfaceMountText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-delete-object]").click();
  await openTab(page, "objects");
  const movingSurfaceRow = page.locator("[data-object-list] [data-kind='platforms'][data-id='smoke-moving-surface']");
  await movingSurfaceRow.scrollIntoViewIfNeeded();
  await movingSurfaceRow.click();
  await page.locator("[data-delete-object]").click();
  const movingSurfaceCleanupValidation = await validationStatusAllowingWarnings(page);

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='timedSwitches'][data-id='smoke-timer']").click();
  await page.locator("[data-object-field='id']").fill("smoke-timer-renamed");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const renamedReferenceLevel = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const renamedTimerExists = renamedReferenceLevel.timedSwitches.some((item) => item.id === "smoke-timer-renamed");
  const renamedSweeper = renamedReferenceLevel.movingLasers.find((item) => item.id === "smoke-sweeper");
  const renamedDrone = renamedReferenceLevel.drones.find((item) => item.id === "smoke-disabled-drone");
  const renameReferenceValidation = await validationStatusAllowingWarnings(page);
  await page.locator("[data-delete-object]").click();
  const deletedReferenceLevel = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const deletedReferenceSweeper = deletedReferenceLevel.movingLasers.find((item) => item.id === "smoke-sweeper");
  const deletedReferenceDrone = deletedReferenceLevel.drones.find((item) => item.id === "smoke-disabled-drone");
  const deletedReferenceValidation = await validationStatusAllowingWarnings(page);

  await openTab(page, "objects");
  const stepOneRow = page.locator("[data-object-list] [data-kind='solids']").first();
  await stepOneRow.scrollIntoViewIfNeeded();
  await stepOneRow.click();
  const offGridStepXBefore = await objectNumber(page, "x");
  const offGridStepYBefore = await objectNumber(page, "y");
  const offGridStepWidthBefore = await objectNumber(page, "w");
  const offGridStepHeightBefore = await objectNumber(page, "h");
  await page.locator("[data-tool='select']").click();
  await dragWorld(
    page,
    { x: offGridStepXBefore + offGridStepWidthBefore, y: offGridStepYBefore + offGridStepHeightBefore / 2 },
    { x: offGridStepXBefore + offGridStepWidthBefore + 74, y: offGridStepYBefore + offGridStepHeightBefore / 2 }
  );
  const offGridStepXAfter = await objectNumber(page, "x");
  const offGridStepYAfter = await objectNumber(page, "y");
  const offGridStepWidthAfter = await objectNumber(page, "w");

  await page.locator("[data-tool='solids']").click();
  await page.locator("[data-add-object]").click();
  await page.locator("[data-object-field='id']").fill("smoke-narrow-support");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 610);
  await setObjectField(page, "y", 420);
  await setObjectField(page, "w", 30);
  await setObjectField(page, "h", 18);
  await dragToolToWorld(page, "plates", { x: 616, y: 420 });
  const narrowPlateY = await objectNumber(page, "y");
  const narrowPlateBottom = narrowPlateY + (await objectNumber(page, "h"));
  await page.locator("[data-delete-object]").click();
  await dragToolToWorld(page, "lasers", { x: 616, y: 440 });
  const underSupportLaserY = await objectNumber(page, "y");
  await page.locator("[data-delete-object]").click();

  await page.locator("[data-tool='solids']").click();
  await page.locator("[data-add-object]").click();
  await page.locator("[data-object-field='id']").fill("smoke-floor");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 500);
  await setObjectField(page, "y", 420);
  const floorDefaultHeight = Number(await page.locator("[data-object-field='h']").inputValue());
  await setObjectField(page, "h", 6);
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='start']").click();
  await page.locator("[data-tool='select']").click();
  await clickWorld(page, { x: 520, y: 423 });
  const reselectedThinSolidId = await page.locator("[data-object-field='id']").inputValue();

  await page.locator("[data-tool='hazards']").click();
  await page.locator("[data-add-object]").click();
  await page.locator("[data-object-field='id']").fill("smoke-hazard");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 720);
  await setObjectField(page, "y", 430);
  await setObjectField(page, "w", 60);
  await setObjectField(page, "h", 8);
  await page.locator("[data-object-field='id']").fill("smoke-floor");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const rejectedDuplicateObjectId = await page.locator("[data-object-field='id']").inputValue();
  const duplicateObjectIdValidation = await validationStatusAllowingWarnings(page);
  const duplicateObjectIdValidationText = await page.locator("[data-validation]").textContent();
  const duplicateObjectIdStatus = await page.locator("[data-editor-status]").textContent();
  await page.locator("[data-object-field='id']").fill("");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const rejectedBlankObjectId = await page.locator("[data-object-field='id']").inputValue();
  const blankObjectIdValidation = await validationStatusAllowingWarnings(page);
  const blankObjectIdValidationText = await page.locator("[data-validation]").textContent();
  const blankObjectIdStatus = await page.locator("[data-editor-status]").textContent();
  await page.locator("[data-object-field='id']").fill("spark-strip-a");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const hazardWidthBefore = Number(await page.locator("[data-object-field='w']").inputValue());
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: 780, y: 450 }, { x: 860, y: 450 });
  const hazardWidthAfter = Number(await page.locator("[data-object-field='w']").inputValue());

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='exit']").click();
  const exitXBeforeDuplicate = await objectNumber(page, "x");
  const exitYBeforeDuplicate = await objectNumber(page, "y");
  const exitDuplicateDisabled = await page.locator("[data-duplicate-object]").isDisabled();
  await page.locator("[data-duplicate-object]").evaluate((button) => button.click());
  const exitXAfterDuplicate = await objectNumber(page, "x");
  const exitYAfterDuplicate = await objectNumber(page, "y");
  await setObjectField(page, "w", 64);
  await setObjectField(page, "h", 70);
  await page.locator("[data-tool='exit']").click();
  await clickWorld(page, { x: 2200, y: 420 });
  const exitWidthAfterRePlace = await objectNumber(page, "w");
  const exitHeightAfterRePlace = await objectNumber(page, "h");
  await setObjectField(page, "x", 2286);
  await setObjectField(page, "y", 438);
  await setObjectField(page, "w", 48);
  await setObjectField(page, "h", 62);
  const exitWidthBefore = await objectNumber(page, "w");
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: 2334, y: 469 }, { x: 2380, y: 469 });
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='exit']").click();
  const exitWidthAfter = await objectNumber(page, "w");
  await setObjectField(page, "x", 2286);
  await setObjectField(page, "y", 438);

  await page.locator("[data-tool='plates']").click();
  await page.locator("[data-add-object]").click();
  await page.locator("[data-object-field='id']").fill("smoke-plate");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 940);
  await setObjectField(page, "y", 492);
  await setObjectField(page, "w", 70);
  await setObjectField(page, "h", 8);
  const plateWidthBefore = await objectNumber(page, "w");
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: 1010, y: 496 }, { x: 1080, y: 496 });
  const plateWidthAfter = await objectNumber(page, "w");
  await page.locator("[data-delete-object]").click();

  await dragToolToWorld(page, "drones", { x: 1340, y: 472 });
  await page.locator("[data-object-field='id']").fill("smoke-drone-lock");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='smoke-drone-lock']").click();
  const droneLockX = await objectNumber(page, "x");
  const droneLockY = await objectNumber(page, "y");
  const droneWidthBefore = await objectNumber(page, "w");
  const droneHeightBefore = await objectNumber(page, "h");
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: droneLockX, y: droneLockY + droneHeightBefore / 2 }, { x: droneLockX - 40, y: droneLockY + droneHeightBefore / 2 });
  const droneWidthAfter = await objectNumber(page, "w");
  await setObjectField(page, "x", 1338);
  await setObjectField(page, "y", 472);

  const exportJson = await page.locator("[data-export-json]").inputValue();
  assert(exportJson.includes("spark-strip-a"), "Export JSON did not include the edited hazard");
  const afterEditValidation = await validationStatusAllowingWarnings(page);
  const afterEditValidationText = await page.locator("[data-validation]").textContent();

  await page.locator("[data-tool='doors']").click();
  await clickWorld(page, { x: 1040, y: 180 });
  const doorYValue = await page.locator("[data-object-field='y']").inputValue();
  const doorPlacementValidation = await validationStatusAllowingWarnings(page);
  await page.locator("[data-delete-object]").click();
  const afterDoorDeleteValidation = await validationStatusAllowingWarnings(page);

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='smoke-drone-lock']").click();
  await page.locator("[data-object-field='axis']").selectOption("y");
  await page.locator("[data-object-field='pathStart']").fill("360");
  await dispatchChange(page.locator("[data-object-field='pathStart']"));
  await page.locator("[data-object-field='pathEnd']").fill("460");
  await dispatchChange(page.locator("[data-object-field='pathEnd']"));
  await page.locator("[data-object-field='speed']").fill("120");
  await dispatchChange(page.locator("[data-object-field='speed']"));
  const dronePeriod = Number(await page.locator("[data-object-field='period']").inputValue());
  const droneSpeedBeforeDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const droneHandleX = (await objectNumber(page, "x")) + (await objectNumber(page, "w")) / 2;
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: droneHandleX, y: 360 }, { x: droneHandleX, y: 340 });
  const dronePathStartAfterDrag = Number(await page.locator("[data-object-field='pathStart']").inputValue());
  const droneSpeedAfterDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const dronePeriodAfterDrag = Number(await page.locator("[data-object-field='period']").inputValue());
  const droneExportJson = await page.locator("[data-export-json]").inputValue();
  const droneExport = JSON.parse(droneExportJson)[0].drones.find((drone) => drone.id === "smoke-drone-lock");

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='smoke-monster']").click();
  const monsterSpeedBeforeDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const monsterPeriodBeforeDrag = Number(await page.locator("[data-object-field='period']").inputValue());
  const monsterHandleX = (await objectNumber(page, "x")) + (await objectNumber(page, "w")) / 2;
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: monsterHandleX, y: 440 }, { x: monsterHandleX, y: 420 });
  const monsterPathStartAfterDrag = Number(await page.locator("[data-object-field='pathStart']").inputValue());
  const monsterSpeedAfterDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const monsterPeriodAfterDrag = Number(await page.locator("[data-object-field='period']").inputValue());
  const monsterExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0].monsters.find((monster) => monster.id === "smoke-monster");

  await dragToolToWorld(page, "platforms", { x: 720, y: 420 });
  await page.locator("[data-object-field='id']").fill("smoke-platform-path");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await page.locator("[data-object-field='axis']").selectOption("y");
  const platformSpeedBeforeDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const platformPeriodBeforeDrag = Number(await page.locator("[data-object-field='period']").inputValue());
  const platformHandleX = (await objectNumber(page, "x")) + (await objectNumber(page, "w")) / 2;
  const platformPathStartBeforeDrag = Number(await page.locator("[data-object-field='pathStart']").inputValue());
  const platformPathEndBeforeDrag = Number(await page.locator("[data-object-field='pathEnd']").inputValue());
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: platformHandleX, y: platformPathStartBeforeDrag }, { x: platformHandleX, y: platformPathStartBeforeDrag - 20 });
  const platformPathStartAfterDrag = Number(await page.locator("[data-object-field='pathStart']").inputValue());
  const platformSpeedAfterDrag = Number(await page.locator("[data-object-field='speed']").inputValue());
  const platformPeriodAfterDrag = Number(await page.locator("[data-object-field='period']").inputValue());
  const platformResizeHeightBefore = await objectNumber(page, "h");
  const platformPathStartBeforeResize = await objectNumber(page, "pathStart");
  const platformPathEndBeforeResize = await objectNumber(page, "pathEnd");
  const platformResizeBottomY = (await objectNumber(page, "y")) + platformResizeHeightBefore;
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: platformHandleX, y: platformResizeBottomY }, { x: platformHandleX, y: platformResizeBottomY + 40 });
  const platformResizeHeightAfter = await objectNumber(page, "h");
  const platformPathStartAfterResize = await objectNumber(page, "pathStart");
  const platformPathEndAfterResize = await objectNumber(page, "pathEnd");
  const platformEndpointValidation = await validationStatusAllowingWarnings(page);
  const platformExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0].platforms.find(
    (platform) => platform.id === "smoke-platform-path"
  );

  await page.locator("[data-level-select]").selectOption("3");
  await openTab(page, "inspect");
  const timberCompletionValue = await page.locator("[data-level-field='completion']").inputValue();
  const timberInitialExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[3];
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='floorpiece-14']").click();
  const timberErosionTriggerValue = await page.locator("[data-object-field='erodesWith']").inputValue();
  const timberErosionTilesValue = await page.locator("[data-object-field='erosionTiles']").inputValue();
  await page.locator("[data-object-field='erosionTiles']").selectOption("2");
  const timberErosionTilesTwoExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[3].solids.find(
    (solid) => solid.id === "floorpiece-14"
  );
  await page.locator("[data-object-field='erosionTiles']").selectOption("1");
  const timberErosionRestoredExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[3].solids.find(
    (solid) => solid.id === "floorpiece-14"
  );
  const timberErosionValidation = await validationStatusAllowingWarnings(page);
  await page.locator("[data-level-select]").selectOption("0");

  await page.locator("[data-save-draft]").click();
  const storedDraft = await page.evaluate(() => window.localStorage.getItem("echo-shift-level-editor-draft-v1"));
  assert(storedDraft?.includes("spark-strip-a"), "Draft did not persist edited hazard");

  const parsedExport = JSON.parse(exportJson);
  parsedExport[0].name = "Smoke Edited";
  await openTab(page, "export");
  const fallbackImportLevel = {
    id: "portal-primer",
    index: 0,
    name: "Fallback ID Smoke",
    subtitle: "",
    soundtrackKey: "level-4",
    rewindDisabled: true,
    backgroundKey: "time-lab-prototype",
    start: { x: 60, y: 450 },
    exit: { x: 850, y: 438, w: 48, h: 62 },
    bounds: { x: 0, y: 0, w: 960, h: 540 },
    solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
    platforms: [{ id: "bad-lift", x: 420, y: 450, w: 120, h: 18, axis: "x", distance: -80, period: -12 }],
    drones: [{ id: "legacy-import-drone", x: 260, y: 420, w: 30, h: 24, axis: "y", distance: 50, period: 150, phase: 0.2 }],
    monsters: [{ id: "static-import-monster", kind: "sprout-hopper", x: 140, y: 430, w: 36, h: 30 }],
    hazards: [
      { x: 200, y: 496, w: 58, h: 4 },
      { id: "", x: 300, y: 496, w: 58, h: 4 }
    ],
    perfectEchoes: -2.6,
    medalFrames: { gold: 1800.4, silver: 2400.4 },
    hint: ""
  };
  await page.locator("[data-import-json]").fill(JSON.stringify(fallbackImportLevel, null, 2));
  await page.locator("[data-apply-import]").click();
  await page.waitForFunction(() => document.querySelector("[data-level-select] option")?.textContent?.includes("Fallback ID Smoke"));
  const fallbackImportExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const fallbackImportHazardIds = fallbackImportExport.hazards.map((hazard) => hazard.id);
  const fallbackImportPlatform = fallbackImportExport.platforms.find((platform) => platform.id === "bad-lift");
  const fallbackImportDrone = fallbackImportExport.drones.find((drone) => drone.id === "legacy-import-drone");
  const fallbackImportObjectIds = objectKinds.flatMap((kind) => (fallbackImportExport[kind] || []).map((object) => object.id));
  const fallbackImportValidation = await validationStatusAllowingWarnings(page);
  const fallbackImportValidationText = await page.locator("[data-validation]").textContent();
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='static-import-monster']").click();
  await setObjectField(page, "pathEnd", 220);
  const staticMonsterPathValidation = await validationStatusAllowingWarnings(page);
  const staticMonsterPathExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0].monsters.find(
    (monster) => monster.id === "static-import-monster"
  );
  const sourceDerivedImportLevel = {
    ...parsedExport[0],
    name: "Smoke Edited",
    platforms: [{ id: "source-anchored-platform", x: 420, y: 360, w: 100, h: 20, axis: "x", distance: 80, period: 120, phase: 0.4 }]
  };
  await openTab(page, "export");
  await page.locator("[data-import-json]").fill(JSON.stringify(sourceDerivedImportLevel, null, 2));
  await page.locator("[data-apply-import]").click();
  await page.waitForFunction(() => document.querySelector("[data-level-select] option")?.textContent?.includes("Smoke Edited"));
  const sourceDerivedImportExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const sourceDerivedImportPlatform = sourceDerivedImportExport.platforms.find((platform) => platform.id === "source-anchored-platform");
  const importedName = await page.locator("[data-level-select] option").first().textContent();
  const importedValidation = await validationStatusAllowingWarnings(page);
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-level-editor]").waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll(".editor-workspace, .editor-object-list, [data-inspector], [data-validation], textarea").forEach((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  });
  await page.screenshot({ path: `${outDir}/editor-desktop.png`, fullPage: true });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => window.localStorage.clear());
  const mobilePage = await mobile.newPage();
  collectConsole(mobilePage);
  await mobilePage.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await mobilePage.locator("[data-level-editor]").waitFor({ state: "visible" });
  await mobilePage.locator("[data-editor-canvas]").waitFor({ state: "visible" });
  await mobilePage.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll(".editor-workspace, .editor-object-list, [data-inspector], [data-validation], textarea").forEach((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  });
  await mobilePage.screenshot({ path: `${outDir}/editor-mobile.png`, fullPage: true });
  const mobileValidation = await validationStatusAllowingWarnings(mobilePage);
  await mobile.close();

  assert(!inactiveEditorVisible, "Editor should not activate for ?editor=0");
  assert(mainMenuFocusAfterArrow.includes("Tutorial"), `Expected real main menu ArrowDown to focus Tutorial, got ${mainMenuFocusAfterArrow}`);
  assert(menuOptionsNestedBackTitle === "Options", `Expected Escape from main menu Audio options to return to Options root, got ${menuOptionsNestedBackTitle}`);
  assert(menuOptionsRootBackTitle === "Main Menu", `Expected Escape from main menu Options root to return to Main Menu, got ${menuOptionsRootBackTitle}`);
  assert(!lockedEditorVisible, "Expected locked main menu to hide Level Editor before the secret code");
  assert(!lockedLevelSelectVisible, "Expected locked main menu to hide Level Select before the secret code");
  assert(secretEditorVisible, "Expected secret code to reveal Level Editor on the main menu");
  assert(secretLevelSelectVisible, "Expected secret code to reveal Level Select on the main menu");
  assert(secretUnlockAudioEffects?.includes("play:extraLife"), `Expected secret unlock to play extra-life SFX, got ${secretUnlockAudioEffects}`);
  assert(
    secretUnlockStatusText?.includes("Level Select") && secretUnlockStatusText.includes("Level Editor"),
    `Expected secret unlock status to announce revealed actions, got ${secretUnlockStatusText}`
  );
  assert(secretUnlockFocusText.includes("Level Select"), `Expected secret unlock to focus Level Select, got ${secretUnlockFocusText}`);
  assert(!reloadedEditorVisible, "Expected secret unlock to be forgotten after a plain page reload");
  assert(!reloadedLevelSelectVisible, "Expected Level Select unlock to be forgotten after a plain page reload");
  assert(!barePlaytestEditorVisible, "Expected bare ?playtestDraft=1 without a saved draft not to unlock Level Editor");
  assert(!barePlaytestLevelSelectVisible, "Expected bare ?playtestDraft=1 without a saved draft not to unlock Level Select");
  assert(levelSelectFocusAfterArrow.includes("Rainhouse Relay"), `Expected real Level Select ArrowDown to focus second room, got ${levelSelectFocusAfterArrow}`);
  assert(tutorialScoreEligible === "false", `Expected tutorial entry to be non-scoring, got ${tutorialScoreEligible}`);
  assert(levelSelectScoreEligible === "false", `Expected Level Select entry to be non-scoring, got ${levelSelectScoreEligible}`);
  assert(
    practicePropagationResult?.key === "GameScene" && practicePropagationResult.data?.scoreEligible === false,
    `Expected practice Next Room to preserve scoreEligible=false, got ${JSON.stringify(practicePropagationResult)}`
  );
  assert(
    gameplayGamepadResult.movingInput.right && gameplayGamepadResult.movingInput.jump,
    `Expected GameScene gameplay gamepad movement/jump input, got ${JSON.stringify(gameplayGamepadResult.movingInput)}`
  );
  assert(
    gameplayGamepadResult.pauseCountAfterHeld === 1,
    `Expected held gamepad pause to trigger once, got ${gameplayGamepadResult.pauseCountAfterHeld}`
  );
  assert(gameplayGamepadResult.rewindCount === 1, `Expected gamepad rewind to trigger once, got ${gameplayGamepadResult.rewindCount}`);
  assert(
    !gameplayGamepadResult.blockedInput.left &&
      !gameplayGamepadResult.blockedInput.right &&
      !gameplayGamepadResult.blockedInput.jump &&
      !gameplayGamepadResult.stillLatchedInput.left &&
      !gameplayGamepadResult.stillLatchedInput.right &&
      !gameplayGamepadResult.stillLatchedInput.jump &&
      gameplayGamepadResult.afterNeutralInput.left,
    `Expected gameplay gamepad input to require neutral after modal states, got ${JSON.stringify(gameplayGamepadResult)}`
  );
  assert(
    campaignFinalIntegrationResult.modalCalls === 1 &&
      campaignFinalIntegrationResult.isFinalArg === true &&
      campaignFinalIntegrationResult.scoreEligible === true &&
      campaignFinalIntegrationResult.scoreRecorded === true &&
      campaignFinalIntegrationResult.campaignSummary?.score === 3456 &&
      campaignFinalIntegrationResult.campaignSummary?.levels === 1 &&
      Array.isArray(campaignFinalIntegrationResult.leaderboardEntries) &&
      campaignFinalIntegrationResult.progressScore === 3456 &&
      campaignFinalIntegrationResult.unlocked === 5,
    `Expected normal campaign final clear to persist score and expose leaderboard options, got ${JSON.stringify(campaignFinalIntegrationResult)}`
  );
  assert(
    damagedProgressWarning?.includes("damaged") && damagedProgressBest?.includes("Progress unavailable") && !damagedProgressBest.includes("No clear"),
    `Expected damaged progress storage to render as damaged data, got warning=${damagedProgressWarning} best=${damagedProgressBest}`
  );
  assert(controlsCopy.includes("Start/Menu"), `Expected controls copy to document gamepad pause, got ${controlsCopy}`);
  assert(menuEditorUrl.includes("editor=1"), `Expected unlocked editor button to navigate to ?editor=1, got ${menuEditorUrl}`);
  assert(
    fractionalDraftLevelName === "Draft Index Smoke B",
    `Expected fractional draft currentIndex to normalize to second level, got ${fractionalDraftLevelName}`
  );
  assert(fractionalDraftValidation === "clean", `Expected clean validation after fractional draft boot, got ${fractionalDraftValidation}`);
  assert(
    legacyDraftDronePathStart === 100 && legacyDraftDronePathEnd === 180,
    `Expected legacy draft drone path to migrate from center/radius 140±40 to anchored 100-180, got ${legacyDraftDronePathStart}-${legacyDraftDronePathEnd}`
  );
  assert(
    legacyDraftLevelExport.motionModel === "anchored" && legacyDraftDroneExport?.x === 100 && legacyDraftDroneExport?.distance === 80,
    `Expected legacy draft export to be marked anchored with migrated x/distance values, got ${JSON.stringify(legacyDraftLevelExport)}`
  );
  assert(legacyBossExport?.weakSpot === "core", `Expected legacy clockwork boss to export core weak spot, got ${JSON.stringify(legacyBossExport)}`);
  assert(
    legacyBossExport && !("checkpoint" in legacyBossExport),
    `Expected legacy boss import/export to strip editor-authored checkpoint, got ${JSON.stringify(legacyBossExport)}`
  );
  assert(draftPlaytestUrl.includes("playtestDraft=1"), `Expected Playtest button to navigate to playtestDraft=1, got ${draftPlaytestUrl}`);
  assert(draftPlaytestUrl.includes("level=1"), `Expected Playtest button to preserve selected level=1, got ${draftPlaytestUrl}`);
  assert(
    draftPlaytestHudLevel?.includes("Draft Playtest Smoke"),
    `Expected draft playtest game HUD to use edited level name, got ${draftPlaytestHudLevel}`
  );
  assert(draftPlaytestMusicKey === "tutorial", `Expected draft playtest GameScene to request explicit tutorial soundtrack, got ${draftPlaytestMusicKey}`);
  assert(draftPlaytestAudioState === "playing", `Expected draft playtest audio to start after gate, got ${draftPlaytestAudioState}`);
  assert(draftPlaytestBackgroundKey === "level-2-rainhouse-relay-fit", `Expected draft playtest to render selected authored background, got ${draftPlaytestBackgroundKey}`);
  assert(draftPlaytestBackgroundRenderMode === "fit-level", `Expected draft playtest background to use fit-level render mode, got ${draftPlaytestBackgroundRenderMode}`);
  assert(draftPlaytestBackgroundDetailLayer === "off", `Expected draft playtest fit-level background to disable procedural detail layer, got ${draftPlaytestBackgroundDetailLayer}`);
  assert(draftPlaytestBackgroundPieces >= 1, `Expected draft playtest to create background image pieces, got ${draftPlaytestBackgroundPieces}`);
  assert(draftPlaytestRewindDisabled, "Expected draft playtest HUD rewind button to be disabled by level metadata");
  assert(draftPlaytestRetryCount === 0, `Expected finite-life draft playtest retry button to be absent, got ${draftPlaytestRetryCount}`);
  assert(draftPlaytestEchoTintsAfterR === "", `Expected disabled R key not to spawn echoes, got ${draftPlaytestEchoTintsAfterR}`);
  assert(draftPlaytestRewindToast?.includes("Rewind disabled"), `Expected disabled R key toast, got ${draftPlaytestRewindToast}`);
  assert(draftPlaytestIntroAfterT !== "active", `Expected removed T retry key not to restart level intro, got ${draftPlaytestIntroAfterT}`);
  assert(!draftPlaytestNoRetryToast?.includes("Retry unavailable"), `Expected removed T retry key not to show retry toast, got ${draftPlaytestNoRetryToast}`);
  assert(draftPlaytestModalAfterT === 0, `Expected disabled T key not to open a modal, got ${draftPlaytestModalAfterT}`);
  assert(draftPauseReplayCount === 0, `Expected pause modal to omit restart/replay, got ${draftPauseReplayCount} replay buttons`);
  assert(
    draftPauseOptionsNestedBackTitle === "Options",
    `Expected Escape from pause Audio options to return to Options root, got ${draftPauseOptionsNestedBackTitle}`
  );
  assert(
    draftPauseOptionsRootBackTitle === "Paused",
    `Expected Escape from pause Options root to return to pause modal, got ${draftPauseOptionsRootBackTitle}`
  );
  assert(draftReturnUrl.includes("editor=1"), `Expected draft Editor button to return to editor=1, got ${draftReturnUrl}`);
  assert(!draftReturnUrl.includes("playtestDraft=1"), `Expected draft Editor button to clean playtest flag, got ${draftReturnUrl}`);
  assert(!draftReturnUrl.includes("level=1"), `Expected draft Editor button to clean level flag, got ${draftReturnUrl}`);
  assert(mobileFiniteRetryCount === 0, `Expected mobile finite-life playtest retry button to be absent, got ${mobileFiniteRetryCount}`);
  assert(mobileFiniteRewindDisabled, "Expected mobile finite-life playtest rewind button to be disabled by level metadata");
  assert(gameOverTitle === "Game Over", `Expected finite-life exhaustion to show Game Over, got ${gameOverTitle}`);
  assert(gameOverReplayCount === 0, `Expected Game Over modal to omit replay/restart, got ${gameOverReplayCount} replay buttons`);
  assert(gameOverLevelSelectVisible, "Expected Game Over modal to offer Level Select");
  assert(gameOverRetryCount === 0, `Expected Game Over HUD retry button to be absent, got ${gameOverRetryCount}`);
  assert(gameOverRewindHidden, "Expected Game Over HUD rewind button to be hidden");
  assert(gameOverMenuHidden, "Expected Game Over HUD pause button to be hidden");
  assert(gameOverTouchControlsHidden, "Expected Game Over touch controls to be hidden");
  assert(gameOverTitleAfterKeys === "Game Over", `Expected R/T on Game Over to leave terminal modal open, got ${gameOverTitleAfterKeys}`);
  assert(gameOverLivesAfterKeys === "0", `Expected R/T on Game Over to leave lives at 0, got ${gameOverLivesAfterKeys}`);
  assert(gameOverDeathPhaseAfterKeys === "game-over", `Expected R/T on Game Over to preserve game-over diagnostic, got ${gameOverDeathPhaseAfterKeys}`);
  assert(gameOverLevelSelectRestartLives === "3", `Expected Level Select after Game Over to restart with 3 lives, got ${gameOverLevelSelectRestartLives}`);
  assert(mobileGameOverTitle === "Game Over", `Expected mobile Game Over title, got ${mobileGameOverTitle}`);
  assert(mobileGameOverReplayCount === 0, `Expected mobile Game Over modal to omit replay/restart, got ${mobileGameOverReplayCount} replay buttons`);
  assert(mobileGameOverRetryCount === 0, `Expected mobile Game Over HUD retry button to be absent, got ${mobileGameOverRetryCount}`);
  assert(mobileGameOverRewindHidden, "Expected mobile Game Over HUD rewind button to be hidden");
  assert(mobileGameOverMenuHidden, "Expected mobile Game Over HUD pause button to be hidden");
  assert(mobileGameOverTouchControlsHidden, "Expected mobile Game Over touch controls to be hidden");
  assert(directClearTitle === "Room Clear", `Expected direct clear draft to show Room Clear, got ${directClearTitle}`);
  assert(directClearReplayCount === 0, `Expected Room Clear modal to omit replay/restart, got ${directClearReplayCount} replay buttons`);
  assert(directClearNextVisible, "Expected Room Clear modal to keep Next Room as the primary progression action");
  assert(directClearProgress === null, `Expected direct draft clear not to write normal progress, got ${directClearProgress}`);
  assert(directClearLeaderboard === null, `Expected direct draft clear not to write leaderboard, got ${directClearLeaderboard}`);
  assert(corruptDraftBootedMenu, "Expected corrupt draft playtest data to fall back to normal menu instead of crashing");
  assert(corruptDraftHudCount === 0, `Expected corrupt draft playtest fallback not to boot game HUD, got ${corruptDraftHudCount}`);
  assert(mixedCorruptDraftBootedMenu, "Expected mixed corrupt draft playtest data to fall back to normal menu instead of truncating draft levels");
  assert(mixedCorruptDraftHudCount === 0, `Expected mixed corrupt draft fallback not to boot game HUD, got ${mixedCorruptDraftHudCount}`);
  assert(semanticCorruptDraftBootedMenu, "Expected semantically invalid draft playtest data to fall back to normal menu");
  assert(semanticCorruptDraftHudCount === 0, `Expected semantically invalid draft fallback not to boot game HUD, got ${semanticCorruptDraftHudCount}`);
  assert(unknownSoundtrackDraftBootedMenu, "Expected unknown draft soundtrack key to fall back to normal menu");
  assert(unknownSoundtrackDraftHudCount === 0, `Expected unknown soundtrack draft fallback not to boot game HUD, got ${unknownSoundtrackDraftHudCount}`);
  assert(menuSoundtrackDraftBootedMenu, "Expected menu draft soundtrack key to fall back to normal menu");
  assert(menuSoundtrackDraftHudCount === 0, `Expected menu soundtrack draft fallback not to boot game HUD, got ${menuSoundtrackDraftHudCount}`);
  assert(unknownBackgroundDraftBootedMenu, "Expected unknown draft background key to fall back to normal menu");
  assert(unknownBackgroundDraftHudCount === 0, `Expected unknown background draft fallback not to boot game HUD, got ${unknownBackgroundDraftHudCount}`);
  assert(
    mismatchedDraftSelectedLevel?.includes("Draft Array Second"),
    `Expected draft level select to launch array-position level, got ${mismatchedDraftSelectedLevel}`
  );
  assert(mismatchedDraftSelectedUrl.includes("level=1"), `Expected draft playtest URL to sync to level=1 after switching rooms, got ${mismatchedDraftSelectedUrl}`);
  assert(
    mismatchedDraftSelectedMusicKey === "level-2",
    `Expected draft auto soundtrack to use array slot 1 as level-2, got ${mismatchedDraftSelectedMusicKey}`
  );
  assert(
    mismatchedDraftReloadedLevel?.includes("Draft Array Second"),
    `Expected draft playtest refresh to preserve switched room, got ${mismatchedDraftReloadedLevel}`
  );
  assert(
    mismatchedDraftTitleEditorIndex === "1" && mismatchedDraftTitleEditorLevel?.includes("Draft Array Second"),
    `Expected Title -> Level Editor to preserve current draft room, got ${mismatchedDraftTitleEditorIndex} ${mismatchedDraftTitleEditorLevel}`
  );
  assert(
    mismatchedDraftTitlePlayLevel?.includes("Draft Array Second"),
    `Expected Title -> Play Draft to resume current draft room, got ${mismatchedDraftTitlePlayLevel}`
  );
  assert(mismatchedDraftReturnIndex === "1", `Expected draft editor return to preserve current array index 1, got ${mismatchedDraftReturnIndex}`);
  assert(
    mismatchedDraftReturnLevel?.includes("Draft Array Second"),
    `Expected draft editor return to reopen switched draft level, got ${mismatchedDraftReturnLevel}`
  );
  assert(
    mismatchedDraftReturnAutoOption?.includes("Auto: Echo Shift - Level 2"),
    `Expected editor auto soundtrack label to use array slot 1, got ${mismatchedDraftReturnAutoOption}`
  );
  assert(mismatchedDraftFirstCompleteTitle === "Room Clear", `Expected non-final array slot to show Room Clear, got ${mismatchedDraftFirstCompleteTitle}`);
  assert(mismatchedDraftFirstNextVisible, "Expected non-final array slot to offer Next Room despite authored index 9");
  assert(mismatchedDraftLastCompleteTitle === "Timeline Complete", `Expected final array slot to show Timeline Complete, got ${mismatchedDraftLastCompleteTitle}`);
  assert(mismatchedDraftLastNextCount === 0, `Expected final array slot not to offer Next Room, got ${mismatchedDraftLastNextCount}`);
  assert(
    mismatchedDraftCompletionProgress === null,
    `Expected final draft completion not to write normal progress, got ${mismatchedDraftCompletionProgress}`
  );
  assert(
    mismatchedDraftCompletionLeaderboard === null,
    `Expected final draft completion not to write leaderboard, got ${mismatchedDraftCompletionLeaderboard}`
  );
  assert(keyboardNavigationFocus === "slider", `Expected ArrowDown to move menu focus to range input, got ${keyboardNavigationFocus}`);
  assert(keyboardNavigationMoves === 1, `Expected one keyboard navigation move before range test, got ${keyboardNavigationMoves}`);
  assert(rangeFocusAfterArrow === "slider", `Expected ArrowRight on focused range to keep focus on range, got ${rangeFocusAfterArrow}`);
  assert(rangeValueAfterArrow !== "5", `Expected ArrowRight on focused range to adjust native value, got ${rangeValueAfterArrow}`);
  assert(movesAfterRangeArrow === keyboardNavigationMoves, "Expected ArrowRight on focused range not to trigger menu navigation");
  assert(trappedTabFocus === "first", `Expected trapped Tab from final modal control to wrap to first, got ${trappedTabFocus}`);
  assert(
    gamepadHarnessResult.focusAfterHeldAxis === "pad-first",
    `Expected held gamepad axis not to move focus on menu open, got ${gamepadHarnessResult.focusAfterHeldAxis}`
  );
  assert(
    gamepadHarnessResult.clicksAfterHeldButton === 0,
    `Expected held gamepad confirm not to activate on menu open, got ${gamepadHarnessResult.clicksAfterHeldButton}`
  );
  assert(
    gamepadHarnessResult.focusAfterHeldAxisRepeatWindow === "pad-first",
    `Expected held gamepad axis not to auto-repeat before neutral, got ${gamepadHarnessResult.focusAfterHeldAxisRepeatWindow}`
  );
  assert(
    gamepadHarnessResult.clicksAfterFreshPress === 1,
    `Expected fresh gamepad confirm to activate once, got ${gamepadHarnessResult.clicksAfterFreshPress}`
  );
  assert(
    gamepadHarnessResult.rangeAfterHeldAxis === "5",
    `Expected held gamepad axis not to adjust focused range before neutral, got ${gamepadHarnessResult.rangeAfterHeldAxis}`
  );
  assert(
    gamepadHarnessResult.rangeAfterFreshAxis !== "5",
    `Expected fresh gamepad axis to adjust focused range, got ${gamepadHarnessResult.rangeAfterFreshAxis}`
  );
  assert(
    gamepadHarnessResult.rangeFocusAfterVerticalAxis === "range-last",
    `Expected vertical gamepad axis to move focus away from range, got ${gamepadHarnessResult.rangeFocusAfterVerticalAxis}`
  );
  assert(
    gamepadHarnessResult.textFocusAfterAxis === "text-last",
    `Expected gamepad axis to move focus away from text input, got ${gamepadHarnessResult.textFocusAfterAxis}`
  );
  assert(leaderboardHarnessResult.entries.length === 1, `Expected one saved leaderboard entry, got ${leaderboardHarnessResult.entries.length}`);
  assert(
    leaderboardHarnessResult.entries[0]?.nickname === "Ace",
    `Expected sanitized leaderboard nickname Ace, got ${leaderboardHarnessResult.entries[0]?.nickname}`
  );
  assert(
    leaderboardHarnessResult.entries[0]?.score === 9000,
    `Expected campaign summary score 9000 in leaderboard, got ${leaderboardHarnessResult.entries[0]?.score}`
  );
  assert(leaderboardHarnessResult.buttonText === "Saved", `Expected saved leaderboard button label, got ${leaderboardHarnessResult.buttonText}`);
  assert(leaderboardHarnessResult.buttonDisabled, "Expected leaderboard save button to disable after save");
  assert(leaderboardHarnessResult.inputDisabled, "Expected leaderboard name input to disable after save");
  assert(leaderboardHarnessResult.listText.includes("Ace"), `Expected saved leaderboard list to include Ace, got ${leaderboardHarnessResult.listText}`);
  assert(
    leaderboardHarnessResult.initialFinalFocus.includes("Save Score"),
    `Expected final leaderboard modal to focus Save Score instead of scrolling to the exit row, got ${leaderboardHarnessResult.initialFinalFocus}`
  );
  assert(leaderboardHarnessResult.roomCompleteCoreText === "4", `Expected room-clear cores cell to show carried count 4, got ${leaderboardHarnessResult.roomCompleteCoreText}`);
  assert(!leaderboardHarnessResult.roomCompleteCoreText.includes("/"), `Expected room-clear cores cell to omit map total, got ${leaderboardHarnessResult.roomCompleteCoreText}`);
  assert(leaderboardHarnessResult.tutorialCoreText === "0", `Expected tutorial-complete cores cell to show carried count 0, got ${leaderboardHarnessResult.tutorialCoreText}`);
  assert(!leaderboardHarnessResult.tutorialCoreText.includes("/"), `Expected tutorial-complete cores cell to omit map total, got ${leaderboardHarnessResult.tutorialCoreText}`);
  assert(leaderboardHarnessResult.finalCoreText === "4", `Expected final complete cores cell to show carried count 4, got ${leaderboardHarnessResult.finalCoreText}`);
  assert(!leaderboardHarnessResult.finalCoreText.includes("/"), `Expected final complete cores cell to omit map total, got ${leaderboardHarnessResult.finalCoreText}`);
  assert(leaderboardHarnessResult.summaryTopVisible, "Expected final leaderboard summary to stay visible when the modal opens");
  for (const [name, snapshot] of Object.entries({
    pause: leaderboardHarnessResult.pauseDialog,
    options: leaderboardHarnessResult.optionsDialog,
    tutorial: leaderboardHarnessResult.tutorialDialog,
    gameOver: leaderboardHarnessResult.gameOverDialog
  })) {
    assert(snapshot.role === "dialog", `Expected ${name} modal to expose role=dialog, got ${JSON.stringify(snapshot)}`);
    assert(snapshot.modal === "true", `Expected ${name} modal to expose aria-modal=true, got ${JSON.stringify(snapshot)}`);
    assert(snapshot.label, `Expected ${name} modal to have an aria-labelledby heading, got ${JSON.stringify(snapshot)}`);
  }
  assert(leaderboardHarnessResult.finalDialogRole === "dialog", `Expected final modal role=dialog, got ${leaderboardHarnessResult.finalDialogRole}`);
  assert(leaderboardHarnessResult.finalDialogModal === "true", `Expected final modal aria-modal=true, got ${leaderboardHarnessResult.finalDialogModal}`);
  assert(
    leaderboardHarnessResult.finalDialogLabel === "Timeline Complete",
    `Expected final modal to be labelled by its heading, got ${leaderboardHarnessResult.finalDialogLabel}`
  );
  assert(leaderboardHarnessResult.failedEntryStorage === null, "Expected failed leaderboard save not to persist storage");
  assert(leaderboardHarnessResult.failedButtonText === "Try Again", `Expected failed leaderboard save button to offer retry, got ${leaderboardHarnessResult.failedButtonText}`);
  assert(!leaderboardHarnessResult.failedButtonDisabled, "Expected failed leaderboard save button to remain enabled");
  assert(!leaderboardHarnessResult.failedInputDisabled, "Expected failed leaderboard save input to remain enabled");
  assert(leaderboardHarnessResult.failedToastRole === "status", `Expected leaderboard failure toast to use role=status, got ${leaderboardHarnessResult.failedToastRole}`);
  assert(
    leaderboardHarnessResult.failedToastLive === "polite",
    `Expected leaderboard failure toast to be an aria-live region, got ${leaderboardHarnessResult.failedToastLive}`
  );
  assert(
    leaderboardHarnessResult.failedToastText.includes("Could not save"),
    `Expected leaderboard failure toast to announce save failure, got ${leaderboardHarnessResult.failedToastText}`
  );
  assert(
    leaderboardHarnessResult.failedToastTextAfterDismiss === "",
    `Expected dismissed leaderboard failure toast to clear live text, got ${leaderboardHarnessResult.failedToastTextAfterDismiss}`
  );
  assert(
    leaderboardHarnessResult.failedToastTextAfterRepeat.includes("Could not save"),
    `Expected repeated leaderboard failure to rewrite live text, got ${leaderboardHarnessResult.failedToastTextAfterRepeat}`
  );
  assert(!leaderboardHarnessResult.damagedSaveOk, "Expected malformed leaderboard storage not to be overwritten as a successful save");
  assert(leaderboardHarnessResult.damagedStorage === "{broken", `Expected malformed leaderboard storage to remain untouched, got ${leaderboardHarnessResult.damagedStorage}`);
  assert(!leaderboardHarnessResult.mixedDamagedSaveOk, "Expected partially malformed leaderboard arrays not to be overwritten as successful saves");
  assert(
    leaderboardHarnessResult.mixedDamagedAfterSave.includes('"bad"') && !leaderboardHarnessResult.mixedDamagedAfterSave.includes('"Mixed"'),
    `Expected partially malformed leaderboard storage to remain untouched, got ${leaderboardHarnessResult.mixedDamagedAfterSave}`
  );
  assert(
    leaderboardHarnessResult.damagedListText.includes("damaged") && !leaderboardHarnessResult.damagedListText.includes("No local campaign scores yet"),
    `Expected damaged leaderboard state to render as damaged data, got ${leaderboardHarnessResult.damagedListText}`
  );
  assert(
    leaderboardHarnessResult.modalText.includes("Campaign Score"),
    `Expected final completion modal to show campaign summary, got ${leaderboardHarnessResult.modalText}`
  );
  assert(levelOptions > 0, `Expected at least one editable level, got ${levelOptions}`);
  assert(
    levelOptions === initialExportLevelCount,
    `Expected level selector count to match export JSON level count: ${levelOptions} !== ${initialExportLevelCount}`
  );
  assert(!initialValidationText?.includes("error"), `Expected no initial validation errors, got ${initialValidation}: ${initialValidationText}`);
  assert(leftSidebarOverflowY === "auto", `Expected left sidebar to scroll independently, got overflow-y ${leftSidebarOverflowY}`);
  assert(toolbarOverflowY === "auto", `Expected toolbar panel to scroll independently, got overflow-y ${toolbarOverflowY}`);
  assert(inspectorOverflowY === "auto", `Expected right inspector to scroll independently, got overflow-y ${inspectorOverflowY}`);
  assert(
    ["Cursor", "Structure", "Hazards", "Logic", "Actors", "Markers"].every((label) => paletteGroupLabels.includes(label)),
    `Expected grouped palette labels, got ${paletteGroupLabels.join(", ")}`
  );
  assert(soundtrackOptions.some((option) => option.includes("Auto: Echo Shift - Level 1")), `Expected auto soundtrack option, got ${soundtrackOptions.join(", ")}`);
  assert(soundtrackOptions.some((option) => option.includes("Echo Shift - Tutorial")), `Expected selectable tutorial MP3 option, got ${soundtrackOptions.join(", ")}`);
  assert(soundtrackExportKey === "tutorial", `Expected selected soundtrack key to export as tutorial, got ${soundtrackExportKey}`);
  assert(!rewindDisabledInitially, "Expected rewind disable toggle to default off for source levels");
  assert(rewindDisabledExport === true, `Expected disabled rewind metadata to export, got ${rewindDisabledExport}`);
  assert(
    backgroundOptions.some((option) => option.includes("Auto: Springtide Garden Full-Plate")),
    `Expected auto background option, got ${backgroundOptions.join(", ")}`
  );
  assert(backgroundOptions.some((option) => option.includes("4800x1440")), `Expected Springtide full-plate dimensions in options, got ${backgroundOptions.join(", ")}`);
  assert(backgroundOptions.some((option) => option.includes("1694x929")), `Expected Springtide background dimensions in options, got ${backgroundOptions.join(", ")}`);
  assert(backgroundOptions.some((option) => option.includes("1672x941")), `Expected background dimensions in options, got ${backgroundOptions.join(", ")}`);
  assert(backgroundOptions.some((option) => option.includes("1881x836")), `Expected Level 1 background dimensions in options, got ${backgroundOptions.join(", ")}`);
  assert(backgroundExportKey === "time-lab-prototype", `Expected selected background key to export as time-lab-prototype, got ${backgroundExportKey}`);
  assert(
    ambiencePresetOptions.some((option) => option.includes("Security Scanner")),
    `Expected ambience preset options, got ${ambiencePresetOptions.join(", ")}`
  );
  assert(
    ambienceExport?.preset === "security" && ambienceExport.color === "#ff4f6d" && ambienceExport.intensity === 0.65,
    `Expected ambience settings to export, got ${JSON.stringify(ambienceExport)}`
  );
  assert(scoreSettingsText?.includes("Lives"), `Expected score settings to label Lives, got ${scoreSettingsText}`);
  assert(scoreSettingsText?.includes("Core Score"), `Expected score settings to label Core Score, got ${scoreSettingsText}`);
  assert(!scoreSettingsText?.includes("Death Penalty"), `Expected score settings to omit Death Penalty, got ${scoreSettingsText}`);
  assert(scoreSettingsText?.includes("Bonus Target"), `Expected score settings to label Bonus Target, got ${scoreSettingsText}`);
  assert(scoreSummaryText?.includes("lives") && scoreSummaryText.includes("under 900s"), `Expected score summary to explain lives and Level 1 time target, got ${scoreSummaryText}`);
  assert(zoomBeforeWheel !== zoomAfterWheel, `Expected wheel input to zoom canvas, got ${zoomBeforeWheel} -> ${zoomAfterWheel}`);
  assert(zoomAfterWheel !== zoomAfterButton, `Expected zoom-out button to change zoom, got ${zoomAfterWheel} -> ${zoomAfterButton}`);
  assert(viewAfterPan.x !== viewBeforePan.x, `Expected Alt-drag pan mode to change view x: ${viewBeforePan.x} -> ${viewAfterPan.x}`);
  assert(dragDropLaserExport.includes("smoke-laser-drop"), "Expected palette drag/drop to create smoke-laser-drop");
  assert(activeToolAfterDrop === "select", `Expected drag/drop creation to return toolbar to select mode, got ${activeToolAfterDrop}`);
  assert(!keyboardDeleteExport.includes("smoke-laser-drop"), "Expected keyboard Delete to remove selected smoke-laser-drop");
  assert(
    !keyboardDeleteValidationText?.toLowerCase().includes("error") && !keyboardDeleteValidationText?.includes("smoke-laser-drop"),
    `Expected keyboard delete cleanup to avoid smoke-laser-drop validation errors, got ${keyboardDeleteValidation}: ${keyboardDeleteValidationText}`
  );
  assert(floorPresetId.startsWith("floorpiece-"), `Expected floor preset id to use non-reserved floorpiece stem, got ${floorPresetId}`);
  assert(floorPresetWidth === 320 && floorPresetHeight === 20, `Expected floor preset 320x20, got ${floorPresetWidth}x${floorPresetHeight}`);
  assert(floorPresetSprite === "floor", `Expected floor preset to export sprite floor, got ${floorPresetSprite}`);
  assert(floorMaterialOptions.some((option) => option.includes("Glass Energy")), `Expected terrain material options, got ${floorMaterialOptions.join(", ")}`);
  assert(floorPresetMaterialDefault === "", `Expected new floor material to start in legacy/default mode, got ${floorPresetMaterialDefault}`);
  assert(floorPresetMaterial === "sand-ruin", `Expected selected floor material to export as sand-ruin, got ${floorPresetMaterial}`);
  assert(floorCollisionOptions.some((option) => option.includes("top-only")), `Expected solid collision options, got ${floorCollisionOptions.join(", ")}`);
  assert(floorPresetCollisionDefault === "", `Expected new floor collision to start in default/solid mode, got ${floorPresetCollisionDefault}`);
  assert(floorPresetCollision === "top-only", `Expected selected floor collision to export as top-only, got ${floorPresetCollision}`);
  assert(floorDecorOptions.some((option) => option.includes("High")), `Expected solid decor density options, got ${floorDecorOptions.join(", ")}`);
  assert(floorPresetDecorDefault === "", `Expected new floor decor density to start in default/auto mode, got ${floorPresetDecorDefault}`);
  assert(floorPresetDecorDensity === "high", `Expected selected floor decor density to export as high, got ${floorPresetDecorDensity}`);
  assert(clickDragFloorWidth === 320 && clickDragFloorHeight === 20, `Expected click-drag floor preset 320x20, got ${clickDragFloorWidth}x${clickDragFloorHeight}`);
  assert(userFloorId.startsWith("floorpiece-"), `Expected user floor id to avoid structural floor-* exemption, got ${userFloorId}`);
  assert(
    userFloorOutOfBoundsValidation === "issues" && userFloorOutOfBoundsText?.includes(`${userFloorId} is outside level bounds`),
    `Expected user-created floor outside bounds to warn, got ${userFloorOutOfBoundsValidation}: ${userFloorOutOfBoundsText}`
  );
  assert(
    !userFloorCleanupText?.toLowerCase().includes("error") &&
      !userFloorCleanupText?.includes(userFloorId),
    `Expected out-of-bounds floor cleanup to remove its object-specific validation warning, got ${userFloorCleanupValidation}: ${userFloorCleanupText}`
  );
  assert(wallPresetId.startsWith("wall-"), `Expected wall preset id to use wall stem, got ${wallPresetId}`);
  assert(wallPresetWidth === 20 && wallPresetHeight === 180, `Expected wall preset 20x180, got ${wallPresetWidth}x${wallPresetHeight}`);
  assert(wallPresetSprite === "wall", `Expected wall preset to export sprite wall, got ${wallPresetSprite}`);
  assert(blockPresetId.startsWith("block-"), `Expected block preset id to use block stem, got ${blockPresetId}`);
  assert(blockPresetWidth === 80 && blockPresetHeight === 80, `Expected block preset 80x80, got ${blockPresetWidth}x${blockPresetHeight}`);
  assert(blockPresetSprite === "block", `Expected block preset to export sprite block, got ${blockPresetSprite}`);
  assert(clearedSpriteValue === "auto", `Expected cleared solid sprite to export auto sentinel, got ${clearedSpriteValue}`);
  assert(surfacePlateBottom === 500, `Expected dropped plate bottom to snap flush to floor y=500, got ${surfacePlateY}+h=${surfacePlateBottom}`);
  assert(duplicatedPlateBottom === 500, `Expected duplicated plate bottom to stay flush to floor y=500, got ${duplicatedPlateY}+h=${duplicatedPlateBottom}`);
  assert(keyboardDuplicatedPlateId !== surfacePlateId, `Expected Ctrl+C duplicate to select a new plate id, got ${keyboardDuplicatedPlateId}`);
  assert(
    keyboardDuplicatedPlateBottom === 500,
    `Expected Ctrl+C duplicated plate bottom to stay flush to floor y=500, got ${keyboardDuplicatedPlateY}+h=${keyboardDuplicatedPlateBottom}`
  );
  assert(surfaceLaserBottom === 520, `Expected dropped laser to preserve explicit beam placement, got ${surfaceLaserY}+h=${surfaceLaserBottom}`);
  assert(
    upperTopOnlyRenderOrderIndex >= 0 && lowerSolidRenderOrderIndex >= 0,
    `Expected editor solid render order diagnostics to include overlap fixture, got ${editorSolidRenderOrder}`
  );
  assert(
    lowerSolidRenderOrderIndex > upperTopOnlyRenderOrderIndex,
    `Expected editor to draw lower solid floor after higher top-only floor, got ${editorSolidRenderOrder}`
  );
  assert(generatedGlobalLaserId !== "laser-1", `Expected generated laser id to avoid cross-kind laser-1 collision, got ${generatedGlobalLaserId}`);
  assert(
    generatedGlobalObjectIds.length === new Set(generatedGlobalObjectIds).size,
    `Expected generated editor IDs to remain level-unique, got ${generatedGlobalObjectIds.join(", ")}`
  );
  assert(
    generatedGlobalIdValidation === "clean",
    `Expected clean validation after global ID generation, got ${generatedGlobalIdValidation}: ${generatedGlobalIdText}`
  );
  assert(
    generatedGlobalCleanupValidation === "clean",
    `Expected clean validation after global ID generation cleanup, got ${generatedGlobalCleanupValidation}`
  );
  assert(toolkitValidation === "clean", `Expected clean validation after entity toolkit creation, got ${toolkitValidation}`);
  assert(toolkitLevel.oneWays.some((item) => item.id === "smoke-one-way"), "Expected one-way platform to export");
  assert(toolkitConveyor?.direction === -1 && toolkitConveyor?.speed === 2.5, `Expected conveyor settings to export, got ${JSON.stringify(toolkitConveyor)}`);
  assert(toolkitConveyorBottom === 500, `Expected conveyor to snap flush to floor y=500, got bottom ${toolkitConveyorBottom}`);
  assert(toolkitLaunch?.powerX === 1.5 && toolkitLaunch?.powerY === 14, `Expected launch pad settings to export, got ${JSON.stringify(toolkitLaunch)}`);
  assert(toolkitTimer?.duration === 150, `Expected timed switch duration to export, got ${JSON.stringify(toolkitTimer)}`);
  assert(toolkitSensor?.actors === "both", `Expected echo sensor actor mode to export, got ${JSON.stringify(toolkitSensor)}`);
  assert(
    toolkitSweeper?.axis === "y" &&
      toolkitSweeper?.distance === 160 &&
      toolkitSweeper?.period === 120 &&
      toolkitSweeper?.disabledBy?.includes("smoke-timer"),
    `Expected moving laser path/link settings to export, got ${JSON.stringify(toolkitSweeper)}`
  );
  assert(
    movingLaserSpeedBeforePathResize === 160 &&
      movingLaserSpeedAfterPathResize === movingLaserSpeedBeforePathResize &&
      movingLaserPeriodBeforePathResize === 90 &&
      movingLaserPeriodAfterPathResize === 120,
    `Expected typed moving-laser path edits to preserve speed and recalculate period, got ${JSON.stringify({
      movingLaserSpeedBeforePathResize,
      movingLaserSpeedAfterPathResize,
      movingLaserPeriodBeforePathResize,
      movingLaserPeriodAfterPathResize
    })}`
  );
  assert(
    toolkitDrone?.disabledBy?.includes("smoke-timer"),
    `Expected drone disabledBy setting to export, got ${JSON.stringify(toolkitDrone)}`
  );
  assert(toolkitCoreDefaultSize === "small", `Expected new editor cores to default to small, got ${toolkitCoreDefaultSize}`);
  assert(toolkitCoreSize === "large", `Expected core size selector to switch to large, got ${toolkitCoreSize}`);
  assert(
    toolkitCoreWidthFieldCount === 0 && toolkitCoreHeightFieldCount === 0,
    `Expected selected core inspector to hide fixed W/H fields, got w=${toolkitCoreWidthFieldCount} h=${toolkitCoreHeightFieldCount}`
  );
  assert(
    smokeCoreBeforeLockDrag?.w === smokeCoreAfterLockDrag?.w && smokeCoreBeforeLockDrag?.h === smokeCoreAfterLockDrag?.h,
    `Expected core edge drag not to resize dimensions, got before ${JSON.stringify(smokeCoreBeforeLockDrag)} after ${JSON.stringify(smokeCoreAfterLockDrag)}`
  );
  assert(
    smokeDragCreatedCore?.w === 20 && smokeDragCreatedCore?.h === 20,
    `Expected core click-drag creation to keep default fixed dimensions, got ${JSON.stringify(smokeDragCreatedCore)}`
  );
  assert(toolkitCore?.size === "large", `Expected core size to export, got ${JSON.stringify(toolkitCore)}`);
  assert(requiredCoreDefaultSize === "small", `Expected unlinked required-core candidate to default to small, got ${requiredCoreDefaultSize}`);
  assert(inferredRequiredCoreSize === "large", `Expected door-required core inspector to show inferred large size, got ${inferredRequiredCoreSize}`);
  assert(inferredRequiredCoreAfterSmall === "large", `Expected door-required core inspector to keep showing inferred large after selecting small, got ${inferredRequiredCoreAfterSmall}`);
  assert(toolkitRequiredCore && toolkitRequiredCore.size === undefined, `Expected inferred large core to omit explicit size, got ${JSON.stringify(toolkitRequiredCore)}`);
  assert(toolkitRequiredDoor?.requiresCore === "smoke-required-core", `Expected door to export required core link, got ${JSON.stringify(toolkitRequiredDoor)}`);
  assert(requiredDoorOrientation === "horizontal", `Expected door orientation selector to switch to horizontal, got ${requiredDoorOrientation}`);
  assert(
    toolkitRequiredDoor?.orientation === "horizontal" && toolkitRequiredDoor?.opensWith?.includes("smoke-boss"),
    `Expected door to export horizontal boss dependency, got ${JSON.stringify(toolkitRequiredDoor)}`
  );
  assert(bossDoorDependencyValidation === "clean", `Expected boss-dependent door validation to be clean, got ${bossDoorDependencyValidation}`);
  assert(
    missingDroneTriggerValidation === "issues" && missingDroneTriggerText?.includes("smoke-disabled-drone references missing trigger missing-drone-trigger"),
    `Expected missing drone trigger validation, got ${missingDroneTriggerValidation}: ${missingDroneTriggerText}`
  );
  assert(
    movingLaserPathWidthAfterDrag === movingLaserPathWidthBeforeDrag && movingLaserPathHeightAfterDrag === movingLaserPathHeightBeforeDrag,
    `Expected moving-laser endpoint drag to preserve size ${movingLaserPathWidthBeforeDrag}x${movingLaserPathHeightBeforeDrag}, got ${movingLaserPathWidthAfterDrag}x${movingLaserPathHeightAfterDrag}`
  );
  assert(
    movingLaserPathStartAfterDrag === movingLaserPathStartBeforeDrag - 40 && movingLaserPathEndAfterDrag === movingLaserPathEndBeforeDrag,
    `Expected moving-laser start endpoint drag to move start path only, got ${movingLaserPathStartAfterDrag}-${movingLaserPathEndAfterDrag}`
  );
  assert(
    movingLaserSpeedAfterDrag === movingLaserSpeedBeforeDrag && movingLaserPeriodAfterDrag > movingLaserPeriodBeforeDrag,
    `Expected dragging moving-laser endpoint to preserve speed and lengthen period, got ${JSON.stringify({
      speed: [movingLaserSpeedBeforeDrag, movingLaserSpeedAfterDrag],
      period: [movingLaserPeriodBeforeDrag, movingLaserPeriodAfterDrag]
    })}`
  );
  assert(
    movingLaserResizeHeightAfter > movingLaserResizeHeightBefore,
    `Expected bottom moving-laser handle drag to resize height, got ${movingLaserResizeHeightBefore} -> ${movingLaserResizeHeightAfter}`
  );
  assert(
    movingLaserPathStartAfterResize === movingLaserPathStartBeforeResize && movingLaserPathEndAfterResize === movingLaserPathEndBeforeResize,
    `Expected moving-laser resize to preserve path ${movingLaserPathStartBeforeResize}-${movingLaserPathEndBeforeResize}, got ${movingLaserPathStartAfterResize}-${movingLaserPathEndAfterResize}`
  );
  assert(movingLaserHandleCleanupValidation === "clean", `Expected clean validation after moving laser handle cleanup, got ${movingLaserHandleCleanupValidation}`);
  assert(toolkitCrate && toolkitCrateBottom === 480, `Expected crate to export and snap flush to floor, got ${JSON.stringify(toolkitCrate)} bottom ${toolkitCrateBottom}`);
  assert(
    monsterDefaultKind === "sprout-hopper" &&
      monsterDefaultAxis === "x" &&
      monsterDefaultSpeed === 80 &&
      monsterDefaultScore === 200 &&
      monsterDefaultPathEnd - monsterDefaultPathStart === 120,
    `Expected new monsters to use sprout defaults, got ${JSON.stringify({
      monsterDefaultKind,
      monsterDefaultAxis,
      monsterDefaultSpeed,
      monsterDefaultScore,
      path: [monsterDefaultPathStart, monsterDefaultPathEnd]
    })}`
  );
  assert(
    monsterWispAxis === "y" && monsterWispSpeed === 58 && monsterWispScore === 200 && monsterWispPathEnd - monsterWispPathStart === 96,
    `Expected changing monster kind to glasswing-wisp to apply wisp motion defaults, got ${JSON.stringify({
      monsterWispAxis,
      monsterWispSpeed,
      monsterWispScore,
      path: [monsterWispPathStart, monsterWispPathEnd]
    })}`
  );
  assert(
    toolkitMonster?.kind === "glasswing-wisp" &&
      toolkitMonster?.axis === "y" &&
      toolkitMonster?.distance === 60 &&
      Number.isFinite(toolkitMonster?.period) &&
      toolkitMonster?.score === 200,
    `Expected monster path settings to export, got ${JSON.stringify(toolkitMonster)}`
  );
  assert(bossStormWeakSpot === "bottom", `Expected new storm boss weak spot to default to bottom, got ${bossStormWeakSpot}`);
  assert(bossSoundtrackOptions.some((option) => option.includes("Auto: Echo Shift - Boss")), `Expected boss auto soundtrack option, got ${bossSoundtrackOptions.join(", ")}`);
  assert(bossSoundtrackOptions.some((option) => option.includes("Echo Shift - Level 3")), `Expected boss soundtrack options to include level tracks, got ${bossSoundtrackOptions.join(", ")}`);
  assert(bossCryoWeakSpot === "bottom", `Expected cryo boss weak spot to switch to bottom, got ${bossCryoWeakSpot}`);
  assert(
    toolkitBoss?.kind === "cryo-conservator" && toolkitBoss?.weakSpot === "bottom" && toolkitBoss?.soundtrackKey === "level-3",
    `Expected boss kind and weak spot to export, got ${JSON.stringify(toolkitBoss)}`
  );
  assert(bossCheckpointFieldCount === 0, `Expected boss inspector not to expose checkpoint fields, got ${bossCheckpointFieldCount}`);
  assert(bossXAfterDrag !== bossXBeforeDrag && bossYAfterDrag !== bossYBeforeDrag, `Expected boss arena drag to move boss, got ${bossXBeforeDrag},${bossYBeforeDrag} -> ${bossXAfterDrag},${bossYAfterDrag}`);
  assert(!("checkpoint" in toolkitBoss), `Expected new boss to export without checkpoint, got ${JSON.stringify(toolkitBoss)}`);
  assert(duplicatedBossId !== "smoke-boss", `Expected duplicated boss to get a new id, got ${duplicatedBossId}`);
  assert(
    toolkitDuplicatedBoss?.x === duplicatedBossX && toolkitDuplicatedBoss?.y === duplicatedBossY,
    `Expected duplicated boss to export at copied arena position, got boss ${duplicatedBossX},${duplicatedBossY} ${JSON.stringify(toolkitDuplicatedBoss)}`
  );
  assert(
    toolkitDuplicatedBoss && !("checkpoint" in toolkitDuplicatedBoss),
    `Expected duplicated boss to export without checkpoint, got ${JSON.stringify(toolkitDuplicatedBoss)}`
  );
  assert(renamedTimerExists, "Expected timed switch rename to export");
  assert(
    renamedSweeper?.disabledBy?.includes("smoke-timer-renamed") && !renamedSweeper?.disabledBy?.includes("smoke-timer"),
    `Expected moving laser disabledBy reference to follow timed switch rename, got ${JSON.stringify(renamedSweeper)}`
  );
  assert(
    renamedDrone?.disabledBy?.includes("smoke-timer-renamed") && !renamedDrone?.disabledBy?.includes("smoke-timer"),
    `Expected drone disabledBy reference to follow timed switch rename, got ${JSON.stringify(renamedDrone)}`
  );
  assert(renameReferenceValidation === "clean", `Expected clean validation after trigger rename, got ${renameReferenceValidation}`);
  assert(
    !deletedReferenceSweeper?.disabledBy?.length && !deletedReferenceDrone?.disabledBy?.length,
    `Expected deleted trigger references to be cleaned from moving laser and drone, got ${JSON.stringify(deletedReferenceSweeper)} / ${JSON.stringify(deletedReferenceDrone)}`
  );
  assert(deletedReferenceValidation === "clean", `Expected clean validation after trigger deletion cleanup, got ${deletedReferenceValidation}`);
  assert(movingSurfaceCrateY === 440, `Expected crate to snap to static floor instead of moving platform y=420, got y=${movingSurfaceCrateY}`);
  assert(
    movingSurfaceMountValidation === "issues" && movingSurfaceMountText?.includes("cannot ride moving platform smoke-moving-surface"),
    `Expected moving-platform crate mount validation, got ${movingSurfaceMountValidation}: ${movingSurfaceMountText}`
  );
  assert(movingSurfaceCleanupValidation === "clean", `Expected clean validation after moving-platform mount cleanup, got ${movingSurfaceCleanupValidation}`);
  assert(narrowPlateBottom === 420, `Expected dropped plate bottom to snap flush to narrow support y=420, got ${narrowPlateY}+h=${narrowPlateBottom}`);
  assert(underSupportLaserY === 440, `Expected laser placed below support to stay at y=440 instead of snapping upward, got ${underSupportLaserY}`);
  assert(surfaceSnapValidation === "clean", `Expected clean validation after surface snap checks, got ${surfaceSnapValidation}`);
  assert(rejectedDuplicateObjectId === "smoke-hazard", `Expected duplicate object id rename to be rejected, got ${rejectedDuplicateObjectId}`);
  assert(rejectedBlankObjectId === "smoke-hazard", `Expected blank object id rename to be rejected, got ${rejectedBlankObjectId}`);
  assert(
    blankObjectIdValidation === "clean",
    `Expected clean validation after rejected blank object id, got ${blankObjectIdValidation}: ${blankObjectIdValidationText}`
  );
  assert(blankObjectIdStatus?.includes("cannot be empty"), `Expected blank object id status to mention empty id, got ${blankObjectIdStatus}`);
  assert(
    duplicateObjectIdValidation === "clean",
    `Expected clean validation after rejected duplicate object id, got ${duplicateObjectIdValidation}: ${duplicateObjectIdValidationText}`
  );
  assert(
    duplicateObjectIdStatus?.includes("already exists"),
    `Expected duplicate object id status to mention already exists, got ${duplicateObjectIdStatus}`
  );
  assert(duplicateLevelValidation === "issues", "Expected duplicate level id to fail validation");
  assert(
    duplicateLevelText?.includes("Duplicate level id rainhouse-relay"),
    `Expected duplicate level id validation text, got ${duplicateLevelText}`
  );
  assert(restoredLevelValidation === "clean", `Expected clean validation after restoring level id, got ${restoredLevelValidation}`);
  assert(invalidIndexValidation === "issues", "Expected mismatched level index to fail validation");
  assert(invalidIndexText?.includes("index is 1; expected 0"), `Expected index mismatch validation text, got ${invalidIndexText}`);
  assert(restoredIndexValidation === "clean", `Expected clean validation after restoring level index, got ${restoredIndexValidation}`);
  assert(
    malformedImportStatus && malformedImportStatus !== "Import applied",
    `Expected malformed import to report an error, got ${malformedImportStatus}`
  );
  assert(
    malformedImportValidation === "clean",
    `Expected malformed import to preserve clean validation, got ${malformedImportValidation}`
  );
  assert(
    storageFailureStatus?.includes("draft storage unavailable"),
    `Expected guarded storage failure status, got ${storageFailureStatus}`
  );
  assert(invalidStartValidation === "issues", "Expected invalid start footprint to fail validation");
  assert(
    invalidStartText?.includes("start footprint is outside bounds"),
    `Expected invalid start footprint validation text, got ${invalidStartText}`
  );
  assert(restoredStartValidation === "clean", `Expected clean validation after restoring start, got ${restoredStartValidation}`);
  assert(
    shortDoorInitialValidation === "clean",
    `Expected clean validation before short-door check, got ${shortDoorInitialValidation}`
  );
  assert(shiftedDoorValidation === "issues", "Expected temporary short door to warn");
  assert(
    shiftedDoorText?.includes("may be short enough to jump over"),
    `Expected short-door warning text, got ${shiftedDoorText}`
  );
  assert(restoredDoorValidation === "clean", `Expected clean validation after restoring door settings, got ${restoredDoorValidation}`);
  assert(
    afterEditValidation === "clean",
    `Expected clean validation after edit, got ${afterEditValidation}: ${afterEditValidationText}`
  );
  assert(
    offGridStepXAfter === offGridStepXBefore && offGridStepYAfter === offGridStepYBefore,
    `Expected off-grid step east resize to keep anchored origin ${offGridStepXBefore},${offGridStepYBefore}; got ${offGridStepXAfter},${offGridStepYAfter}`
  );
  assert(
    offGridStepWidthAfter > offGridStepWidthBefore && offGridStepWidthAfter % 20 === 0,
    `Expected off-grid step east resize to snap widened size to grid: ${offGridStepWidthBefore} -> ${offGridStepWidthAfter}`
  );
  assert(floorDefaultHeight === 20, `Expected new solid defaults to be one grid snap thick, got height ${floorDefaultHeight}`);
  assert(reselectedThinSolidId === "smoke-floor", `Expected thin solid canvas hit tolerance to reselect smoke-floor, got ${reselectedThinSolidId}`);
  assert(hazardWidthAfter > hazardWidthBefore, `Expected resize drag to widen hazard: ${hazardWidthBefore} -> ${hazardWidthAfter}`);
  assert(exitDuplicateDisabled, "Expected exit duplicate action to be disabled");
  assert(
    exitXAfterDuplicate === exitXBeforeDuplicate && exitYAfterDuplicate === exitYBeforeDuplicate,
    `Expected exit duplicate action not to move the singleton exit: ${exitXBeforeDuplicate},${exitYBeforeDuplicate} -> ${exitXAfterDuplicate},${exitYAfterDuplicate}`
  );
  assert(exitWidthAfterRePlace === 64, `Expected re-placed exit to preserve custom width 64, got ${exitWidthAfterRePlace}`);
  assert(exitHeightAfterRePlace === 70, `Expected re-placed exit to preserve custom height 70, got ${exitHeightAfterRePlace}`);
  assert(exitWidthAfter === exitWidthBefore, `Expected exit portal width to stay locked during handle drag: ${exitWidthBefore} -> ${exitWidthAfter}`);
  assert(plateWidthAfter === plateWidthBefore, `Expected pressure plate width to stay locked during handle drag: ${plateWidthBefore} -> ${plateWidthAfter}`);
  assert(droneWidthAfter === droneWidthBefore, `Expected drone body width to stay locked during handle drag: ${droneWidthBefore} -> ${droneWidthAfter}`);
  assert(doorYValue !== "200", `Expected single-click door placement to use clicked world y instead of hardcoded 200, got ${doorYValue}`);
  assert(doorPlacementValidation === "clean", `Expected clean validation after door placement, got ${doorPlacementValidation}`);
  assert(afterDoorDeleteValidation === "clean", `Expected clean validation after deleting smoke door, got ${afterDoorDeleteValidation}`);
  assert(dronePeriod === 100, `Expected speed 120 over 100px drone travel to produce period 100, got ${dronePeriod}`);
  assert(dronePathStartAfterDrag === 340, `Expected draggable drone path endpoint to set start to 340, got ${dronePathStartAfterDrag}`);
  assert(
    droneSpeedAfterDrag === droneSpeedBeforeDrag && dronePeriodAfterDrag === 120,
    `Expected draggable drone endpoint to preserve speed and recalculate period, got ${JSON.stringify({
      speed: [droneSpeedBeforeDrag, droneSpeedAfterDrag],
      period: [dronePeriod, dronePeriodAfterDrag]
    })}`
  );
  assert(droneExportJson.includes('"axis": "y"'), "Expected drone export JSON to include vertical axis");
  assert(droneExport.y === 340, `Expected exported drone origin y to match anchored path start 340, got ${droneExport.y}`);
  assert(droneExport.distance === 120, `Expected exported drone travel distance 120 after snapped endpoint edit, got ${droneExport.distance}`);
  assert(monsterPathStartAfterDrag === 420, `Expected draggable monster path endpoint to set start to 420, got ${monsterPathStartAfterDrag}`);
  assert(
    monsterSpeedAfterDrag === monsterSpeedBeforeDrag && monsterPeriodAfterDrag > monsterPeriodBeforeDrag,
    `Expected draggable monster endpoint to preserve speed and recalculate period, got ${JSON.stringify({
      speed: [monsterSpeedBeforeDrag, monsterSpeedAfterDrag],
      period: [monsterPeriodBeforeDrag, monsterPeriodAfterDrag]
    })}`
  );
  assert(
    monsterExport.y === 420 && monsterExport.distance === 80,
    `Expected exported monster origin/distance to follow dragged path start, got ${JSON.stringify(monsterExport)}`
  );
  assert(
    platformPathStartAfterDrag < platformPathStartBeforeDrag,
    `Expected draggable platform endpoint to move start upward from ${platformPathStartBeforeDrag}, got ${platformPathStartAfterDrag}`
  );
  assert(
    platformSpeedAfterDrag === platformSpeedBeforeDrag && platformPeriodAfterDrag > platformPeriodBeforeDrag,
    `Expected draggable platform endpoint to preserve speed and recalculate period, got ${JSON.stringify({
      speed: [platformSpeedBeforeDrag, platformSpeedAfterDrag],
      period: [platformPeriodBeforeDrag, platformPeriodAfterDrag]
    })}`
  );
  assert(
    platformExport.y === platformPathStartAfterDrag,
    `Expected exported platform origin y to match anchored path start ${platformPathStartAfterDrag}, got ${platformExport.y}`
  );
  assert(
    platformExport.distance === platformPathEndBeforeDrag - platformPathStartAfterDrag,
    `Expected exported platform travel distance to match edited endpoints, got ${platformExport.distance}`
  );
  assert(
    platformResizeHeightAfter > platformResizeHeightBefore,
    `Expected moving platform bottom handle to resize height, got ${platformResizeHeightBefore} -> ${platformResizeHeightAfter}`
  );
  assert(
    platformPathStartAfterResize === platformPathStartBeforeResize && platformPathEndAfterResize === platformPathEndBeforeResize,
    `Expected moving platform resize to preserve path ${platformPathStartBeforeResize}-${platformPathEndBeforeResize}, got ${platformPathStartAfterResize}-${platformPathEndAfterResize}`
  );
  assert(platformEndpointValidation === "clean", `Expected clean validation after platform endpoint drag, got ${platformEndpointValidation}`);
  assert(timberCompletionValue === "boss-defeat", `Expected Timber Archive completion mode boss-defeat, got ${timberCompletionValue}`);
  assert(timberInitialExport.completion === "boss-defeat", `Expected Timber Archive export to preserve boss-defeat completion, got ${timberInitialExport.completion}`);
  assert(
    timberErosionTriggerValue === "archive-book" && timberErosionTilesValue === "1",
    `Expected floorpiece-14 inspector erosion fields archive-book/1, got ${timberErosionTriggerValue}/${timberErosionTilesValue}`
  );
  assert(
    timberErosionTilesTwoExport?.erodesWith === "archive-book" && timberErosionTilesTwoExport?.erosionTiles === 2,
    `Expected erosion tile select to serialize 2, got ${JSON.stringify(timberErosionTilesTwoExport)}`
  );
  assert(
    timberErosionRestoredExport?.erodesWith === "archive-book" && timberErosionRestoredExport?.erosionTiles === 1,
    `Expected restored erosion tile select to serialize 1, got ${JSON.stringify(timberErosionRestoredExport)}`
  );
  assert(timberErosionValidation === "clean", `Expected clean validation for Timber Archive erosion controls, got ${timberErosionValidation}`);
  assert(fallbackImportHazardIds.length === 2, `Expected two fallback-imported hazards, got ${fallbackImportHazardIds.join(", ")}`);
  assert(
    fallbackImportHazardIds.every(Boolean) && fallbackImportHazardIds.length === new Set(fallbackImportHazardIds).size,
    `Expected unique fallback hazard ids, got ${fallbackImportHazardIds.join(", ")}`
  );
  assert(
    fallbackImportObjectIds.length === new Set(fallbackImportObjectIds).size,
    `Expected imported fallback object IDs to be level-unique, got ${fallbackImportObjectIds.join(", ")}`
  );
  assert(
    fallbackImportValidation === "clean",
    `Expected clean validation after fallback import, got ${fallbackImportValidation}: ${fallbackImportValidationText}`
  );
  assert(staticMonsterPathValidation === "clean", `Expected clean validation after static monster endpoint edit, got ${staticMonsterPathValidation}`);
  assert(fallbackImportExport.score?.lives === 3, `Expected imported legacy score lives to default to 3, got ${JSON.stringify(fallbackImportExport.score)}`);
  assert(fallbackImportExport.score?.coreScore === 100, `Expected imported legacy core score to default to 100, got ${JSON.stringify(fallbackImportExport.score)}`);
  assert(
    fallbackImportExport.score?.deathPenalty === undefined,
    `Expected imported legacy score to omit death penalty, got ${JSON.stringify(fallbackImportExport.score)}`
  );
  assert(
    fallbackImportExport.score?.timeBonusTargetSeconds === 30,
    `Expected imported legacy gold frames to convert to 30s bonus target, got ${JSON.stringify(fallbackImportExport.score)}`
  );
  assert(
    fallbackImportPlatform?.distance === 0,
    `Expected imported negative platform distance to normalize to 0, got ${fallbackImportPlatform?.distance}`
  );
  assert(
    fallbackImportPlatform?.period === 1,
    `Expected imported negative platform period to normalize to 1, got ${fallbackImportPlatform?.period}`
  );
  assert(
    fallbackImportExport.motionModel === "anchored" &&
      fallbackImportDrone?.y === 370 &&
      fallbackImportDrone?.distance === 100 &&
      Math.abs((fallbackImportDrone?.phase || 0) - (0.2 + Math.PI / 2)) < 0.000001,
    `Expected legacy imported drone to migrate to anchored motion, got ${JSON.stringify(fallbackImportDrone)}`
  );
  assert(
    staticMonsterPathExport?.axis === "x" && staticMonsterPathExport?.distance === 80 && staticMonsterPathExport?.period === 180,
    `Expected endpoint-only edit on static monster to export a complete movement tuple, got ${JSON.stringify(staticMonsterPathExport)}`
  );
  assert(
    !("perfectEchoes" in fallbackImportExport) && !("medalFrames" in fallbackImportExport),
    `Expected imported legacy scoring fields to export as score settings only, got ${JSON.stringify(fallbackImportExport)}`
  );
  assert(fallbackImportExport.soundtrackKey === "level-4", `Expected imported soundtrack key level-4, got ${fallbackImportExport.soundtrackKey}`);
  assert(fallbackImportExport.rewindDisabled === true, `Expected imported rewindDisabled flag to export, got ${fallbackImportExport.rewindDisabled}`);
  assert(fallbackImportExport.backgroundKey === "time-lab-prototype", `Expected imported background key time-lab-prototype, got ${fallbackImportExport.backgroundKey}`);
  assert(
    sourceDerivedImportExport.motionModel === "anchored" && sourceDerivedImportPlatform?.x === 420 && sourceDerivedImportPlatform?.distance === 80,
    `Expected anchored source-derived import to avoid legacy double migration, got ${JSON.stringify(sourceDerivedImportPlatform)}`
  );
  assert(importedName?.includes("Smoke Edited"), `Import did not update the level name: ${importedName}`);
  assert(importedValidation === "clean", `Expected clean validation after import, got ${importedValidation}`);
  assert(mobileValidation === "clean", `Expected clean mobile validation, got ${mobileValidation}`);
  const unexpectedMessages = messages.filter((msg) => !isAllowedBrowserMessage(msg));
  assert(unexpectedMessages.length === 0, `Editor console issues: ${JSON.stringify(unexpectedMessages)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        levelOptions,
        initialValidation,
        initialValidationText,
        afterEditValidation,
        importedName,
        importedValidation,
        mobileValidation,
        artifacts: {
          desktop: `${outDir}/editor-desktop.png`,
          mobile: `${outDir}/editor-mobile.png`,
          playtestDraft: `${outDir}/editor-playtest-draft.png`,
          playtestDraftMobile: `${outDir}/editor-playtest-draft-mobile.png`,
          gameOver: `${outDir}/editor-game-over.png`,
          gameOverMobile: `${outDir}/editor-game-over-mobile.png`
        }
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await server.close();
}
