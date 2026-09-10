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
// The research notes live in docs/, which is gitignored. Every check that reads
// them degrades to a notice rather than a failure when the directory is absent,
// so a fresh clone still validates.
const RESEARCH_DIR = path.join(__dirname, "..", "docs", "research");

/* Domains whose every question must cite a research row that actually exists.
   Declared per track and per domain rather than globally, because sourcing was
   retrofitted one domain at a time: 126 of the 151 Architect questions carry no
   `src` at all and must not fail the build while their inventory is unwritten.
   Add a domain here only once its inventory is complete. */
const SOURCED_DOMAINS = {
  "CCAO-F": ["a1", "a2", "a3", "a4", "a5", "a6", "a7"],
  "CCAR-F": ["d2"],
};

/* Every research row id defined anywhere in the notes. Two namespaces coexist:
   Associate's `D1-`…`D7-`, `D7X-`, `PRE-` and `BR-`, and Architect's `AR<n>-`
   where <n> is the app domain. A `src` naming an id that resolves nowhere means
   the question cites a source that does not exist. */
function knownRowIds() {
  const ids = new Set();
  if (!fs.existsSync(RESEARCH_DIR)) return null;
  for (const f of fs.readdirSync(RESEARCH_DIR)) {
    if (!f.endsWith(".md")) continue;
    const txt = fs.readFileSync(path.join(RESEARCH_DIR, f), "utf8");
    for (const m of txt.matchAll(/\b((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2})\b/g)) ids.add(m[1]);
  }
  return ids;
}

/* An official item cites the guide sample it reproduces rather than a research
   row — "Exam Guide v1.0 §9 Sample 4" carries no row id and would fail
   resolution outright. It is checked against that shape instead. */
const GUIDE_CITATION = /^Exam Guide v[\d.]+ §\d+ Sample \d+$/;

/* A non-official item may also cite a guide objective, as "Exam Guide v1.0 §6
   3.5". That is not a loophole for lazy sourcing: a few learning objectives are
   things the guide's authors assert and Anthropic has published nothing else
   about, and for those the guide genuinely is the source. The exam is written
   against it, so an item tracing to an objective is sourced — but the citation
   is deliberately conspicuous, because a domain full of them means the
   objectives are thinly covered and the questions rest on one document. */
const GUIDE_OBJECTIVE = /^Exam Guide v[\d.]+ §\d+ \d+\.\d+$/;

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

function checkQuestion(ex, q, i, domainIds, problems, rowIds) {
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

  /* An item marked `official` is reproduced verbatim from the exam guide's own
     sample questions, and every published sample on both tracks is
     single-answer. Converting one to multiple-response would rewrite a guide
     item, so the flag is also the guard that stops it — this is what protects
     the twelve CCAR-F samples from the multiple-response retrofit. */
  if (q.official) {
    if (Array.isArray(q.c)) say("is an official guide sample, so it cannot be multiple-response");
    if (!q.src) say("is marked official but doesn't say which guide sample it is");
    else if (!GUIDE_CITATION.test(q.src))
      say(`is official but its src "${q.src}" isn't a guide citation like "Exam Guide v1.0 §9 Sample 4"`);
  }

  /* The real exam states how many responses to select, so the bank does too.
     The guide itself never writes a literal "Select N" — that string is this
     app's convention, imported from the Associate track. What the guide states
     is the format: "Multiple-choice and multiple-response items; each item
     states how many responses to select" (CCAR-F §3). The count has to match
     the key or the item is unanswerable as written.

     Shape, too. A multiple-response item gets 5 or 6 options with 2 or 3 keys,
     which is what every such item on both tracks already does — 12 five-option
     and 26 six-option on Associate, 4 six-option on Architect. Four options is
     the shape to refuse: it puts a blind guess at one in six and reads as a
     single-answer item that grew a second key. This was convention only until
     now, so locking it in costs nothing and stops the next author inventing a
     4-option "Select 2". */
  if (Array.isArray(q.c)) {
    if (q.a.length < 5 || q.a.length > 6)
      say(`is multiple-response with ${q.a.length} options — the shape is 5 or 6`);
    if (correct.length < 2 || correct.length > 3)
      say(`is multiple-response with ${correct.length} keys — the shape is 2 or 3`);
    const stated = /Select (\d+)\./.exec(q.q);
    if (!stated) say(`is multiple-response but its stem never says "Select ${correct.length}."`);
    else if (Number(stated[1]) !== correct.length)
      say(`says "Select ${stated[1]}." but has ${correct.length} correct answers`);
  } else if (/Select \d+\./.test(q.q)) {
    say('is single-answer but its stem says "Select N."');
  }

  /* Sourcing, for the domains that have an inventory. `official` items cite a
     guide sample instead and were checked above. */
  if (rowIds && (SOURCED_DOMAINS[ex.code] || []).includes(q.d) && !q.official) {
    if (!q.src) say(`is in sourced domain ${q.d} but has no src`);
    else if (!GUIDE_OBJECTIVE.test(q.src)) {
      const cited = [...q.src.matchAll(/\b((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2})\b/g)].map((m) => m[1]);
      if (!cited.length)
        say(`src "${q.src}" names no research row id, and isn't a guide objective like "Exam Guide v1.0 §6 3.5"`);
      const dangling = cited.filter((id) => !rowIds.has(id));
      if (dangling.length) say(`src cites ${dangling.join(", ")}, which resolve to no research row`);
    }
  }

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
/* How many sample questions each guide publishes, and therefore how many items
   the bank should carry verbatim. CCAO-F §8 has three; CCAR-F §9 has twelve, as
   four scenarios of three. A count that drifts means a sample was dropped, or
   an in-house question was flagged by mistake. */
const OFFICIAL_SAMPLES = { "CCAO-F": 3, "CCAR-F": 12 };

function report(ex, rowIds) {
  const domainIds = new Set(ex.domains.map((d) => d.id));
  const problems = [];
  ex.questions.forEach((q, i) => checkQuestion(ex, q, i, domainIds, problems, rowIds));

  const expected = OFFICIAL_SAMPLES[ex.code];
  const official = ex.questions.filter((q) => q.official).length;
  if (expected !== undefined && official !== expected)
    problems.push(`${ex.code}: ${official} questions marked official, expected ${expected}`);

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
    `  ${total} questions · ${multi} multiple-response (${total ? Math.round((100 * multi) / total) : 0}%) · ${official} official · weights sum ${weightSum}${weightSum === 100 ? "" : "  <-- should be 100"}`,
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
const rowIds = knownRowIds();
if (!rowIds)
  console.log(
    `\nNo ${path.relative(path.join(__dirname, ".."), RESEARCH_DIR)}/ directory, so src resolution is skipped.` +
      `\nThat directory is gitignored; the check runs where the research notes exist.`,
  );
const bad = tracks.reduce((a, ex) => a + report(ex, rowIds), 0);
console.log(
  bad ? `\n${bad} structural problem(s) found.\n` : "\nNo structural problems.\n",
);
process.exit(bad ? 1 : 0);
