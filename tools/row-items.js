/* Finds research rows whose objective cell names two or more bank items — the
   sibling of row-aliases.js, which finds two rows carrying one fact; this finds
   one row carrying two, which is a research inventory stating outright that a
   sourced fact was keyed twice.

   node tools/row-items.js [CODE]

   Silent about any inventory with no item references at all — that means the
   bookkeeping was never written, not that the domain is clean. Reports only,
   exit 0: the classification leans on the wording of a human note, which is a
   heuristic and must not be able to block anything. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RESEARCH = path.join(__dirname, "..", "docs", "research");
const BANKS = ["questions-architect.js", "questions-associate.js"];
const APP_DIR = path.join(__dirname, "..", "app");

/* Same row shape and the same guide-path allowance as `row-aliases.js`: a row
   whose authority IS the exam guide cites a file path rather than a URL, and
   requiring a URL drops most of the guide-only material silently. */
const ROW = /^\|\s*((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2,3})\s*\|\s*(.+?)\s*\|\s*(https?:\/\/[^\s|]+|[^\s|]+\.md)\s*\|\s*(.*?)\s*\|/;
const trackOf = (id) => (id.startsWith("AR") ? "CCAR-F" : "CCAO-F");
const ONLY = process.argv[2] || null;

/* Wording that turns a multi-item row into something other than a duplicate
   claim. Deliberately narrow: a word that merely appears near the reference is
   not enough, so these are the phrases the inventories actually use. */
const SUPPLIES_DISTRACTORS = /distractor/i;
const SEPARATES = /separat|distinguish|finer than|is not the same|differs from/i;

function loadTracks() {
  const missing = BANKS.filter((f) => !fs.existsSync(path.join(APP_DIR, f)));
  if (missing.length) {
    console.error(`Can't find ${missing.join(", ")} in ${APP_DIR}`);
    process.exit(2);
  }
  const src =
    BANKS.map((f) => fs.readFileSync(path.join(APP_DIR, f), "utf8")).join("\n") +
    "\nout = [EXAM_ARCHITECT, EXAM_ASSOCIATE];";
  const ctx = { out: null };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.out;
}

/* Which item indices are official is read from the bank, never from the note.
   The note's own word is then cross-checked against it, because a note calling
   an item official when the bank does not is bookkeeping drift and is exactly
   the kind of thing this file is for. */
const officialByTrack = new Map();
/* What each item cites, so a row's claim can be checked against it. An item with
   no `src` maps to null, which means "cannot contradict" rather than "cites
   nothing" — most of the bank is still unsourced. */
const srcByTrack = new Map();
for (const ex of loadTracks()) {
  officialByTrack.set(
    ex.code,
    new Set(ex.questions.map((q, i) => (q.official ? i : -1)).filter((i) => i >= 0))
  );
  srcByTrack.set(
    ex.code,
    ex.questions.map((q) => {
      const ids = [...String(q.src || "").matchAll(/\b((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2,3})\b/g)].map((m) => m[1]);
      return ids.length ? new Set(ids) : null;
    })
  );
}

const rows = [];
const filesSeen = new Map();
for (const f of fs.readdirSync(RESEARCH).filter((f) => f.endsWith(".md"))) {
  if (f.startsWith("pressure-test")) continue; // reports quote rows, it does not define them
  fs.readFileSync(path.join(RESEARCH, f), "utf8")
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(ROW);
      if (!m) return;
      const id = m[1];
      const track = trackOf(id);
      if (ONLY && track !== ONLY) return;
      const objective = m[4] || "";
      const items = [...new Set([...objective.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1])))];
      if (!filesSeen.has(f)) filesSeen.set(f, { track, withRefs: 0, total: 0 });
      const seen = filesSeen.get(f);
      seen.total++;
      if (items.length) seen.withRefs++;
      if (items.length >= 2) rows.push({ id, track, objective, items, file: f, line: i + 1 });
    });
}

const corroborated = new Map(); // "track a-b" -> rows naming that pair
const competes = [];
const noted = [];
const drift = [];

for (const r of rows) {
  const official = officialByTrack.get(r.track) || new Set();
  const plain = r.items.filter((i) => !official.has(i));
  const off = r.items.filter((i) => official.has(i));

  /* Does the note's own wording agree with the bank about what is official?
     The word has to sit IMMEDIATELY before the reference — "Backs `[81]`,
     official `[122]`, `[125]`" qualifies only `[122]`, so slack that let
     "official" reach across the comma would wrongly credit the next item too. */
  for (const i of r.items) {
    const calledOfficial = new RegExp(`official\\s+\`?\\[${i}\\]`, "i").test(r.objective);
    if (calledOfficial !== official.has(i))
      drift.push(`${r.id} (${r.file}:${r.line}): the note ${calledOfficial ? "calls" : "does not call"} [${i}] official, the bank ${official.has(i) ? "does" : "does not"}`);
  }

  if (SUPPLIES_DISTRACTORS.test(r.objective) || SEPARATES.test(r.objective)) {
    noted.push(r);
    continue;
  }
  // A row naming a guide sample beside a non-official item competes rather than
  // duplicates: the sample is frozen, so the non-official side is the slot.
  for (const o of off) for (const p of plain) competes.push({ ...r, official: o, slot: p });

  const srcs = srcByTrack.get(r.track) || [];
  /* An item contradicts the row only if it cites rows and this is not one. */
  const stale = r.items.filter((i) => srcs[i] && !srcs[i].has(r.id));

  for (let a = 0; a < plain.length; a++)
    for (let b = a + 1; b < plain.length; b++) {
      const key = `${r.track} [${plain[a]}] / [${plain[b]}]`;
      if (!corroborated.has(key)) corroborated.set(key, []);
      // A row naming exactly two items is the duplicate tell; three or more is
      // citing shared background rather than keying one fact twice.
      const bucket =
        r.items.length > 2 ? "background" : stale.length ? "stale" : "live";
      corroborated.get(key).push({ ...r, bucket, stale });
    }
}

/* A pair is as strong as its strongest row: one live row makes it live, however
   many background rows also mention it. */
const rank = { live: 0, stale: 1, background: 2 };
const pairs = [...corroborated.entries()]
  .map(([key, rs]) => [key, rs, rs.map((r) => rank[r.bucket]).sort()[0]])
  .sort((x, y) => x[2] - y[2] || y[1].length - x[1].length);

const show = (label, rows) => {
  console.log(`  ${label}  ${rows.length > 1 ? "" : `${rows[0].id} ${rows[0].file}:${rows[0].line} — ${rows[0].objective}`}`);
  if (rows.length > 1)
    rows.forEach((r) => console.log(`                  ${r.id} ${r.file}:${r.line} — ${r.objective}`));
};

console.log(`\n${rows.length} row(s) name two or more bank items${ONLY ? ` in ${ONLY}` : ""}`);

const live = pairs.filter(([, , b]) => b === 0);
if (live.length) {
  console.log(`\n  ${live.length} LIVE duplicate candidate(s) — a row naming exactly two items, neither of`);
  console.log(`  which contradicts it. THIS IS THE LIST TO ACT ON. A pair named by two separate`);
  console.log(`  rows is the strongest form: the inventory said it twice, independently.`);
  for (const [key, rs] of live) show(`${rs.length > 1 ? "CORROBORATED" : "CANDIDATE   "}  ${key}`, rs);
}

const stalePairs = pairs.filter(([, , b]) => b === 1);
if (stalePairs.length) {
  console.log(`\n  ${stalePairs.length} pair(s) whose row is STALE: an item it claims to back cites different`);
  console.log(`  rows, so it was rewritten and the note was never updated. Fix the note, and do`);
  console.log(`  not spend a replacement slot on these without reading the items first:`);
  for (const [key, rs] of stalePairs)
    console.log(`  STALE         ${key}  ${rs[0].id} claims [${rs[0].stale.join("], [")}], which cite(s) elsewhere`);
}

const background = pairs.filter(([, , b]) => b === 2);
if (background.length) {
  console.log(`\n  ${background.length} pair(s) from a row naming THREE OR MORE items, which is background the`);
  console.log(`  items share rather than one fact keyed twice — historically a weak signal:`);
  for (const [key, rs] of background)
    console.log(`  BACKGROUND    ${key}  ${rs[0].id} names ${rs[0].items.length} items`);
}

if (competes.length) {
  console.log(`\n  ${competes.length} row(s) name a guide sample beside a non-official item. The sample is`);
  console.log(`  frozen, so the non-official side is the replacement slot, never the sample:`);
  competes.forEach((c) =>
    console.log(`  COMPETES      official [${c.official}] vs [${c.slot}]  ${c.id} ${c.file}:${c.line}`)
  );
}

if (noted.length) {
  console.log(`\n  ${noted.length} multi-item row(s) that are NOT duplicate claims — they supply`);
  console.log(`  distractors to several items, or record what tells two items apart:`);
  noted.forEach((r) => console.log(`  NOTED         ${r.id} ${r.file}:${r.line} — ${r.objective}`));
}

if (drift.length) {
  console.log(`\n  ${drift.length} note(s) disagree with the bank about which item is official:`);
  drift.forEach((d) => console.log(`  DRIFT         ${d}`));
}

/* An inventory with no item references is not a clean one; it is one where this
   tell was never written down, and saying so is the difference between a silent
   pass and a real result. */
const silent = [...filesSeen.entries()].filter(([, v]) => v.withRefs === 0);
if (silent.length) {
  const verb = silent.length === 1 ? "inventory carries" : "inventories carry";
  console.log(`\n  ${silent.length} ${verb} no item references at all, so this tool is`);
  console.log(`  silent about them — the bookkeeping was never written, not verified clean:`);
  silent.forEach(([f, v]) => console.log(`  NO-BOOKKEEPING  ${f} (${v.total} rows, ${v.track})`));
}

console.log("");
