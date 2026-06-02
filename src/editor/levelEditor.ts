import { levels as sourceLevels } from "../data/levels";
import type {
  Core,
  Door,
  Hazard,
  Laser,
  Level,
  MovingPlatform,
  PatrolDrone,
  PressurePlate,
  Rect,
  Solid,
  Vec2
} from "../game/types";
import "./levelEditor.css";

const rectCollections = ["solids", "platforms", "hazards", "plates", "doors", "lasers", "cores", "drones"] as const;
type RectCollection = (typeof rectCollections)[number];
type RectObject = Solid | MovingPlatform | Hazard | PressurePlate | Door | Laser | Core | PatrolDrone;
type SelectableKind = RectCollection | "start" | "exit";
type Tool = SelectableKind | "select";
type EditorPanel = "inspect" | "objects" | "validation" | "export";
type ValidationSeverity = "error" | "warning";
type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type Selection =
  | { kind: "start" }
  | { kind: "exit" }
  | {
      kind: RectCollection;
      id: string;
    };

type DragState =
  | {
      mode: "pan";
      pointerStart: Vec2;
      viewStart: Vec2;
    }
  | {
      mode: "move";
      selection: Selection;
      pointerStartWorld: Vec2;
      startRect: Rect;
    }
  | {
      mode: "resize";
      selection: Selection;
      handle: ResizeHandle;
      pointerStartWorld: Vec2;
      startRect: Rect;
    }
  | {
      mode: "create";
      kind: RectCollection;
      id: string;
      origin: Vec2;
      startRect: Rect;
    };

type ValidationMessage = {
  severity: ValidationSeverity;
  text: string;
};

type EditorDraft = {
  levels: Level[];
  currentIndex: number;
};

const STORAGE_KEY = "echo-shift-level-editor-draft-v1";
const GRID = 20;
const MIN_RECT_SIZE = 4;
const PLAYER_RECT = { w: 24, h: 34 };
const CLOSED_GATE_MAX_TOP = 220;

const collectionLabels: Record<RectCollection, string> = {
  solids: "Solids",
  platforms: "Platforms",
  hazards: "Hazards",
  plates: "Plates",
  doors: "Doors",
  lasers: "Lasers",
  cores: "Cores",
  drones: "Drones"
};

const toolLabels: Record<Tool, string> = {
  select: "Select",
  start: "Start",
  exit: "Exit",
  solids: "Solid",
  platforms: "Platform",
  hazards: "Hazard",
  plates: "Plate",
  doors: "Door",
  lasers: "Laser",
  cores: "Core",
  drones: "Drone"
};

const cloneLevels = (items: Level[]): Level[] => JSON.parse(JSON.stringify(items)) as Level[];

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const snap = (value: number): number => Math.round(value / GRID) * GRID;

const snapPoint = (point: Vec2): Vec2 => ({
  x: snap(point.x),
  y: snap(point.y)
});

const positiveNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const csvToList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const listToCsv = (value: string[] | undefined): string => (value || []).join(", ");

const rectContains = (rect: Rect, point: Vec2): boolean =>
  point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;

const rectInside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

const normalizeRect = (rect: Rect): Rect => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  w: Math.max(1, Math.round(rect.w)),
  h: Math.max(1, Math.round(rect.h))
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const styleForKind = (kind: SelectableKind, item?: RectObject): { fill: string; stroke: string; text: string } => {
  if (kind === "start") return { fill: "rgba(67, 247, 255, 0.82)", stroke: "#ecfbff", text: "#041018" };
  if (kind === "exit") return { fill: "rgba(189, 92, 255, 0.34)", stroke: "#43f7ff", text: "#ecfbff" };
  if (kind === "solids") {
    const tone = (item as Solid | undefined)?.tone;
    if (tone === "dark") return { fill: "#111827", stroke: "#4b607c", text: "#ecfbff" };
    if (tone === "warning") return { fill: "#473b18", stroke: "#ffe35a", text: "#fff8bf" };
    if (tone === "glass") return { fill: "#143447", stroke: "#43f7ff", text: "#ecfbff" };
    return { fill: "#17243a", stroke: "#43f7ff", text: "#ecfbff" };
  }
  if (kind === "platforms") return { fill: "#25344d", stroke: "#ffe35a", text: "#fff8bf" };
  if (kind === "hazards") return { fill: "rgba(255, 79, 139, 0.42)", stroke: "#ff4f8b", text: "#fff" };
  if (kind === "plates") return { fill: "rgba(255, 227, 90, 0.72)", stroke: "#fff4a0", text: "#05070d" };
  if (kind === "doors") return { fill: "rgba(189, 92, 255, 0.28)", stroke: "#ff4f8b", text: "#ecfbff" };
  if (kind === "lasers") return { fill: "rgba(255, 47, 108, 0.62)", stroke: "#ff4f8b", text: "#fff" };
  if (kind === "cores") return { fill: "rgba(255, 227, 90, 0.8)", stroke: "#ecfbff", text: "#05070d" };
  return { fill: "rgba(255, 79, 139, 0.5)", stroke: "#ff4f8b", text: "#fff" };
};

const defaultSizeFor = (kind: RectCollection): { w: number; h: number } => {
  switch (kind) {
    case "solids":
      return { w: 140, h: 18 };
    case "platforms":
      return { w: 120, h: 18 };
    case "hazards":
      return { w: 60, h: 8 };
    case "plates":
      return { w: 70, h: 8 };
    case "doors":
      return { w: 28, h: 300 };
    case "lasers":
      return { w: 140, h: 12 };
    case "cores":
      return { w: 24, h: 24 };
    case "drones":
      return { w: 30, h: 24 };
  }
};

const movingPath = (item: MovingPlatform | PatrolDrone): { start: number; end: number; center: number; speed: number } => {
  const center = item.axis === "x" ? item.x + item.w / 2 : item.y + item.h / 2;
  const distance = Math.max(0, item.distance);
  return {
    start: center - distance,
    end: center + distance,
    center,
    speed: item.period > 0 ? Math.round((240 * distance) / item.period) : 0
  };
};

const setMovingPath = (
  item: MovingPlatform | PatrolDrone,
  nextStart: number,
  nextEnd: number
): void => {
  const start = Math.min(nextStart, nextEnd);
  const end = Math.max(nextStart, nextEnd);
  const center = (start + end) / 2;
  item.distance = Math.max(0, (end - start) / 2);
  if (item.axis === "x") item.x = center - item.w / 2;
  else item.y = center - item.h / 2;
};

const resizeHandlesForRect = (rect: Rect): Array<{ handle: ResizeHandle; point: Vec2 }> => [
  { handle: "nw", point: { x: rect.x, y: rect.y } },
  { handle: "n", point: { x: rect.x + rect.w / 2, y: rect.y } },
  { handle: "ne", point: { x: rect.x + rect.w, y: rect.y } },
  { handle: "e", point: { x: rect.x + rect.w, y: rect.y + rect.h / 2 } },
  { handle: "se", point: { x: rect.x + rect.w, y: rect.y + rect.h } },
  { handle: "s", point: { x: rect.x + rect.w / 2, y: rect.y + rect.h } },
  { handle: "sw", point: { x: rect.x, y: rect.y + rect.h } },
  { handle: "w", point: { x: rect.x, y: rect.y + rect.h / 2 } }
];

const readCollection = (level: Level, kind: RectCollection): RectObject[] => {
  if (kind === "solids") return level.solids;
  return ((level as unknown as Record<RectCollection, RectObject[] | undefined>)[kind] || []) as RectObject[];
};

const ensureCollection = (level: Level, kind: RectCollection): RectObject[] => {
  if (kind === "solids") return level.solids;
  const record = level as unknown as Record<RectCollection, RectObject[] | undefined>;
  record[kind] ||= [];
  return record[kind] || [];
};

const normalizeImportedLevel = (value: unknown, fallbackIndex: number): Level | null => {
  if (!isRecord(value)) return null;
  const boundsRecord = isRecord(value.bounds) ? value.bounds : {};
  const exitRecord = isRecord(value.exit) ? value.exit : {};
  const startRecord = isRecord(value.start) ? value.start : {};
  const medalRecord = isRecord(value.medalFrames) ? value.medalFrames : {};

  const level: Level = {
    id: String(value.id || `level-${fallbackIndex + 1}`),
    index: positiveNumber(value.index, fallbackIndex),
    name: String(value.name || `Level ${fallbackIndex + 1}`),
    subtitle: String(value.subtitle || ""),
    start: {
      x: positiveNumber(startRecord.x, 60),
      y: positiveNumber(startRecord.y, 450)
    },
    exit: normalizeRect({
      x: positiveNumber(exitRecord.x, 860),
      y: positiveNumber(exitRecord.y, 438),
      w: positiveNumber(exitRecord.w, 48),
      h: positiveNumber(exitRecord.h, 62)
    }),
    bounds: normalizeRect({
      x: positiveNumber(boundsRecord.x, 0),
      y: positiveNumber(boundsRecord.y, 0),
      w: positiveNumber(boundsRecord.w, 960),
      h: positiveNumber(boundsRecord.h, 540)
    }),
    solids: Array.isArray(value.solids) ? (value.solids as Solid[]).map((item) => normalizeObject(item, "solids")) : [],
    platforms: normalizeOptionalCollection(value.platforms, "platforms") as MovingPlatform[],
    drones: normalizeOptionalCollection(value.drones, "drones") as PatrolDrone[],
    plates: normalizeOptionalCollection(value.plates, "plates") as PressurePlate[],
    doors: normalizeOptionalCollection(value.doors, "doors") as Door[],
    lasers: normalizeOptionalCollection(value.lasers, "lasers") as Laser[],
    cores: normalizeOptionalCollection(value.cores, "cores") as Core[],
    hazards: normalizeOptionalCollection(value.hazards, "hazards") as Hazard[],
    perfectEchoes: positiveNumber(value.perfectEchoes, 0),
    medalFrames: {
      gold: positiveNumber(medalRecord.gold, 1800),
      silver: positiveNumber(medalRecord.silver, 2400)
    },
    hint: String(value.hint || "")
  };

  return level;
};

const normalizeOptionalCollection = (value: unknown, kind: RectCollection): RectObject[] | undefined =>
  Array.isArray(value) ? value.map((item) => normalizeObject(item, kind)) : undefined;

const normalizeObject = (value: unknown, kind: RectCollection): RectObject => {
  const record = isRecord(value) ? value : {};
  const base = normalizeRect({
    x: positiveNumber(record.x, 0),
    y: positiveNumber(record.y, 0),
    w: positiveNumber(record.w, defaultSizeFor(kind).w),
    h: positiveNumber(record.h, defaultSizeFor(kind).h)
  });
  const id = String(record.id || `${kind}-${Date.now().toString(36)}`);

  if (kind === "solids") return { ...base, id, tone: record.tone as Solid["tone"] };
  if (kind === "platforms" || kind === "drones") {
    return {
      ...base,
      id,
      axis: record.axis === "y" ? "y" : "x",
      distance: positiveNumber(record.distance, 100),
      period: Math.max(1, positiveNumber(record.period, 180)),
      phase: positiveNumber(record.phase, 0)
    } as MovingPlatform | PatrolDrone;
  }
  if (kind === "plates") {
    return {
      ...base,
      id,
      label: typeof record.label === "string" ? record.label : undefined,
      once: record.once === true ? true : undefined
    } as PressurePlate;
  }
  if (kind === "doors") {
    return {
      ...base,
      id,
      opensWith: Array.isArray(record.opensWith) ? record.opensWith.map(String) : undefined,
      requiresCore: typeof record.requiresCore === "string" ? record.requiresCore : undefined,
      inverted: record.inverted === true ? true : undefined
    } as Door;
  }
  if (kind === "lasers") {
    return {
      ...base,
      id,
      disabledBy: Array.isArray(record.disabledBy) ? record.disabledBy.map(String) : undefined,
      startsOn: record.startsOn === false ? false : record.startsOn === true ? true : undefined
    } as Laser;
  }
  if (kind === "cores") {
    return {
      ...base,
      id,
      label: typeof record.label === "string" ? record.label : undefined
    } as Core;
  }
  return { ...base, id } as Hazard;
};

class LevelEditor {
  private readonly host: HTMLElement;
  private levels: Level[];
  private currentIndex = 0;
  private tool: Tool = "select";
  private selection: Selection | null = null;
  private activePanel: EditorPanel = "inspect";
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private exportArea!: HTMLTextAreaElement;
  private importArea!: HTMLTextAreaElement;
  private statusElement!: HTMLElement;
  private readonly view: Rect = { x: -60, y: -60, w: 1, h: 1 };
  private drag: DragState | null = null;
  private resizeObserver?: ResizeObserver;
  private hasFitInitialLevel = false;

  constructor(host: HTMLElement) {
    this.host = host;
    const draft = this.loadDraft();
    this.levels = draft?.levels || cloneLevels(sourceLevels);
    this.currentIndex = clamp(draft?.currentIndex || 0, 0, this.levels.length - 1);
  }

  mount(): void {
    document.body.classList.add("level-editor-mode");
    this.host.innerHTML = this.shellHtml();
    this.canvas = this.require<HTMLCanvasElement>("[data-editor-canvas]");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Level editor canvas context unavailable");
    this.context = context;
    this.exportArea = this.require<HTMLTextAreaElement>("[data-export-json]");
    this.importArea = this.require<HTMLTextAreaElement>("[data-import-json]");
    this.statusElement = this.require<HTMLElement>("[data-editor-status]");
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.renderCanvas();
    });
    this.resizeObserver.observe(this.canvas);
    this.resizeCanvas();
    this.renderAll();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    document.body.classList.remove("level-editor-mode");
  }

  private get level(): Level {
    return this.levels[this.currentIndex];
  }

  private shellHtml(): string {
    const tools = (["select", "start", "exit", ...rectCollections] as Tool[])
      .map(
        (tool) =>
          `<button class="editor-tool" type="button" data-tool="${tool}" title="${escapeHtml(toolLabels[tool])}">${escapeHtml(toolLabels[tool])}</button>`
      )
      .join("");

    return `
      <main class="level-editor" data-level-editor>
        <header class="editor-topbar">
          <div class="editor-title">
            <strong>Echo Shift Editor</strong>
            <span data-editor-status>Draft ready</span>
          </div>
          <label class="editor-level-select">
            <span>Level</span>
            <select data-level-select></select>
          </label>
          <div class="editor-actions">
            <button type="button" class="editor-button" data-save-draft>Save Draft</button>
            <button type="button" class="editor-button" data-reset-source>Reset Source</button>
            <button type="button" class="editor-button primary" data-back-game>Game</button>
          </div>
        </header>
        <section class="editor-workspace">
          <aside class="editor-sidebar left">
            <section class="editor-panel toolbar-panel">
              <h2>Tools</h2>
              <div class="editor-tool-grid" data-tool-grid>${tools}</div>
              <div class="editor-viewport-actions">
                <button type="button" class="editor-button" data-add-object>Add</button>
                <button type="button" class="editor-button" data-duplicate-object>Duplicate</button>
                <button type="button" class="editor-button danger" data-delete-object>Delete</button>
              </div>
              <div class="editor-viewport-actions">
                <button type="button" class="editor-button" data-fit-level>Fit</button>
                <button type="button" class="editor-button" data-center-start>Start</button>
              </div>
            </section>
          </aside>
          <section class="editor-canvas-panel">
            <canvas data-editor-canvas></canvas>
          </section>
          <aside class="editor-sidebar right editor-dock">
            <section class="editor-panel editor-tabs-panel">
              <div class="editor-tabs" data-editor-tabs>
                <button type="button" data-editor-tab="inspect">Inspect</button>
                <button type="button" data-editor-tab="objects">Objects</button>
                <button type="button" data-editor-tab="validation">Validate</button>
                <button type="button" data-editor-tab="export">Export</button>
              </div>
              <section class="editor-tab-panel inspector-panel" data-tab-panel="inspect">
                <h2>Inspector</h2>
                <div data-inspector></div>
              </section>
              <section class="editor-tab-panel object-list-panel" data-tab-panel="objects">
                <h2>Objects</h2>
                <div class="editor-object-list" data-object-list></div>
              </section>
              <section class="editor-tab-panel validation-panel" data-tab-panel="validation">
                <h2>Validation</h2>
                <div data-validation></div>
              </section>
              <section class="editor-tab-panel export-panel" data-tab-panel="export">
                <h2>Export</h2>
                <div class="editor-viewport-actions">
                  <button type="button" class="editor-button" data-copy-export>Copy JSON</button>
                  <button type="button" class="editor-button" data-download-export>Download</button>
                  <button type="button" class="editor-button" data-apply-import>Import</button>
                </div>
                <textarea readonly data-export-json spellcheck="false"></textarea>
                <textarea data-import-json spellcheck="false" placeholder="Paste exported Level or Level[] JSON"></textarea>
              </section>
            </section>
          </aside>
        </section>
      </main>
    `;
  }

  private bindEvents(): void {
    this.require<HTMLSelectElement>("[data-level-select]").addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      this.currentIndex = clamp(Number(target.value), 0, this.levels.length - 1);
      this.selection = null;
      this.centerOnStart();
      this.renderAll();
      this.persistDraft("Level selected");
    });

    this.require<HTMLElement>("[data-tool-grid]").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tool]");
      if (!button) return;
      this.tool = button.dataset.tool as Tool;
      this.renderToolbar();
      this.setStatus(`${toolLabels[this.tool]} tool`);
    });

    this.require<HTMLElement>("[data-editor-tabs]").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-editor-tab]");
      if (!button) return;
      this.activePanel = button.dataset.editorTab as EditorPanel;
      this.renderPanelTabs();
    });

    this.require<HTMLElement>("[data-object-list]").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-kind]");
      if (!button) return;
      const kind = button.dataset.kind as SelectableKind;
      this.selection = kind === "start" || kind === "exit" ? { kind } : { kind, id: button.dataset.id || "" };
      this.tool = "select";
      this.activePanel = "inspect";
      this.renderAll();
    });

    this.require<HTMLElement>("[data-inspector]").addEventListener("change", (event) => this.handleInspectorChange(event));
    this.require<HTMLElement>("[data-inspector]").addEventListener("input", (event) => {
      const target = event.target as HTMLElement;
      if (target.matches("[data-live-field]")) this.handleInspectorChange(event);
    });

    this.require<HTMLButtonElement>("[data-add-object]").addEventListener("click", () => this.addObjectAtViewCenter());
    this.require<HTMLButtonElement>("[data-duplicate-object]").addEventListener("click", () => this.duplicateSelection());
    this.require<HTMLButtonElement>("[data-delete-object]").addEventListener("click", () => this.deleteSelection());
    this.require<HTMLButtonElement>("[data-fit-level]").addEventListener("click", () => {
      this.fitLevel();
      this.renderCanvas();
    });
    this.require<HTMLButtonElement>("[data-center-start]").addEventListener("click", () => {
      this.centerOnStart();
      this.renderCanvas();
    });
    this.require<HTMLButtonElement>("[data-save-draft]").addEventListener("click", () => this.persistDraft("Draft saved"));
    this.require<HTMLButtonElement>("[data-reset-source]").addEventListener("click", () => {
      this.levels = cloneLevels(sourceLevels);
      this.currentIndex = 0;
      this.selection = null;
      this.clearDraft();
      this.fitLevel();
      this.renderAll();
      this.setStatus("Source data restored");
    });
    this.require<HTMLButtonElement>("[data-back-game]").addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("editor");
      window.location.href = `${url.pathname}${url.search}${url.hash}`;
    });
    this.require<HTMLButtonElement>("[data-copy-export]").addEventListener("click", () => void this.copyExport());
    this.require<HTMLButtonElement>("[data-download-export]").addEventListener("click", () => this.downloadExport());
    this.require<HTMLButtonElement>("[data-apply-import]").addEventListener("click", () => this.applyImport());

    this.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.handlePointerUp(event));
    this.canvas.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
  }

  private handleInspectorChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (target.dataset.levelField) {
      this.updateLevelField(target.dataset.levelField, this.readInputValue(target));
    }
    if (target.dataset.objectField) {
      this.updateObjectField(target.dataset.objectField, this.readInputValue(target));
    }
  }

  private readInputValue(target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | number | boolean {
    if (target instanceof HTMLInputElement && target.type === "checkbox") return target.checked;
    if (target.dataset.fieldType === "number") return positiveNumber(target.value, 0);
    return target.value;
  }

  private updateLevelField(field: string, value: string | number | boolean): void {
    const level = this.level;
    if (field === "id" || field === "name" || field === "subtitle" || field === "hint") {
      (level as unknown as Record<string, string>)[field] = String(value);
    } else if (field === "bounds.x" || field === "bounds.y" || field === "bounds.w" || field === "bounds.h") {
      const key = field.split(".")[1] as keyof Rect;
      level.bounds[key] = Number(value);
      if (key === "w" || key === "h") level.bounds[key] = Math.max(1, level.bounds[key]);
    } else if (field === "perfectEchoes") {
      level.perfectEchoes = Math.max(0, Math.round(Number(value)));
    } else if (field === "index") {
      level.index = Math.max(0, Math.round(Number(value)));
    } else if (field === "medalFrames.gold" || field === "medalFrames.silver") {
      const key = field.split(".")[1] as "gold" | "silver";
      level.medalFrames[key] = Math.max(1, Math.round(Number(value)));
    }
    this.afterMutation("Level updated");
  }

  private updateObjectField(field: string, value: string | number | boolean): void {
    if (!this.selection) return;
    if (this.selection.kind === "start") {
      if (field === "x" || field === "y") this.level.start[field] = Number(value);
      this.afterMutation("Start updated");
      return;
    }
    const target = this.selectedRectObject();
    if (!target) return;
    if (field === "x" || field === "y" || field === "w" || field === "h") {
      target[field] = field === "w" || field === "h" ? Math.max(1, Number(value)) : Number(value);
    } else if (field === "id") {
      target.id = String(value);
      if ("id" in this.selection) this.selection.id = target.id;
    } else {
      this.updateSpecificObjectField(target, field, value);
    }
    this.afterMutation("Object updated");
  }

  private updateSpecificObjectField(target: RectObject, field: string, value: string | number | boolean): void {
    const record = target as unknown as Record<string, unknown>;
    if (field === "opensWith" || field === "disabledBy") {
      const items = csvToList(String(value));
      if (items.length > 0) record[field] = items;
      else delete record[field];
      return;
    }
    if (field === "requiresCore" || field === "label" || field === "tone") {
      const text = String(value).trim();
      if (text) record[field] = text;
      else delete record[field];
      return;
    }
    if (field === "axis") {
      record.axis = value === "y" ? "y" : "x";
      return;
    }
    if (field === "pathStart" || field === "pathEnd") {
      const moving = target as MovingPlatform | PatrolDrone;
      const path = movingPath(moving);
      setMovingPath(moving, field === "pathStart" ? Number(value) : path.start, field === "pathEnd" ? Number(value) : path.end);
      return;
    }
    if (field === "speed") {
      const moving = target as MovingPlatform | PatrolDrone;
      const speed = Math.max(1, Number(value));
      moving.period = Math.max(1, Math.round((240 * Math.max(1, moving.distance)) / speed));
      return;
    }
    if (field === "distance" || field === "period" || field === "phase") {
      record[field] = field === "period" ? Math.max(1, Number(value)) : Number(value);
      return;
    }
    if (field === "once" || field === "inverted") {
      if (value === true) record[field] = true;
      else delete record[field];
      return;
    }
    if (field === "startsOn") {
      record.startsOn = value === true;
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    this.canvas.setPointerCapture(event.pointerId);
    const rawWorld = this.screenToWorld({ x: event.offsetX, y: event.offsetY });
    const world = snapPoint(rawWorld);

    if (event.button === 1 || event.altKey) {
      this.drag = {
        mode: "pan",
        pointerStart: { x: event.clientX, y: event.clientY },
        viewStart: { x: this.view.x, y: this.view.y }
      };
      return;
    }

    if (this.tool === "select") {
      const resizeHit = this.hitResizeHandle(rawWorld);
      if (resizeHit) {
        this.drag = {
          mode: "resize",
          selection: resizeHit.selection,
          handle: resizeHit.handle,
          pointerStartWorld: world,
          startRect: resizeHit.rect
        };
        this.activePanel = "inspect";
        this.renderAll();
        return;
      }

      const hit = this.hitTest(world);
      this.selection = hit;
      if (!hit) {
        this.drag = {
          mode: "pan",
          pointerStart: { x: event.clientX, y: event.clientY },
          viewStart: { x: this.view.x, y: this.view.y }
        };
        this.renderAll();
        return;
      }
      const startRect = this.rectForSelection(hit);
      this.drag = startRect
        ? {
            mode: "move",
            selection: hit,
            pointerStartWorld: world,
            startRect
          }
        : null;
      this.activePanel = "inspect";
      this.renderAll();
      return;
    }

    if (this.tool === "start") {
      this.level.start = { x: world.x, y: world.y };
      this.selection = { kind: "start" };
      this.activePanel = "inspect";
      this.afterMutation("Start placed");
      return;
    }

    if (this.tool === "exit") {
      this.level.exit = { x: world.x, y: world.y, w: 48, h: 62 };
      this.selection = { kind: "exit" };
      this.activePanel = "inspect";
      this.afterMutation("Exit placed");
      return;
    }

    const object = this.createObject(this.tool, world);
    ensureCollection(this.level, this.tool).push(object);
    this.selection = { kind: this.tool, id: object.id };
    this.activePanel = "inspect";
    this.drag = {
      mode: "create",
      kind: this.tool,
      id: object.id,
      origin: world,
      startRect: { x: object.x, y: object.y, w: object.w, h: object.h }
    };
    this.afterMutation(`${collectionLabels[this.tool]} object added`);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    if (this.drag.mode === "pan") {
      const dx = (event.clientX - this.drag.pointerStart.x) / this.view.w;
      const dy = (event.clientY - this.drag.pointerStart.y) / this.view.w;
      this.view.x = this.drag.viewStart.x - dx;
      this.view.y = this.drag.viewStart.y - dy;
      this.renderCanvas();
      return;
    }

    const world = snapPoint(this.screenToWorld({ x: event.offsetX, y: event.offsetY }));
    if (this.drag.mode === "move") {
      const dx = world.x - this.drag.pointerStartWorld.x;
      const dy = world.y - this.drag.pointerStartWorld.y;
      this.moveSelection(this.drag.selection, this.drag.startRect, dx, dy);
      this.renderObjectList();
      this.renderInspector();
      this.renderValidation();
      this.renderExport();
      this.renderCanvas();
      return;
    }

    if (this.drag.mode === "resize") {
      const dx = world.x - this.drag.pointerStartWorld.x;
      const dy = world.y - this.drag.pointerStartWorld.y;
      this.resizeSelection(this.drag.selection, this.drag.startRect, this.drag.handle, dx, dy);
      this.renderObjectList();
      this.renderInspector();
      this.renderValidation();
      this.renderExport();
      this.renderCanvas();
      return;
    }

    const target = this.findObject(this.drag.kind, this.drag.id);
    if (!target) return;
    const size = defaultSizeFor(this.drag.kind);
    const minX = Math.min(this.drag.origin.x, world.x);
    const minY = Math.min(this.drag.origin.y, world.y);
    const maxX = Math.max(this.drag.origin.x, world.x);
    const maxY = Math.max(this.drag.origin.y, world.y);
    target.x = minX;
    target.y = minY;
    target.w = Math.max(size.w, maxX - minX);
    target.h = Math.max(size.h, maxY - minY);
    if (Math.abs(world.x - this.drag.origin.x) < GRID && Math.abs(world.y - this.drag.origin.y) < GRID) {
      Object.assign(target, this.drag.startRect);
    }
    this.renderObjectList();
    this.renderInspector();
    this.renderValidation();
    this.renderExport();
    this.renderCanvas();
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.drag && this.drag.mode !== "pan") this.persistDraft("Draft autosaved");
    this.drag = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const before = this.screenToWorld({ x: event.offsetX, y: event.offsetY });
      const nextZoom = clamp(this.view.w * (event.deltaY > 0 ? 0.88 : 1.12), 0.16, 2.2);
      this.view.w = nextZoom;
      const after = this.screenToWorld({ x: event.offsetX, y: event.offsetY });
      this.view.x += before.x - after.x;
      this.view.y += before.y - after.y;
    } else {
      this.view.x += (event.deltaX || event.deltaY) / this.view.w;
      if (event.shiftKey) this.view.y += event.deltaY / this.view.w;
    }
    this.renderCanvas();
  }

  private moveSelection(selection: Selection, startRect: Rect, dx: number, dy: number): void {
    if (selection.kind === "start") {
      this.level.start = { x: startRect.x + dx, y: startRect.y + dy };
      return;
    }
    const rect = selection.kind === "exit" ? this.level.exit : this.findObject(selection.kind, selection.id);
    if (!rect) return;
    rect.x = startRect.x + dx;
    rect.y = startRect.y + dy;
  }

  private resizeSelection(selection: Selection, startRect: Rect, handle: ResizeHandle, dx: number, dy: number): void {
    if (selection.kind === "start") return;
    const rect = selection.kind === "exit" ? this.level.exit : this.findObject(selection.kind, selection.id);
    if (!rect) return;

    let left = startRect.x;
    let right = startRect.x + startRect.w;
    let top = startRect.y;
    let bottom = startRect.y + startRect.h;

    if (handle.includes("w")) left = Math.min(startRect.x + dx, right - MIN_RECT_SIZE);
    if (handle.includes("e")) right = Math.max(startRect.x + MIN_RECT_SIZE, startRect.x + startRect.w + dx);
    if (handle.includes("n")) top = Math.min(startRect.y + dy, bottom - MIN_RECT_SIZE);
    if (handle.includes("s")) bottom = Math.max(startRect.y + MIN_RECT_SIZE, startRect.y + startRect.h + dy);

    rect.x = left;
    rect.y = top;
    rect.w = right - left;
    rect.h = bottom - top;
  }

  private hitResizeHandle(point: Vec2): { selection: Selection; handle: ResizeHandle; rect: Rect } | null {
    if (!this.selection || this.selection.kind === "start") return null;
    const rect = this.rectForSelection(this.selection);
    if (!rect) return null;
    const tolerance = Math.max(8 / this.view.w, 5);
    for (const { handle, point: handlePoint } of resizeHandlesForRect(rect)) {
      if (Math.abs(point.x - handlePoint.x) <= tolerance && Math.abs(point.y - handlePoint.y) <= tolerance) {
        return { selection: this.selection, handle, rect };
      }
    }
    return null;
  }

  private addObjectAtViewCenter(): void {
    if (!rectCollections.includes(this.tool as RectCollection)) {
      this.setStatus("Choose an object tool first");
      return;
    }
    const kind = this.tool as RectCollection;
    const world = snapPoint({
      x: this.view.x + this.canvas.width / this.view.w / 2,
      y: this.view.y + this.canvas.height / this.view.w / 2
    });
    const object = this.createObject(kind, world);
    ensureCollection(this.level, kind).push(object);
    this.selection = { kind, id: object.id };
    this.activePanel = "inspect";
    this.afterMutation(`${collectionLabels[kind]} object added`);
  }

  private duplicateSelection(): void {
    if (!this.selection || this.selection.kind === "start") {
      this.setStatus("Select an object to duplicate");
      return;
    }
    if (this.selection.kind === "exit") {
      this.level.exit = { ...this.level.exit, x: this.level.exit.x + GRID, y: this.level.exit.y + GRID };
      this.afterMutation("Exit duplicated in place");
      return;
    }
    const object = this.findObject(this.selection.kind, this.selection.id);
    if (!object) return;
    const copy = {
      ...(JSON.parse(JSON.stringify(object)) as RectObject),
      id: this.nextObjectId(this.selection.kind),
      x: object.x + GRID,
      y: object.y + GRID
    };
    ensureCollection(this.level, this.selection.kind).push(copy);
    this.selection = { kind: this.selection.kind, id: copy.id };
    this.activePanel = "inspect";
    this.afterMutation("Object duplicated");
  }

  private deleteSelection(): void {
    if (!this.selection || this.selection.kind === "start" || this.selection.kind === "exit") {
      this.setStatus("Select a placed object to delete");
      return;
    }
    const { kind, id } = this.selection;
    const collection = ensureCollection(this.level, kind);
    const next = collection.filter((item) => item.id !== id);
    (this.level as unknown as Record<RectCollection, RectObject[]>)[kind] = next;
    this.selection = null;
    this.afterMutation("Object deleted");
  }

  private createObject(kind: RectCollection, point: Vec2): RectObject {
    const size = defaultSizeFor(kind);
    const id = this.nextObjectId(kind);
    const base = { id, x: point.x, y: point.y, w: size.w, h: size.h };
    if (kind === "solids") return { ...base, tone: "steel" };
    if (kind === "platforms") return { ...base, axis: "x", distance: 100, period: 180, phase: 0 } as MovingPlatform;
    if (kind === "hazards") return base as Hazard;
    if (kind === "plates") return base as PressurePlate;
    if (kind === "doors") return { ...base, opensWith: [] } as Door;
    if (kind === "lasers") return { ...base, startsOn: true } as Laser;
    if (kind === "cores") return { ...base, label: id.split("-").at(-1)?.toUpperCase() } as Core;
    return { ...base, axis: "x", distance: 120, period: 200, phase: 0 } as PatrolDrone;
  }

  private nextObjectId(kind: RectCollection): string {
    const stem = kind.slice(0, -1) || kind;
    const existing = new Set(readCollection(this.level, kind).map((item) => item.id));
    let index = readCollection(this.level, kind).length + 1;
    let id = `${stem}-${index}`;
    while (existing.has(id)) {
      index += 1;
      id = `${stem}-${index}`;
    }
    return id;
  }

  private renderAll(): void {
    this.renderLevelSelect();
    this.renderToolbar();
    this.renderPanelTabs();
    this.renderObjectList();
    this.renderInspector();
    this.renderValidation();
    this.renderExport();
    this.renderCanvas();
    if (!this.hasFitInitialLevel) {
      this.fitLevel();
      this.hasFitInitialLevel = true;
      this.renderCanvas();
    }
  }

  private renderPanelTabs(): void {
    this.host.querySelectorAll<HTMLButtonElement>("[data-editor-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.editorTab === this.activePanel);
    });
    this.host.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== this.activePanel;
    });
  }

  private renderLevelSelect(): void {
    const select = this.require<HTMLSelectElement>("[data-level-select]");
    select.innerHTML = this.levels
      .map(
        (level, index) =>
          `<option value="${index}" ${index === this.currentIndex ? "selected" : ""}>${index + 1}. ${escapeHtml(level.name)}</option>`
      )
      .join("");
  }

  private renderToolbar(): void {
    this.host.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === this.tool);
    });
  }

  private renderObjectList(): void {
    const items = [
      this.objectListButton({ kind: "start" }, "Start", `x ${Math.round(this.level.start.x)}, y ${Math.round(this.level.start.y)}`),
      this.objectListButton({ kind: "exit" }, "Exit", this.rectSummary(this.level.exit)),
      ...rectCollections.flatMap((kind) => {
        const objects = readCollection(this.level, kind);
        if (objects.length === 0) {
          return [`<div class="object-group empty"><span>${collectionLabels[kind]}</span><em>0</em></div>`];
        }
        return [
          `<div class="object-group"><span>${collectionLabels[kind]}</span><em>${objects.length}</em></div>`,
          ...objects.map((object) => this.objectListButton({ kind, id: object.id }, object.id, this.rectSummary(object)))
        ];
      })
    ];
    this.require<HTMLElement>("[data-object-list]").innerHTML = items.join("");
  }

  private objectListButton(selection: Selection, name: string, meta: string): string {
    const selected = this.selectionMatches(selection) ? "active" : "";
    const id = "id" in selection ? `data-id="${escapeHtml(selection.id)}"` : "";
    return `
      <button type="button" class="object-row ${selected}" data-kind="${selection.kind}" ${id}>
        <span>${escapeHtml(name)}</span>
        <small>${escapeHtml(meta)}</small>
      </button>
    `;
  }

  private renderInspector(): void {
    const level = this.level;
    const selectionHtml = this.selection ? this.selectionInspectorHtml(this.selection) : `<div class="empty-inspector">No selection</div>`;
    this.require<HTMLElement>("[data-inspector]").innerHTML = `
      <div class="inspector-section">
        <h3>Level</h3>
        ${this.textField("ID", "id", level.id, "level")}
        ${this.textField("Name", "name", level.name, "level")}
        ${this.textField("Subtitle", "subtitle", level.subtitle, "level")}
        ${this.numberField("Index", "index", level.index, "level", 1)}
        <div class="inspector-grid four">
          ${this.numberField("X", "bounds.x", level.bounds.x, "level")}
          ${this.numberField("Y", "bounds.y", level.bounds.y, "level")}
          ${this.numberField("W", "bounds.w", level.bounds.w, "level")}
          ${this.numberField("H", "bounds.h", level.bounds.h, "level")}
        </div>
        <div class="inspector-grid three">
          ${this.numberField("Echoes", "perfectEchoes", level.perfectEchoes, "level")}
          ${this.numberField("Gold", "medalFrames.gold", level.medalFrames.gold, "level")}
          ${this.numberField("Silver", "medalFrames.silver", level.medalFrames.silver, "level")}
        </div>
        ${this.textAreaField("Hint", "hint", level.hint)}
      </div>
      <div class="inspector-section">
        <h3>Selection</h3>
        ${selectionHtml}
      </div>
    `;
  }

  private selectionInspectorHtml(selection: Selection): string {
    if (selection.kind === "start") {
      return `<div class="inspector-grid two">
        ${this.numberField("X", "x", this.level.start.x, "object")}
        ${this.numberField("Y", "y", this.level.start.y, "object")}
      </div>`;
    }

    if (selection.kind === "exit") {
      const object = this.level.exit;
      return `
        <div class="inspector-grid four">
          ${this.numberField("X", "x", object.x, "object")}
          ${this.numberField("Y", "y", object.y, "object")}
          ${this.numberField("W", "w", object.w, "object")}
          ${this.numberField("H", "h", object.h, "object")}
        </div>
      `;
    }

    const object = this.findObject(selection.kind, selection.id);
    if (!object) return `<div class="empty-inspector">Missing object</div>`;
    const rectFields = `
      ${this.textField("ID", "id", String(object.id), "object")}
      <div class="inspector-grid four">
        ${this.numberField("X", "x", object.x, "object")}
        ${this.numberField("Y", "y", object.y, "object")}
        ${this.numberField("W", "w", object.w, "object")}
        ${this.numberField("H", "h", object.h, "object")}
      </div>
    `;
    return `${rectFields}${this.kindSpecificFields(selection.kind, object)}`;
  }

  private kindSpecificFields(kind: RectCollection, object: RectObject): string {
    const record = object as unknown as Record<string, unknown>;
    if (kind === "solids") {
      return this.selectField("Tone", "tone", String(record.tone || ""), ["", "steel", "glass", "warning", "dark"]);
    }
    if (kind === "platforms" || kind === "drones") {
      const moving = object as MovingPlatform | PatrolDrone;
      const path = movingPath(moving);
      const axisName = moving.axis === "x" ? "X" : "Y";
      return `
        <div class="inspector-grid two">
          ${this.selectField("Axis", "axis", String(record.axis || "x"), ["x", "y"])}
          ${this.numberField("Speed", "speed", path.speed || 1, "object", 5)}
        </div>
        <div class="inspector-grid four">
          ${this.numberField(`Start ${axisName}`, "pathStart", path.start, "object")}
          ${this.numberField(`End ${axisName}`, "pathEnd", path.end, "object")}
          ${this.numberField("Cycle", "period", Number(record.period || 1), "object", 1)}
          ${this.numberField("Phase", "phase", Number(record.phase || 0), "object", 0.1)}
        </div>
      `;
    }
    if (kind === "plates") {
      return `${this.textField("Label", "label", String(record.label || ""), "object")}${this.checkboxField("Once", "once", record.once === true)}`;
    }
    if (kind === "doors") {
      return `
        ${this.textField("Opens With", "opensWith", listToCsv(record.opensWith as string[] | undefined), "object")}
        ${this.textField("Requires Core", "requiresCore", String(record.requiresCore || ""), "object")}
        ${this.checkboxField("Inverted", "inverted", record.inverted === true)}
      `;
    }
    if (kind === "lasers") {
      return `
        ${this.textField("Disabled By", "disabledBy", listToCsv(record.disabledBy as string[] | undefined), "object")}
        ${this.checkboxField("Starts On", "startsOn", record.startsOn !== false)}
      `;
    }
    if (kind === "cores") return this.textField("Label", "label", String(record.label || ""), "object");
    return "";
  }

  private textField(label: string, field: string, value: string, scope: "level" | "object"): string {
    const attr = scope === "level" ? "data-level-field" : "data-object-field";
    return `<label class="editor-field"><span>${label}</span><input ${attr}="${field}" value="${escapeHtml(value)}" /></label>`;
  }

  private textAreaField(label: string, field: string, value: string): string {
    return `<label class="editor-field"><span>${label}</span><textarea data-level-field="${field}">${escapeHtml(value)}</textarea></label>`;
  }

  private numberField(label: string, field: string, value: number, scope: "level" | "object", step = GRID): string {
    const attr = scope === "level" ? "data-level-field" : "data-object-field";
    return `<label class="editor-field"><span>${label}</span><input ${attr}="${field}" data-field-type="number" type="number" step="${step}" value="${Number(value.toFixed(2))}" /></label>`;
  }

  private checkboxField(label: string, field: string, checked: boolean): string {
    return `<label class="editor-check"><input data-object-field="${field}" type="checkbox" ${checked ? "checked" : ""} /><span>${label}</span></label>`;
  }

  private selectField(label: string, field: string, value: string, options: string[]): string {
    return `<label class="editor-field"><span>${label}</span><select data-object-field="${field}">${options
      .map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option || "default"}</option>`)
      .join("")}</select></label>`;
  }

  private renderValidation(): void {
    const messages = this.validateLevels();
    const validation = this.require<HTMLElement>("[data-validation]");
    validation.dataset.editorValidation = messages.length === 0 ? "clean" : "issues";
    validation.innerHTML =
      messages.length === 0
        ? `<div class="validation-clean">No validation issues.</div>`
        : messages
            .map(
              (message) =>
                `<div class="validation-item ${message.severity}"><strong>${message.severity}</strong><span>${escapeHtml(message.text)}</span></div>`
            )
            .join("");
  }

  private validateLevels(): ValidationMessage[] {
    const messages = this.levels.flatMap((level, index) => this.validateLevel(level, index));
    const ids = new Map<string, number[]>();
    const indexes = new Map<number, string[]>();

    this.levels.forEach((level, index) => {
      const id = level.id.trim();
      if (id) ids.set(id, [...(ids.get(id) || []), index + 1]);
      indexes.set(level.index, [...(indexes.get(level.index) || []), level.name || `Level ${index + 1}`]);
    });

    for (const [id, positions] of ids) {
      if (positions.length > 1) {
        messages.push({
          severity: "error",
          text: `Duplicate level id ${id} appears at positions ${positions.join(", ")}.`
        });
      }
    }
    for (const [index, names] of indexes) {
      if (names.length > 1) {
        messages.push({
          severity: "error",
          text: `Duplicate level index ${index} is used by ${names.join(", ")}.`
        });
      }
    }

    return messages;
  }

  private validateLevel(level: Level, index: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    if (!level.id.trim()) messages.push({ severity: "error", text: `Level ${index + 1} has an empty id.` });
    if (level.index !== index) {
      messages.push({ severity: "warning", text: `${level.name} index is ${level.index}; expected ${index}.` });
    }
    if (level.bounds.w <= 0 || level.bounds.h <= 0) {
      messages.push({ severity: "error", text: `${level.name} bounds must have positive size.` });
    }
    if (!rectInside(this.startRectForLevel(level), level.bounds)) {
      messages.push({ severity: "error", text: `${level.name} start footprint is outside bounds.` });
    }
    if (!rectInside(level.exit, level.bounds)) {
      messages.push({ severity: "error", text: `${level.name} exit is outside bounds.` });
    }
    if (level.medalFrames.gold <= 0 || level.medalFrames.silver <= 0 || level.medalFrames.silver < level.medalFrames.gold) {
      messages.push({ severity: "error", text: `${level.name} medal frame thresholds are invalid.` });
    }

    const objectIds = new Map<string, string>();
    for (const kind of rectCollections) {
      for (const object of readCollection(level, kind)) {
        if (!object.id.trim()) {
          messages.push({ severity: "error", text: `${level.name} has an empty ${collectionLabels[kind]} id.` });
        } else if (objectIds.has(object.id)) {
          messages.push({ severity: "error", text: `${level.name} duplicates object id ${object.id}.` });
        }
        objectIds.set(object.id, kind);
        if (object.w <= 0 || object.h <= 0) {
          messages.push({ severity: "error", text: `${level.name}:${object.id} has non-positive size.` });
        }
        const structuralSolid =
          kind === "solids" &&
          (object.id === "left-wall" || object.id === "right-wall" || object.id === "floor" || object.id.startsWith("floor-"));
        if (!structuralSolid && !rectInside(object, level.bounds)) {
          messages.push({ severity: "warning", text: `${level.name}:${object.id} is outside level bounds.` });
        }
      }
    }

    const plateIds = new Set(readCollection(level, "plates").map((plate) => plate.id));
    const coreIds = new Set(readCollection(level, "cores").map((core) => core.id));
    for (const door of readCollection(level, "doors") as Door[]) {
      for (const plateId of door.opensWith || []) {
        if (!plateIds.has(plateId)) {
          messages.push({ severity: "error", text: `${level.name}:${door.id} references missing plate ${plateId}.` });
        }
      }
      if (door.requiresCore && !coreIds.has(door.requiresCore)) {
        messages.push({ severity: "error", text: `${level.name}:${door.id} references missing core ${door.requiresCore}.` });
      }
      const floorThreshold = level.bounds.y + level.bounds.h - 50;
      if (door.y + door.h >= floorThreshold && door.y > level.bounds.y + CLOSED_GATE_MAX_TOP) {
        messages.push({ severity: "warning", text: `${level.name}:${door.id} may be short enough to jump over.` });
      }
    }
    for (const laser of readCollection(level, "lasers") as Laser[]) {
      for (const plateId of laser.disabledBy || []) {
        if (!plateIds.has(plateId)) {
          messages.push({ severity: "error", text: `${level.name}:${laser.id} references missing plate ${plateId}.` });
        }
      }
    }
    return messages;
  }

  private renderExport(): void {
    this.exportArea.value = `${JSON.stringify(this.levels, null, 2)}\n`;
  }

  private renderCanvas(): void {
    if (!this.context) return;
    this.resizeCanvas();
    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.scale(this.view.w, this.view.w);
    ctx.translate(-this.view.x, -this.view.y);
    this.drawGrid();
    this.drawBounds();
    this.drawCollections();
    this.drawStartAndExit();
    this.drawSelectionHandles();
    ctx.restore();
  }

  private drawGrid(): void {
    const ctx = this.context;
    const visible = this.visibleWorldRect();
    const startX = Math.floor(visible.x / GRID) * GRID;
    const endX = visible.x + visible.w;
    const startY = Math.floor(visible.y / GRID) * GRID;
    const endY = visible.y + visible.h;
    ctx.lineWidth = 1 / this.view.w;
    ctx.strokeStyle = "rgba(67, 247, 255, 0.08)";
    for (let x = startX; x <= endX; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 227, 90, 0.13)";
    for (let x = Math.floor(visible.x / 100) * 100; x <= endX; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
  }

  private drawBounds(): void {
    const ctx = this.context;
    const bounds = this.level.bounds;
    ctx.fillStyle = "#081322";
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.strokeStyle = "rgba(67, 247, 255, 0.75)";
    ctx.lineWidth = 2 / this.view.w;
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  private drawCollections(): void {
    for (const kind of rectCollections) {
      for (const object of readCollection(this.level, kind)) {
        this.drawObject(kind, object);
      }
    }
  }

  private drawObject(kind: RectCollection, object: RectObject): void {
    const ctx = this.context;
    const style = styleForKind(kind, object);
    const selected = this.selectionMatches({ kind, id: object.id });

    if (kind === "platforms" || kind === "drones") {
      const moving = object as MovingPlatform | PatrolDrone;
      this.drawMotionPath(kind, moving, selected);
    }

    if (kind === "cores") {
      this.drawDiamond(object, style, selected);
      return;
    }
    if (kind === "hazards") {
      this.drawHazard(object, style, selected);
      return;
    }
    if (kind === "drones") {
      this.drawDrone(object, style, selected);
      return;
    }

    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.strokeRect(object.x, object.y, object.w, object.h);
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawHazard(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    for (let x = object.x; x < object.x + object.w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, object.y + object.h);
      ctx.lineTo(x + 6, object.y);
      ctx.lineTo(x + 12, object.y + object.h);
      ctx.closePath();
      ctx.stroke();
    }
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawDrone(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.roundRect(object.x, object.y, object.w, object.h, 5);
    ctx.fill();
    ctx.stroke();
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawDiamond(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    const cx = object.x + object.w / 2;
    const cy = object.y + object.h / 2;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.moveTo(cx, object.y);
    ctx.lineTo(object.x + object.w, cy);
    ctx.lineTo(cx, object.y + object.h);
    ctx.lineTo(object.x, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawStartAndExit(): void {
    const ctx = this.context;
    const startRect = this.startRect();
    const startStyle = styleForKind("start");
    ctx.fillStyle = startStyle.fill;
    ctx.strokeStyle = this.selectionMatches({ kind: "start" }) ? "#fff8bf" : startStyle.stroke;
    ctx.lineWidth = this.selectionMatches({ kind: "start" }) ? 4 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.roundRect(startRect.x, startRect.y, startRect.w, startRect.h, 5);
    ctx.fill();
    ctx.stroke();
    this.drawObjectLabel(startRect, "start", startStyle.text);

    const exit = this.level.exit;
    const exitStyle = styleForKind("exit");
    ctx.fillStyle = exitStyle.fill;
    ctx.strokeStyle = this.selectionMatches({ kind: "exit" }) ? "#fff8bf" : exitStyle.stroke;
    ctx.lineWidth = this.selectionMatches({ kind: "exit" }) ? 4 / this.view.w : 3 / this.view.w;
    ctx.beginPath();
    ctx.ellipse(exit.x + exit.w / 2, exit.y + exit.h / 2, exit.w / 2, exit.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.drawObjectLabel(exit, "exit", exitStyle.text);
  }

  private drawMotionPath(kind: "platforms" | "drones", object: MovingPlatform | PatrolDrone, selected: boolean): void {
    const ctx = this.context;
    const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
    const start =
      object.axis === "x"
        ? { x: center.x - object.distance, y: center.y }
        : { x: center.x, y: center.y - object.distance };
    const end =
      object.axis === "x"
        ? { x: center.x + object.distance, y: center.y }
        : { x: center.x, y: center.y + object.distance };
    const color = kind === "platforms" ? "#ffe35a" : "#ff4f8b";
    const fill = kind === "platforms" ? "rgba(255, 227, 90, 0.95)" : "rgba(255, 79, 139, 0.95)";
    const radius = selected ? 6 / this.view.w : 4 / this.view.w;

    ctx.strokeStyle = selected ? color : kind === "platforms" ? "rgba(255, 227, 90, 0.38)" : "rgba(255, 79, 139, 0.34)";
    ctx.lineWidth = selected ? 3 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.fillStyle = fill;
    ctx.strokeStyle = "#ecfbff";
    ctx.lineWidth = 1.5 / this.view.w;
    for (const point of [start, end]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawSelectionHandles(): void {
    if (!this.selection || this.selection.kind === "start") return;
    const rect = this.rectForSelection(this.selection);
    if (!rect) return;
    const ctx = this.context;
    const size = Math.max(8 / this.view.w, 5);
    ctx.fillStyle = "#fff8bf";
    ctx.strokeStyle = "#05070d";
    ctx.lineWidth = 1.5 / this.view.w;
    for (const { point } of resizeHandlesForRect(rect)) {
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    }
  }

  private drawObjectLabel(rect: Rect, label: string, color: string): void {
    if (this.view.w < 0.28) return;
    const ctx = this.context;
    ctx.fillStyle = color;
    ctx.font = `${Math.max(10 / this.view.w, 8)}px EchoInterface, Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(label, rect.x + 4 / this.view.w, rect.y + 3 / this.view.w, Math.max(0, rect.w - 8));
  }

  private hitTest(point: Vec2): Selection | null {
    if (rectContains(this.level.exit, point)) return { kind: "exit" };
    if (rectContains(this.startRect(), point)) return { kind: "start" };
    for (const kind of [...rectCollections].reverse()) {
      const objects = [...readCollection(this.level, kind)].reverse();
      for (const object of objects) {
        if (rectContains(object, point)) return { kind, id: object.id };
      }
    }
    return null;
  }

  private rectForSelection(selection: Selection): Rect | null {
    if (selection.kind === "start") return this.startRect();
    if (selection.kind === "exit") return { ...this.level.exit };
    const object = this.findObject(selection.kind, selection.id);
    return object ? { x: object.x, y: object.y, w: object.w, h: object.h } : null;
  }

  private startRect(): Rect {
    return this.startRectForLevel(this.level);
  }

  private startRectForLevel(level: Level): Rect {
    return { x: level.start.x, y: level.start.y, w: PLAYER_RECT.w, h: PLAYER_RECT.h };
  }

  private selectedRectObject(): RectObject | null {
    if (!this.selection || this.selection.kind === "start") return null;
    if (this.selection.kind === "exit") return this.level.exit as RectObject;
    return this.findObject(this.selection.kind, this.selection.id);
  }

  private findObject(kind: RectCollection, id: string): RectObject | null {
    return readCollection(this.level, kind).find((item) => item.id === id) || null;
  }

  private selectionMatches(selection: Selection): boolean {
    if (!this.selection || this.selection.kind !== selection.kind) return false;
    if (!("id" in this.selection) && !("id" in selection)) return true;
    return "id" in this.selection && "id" in selection && this.selection.id === selection.id;
  }

  private rectSummary(rect: Rect): string {
    return `${Math.round(rect.x)}, ${Math.round(rect.y)} / ${Math.round(rect.w)} x ${Math.round(rect.h)}`;
  }

  private screenToWorld(point: Vec2): Vec2 {
    return {
      x: point.x / this.view.w + this.view.x,
      y: point.y / this.view.w + this.view.y
    };
  }

  private visibleWorldRect(): Rect {
    return {
      x: this.view.x,
      y: this.view.y,
      w: this.canvas.width / this.view.w,
      h: this.canvas.height / this.view.w
    };
  }

  private resizeCanvas(): void {
    const width = Math.max(320, Math.floor(this.canvas.clientWidth));
    const height = Math.max(280, Math.floor(this.canvas.clientHeight));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  private fitLevel(): void {
    const margin = 80;
    const bounds = this.level.bounds;
    const zoomX = this.canvas.width / (bounds.w + margin * 2);
    const zoomY = this.canvas.height / (bounds.h + margin * 2);
    this.view.w = clamp(Math.min(zoomX, zoomY), 0.16, 1.4);
    this.view.x = bounds.x - margin;
    this.view.y = bounds.y - margin;
  }

  private centerOnStart(): void {
    this.view.w = clamp(this.view.w || 1, 0.65, 1.25);
    this.view.x = this.level.start.x - this.canvas.width / this.view.w * 0.18;
    this.view.y = this.level.start.y - this.canvas.height / this.view.w * 0.64;
  }

  private afterMutation(status: string): void {
    this.renderPanelTabs();
    this.renderObjectList();
    this.renderInspector();
    this.renderValidation();
    this.renderExport();
    this.renderCanvas();
    this.persistDraft(status);
  }

  private persistDraft(status: string): void {
    const draft: EditorDraft = {
      levels: this.levels,
      currentIndex: this.currentIndex
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      this.setStatus(status);
    } catch {
      this.setStatus(`${status}; draft storage unavailable`);
    }
  }

  private loadDraft(): EditorDraft | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.levels)) return null;
      const levels = parsed.levels
        .map((level, index) => normalizeImportedLevel(level, index))
        .filter((level): level is Level => Boolean(level));
      if (levels.length === 0) return null;
      return {
        levels,
        currentIndex: clamp(positiveNumber(parsed.currentIndex, 0), 0, levels.length - 1)
      };
    } catch {
      return null;
    }
  }

  private clearDraft(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      this.setStatus("Draft storage unavailable");
    }
  }

  private applyImport(): void {
    const raw = this.importArea.value.trim();
    if (!raw) {
      this.setStatus("Import field is empty");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const imported = parsed
          .map((level, index) => normalizeImportedLevel(level, index))
          .filter((level): level is Level => Boolean(level));
        if (imported.length === 0) throw new Error("No valid levels found");
        this.levels = imported;
        this.currentIndex = clamp(this.currentIndex, 0, this.levels.length - 1);
      } else {
        const imported = normalizeImportedLevel(parsed, this.currentIndex);
        if (!imported) throw new Error("No valid level found");
        imported.index = this.currentIndex;
        this.levels[this.currentIndex] = imported;
      }
      this.selection = null;
      this.importArea.value = "";
      this.fitLevel();
      this.renderAll();
      this.persistDraft("Import applied");
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : "Import failed");
    }
  }

  private async copyExport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.exportArea.value);
      this.setStatus("Export copied");
    } catch {
      this.exportArea.focus();
      this.exportArea.select();
      document.execCommand("copy");
      this.setStatus("Export selected");
    }
  }

  private downloadExport(): void {
    const blob = new Blob([this.exportArea.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "echo-shift-levels.json";
    anchor.click();
    URL.revokeObjectURL(url);
    this.setStatus("Export downloaded");
  }

  private setStatus(message: string): void {
    this.statusElement.textContent = message;
  }

  private require<T extends Element>(selector: string): T {
    const element = this.host.querySelector<T>(selector);
    if (!element) throw new Error(`Missing editor element: ${selector}`);
    return element;
  }
}

export const mountLevelEditor = (host: HTMLElement): (() => void) => {
  const editor = new LevelEditor(host);
  editor.mount();
  return () => editor.destroy();
};
