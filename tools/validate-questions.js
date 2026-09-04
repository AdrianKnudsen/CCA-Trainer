/* ============================================================
   CCA Trainer · question bank validator
   ------------------------------------------------------------
   A development tool, NOT part of the app. index.html never loads this;
   it runs under Node from anywhere:

       node tools/validate-questions.js

   Two jobs:

   1. Catch structural typos in the banks — an answer index pointing past
      the end of the options, a domain id that doesn't exist on that track,
      duplicate option text, a missing explanation. These are invisible when
      you read a question but they break it, and there are hundreds of
      questions to get wrong.

   2. Report each track's question distribution against its real exam
      weights. This is the part that can't be done by eye: writing a bank
      that matches 14/21/12/16/12/15/10 across 150 questions means knowing,
      repeatedly, which domain is short and by how much.

   Exits non-zero if anything structural is wrong, so it can gate a commit.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BANKS = ["questions-architect.js", "questions-associate.js"];
// The banks live in app/, one directory up from this tool.
const APP_DIR = path.join(__dirname, "..", "app");

/* The banks are plain <script> files that declare top-level `const`s for the
   browser. A top-level `const` in a vm script lives in lexical scope rather
   than on the context object, so the files are concatenated with an epilogue
   that hands the descriptors back out — the same way the browser ends up with
   both of them as globals. */
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

function checkQuestion(ex, q, i, domainIds, problems) {
  const at = `${ex.code}[${i}]`;
  const say = (msg) => problems.push(`${at}: ${msg}`);

  if (!domainIds.has(q.d)) {
    say(`domain "${q.d}" doesn't exist on this track`);
    return; // everything else is unreliable once the domain is wrong
  }
  if (!Array.isArray(q.a) || q.a.length < 2) {
    say("needs at least 2 options");
    return;
  }
  if (new Set(q.a).size !== q.a.length) say("two options have identical text");
  if (q.a.some((o) => typeof o !== "string" || !o.trim())) say("has a blank option");

  const correct = Array.isArray(q.c) ? q.c : [q.c];
  if (correct.length === 0) say("has no correct answer");
  if (new Set(correct).size !== correct.length) say("lists the same correct answer twice");
  correct.forEach((c) => {
    if (!Number.isInteger(c) || c < 0 || c >= q.a.length)
      say(`correct answer ${c} is outside the ${q.a.length} options`);
  });
  // A multiple-response item where every option is correct tests nothing.
  if (Array.isArray(q.c) && correct.length >= q.a.length)
    say("marks every option correct");

  if (!q.q || !q.q.trim()) say("has no question text");
  if (!q.e || q.e.trim().length < 20) say("has no real explanation");

  // Scenarios: a reference must resolve, and a track whose guide describes no
  // scenarios must not have any.
  if (q.sc) {
    if (!ex.scenarios) say(`references scenario "${q.sc}" but this track has none`);
    else if (!ex.scenarios[q.sc]) say(`references unknown scenario "${q.sc}"`);
  }
}

/* How many questions each domain should hold to keep a weighted draw honest.
   An exam sim draws `items` by weight, so a domain needs at least its share of
   that; below it the sampler runs out and silently under-fills the domain. The
   "short by" column is therefore the minimum still to write, not a target — a
   bank at exactly the minimum repeats itself completely on a second run. */
function report(ex) {
  const domainIds = new Set(ex.domains.map((d) => d.id));
  const problems = [];
  ex.questions.forEach((q, i) => checkQuestion(ex, q, i, domainIds, problems));

  const counts = {};
  ex.domains.forEach((d) => (counts[d.id] = 0));
  ex.questions.forEach((q) => {
    if (counts[q.d] !== undefined) counts[q.d]++;
  });

  const weightSum = ex.domains.reduce((a, d) => a + d.weight, 0);
  const multi = ex.questions.filter((q) => Array.isArray(q.c)).length;
  const total = ex.questions.length;

  console.log(`\n${ex.credential}  (${ex.code})`);
  console.log(
    `  ${total} questions · ${multi} multiple-response (${total ? Math.round((100 * multi) / total) : 0}%) · weights sum ${weightSum}${weightSum === 100 ? "" : "  <-- should be 100"}`,
  );
  console.log("  domain           weight   have   exam draw   short by");
  ex.domains.forEach((d) => {
    const draw = Math.max(1, Math.round((ex.items * d.weight) / 100));
    const have = counts[d.id];
    const short = Math.max(0, draw - have);
    console.log(
      `  ${d.short.slice(0, 15).padEnd(15)}  ${String(d.weight).padStart(4)}%  ${String(have).padStart(5)}  ${String(draw).padStart(9)}  ${short ? String(short).padStart(8) : "        ·"}`,
    );
  });

  if (problems.length) {
    console.log("");
    problems.forEach((p) => console.log(`  PROBLEM  ${p}`));
  }
  return problems.length;
}

const tracks = loadTracks();
const bad = tracks.reduce((a, ex) => a + report(ex), 0);
console.log(
  bad ? `\n${bad} structural problem(s) found.\n` : "\nNo structural problems.\n",
);
process.exit(bad ? 1 : 0);
