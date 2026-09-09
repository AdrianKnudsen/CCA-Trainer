/* ============================================================
   CCA Trainer · explanation leak check
   ------------------------------------------------------------
   A development tool, NOT part of the app. index.html never loads it.

       node tools/check-explanation-leaks.js [threshold]

   Run it AFTER `node docs/drafts/assemble.js`. It reads the built banks in
   app/, and the Associate bank is generated from the drafts, so running it
   before a rebuild scans the previous text.

   Why this exists: an explanation is free text, so it can state, as a helpful
   aside, the exact fact that is another item's keyed answer. A candidate who
   gets that item wrong then reads the answer to an item they have not met yet.
   Text-similarity checks on question stems do not see it, and neither does
   check-drafts.js — the first instance found was a "note this is a different
   question from…" sentence at the end of an a3 explanation that gave away an
   a5 key.

   Corpus: app/questions-architect.js and app/questions-associate.js, each
   track scanned only against itself. It reads the banks rather than
   docs/drafts/ for two reasons. The five early-block questions exist only in
   the bank, so a drafts-only scan could never see them — that blind spot hid
   two real hits. And the Architect bank has no drafts at all, so it was never
   checked by anything.

   Per-track scanning is also the cross-track partition. Comparing across
   tracks is meaningless: a candidate sits one exam, so an Architect
   explanation cannot spoil an Associate item.

   How it works: every sentence of every explanation and stem is compared
   against every keyed option in every other item of the same track, measuring
   what share of the key's content words appear in that sentence. Default
   threshold 0.6. Lower it to ~0.45 to catch paraphrase and read the hits by
   hand: most short keys collide on generic words (conversation, claude,
   answer) while testing an unrelated fact, so this is a review aid and not a
   gate. It exits 0 always, for that reason.

   A hit is reported by bank index, because the bank is the corpus — but for
   the Associate track the fix belongs in docs/drafts/, since the bank is
   regenerated. The stem prefix printed with each hit is there to grep for.

   Two Associate hits are known and expected; see TODO.md for why neither can
   be rewritten away. Anything else on that track is a regression.

   Pair with `node tools/row-aliases.js`: two rows that are the same Anthropic
   sentence under different ids are where a leak is most likely to be
   invisible.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BANKS = ["questions-architect.js", "questions-associate.js"];
const APP_DIR = path.join(__dirname, "..", "app");
const THRESHOLD = Number(process.argv[2] || 0.6);

/* The banks are plain <script> files that declare top-level `const`s for the
   browser. A top-level `const` in a vm script lives in lexical scope rather
   than on the context object, so the files are concatenated with an epilogue
   that hands the descriptors back out — the same trick validate-questions.js
   uses. Note that `ex.items` is the exam's length (60), not the questions;
   the array is `ex.questions`. */
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

const STOP = new Set(
  ("the a an and or of to in is are it its that this those these you your not but with for on as be been" +
   " can could will would has have had do does did if when where which who whom what how why they them" +
   " their there here also only more most other another some any every all no nor so than then thus into" +
   " onto from about across over under out up down off same each both few many much such own very just" +
   " now once while unless until because since").split(" "),
);
const words = (t) =>
  new Set(
    t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)),
  );
const sentences = (t) => t.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 25);
const short = (t) => (t || "").replace(/\s+/g, " ").slice(0, 70);

let total = 0;
for (const ex of loadTracks()) {
  const items = ex.questions.map((q, i) => ({
    at: `${ex.code}[${i}] ${q.d}`,
    q,
    keys: (Array.isArray(q.c) ? q.c : [q.c]).map((k) => q.a[k]),
  }));

  let hits = 0;
  items.forEach((mine, mi) => {
    for (const sentence of sentences(`${mine.q.e} ${mine.q.q}`)) {
      const st = words(sentence);
      if (st.size < 5) continue;
      items.forEach((other, oi) => {
        if (oi === mi) return;
        for (const key of other.keys) {
          const kt = words(key);
          if (kt.size < 4) continue;
          let shared = 0;
          for (const w of kt) if (st.has(w)) shared++;
          const cov = shared / kt.size;
          if (cov >= THRESHOLD) {
            hits++;
            total++;
            console.log(`\n${mine.at} -> ${other.at}   ${Math.round(cov * 100)}% of that key's content words`);
            console.log(`  leaking item: ${short(mine.q.q)}`);
            console.log(`  sentence:     ${sentence.trim().slice(0, 160)}`);
            console.log(`  target item:  ${short(other.q.q)}`);
            console.log(`  their key:    ${key.slice(0, 160)}`);
          }
        }
      });
    }
  });
  console.log(`\n${ex.code}: ${hits} pair(s) at or above ${THRESHOLD}`);
}

console.log(
  total
    ? `\nRead each one; token noise is common below 0.6.\n`
    : `\nNo explanation or stem restates another item's keyed answer (threshold ${THRESHOLD}).\n`,
);
