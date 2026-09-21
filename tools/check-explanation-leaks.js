/* Finds explanations or stems that give away another item's keyed answer —
   and, as a second axis, distractors that restate another item's key. Dev
   tool; the app never loads it.

   node tools/check-explanation-leaks.js [threshold]

   Each track (app/questions-architect.js, app/questions-associate.js) is
   scanned only against itself, since a candidate sits one exam and cross-track
   similarity is meaningless. It compares every sentence of every explanation
   and stem against every keyed option elsewhere in the same track, by the
   share of the key's content words the sentence contains (default threshold
   0.6; lower it to ~0.45 to catch paraphrase, but expect noise from short keys
   colliding on generic words). Reports only, exits 0 always — read the hits.

   Two Associate hits are known and expected; see TODO.md for why neither can
   be rewritten away. Anything else on that track is a regression.

   Pair with `node tools/row-aliases.js`: two research rows quoting the same
   sentence under different ids are where a leak is most likely to be
   invisible. */

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

  /* Second axis: a DISTRACTOR that restates another item's keyed option —
     worse than an explanation leak, since the same proposition ends up keyed
     CORRECT in one item and WRONG in another, so learning the first item makes
     the second wrong. Reported separately so the pair count above stays
     comparable across runs; those numbers are recorded baselines in TODO.md.

     It matters most while distractors are being rewritten: lengthening a
     distractor is new text, and new text can collide. */
  let dhits = 0;
  items.forEach((mine, mi) => {
    const keyIdx = Array.isArray(mine.q.c) ? mine.q.c : [mine.q.c];
    mine.q.a.forEach((opt, j) => {
      if (keyIdx.includes(j)) return;
      const dt = words(opt);
      if (dt.size < 4) return;
      items.forEach((other, oi) => {
        if (oi === mi) return;
        for (const key of other.keys) {
          const kt = words(key);
          if (kt.size < 4) continue;
          let shared = 0;
          for (const w of kt) if (dt.has(w)) shared++;
          const cov = shared / kt.size;
          if (cov >= THRESHOLD) {
            dhits++;
            total++;
            console.log(`\n${mine.at} option ${j} -> ${other.at} key   ${Math.round(cov * 100)}% of that key's content words`);
            console.log(`  distractor:  ${opt.slice(0, 160)}`);
            console.log(`  their key:   ${key.slice(0, 160)}`);
            console.log(`  their item:  ${short(other.q.q)}`);
          }
        }
      });
    });
  });
  console.log(`${ex.code}: ${dhits} distractor(s) restating another item's key at or above ${THRESHOLD}`);
}

console.log(
  total
    ? `\nRead each one; token noise is common below 0.6.\n`
    : `\nNo explanation or stem restates another item's keyed answer (threshold ${THRESHOLD}).\n`,
);
