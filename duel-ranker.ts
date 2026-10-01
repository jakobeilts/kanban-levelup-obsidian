// ─── Priority duel: ranking model ─────────────────────────────────────────────
//
// Pure logic, no Obsidian imports, so it can be tested in plain Node.
//
// Every card gets a latent "priority score" θ. A duel between a and b is modelled
// as Bradley–Terry: P(a wins) = 1 / (1 + e^-(θa − θb)). Scores are the MAP estimate
// under a Normal prior whose MEAN comes from the card's current position in the
// column. So the existing order counts as weak evidence: with no duels at all the
// result equals the current order, and every duel only moves cards where you
// actually disagree with it. That is what makes stopping early safe.
//
// The next pair is the one whose outcome is expected to reveal the most (in bits)
// about the scores, the same idea Priomap uses.

export interface DuelComparison {
  /** Card id shown on the left. */
  a: string;
  /** Card id shown on the right. */
  b: string;
  /** 1 = a should come first, 0 = b should come first, 0.5 = equal. */
  s: number;
  /** Expected information gain of this pair at the moment it was shown (bits). */
  bits: number;
  /** Sum of rank changes this vote caused across all cards. */
  moved: number;
  /** Whether this vote changed the order of the top cards (see `topCount`). */
  topChanged: boolean;
}

export interface DuelFit {
  /** Score per card (logit scale), indexed like `ids`. */
  theta: number[];
  /** Posterior standard deviation per card (Laplace approximation). */
  sd: number[];
}

export interface DuelVerdict {
  /** True once more duels are unlikely to change the top of the list. */
  ready: boolean;
  /** 0..1, for a progress meter. */
  progress: number;
  /** Which message applies; the UI turns it into text in the user's language. */
  state: "ready" | "start" | "uncovered" | "placing" | "justChanged" | "holding";
  /** Cards not yet in a duel (state "uncovered") or new cards still being placed ("placing"). */
  count: number;
  /** How many top cards the rule watches. */
  top: number;
  /** Duels in a row the top has kept its order. */
  held: number;
  /** Duels in a row it needs to keep its order. */
  window: number;
}

/** Logit gap between the top and the bottom placed card in the prior. */
const PRIOR_SPAN = 2;
/** Prior SD of a placed card around its position-based mean, when the order came
 *  out of an earlier duel (trusted) or was arranged by hand (loose). Tuned by
 *  simulation: tighter keeps a good order stable under occasional inconsistent
 *  answers, looser lets a badly ordered column be rebuilt faster. */
const PRIOR_SD_TRUSTED = 0.8;
const PRIOR_SD_LOOSE = 1.2;
/** Prior SD of an unplaced card (added since the last duel). It starts in the middle
 *  and wide open, so the first duels go to finding its spot — roughly a binary
 *  search instead of a slow climb from the bottom. */
const UNPLACED_SD = 2.5;

export interface DuelPriorOptions {
  /** Card ids whose position carries no information (added since the last duel). */
  unplaced?: Set<string>;
  /** True if the placed cards' order came out of an earlier duel. */
  trustedOrder?: boolean;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clampP = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));
/** Glicko-style attenuation: an uncertain opponent tells you less. */
const g = (variance: number) => 1 / Math.sqrt(1 + (3 * variance) / (Math.PI * Math.PI));

export const pairKey = (a: string, b: string): string => (a < b ? a + "|" + b : b + "|" + a);

export class DuelRanker {
  /** Card ids in their current column order (position 1 first). */
  readonly ids: string[];
  readonly comps: DuelComparison[];
  private readonly index: Map<string, number>;
  private readonly mu: number[];
  private readonly prec: number[];
  private readonly unplaced: Set<string>;
  private cache: DuelFit | null = null;
  private warm: number[] | null = null;

  /**
   * @param ids      card ids in current column order
   * @param comps    comparisons to resume from
   * @param prior    which cards are unplaced and how much to trust the current order
   */
  constructor(ids: string[], comps: DuelComparison[] = [], prior: DuelPriorOptions = {}) {
    const unplaced = prior.unplaced ?? new Set<string>();
    this.unplaced = new Set(Array.from(unplaced).filter((id) => ids.indexOf(id) >= 0));
    const placedSd = prior.trustedOrder ? PRIOR_SD_TRUSTED : PRIOR_SD_LOOSE;
    this.ids = ids.slice();
    this.index = new Map(this.ids.map((id, i) => [id, i] as [string, number]));
    const placed = this.ids.filter((id) => !unplaced.has(id));
    const m = placed.length;
    const placedPos = new Map(placed.map((id, i) => [id, i] as [string, number]));
    this.mu = this.ids.map((id) => {
      const p = placedPos.get(id);
      return p === undefined || m < 2 ? 0 : PRIOR_SPAN * (0.5 - p / (m - 1));
    });
    this.prec = this.ids.map((id) => 1 / Math.pow(placedPos.has(id) ? placedSd : UNPLACED_SD, 2));
    // Comparisons from an earlier session may mention cards that have since left the column.
    this.comps = comps.filter((c) => c.a !== c.b && this.index.has(c.a) && this.index.has(c.b));
  }

  get size(): number { return this.ids.length; }

  indexOf(id: string): number { return this.index.get(id) ?? -1; }

  fit(): DuelFit {
    if (this.cache) return this.cache;
    const n = this.ids.length;
    const pairs = this.comps.map((c) => ({ a: this.index.get(c.a) as number, b: this.index.get(c.b) as number, s: c.s }));
    const th = this.warm && this.warm.length === n ? this.warm.slice() : this.mu.slice();

    const sweep = () => {
      const grad = th.map((t, i) => -(t - this.mu[i]) * this.prec[i]);
      const hess = this.prec.slice();
      for (const k of pairs) {
        const p = sigmoid(th[k.a] - th[k.b]);
        const d = k.s - p;
        const w = p * (1 - p);
        grad[k.a] += d; grad[k.b] -= d;
        hess[k.a] += w; hess[k.b] += w;
      }
      return { grad, hess };
    };

    // Diagonal Newton steps. The prior keeps the problem strictly concave, so this
    // converges quickly, and warm-starting from the last fit makes it near-instant.
    for (let it = 0; it < 200; it++) {
      const { grad, hess } = sweep();
      let maxStep = 0;
      for (let i = 0; i < n; i++) {
        const step = Math.max(-2, Math.min(2, grad[i] / hess[i]));
        th[i] += step;
        maxStep = Math.max(maxStep, Math.abs(step));
      }
      if (maxStep < 1e-7) break;
    }
    this.warm = th.slice();
    const { hess } = sweep();
    this.cache = { theta: th, sd: hess.map((h) => 1 / Math.sqrt(h)) };
    return this.cache;
  }

  /** Card indices from highest to lowest priority. Ties keep the current order. */
  order(): number[] {
    const { theta } = this.fit();
    return this.ids.map((_, i) => i).sort((a, b) => theta[b] - theta[a] || a - b);
  }

  /** 1-based rank per card index. */
  ranks(): number[] {
    const out = new Array<number>(this.ids.length);
    this.order().forEach((i, pos) => (out[i] = pos + 1));
    return out;
  }

  /** Expected information gain (bits) from showing cards i and j. */
  pairBits(i: number, j: number): number {
    const { theta, sd } = this.fit();
    const vi = sd[i] * sd[i], vj = sd[j] * sd[j];
    const gi = g(vj), gj = g(vi);
    const pi = clampP(sigmoid(gi * (theta[i] - theta[j])));
    const pj = clampP(sigmoid(gj * (theta[j] - theta[i])));
    return 0.5 * Math.log2(1 + vi * gi * gi * pi * (1 - pi)) + 0.5 * Math.log2(1 + vj * gj * gj * pj * (1 - pj));
  }

  /**
   * The most informative pair, avoiding the last few pairs and anything skipped.
   * Returns card ids with a random left/right placement so position does not bias the choice.
   */
  nextPair(skipped: Set<string> = new Set(), rand: () => number = Math.random): { a: string; b: string; bits: number } | null {
    const n = this.ids.length;
    if (n < 2) return null;
    const recentCount = Math.min(6, Math.floor(n / 3));
    const recent = new Set(this.comps.slice(this.comps.length - recentCount).map((c) => pairKey(c.a, c.b)));
    if (recentCount === 0) recent.clear();
    let best: [number, number] | null = null, bestV = -1;
    let fallback: [number, number] = [0, 1], fallbackV = -1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        // A little jitter so near-identical pairs do not always resolve the same way.
        const v = this.pairBits(i, j) * (1 + rand() * 0.03);
        if (v > fallbackV) { fallbackV = v; fallback = [i, j]; }
        const key = pairKey(this.ids[i], this.ids[j]);
        if (recent.has(key) || skipped.has(key)) continue;
        if (v > bestV) { bestV = v; best = [i, j]; }
      }
    }
    const [i, j] = best ?? fallback;
    const bits = this.pairBits(i, j);
    return rand() < 0.5 ? { a: this.ids[i], b: this.ids[j], bits } : { a: this.ids[j], b: this.ids[i], bits };
  }

  /** Record a duel result and return the stored comparison. */
  vote(a: string, b: string, s: number): DuelComparison {
    const ia = this.indexOf(a), ib = this.indexOf(b);
    if (ia < 0 || ib < 0 || ia === ib) throw new Error("Unknown card in duel");
    const bits = this.pairBits(ia, ib);
    const before = this.ranks();
    const topBefore = this.order().slice(0, this.topCount()).join();
    const comp: DuelComparison = { a, b, s, bits: Math.round(bits * 1e4) / 1e4, moved: 0, topChanged: false };
    this.comps.push(comp);
    this.cache = null;
    const after = this.ranks();
    comp.moved = before.reduce((sum, r, i) => sum + Math.abs(r - after[i]), 0);
    comp.topChanged = this.order().slice(0, this.topCount()).join() !== topBefore;
    return comp;
  }

  undo(): DuelComparison | undefined {
    const last = this.comps.pop();
    if (last) this.cache = null;
    return last;
  }

  /** Rough upper bound for a fully stable order without any prior: n·log2(n). */
  guide(): number {
    const n = this.ids.length;
    return n < 2 ? 0 : Math.round(n * Math.log2(n));
  }

  /** How many cards at the top the stopping rule watches. Position 1 is what you work
   *  on next, so the top matters far more than the order deep in the backlog. */
  topCount(): number {
    return Math.min(5, Math.max(2, Math.ceil(this.ids.length / 3)));
  }

  /**
   * Plain-language read of whether more duels are still worth it.
   *
   * Ready when every card has been in at least one duel, every new card has had
   * enough duels to find its spot, and the top cards have kept their order for
   * several duels in a row. Calibrated by simulation with a 5 % inconsistent-answer
   * rate: position 1 ends up right in ~90–100 % of runs, after roughly half of
   * n·log2(n) duels (fewer when the column was already in good shape).
   */
  assess(): DuelVerdict | null {
    const n = this.ids.length, k = this.comps.length;
    if (n < 2) return null;
    const window = n <= 3 ? n - 1 : Math.max(4, Math.ceil(n / 3));
    const need = Math.max(2, Math.ceil(Math.log2(n)) - 1);
    const counts = new Map<string, number>();
    for (const c of this.comps) {
      counts.set(c.a, (counts.get(c.a) ?? 0) + 1);
      counts.set(c.b, (counts.get(c.b) ?? 0) + 1);
    }
    const uncovered = this.ids.filter((id) => !counts.get(id)).length;
    const unplaced = Array.from(this.unplaced);
    const placing = unplaced.filter((id) => (counts.get(id) ?? 0) < need).length;
    let held = 0;
    for (let i = k - 1; i >= 0 && !this.comps[i].topChanged; i--) held++;
    const minDuels = Math.ceil(n / 2);

    const coverage = 1 - uncovered / n;
    const placed = unplaced.length
      ? unplaced.reduce((sum, id) => sum + Math.min(1, (counts.get(id) ?? 0) / need), 0) / unplaced.length
      : 1;
    const stability = Math.min(1, held / window) * Math.min(1, k / minDuels);
    const progress = Math.min(1, 0.3 * coverage + 0.2 * placed + 0.5 * stability);
    const top = this.topCount();
    const verdict = (state: DuelVerdict["state"], count = 0): DuelVerdict =>
      ({ ready: state === "ready", progress: state === "ready" ? 1 : progress, state, count, top, held, window });

    if (uncovered === 0 && placing === 0 && held >= window && k >= minDuels) return verdict("ready");
    if (k === 0) return verdict("start");
    if (uncovered > 0) return verdict("uncovered", uncovered);
    if (placing > 0) return verdict("placing", placing);
    return verdict(held === 0 ? "justChanged" : "holding");
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Rolling mean over the last `k` values at every position. */
export function rolling(xs: number[], k: number): number[] {
  return xs.map((_, i) => mean(xs.slice(Math.max(0, i - k + 1), i + 1)));
}
