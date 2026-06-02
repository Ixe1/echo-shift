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

  await page.locator("[data-import-json]").fill("{broken json");
  await page.locator("[data-apply-import]").click();
  const malformedImportStatus = await page.locator("[data-editor-status]").textContent();
  const malformedImportValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

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

  await page.locator("[data-tool='hazards']").click();
  const canvas = page.locator("[data-editor-canvas]");
  const box = await canvas.boundingBox();
  assert(box, "Editor canvas has no bounding box");
  await page.mouse.move(box.x + 460, box.y + 430);
  await page.mouse.down();
  await page.mouse.move(box.x + 540, box.y + 448);
  await page.mouse.up();
  await page.locator("[data-object-field='id']").fill("smoke-hazard");
  await dispatchChange(page.locator("[data-object-field='id']"));

  const exportJson = await page.locator("[data-export-json]").inputValue();
  assert(exportJson.includes("smoke-hazard"), "Export JSON did not include the edited hazard");
  const afterEditValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await page.locator("[data-tool='doors']").click();
  await page.mouse.click(box.x + 620, box.y + 360);
  const doorYValue = await page.locator("[data-object-field='y']").inputValue();
  const doorPlacementValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");
  await page.locator("[data-delete-object]").click();
  const afterDoorDeleteValidation = await page.locator("[data-validation]").getAttribute("data-editor-validation");

  await page.locator("[data-save-draft]").click();
  const storedDraft = await page.evaluate(() => window.localStorage.getItem("echo-shift-level-editor-draft-v1"));
  assert(storedDraft?.includes("smoke-hazard"), "Draft did not persist edited hazard");

  const parsedExport = JSON.parse(exportJson);
  parsedExport[0].name = "Smoke Edited";
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
  assert(afterEditValidation === "clean", `Expected clean validation after edit, got ${afterEditValidation}`);
  assert(doorYValue !== "200", `Expected single-click door placement to use clicked world y instead of hardcoded 200, got ${doorYValue}`);
  assert(doorPlacementValidation === "clean", `Expected clean validation after door placement, got ${doorPlacementValidation}`);
  assert(afterDoorDeleteValidation === "clean", `Expected clean validation after deleting smoke door, got ${afterDoorDeleteValidation}`);
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
