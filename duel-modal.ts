// ─── Priority duel: modal UI ──────────────────────────────────────────────────
//
// Two cards side by side, pick the one that should come first. The ranking model
// lives in duel-ranker.ts; this file only draws it and collects votes. Nothing is
// written to the board until the user applies the result on the review screen.

import { App, Modal, setIcon } from "obsidian";
import type { EisenhowerQuadrantDef, KanbanCard, KanbanLabel } from "./main";
import { DuelComparison, DuelRanker, DuelVerdict, pairKey, rolling } from "./duel-ranker";
import { t, tp, TranslationKey } from "./i18n";

export interface DuelModalOptions {
  columnName: string;
  /** Snapshot of the column's cards in their current order. */
  cards: KanbanCard[];
  labels: KanbanLabel[];
  quadrantDef: (id?: string) => EisenhowerQuadrantDef | undefined;
  /** Comparisons from an unfinished earlier session on this column. */
  resume: DuelComparison[];
  /** Cards added since the last applied duel; their position says nothing yet. */
  unplaced: Set<string>;
  /** True if the column's current order came out of an earlier duel. */
  trustedOrder: boolean;
  /** Called after every vote and on close, so an accidental Esc loses nothing. */
  onProgress: (comps: DuelComparison[]) => void;
  onApply: (orderedIds: string[]) => void;
  onDiscard: () => void;
}

/** Explanation entry: translation key prefix; "<prefix>.term" and "<prefix>.text" must exist. */
type HelpItem = "settled" | "cards" | "equal" | "skip" | "undo" | "chips" | "why" | "review"
  | "line" | "band" | "bars" | "numbers" | "stop" | "order" | "dot" | "ci" | "delta"
  | "was" | "apply" | "keep" | "discard";

type Side = "L" | "R" | "T";

function svg(parent: Element, tag: keyof SVGElementTagNameMap, attrs: Record<string, string | number> = {}): SVGElement {
  return parent.createSvg(tag, { attr: attrs });
}

export function verdictText(v: DuelVerdict): string {
  switch (v.state) {
    case "ready": return t("verdict.ready", { top: v.top, held: v.held });
    case "start": return t("verdict.start");
    case "uncovered": return tp("verdict.uncovered", v.count);
    case "placing": return tp("verdict.placing", v.count);
    case "justChanged": return t("verdict.justChanged", { top: v.top, window: v.window });
    default: return t("verdict.holding", { top: v.top, held: v.held, window: v.window });
  }
}

export class PriorityDuelModal extends Modal {
  private ranker: DuelRanker;
  private readonly cards: Map<string, KanbanCard>;
  private current: { a: string; b: string; bits: number } | null = null;
  private skipped = new Set<string>();
  private phase: "duel" | "review" = "duel";
  private busy = false;
  /** Set once the result was applied or discarded, so onClose does not re-save it. */
  private finished = false;
  private resumedCount: number;
  private confirmDiscard = false;
  /** Explanation boxes the user has expanded ("?" buttons). Collapsed by default. */
  private openHelp = new Set<string>();

  constructor(app: App, private readonly opts: DuelModalOptions) {
    super(app);
    this.cards = new Map(opts.cards.map((c) => [c.id, c] as [string, KanbanCard]));
    this.ranker = this.makeRanker(opts.resume);
    this.resumedCount = this.ranker.comps.length;
  }

  private makeRanker(comps: DuelComparison[]): DuelRanker {
    return new DuelRanker(
      this.opts.cards.map((c) => c.id),
      comps.map((c) => Object.assign({}, c)),
      { unplaced: this.opts.unplaced, trustedOrder: this.opts.trustedOrder }
    );
  }

  onOpen(): void {
    this.modalEl.addClass("kb-duel-modal");
    this.contentEl.addClass("kb-duel");
    const bind = (key: string, fn: () => void) =>
      this.scope.register([], key, () => { fn(); return false; });
    bind("ArrowLeft", () => this.phase === "duel" && this.vote("L"));
    bind("ArrowRight", () => this.phase === "duel" && this.vote("R"));
    bind("ArrowDown", () => this.phase === "duel" && this.vote("T"));
    bind("Backspace", () => (this.phase === "duel" ? this.undo() : this.showPhase("duel")));
    bind("z", () => this.phase === "duel" && this.undo());
    bind("s", () => this.phase === "duel" && this.skip());
    bind("Enter", () => (this.phase === "duel" ? this.showPhase("review") : this.apply()));
    this.render();
  }

  onClose(): void {
    if (!this.finished) this.opts.onProgress(this.ranker.comps.slice());
    this.contentEl.empty();
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private vote(side: Side): void {
    if (this.busy || !this.current) return;
    const { a, b } = this.current;
    this.ranker.vote(a, b, side === "L" ? 1 : side === "R" ? 0 : 0.5);
    this.skipped.clear();
    this.opts.onProgress(this.ranker.comps.slice());

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (side !== "T" && !reduce) {
      // Brief win/lose flash before the next pair: the "game" feedback.
      this.busy = true;
      this.contentEl.querySelectorAll(".kb-duel-card").forEach((el) =>
        el.addClass(el.getAttribute("data-side") === side ? "is-win" : "is-lose")
      );
      window.setTimeout(() => { this.busy = false; this.current = null; this.render(); }, 170);
    } else {
      this.current = null;
      this.render();
    }
  }

  private undo(): void {
    if (this.busy) return;
    const last = this.ranker.undo();
    if (!last) return;
    this.opts.onProgress(this.ranker.comps.slice());
    const ia = this.ranker.indexOf(last.a), ib = this.ranker.indexOf(last.b);
    this.current = { a: last.a, b: last.b, bits: this.ranker.pairBits(ia, ib) };
    this.render();
  }

  private skip(): void {
    if (this.busy || !this.current || this.ranker.size < 3) return;
    this.skipped.add(pairKey(this.current.a, this.current.b));
    this.current = null;
    this.render();
  }

  private startOver(): void {
    this.ranker = this.makeRanker([]);
    this.resumedCount = 0;
    this.current = null;
    this.skipped.clear();
    this.opts.onProgress([]);
    this.render();
  }

  /** Small "?" button that expands or collapses the explanation box with the same key. */
  private helpButton(parent: HTMLElement, key: string): void {
    const open = this.openHelp.has(key);
    const btn = parent.createEl("button", {
      cls: "kb-duel-help-btn" + (open ? " is-open" : ""),
      attr: { title: open ? t("duel.helpHide") : t("duel.helpShow"), "aria-expanded": String(open) },
    });
    setIcon(btn, "help-circle");
    if (!btn.querySelector("svg")) btn.setText("?");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (open) this.openHelp.delete(key); else this.openHelp.add(key);
      this.render();
    });
  }

  /** Explanation box, drawn only while its "?" button is expanded. */
  private help(parent: HTMLElement, key: string, intro: string, items: HelpItem[] = [], vars?: Record<string, number>): void {
    if (!this.openHelp.has(key)) return;
    const box = parent.createDiv({ cls: "kb-duel-help" });
    if (intro) box.createDiv({ cls: "kb-duel-help-intro", text: intro });
    if (!items.length) return;
    const dl = box.createEl("dl");
    for (const item of items) {
      dl.createEl("dt", { text: t(`help.${item}.term` as TranslationKey) });
      dl.createEl("dd", { text: t(`help.${item}.text` as TranslationKey, vars) });
    }
  }

  private showPhase(phase: "duel" | "review"): void {
    this.phase = phase;
    this.confirmDiscard = false;
    this.render();
  }

  private apply(): void {
    this.finished = true;
    this.opts.onApply(this.ranker.order().map((i) => this.ranker.ids[i]));
    this.close();
  }

  private discard(): void {
    if (!this.confirmDiscard) { this.confirmDiscard = true; this.render(); return; }
    this.finished = true;
    this.opts.onDiscard();
    this.close();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private render(): void {
    const el = this.contentEl;
    el.empty();
    if (this.phase === "duel") this.renderDuel(el);
    else this.renderReview(el);
  }

  private renderHeader(el: HTMLElement, title: string, sub: string, helpKey: string): void {
    const head = el.createDiv({ cls: "kb-duel-head" });
    const titles = head.createDiv({ cls: "kb-duel-titles" });
    const titleRow = titles.createDiv({ cls: "kb-duel-titlerow" });
    titleRow.createEl("h3", { cls: "kb-duel-title", text: title });
    this.helpButton(titleRow, helpKey);
    titles.createDiv({ cls: "kb-duel-sub", text: sub });

    const verdict = this.ranker.assess();
    if (!verdict) return;
    const meter = head.createDiv({ cls: "kb-duel-meter" + (verdict.ready ? " is-ready" : "") });
    const label = meter.createDiv({ cls: "kb-duel-meter-label" });
    label.createSpan({ text: t("duel.settled") });
    label.createSpan({ cls: "kb-duel-meter-pct", text: `${Math.round(verdict.progress * 100)}%` });
    const bar = meter.createDiv({ cls: "kb-duel-meter-bar" });
    bar.createDiv({ cls: "kb-duel-meter-fill" }).style.width = `${Math.round(verdict.progress * 100)}%`;
    meter.setAttr("title", t("duel.meterTitle"));
  }

  private renderDuel(el: HTMLElement): void {
    const n = this.ranker.size;
    this.renderHeader(el, t("duel.title", { name: this.opts.columnName }), t("duel.sub", { n }), "intro");
    if (!this.current) this.current = this.ranker.nextPair(this.skipped);
    const cur = this.current;
    if (!cur) return;

    this.help(el, "intro", t("help.intro"), ["settled"], { top: this.ranker.topCount() });

    const grid = el.createDiv({ cls: "kb-duel-grid" });
    const main = grid.createDiv({ cls: "kb-duel-main" });

    const arena = main.createDiv({ cls: "kb-duel-panel kb-duel-arena" });
    const q = arena.createDiv({ cls: "kb-duel-q" });
    q.createSpan({ text: t("duel.question") });
    this.helpButton(q, "arena");
    const versus = arena.createDiv({ cls: "kb-duel-versus" });
    this.renderContender(versus, cur.a, "L", "←");
    const mid = versus.createDiv({ cls: "kb-duel-mid" });
    mid.createSpan({ cls: "kb-duel-or", text: t("duel.or") });
    const tie = mid.createEl("button", { cls: "kb-btn kb-btn-ghost kb-duel-tie", attr: { title: t("duel.equalTitle") } });
    tie.createSpan({ text: t("duel.equal") });
    tie.createEl("kbd", { text: "↓" });
    tie.addEventListener("click", () => this.vote("T"));
    this.renderContender(versus, cur.b, "R", "→");

    const comps = this.ranker.comps;
    const verdict = this.ranker.assess();
    const actions = arena.createDiv({ cls: "kb-duel-actions" });
    const left = actions.createDiv({ cls: "kb-duel-actions-left" });
    const undoBtn = left.createEl("button", { cls: "kb-btn kb-btn-ghost", text: t("duel.undo"), attr: { title: t("duel.undoTitle") } });
    undoBtn.disabled = comps.length === 0;
    undoBtn.addEventListener("click", () => this.undo());
    const skipBtn = left.createEl("button", { cls: "kb-btn kb-btn-ghost", text: t("duel.skip"), attr: { title: t("duel.skipTitle") } });
    skipBtn.disabled = n < 3;
    skipBtn.addEventListener("click", () => this.skip());
    const review = actions.createEl("button", { cls: "kb-btn " + (verdict?.ready ? "kb-btn-primary" : "kb-btn-ghost") });
    review.createSpan({ text: t("duel.review") });
    review.createEl("kbd", { text: "↵" });
    review.addEventListener("click", () => this.showPhase("review"));

    const foot = arena.createDiv({ cls: "kb-duel-foot" });
    foot.createSpan({ text: tp("duel.foot", comps.length, { cards: n, guide: this.ranker.guide() }) });
    if (this.resumedCount > 0) {
      foot.createSpan({ text: " " + tp("duel.resumed", this.resumedCount) + " " });
      const again = foot.createEl("button", { cls: "kb-duel-link", text: t("duel.startOver") });
      again.addEventListener("click", () => this.startOver());
    }

    this.help(arena, "arena", "", ["cards", "equal", "skip", "undo", "chips", "why", "review"]);

    this.renderGain(main, cur.bits, verdict);
    this.renderRanklist(grid.createDiv({ cls: "kb-duel-panel kb-duel-ranks" }), cur);
  }

  private renderChips(parent: HTMLElement, card: KanbanCard): void {
    const q = this.opts.quadrantDef(card.quadrant);
    const labels = this.opts.labels.filter((l) => card.labelIds?.includes(l.id));
    const isNew = this.opts.unplaced.has(card.id);
    if (!q && !labels.length && !isNew) return;
    const row = parent.createSpan({ cls: "kb-duel-chips" });
    if (isNew) row.createSpan({ cls: "kanban-label-tag kb-duel-new", text: t("duel.newChip") });
    if (q) {
      const tag = row.createSpan({ cls: "kanban-label-tag kanban-eh-tag", text: q.name, attr: { title: t("card.ehTitle", { hint: q.hint }) } });
      tag.style.setProperty("--lc", q.color);
    }
    labels.forEach((l) => {
      const tag = row.createSpan({ cls: "kanban-label-tag", text: l.name });
      tag.style.setProperty("--lc", l.color);
    });
  }

  private renderContender(parent: HTMLElement, id: string, side: Side, key: string): void {
    const card = this.cards.get(id);
    if (!card) return;
    const btn = parent.createEl("button", { cls: "kb-duel-card", attr: { "data-side": side, "aria-label": t("duel.cardAria", { title: card.title }) } });
    btn.createSpan({ cls: "kb-duel-card-title", text: card.title });
    if (card.description) btn.createSpan({ cls: "kb-duel-card-desc", text: card.description });
    const foot = btn.createSpan({ cls: "kb-duel-card-foot" });
    this.renderChips(foot, card);
    foot.createEl("kbd", { text: key });
    btn.addEventListener("click", () => this.vote(side));
  }

  /** Information gain per duel (line + 5-duel mean) and rank movement (bars), as in Priomap. */
  private renderGain(parent: HTMLElement, nextBits: number, verdict: DuelVerdict | null): void {
    const comps = this.ranker.comps;
    const panel = parent.createDiv({ cls: "kb-duel-panel kb-duel-gain" });
    const head = panel.createDiv({ cls: "kb-duel-gain-head" });
    const gainTitle = head.createDiv({ cls: "kb-duel-titlerow" });
    gainTitle.createEl("h4", { text: t("duel.gainTitle") });
    this.helpButton(gainTitle, "gain");
    const legend = head.createDiv({ cls: "kb-duel-legend" });
    const lg = (cls: string, text: string) => { const s = legend.createSpan(); s.createSpan({ cls }); s.createSpan({ text }); };
    lg("kb-sw-line", t("duel.legendLine"));
    lg("kb-sw-avg", t("duel.legendAvg"));
    lg("kb-sw-bar", t("duel.legendBar"));
    this.help(panel, "gain", t("help.gain.intro"), ["line", "band", "bars", "numbers", "stop"]);

    const bits = comps.map((c) => c.bits), moved = comps.map((c) => c.moved);
    const avg = rolling(bits, 5);
    const lastMoved = moved.slice(-10);
    const stats = panel.createDiv({ cls: "kb-duel-stats" });
    const stat = (value: string, label: string) => { const d = stats.createDiv(); d.createEl("b", { text: value }); d.createSpan({ text: label }); };
    stat(String(comps.length), t("duel.statDuels"));
    stat(nextBits.toFixed(2), t("duel.statBits"));
    stat(lastMoved.length ? (lastMoved.reduce((a, b) => a + b, 0) / lastMoved.length).toFixed(1) : "–", t("duel.statMoved"));

    const W = 560, H = 150, pl = 30, pr = 30, pt = 8, pb = 22;
    const N = Math.max(10, bits.length);
    const maxB = Math.max(0.3, ...bits) * 1.1, maxM = Math.max(4, ...moved) * 1.1;
    const inset = Math.max(4, ((W - pl - pr) / N) * 0.4);
    const x = (i: number) => pl + inset + (N <= 1 ? 0 : i / (N - 1)) * (W - pl - pr - 2 * inset);
    const yb = (v: number) => pt + (1 - v / maxB) * (H - pt - pb);
    const ym = (v: number) => pt + (1 - v / maxM) * (H - pt - pb);
    const bw = Math.max(1.5, ((W - pl - pr) / N) * 0.55);

    const root = svg(panel, "svg", { viewBox: `0 0 ${W} ${H}`, class: "kb-duel-chart", role: "img", "aria-label": t("duel.chartAria") });
    for (let k = 0; k <= 4; k++) {
      const y = pt + (k / 4) * (H - pt - pb);
      svg(root, "line", { x1: pl, x2: W - pr, y1: y, y2: y, class: "kb-c-grid" });
      svg(root, "text", { x: pl - 5, y: y + 3, "text-anchor": "end", class: "kb-c-tick" }).textContent = (maxB * (1 - k / 4)).toFixed(2);
      svg(root, "text", { x: W - pr + 5, y: y + 3, class: "kb-c-tick" }).textContent = String(Math.round(maxM * (1 - k / 4)));
    }
    moved.forEach((m, i) => svg(root, "rect", { x: x(i) - bw / 2, y: ym(m), width: bw, height: H - pb - ym(m), class: "kb-c-bar" }));
    if (bits.length) {
      svg(root, "polyline", { points: avg.map((v, i) => `${x(i)},${yb(v)}`).join(" "), class: "kb-c-avg" });
      svg(root, "polyline", { points: bits.map((v, i) => `${x(i)},${yb(v)}`).join(" "), class: "kb-c-line" });
      const li = bits.length - 1;
      svg(root, "circle", { cx: x(li), cy: yb(bits[li]), r: 3.5, class: "kb-c-dot" });
    } else {
      svg(root, "text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "kb-c-empty" }).textContent = t("duel.chartEmpty");
    }
    svg(root, "text", { x: pl, y: H - 6, class: "kb-c-tick" }).textContent = "1";
    svg(root, "text", { x: W - pr, y: H - 6, "text-anchor": "end", class: "kb-c-tick" }).textContent = String(N);

    if (verdict) panel.createDiv({ cls: "kb-duel-verdict" + (verdict.ready ? " is-ready" : ""), text: verdictText(verdict) });
  }

  private renderDelta(parent: HTMLElement, id: string, newPos: number): void {
    if (this.opts.unplaced.has(id)) { parent.createSpan({ cls: "kb-duel-delta is-new", text: t("duel.newDelta") }); return; }
    const delta = this.ranker.indexOf(id) - newPos;
    const d = parent.createSpan({ cls: "kb-duel-delta" + (delta > 0 ? " is-up" : delta < 0 ? " is-down" : "") });
    d.setText(delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : "–");
    d.setAttr("title", delta === 0 ? t("duel.deltaSame") : delta > 0 ? tp("duel.deltaUp", delta) : tp("duel.deltaDown", -delta));
  }

  /** Current order: score dot with ±2 SD line, change against the column. */
  private renderRanklist(panel: HTMLElement, cur: { a: string; b: string }): void {
    const rankTitle = panel.createDiv({ cls: "kb-duel-titlerow" });
    rankTitle.createEl("h4", { text: t("duel.ranksTitle") });
    this.helpButton(rankTitle, "ranks");
    panel.createDiv({ cls: "kb-duel-hint", text: t("duel.ranksHint") });
    this.help(panel, "ranks", "", ["order", "dot", "ci", "delta"]);
    const { theta, sd } = this.ranker.fit();
    const order = this.ranker.order();
    const lo = Math.min(...order.map((i) => theta[i] - 2 * sd[i]));
    const hi = Math.max(...order.map((i) => theta[i] + 2 * sd[i]));
    const sx = (v: number) => ((v - lo) / (hi - lo || 1)) * 52 + 4;
    const list = panel.createEl("ol", { cls: "kb-duel-ranklist" });
    order.forEach((i, pos) => {
      const id = this.ranker.ids[i];
      const card = this.cards.get(id);
      const li = list.createEl("li", { cls: id === cur.a || id === cur.b ? "is-hot" : "" });
      li.createSpan({ cls: "kb-duel-rk", text: String(pos + 1) });
      li.createSpan({ cls: "kb-duel-nm", text: card?.title ?? "", attr: { title: card?.title ?? "" } });
      this.renderDelta(li, id, pos);
      const spark = svg(li, "svg", { viewBox: "0 0 60 12", width: 60, height: 12, "aria-hidden": "true" });
      svg(spark, "line", { x1: sx(theta[i] - 2 * sd[i]), x2: sx(theta[i] + 2 * sd[i]), y1: 6, y2: 6, class: "kb-c-ci" });
      svg(spark, "circle", { cx: sx(theta[i]), cy: 6, r: 3.5, class: "kb-c-dot" });
    });
  }

  private renderReview(el: HTMLElement): void {
    const order = this.ranker.order();
    const moved = order.filter((i, pos) => i !== pos).length;
    const verdict = this.ranker.assess();
    // "9 of 9 changed" is true but useless when one card jumps to the top and pushes
    // the rest down by one, so describe the change by direction instead.
    const isNew = (i: number) => this.opts.unplaced.has(this.ranker.ids[i]);
    const placedNew = order.filter((i) => isNew(i)).length;
    const up = order.filter((i, pos) => !isNew(i) && i > pos).length;
    const down = order.filter((i, pos) => !isNew(i) && i < pos).length;
    const parts: string[] = [];
    if (placedNew) parts.push(tp("duel.reviewNew", placedNew));
    if (up) parts.push(t("duel.reviewUp", { n: up }));
    if (down) parts.push(t("duel.reviewDown", { n: down }));
    this.renderHeader(
      el,
      t("duel.reviewTitle"),
      parts.length ? t("duel.reviewSummary", { parts: parts.join(" · "), name: this.opts.columnName }) : t("duel.reviewConfirms"),
      "review"
    );

    const panel = el.createDiv({ cls: "kb-duel-panel kb-duel-review" });
    this.help(panel, "review", t("help.reviewIntro"), ["was", "apply", "keep", "discard"]);
    if (verdict && !verdict.ready) {
      panel.createDiv({ cls: "kb-duel-verdict", text: t("duel.reviewNotSettled") });
    }
    const list = panel.createEl("ol", { cls: "kb-duel-review-list" });
    order.forEach((i, pos) => {
      const id = this.ranker.ids[i];
      const card = this.cards.get(id);
      if (!card) return;
      const li = list.createEl("li", { cls: i === pos && !this.opts.unplaced.has(id) ? "is-same" : "" });
      li.createSpan({ cls: "kb-duel-rk", text: String(pos + 1) });
      const body = li.createSpan({ cls: "kb-duel-review-body" });
      body.createSpan({ cls: "kb-duel-review-title", text: card.title });
      this.renderChips(body, card);
      li.createSpan({ cls: "kb-duel-was", text: t("duel.was", { n: i + 1 }) });
      this.renderDelta(li, id, pos);
    });

    const btns = el.createDiv({ cls: "kb-duel-review-btns" });
    const discard = btns.createEl("button", {
      cls: "kb-btn kb-btn-danger",
      text: this.confirmDiscard ? t("duel.discardConfirm") : t("duel.discard"),
    });
    discard.addEventListener("click", () => this.discard());
    btns.createDiv({ cls: "kb-duel-spacer" });
    const back = btns.createEl("button", { cls: "kb-btn kb-btn-ghost", text: t("duel.keepDuelling") });
    back.addEventListener("click", () => this.showPhase("duel"));
    const apply = btns.createEl("button", { cls: "kb-btn kb-btn-primary" });
    apply.createSpan({ text: moved ? t("duel.apply") : t("duel.confirm") });
    apply.createEl("kbd", { text: "↵" });
    apply.addEventListener("click", () => this.apply());
    apply.focus();
  }
}
