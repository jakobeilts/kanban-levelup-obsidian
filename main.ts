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
  setIcon,
} from "obsidian";
import { PriorityDuelModal } from "./duel-modal";
import { LANGUAGE_NAMES, LanguageSetting, dateLocale, obsidianLanguage, setLanguage, t, tp } from "./i18n";
import type { DuelComparison } from "./duel-ranker";

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
  /** UI language; "auto" follows Obsidian. */
  language?: LanguageSetting;
}

export type EisenhowerQuadrant = "do" | "schedule" | "delegate" | "eliminate";

export interface EisenhowerQuadrantDef {
  id: EisenhowerQuadrant;
  name: string;
  hint: string;
  color: string;
}

/** The four Eisenhower quadrants, in reading order of the matrix. */
export const EISENHOWER_QUADRANTS: EisenhowerQuadrantDef[] = [
  // Getters, so names follow the current language without rebuilding the list.
  { id: "do",        get name() { return t("q.do.name"); },        get hint() { return t("q.do.hint"); },        color: "#ef4444" },
  { id: "schedule",  get name() { return t("q.schedule.name"); },  get hint() { return t("q.schedule.hint"); },  color: "#10b981" },
  { id: "delegate",  get name() { return t("q.delegate.name"); },  get hint() { return t("q.delegate.hint"); },  color: "#f59e0b" },
  { id: "eliminate", get name() { return t("q.eliminate.name"); }, get hint() { return t("q.eliminate.hint"); }, color: "#6b7280" },
];

export function quadrantDef(id?: string): EisenhowerQuadrantDef | undefined {
  return EISENHOWER_QUADRANTS.find((q) => q.id === id);
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  labelIds?: string[];
  completedAt?: number;
  quadrant?: EisenhowerQuadrant;
}

export interface KanbanColumn {
  id: string;
  name: string;
  cards: KanbanCard[];
  color?: string;
  isDone?: boolean;
  /**
   * Card ids in the order the last priority duel produced. Cards not listed here
   * were added later, so their position says nothing about their priority and the
   * next duel places them from scratch.
   */
  rankedIds?: string[];
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

function svgEl(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
      { id: generateId(), name: t("board.defaultBacklog"), cards: [], color: "#6366f1" },
      { id: generateId(), name: t("board.defaultInProgress"), cards: [], color: "#f59e0b" },
      { id: generateId(), name: t("board.defaultDone"), cards: [], color: "#10b981", isDone: true },
    ],
  };
}

// ─── Kanban board view ────────────────────────────────────────────────────────

export const KANBAN_VIEW_TYPE = "kanban-todo-view";

export class KanbanView extends TextFileView {
  plugin: KanbanTodoPlugin;
  boardData: KanbanBoard = defaultBoard();

  // Card drag state
  private draggedCard: { card: KanbanCard; sourceCol: KanbanColumn } | null = null;
  private cardDropTarget: { col: KanbanColumn; index: number } | null = null;

  // Column drag state
  private draggedCol: KanbanColumn | null = null;
  private colDropIndex: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return KANBAN_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? t("board.displayFallback"); }
  getIcon() { return "layout-dashboard"; }
  getViewData(): string { return JSON.stringify(this.boardData, null, 2); }

  setViewData(data: string, _clear: boolean): void {
    try {
      const parsed: KanbanBoard = JSON.parse(data);
      this.boardData = parsed?.columns ? parsed : defaultBoard();
    } catch { this.boardData = defaultBoard(); }
    if (this.file) this.plugin.lastBoardPath = this.file.path;
    this.render();
  }

  clear() { this.boardData = defaultBoard(); }

  private persist(): void {
    this.requestSave();
    this.render();
    void this.plugin.refreshEisenhowerView();
  }

  /** Save + re-render after another view (e.g. the Eisenhower matrix) mutated this board. */
  applyExternalChange(): void { this.requestSave(); this.render(); }

  private async moveCard(card: KanbanCard, fromCol: KanbanColumn, toCol: KanbanColumn, toIndex?: number): Promise<void> {
    const fromIdx = fromCol.cards.findIndex((c) => c.id === card.id);
    if (fromIdx === -1) return;
    fromCol.cards.splice(fromIdx, 1);

    const wasInDone = fromCol.isDone;
    if (toCol.isDone) {
      card.completedAt = Date.now();
    } else {
      delete card.completedAt;
    }

    const insertAt = toIndex !== undefined ? Math.min(toIndex, toCol.cards.length) : toCol.cards.length;
    toCol.cards.splice(insertAt, 0, card);
    this.persist();

    try {
      if (wasInDone && card.labelIds?.length) {
        await this.plugin.updateSkillScores(card.labelIds, -1);
      }
      if (toCol.isDone && card.labelIds?.length) {
        await this.plugin.updateSkillScores(card.labelIds, +1);
      }
    } catch (e) {
      console.error("Failed to update skill scores:", e);
    }
    void this.plugin.refreshAllDoneView();
  }

  render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("kanban-root");

    const hdr = el.createEl("div", { cls: "kanban-header" });
    hdr.createEl("span", { cls: "kanban-header-title", text: this.file?.basename ?? t("board.fallbackTitle") });
    const renameBtn = hdr.createEl("button", { cls: "kanban-rename-btn", attr: { title: t("board.rename") } });
    setIcon(renameBtn, "pencil");
    renameBtn.addEventListener("click", () => {
      if (!this.file) return;
      new InputModal(this.app, t("board.rename"), this.file.basename, (val) => {
        if (this.file) {
          const newPath = this.file.parent?.path ? `${this.file.parent.path}/${val}.kanban` : `${val}.kanban`;
          void this.app.fileManager.renameFile(this.file, newPath);
        }
      }).open();
    });

    const board = el.createEl("div", { cls: "kanban-board" });

    this.boardData.columns.forEach((col, colIdx) => {
      // Drop zone gap before each column (for column reordering)
      const dropGap = board.createEl("div", { cls: "kanban-col-gap" });
      dropGap.dataset["index"] = String(colIdx);
      dropGap.addEventListener("dragover", (e) => {
        if (!this.draggedCol) return;
        e.preventDefault();
        dropGap.addClass("col-gap-active");
      });
      dropGap.addEventListener("dragleave", () => dropGap.removeClass("col-gap-active"));
      dropGap.addEventListener("drop", (e) => {
        e.preventDefault();
        dropGap.removeClass("col-gap-active");
        this.dropColumnAt(colIdx);
      });

      this.renderColumn(board, col);
    });

    // Final drop gap after all columns
    const lastGap = board.createEl("div", { cls: "kanban-col-gap" });
    lastGap.dataset["index"] = String(this.boardData.columns.length);
    lastGap.addEventListener("dragover", (e) => {
      if (!this.draggedCol) return;
      e.preventDefault();
      lastGap.addClass("col-gap-active");
    });
    lastGap.addEventListener("dragleave", () => lastGap.removeClass("col-gap-active"));
    lastGap.addEventListener("drop", (e) => {
      e.preventDefault();
      lastGap.removeClass("col-gap-active");
      this.dropColumnAt(this.boardData.columns.length);
    });

    const addColBtn = board.createEl("button", { cls: "kanban-add-col-btn", attr: { title: t("board.addColumn") } });
    setIcon(addColBtn, "plus");
    addColBtn.addEventListener("click", () => {
      new ColumnModal(this.app, { name: t("board.newColumn"), isDone: false }, ({ name, isDone }) => {
        this.boardData.columns.push({ id: generateId(), name, cards: [], color: "#8b5cf6", isDone });
        this.persist();
      }).open();
    });
  }

  private dropColumnAt(targetIndex: number): void {
    if (!this.draggedCol) return;
    const col = this.draggedCol;
    this.draggedCol = null;
    const fromIdx = this.boardData.columns.findIndex((c) => c.id === col.id);
    if (fromIdx === -1) return;
    this.boardData.columns.splice(fromIdx, 1);
    const insertAt = targetIndex > fromIdx ? targetIndex - 1 : targetIndex;
    this.boardData.columns.splice(insertAt, 0, col);
    this.persist();
  }

  private renderColumn(board: HTMLElement, col: KanbanColumn) {
    const now = Date.now();
    const visibleCards = col.isDone
      ? col.cards.filter((c) => !c.completedAt || now - c.completedAt < ONE_WEEK_MS)
      : col.cards;
    const hiddenCount = col.isDone ? col.cards.length - visibleCards.length : 0;

    const colEl = board.createEl("div", { cls: "kanban-col" + (col.isDone ? " kanban-col-done" : "") });
    const hdr = colEl.createEl("div", { cls: "kanban-col-hdr", attr: { draggable: "true" } });

    // Column drag handle events
    hdr.addEventListener("dragstart", (e) => {
      this.draggedCol = col;
      colEl.addClass("col-dragging");
      e.dataTransfer?.setData("text/plain", col.id);
      e.stopPropagation();
    });
    hdr.addEventListener("dragend", () => {
      this.draggedCol = null;
      colEl.removeClass("col-dragging");
      this.contentEl.querySelectorAll(".col-gap-active").forEach((n) => n.removeClass("col-gap-active"));
    });

    const dragHandle = hdr.createEl("span", { cls: "kanban-col-drag-handle", attr: { title: t("col.dragToReorder") } });
    setIcon(dragHandle, "grip-vertical");

    const accent = hdr.createEl("span", { cls: "kanban-col-accent" });
    accent.style.background = col.color ?? "#6366f1";

    const titleEl = hdr.createEl("span", { cls: "kanban-col-title", text: col.name });
    if (col.isDone) {
      hdr.createEl("span", { cls: "kanban-done-tag", text: t("col.doneTag"), attr: { title: t("col.doneTagTitle") } });
    }

    titleEl.addEventListener("dblclick", () => {
      new ColumnModal(this.app, { name: col.name, isDone: col.isDone ?? false }, ({ name, isDone }) => {
        const wasInDone = col.isDone;
        const becomingDone = isDone && !wasInDone;
        const leavingDone = !isDone && wasInDone;
        void (async () => {
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
          this.persist();
          void this.plugin.refreshAllDoneView();
        })();
      }).open();
    });

    const badge = hdr.createEl("span", { cls: "kanban-col-badge", text: String(col.cards.length) });
    badge.style.background = col.color ?? "#6366f1";

    if (!col.isDone) {
      const duelBtn = hdr.createEl("button", {
        cls: "kb-icon-btn kb-duel-open",
        attr: { title: col.cards.length < 2 ? t("col.duelNeedsTwo") : t("col.duel") },
      });
      setIcon(duelBtn, "swords");
      if (!duelBtn.querySelector("svg")) setIcon(duelBtn, "list-ordered"); // older Obsidian icon sets
      duelBtn.disabled = col.cards.length < 2;
      duelBtn.addEventListener("click", (e) => { e.stopPropagation(); this.openDuel(col); });
    }

    const delColBtn = hdr.createEl("button", { cls: "kb-icon-btn", attr: { title: t("col.delete") } });
    setIcon(delColBtn, "trash-2");
    delColBtn.addEventListener("click", () => {
      if (col.cards.length > 0) {
        new ConfirmModal(
          this.app,
          t("col.deleteTitle", { name: col.name }),
          tp("col.deleteMsg", col.cards.length),
          () => void this.deleteColumn(col)
        ).open();
      } else {
        void this.deleteColumn(col);
      }
    });

    const cardsEl = colEl.createEl("div", { cls: "kanban-cards" });

    // Cards container drop: used when dragging a card onto an empty column or below all cards
    cardsEl.addEventListener("dragover", (e) => {
      if (this.draggedCol || !this.draggedCard) return;
      e.preventDefault();
      // Only highlight the column if not hovering over a specific card
      if (!(e.target instanceof Element) || !e.target.closest(".kanban-card")) {
        colEl.addClass("drag-over");
        this.cardDropTarget = { col, index: visibleCards.length };
      }
    });
    cardsEl.addEventListener("dragleave", (e) => {
      if (!(e.relatedTarget instanceof Node) || !colEl.contains(e.relatedTarget)) {
        colEl.removeClass("drag-over");
      }
    });
    cardsEl.addEventListener("drop", (e) => {
      e.preventDefault();
      colEl.removeClass("drag-over");
      if (!this.draggedCard) return;
      const { card, sourceCol } = this.draggedCard;
      this.draggedCard = null;
      const target = this.cardDropTarget;
      this.cardDropTarget = null;
      if (target) {
        void this.moveCard(card, sourceCol, target.col, target.index);
      } else if (sourceCol.id !== col.id) {
        void this.moveCard(card, sourceCol, col);
      }
    });

    visibleCards.forEach((card, cardIdx) => this.renderCard(cardsEl, card, col, cardIdx, visibleCards.length));

    if (hiddenCount > 0) {
      const archivedNote = cardsEl.createEl("div", { cls: "kanban-archived-note" });
      const archiveIcon = archivedNote.createEl("span");
      setIcon(archiveIcon, "archive");
      archivedNote.createEl("span", { text: " " + tp("col.archived", hiddenCount) });
    }

    const addBtn = colEl.createEl("button", { cls: "kanban-add-card-btn" });
    const plusIcon = addBtn.createEl("span");
    setIcon(plusIcon, "plus");
    addBtn.createEl("span", { text: t("col.addCard") });
    addBtn.addEventListener("click", () => {
      new CardModal(this.app, this.plugin.settings.labels, null, (title, desc, labelIds, quadrant) => {
        void (async () => {
          const card: KanbanCard = { id: generateId(), title, description: desc, labelIds, quadrant, createdAt: Date.now() };
          if (col.isDone) {
            card.completedAt = Date.now();
            if (labelIds.length) await this.plugin.updateSkillScores(labelIds, +1);
          }
          col.cards.push(card);
          this.persist();
          void this.plugin.refreshAllDoneView();
        })();
      }).open();
    });
  }

  /** Key for an unfinished duel session: survives closing the modal, not a restart. */
  private duelKey(col: KanbanColumn): string { return `${this.file?.path ?? ""}::${col.id}`; }

  openDuel(col: KanbanColumn): void {
    if (col.cards.length < 2) { new Notice(t("notice.duelNeedsTwo")); return; }
    const key = this.duelKey(col);
    const ranked = col.rankedIds ? new Set(col.rankedIds) : null;
    new PriorityDuelModal(this.app, {
      columnName: col.name,
      cards: col.cards.slice(),
      labels: this.plugin.settings.labels,
      quadrantDef,
      resume: this.plugin.duelSessions.get(key) ?? [],
      // Never duelled: the hand-made order is all we know, so every card counts as placed.
      unplaced: new Set(ranked ? col.cards.filter((c) => !ranked.has(c.id)).map((c) => c.id) : []),
      trustedOrder: ranked !== null,
      onProgress: (comps) => {
        if (comps.length) this.plugin.duelSessions.set(key, comps);
        else this.plugin.duelSessions.delete(key);
      },
      onApply: (orderedIds) => {
        this.plugin.duelSessions.delete(key);
        this.applyColumnOrder(col.id, orderedIds);
      },
      onDiscard: () => this.plugin.duelSessions.delete(key),
    }).open();
  }

  /**
   * Reorder a column by card id. Looked up again by id because the board may have
   * been reloaded or edited (e.g. from the Eisenhower matrix) while the duel was open:
   * cards added meanwhile go to the bottom, cards removed meanwhile are ignored.
   */
  private applyColumnOrder(colId: string, orderedIds: string[]): void {
    const col = this.boardData.columns.find((c) => c.id === colId);
    if (!col) { new Notice(t("notice.columnGone")); return; }
    const rank = new Map(orderedIds.map((id, i) => [id, i] as [string, number]));
    const before = col.cards.map((c) => c.id).join();
    const ranked = col.cards.filter((c) => rank.has(c.id)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    const added = col.cards.filter((c) => !rank.has(c.id));
    col.cards = ranked.concat(added);
    col.rankedIds = ranked.map((c) => c.id);
    this.persist();
    new Notice(col.cards.map((c) => c.id).join() === before ? t("notice.orderConfirmed", { name: col.name }) : t("notice.reordered", { name: col.name }));
  }

  private async deleteColumn(col: KanbanColumn): Promise<void> {
    if (col.isDone) {
      for (const card of col.cards) {
        if (card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, -1);
      }
    }
    this.boardData.columns = this.boardData.columns.filter((c) => c.id !== col.id);
    this.persist();
    void this.plugin.refreshAllDoneView();
  }

  private renderCard(container: HTMLElement, card: KanbanCard, col: KanbanColumn, cardIdx: number, _totalVisible: number) {
    const el = container.createEl("div", { cls: "kanban-card", attr: { draggable: "true" } });

    el.addEventListener("dragstart", (e) => {
      if (this.draggedCol) return; // column drag takes priority
      this.draggedCard = { card, sourceCol: col };
      el.addClass("dragging");
      e.dataTransfer?.setData("text/plain", card.id);
      e.stopPropagation();
    });
    el.addEventListener("dragend", () => {
      el.removeClass("dragging");
      this.draggedCard = null;
      this.cardDropTarget = null;
      document.querySelectorAll(".card-drop-before, .card-drop-after, .drag-over").forEach((n) => {
        n.removeClass("card-drop-before");
        n.removeClass("card-drop-after");
        n.removeClass("drag-over");
      });
    });

    // Per-card dragover: determine insert position from cursor
    el.addEventListener("dragover", (e) => {
      if (!this.draggedCard || this.draggedCol) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const isBefore = e.clientY < midY;

      // Clear indicators on all cards first
      container.querySelectorAll(".card-drop-before, .card-drop-after").forEach((n) => {
        n.removeClass("card-drop-before");
        n.removeClass("card-drop-after");
      });
      el.addClass(isBefore ? "card-drop-before" : "card-drop-after");

      // Figure out the target index in the actual (full) cards array
      // cardIdx is the index within visibleCards; we need index in col.cards
      const visibleCard = col.isDone
        ? col.cards.filter((c) => !c.completedAt || Date.now() - (c.completedAt ?? 0) < ONE_WEEK_MS)
        : col.cards;
      const targetVisible = isBefore ? cardIdx : cardIdx + 1;
      // Map visible index back to full cards index
      const targetCard = visibleCard[targetVisible];
      const targetIdx = targetCard ? col.cards.indexOf(targetCard) : col.cards.length;

      this.cardDropTarget = { col, index: targetIdx };
      // Also clear column drag-over highlight
      container.closest(".kanban-col")?.removeClass("drag-over");
    });

    const body = el.createEl("div", { cls: "kanban-card-body" });
    body.createEl("div", { cls: "kanban-card-title", text: card.title });
    if (card.description) body.createEl("div", { cls: "kanban-card-desc", text: card.description });

    const qDef = quadrantDef(card.quadrant);
    const cardLabels = this.plugin.settings.labels.filter((l) => card.labelIds?.includes(l.id));
    if (qDef || cardLabels.length) {
      const row = el.createEl("div", { cls: "kanban-card-labels" });
      if (qDef) {
        const qTag = row.createEl("span", { cls: "kanban-label-tag kanban-eh-tag", text: qDef.name, attr: { title: t("card.ehTitle", { hint: qDef.hint }) } });
        qTag.style.setProperty("--lc", qDef.color);
      }
      cardLabels.forEach((l) => {
        const tag = row.createEl("span", { cls: "kanban-label-tag", text: l.name });
        tag.style.setProperty("--lc", l.color);
      });
    }

    const footer = el.createEl("div", { cls: "kanban-card-footer" });
    const actions = footer.createEl("div", { cls: "kanban-card-actions" });

    const colIdx = this.boardData.columns.findIndex((c) => c.id === col.id);
    if (colIdx > 0) {
      const lb = actions.createEl("button", { cls: "kb-icon-btn", attr: { title: t("card.moveLeft") } });
      setIcon(lb, "chevron-left");
      lb.addEventListener("click", (e) => { e.stopPropagation(); void this.moveCard(card, col, this.boardData.columns[colIdx - 1]); });
    }
    if (colIdx < this.boardData.columns.length - 1) {
      const rb = actions.createEl("button", { cls: "kb-icon-btn", attr: { title: t("card.moveRight") } });
      setIcon(rb, "chevron-right");
      rb.addEventListener("click", (e) => { e.stopPropagation(); void this.moveCard(card, col, this.boardData.columns[colIdx + 1]); });
    }

    const editBtn = actions.createEl("button", { cls: "kb-icon-btn", attr: { title: t("card.edit") } });
    setIcon(editBtn, "pencil");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      new CardModal(this.app, this.plugin.settings.labels, card, (title, desc, labelIds, quadrant) => {
        void (async () => {
          if (col.isDone && card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, -1);
          card.title = title; card.description = desc; card.labelIds = labelIds;
          if (quadrant) card.quadrant = quadrant; else delete card.quadrant;
          if (col.isDone && labelIds.length) await this.plugin.updateSkillScores(labelIds, +1);
          this.persist();
          void this.plugin.refreshAllDoneView();
        })();
      }).open();
    });

    const delBtn = actions.createEl("button", { cls: "kb-icon-btn kb-icon-danger", attr: { title: t("card.delete") } });
    setIcon(delBtn, "x");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void (async () => {
        if (col.isDone && card.labelIds?.length) await this.plugin.updateSkillScores(card.labelIds, -1);
        col.cards = col.cards.filter((c) => c.id !== card.id);
        this.persist();
        void this.plugin.refreshAllDoneView();
      })();
    });
  }
}

// ─── All done todos view ──────────────────────────────────────────────────────

export const ALL_DONE_VIEW_TYPE = "kanban-all-done";

interface DoneEntry {
  card: KanbanCard;
  boardName: string;
  completedAt: number;
}

export class AllDoneTodosView extends ItemView {
  plugin: KanbanTodoPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return ALL_DONE_VIEW_TYPE; }
  getDisplayText() { return t("done.title"); }
  getIcon() { return "check-square"; }

  async onOpen() { await this.render(); }
  async onClose() { /* nothing to clean up */ }

  async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    el.addClass("kanban-done-root");

    el.createEl("h2", { cls: "kanban-done-title", text: t("done.title") });

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
            entries.push({ card, boardName: file.basename, completedAt: card.completedAt ?? card.createdAt });
          }
        }
      } catch { /* skip malformed files */ }
    }

    if (entries.length === 0) {
      el.createEl("div", { cls: "kanban-done-empty", text: t("done.empty") });
      return;
    }

    entries.sort((a, b) => b.completedAt - a.completedAt);

    const groups = new Map<string, DoneEntry[]>();
    for (const entry of entries) {
      const dateKey = new Date(entry.completedAt).toLocaleDateString(dateLocale(), { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)?.push(entry);
    }

    el.createEl("div", { cls: "kanban-done-count", text: `${tp("done.todos", entries.length)} ${tp("done.boards", files.length)}` });

    for (const [dateKey, dayEntries] of groups) {
      const section = el.createEl("div", { cls: "kanban-done-section" });
      section.createEl("div", { cls: "kanban-done-date-hdr", text: dateKey });

      for (const entry of dayEntries) {
        const row = section.createEl("div", { cls: "kanban-done-row" });
        const check = row.createEl("span", { cls: "kanban-done-check" });
        setIcon(check, "check");

        const main = row.createEl("div", { cls: "kanban-done-main" });
        main.createEl("span", { cls: "kanban-done-card-title", text: entry.card.title });
        if (entry.card.description) main.createEl("span", { cls: "kanban-done-card-desc", text: entry.card.description });

        const meta = row.createEl("div", { cls: "kanban-done-meta" });
        this.plugin.settings.labels.filter((l) => entry.card.labelIds?.includes(l.id)).forEach((l) => {
          const tag = meta.createEl("span", { cls: "kanban-label-tag", text: l.name });
          tag.style.setProperty("--lc", l.color);
        });
        meta.createEl("span", { cls: "kanban-done-board", text: entry.boardName });
        meta.createEl("span", { cls: "kanban-done-time", text: new Date(entry.completedAt).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" }) });
      }
    }
  }
}

// ─── Eisenhower matrix view ───────────────────────────────────────────────────

export const EISENHOWER_VIEW_TYPE = "kanban-eisenhower";

interface MatrixEntry {
  card: KanbanCard;
  column: KanbanColumn;
}

export class EisenhowerMatrixView extends ItemView {
  plugin: KanbanTodoPlugin;
  private board: KanbanBoard | null = null;
  private boardFile: TFile | null = null;
  private dragged: KanbanCard | null = null;
  /** Guards against overlapping renders clobbering each other's DOM. */
  private renderSeq = 0;
  /** Card ids whose description the user expanded — kept across re-renders. */
  private expanded = new Set<string>();

  constructor(leaf: WorkspaceLeaf, plugin: KanbanTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return EISENHOWER_VIEW_TYPE; }
  getDisplayText() { return t("eh.title"); }
  getIcon() { return "layout-grid"; }

  async onOpen() {
    // Re-resolve the target board whenever this view is brought to the front,
    // so it follows whichever board the user last worked on.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf === this.leaf) void this.render();
      })
    );
    await this.render();
  }

  async onClose() { /* nothing to clean up */ }

  private boardFiles(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((f) => f.extension === "kanban")
      .sort((a, b) => a.basename.localeCompare(b.basename));
  }

  /** The board this view operates on: the last opened one, else the first in the vault. */
  private resolveFile(files: TFile[]): TFile | null {
    if (!files.length) return null;
    const last = this.plugin.lastBoardPath;
    return files.find((f) => f.path === last) ?? files[0];
  }

  /** An open KanbanView for that file, if any — it owns the authoritative in-memory board. */
  private liveView(file: TFile): KanbanView | null {
    for (const leaf of this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof KanbanView && v.file?.path === file.path) return v;
    }
    return null;
  }

  private findCard(board: KanbanBoard, cardId: string): KanbanCard | null {
    for (const col of board.columns ?? []) {
      const found = col.cards?.find((c) => c.id === cardId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Mutate a single card and write it back.
   * Never writes this view's whole board snapshot to disk — a snapshot can be stale,
   * which would silently revert edits made elsewhere in the meantime.
   */
  private async withBoard<T>(mutate: (board: KanbanBoard) => T | null): Promise<T | null> {
    const file = this.boardFile;
    if (!file) return null;

    const live = this.liveView(file);
    if (live) {
      // Route through the open view so its state and ours never diverge.
      const result = mutate(live.boardData);
      if (result === null) return null;
      live.applyExternalChange();
      return result;
    }

    let board: KanbanBoard;
    try {
      board = JSON.parse(await this.app.vault.read(file));
    } catch {
      new Notice(t("eh.cannotRead", { name: file.basename }));
      return null;
    }
    const result = mutate(board);
    if (result === null) return null;
    await this.app.vault.modify(file, JSON.stringify(board, null, 2));
    return result;
  }

  private async applyCardChange(cardId: string, mutate: (card: KanbanCard) => void): Promise<void> {
    await this.withBoard((board) => {
      const target = this.findCard(board, cardId);
      if (!target) return null;
      mutate(target);
      return true;
    });
  }

  /**
   * Move a card into the board's done column — the same transition the board makes
   * when a card is dragged there, including completion timestamp and skill scores.
   */
  private async completeCard(cardId: string): Promise<void> {
    const moved = await this.withBoard((board) => {
      const doneCol = board.columns.find((c) => c.isDone);
      if (!doneCol) {
        new Notice(t("eh.noDoneColumn"));
        return null;
      }
      for (const col of board.columns) {
        const idx = col.cards.findIndex((c) => c.id === cardId);
        if (idx === -1) continue;
        if (col.isDone) return null; // already done
        const [card] = col.cards.splice(idx, 1);
        card.completedAt = Date.now();
        doneCol.cards.push(card);
        return { title: card.title, labelIds: card.labelIds ?? [] };
      }
      return null;
    });

    if (!moved) return;

    if (moved.labelIds.length) {
      try {
        await this.plugin.updateSkillScores(moved.labelIds, +1);
      } catch (e) {
        console.error("Failed to update skill scores:", e);
      }
    }
    void this.plugin.refreshAllDoneView();
    new Notice(t("eh.completed", { title: moved.title }));
    await this.render();
  }

  async render(): Promise<void> {
    const seq = ++this.renderSeq;

    // Resolve everything that needs awaiting BEFORE touching the DOM. Two renders can
    // overlap (onOpen and the active-leaf-change event both fire when the view opens);
    // with an await between empty() and the first append, they would interleave and
    // paint the matrix twice.
    const files = this.boardFiles();
    const file = this.resolveFile(files);
    let board: KanbanBoard | null = null;
    if (file) {
      const live = this.liveView(file);
      if (live) {
        board = live.boardData;
      } else {
        try {
          const parsed: KanbanBoard = JSON.parse(await this.app.vault.read(file));
          board = parsed?.columns ? parsed : null;
        } catch {
          board = null;
        }
      }
    }
    if (seq !== this.renderSeq) return; // a newer render started while we were reading

    this.boardFile = file;
    this.board = board;

    const el = this.contentEl;
    el.empty();
    el.addClass("kanban-eh-root");

    const hdr = el.createEl("div", { cls: "kanban-eh-hdr" });
    hdr.createEl("h2", { cls: "kanban-eh-title", text: t("eh.title") });

    if (!file) {
      el.createEl("div", {
        cls: "kanban-eh-empty",
        text: t("eh.noBoard"),
      });
      return;
    }

    if (!board) {
      el.createEl("div", { cls: "kanban-eh-empty", text: t("eh.cannotRead", { name: file.basename }) });
      return;
    }

    const picker = hdr.createEl("select", { cls: "kanban-eh-select", attr: { title: t("eh.boardPicker") } });
    files.forEach((f) => {
      const opt = picker.createEl("option", { text: f.basename, attr: { value: f.path } });
      if (f.path === file.path) opt.selected = true;
    });
    picker.addEventListener("change", () => {
      this.plugin.lastBoardPath = picker.value;
      void this.render();
    });

    // Only open work belongs in the matrix \u2014 done columns are covered by the
    // all done page and the skill chart.
    const entries: MatrixEntry[] = [];
    for (const col of board.columns) {
      if (col.isDone) continue;
      for (const card of col.cards) entries.push({ card, column: col });
    }
    hdr.createEl("span", {
      cls: "kanban-eh-count",
      text: tp("eh.openTasks", entries.length),
    });

    const grid = el.createEl("div", { cls: "kanban-eh-grid" });
    grid.createEl("div", { cls: "kanban-eh-corner" });
    grid.createEl("div", { cls: "kanban-eh-axis kanban-eh-axis-x", text: t("eh.urgent") });
    grid.createEl("div", { cls: "kanban-eh-axis kanban-eh-axis-x", text: t("eh.notUrgent") });
    grid.createEl("div", { cls: "kanban-eh-axis kanban-eh-axis-y", text: t("eh.important") });
    this.renderQuadrant(grid, "do", entries);
    this.renderQuadrant(grid, "schedule", entries);
    grid.createEl("div", { cls: "kanban-eh-axis kanban-eh-axis-y", text: t("eh.notImportant") });
    this.renderQuadrant(grid, "delegate", entries);
    this.renderQuadrant(grid, "eliminate", entries);

    const unassigned = entries.filter((e) => !quadrantDef(e.card.quadrant));
    const tray = el.createEl("div", { cls: "kanban-eh-tray" });
    const trayHdr = tray.createEl("div", { cls: "kanban-eh-tray-hdr" });
    trayHdr.createEl("span", { cls: "kanban-eh-tray-title", text: t("eh.notCategorised") });
    trayHdr.createEl("span", { cls: "kanban-eh-quad-count", text: String(unassigned.length) });
    const trayBody = tray.createEl("div", { cls: "kanban-eh-tray-body" });
    this.makeDropTarget(tray, undefined);
    if (!unassigned.length) {
      trayBody.createEl("div", { cls: "kanban-eh-quad-empty", text: t("eh.allCategorised") });
    }
    unassigned.forEach((e) => this.renderCard(trayBody, e));
  }

  private renderQuadrant(grid: HTMLElement, id: EisenhowerQuadrant, entries: MatrixEntry[]): void {
    const def = quadrantDef(id) ?? EISENHOWER_QUADRANTS[0];
    const items = entries.filter((e) => e.card.quadrant === id);

    const cell = grid.createEl("div", { cls: "kanban-eh-quad" });
    cell.style.setProperty("--qc", def.color);

    const hdr = cell.createEl("div", { cls: "kanban-eh-quad-hdr" });
    hdr.createEl("span", { cls: "kanban-eh-quad-dot" });
    hdr.createEl("span", { cls: "kanban-eh-quad-name", text: def.name });
    hdr.createEl("span", { cls: "kanban-eh-quad-hint", text: def.hint });
    hdr.createEl("span", { cls: "kanban-eh-quad-count", text: String(items.length) });

    const body = cell.createEl("div", { cls: "kanban-eh-quad-body" });
    this.makeDropTarget(cell, id);
    if (!items.length) body.createEl("div", { cls: "kanban-eh-quad-empty", text: t("eh.dropHere") });
    items.forEach((e) => this.renderCard(body, e));
  }

  private makeDropTarget(host: HTMLElement, quadrant: EisenhowerQuadrant | undefined): void {
    host.addEventListener("dragover", (e) => {
      if (!this.dragged) return;
      e.preventDefault();
      host.addClass("eh-drag-over");
    });
    host.addEventListener("dragleave", (e) => {
      if (!(e.relatedTarget instanceof Node) || !host.contains(e.relatedTarget)) host.removeClass("eh-drag-over");
    });
    host.addEventListener("drop", (e) => {
      e.preventDefault();
      host.removeClass("eh-drag-over");
      const card = this.dragged;
      this.dragged = null;
      if (!card || card.quadrant === quadrant) return;
      void (async () => {
        await this.applyCardChange(card.id, (c) => {
          if (quadrant) c.quadrant = quadrant;
          else delete c.quadrant;
        });
        await this.render();
      })();
    });
  }

  private renderCard(container: HTMLElement, entry: MatrixEntry): void {
    const { card, column } = entry;
    const el = container.createEl("div", { cls: "kanban-eh-card", attr: { draggable: "true" } });

    el.addEventListener("dragstart", (e) => {
      this.dragged = card;
      el.addClass("dragging");
      e.dataTransfer?.setData("text/plain", card.id);
    });
    el.addEventListener("dragend", () => {
      el.removeClass("dragging");
      this.dragged = null;
      this.contentEl.querySelectorAll(".eh-drag-over").forEach((n) => n.removeClass("eh-drag-over"));
    });

    const body = el.createEl("div", { cls: "kanban-eh-card-body" });
    const titleRow = body.createEl("div", { cls: "kanban-eh-card-titlerow" });

    if (card.description) {
      // Descriptions stay collapsed so the matrix keeps an overview density;
      // clicking the card reveals one.
      const chevron = titleRow.createEl("span", { cls: "kanban-eh-card-toggle" });
      setIcon(chevron, "chevron-right");
      titleRow.createEl("span", { cls: "kanban-eh-card-title", text: card.title });
      const descEl = body.createEl("div", { cls: "kanban-eh-card-desc", text: card.description });

      const sync = () => {
        const open = this.expanded.has(card.id);
        el.toggleClass("is-expanded", open);
        el.setAttr("aria-expanded", String(open));
        descEl.toggleClass("is-open", open);
        chevron.setAttr("aria-label", open ? t("eh.hideDesc") : t("eh.showDesc"));
      };
      sync();

      el.addClass("has-desc");
      el.addEventListener("click", (e) => {
        if (e.target instanceof Element && e.target.closest("button")) return;
        if (this.expanded.has(card.id)) this.expanded.delete(card.id);
        else this.expanded.add(card.id);
        sync();
      });
    } else {
      // Empty spacer of the same width, so titles line up whether or not a card
      // has a description.
      titleRow.createEl("span", { cls: "kanban-eh-card-toggle" });
      titleRow.createEl("span", { cls: "kanban-eh-card-title", text: card.title });
    }

    const meta = el.createEl("div", { cls: "kanban-eh-card-meta" });
    meta.createEl("span", { cls: "kanban-eh-card-col", text: column.name });
    this.plugin.settings.labels
      .filter((l) => card.labelIds?.includes(l.id))
      .forEach((l) => {
        const tag = meta.createEl("span", { cls: "kanban-label-tag", text: l.name });
        tag.style.setProperty("--lc", l.color);
      });

    const actions = el.createEl("div", { cls: "kanban-eh-card-actions" });

    const doneBtn = actions.createEl("button", { cls: "kb-icon-btn kb-icon-done", attr: { title: t("eh.markDone") } });
    setIcon(doneBtn, "check");
    doneBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.completeCard(card.id);
    });

    const editBtn = actions.createEl("button", { cls: "kb-icon-btn", attr: { title: t("eh.editCard") } });
    setIcon(editBtn, "pencil");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      new CardModal(this.app, this.plugin.settings.labels, card, (title, desc, labelIds, quadrant) => {
        void (async () => {
          await this.applyCardChange(card.id, (c) => {
            c.title = title;
            c.description = desc;
            c.labelIds = labelIds;
            if (quadrant) c.quadrant = quadrant;
            else delete c.quadrant;
          });
          await this.render();
        })();
      }).open();
    });
  }
}

// ─── Skill chart view ─────────────────────────────────────────────────────────

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
  getDisplayText() { return t("skill.title"); }
  getIcon() { return "activity"; }

  async onOpen() { await this.maybeSnapshot(); this.render(); }
  async onClose() { /* nothing to clean up */ }

  async maybeSnapshot(): Promise<void> {
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

    el.createEl("h2", { cls: "kanban-skill-title", text: t("skill.title") });

    const rangeSection = el.createEl("div", { cls: "kanban-skill-range" });
    const rangeHeader = rangeSection.createEl("div", { cls: "kanban-skill-range-hdr" });
    rangeHeader.createEl("span", { cls: "kanban-skill-range-label", text: t("skill.compare") });

    const toggleWrap = rangeHeader.createEl("label", { cls: "kanban-skill-toggle" });
    const toggleInput = toggleWrap.createEl("input", { attr: { type: "checkbox" } });
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
      dateRow.createEl("span", { cls: "kanban-skill-date-sep", text: t("skill.from") });
      const fromInput = dateRow.createEl("input", { cls: "kanban-skill-date-input", attr: { type: "date", value: this.compareFrom, max: this.compareTo } });
      dateRow.createEl("span", { cls: "kanban-skill-date-sep", text: t("skill.to") });
      const toInput = dateRow.createEl("input", { cls: "kanban-skill-date-input", attr: { type: "date", value: this.compareTo, max: toDateInputVal(new Date()) } });
      fromInput.addEventListener("change", () => { if (fromInput.value) { this.compareFrom = fromInput.value; this.render(); } });
      toInput.addEventListener("change", () => { if (toInput.value) { this.compareTo = toInput.value; this.render(); } });
    }

    if (labels.length === 0) {
      el.createEl("div", { cls: "kanban-skill-empty", text: t("skill.noLabels") });
      return;
    }

    let compareScores: Record<string, number> | null = null;
    let compareLabel = "";

    if (this.compareEnabled) {
      const fromTs = new Date(this.compareFrom).getTime();
      const fromSnap = this.closestSnapshot(fromTs);
      if (fromSnap) {
        compareScores = fromSnap.scores;
        const fromFmt = new Date(this.compareFrom).toLocaleDateString(dateLocale(), { day: "2-digit", month: "short", year: "numeric" });
        const toFmt = new Date(this.compareTo).toLocaleDateString(dateLocale(), { day: "2-digit", month: "short", year: "numeric" });
        compareLabel = `${fromFmt} – ${toFmt}`;
      }
    }

    const allVals = labels.map((l) => scores[l.id] ?? 0);
    const cmpScores = compareScores;
    const cmpVals = cmpScores ? labels.map((l) => cmpScores[l.id] ?? 0) : [];
    const rawMax = Math.max(...allVals, ...cmpVals, 1);
    const scale = rawMax <= 5 ? 5 : rawMax <= 10 ? 10 : Math.ceil(rawMax / 5) * 5;

    const chartWrap = el.createEl("div", { cls: "kanban-skill-chart-wrap" });
    this.appendRadar(chartWrap, labels, scores, compareScores, scale);

    if (compareScores && compareLabel) {
      const legend = el.createEl("div", { cls: "kanban-skill-legend" });
      const cur = legend.createEl("div", { cls: "kanban-skill-legend-item" });
      cur.createEl("span", { cls: "kanban-skill-legend-line current" });
      cur.createEl("span", { text: t("skill.now") });
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
    totalRow.createEl("span", { text: t("skill.total") });
    totalRow.createEl("strong", { text: String(total) });
    if (compareScores && totalDelta !== 0) {
      totalRow.createEl("span", { cls: `kanban-skill-stat-delta ${totalDelta > 0 ? "pos" : "neg"}`, text: totalDelta > 0 ? ` +${totalDelta}` : ` ${totalDelta}` });
    }
  }

  private appendRadar(
    container: HTMLElement,
    labels: KanbanLabel[],
    scores: Record<string, number>,
    compareScores: Record<string, number> | null,
    scale: number
  ): void {
    const N = labels.length;
    const size = 300;
    const cx = size / 2, cy = size / 2;
    const maxR = 90;
    const angles = labels.map((_, i) => (2 * Math.PI * i / N) - Math.PI / 2);
    const ptX = (a: number, r: number) => (cx + r * Math.cos(a)).toFixed(2);
    const ptY = (a: number, r: number) => (cy + r * Math.sin(a)).toFixed(2);
    const pts = (a: number, r: number) => `${ptX(a, r)},${ptY(a, r)}`;

    const charWidth = 6.5, lineH = 14, labelPad = 24, maxLabelLen = 12;
    const pad = { top: 32, right: 32, bottom: 32, left: 32 };

    labels.forEach((l, i) => {
      const lines = wrapText(l.name, maxLabelLen);
      const textW = Math.max(...lines.map((ln) => ln.length)) * charWidth;
      const textH = lines.length * lineH;
      const lx = cx + (maxR + labelPad) * Math.cos(angles[i]);
      const ly = cy + (maxR + labelPad) * Math.sin(angles[i]);
      const anchor = Math.abs(lx - cx) < 12 ? "middle" : lx < cx ? "end" : "start";
      if (anchor === "start") { const re = lx + textW - size; if (re > pad.right) pad.right = re + 8; }
      else if (anchor === "end") { const le = -lx + textW; if (le > pad.left) pad.left = le + 8; }
      else {
        const hw = textW / 2;
        if (lx + hw - size > pad.right) pad.right = lx + hw - size + 8;
        if (-lx + hw > pad.left) pad.left = -lx + hw + 8;
      }
      if (-ly + textH > pad.top) pad.top = -ly + textH + 8;
      if (ly + textH - size > pad.bottom) pad.bottom = ly + textH - size + 8;
    });

    const vbX = -pad.left, vbY = -pad.top;
    const vbW = size + pad.left + pad.right, vbH = size + pad.top + pad.bottom;

    const svg = svgEl("svg", {
      viewBox: `${vbX.toFixed(0)} ${vbY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}`,
      style: "width:100%;max-width:420px;display:block;margin:0 auto",
    });

    // Grid rings + ring labels
    for (let lvl = 1; lvl <= 4; lvl++) {
      const r = (lvl / 4) * maxR;
      const ring = svgEl("polygon", { points: angles.map((a) => pts(a, r)).join(" "), fill: "none", stroke: "currentColor", "stroke-opacity": "0.07", "stroke-width": "1" });
      svg.appendChild(ring);
      const val = Math.round((lvl / 4) * scale);
      const t = svgEl("text", { x: (cx + r * Math.cos(angles[0]) + 3).toFixed(1), y: (cy + r * Math.sin(angles[0]) - 3).toFixed(1), "font-size": "8", opacity: "0.3", fill: "currentColor" });
      t.textContent = String(val);
      svg.appendChild(t);
    }

    // Axes
    angles.forEach((a) => {
      svg.appendChild(svgEl("line", { x1: String(cx), y1: String(cy), x2: ptX(a, maxR), y2: ptY(a, maxR), stroke: "currentColor", "stroke-opacity": "0.1", "stroke-width": "1" }));
    });

    // Comparison polygon
    if (compareScores) {
      const cPts = labels.map((l, i) => { const r = (Math.min(compareScores[l.id] ?? 0, scale) / scale) * maxR; return pts(angles[i], r); }).join(" ");
      svg.appendChild(svgEl("polygon", { points: cPts, fill: "currentColor", "fill-opacity": "0.05", stroke: "currentColor", "stroke-opacity": "0.3", "stroke-width": "1.5", "stroke-dasharray": "4,3" }));
    }

    // Data polygon
    const dataPts = labels.map((l, i) => { const r = (Math.min(scores[l.id] ?? 0, scale) / scale) * maxR; return pts(angles[i], r); }).join(" ");
    svg.appendChild(svgEl("polygon", { points: dataPts, fill: "var(--interactive-accent)", "fill-opacity": "0.15", stroke: "var(--interactive-accent)", "stroke-width": "2" }));

    // Data dots
    labels.forEach((l, i) => {
      const r = (Math.min(scores[l.id] ?? 0, scale) / scale) * maxR;
      svg.appendChild(svgEl("circle", { cx: ptX(angles[i], r), cy: ptY(angles[i], r), r: "3.5", fill: "var(--interactive-accent)", stroke: "var(--background-primary)", "stroke-width": "1.5" }));
    });

    // Axis labels
    labels.forEach((l, i) => {
      const a = angles[i];
      const lpX = cx + (maxR + labelPad - 4) * Math.cos(a);
      const lpY = cy + (maxR + labelPad - 4) * Math.sin(a);
      const tpX = cx + (maxR + labelPad + 6) * Math.cos(a);
      const tpY = cy + (maxR + labelPad + 6) * Math.sin(a);
      const anchor = Math.abs(lpX - cx) < 12 ? "middle" : lpX < cx ? "end" : "start";

      svg.appendChild(svgEl("circle", { cx: lpX.toFixed(1), cy: (lpY - 2).toFixed(1), r: "3", fill: l.color }));

      const lines = wrapText(l.name, maxLabelLen);
      const nameEl = svgEl("text", { "text-anchor": anchor, "font-size": "11", "font-weight": "600", fill: "currentColor" });
      lines.forEach((line, li) => {
        const tspan = svgEl("tspan", { x: tpX.toFixed(1), y: (tpY - 4 + li * lineH).toFixed(1) });
        tspan.textContent = escSvg(line);
        nameEl.appendChild(tspan);
      });
      svg.appendChild(nameEl);

      const scoreEl = svgEl("text", { x: tpX.toFixed(1), y: (tpY - 4 + lines.length * lineH + 2).toFixed(1), "text-anchor": anchor, "font-size": "10", fill: "currentColor", opacity: "0.4" });
      scoreEl.textContent = String(scores[l.id] ?? 0);
      svg.appendChild(scoreEl);
    });

    container.appendChild(svg);
  }
}

// ─── Modals ───────────────────────────────────────────────────────────────────

class InputModal extends Modal {
  constructor(app: App, private title: string, private def: string, private cb: (v: string) => void) { super(app); }
  onOpen() {
    const { contentEl: el } = this;
    el.addClass("kanban-modal");
    el.createEl("h3", { cls: "kanban-modal-title", text: this.title });
    const input = el.createEl("input", { cls: "kanban-modal-input", attr: { type: "text", value: this.def } });
    input.focus();
    input.select();
    const btns = el.createEl("div", { cls: "kanban-modal-btns" });
    btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: t("common.cancel") }).addEventListener("click", () => this.close());
    const ok = btns.createEl("button", { cls: "kb-btn kb-btn-primary", text: t("common.ok") });
    ok.addEventListener("click", () => { const v = input.value.trim(); if (v) { this.cb(v); this.close(); } });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok.click(); if (e.key === "Escape") this.close(); });
  }
  onClose() { this.contentEl.empty(); }
}

class ConfirmModal extends Modal {
  constructor(app: App, private title: string, private message: string, private onConfirm: () => void) { super(app); }
  onOpen() {
    const { contentEl: el } = this;
    el.addClass("kanban-modal");
    el.createEl("h3", { cls: "kanban-modal-title", text: this.title });
    el.createEl("p", { cls: "kanban-modal-message", text: this.message });
    const btns = el.createEl("div", { cls: "kanban-modal-btns" });
    btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: t("common.cancel") }).addEventListener("click", () => this.close());
    btns.createEl("button", { cls: "kb-btn kb-btn-danger", text: t("common.delete") }).addEventListener("click", () => { this.onConfirm(); this.close(); });
  }
  onClose() { this.contentEl.empty(); }
}

interface ColumnOptions { name: string; isDone: boolean; }

class ColumnModal extends Modal {
  constructor(app: App, private opts: ColumnOptions, private cb: (v: ColumnOptions) => void) { super(app); }
  onOpen() {
    const { contentEl: el } = this;
    el.addClass("kanban-modal");
    el.createEl("h3", { cls: "kanban-modal-title", text: t("colModal.title") });

    el.createEl("label", { cls: "kanban-modal-label", text: t("colModal.name") });
    const nameInput = el.createEl("input", { cls: "kanban-modal-input", attr: { type: "text", value: this.opts.name } });
    nameInput.focus();
    nameInput.select();

    const doneRow = el.createEl("div", { cls: "kanban-modal-done-row" });
    const doneInfo = doneRow.createEl("div", { cls: "kanban-modal-done-info" });
    doneInfo.createEl("span", { cls: "kanban-modal-label", text: t("colModal.markDone") });
    doneInfo.createEl("span", { cls: "kanban-modal-done-hint", text: t("colModal.markDoneHint") });

    const toggleWrap = doneRow.createEl("label", { cls: "kanban-skill-toggle" });
    const toggleInput = toggleWrap.createEl("input", { attr: { type: "checkbox" } });
    toggleInput.checked = this.opts.isDone;
    toggleWrap.createEl("span", { cls: "kanban-skill-toggle-track" });

    const btns = el.createEl("div", { cls: "kanban-modal-btns" });
    btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: t("common.cancel") }).addEventListener("click", () => this.close());
    const ok = btns.createEl("button", { cls: "kb-btn kb-btn-primary", text: t("common.ok") });
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
  constructor(app: App, private allLabels: KanbanLabel[], private card: KanbanCard | null, private cb: (t: string, d: string, l: string[], q?: EisenhowerQuadrant) => void) { super(app); }
  onOpen() {
    const { contentEl: el } = this;
    el.addClass("kanban-modal");
    el.createEl("h3", { cls: "kanban-modal-title", text: this.card ? t("cardModal.editTitle") : t("cardModal.newTitle") });

    el.createEl("label", { cls: "kanban-modal-label", text: t("cardModal.title") });
    const titleInput = el.createEl("input", { cls: "kanban-modal-input", attr: { type: "text", value: this.card?.title ?? "", placeholder: t("cardModal.titlePlaceholder") } });
    titleInput.focus();

    el.createEl("label", { cls: "kanban-modal-label", text: t("cardModal.description") });
    const descInput = el.createEl("textarea", { cls: "kanban-modal-textarea", attr: { placeholder: t("cardModal.descriptionPlaceholder"), rows: "3" } });
    if (this.card?.description) descInput.value = this.card.description;

    const selected = new Set<string>(this.card?.labelIds ?? []);

    if (this.allLabels.length) {
      el.createEl("label", { cls: "kanban-modal-label", text: t("cardModal.labels") });
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

    // Eisenhower quadrant
    el.createEl("label", { cls: "kanban-modal-label", text: t("cardModal.ehCategory") });
    let quadrant: EisenhowerQuadrant | undefined = this.card?.quadrant;
    const qGrid = el.createEl("div", { cls: "kanban-modal-chips" });
    const qChips = new Map<string, HTMLElement>();
    const syncQ = () => {
      qChips.forEach((chip, id) => {
        if (id === (quadrant ?? "none")) chip.addClass("selected");
        else chip.removeClass("selected");
      });
    };
    const addQChip = (id: string, name: string, color: string, hint: string) => {
      const chip = qGrid.createEl("div", { cls: "kanban-modal-chip", attr: { title: hint } });
      chip.style.setProperty("--lc", color);
      chip.createEl("span", { cls: "kanban-chip-dot" });
      chip.createEl("span", { text: name });
      chip.addEventListener("click", () => {
        quadrant = id === "none" ? undefined : (id as EisenhowerQuadrant);
        syncQ();
      });
      qChips.set(id, chip);
    };
    addQChip("none", t("cardModal.none"), "var(--text-faint)", t("cardModal.noneHint"));
    EISENHOWER_QUADRANTS.forEach((q) => addQChip(q.id, q.name, q.color, q.hint));
    syncQ();

    const btns = el.createEl("div", { cls: "kanban-modal-btns" });
    btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: t("common.cancel") }).addEventListener("click", () => this.close());
    const save = btns.createEl("button", { cls: "kb-btn kb-btn-primary", text: this.card ? t("cardModal.save") : t("cardModal.create") });
    save.addEventListener("click", () => {
      const title = titleInput.value.trim();
      if (!title) { new Notice(t("cardModal.needTitle")); return; }
      this.cb(title, descInput.value.trim(), Array.from(selected), quadrant);
      this.close();
    });
    titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") save.click(); });
  }
  onClose() { this.contentEl.empty(); }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class KanbanTodoPlugin extends Plugin {
  settings: KanbanPluginSettings = DEFAULT_SETTINGS;
  /** Path of the board the user last opened — the Eisenhower matrix follows it. */
  lastBoardPath: string | null = null;
  /** Unfinished priority duels per board column, kept in memory until applied or discarded. */
  duelSessions = new Map<string, DuelComparison[]>();

  async onload() {
    await this.loadSettings();
    setLanguage(this.settings.language);

    this.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, this));
    this.registerExtensions(["kanban"], KANBAN_VIEW_TYPE);
    this.registerView(SKILL_CHART_VIEW_TYPE, (leaf) => new KanbanSkillChartView(leaf, this));
    this.registerView(ALL_DONE_VIEW_TYPE, (leaf) => new AllDoneTodosView(leaf, this));
    this.registerView(EISENHOWER_VIEW_TYPE, (leaf) => new EisenhowerMatrixView(leaf, this));

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        const v = leaf?.view;
        if (v instanceof KanbanView && v.file) this.lastBoardPath = v.file.path;
      })
    );

    // Registered once at load: these follow a language change only after Obsidian reloads.
    this.addRibbonIcon("layout-dashboard", t("ribbon.newBoard"), () => this.createBoard());
    this.addRibbonIcon("check-square", t("ribbon.allDone"), () => void this.openView(ALL_DONE_VIEW_TYPE));
    this.addRibbonIcon("activity", t("ribbon.skill"), () => void this.openView(SKILL_CHART_VIEW_TYPE));
    this.addRibbonIcon("layout-grid", t("ribbon.eisenhower"), () => void this.openView(EISENHOWER_VIEW_TYPE));

    this.addCommand({ id: "create-kanban-board", name: t("cmd.newBoard"), callback: () => this.createBoard() });
    this.addCommand({ id: "open-skill-chart", name: t("cmd.openSkill"), callback: () => void this.openView(SKILL_CHART_VIEW_TYPE) });
    this.addCommand({ id: "open-all-done", name: t("cmd.openAllDone"), callback: () => void this.openView(ALL_DONE_VIEW_TYPE) });
    this.addCommand({ id: "open-eisenhower-matrix", name: t("cmd.openEisenhower"), callback: () => void this.openView(EISENHOWER_VIEW_TYPE) });

    this.addSettingTab(new KanbanSettingTab(this.app, this));
  }

  createBoard(): void {
    new InputModal(this.app, t("newBoard.title"), t("newBoard.default"), (name) => {
      const path = `${name}.kanban`;
      if (this.app.vault.getAbstractFileByPath(path)) { new Notice(t("newBoard.exists", { path })); return; }
      void (async () => {
        const file = await this.app.vault.create(path, JSON.stringify(defaultBoard(), null, 2));
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
      })();
    }).open();
  }

  async openView(type: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(type)[0];
    if (existing) { await this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async updateSkillScores(labelIds: string[], delta: number): Promise<void> {
    for (const id of labelIds) {
      this.settings.skillData.scores[id] = Math.max(0, (this.settings.skillData.scores[id] ?? 0) + delta);
    }
    await this.saveSettings();
    this.app.workspace.getLeavesOfType(SKILL_CHART_VIEW_TYPE).forEach((l) => {
      if (l.view instanceof KanbanSkillChartView) l.view.render();
    });
  }

  async refreshAllDoneView(): Promise<void> {
    for (const l of this.app.workspace.getLeavesOfType(ALL_DONE_VIEW_TYPE)) {
      if (l.view instanceof AllDoneTodosView) await l.view.render();
    }
  }

  async refreshEisenhowerView(): Promise<void> {
    for (const l of this.app.workspace.getLeavesOfType(EISENHOWER_VIEW_TYPE)) {
      if (l.view instanceof EisenhowerMatrixView) await l.view.render();
    }
  }

  async loadSettings(): Promise<void> {
    const loaded: Partial<KanbanPluginSettings> = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    if (!this.settings.labels) this.settings.labels = DEFAULT_SETTINGS.labels;
    if (!this.settings.skillData) this.settings.skillData = { scores: {}, snapshots: [] };
    if (!this.settings.skillData.snapshots) this.settings.skillData.snapshots = [];
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  /** Apply a new language and redraw every open view of this plugin. */
  async changeLanguage(language: LanguageSetting): Promise<void> {
    this.settings.language = language;
    setLanguage(language);
    await this.saveSettings();
    for (const leaf of this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE)) {
      if (leaf.view instanceof KanbanView) leaf.view.render();
    }
    this.app.workspace.getLeavesOfType(SKILL_CHART_VIEW_TYPE).forEach((l) => {
      if (l.view instanceof KanbanSkillChartView) l.view.render();
    });
    await this.refreshAllDoneView();
    await this.refreshEisenhowerView();
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const PRESET_COLORS = ["#ef4444","#f97316","#f59e0b","#84cc16","#10b981","#06b6d4","#6366f1","#8b5cf6","#ec4899"];

class KanbanSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: KanbanTodoPlugin) { super(app, plugin); }

  display() {
    const { containerEl: el } = this;
    el.empty();
    el.addClass("kanban-settings");

    new Setting(el)
      .setName(t("settings.language"))
      .setDesc(t("settings.languageDesc"))
      .addDropdown((d) => d
        .addOption("auto", t("settings.languageAuto", { lang: LANGUAGE_NAMES[obsidianLanguage()] }))
        .addOption("en", LANGUAGE_NAMES.en)
        .addOption("de", LANGUAGE_NAMES.de)
        .setValue(this.plugin.settings.language ?? "auto")
        .onChange(async (value) => {
          await this.plugin.changeLanguage(value as LanguageSetting);
          this.display();
        }));

    new Setting(el).setName(t("settings.labels")).setHeading();
    el.createEl("p", { cls: "setting-item-description", text: t("settings.labelsDesc") });
    const list = el.createEl("div", { cls: "kanban-settings-labels" });
    this.renderLabels(list);

    new Setting(el).addButton((b) =>
      b.setButtonText(t("settings.addLabel")).setCta().onClick(() => {
        this.plugin.settings.labels.push({ id: generateId(), name: t("settings.newLabel"), color: PRESET_COLORS[this.plugin.settings.labels.length % PRESET_COLORS.length] });
        void this.plugin.saveSettings();
        this.display();
      })
    );

    new Setting(el).setName(t("settings.skillData")).setHeading();
    new Setting(el)
      .setName(t("settings.reset"))
      .setDesc(t("settings.resetDesc"))
      .addButton((b) => b.setButtonText(t("settings.resetButton")).setWarning().onClick(() => {
        this.plugin.settings.skillData = { scores: {}, snapshots: [] };
        void this.plugin.saveSettings();
        new Notice(t("settings.resetDone"));
      }));
  }

  renderLabels(container: HTMLElement) {
    container.empty();
    this.plugin.settings.labels.forEach((label, idx) => {
      const row = container.createEl("div", { cls: "kanban-settings-row" });

      const colorInput = row.createEl("input", { cls: "kanban-settings-color", attr: { type: "color", value: label.color } });
      colorInput.addEventListener("input", () => {
        label.color = colorInput.value;
        preview.style.setProperty("--lc", label.color);
        void this.plugin.saveSettings();
      });

      const nameInput = row.createEl("input", { cls: "kanban-settings-name", attr: { type: "text", value: label.name } });
      nameInput.addEventListener("change", () => {
        label.name = nameInput.value.trim() || label.name;
        void this.plugin.saveSettings();
      });
      nameInput.addEventListener("input", () => { preview.textContent = nameInput.value || label.name; });

      const preview = row.createEl("span", { cls: "kanban-label-tag", text: label.name });
      preview.style.setProperty("--lc", label.color);

      const del = row.createEl("button", { cls: "kb-icon-btn kb-icon-danger", attr: { title: t("settings.remove") } });
      setIcon(del, "x");
      del.addEventListener("click", () => {
        this.plugin.settings.labels.splice(idx, 1);
        void this.plugin.saveSettings();
        this.display();
      });
    });
  }
}
