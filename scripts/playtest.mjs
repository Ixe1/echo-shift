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

const collectConsole = (page, bucket) => {
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      bucket.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (error) => bucket.push({ type: "pageerror", text: error.message }));
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Simulation-derived public-input route for clearing Portal Primer without test hooks.
const firstRoomRoute = [
  ["idle", 17],
  ["left", 4],
  ["right", 53],
  ["jumpRight", 6],
  ["right", 19],
  ["idle", 14],
  ["right", 17],
  ["jump", 14],
  ["right", 26],
  ["jump", 12],
  ["idle", 4],
  ["jumpRight", 9],
  ["idle", 34],
  ["jumpRight", 30],
  ["right", 7],
  ["jumpRight", 6],
  ["right", 72]
];

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
    for (let y = 348; y < 410; y += 1) {
      for (let x = 448; x < 512; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        const generatedCyan = red < 140 && green > 140 && blue > 150;
        const generatedViolet = red > 120 && green < 140 && blue > 155;
        if (alpha > 150 && (generatedCyan || generatedViolet)) count += 1;
      }
    }
    return count;
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
  await runKeyboardRoute(page, firstRoomRoute);
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
  const corePixels = await coreSpritePixels(page);
  await page.screenshot({ path: artifacts.desktopCoreRoom });
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
  assert(echoesText === "1", `Expected one echo after rewind, got ${echoesText}`);
  assert(retryCastPixels < 24, `Expected retry to clear rewind-cast sprite pixels, got ${retryCastPixels}`);
  assert(pauseVisible, "Pause modal did not become visible");
  assert(returnedToTitle, "Title button did not return to the menu");
  assert(completionTitle === "Room Clear", `Expected first room completion modal, got ${completionTitle}`);
  assert(storedProgress?.unlocked >= 2, `Expected completion to unlock level 2: ${JSON.stringify(storedProgress)}`);
  assert(storedProgress?.scores?.["portal-primer"], "Expected first room score to persist");
  assert(nextLevelLabel?.includes("2. First Afterimage"), `Expected Next Room to load level 2, got ${nextLevelLabel}`);
  assert(corePixels > 60, `Expected generated core/effect sprite pixels in Relay Key, got ${corePixels}`);
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
        echoesText,
        retryCastPixels,
        pauseVisible,
        returnedToTitle,
        completionTitle,
        nextLevelLabel,
        corePixels,
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
