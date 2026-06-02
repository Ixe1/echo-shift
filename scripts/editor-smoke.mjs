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

const objectKinds = ["solids", "platforms", "hazards", "plates", "doors", "lasers", "cores", "drones"];

const messages = [];
const collectConsole = (page) => {
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      messages.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (error) => messages.push({ type: "pageerror", text: error.message }));
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
  await page.locator("[data-play]").waitFor({ state: "visible" });
  const inactiveEditorVisible = await page.locator("[data-level-editor]").isVisible();
  await page.locator("[data-editor]").click();
  await page.locator("[data-level-editor]").waitFor({ state: "visible" });
  const menuEditorUrl = page.url();

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
  await staleDraft.close();

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
  await draftPlaytestPage.locator("[data-level-field='soundtrackKey']").selectOption("level-6");
  await draftPlaytestPage.locator("[data-playtest-draft]").click();
  await draftPlaytestPage.waitForURL(/playtestDraft=1/);
  await draftPlaytestPage.locator("[data-level]").waitFor({ state: "visible" });
  const draftPlaytestUrl = draftPlaytestPage.url();
  const draftPlaytestHudLevel = await draftPlaytestPage.locator("[data-level]").textContent();
  const draftPlaytestMusicKey = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftMusicKey);
  const draftPlaytestBackgroundKey = await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftBackgroundKey);
  const draftPlaytestBackgroundPieces = Number(await draftPlaytestPage.evaluate(() => document.documentElement.dataset.echoShiftBackgroundPieces));
  await draftPlaytestPage.screenshot({ path: `${outDir}/editor-playtest-draft.png`, fullPage: true });
  await draftPlaytestPage.locator("[data-menu]").click();
  const draftEditorButton = draftPlaytestPage.locator("[data-modal] [data-editor]");
  await draftEditorButton.waitFor({ state: "visible" });
  await draftEditorButton.click();
  await draftPlaytestPage.waitForURL(/editor=1/);
  await draftPlaytestPage.locator("[data-level-editor]").waitFor({ state: "visible" });
  const draftReturnUrl = draftPlaytestPage.url();
  await draftPlaytest.close();

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
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  await mismatchedDraftSelectPage.locator("[data-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-modal] [data-levels]").click();
  await mismatchedDraftSelectPage.locator(".level-button[data-level='1']").click();
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  const mismatchedDraftSelectedLevel = await mismatchedDraftSelectPage.locator(".hud [data-level]").textContent();
  const mismatchedDraftSelectedMusicKey = await mismatchedDraftSelectPage.evaluate(() => document.documentElement.dataset.echoShiftMusicKey);
  const mismatchedDraftSelectedUrl = mismatchedDraftSelectPage.url();
  await mismatchedDraftSelectPage.reload({ waitUntil: "domcontentloaded" });
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
  const mismatchedDraftReloadedLevel = await mismatchedDraftSelectPage.locator(".hud [data-level]").textContent();
  await mismatchedDraftSelectPage.locator("[data-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-modal] [data-exit-menu]").click();
  await mismatchedDraftSelectPage.locator("[data-play]").waitFor({ state: "visible" });
  await mismatchedDraftSelectPage.locator("[data-play]").click();
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
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
  await mismatchedDraftSelectPage.locator(".hud [data-level]").waitFor({ state: "visible" });
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
  await mismatchedDraftCompletion.close();

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
  const medalSettingsText = await page.locator("[data-medal-settings]").textContent();
  const medalSecondsText = await page.locator("[data-medal-seconds]").textContent();
  const soundtrackSelect = page.locator("[data-level-field='soundtrackKey']");
  const soundtrackOptions = await soundtrackSelect.locator("option").allTextContents();
  await soundtrackSelect.selectOption("level-6");
  const backgroundSelect = page.locator("[data-level-field='backgroundKey']");
  const backgroundOptions = await backgroundSelect.locator("option").allTextContents();
  await backgroundSelect.selectOption("time-lab-prototype");
  const metadataExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const soundtrackExportKey = metadataExport.soundtrackKey;
  const backgroundExportKey = metadataExport.backgroundKey;

  const levelIdField = page.locator("[data-level-field='id']");
  await levelIdField.fill("first-afterimage");
  await dispatchChange(levelIdField);
  const duplicateLevelValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const duplicateLevelText = await page.locator("[data-validation]").textContent();
  await levelIdField.fill("portal-primer");
  await dispatchChange(levelIdField);
  const restoredLevelValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  const levelIndexField = page.locator("[data-level-field='index']");
  await levelIndexField.fill("1");
  await dispatchChange(levelIndexField);
  const invalidIndexValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const invalidIndexText = await page.locator("[data-validation]").textContent();
  await levelIndexField.fill("0");
  await dispatchChange(levelIndexField);
  const restoredIndexValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await openTab(page, "export");
  await page.locator("[data-import-json]").fill("{broken json");
  await page.locator("[data-apply-import]").click();
  const malformedImportStatus = await page.locator("[data-editor-status]").textContent();
  const malformedImportValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

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
  await page.locator("[data-object-field='x']").fill("2390");
  await dispatchChange(page.locator("[data-object-field='x']"));
  const invalidStartValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const invalidStartText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-object-field='x']").fill("58");
  await dispatchChange(page.locator("[data-object-field='x']"));
  const restoredStartValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await page.locator("[data-level-select]").selectOption("1");
  const shiftedLevelInitialValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  await page.locator("[data-level-field='bounds.y']").fill("100");
  await dispatchChange(page.locator("[data-level-field='bounds.y']"));
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='doors']").click();
  await page.locator("[data-object-field='y']").fill("350");
  await dispatchChange(page.locator("[data-object-field='y']"));
  const shiftedDoorValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const shiftedDoorText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-object-field='y']").fill("200");
  await dispatchChange(page.locator("[data-object-field='y']"));
  await page.locator("[data-level-field='bounds.y']").fill("0");
  await dispatchChange(page.locator("[data-level-field='bounds.y']"));
  const restoredBoundsValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
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
  await dragWorld(page, { x: 1000, y: 220 }, { x: 900, y: 220 });
  const viewAfterPan = await editorView(page);
  await page.locator("[data-fit-level]").click();

  await dragToolToWorld(page, "lasers", { x: 1120, y: 420 });
  await page.locator("[data-object-field='id']").fill("smoke-laser-drop");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 1120);
  await setObjectField(page, "y", 420);
  const dragDropLaserExport = await page.locator("[data-export-json]").inputValue();
  const activeToolAfterDrop = await page.locator(".editor-tool.active").getAttribute("data-tool");
  await clickWorld(page, { x: 1130, y: 426 });
  await page.keyboard.press("Delete");
  const keyboardDeleteExport = await page.locator("[data-export-json]").inputValue();
  const keyboardDeleteValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await dragToolToWorld(page, "floor", { x: 1180, y: 420 });
  const floorPresetId = await page.locator("[data-object-field='id']").inputValue();
  const floorPresetWidth = await objectNumber(page, "w");
  const floorPresetHeight = await objectNumber(page, "h");
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
  await dragToolToWorld(page, "wall", { x: 1220, y: 300 });
  const wallPresetId = await page.locator("[data-object-field='id']").inputValue();
  const wallPresetWidth = await objectNumber(page, "w");
  const wallPresetHeight = await objectNumber(page, "h");
  await page.locator("[data-delete-object]").click();
  await dragToolToWorld(page, "block", { x: 1260, y: 380 });
  const blockPresetId = await page.locator("[data-object-field='id']").inputValue();
  const blockPresetWidth = await objectNumber(page, "w");
  const blockPresetHeight = await objectNumber(page, "h");
  await page.locator("[data-delete-object]").click();

  await dragToolToWorld(page, "plates", { x: 300, y: 500 });
  const surfacePlateY = await objectNumber(page, "y");
  const surfacePlateBottom = surfacePlateY + (await objectNumber(page, "h"));
  await page.locator("[data-duplicate-object]").click();
  const duplicatedPlateY = await objectNumber(page, "y");
  const duplicatedPlateBottom = duplicatedPlateY + (await objectNumber(page, "h"));
  await page.locator("[data-delete-object]").click();

  await dragToolToWorld(page, "lasers", { x: 1280, y: 500 });
  const surfaceLaserY = await objectNumber(page, "y");
  const surfaceLaserBottom = surfaceLaserY + (await objectNumber(page, "h"));
  await page.locator("[data-delete-object]").click();
  const surfaceSnapValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await dragToolToWorld(page, "plates", { x: 420, y: 500 });
  await page.locator("[data-object-field='id']").fill("laser-1");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await dragToolToWorld(page, "lasers", { x: 470, y: 500 });
  const generatedGlobalLaserId = await page.locator("[data-object-field='id']").inputValue();
  const generatedGlobalIdValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const generatedGlobalIdText = await page.locator("[data-validation]").textContent();
  const generatedGlobalIdLevel = JSON.parse(await page.locator("[data-export-json]").inputValue())[0];
  const generatedGlobalObjectIds = objectKinds.flatMap((kind) => (generatedGlobalIdLevel[kind] || []).map((object) => object.id));
  await page.locator("[data-delete-object]").click();
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='plates'][data-id='laser-1']").click();
  await page.locator("[data-delete-object]").click();
  const generatedGlobalCleanupValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await page.locator("[data-tool='solids']").click();
  await page.locator("[data-add-object]").click();
  await page.locator("[data-object-field='id']").fill("smoke-narrow-support");
  await dispatchChange(page.locator("[data-object-field='id']"));
  await setObjectField(page, "x", 640);
  await setObjectField(page, "y", 420);
  await setObjectField(page, "w", 30);
  await setObjectField(page, "h", 18);
  await dragToolToWorld(page, "plates", { x: 646, y: 420 });
  const narrowPlateY = await objectNumber(page, "y");
  const narrowPlateBottom = narrowPlateY + (await objectNumber(page, "h"));
  await page.locator("[data-delete-object]").click();
  await dragToolToWorld(page, "lasers", { x: 646, y: 440 });
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
  await page.locator("[data-object-field='id']").fill("spark-strip-a");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const rejectedDuplicateObjectId = await page.locator("[data-object-field='id']").inputValue();
  const duplicateObjectIdValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const duplicateObjectIdValidationText = await page.locator("[data-validation]").textContent();
  const duplicateObjectIdStatus = await page.locator("[data-editor-status]").textContent();
  await page.locator("[data-object-field='id']").fill("");
  await dispatchChange(page.locator("[data-object-field='id']"));
  const rejectedBlankObjectId = await page.locator("[data-object-field='id']").inputValue();
  const blankObjectIdValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const blankObjectIdValidationText = await page.locator("[data-validation]").textContent();
  const blankObjectIdStatus = await page.locator("[data-editor-status]").textContent();
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

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='drone-a']").click();
  const droneWidthBefore = await objectNumber(page, "w");
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: 1460, y: 484 }, { x: 1530, y: 484 });
  const droneWidthAfter = await objectNumber(page, "w");
  await setObjectField(page, "x", 1430);
  await setObjectField(page, "y", 472);

  const exportJson = await page.locator("[data-export-json]").inputValue();
  assert(exportJson.includes("smoke-hazard"), "Export JSON did not include the edited hazard");
  const afterEditValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const afterEditValidationText = await page.locator("[data-validation]").textContent();

  await page.locator("[data-tool='doors']").click();
  await clickWorld(page, { x: 1040, y: 180 });
  const doorYValue = await page.locator("[data-object-field='y']").inputValue();
  const doorPlacementValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  await page.locator("[data-delete-object]").click();
  const afterDoorDeleteValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='drone-a']").click();
  await page.locator("[data-object-field='axis']").selectOption("y");
  await page.locator("[data-object-field='pathStart']").fill("360");
  await dispatchChange(page.locator("[data-object-field='pathStart']"));
  await page.locator("[data-object-field='pathEnd']").fill("460");
  await dispatchChange(page.locator("[data-object-field='pathEnd']"));
  await page.locator("[data-object-field='speed']").fill("120");
  await dispatchChange(page.locator("[data-object-field='speed']"));
  const dronePeriod = Number(await page.locator("[data-object-field='period']").inputValue());
  const droneHandleX = (await objectNumber(page, "x")) + (await objectNumber(page, "w")) / 2;
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: droneHandleX, y: 360 }, { x: droneHandleX, y: 340 });
  const dronePathStartAfterDrag = Number(await page.locator("[data-object-field='pathStart']").inputValue());
  const droneExportJson = await page.locator("[data-export-json]").inputValue();
  const droneExport = JSON.parse(droneExportJson)[0].drones.find((drone) => drone.id === "drone-a");

  await page.locator("[data-level-select]").selectOption("4");
  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-id='lift-a']").click();
  const platformHandleX = (await objectNumber(page, "x")) + (await objectNumber(page, "w")) / 2;
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: platformHandleX, y: 338 }, { x: platformHandleX, y: 320 });
  const platformPathStartAfterDrag = Number(await page.locator("[data-object-field='pathStart']").inputValue());
  const platformEndpointValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const platformExport = JSON.parse(await page.locator("[data-export-json]").inputValue())[4].platforms.find(
    (platform) => platform.id === "lift-a"
  );
  await page.locator("[data-level-select]").selectOption("0");

  await page.locator("[data-save-draft]").click();
  const storedDraft = await page.evaluate(() => window.localStorage.getItem("echo-shift-level-editor-draft-v1"));
  assert(storedDraft?.includes("smoke-hazard"), "Draft did not persist edited hazard");

  const parsedExport = JSON.parse(exportJson);
  parsedExport[0].name = "Smoke Edited";
  await openTab(page, "export");
  const fallbackImportLevel = {
    id: "portal-primer",
    index: 0,
    name: "Fallback ID Smoke",
    subtitle: "",
    soundtrackKey: "level-4",
    backgroundKey: "time-lab-prototype",
    start: { x: 60, y: 450 },
    exit: { x: 850, y: 438, w: 48, h: 62 },
    bounds: { x: 0, y: 0, w: 960, h: 540 },
    solids: [{ id: "floor", x: 0, y: 500, w: 960, h: 40 }],
    platforms: [{ id: "bad-lift", x: 420, y: 450, w: 120, h: 18, axis: "x", distance: -80, period: -12 }],
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
  const fallbackImportObjectIds = objectKinds.flatMap((kind) => (fallbackImportExport[kind] || []).map((object) => object.id));
  const fallbackImportValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const fallbackImportValidationText = await page.locator("[data-validation]").textContent();
  await page.locator("[data-import-json]").fill(JSON.stringify(parsedExport[0], null, 2));
  await page.locator("[data-apply-import]").click();
  await page.waitForFunction(() => document.querySelector("[data-level-select] option")?.textContent?.includes("Smoke Edited"));
  const importedName = await page.locator("[data-level-select] option").first().textContent();
  const importedValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
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
  const mobileValidation = await mobilePage.locator("[data-validation]").getAttribute("data-editor-validation");
  await mobile.close();

  assert(!inactiveEditorVisible, "Editor should not activate for ?editor=0");
  assert(menuEditorUrl.includes("editor=1"), `Expected menu editor button to navigate to ?editor=1, got ${menuEditorUrl}`);
  assert(
    fractionalDraftLevelName === "Draft Index Smoke B",
    `Expected fractional draft currentIndex to normalize to second level, got ${fractionalDraftLevelName}`
  );
  assert(fractionalDraftValidation === "clean", `Expected clean validation after fractional draft boot, got ${fractionalDraftValidation}`);
  assert(draftPlaytestUrl.includes("playtestDraft=1"), `Expected Playtest button to navigate to playtestDraft=1, got ${draftPlaytestUrl}`);
  assert(draftPlaytestUrl.includes("level=1"), `Expected Playtest button to preserve selected level=1, got ${draftPlaytestUrl}`);
  assert(
    draftPlaytestHudLevel?.includes("Draft Playtest Smoke"),
    `Expected draft playtest game HUD to use edited level name, got ${draftPlaytestHudLevel}`
  );
  assert(draftPlaytestMusicKey === "level-6", `Expected draft playtest GameScene to request explicit level-6 soundtrack, got ${draftPlaytestMusicKey}`);
  assert(draftPlaytestBackgroundKey === "time-lab-prototype", `Expected draft playtest to render prototype background, got ${draftPlaytestBackgroundKey}`);
  assert(draftPlaytestBackgroundPieces >= 1, `Expected draft playtest to create repeated background pieces, got ${draftPlaytestBackgroundPieces}`);
  assert(draftReturnUrl.includes("editor=1"), `Expected draft Editor button to return to editor=1, got ${draftReturnUrl}`);
  assert(!draftReturnUrl.includes("playtestDraft=1"), `Expected draft Editor button to clean playtest flag, got ${draftReturnUrl}`);
  assert(!draftReturnUrl.includes("level=1"), `Expected draft Editor button to clean level flag, got ${draftReturnUrl}`);
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
  assert(levelOptions > 0, `Expected at least one editable level, got ${levelOptions}`);
  assert(
    levelOptions === initialExportLevelCount,
    `Expected level selector count to match export JSON level count: ${levelOptions} !== ${initialExportLevelCount}`
  );
  assert(initialValidation === "clean", `Expected clean initial validation, got ${initialValidation}`);
  assert(leftSidebarOverflowY === "auto", `Expected left sidebar to scroll independently, got overflow-y ${leftSidebarOverflowY}`);
  assert(toolbarOverflowY === "auto", `Expected toolbar panel to scroll independently, got overflow-y ${toolbarOverflowY}`);
  assert(inspectorOverflowY === "auto", `Expected right inspector to scroll independently, got overflow-y ${inspectorOverflowY}`);
  assert(
    ["Cursor", "Structure", "Hazards", "Logic", "Actors", "Markers"].every((label) => paletteGroupLabels.includes(label)),
    `Expected grouped palette labels, got ${paletteGroupLabels.join(", ")}`
  );
  assert(soundtrackOptions.some((option) => option.includes("Auto: Echo Shift - Level 1")), `Expected auto soundtrack option, got ${soundtrackOptions.join(", ")}`);
  assert(soundtrackOptions.some((option) => option.includes("Echo Shift - Level 6")), `Expected selectable level MP3 options, got ${soundtrackOptions.join(", ")}`);
  assert(soundtrackExportKey === "level-6", `Expected selected soundtrack key to export as level-6, got ${soundtrackExportKey}`);
  assert(backgroundOptions.some((option) => option.includes("Auto: Prototype Time Lab")), `Expected auto background option, got ${backgroundOptions.join(", ")}`);
  assert(backgroundOptions.some((option) => option.includes("1672x941")), `Expected background dimensions in options, got ${backgroundOptions.join(", ")}`);
  assert(backgroundExportKey === "time-lab-prototype", `Expected selected background key to export as time-lab-prototype, got ${backgroundExportKey}`);
  assert(medalSettingsText?.includes("Perfect Echoes"), `Expected medal settings to label Perfect Echoes, got ${medalSettingsText}`);
  assert(medalSettingsText?.includes("Gold Frames"), `Expected medal settings to label Gold Frames, got ${medalSettingsText}`);
  assert(medalSettingsText?.includes("Silver Frames"), `Expected medal settings to label Silver Frames, got ${medalSettingsText}`);
  assert(medalSecondsText?.includes("60 frames = 1s"), `Expected medal settings to explain frame timing, got ${medalSecondsText}`);
  assert(medalSecondsText?.includes("Gold 34.0s"), `Expected medal settings to show Gold seconds, got ${medalSecondsText}`);
  assert(medalSecondsText?.includes("Silver 45.0s"), `Expected medal settings to show Silver seconds, got ${medalSecondsText}`);
  assert(zoomBeforeWheel !== zoomAfterWheel, `Expected wheel input to zoom canvas, got ${zoomBeforeWheel} -> ${zoomAfterWheel}`);
  assert(zoomAfterWheel !== zoomAfterButton, `Expected zoom-out button to change zoom, got ${zoomAfterWheel} -> ${zoomAfterButton}`);
  assert(viewAfterPan.x !== viewBeforePan.x, `Expected empty-canvas drag to pan view x: ${viewBeforePan.x} -> ${viewAfterPan.x}`);
  assert(dragDropLaserExport.includes("smoke-laser-drop"), "Expected palette drag/drop to create smoke-laser-drop");
  assert(activeToolAfterDrop === "select", `Expected drag/drop creation to return toolbar to select mode, got ${activeToolAfterDrop}`);
  assert(!keyboardDeleteExport.includes("smoke-laser-drop"), "Expected keyboard Delete to remove selected smoke-laser-drop");
  assert(keyboardDeleteValidation === "clean", `Expected clean validation after keyboard delete, got ${keyboardDeleteValidation}`);
  assert(floorPresetId.startsWith("floorpiece-"), `Expected floor preset id to use non-reserved floorpiece stem, got ${floorPresetId}`);
  assert(floorPresetWidth === 320 && floorPresetHeight === 20, `Expected floor preset 320x20, got ${floorPresetWidth}x${floorPresetHeight}`);
  assert(clickDragFloorWidth === 320 && clickDragFloorHeight === 20, `Expected click-drag floor preset 320x20, got ${clickDragFloorWidth}x${clickDragFloorHeight}`);
  assert(userFloorId.startsWith("floorpiece-"), `Expected user floor id to avoid structural floor-* exemption, got ${userFloorId}`);
  assert(
    userFloorOutOfBoundsValidation === "issues" && userFloorOutOfBoundsText?.includes(`${userFloorId} is outside level bounds`),
    `Expected user-created floor outside bounds to warn, got ${userFloorOutOfBoundsValidation}: ${userFloorOutOfBoundsText}`
  );
  assert(userFloorCleanupValidation === "clean", `Expected clean validation after deleting out-of-bounds user floor, got ${userFloorCleanupValidation}`);
  assert(wallPresetId.startsWith("wall-"), `Expected wall preset id to use wall stem, got ${wallPresetId}`);
  assert(wallPresetWidth === 20 && wallPresetHeight === 180, `Expected wall preset 20x180, got ${wallPresetWidth}x${wallPresetHeight}`);
  assert(blockPresetId.startsWith("block-"), `Expected block preset id to use block stem, got ${blockPresetId}`);
  assert(blockPresetWidth === 80 && blockPresetHeight === 80, `Expected block preset 80x80, got ${blockPresetWidth}x${blockPresetHeight}`);
  assert(surfacePlateBottom === 500, `Expected dropped plate bottom to snap flush to floor y=500, got ${surfacePlateY}+h=${surfacePlateBottom}`);
  assert(duplicatedPlateBottom === 500, `Expected duplicated plate bottom to stay flush to floor y=500, got ${duplicatedPlateY}+h=${duplicatedPlateBottom}`);
  assert(surfaceLaserBottom === 500, `Expected dropped laser bottom to snap flush to floor y=500, got ${surfaceLaserY}+h=${surfaceLaserBottom}`);
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
    duplicateLevelText?.includes("Duplicate level id first-afterimage"),
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
    shiftedLevelInitialValidation === "clean",
    `Expected clean validation before shifted-bounds door check, got ${shiftedLevelInitialValidation}`
  );
  assert(shiftedDoorValidation === "issues", "Expected shifted-bounds short door to warn");
  assert(
    shiftedDoorText?.includes("may be short enough to jump over"),
    `Expected shifted-bounds door warning text, got ${shiftedDoorText}`
  );
  assert(restoredBoundsValidation === "clean", `Expected clean validation after restoring bounds and door, got ${restoredBoundsValidation}`);
  assert(
    afterEditValidation === "clean",
    `Expected clean validation after edit, got ${afterEditValidation}: ${afterEditValidationText}`
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
  assert(dronePeriod === 100, `Expected speed 120 over 50px drone distance to produce period 100, got ${dronePeriod}`);
  assert(dronePathStartAfterDrag === 340, `Expected draggable drone path endpoint to set start to 340, got ${dronePathStartAfterDrag}`);
  assert(droneExportJson.includes('"axis": "y"'), "Expected drone export JSON to include vertical axis");
  assert(droneExport.y === 400, `Expected exported drone origin y to match snapped gameplay midpoint 400, got ${droneExport.y}`);
  assert(droneExport.distance === 60, `Expected exported drone distance 60 after snapped endpoint edit, got ${droneExport.distance}`);
  assert(platformPathStartAfterDrag === 320, `Expected draggable platform endpoint to set start to 320, got ${platformPathStartAfterDrag}`);
  assert(platformExport.y === 420, `Expected exported platform origin y to align to grid midpoint 420, got ${platformExport.y}`);
  assert(platformExport.distance === 100, `Expected exported platform distance 100 after endpoint edit, got ${platformExport.distance}`);
  assert(platformEndpointValidation === "clean", `Expected clean validation after platform endpoint drag, got ${platformEndpointValidation}`);
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
  assert(fallbackImportExport.perfectEchoes === 0, `Expected imported perfectEchoes to normalize to 0, got ${fallbackImportExport.perfectEchoes}`);
  assert(
    fallbackImportPlatform?.distance === 0,
    `Expected imported negative platform distance to normalize to 0, got ${fallbackImportPlatform?.distance}`
  );
  assert(
    fallbackImportPlatform?.period === 1,
    `Expected imported negative platform period to normalize to 1, got ${fallbackImportPlatform?.period}`
  );
  assert(fallbackImportExport.medalFrames.gold === 1800, `Expected imported gold medal frames to round to 1800, got ${fallbackImportExport.medalFrames.gold}`);
  assert(
    fallbackImportExport.medalFrames.silver === 2400,
    `Expected imported silver medal frames to round to 2400, got ${fallbackImportExport.medalFrames.silver}`
  );
  assert(fallbackImportExport.soundtrackKey === "level-4", `Expected imported soundtrack key level-4, got ${fallbackImportExport.soundtrackKey}`);
  assert(fallbackImportExport.backgroundKey === "time-lab-prototype", `Expected imported background key time-lab-prototype, got ${fallbackImportExport.backgroundKey}`);
  assert(importedName?.includes("Smoke Edited"), `Import did not update the level name: ${importedName}`);
  assert(importedValidation === "clean", `Expected clean validation after import, got ${importedValidation}`);
  assert(mobileValidation === "clean", `Expected clean mobile validation, got ${mobileValidation}`);
  assert(messages.length === 0, `Editor console issues: ${JSON.stringify(messages)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        levelOptions,
        initialValidation,
        afterEditValidation,
        importedName,
        importedValidation,
        mobileValidation,
        artifacts: {
          desktop: `${outDir}/editor-desktop.png`,
          mobile: `${outDir}/editor-mobile.png`,
          playtestDraft: `${outDir}/editor-playtest-draft.png`
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
