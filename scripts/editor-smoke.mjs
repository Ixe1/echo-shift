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
  await page.goto(`${url}?editor=1`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-level-editor]").waitFor({ state: "visible" });
  await page.locator("[data-editor-canvas]").waitFor({ state: "visible" });
  await page.locator("[data-level-select]").selectOption("0");
  const levelOptions = await page.locator("[data-level-select] option").count();
  const initialValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  const leftSidebarOverflowY = await page.locator(".editor-sidebar.left").evaluate((element) => getComputedStyle(element).overflowY);
  const toolbarOverflowY = await page.locator(".toolbar-panel").evaluate((element) => getComputedStyle(element).overflowY);

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
  const hazardWidthBefore = Number(await page.locator("[data-object-field='w']").inputValue());
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: 780, y: 434 }, { x: 860, y: 434 });
  const hazardWidthAfter = Number(await page.locator("[data-object-field='w']").inputValue());

  await openTab(page, "objects");
  await page.locator("[data-object-list] [data-kind='exit']").click();
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
  const droneCenterX = (await objectNumber(page, "x")) + (await objectNumber(page, "w")) / 2;
  await page.locator("[data-tool='select']").click();
  await dragWorld(page, { x: droneCenterX, y: 360 }, { x: droneCenterX, y: 340 });
  const dronePathStartAfterDrag = Number(await page.locator("[data-object-field='pathStart']").inputValue());
  const droneExportJson = await page.locator("[data-export-json]").inputValue();

  await page.locator("[data-save-draft]").click();
  const storedDraft = await page.evaluate(() => window.localStorage.getItem("echo-shift-level-editor-draft-v1"));
  assert(storedDraft?.includes("smoke-hazard"), "Draft did not persist edited hazard");

  const parsedExport = JSON.parse(exportJson);
  parsedExport[0].name = "Smoke Edited";
  await openTab(page, "export");
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
  assert(levelOptions === 10, `Expected 10 editable levels, got ${levelOptions}`);
  assert(initialValidation === "clean", `Expected clean initial validation, got ${initialValidation}`);
  assert(leftSidebarOverflowY === "auto", `Expected left sidebar to scroll independently, got overflow-y ${leftSidebarOverflowY}`);
  assert(toolbarOverflowY === "auto", `Expected toolbar panel to scroll independently, got overflow-y ${toolbarOverflowY}`);
  assert(zoomBeforeWheel !== zoomAfterWheel, `Expected wheel input to zoom canvas, got ${zoomBeforeWheel} -> ${zoomAfterWheel}`);
  assert(zoomAfterWheel !== zoomAfterButton, `Expected zoom-out button to change zoom, got ${zoomAfterWheel} -> ${zoomAfterButton}`);
  assert(dragDropLaserExport.includes("smoke-laser-drop"), "Expected palette drag/drop to create smoke-laser-drop");
  assert(activeToolAfterDrop === "select", `Expected drag/drop creation to return toolbar to select mode, got ${activeToolAfterDrop}`);
  assert(!keyboardDeleteExport.includes("smoke-laser-drop"), "Expected keyboard Delete to remove selected smoke-laser-drop");
  assert(keyboardDeleteValidation === "clean", `Expected clean validation after keyboard delete, got ${keyboardDeleteValidation}`);
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
  assert(floorDefaultHeight >= 40, `Expected new solid/floor defaults to be selectable, got height ${floorDefaultHeight}`);
  assert(reselectedThinSolidId === "smoke-floor", `Expected thin solid canvas hit tolerance to reselect smoke-floor, got ${reselectedThinSolidId}`);
  assert(hazardWidthAfter > hazardWidthBefore, `Expected resize drag to widen hazard: ${hazardWidthBefore} -> ${hazardWidthAfter}`);
  assert(exitWidthAfter === exitWidthBefore, `Expected exit portal width to stay locked during handle drag: ${exitWidthBefore} -> ${exitWidthAfter}`);
  assert(plateWidthAfter === plateWidthBefore, `Expected pressure plate width to stay locked during handle drag: ${plateWidthBefore} -> ${plateWidthAfter}`);
  assert(droneWidthAfter === droneWidthBefore, `Expected drone body width to stay locked during handle drag: ${droneWidthBefore} -> ${droneWidthAfter}`);
  assert(doorYValue !== "200", `Expected single-click door placement to use clicked world y instead of hardcoded 200, got ${doorYValue}`);
  assert(doorPlacementValidation === "clean", `Expected clean validation after door placement, got ${doorPlacementValidation}`);
  assert(afterDoorDeleteValidation === "clean", `Expected clean validation after deleting smoke door, got ${afterDoorDeleteValidation}`);
  assert(dronePeriod === 100, `Expected speed 120 over 50px drone distance to produce period 100, got ${dronePeriod}`);
  assert(dronePathStartAfterDrag === 340, `Expected draggable drone path endpoint to set start to 340, got ${dronePathStartAfterDrag}`);
  assert(droneExportJson.includes('"axis": "y"'), "Expected drone export JSON to include vertical axis");
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
          mobile: `${outDir}/editor-mobile.png`
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
