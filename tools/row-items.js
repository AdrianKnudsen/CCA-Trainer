/* ============================================================
   CCA Trainer · the bookkeeping tell
   ------------------------------------------------------------
   A development tool, NOT part of the app. index.html never loads it.

       node tools/row-items.js [CODE]

   The sibling of `row-aliases.js`, and the other half of one defect.
   `row-aliases.js` finds TWO ROWS carrying ONE FACT. This finds ONE ROW
   carrying TWO BANK ITEMS — a research row whose objective cell says it backs
   `[32]` and `[63]` is stating outright that one sourced fact is keyed twice.

   Why it is worth a tool. The `[32]`/`[63]` duplicate pair survived every
   similarity check in the repo and was found only by a by-hand read of 151
   items, because the two stems share almost no wording: one asks for the
   prescription and the other for the mechanism. But `AR5-04` and `AR5-06` both
   end "Backs `[32]`, `[63]`", so the inventory had been saying so in writing the
   whole time. The same tell exposed `AR5-19`/`AR5-22` and `AR5-65`/`AR5-69`.
   Grepping for it costs nothing next to the read.

   THREE CLASSES, AND ONLY ONE OF THEM IS A DUPLICATE. Measured 2026-09-15: 26
   rows name two or more items, and a flat count of them is misleading, so they
   are reported apart:

   A row naming two NON-OFFICIAL items is the duplicate candidate. When two
   different rows name the same pair, that is the strongest form — the inventory
   has said it twice, independently.

   A row naming an OFFICIAL item beside a non-official one is the
   official-sample competition class instead. The guide's twelve samples are
   frozen, so the finding is never "these two duplicate" but "the non-official
   side is the replacement slot" — a different action, which is why it is not
   mixed in with the above.

   A row that says it backs the DISTRACTORS in two items, or that it SEPARATES
   them, is not a finding at all. One fact can legitimately supply distractors to
   several items, and `AR2-24` exists precisely to record what tells `[80]` and
   official `[123]` apart. These are listed rather than dropped, because a
   suppressed line is indistinguishable from a line the tool cannot see.

   WHAT ABSENCE MEANS. `d3` and every Associate inventory carry no item
   references at all, so this tool is silent about them — silent because the
   bookkeeping was never written, not because the domain is clean. Files with no
   references are named for that reason.

   Reports only, exit 0. The classification leans on the wording of a human note,
   which is a heuristic, and a heuristic must not be able to block anything.
   ============================================================ */

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
for (const ex of loadTracks())
  officialByTrack.set(
    ex.code,
    new Set(ex.questions.map((q, i) => (q.official ? i : -1)).filter((i) => i >= 0))
  );

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
     The word has to sit IMMEDIATELY before the reference. A first draft allowed
     20 characters of slack and reported three rows that were perfectly correct:
     "Backs `[81]`, official `[122]`, `[125]`" qualifies only `[122]`, and the
     slack let "official" reach across the comma to the next two. */
  for (const i of r.items) {
    const calledOfficial = new RegExp(`official\\s+\`?\\[${i}\\]`, "i").test(r.objective);
    if (calledOfficial !== official.has(i))
      drift.push(`${r.id} (${r.file}:${r.line}): the note ${calledOfficial ? "calls" : "does not call"} [${i}] official, the bank ${official.has(i) ? "does" : "does not"}`);
  }

  if (SUPPLIES_DISTRACTORS.test(r.objective) || SEPARATES.test(r.objective)) {
    noted.push(r);
    continue;
  }
  for (const o of off) for (const p of plain) competes.push({ ...r, official: o, slot: p });
  for (let a = 0; a < plain.length; a++)
    for (let b = a + 1; b < plain.length; b++) {
      const key = `${r.track} [${plain[a]}] / [${plain[b]}]`;
      if (!corroborated.has(key)) corroborated.set(key, []);
      corroborated.get(key).push(r);
    }
}

const pairs = [...corroborated.entries()].sort((x, y) => y[1].length - x[1].length);
const strong = pairs.filter(([, rs]) => rs.length >= 2);
const single = pairs.filter(([, rs]) => rs.length === 1);

console.log(`\n${rows.length} row(s) name two or more bank items${ONLY ? ` in ${ONLY}` : ""}`);

if (strong.length) {
  console.log(`\n  ${strong.length} item pair(s) named together by MORE THAN ONE row — the inventory`);
  console.log(`  says these duplicate, twice and independently:`);
  for (const [key, rs] of strong) {
    console.log(`  CORROBORATED  ${key}`);
    rs.forEach((r) => console.log(`                  ${r.id} ${r.file}:${r.line} — ${r.objective}`));
  }
}

if (single.length) {
  console.log(`\n  ${single.length} item pair(s) named together by one row — duplicate candidates:`);
  for (const [key, rs] of single)
    console.log(`  CANDIDATE     ${key}  ${rs[0].id} ${rs[0].file}:${rs[0].line} — ${rs[0].objective}`);
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
