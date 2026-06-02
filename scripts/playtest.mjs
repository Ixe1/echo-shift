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
  desktopPause: `${outDir}/pause-desktop.png`,
  mobileMenu: `${outDir}/menu-mobile.png`,
  mobileGame: `${outDir}/game-mobile.png`,
  mobileTouch: `${outDir}/touch-mobile.png`,
  mobileLevels: `${outDir}/levels-mobile.png`,
  tabletGame: `${outDir}/game-tablet.png`,
  tabletTouch: `${outDir}/touch-tablet.png`
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
  await page.keyboard.down("Escape");
  await page.waitForTimeout(100);
  await page.keyboard.up("Escape");
  await page.waitForTimeout(250);
  const pauseVisible = await page.locator("[data-modal].show").isVisible();
  await page.screenshot({ path: artifacts.desktopPause });
  await page.locator("[data-exit-menu]").click();
  await page.locator("[data-play]").waitFor({ state: "visible" });
  const returnedToTitle = await page.locator("[data-play]").isVisible();
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

  assert(title === "Echo Shift", `Unexpected title: ${title}`);
  assert(echoesText === "1", `Expected one echo after rewind, got ${echoesText}`);
  assert(pauseVisible, "Pause modal did not become visible");
  assert(returnedToTitle, "Title button did not return to the menu");
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
  assert(relevantMessages.length === 0, `Desktop console issues: ${JSON.stringify(relevantMessages)}`);
  assert(mobileMessages.length === 0, `Mobile console issues: ${JSON.stringify(mobileMessages)}`);
  assert(tabletMessages.length === 0, `Tablet console issues: ${JSON.stringify(tabletMessages)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        title,
        echoesText,
        pauseVisible,
        returnedToTitle,
        levelButtons,
        touchControlsVisible,
        mobileTouchDelta: Number((afterTouchX - beforeTouchX).toFixed(2)),
        tabletTouchControlsVisible,
        tabletTouchDelta: Number((afterTabletTouchX - beforeTabletTouchX).toFixed(2)),
        artifacts
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
