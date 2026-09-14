/* ============================================================
   CCA Trainer · candidate key probe
   ------------------------------------------------------------
   A development tool, NOT part of the app. index.html never loads it.

       node tools/probe-key.js CCAR-F d2 "a candidate keyed option" ["another"]

   Pass the domain as `all` to scan the whole track, which is what the gate it
   predicts actually does — see the scope note below.

   Answers one question before a question is written: if this string became a
   keyed option, would any explanation or stem already in the bank give it
   away? `check-explanation-leaks.js` answers that after the fact, by scanning
   what is committed. This answers it while the wording is still a draft.

   Why it exists: during review of the d2 pilot, three separate predictions
   about which conversions would leak were argued from the metric's shape
   rather than measured. One was reported as a 70% collision and turned out to
   depend entirely on wording — the terse phrasing an author would actually
   write fell under the checker's own floor and could not collide at all.
   Reasoning about `shared / kt.size` in your head does not work; the same
   claim scores 0% or 88% depending on words nobody thought were load-bearing.

   It deliberately reuses the tokenizer, sentence splitter, stop list, key-size
   floor and coverage metric of check-explanation-leaks.js, so a number here is
   computed the same way as a number there. Keep the two in step: if that file's
   metric changes, this one has to change with it.

   SCOPE, and this used to be wrong. A single domain argument scans that domain
   only, but `check-explanation-leaks.js` scans the whole track — every item
   against every other, regardless of domain. Measured 2026-09-10: 3 of CCAR-F's
   8 pairs at the 0.6 gate are cross-domain, two of them d4 -> d3. So a domain
   probe can come back clean on a wording the gate will report. Use `all` when
   two domains are being written from one shared corpus, which is exactly when
   the cross-domain collisions get generated.

   A candidate can also be probed as a DISTRACTOR rather than a key, with
   --as-distractor. The question then reverses: not "does an existing sentence
   give my key away" but "does my new distractor restate an existing keyed
   option", which would key the same proposition correct in one item and wrong
   in this one. That axis matters while distractors are being lengthened.

   A hit against an `official` item matters more than the percentage suggests.
   Those items reproduce the guide's own published samples, so a collision can
   only ever be resolved from the other side — reword the candidate, because
   the guide's stem, options and key cannot move.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BANKS = ["questions-architect.js", "questions-associate.js"];
const APP_DIR = path.join(__dirname, "..", "app");
const REPORT_FROM = 0.45; // below this it is token noise; 0.6 is the gate

function loadTracks() {
  const src =
    BANKS.map((f) => fs.readFileSync(path.join(APP_DIR, f), "utf8")).join("\n") +
    "\nout = [EXAM_ARCHITECT, EXAM_ASSOCIATE];";
  const ctx = { out: null };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.out;
}

/* Copied verbatim from check-explanation-leaks.js. Duplicated rather than
   shared because the banks load through `vm` and neither file is a module; a
   divergence here silently makes the two tools disagree, so any edit to one
   belongs in both. */
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

/* --exclude takes bank indices to leave out of the corpus. Needed whenever a
   candidate key belongs to an item being rewritten: the item's current
   explanation is about to be replaced, so a collision with it is not a leak.
   Without this the tool reports the loudest possible false positive, since an
   item's own explanation is the sentence most likely to cover its own key. */
const argv = process.argv.slice(2);
const exclude = new Set();
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--exclude") continue;
  for (const n of (argv[i + 1] || "").split(",")) {
    const idx = Number(n.trim());
    if (!Number.isInteger(idx)) {
      console.error(`--exclude wants bank indices, got "${n.trim()}"`);
      process.exit(2);
    }
    exclude.add(idx);
  }
  argv.splice(i, 2);
  i--;
}

const asDistractor = argv.includes("--as-distractor");
if (asDistractor) argv.splice(argv.indexOf("--as-distractor"), 1);

const [code, domain, ...candidates] = argv;
if (!code || !domain || !candidates.length) {
  console.error('Usage: node tools/probe-key.js CCAR-F d2|all [--exclude 75,83] [--as-distractor] "candidate" ["another"]');
  process.exit(2);
}

const ex = loadTracks().find((t) => t.code === code);
if (!ex) {
  console.error(`No track with code ${code}. Known: ${loadTracks().map((t) => t.code).join(", ")}`);
  process.exit(2);
}

const OFFICIAL_IDX = new Set(
  ex.questions.map((q, i) => (q.official ? i : -1)).filter((i) => i >= 0),
);

const ALL = domain === "all";
if (!ALL && !ex.domains.some((d) => d.id === domain)) {
  console.error(`No domain "${domain}" on ${code}. Known: ${ex.domains.map((d) => d.id).join(", ")}, or "all"`);
  process.exit(2);
}

/* In key mode the corpus is every sentence of every explanation and stem — the
   same text check-explanation-leaks.js scans on its first axis. In distractor
   mode it is every keyed option instead, which is that checker's second axis
   read from the other side. */
const pool = [];
ex.questions.forEach((q, i) => {
  if ((!ALL && q.d !== domain) || exclude.has(i)) return;
  if (asDistractor) {
    const keys = Array.isArray(q.c) ? q.c : [q.c];
    for (const k of keys) pool.push({ i, s: q.a[k] });
  } else {
    for (const s of sentences(`${q.e} ${q.q}`)) pool.push({ i, s });
  }
});

console.log(
  `\n${code} ${ALL ? "all domains" : domain}: ${pool.length} existing ` +
    (asDistractor ? "keyed option(s)" : "sentence(s)") +
    " to test against" +
    (exclude.size ? `, excluding [${[...exclude].sort((a, b) => a - b).join("] [")}]` : "") +
    (ALL ? "" : "  (single domain — the gate scans the whole track; see --help note)") +
    "\n",
);

let worst = 0;
for (const cand of candidates) {
  const kt = words(cand);
  console.log(`"${cand}"`);
  if (kt.size < 4) {
    console.log(`  ${kt.size} content word(s) — under the checker's floor of 4, so it can never`);
    console.log(`  be reported. That is not safety: it means the leak check is blind to this`);
    console.log(`  wording, and a human has to judge it.\n`);
    continue;
  }
  const hits = [];
  for (const { i, s } of pool) {
    const st = words(s);
    /* Key mode measures how much of MY candidate an existing sentence covers,
       so the denominator is my candidate. Distractor mode asks the opposite —
       how much of THEIR key my distractor covers — so the denominator is
       theirs, matching the second axis of check-explanation-leaks.js. */
    if (asDistractor) {
      if (st.size < 4) continue;
      let shared = 0;
      for (const w of st) if (kt.has(w)) shared++;
      const cov = shared / st.size;
      if (cov >= REPORT_FROM) hits.push({ i, s, cov });
    } else {
      if (st.size < 5) continue;
      let shared = 0;
      for (const w of kt) if (st.has(w)) shared++;
      const cov = shared / kt.size;
      if (cov >= REPORT_FROM) hits.push({ i, s, cov });
    }
  }
  hits.sort((a, b) => b.cov - a.cov);
  if (!hits.length) {
    console.log(`  ${kt.size} content words · nothing in ${ALL ? "the track" : domain} reaches ${REPORT_FROM}. Clean.\n`);
    continue;
  }
  console.log(`  ${kt.size} content words · ${hits.length} sentence(s) at or above ${REPORT_FROM}:`);
  for (const h of hits.slice(0, 5)) {
    const flag = OFFICIAL_IDX.has(h.i) ? " OFFICIAL" : "";
    const gate = h.cov >= 0.6 ? "  <-- over the 0.6 gate" : "";
    console.log(`    ${String(Math.round(h.cov * 100)).padStart(3)}%  [${h.i}]${flag}  ${h.s.trim().slice(0, 96)}${gate}`);
    worst = Math.max(worst, h.cov);
  }
  if (hits.length > 5) console.log(`    … and ${hits.length - 5} more below these`);
  console.log("");
}

/* Exit non-zero when a candidate would be reported by the leak check, so this
   can gate a draft the same way the validator gates a commit. */
if (worst >= 0.6) {
  console.log("At least one candidate would be reported at the 0.6 gate. Reword it.\n");
  process.exit(1);
}
