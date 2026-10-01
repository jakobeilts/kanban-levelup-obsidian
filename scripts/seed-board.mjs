#!/usr/bin/env node
/**
 * Development helper — generates a .kanban board full of test data.
 *
 * NOT part of the plugin. Nothing here is bundled into main.js; this file only
 * writes a plain JSON file into a vault so the board and the Eisenhower matrix
 * can be eyeballed with realistic amounts of content.
 *
 *   node scripts/seed-board.mjs --vault ~/Documents/Obsidian/Vaults/Jakob
 *   node scripts/seed-board.mjs --vault <path> --cards 200 --name "Stress test"
 *   node scripts/seed-board.mjs --vault <path> --sparse
 *
 * Options:
 *   --vault <path>   Vault root. Falls back to $KANBAN_TEST_VAULT.
 *   --name <name>    Board file name without extension. Default "Test board".
 *   --cards <n>      Roughly how many cards to generate. Default 60.
 *   --sparse         Leave "Delegate" and "Eliminate" empty, to check empty states.
 *   --force          Overwrite an existing board file.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PLUGIN_ID = "kanban-level-up";
const QUADRANTS = ["do", "schedule", "delegate", "eliminate"];

// ─── args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { name: "Test board", cards: 60, sparse: false, force: false, vault: process.env.KANBAN_TEST_VAULT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--vault") out.vault = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--cards") out.cards = Number(argv[++i]);
    else if (a === "--sparse") out.sparse = true;
    else if (a === "--force") out.force = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else die(`Unknown option: ${a}`);
  }
  return out;
}

function die(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

function expand(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : path.resolve(p);
}

// ─── deterministic randomness, so repeated runs are comparable ────────────────

let seed = 1337;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function chance(p) { return rnd() < p; }
function genId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36);
}

// ─── content pools ────────────────────────────────────────────────────────────

const VERBS = ["Fix", "Refactor", "Review", "Draft", "Ship", "Investigate", "Migrate", "Document", "Rename", "Benchmark", "Delete", "Split", "Merge", "Automate", "Debug"];
const NOUNS = ["the login flow", "the export pipeline", "the settings modal", "the drag handler", "the sync job", "the label picker", "the archive rule", "the radar chart", "the board loader", "the card modal", "the CI cache", "the release notes", "the onboarding copy", "the error boundary", "the date parser"];
const DETAILS = [
  "Reported twice this week, worth a closer look.",
  "Blocked until the API change lands.",
  "Small, but it keeps coming back.",
  "Needs a decision before anything gets built.",
  "",
  "",
  "Someone asked about this in the issue tracker.",
  "Half done already — the rest is cleanup.",
];

const DAY = 24 * 60 * 60 * 1000;

// ─── labels ───────────────────────────────────────────────────────────────────

/** Real label ids live in the plugin's data.json. Without it, cards get no labels. */
function readLabelIds(vault) {
  const p = path.join(vault, ".obsidian", "plugins", PLUGIN_ID, "data.json");
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    const ids = (data.labels ?? []).map((l) => l.id);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

// ─── card + board building ────────────────────────────────────────────────────

function makeCard(labelIds, quadrant, opts = {}) {
  const card = {
    id: genId(),
    title: opts.title ?? `${pick(VERBS)} ${pick(NOUNS)}`,
    createdAt: Date.now() - Math.floor(rnd() * 60) * DAY,
  };
  const desc = opts.description ?? pick(DETAILS);
  if (desc) card.description = desc;

  if (labelIds && opts.labelIds !== null) {
    if (opts.labelIds) card.labelIds = opts.labelIds;
    else if (chance(0.65)) {
      const n = chance(0.25) ? 2 : 1;
      const chosen = new Set();
      while (chosen.size < Math.min(n, labelIds.length)) chosen.add(pick(labelIds));
      card.labelIds = [...chosen];
    }
  }
  if (quadrant) card.quadrant = quadrant;
  if (opts.completedAt) card.completedAt = opts.completedAt;
  return card;
}

/** Cards that have broken layouts before: extreme lengths, every label, bare minimum. */
function edgeCaseCards(labelIds) {
  return [
    makeCard(labelIds, "do", {
      title: "Sehr langer Titel, der prüfen soll ob die Karte umbricht statt zu überlaufen — inklusive einesSehrLangenWortesOhneLeerzeichenDasNirgendwoUmbrechenKann",
      description: "Und eine Beschreibung, die deutlich über zwei Zeilen geht, damit sichtbar wird ob die Kürzung per line-clamp greift oder ob die Karte in die Höhe wächst und den Quadranten sprengt.",
      labelIds: labelIds ?? undefined,
    }),
    makeCard(labelIds, "schedule", { title: "Kurz", description: "", labelIds: null }),
    makeCard(labelIds, "delegate", { title: "Emoji & Sonderzeichen: 🚀 <script> & \"quotes\" 'apostrophe'", description: "" }),
    makeCard(labelIds, "eliminate", { title: "Karte ganz ohne Label und ohne Beschreibung", labelIds: null }),
  ];
}

function buildBoard({ cards: total, sparse, labelIds }) {
  const now = Date.now();

  const columns = [
    { id: genId(), name: "Backlog", cards: [], color: "#6366f1" },
    { id: genId(), name: "In progress", cards: [], color: "#f59e0b" },
    { id: genId(), name: "Review", cards: [], color: "#06b6d4" },
    { id: genId(), name: "Done", cards: [], color: "#10b981", isDone: true },
  ];
  const [backlog, inProgress, review, done] = columns;
  const openCols = [backlog, inProgress, review];

  const activeQuadrants = sparse ? ["do", "schedule"] : QUADRANTS;

  // ~20% land in Done, ~20% of the rest stay uncategorised.
  const doneCount = Math.max(6, Math.round(total * 0.2));
  const openCount = Math.max(1, total - doneCount);

  for (let i = 0; i < openCount; i++) {
    const quadrant = chance(0.2) ? undefined : pick(activeQuadrants);
    pick(openCols).cards.push(makeCard(labelIds, quadrant));
  }

  // Spread completions over 14 days: anything older than 7 is auto-archived,
  // so both the visible and the hidden case get exercised.
  for (let i = 0; i < doneCount; i++) {
    const completedAt = now - Math.floor(rnd() * 14 * DAY);
    done.cards.push(makeCard(labelIds, chance(0.5) ? pick(QUADRANTS) : undefined, { completedAt }));
  }

  for (const c of edgeCaseCards(labelIds)) {
    if (sparse && (c.quadrant === "delegate" || c.quadrant === "eliminate")) delete c.quadrant;
    pick(openCols).cards.push(c);
  }

  return { columns };
}

// ─── main ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, ""));
  process.exit(0);
}
if (!args.vault) die("No vault given. Use --vault <path> or set KANBAN_TEST_VAULT.");
if (!Number.isFinite(args.cards) || args.cards < 1) die("--cards must be a positive number.");

const vault = expand(args.vault);
if (!fs.existsSync(path.join(vault, ".obsidian"))) {
  die(`"${vault}" does not look like a vault — no .obsidian folder inside.`);
}

const labelIds = readLabelIds(vault);
if (!labelIds) {
  console.warn("! No data.json with labels found — cards are generated without labels.");
  console.warn("  Enable the plugin in this vault once, then re-run to get labelled cards.");
}

const board = buildBoard({ cards: args.cards, sparse: args.sparse, labelIds });
const target = path.join(vault, `${args.name}.kanban`);

if (fs.existsSync(target) && !args.force) {
  die(`"${args.name}.kanban" already exists. Pass --force to overwrite.`);
}
fs.writeFileSync(target, JSON.stringify(board, null, 2));

// ─── report ───────────────────────────────────────────────────────────────────

const all = board.columns.flatMap((c) => c.cards.map((card) => ({ card, col: c })));
const open = all.filter((e) => !e.col.isDone);
const byQuadrant = Object.fromEntries(
  QUADRANTS.map((q) => [q, open.filter((e) => e.card.quadrant === q).length])
);
const archived = all.filter((e) => e.col.isDone && Date.now() - e.card.completedAt > 7 * DAY).length;

console.log(`✓ Wrote ${target}`);
console.log(`  ${all.length} cards across ${board.columns.length} columns`);
console.log(`  open: ${open.length}  ·  done: ${all.length - open.length} (${archived} of them auto-archived, older than 7 days)`);
console.log(`  matrix: ${Object.entries(byQuadrant).map(([q, n]) => `${q}=${n}`).join("  ")}  ·  uncategorised=${open.filter((e) => !e.card.quadrant).length}`);
console.log("");
console.log("  Note: skill chart scores live in data.json and are only written when a card is");
console.log("  moved into a Done column at runtime. Seeded Done cards therefore show up in");
console.log("  'All done todos' but do not raise the chart.");
