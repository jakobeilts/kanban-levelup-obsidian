import {
  App,
  ItemView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TextFileView,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KanbanLabel {
  id: string;
  name: string;
  color: string;
}

export interface SkillSnapshot {
  timestamp: number;
  scores: Record<string, number>;
}

export interface SkillData {
  scores: Record<string, number>;
  snapshots: SkillSnapshot[];
}

export interface KanbanPluginSettings {
  labels: KanbanLabel[];
  skillData: SkillData;
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  labelIds?: string[];
  completedAt?: number; // set when moved into a done column
}

export interface KanbanColumn {
  id: string;
  name: string;
  cards: KanbanCard[];
  color?: string;
  isDone?: boolean; // explicitly marks this as the "done" column
}

export interface KanbanBoard {
  columns: KanbanColumn[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function toDateInputVal(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function wrapText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (test.length > maxLen && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function generateId_(): string { return generateId(); }

const DEFAULT_SETTINGS: KanbanPluginSettings = {
  labels: [
    { id: generateId(), name: "Bug", color: "#ef4444" },
    { id: generateId(), name: "Feature", color: "#6366f1" },
    { id: generateId(), name: "Idea", color: "#f59e0b" },
    { id: generateId(), name: "Important", color: "#10b981" },
  ],
  skillData: { scores: {}, snapshots: [] },
};

function defaultBoard(): KanbanBoard {
  return {
    columns: [
      { id: generateId(), name: "Backlog", cards: [], color: "#6366f1" },
      { id: generateId(), name: "In Progress", cards: [], color: "#f59e0b" },
      { id: generateId(), name: "Done", cards: [], color: "#10b981", isDone: true },
    ],
  };
}

// ─── Kanban Board View ────────────────────────────────────────────────────────

export const KANBAN_VIEW_TYPE = "kanban-todo-view";

export class KanbanView extends TextFileView {
  plugin: KanbanTodoPlugin;
  boardData: KanbanBoard = defaultBoard();
  private draggedCard: { card: KanbanCard; sourceCol: KanbanColumn } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return KANBAN_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? "Kanban Board"; }
  getIcon() { return "layout-dashboard"; }
  getViewData(): string { return JSON.stringify(this.boardData, null, 2); }

  setViewData(data: string, _clear: boolean): void {
    try {
      const parsed = JSON.parse(data);
      this.boardData = parsed?.columns ? parsed : defaultBoard();
    } catch { this.boardData = defaultBoard(); }
    this.render();
  }

  clear() { this.boardData = defaultBoard(); }

  private async persist() { this.requestSave(); this.render(); }

  private async moveCard(card: KanbanCard, fromCol: KanbanColumn, toCol: KanbanColumn) {
    const idx = fromCol.cards.findIndex((c) => c.id === card.id);
    if (idx === -1) return;
    fromCol.cards.splice(idx, 1);

    // Track skill scores and completedAt
    if (fromCol.isDone && card.labelIds?.length) {
      await this.plugin.updateSkillScores(card.labelIds, -1);
    }
    if (toCol.isDone) {
      card.completedAt = Date.now();
      if (card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, +1);
    } else {
      delete card.completedAt;
    }

    toCol.cards.push(card);
    await this.persist();
    this.plugin.refreshAllDoneView();
  }

  render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("kanban-root");

    const hdr = el.createEl("div", { cls: "kanban-header" });
    hdr.createEl("span", { cls: "kanban-header-title", text: this.file?.basename ?? "Board" });
    const renameBtn = hdr.createEl("button", { cls: "kanban-rename-btn", attr: { title: "Rename board" } });
    renameBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    renameBtn.addEventListener("click", () => {
      if (!this.file) return;
      new InputModal(this.app, "Rename board", this.file.basename, async (val) => {
        if (this.file) {
          const newPath = this.file.parent?.path ? `${this.file.parent.path}/${val}.kanban` : `${val}.kanban`;
          await this.app.fileManager.renameFile(this.file, newPath);
        }
      }).open();
    });

    const board = el.createEl("div", { cls: "kanban-board" });
    this.boardData.columns.forEach((col) => this.renderColumn(board, col));

    const addColBtn = board.createEl("button", { cls: "kanban-add-col-btn", attr: { title: "Add column" } });
    addColBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addColBtn.addEventListener("click", () => {
      new ColumnModal(this.app, { name: "New Column", isDone: false }, async ({ name, isDone }) => {
        this.boardData.columns.push({ id: generateId(), name, cards: [], color: "#8b5cf6", isDone });
        await this.persist();
      }).open();
    });
  }

  private renderColumn(board: HTMLElement, col: KanbanColumn) {
    const now = Date.now();

    // For done columns, filter out cards older than 1 week for display only
    const visibleCards = col.isDone
      ? col.cards.filter((c) => !c.completedAt || now - c.completedAt < ONE_WEEK_MS)
      : col.cards;

    const hiddenCount = col.isDone ? col.cards.length - visibleCards.length : 0;

    const colEl = board.createEl("div", { cls: "kanban-col" + (col.isDone ? " kanban-col-done" : "") });

    const hdr = colEl.createEl("div", { cls: "kanban-col-hdr" });
    const accent = hdr.createEl("span", { cls: "kanban-col-accent" });
    accent.style.background = col.color ?? "#6366f1";

    const titleEl = hdr.createEl("span", { cls: "kanban-col-title", text: col.name });
    if (col.isDone) {
      const doneTag = hdr.createEl("span", { cls: "kanban-done-tag", text: "done", attr: { title: "This is the Done column" } });
    }

    titleEl.addEventListener("dblclick", () => {
      new ColumnModal(this.app, { name: col.name, isDone: col.isDone ?? false }, async ({ name, isDone }) => {
        const wasInDone = col.isDone;
        const becomingDone = isDone && !wasInDone;
        const leavingDone = !isDone && wasInDone;

        // Recalculate skill scores
        if (leavingDone) {
          for (const card of col.cards) {
            if (card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, -1);
            delete card.completedAt;
          }
        }
        if (becomingDone) {
          for (const card of col.cards) {
            if (!card.completedAt) card.completedAt = Date.now();
            if (card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, +1);
          }
        }
        col.name = name;
        col.isDone = isDone;
        await this.persist();
        this.plugin.refreshAllDoneView();
      }).open();
    });

    const badge = hdr.createEl("span", { cls: "kanban-col-badge", text: String(col.cards.length) });
    badge.style.background = col.color ?? "#6366f1";

    const del = hdr.createEl("button", { cls: "kb-icon-btn", attr: { title: "Delete column" } });
    del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    del.addEventListener("click", async () => {
      if (col.cards.length > 0 && !confirm(`Delete "${col.name}" with ${col.cards.length} card(s)?`)) return;
      if (col.isDone) {
        for (const card of col.cards) {
          if (card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, -1);
        }
      }
      this.boardData.columns = this.boardData.columns.filter((c) => c.id !== col.id);
      await this.persist();
      this.plugin.refreshAllDoneView();
    });

    const cardsEl = colEl.createEl("div", { cls: "kanban-cards" });
    cardsEl.addEventListener("dragover", (e) => { e.preventDefault(); colEl.addClass("drag-over"); });
    cardsEl.addEventListener("dragleave", (e) => { if (!colEl.contains(e.relatedTarget as Node)) colEl.removeClass("drag-over"); });
    cardsEl.addEventListener("drop", async (e) => {
      e.preventDefault(); colEl.removeClass("drag-over");
      if (!this.draggedCard) return;
      const { card, sourceCol } = this.draggedCard;
      if (sourceCol.id === col.id) return;
      this.draggedCard = null;
      await this.moveCard(card, sourceCol, col);
    });

    visibleCards.forEach((card) => this.renderCard(cardsEl, card, col));

    if (hiddenCount > 0) {
      const archivedNote = cardsEl.createEl("div", { cls: "kanban-archived-note" });
      archivedNote.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> ${hiddenCount} completed item${hiddenCount > 1 ? "s" : ""} archived`;
    }

    const addBtn = colEl.createEl("button", { cls: "kanban-add-card-btn" });
    addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add card</span>`;
    addBtn.addEventListener("click", () => {
      new CardModal(this.app, this.plugin.settings.labels, null, async (title, desc, labelIds) => {
        const card: KanbanCard = { id: generateId(), title, description: desc, labelIds, createdAt: Date.now() };
        if (col.isDone) {
          card.completedAt = Date.now();
          if (labelIds.length) await this.plugin.updateSkillScores(labelIds, +1);
        }
        col.cards.push(card);
        await this.persist();
        this.plugin.refreshAllDoneView();
      }).open();
    });
  }

  private renderCard(container: HTMLElement, card: KanbanCard, col: KanbanColumn) {
    const el = container.createEl("div", { cls: "kanban-card", attr: { draggable: "true" } });

    el.addEventListener("dragstart", (e) => {
      this.draggedCard = { card, sourceCol: col };
      el.addClass("dragging");
      e.dataTransfer?.setData("text/plain", card.id);
    });
    el.addEventListener("dragend", () => {
      el.removeClass("dragging");
      this.draggedCard = null;
      document.querySelectorAll(".drag-over").forEach((n) => n.removeClass("drag-over"));
    });

    const body = el.createEl("div", { cls: "kanban-card-body" });
    body.createEl("div", { cls: "kanban-card-title", text: card.title });
    if (card.description) body.createEl("div", { cls: "kanban-card-desc", text: card.description });

    const cardLabels = this.plugin.settings.labels.filter((l) => card.labelIds?.includes(l.id));
    if (cardLabels.length) {
      const row = el.createEl("div", { cls: "kanban-card-labels" });
      cardLabels.forEach((l) => {
        const tag = row.createEl("span", { cls: "kanban-label-tag", text: l.name });
        tag.style.setProperty("--lc", l.color);
      });
    }

    const footer = el.createEl("div", { cls: "kanban-card-footer" });
    const actions = footer.createEl("div", { cls: "kanban-card-actions" });

    const colIdx = this.boardData.columns.findIndex((c) => c.id === col.id);
    if (colIdx > 0) {
      const lb = actions.createEl("button", { cls: "kb-icon-btn", attr: { title: "Move left" } });
      lb.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>`;
      lb.addEventListener("click", async (e) => { e.stopPropagation(); await this.moveCard(card, col, this.boardData.columns[colIdx - 1]); });
    }
    if (colIdx < this.boardData.columns.length - 1) {
      const rb = actions.createEl("button", { cls: "kb-icon-btn", attr: { title: "Move right" } });
      rb.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`;
      rb.addEventListener("click", async (e) => { e.stopPropagation(); await this.moveCard(card, col, this.boardData.columns[colIdx + 1]); });
    }

    const editBtn = actions.createEl("button", { cls: "kb-icon-btn", attr: { title: "Edit" } });
    editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      new CardModal(this.app, this.plugin.settings.labels, card, async (title, desc, labelIds) => {
        if (col.isDone && card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, -1);
        card.title = title; card.description = desc; card.labelIds = labelIds;
        if (col.isDone && labelIds.length) await this.plugin.updateSkillScores(labelIds, +1);
        await this.persist();
        this.plugin.refreshAllDoneView();
      }).open();
    });

    const delBtn = actions.createEl("button", { cls: "kb-icon-btn kb-icon-danger", attr: { title: "Delete" } });
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (col.isDone && card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, -1);
      col.cards = col.cards.filter((c) => c.id !== card.id);
      await this.persist();
      this.plugin.refreshAllDoneView();
    });
  }
}

// ─── All Done Todos View ──────────────────────────────────────────────────────

export const ALL_DONE_VIEW_TYPE = "kanban-all-done";

interface DoneEntry {
  card: KanbanCard;
  boardName: string;
  columnName: string;
  completedAt: number;
}

export class AllDoneTodosView extends ItemView {
  plugin: KanbanTodoPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return ALL_DONE_VIEW_TYPE; }
  getDisplayText() { return "All Done Todos"; }
  getIcon() { return "check-square"; }

  async onOpen() { await this.render(); }
  async onClose() {}

  async render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("kanban-done-root");

    el.createEl("h2", { cls: "kanban-done-title", text: "All Done Todos" });

    // Collect all done cards from all .kanban files
    const entries: DoneEntry[] = [];
    const files = this.app.vault.getFiles().filter((f) => f.extension === "kanban");

    for (const file of files) {
      try {
        const raw = await this.app.vault.read(file);
        const board: KanbanBoard = JSON.parse(raw);
        if (!board?.columns) continue;
        for (const col of board.columns) {
          if (!col.isDone) continue;
          for (const card of col.cards) {
            entries.push({
              card,
              boardName: file.basename,
              columnName: col.name,
              completedAt: card.completedAt ?? card.createdAt,
            });
          }
        }
      } catch { /* skip malformed files */ }
    }

    if (entries.length === 0) {
      el.createEl("div", { cls: "kanban-done-empty", text: "No completed todos yet. Mark a column as 'Done' on your board and complete some tasks!" });
      return;
    }

    // Sort by completedAt desc
    entries.sort((a, b) => b.completedAt - a.completedAt);

    // Group by date
    const groups = new Map<string, DoneEntry[]>();
    for (const entry of entries) {
      const dateKey = new Date(entry.completedAt).toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(entry);
    }

    el.createEl("div", { cls: "kanban-done-count", text: `${entries.length} completed todo${entries.length !== 1 ? "s" : ""} across ${files.length} board${files.length !== 1 ? "s" : ""}` });

    for (const [dateKey, dayEntries] of groups) {
      const section = el.createEl("div", { cls: "kanban-done-section" });
      section.createEl("div", { cls: "kanban-done-date-hdr", text: dateKey });

      for (const entry of dayEntries) {
        const row = section.createEl("div", { cls: "kanban-done-row" });

        const check = row.createEl("span", { cls: "kanban-done-check" });
        check.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

        const main = row.createEl("div", { cls: "kanban-done-main" });
        main.createEl("span", { cls: "kanban-done-card-title", text: entry.card.title });
        if (entry.card.description) {
          main.createEl("span", { cls: "kanban-done-card-desc", text: entry.card.description });
        }

        const meta = row.createEl("div", { cls: "kanban-done-meta" });

        // Labels
        const cardLabels = this.plugin.settings.labels.filter((l) => entry.card.labelIds?.includes(l.id));
        cardLabels.forEach((l) => {
          const tag = meta.createEl("span", { cls: "kanban-label-tag", text: l.name });
          tag.style.setProperty("--lc", l.color);
        });

        meta.createEl("span", { cls: "kanban-done-board", text: entry.boardName });

        const time = new Date(entry.completedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        meta.createEl("span", { cls: "kanban-done-time", text: time });
      }
    }
  }
}

// ─── Skill Chart View ─────────────────────────────────────────────────────────

export const SKILL_CHART_VIEW_TYPE = "kanban-skill-chart";

export class KanbanSkillChartView extends ItemView {
  plugin: KanbanTodoPlugin;
  private compareFrom: string = toDateInputVal(new Date(Date.now() - 7 * 86400000));
  private compareTo: string = toDateInputVal(new Date());
  private compareEnabled = true;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return SKILL_CHART_VIEW_TYPE; }
  getDisplayText() { return "Skill Chart"; }
  getIcon() { return "activity"; }

  async onOpen() { await this.maybeSnapshot(); this.render(); }
  async onClose() {}

  async maybeSnapshot() {
    const { skillData } = this.plugin.settings;
    const now = Date.now();
    const last = skillData.snapshots[skillData.snapshots.length - 1];
    if (!last || now - last.timestamp > 20 * 60 * 60 * 1000) {
      skillData.snapshots.push({ timestamp: now, scores: { ...skillData.scores } });
      if (skillData.snapshots.length > 500) skillData.snapshots.splice(0, skillData.snapshots.length - 500);
      await this.plugin.saveSettings();
    }
  }

  private closestSnapshot(ts: number): SkillSnapshot | null {
    const snaps = this.plugin.settings.skillData.snapshots;
    if (!snaps.length) return null;
    return snaps.reduce((best, s) =>
      Math.abs(s.timestamp - ts) < Math.abs(best.timestamp - ts) ? s : best
    );
  }

  render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("kanban-skill-root");

    const { labels, skillData } = this.plugin.settings;
    const { scores } = skillData;

    el.createEl("h2", { cls: "kanban-skill-title", text: "Skill Chart" });

    // ── Date range comparison ──
    const rangeSection = el.createEl("div", { cls: "kanban-skill-range" });
    const rangeHeader = rangeSection.createEl("div", { cls: "kanban-skill-range-hdr" });
    rangeHeader.createEl("span", { cls: "kanban-skill-range-label", text: "Compare with period" });

    const toggleWrap = rangeHeader.createEl("label", { cls: "kanban-skill-toggle" });
    const toggleInput = toggleWrap.createEl("input", { attr: { type: "checkbox" } }) as HTMLInputElement;
    toggleInput.checked = this.compareEnabled;
    toggleWrap.createEl("span", { cls: "kanban-skill-toggle-track" });
    toggleInput.addEventListener("change", () => { this.compareEnabled = toggleInput.checked; this.render(); });

    if (this.compareEnabled) {
      const rangeInputs = rangeSection.createEl("div", { cls: "kanban-skill-range-inputs" });
      const presets = rangeInputs.createEl("div", { cls: "kanban-skill-presets" });
      [{ label: "1W", days: 7 }, { label: "2W", days: 14 }, { label: "1M", days: 30 }, { label: "3M", days: 90 }, { label: "6M", days: 180 }].forEach((p) => {
        const now = new Date();
        const fromDate = new Date(now.getTime() - p.days * 86400000);
        const isActive = this.compareFrom === toDateInputVal(fromDate) && this.compareTo === toDateInputVal(now);
        const btn = presets.createEl("button", { cls: "kanban-skill-preset-btn" + (isActive ? " active" : ""), text: p.label });
        btn.addEventListener("click", () => {
          this.compareFrom = toDateInputVal(new Date(Date.now() - p.days * 86400000));
          this.compareTo = toDateInputVal(new Date());
          this.render();
        });
      });

      const dateRow = rangeInputs.createEl("div", { cls: "kanban-skill-date-row" });
      dateRow.createEl("span", { cls: "kanban-skill-date-sep", text: "From" });
      const fromInput = dateRow.createEl("input", { cls: "kanban-skill-date-input", attr: { type: "date", value: this.compareFrom, max: this.compareTo } }) as HTMLInputElement;
      dateRow.createEl("span", { cls: "kanban-skill-date-sep", text: "to" });
      const toInput = dateRow.createEl("input", { cls: "kanban-skill-date-input", attr: { type: "date", value: this.compareTo, max: toDateInputVal(new Date()) } }) as HTMLInputElement;
      fromInput.addEventListener("change", () => { if (fromInput.value) { this.compareFrom = fromInput.value; this.render(); } });
      toInput.addEventListener("change", () => { if (toInput.value) { this.compareTo = toInput.value; this.render(); } });
    }

    if (labels.length === 0) {
      el.createEl("div", { cls: "kanban-skill-empty", text: "No labels defined. Add labels in the plugin settings to use the Skill Chart." });
      return;
    }

    // ── Resolve comparison scores ──
    let compareScores: Record<string, number> | null = null;
    let compareLabel = "";

    if (this.compareEnabled) {
      const fromTs = new Date(this.compareFrom).getTime();
      const fromSnap = this.closestSnapshot(fromTs);
      if (fromSnap) {
        compareScores = fromSnap.scores;
        const fromFmt = new Date(this.compareFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        const toFmt = new Date(this.compareTo).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        compareLabel = `${fromFmt} – ${toFmt}`;
      }
    }

    const allVals = labels.map((l) => scores[l.id] ?? 0);
    const cmpVals = compareScores ? labels.map((l) => compareScores![l.id] ?? 0) : [];
    const rawMax = Math.max(...allVals, ...cmpVals, 1);
    const scale = rawMax <= 5 ? 5 : rawMax <= 10 ? 10 : Math.ceil(rawMax / 5) * 5;

    const chartWrap = el.createEl("div", { cls: "kanban-skill-chart-wrap" });
    chartWrap.innerHTML = this.buildRadar(labels, scores, compareScores, scale);

    if (compareScores && compareLabel) {
      const legend = el.createEl("div", { cls: "kanban-skill-legend" });
      const cur = legend.createEl("div", { cls: "kanban-skill-legend-item" });
      cur.createEl("span", { cls: "kanban-skill-legend-line current" });
      cur.createEl("span", { text: "Now" });
      const cmp = legend.createEl("div", { cls: "kanban-skill-legend-item" });
      cmp.createEl("span", { cls: "kanban-skill-legend-line compare" });
      cmp.createEl("span", { text: compareLabel });
    }

    const statsGrid = el.createEl("div", { cls: "kanban-skill-stats" });
    labels.forEach((label) => {
      const cur = scores[label.id] ?? 0;
      const cmp = compareScores?.[label.id] ?? 0;
      const delta = cur - cmp;
      const stat = statsGrid.createEl("div", { cls: "kanban-skill-stat" });
      stat.style.setProperty("--lc", label.color);
      stat.createEl("span", { cls: "kanban-skill-stat-dot" });
      stat.createEl("span", { cls: "kanban-skill-stat-name", text: label.name });
      stat.createEl("span", { cls: "kanban-skill-stat-val", text: String(cur) });
      if (compareScores && delta !== 0) {
        stat.createEl("span", { cls: `kanban-skill-stat-delta ${delta > 0 ? "pos" : "neg"}`, text: delta > 0 ? `+${delta}` : String(delta) });
      }
    });

    const total = allVals.reduce((a, b) => a + b, 0);
    const cmpTotal = cmpVals.reduce((a, b) => a + b, 0);
    const totalDelta = total - cmpTotal;
    const totalRow = el.createEl("div", { cls: "kanban-skill-total" });
    totalRow.createEl("span", { text: "Total completions: " });
    totalRow.createEl("strong", { text: String(total) });
    if (compareScores && totalDelta !== 0) {
      totalRow.createEl("span", { cls: `kanban-skill-stat-delta ${totalDelta > 0 ? "pos" : "neg"}`, text: totalDelta > 0 ? ` +${totalDelta}` : ` ${totalDelta}` });
    }
  }

  private buildRadar(labels: KanbanLabel[], scores: Record<string, number>, compareScores: Record<string, number> | null, scale: number): string {
    const N = labels.length;
    const size = 300;
    const cx = size / 2, cy = size / 2;
    const maxR = 90;
    const angles = labels.map((_, i) => (2 * Math.PI * i / N) - Math.PI / 2);
    const pt = (a: number, r: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    const ptObj = (a: number, r: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });

    const charWidth = 6.5;
    const lineH = 14;
    const labelPad = 24;
    const maxLabelLen = 12;
    const padSides = { top: 32, right: 32, bottom: 32, left: 32 };

    labels.forEach((l, i) => {
      const lines = wrapText(l.name, maxLabelLen);
      const textW = Math.max(...lines.map((ln) => ln.length)) * charWidth;
      const textH = lines.length * lineH;
      const lp = ptObj(angles[i], maxR + labelPad);
      const anchor = Math.abs(lp.x - cx) < 12 ? "middle" : lp.x < cx ? "end" : "start";
      if (anchor === "start") { const re = lp.x + textW - size; if (re > padSides.right) padSides.right = re + 8; }
      else if (anchor === "end") { const le = -lp.x + textW; if (le > padSides.left) padSides.left = le + 8; }
      else {
        const hw = textW / 2;
        const re = lp.x + hw - size; const le = -lp.x + hw;
        if (re > padSides.right) padSides.right = re + 8;
        if (le > padSides.left) padSides.left = le + 8;
      }
      const topEdge = -lp.y + textH; const botEdge = lp.y + textH - size;
      if (topEdge > padSides.top) padSides.top = topEdge + 8;
      if (botEdge > padSides.bottom) padSides.bottom = botEdge + 8;
    });

    let grid = "";
    for (let lvl = 1; lvl <= 4; lvl++) {
      const r = (lvl / 4) * maxR;
      grid += `<polygon points="${angles.map((a) => pt(a, r)).join(" ")}" fill="none" stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>`;
      const val = Math.round((lvl / 4) * scale);
      const top = ptObj(angles[0], r);
      grid += `<text x="${(top.x + 3).toFixed(1)}" y="${(top.y - 3).toFixed(1)}" font-size="8" opacity="0.3" fill="currentColor">${val}</text>`;
    }

    const axes = angles.map((a) => { const p = ptObj(a, maxR); return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.1" stroke-width="1"/>`; }).join("");

    const dataPts = labels.map((l, i) => { const r = (Math.min(scores[l.id] ?? 0, scale) / scale) * maxR; return pt(angles[i], r); }).join(" ");
    const dataDots = labels.map((l, i) => { const r = (Math.min(scores[l.id] ?? 0, scale) / scale) * maxR; return ptObj(angles[i], r); });

    let cmpPoly = "";
    if (compareScores) {
      const cPts = labels.map((l, i) => { const r = (Math.min(compareScores[l.id] ?? 0, scale) / scale) * maxR; return pt(angles[i], r); }).join(" ");
      cmpPoly = `<polygon points="${cPts}" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.3" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    }

    const dataPoly = `<polygon points="${dataPts}" fill="var(--interactive-accent)" fill-opacity="0.15" stroke="var(--interactive-accent)" stroke-width="2"/>`;
    const dots = dataDots.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--interactive-accent)" stroke="var(--background-primary)" stroke-width="1.5"/>`).join("");

    const axisLabels = labels.map((l, i) => {
      const a = angles[i];
      const lp = ptObj(a, maxR + labelPad - 4);
      const tp = ptObj(a, maxR + labelPad + 6);
      const anchor = Math.abs(lp.x - cx) < 12 ? "middle" : lp.x < cx ? "end" : "start";
      const lines = wrapText(l.name, maxLabelLen);
      let nameText = `<text text-anchor="${anchor}" font-size="11" font-weight="600" fill="currentColor">`;
      lines.forEach((line, li) => { nameText += `<tspan x="${tp.x.toFixed(1)}" y="${(tp.y - 4 + li * lineH).toFixed(1)}">${escSvg(line)}</tspan>`; });
      nameText += `</text>`;
      const scoreY = tp.y - 4 + lines.length * lineH + 2;
      const scoreText = `<text x="${tp.x.toFixed(1)}" y="${scoreY.toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="currentColor" opacity="0.4">${scores[l.id] ?? 0}</text>`;
      const dot = `<circle cx="${lp.x.toFixed(1)}" cy="${(lp.y - 2).toFixed(1)}" r="3" fill="${l.color}"/>`;
      return dot + nameText + scoreText;
    }).join("");

    const vbX = -padSides.left, vbY = -padSides.top;
    const vbW = size + padSides.left + padSides.right, vbH = size + padSides.top + padSides.bottom;
    return `<svg viewBox="${vbX.toFixed(0)} ${vbY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:420px;display:block;margin:0 auto">${grid}${axes}${cmpPoly}${dataPoly}${dots}${axisLabels}</svg>`;
  }
}

// ─── Modals ───────────────────────────────────────────────────────────────────

class InputModal extends Modal {
  constructor(app: App, private title: string, private def: string, private cb: (v: string) => void) { super(app); }
  onOpen() {
    const { contentEl: el } = this;
    el.addClass("kanban-modal");
    el.createEl("h3", { cls: "kanban-modal-title", text: this.title });
    const input = el.createEl("input", { cls: "kanban-modal-input", attr: { type: "text", value: this.def } }) as HTMLInputElement;
    input.focus(); input.select();
    const btns = el.createEl("div", { cls: "kanban-modal-btns" });
    btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: "Cancel" }).addEventListener("click", () => this.close());
    const ok = btns.createEl("button", { cls: "kb-btn kb-btn-primary", text: "OK" });
    ok.addEventListener("click", () => { const v = input.value.trim(); if (v) { this.cb(v); this.close(); } });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok.click(); if (e.key === "Escape") this.close(); });
  }
  onClose() { this.contentEl.empty(); }
}

interface ColumnOptions { name: string; isDone: boolean; }

class ColumnModal extends Modal {
  constructor(app: App, private opts: ColumnOptions, private cb: (v: ColumnOptions) => void) { super(app); }
  onOpen() {
    const { contentEl: el } = this;
    el.addClass("kanban-modal");
    el.createEl("h3", { cls: "kanban-modal-title", text: "Column settings" });

    el.createEl("label", { cls: "kanban-modal-label", text: "Name" });
    const nameInput = el.createEl("input", { cls: "kanban-modal-input", attr: { type: "text", value: this.opts.name } }) as HTMLInputElement;
    nameInput.focus(); nameInput.select();

    // isDone toggle
    const doneRow = el.createEl("div", { cls: "kanban-modal-done-row" });
    doneRow.createEl("div", { cls: "kanban-modal-done-info" }).createEl("span", { cls: "kanban-modal-label", text: "Mark as Done column" });
    doneRow.querySelector(".kanban-modal-label")?.createEl("span", { cls: "kanban-modal-done-hint", text: "Cards here count in Skill Chart & All Done Todos" });

    const toggleWrap = doneRow.createEl("label", { cls: "kanban-skill-toggle" });
    const toggleInput = toggleWrap.createEl("input", { attr: { type: "checkbox" } }) as HTMLInputElement;
    toggleInput.checked = this.opts.isDone;
    toggleWrap.createEl("span", { cls: "kanban-skill-toggle-track" });

    const btns = el.createEl("div", { cls: "kanban-modal-btns" });
    btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: "Cancel" }).addEventListener("click", () => this.close());
    const ok = btns.createEl("button", { cls: "kb-btn kb-btn-primary", text: "OK" });
    ok.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) return;
      this.cb({ name, isDone: toggleInput.checked });
      this.close();
    });
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") ok.click(); if (e.key === "Escape") this.close(); });
  }
  onClose() { this.contentEl.empty(); }
}

class CardModal extends Modal {
  constructor(app: App, private allLabels: KanbanLabel[], private card: KanbanCard | null, private cb: (t: string, d: string, l: string[]) => void) { super(app); }
  onOpen() {
    const { contentEl: el } = this;
    el.addClass("kanban-modal");
    el.createEl("h3", { cls: "kanban-modal-title", text: this.card ? "Edit card" : "New card" });

    el.createEl("label", { cls: "kanban-modal-label", text: "Title" });
    const titleInput = el.createEl("input", { cls: "kanban-modal-input", attr: { type: "text", value: this.card?.title ?? "", placeholder: "Task title…" } }) as HTMLInputElement;
    titleInput.focus();

    el.createEl("label", { cls: "kanban-modal-label", text: "Description" });
    const descInput = el.createEl("textarea", { cls: "kanban-modal-textarea", attr: { placeholder: "Optional details…", rows: "3" } }) as HTMLTextAreaElement;
    if (this.card?.description) descInput.value = this.card.description;

    const selected = new Set<string>(this.card?.labelIds ?? []);

    if (this.allLabels.length) {
      el.createEl("label", { cls: "kanban-modal-label", text: "Labels" });
      const grid = el.createEl("div", { cls: "kanban-modal-chips" });
      this.allLabels.forEach((label) => {
        const chip = grid.createEl("div", { cls: "kanban-modal-chip" + (selected.has(label.id) ? " selected" : "") });
        chip.style.setProperty("--lc", label.color);
        chip.createEl("span", { cls: "kanban-chip-dot" });
        chip.createEl("span", { text: label.name });
        chip.addEventListener("click", () => {
          if (selected.has(label.id)) { selected.delete(label.id); chip.removeClass("selected"); }
          else { selected.add(label.id); chip.addClass("selected"); }
        });
      });
    }

    const btns = el.createEl("div", { cls: "kanban-modal-btns" });
    btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: "Cancel" }).addEventListener("click", () => this.close());
    const save = btns.createEl("button", { cls: "kb-btn kb-btn-primary", text: this.card ? "Save" : "Create" });
    save.addEventListener("click", () => {
      const t = titleInput.value.trim();
      if (!t) { new Notice("Please enter a title."); return; }
      this.cb(t, descInput.value.trim(), Array.from(selected));
      this.close();
    });
    titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") save.click(); });
  }
  onClose() { this.contentEl.empty(); }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class KanbanTodoPlugin extends Plugin {
  settings: KanbanPluginSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, this));
    this.registerExtensions(["kanban"], KANBAN_VIEW_TYPE);

    this.registerView(SKILL_CHART_VIEW_TYPE, (leaf) => new KanbanSkillChartView(leaf, this));
    this.registerView(ALL_DONE_VIEW_TYPE, (leaf) => new AllDoneTodosView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "New Kanban Board", () => this.createBoard());
    this.addRibbonIcon("check-square", "All Done Todos", () => this.openView(ALL_DONE_VIEW_TYPE));
    this.addRibbonIcon("activity", "Skill Chart", () => this.openView(SKILL_CHART_VIEW_TYPE));

    this.addCommand({ id: "create-kanban-board", name: "New Kanban Board", callback: () => this.createBoard() });
    this.addCommand({ id: "open-skill-chart", name: "Open Skill Chart", callback: () => this.openView(SKILL_CHART_VIEW_TYPE) });
    this.addCommand({ id: "open-all-done", name: "Open All Done Todos", callback: () => this.openView(ALL_DONE_VIEW_TYPE) });

    this.addSettingTab(new KanbanSettingTab(this.app, this));
  }

  async createBoard() {
    new InputModal(this.app, "New board", "My Board", async (name) => {
      const path = `${name}.kanban`;
      if (this.app.vault.getAbstractFileByPath(path)) { new Notice(`"${path}" already exists.`); return; }
      const file = await this.app.vault.create(path, JSON.stringify(defaultBoard(), null, 2));
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file as any);
    }).open();
  }

  async openView(type: string) {
    const existing = this.app.workspace.getLeavesOfType(type)[0];
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async updateSkillScores(labelIds: string[], delta: number) {
    for (const id of labelIds) {
      this.settings.skillData.scores[id] = Math.max(0, (this.settings.skillData.scores[id] ?? 0) + delta);
    }
    await this.saveSettings();
    this.app.workspace.getLeavesOfType(SKILL_CHART_VIEW_TYPE).forEach((l) => (l.view as KanbanSkillChartView).render());
  }

  refreshAllDoneView() {
    this.app.workspace.getLeavesOfType(ALL_DONE_VIEW_TYPE).forEach((l) => (l.view as AllDoneTodosView).render());
  }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    if (!this.settings.labels) this.settings.labels = DEFAULT_SETTINGS.labels;
    if (!this.settings.skillData) this.settings.skillData = { scores: {}, snapshots: [] };
    if (!this.settings.skillData.snapshots) this.settings.skillData.snapshots = [];
  }

  async saveSettings() { await this.saveData(this.settings); }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const PRESET_COLORS = ["#ef4444","#f97316","#f59e0b","#84cc16","#10b981","#06b6d4","#6366f1","#8b5cf6","#ec4899"];

class KanbanSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: KanbanTodoPlugin) { super(app, plugin); }

  display() {
    const { containerEl: el } = this;
    el.empty();
    el.addClass("kanban-settings");
    el.createEl("h2", { text: "Kanban Todo Board" });
    el.createEl("p", { cls: "setting-item-description", text: "Labels are assigned to cards and drive the Skill Chart." });

    el.createEl("h3", { cls: "kanban-settings-h3", text: "Labels" });
    const list = el.createEl("div", { cls: "kanban-settings-labels" });
    this.renderLabels(list);

    new Setting(el).addButton((b) =>
      b.setButtonText("+ Add label").setCta().onClick(async () => {
        this.plugin.settings.labels.push({ id: generateId(), name: "New Label", color: PRESET_COLORS[this.plugin.settings.labels.length % PRESET_COLORS.length] });
        await this.plugin.saveSettings();
        this.display();
      })
    );

    el.createEl("h3", { cls: "kanban-settings-h3", text: "Skill Data" });
    new Setting(el)
      .setName("Reset skill scores")
      .setDesc("Clears all accumulated scores and history.")
      .addButton((b) => b.setButtonText("Reset").setWarning().onClick(async () => {
        this.plugin.settings.skillData = { scores: {}, snapshots: [] };
        await this.plugin.saveSettings();
        new Notice("Skill scores reset.");
      }));
  }

  renderLabels(container: HTMLElement) {
    container.empty();
    this.plugin.settings.labels.forEach((label, idx) => {
      const row = container.createEl("div", { cls: "kanban-settings-row" });
      const colorInput = row.createEl("input", { cls: "kanban-settings-color", attr: { type: "color", value: label.color } }) as HTMLInputElement;
      colorInput.addEventListener("input", async () => { label.color = colorInput.value; await this.plugin.saveSettings(); preview.style.setProperty("--lc", colorInput.value); });

      const nameInput = row.createEl("input", { cls: "kanban-settings-name", attr: { type: "text", value: label.name } }) as HTMLInputElement;
      nameInput.addEventListener("change", async () => { label.name = nameInput.value.trim() || label.name; await this.plugin.saveSettings(); });
      nameInput.addEventListener("input", () => { preview.textContent = nameInput.value || label.name; });

      const preview = row.createEl("span", { cls: "kanban-label-tag", text: label.name });
      preview.style.setProperty("--lc", label.color);

      const del = row.createEl("button", { cls: "kb-icon-btn kb-icon-danger", attr: { title: "Remove" } });
      del.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      del.addEventListener("click", async () => { this.plugin.settings.labels.splice(idx, 1); await this.plugin.saveSettings(); this.display(); });
    });
  }
}
