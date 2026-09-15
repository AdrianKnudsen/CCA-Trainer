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

   3. Report which of the guide's task statements no question reaches — the
      orphan-objective report. A bank can match every weight and still test
      the same third of each domain repeatedly, and the per-domain counts
      above cannot see that.

   Exits non-zero if anything structural is wrong, so it can gate a commit.
   The orphan-objective report is a REPORT: it never fails the build. Coverage
   is a judgement about what a question tests, and a tool that reads citations
   can only see what a question cites.
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

/* A research row as the notes write it: an id, the verbatim claim, the source
   URL, then the objective cell. Same shape `row-items.js` reads, because it is
   one table format across ten files. */
const ROW_LINE =
  /^\|\s*((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2,3})\s*\|\s*(.+?)\s*\|\s*(https?:\/\/[^\s|]+|[^\s|]+\.md)\s*\|\s*(.*?)\s*\|/;

/* A row id wherever it is referenced — in a `src`, or in prose. One home for
   it: the same pattern was written out three times in this file, so a new
   namespace would have had to be remembered in three places. */
const ROW_ID = /\b((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2,3})\b/g;

/* One pass over the research notes, producing the two things that are read from
   them. Both come from the same files, so reading them twice would be two
   chances to disagree about what a row is.

   `ids` — every research row id defined anywhere in the notes. Two namespaces
   coexist: Associate's `D1-`…`D7-`, `D7X-`, `PRE-` and `BR-`, and Architect's
   `AR<n>-` where <n> is the app domain. A `src` naming an id that resolves
   nowhere means the question cites a source that does not exist.

   `rows` — for each id, the guide task statement it serves and the bank items
   its objective cell claims to back. Only the LEADING statement number counts
   as the row's objective: 7 of 461 Architect rows name a second one, and those
   mentions are boundary notes rather than claims — `AR3-27` reads "4.2
   distractor — definitions-and-phrases is 4.1 criteria work, not few-shot",
   which is the row saying 4.1 is precisely what it does NOT serve. Reading
   every number would manufacture coverage, and false coverage is the defect the
   orphan report exists to find. */
function readResearch() {
  if (!fs.existsSync(RESEARCH_DIR)) return null;
  const ids = new Set();
  const rows = new Map();
  for (const f of fs.readdirSync(RESEARCH_DIR)) {
    if (!f.endsWith(".md")) continue;
    const txt = fs.readFileSync(path.join(RESEARCH_DIR, f), "utf8");
    for (const m of txt.matchAll(ROW_ID)) ids.add(m[1]);
    // A "pressure-test" file quotes rows rather than defining them, so a row
    // read from one would credit the wrong file with an objective it never set.
    if (f.startsWith("pressure-test")) continue;
    for (const line of txt.split("\n")) {
      const m = ROW_LINE.exec(line);
      if (!m) continue;
      const objective = m[4] || "";
      const lead = /^\s*([1-5]\.\d)\b/.exec(objective);
      rows.set(m[1], {
        objective: lead ? lead[1] : null,
        backs: [...new Set([...objective.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1])))],
      });
    }
  }
  return { ids, rows };
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
const GUIDE_OBJECTIVE = /^Exam Guide v[\d.]+ §\d+ (\d+\.\d+)$/;

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

function checkQuestion(ex, q, i, domainIds, problems, research) {
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
  if (research && (SOURCED_DOMAINS[ex.code] || []).includes(q.d) && !q.official) {
    if (!q.src) say(`is in sourced domain ${q.d} but has no src`);
    else if (!GUIDE_OBJECTIVE.test(q.src)) {
      const cited = [...q.src.matchAll(ROW_ID)].map((m) => m[1]);
      if (!cited.length)
        say(`src "${q.src}" names no research row id, and isn't a guide objective like "Exam Guide v1.0 §6 3.5"`);
      const dangling = cited.filter((id) => !research.ids.has(id));
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

function combinations(arr, k) {
  if (k === 0) return [[]];
  return arr.flatMap((v, i) =>
    combinations(arr.slice(i + 1), k - 1).map((rest) => [v, ...rest]),
  );
}

/* An exam sim on a scenario track picks `scenariosDrawn` scenarios first and
   fills the rest of the session from questions belonging to no scenario, so two
   things have to hold for EVERY combination the draw could pick, not just for
   the average one:

     - a combination's questions must not exceed any domain's draw target, or
       the fill target goes negative, nothing redistributes the overshoot, and
       the session silently runs one or more items long;
     - what is left of each target must be fillable from that domain's
       scenario-free questions, or the domain silently under-fills.

   Neither is visible in the "have / exam draw" table above, which counts a
   domain's whole pool and knows nothing about scenarios. The margin is thin by
   nature — a domain's bound questions can approach its target — so this is
   checked exhaustively rather than argued from totals. */
function checkScenarioDraw(ex, problems) {
  if (!ex.hasScenarios) return null;
  if (!ex.scenariosDrawn) {
    problems.push(`${ex.code}: hasScenarios is set but scenariosDrawn is missing, so an exam sim draws no scenario sets`);
    return null;
  }
  const present = Object.keys(ex.scenarios || {}).filter((sc) =>
    ex.questions.some((q) => q.sc === sc),
  );
  if (present.length < ex.scenariosDrawn) {
    problems.push(`${ex.code}: ${present.length} scenarios have questions but an exam sim draws ${ex.scenariosDrawn}`);
    return null;
  }

  const target = {}, free = {};
  ex.domains.forEach((d) => {
    target[d.id] = Math.max(1, Math.round((ex.items * d.weight) / 100));
    free[d.id] = ex.questions.filter((q) => q.d === d.id && !q.sc).length;
  });

  const combos = combinations(present, ex.scenariosDrawn);
  let tightest = { headroom: Infinity };
  combos.forEach((combo) => {
    ex.domains.forEach((d) => {
      const bound = ex.questions.filter(
        (q) => q.d === d.id && combo.includes(q.sc),
      ).length;
      const headroom = target[d.id] - bound;
      if (headroom < 0)
        problems.push(`${ex.code}: scenarios ${combo.join("+")} carry ${bound} ${d.id} questions but the draw target is ${target[d.id]}, so that session runs ${-headroom} item(s) long`);
      else if (headroom > free[d.id])
        problems.push(`${ex.code}: scenarios ${combo.join("+")} leave ${headroom} ${d.id} slots to fill but only ${free[d.id]} ${d.id} questions belong to no scenario`);
      if (headroom < tightest.headroom)
        tightest = { headroom, domain: d.id, combo: combo.join("+") };
    });
  });
  return { combos: combos.length, present: present.length, tightest };
}

/* ------------------------------------------------------------------
   The orphan-objective report.

   The weight table above proves a domain has enough questions. It cannot
   prove they spread across what the guide actually tests: a domain can sit
   exactly on its weight while every question in it serves two of the six task
   statements. Matching the blueprint's shape and matching its weights are
   different properties, and only one of them was being checked.

   ARCHITECT ONLY, and not by preference. The Associate inventories carry no
   statement numbers at all — 478 rows, none with a leading `X.Y` — so there is
   no input on that track and the report would print every objective as
   uncovered. All seven Associate domains are declared in SOURCED_DOMAINS
   already, so nothing here applies to them.
   ------------------------------------------------------------------ */

/* The guide and the app number the domains differently, and only `d1` and `d5`
   agree. Reading "Domain 2's objectives" and filing them under `d2` puts MCP
   material into Claude Code, which is the one mistake this table exists to
   stop. The full version is in CLAUDE.md. */
const GUIDE_DOMAIN = { d1: 1, d2: 3, d3: 4, d4: 2, d5: 5 };

/* How many task statements guide §6 defines per domain: 1.1-1.7, 2.1-2.5,
   3.1-3.6, 4.1-4.6, 5.1-5.6.

   Declared here rather than derived, for two reasons that between them rule out
   every alternative. Deriving the list from the research notes would hide the
   very worst case — a task statement no row has ever mentioned would simply not
   appear, so the objective with no coverage at all is the one the report would
   be blind to. And it cannot be read from the guide at runtime: docs/ is
   gitignored and the PDFs are Anthropic's copyrighted material. Counts are
   structural facts about the blueprint, the same class as the domain weights
   already in the banks; the statement titles are guide prose and stay out of a
   tracked file.

   A hardcoded table can go stale against a future guide revision, so
   `objectiveCoverage` checks it: a research row citing a statement outside
   these ranges says the table needs re-reading, not that the row is wrong. */
const TASK_STATEMENTS = { 1: 7, 2: 5, 3: 6, 4: 6, 5: 6 };

/* Which task statements each app domain's questions reach, counted through two
   channels that are never summed.

   `src` is the bank's own citation and is authoritative. It is also, today,
   nearly silent: 25 of 151 Architect items carry a `src` and all 25 are in
   `d2`. A report on that channel alone would print NONE against almost every
   statement in the four unsourced domains — not because nothing covers them but
   because nothing cites anything, which is a different fact and a useless
   report.

   `inv` is the inventories' own back-references: a row whose objective cell
   reads "1.4 … Backs `[39]`" is the research saying `[39]` serves 1.4, even
   though `[39]` carries no `src`. It is the only coverage evidence that exists
   for those domains today, and it was written by the authors rather than
   inferred. It is advisory, not authoritative, because it is known stale in
   seven places — which is a reason to keep it in its own column, not a reason
   to drop it. */
function objectiveCoverage(ex, research) {
  if (!research || ex.code !== "CCAR-F") return null;

  const statementOf = (id) => {
    const row = research.rows.get(id);
    return row ? row.objective : null;
  };

  // Channel 1: what each item cites, whether a row or a guide objective.
  const viaSrc = new Map(); // "4.3" -> Set of bank indices
  const stale = new Set();
  ex.questions.forEach((q, i) => {
    const src = String(q.src || "");
    const cited = [];
    const objective = GUIDE_OBJECTIVE.exec(src);
    // "Exam Guide v1.0 §6 3.5" is a citation of the objective itself, and for
    // `d2`'s 3.5 it is the only thing covering it at all.
    if (objective) cited.push(objective[1]);
    for (const m of src.matchAll(ROW_ID)) {
      const st = statementOf(m[1]);
      if (st) cited.push(st);
    }
    cited.forEach((st) => {
      if (!viaSrc.has(st)) viaSrc.set(st, new Set());
      viaSrc.get(st).add(i);
    });
  });

  // Channel 2: what the inventories say they back.
  const viaInv = new Map();
  research.rows.forEach((row) => {
    if (!row.objective) return;
    row.backs.forEach((i) => {
      if (!ex.questions[i]) return; // an index past the bank is a stale note
      if (!viaInv.has(row.objective)) viaInv.set(row.objective, new Set());
      viaInv.get(row.objective).add(i);
    });
  });

  // Does the declared universe still match what the notes cite?
  [...viaSrc.keys(), ...viaInv.keys()].forEach((st) => {
    const [g, n] = st.split(".").map(Number);
    if (!TASK_STATEMENTS[g] || n < 1 || n > TASK_STATEMENTS[g]) stale.add(st);
  });

  /* Which items either channel reaches at all. This is the figure that makes a
     NONE readable: a domain the report can barely see says nothing by printing
     NONE, and "how many items carry a src" is the wrong proxy for it, because
     the inventory channel reaches items that carry no src whatsoever. */
  const reached = new Set();
  viaSrc.forEach((set) => set.forEach((i) => reached.add(i)));
  viaInv.forEach((set) => set.forEach((i) => reached.add(i)));

  const domains = ex.domains.map((d) => {
    const guide = GUIDE_DOMAIN[d.id];
    const mine = (set) => (set ? [...set].filter((i) => ex.questions[i].d === d.id).length : 0);
    const items = ex.questions.map((q, i) => ({ q, i })).filter((x) => x.q.d === d.id);
    return {
      id: d.id,
      guide,
      items: items.length,
      /* An official sample cites the guide sample it reproduces — "§9 Sample
         4" — which names no task statement, so `src` can never attribute one
         to an objective. Only an inventory back-reference can. Counted here so
         that an unreached official reads as a known limit of the citation
         format rather than as a gap in the bank. */
      official: items.filter((x) => x.q.official).length,
      reached: items.filter((x) => reached.has(x.i)).length,
      statements: Array.from({ length: TASK_STATEMENTS[guide] || 0 }, (_, k) => {
        const st = `${guide}.${k + 1}`;
        return { st, src: mine(viaSrc.get(st)), inv: mine(viaInv.get(st)) };
      }),
    };
  });

  return { domains, stale: [...stale] };
}

function printObjectiveCoverage(cov) {
  console.log(
    "  guide §6 objectives · items reaching each, as src/inv · NONE is a real gap only where" +
      " nothing is unreached · report only, never fails",
  );
  cov.domains.forEach((d) => {
    if (!d.statements.length) {
      // A domain with no entry in GUIDE_DOMAIN would otherwise print a blank
      // line, which reads as full coverage rather than as no data.
      console.log(`    ${d.id}  no guide domain mapped, so its objectives are not known here`);
      return;
    }
    const cells = d.statements.map((s) =>
      s.src + s.inv === 0 ? `${s.st} NONE` : `${s.st} ${s.src}/${s.inv}`,
    );
    const unreached = d.items - d.reached;
    console.log(`    ${d.id}  guide Domain ${d.guide}  ${cells.join("  ")}`);
    console.log(
      `        ${d.reached} of ${d.items} items reached` +
        (d.official ? ` · ${d.official} official cite a guide sample, not an objective` : "") +
        (unreached ? ` · ${unreached} unreached, so a NONE here means UNKNOWN` : " · nothing unreached"),
    );
  });
  if (cov.stale.length)
    console.log(
      `    NOTE  ${cov.stale.join(", ")} is outside the declared task-statement ranges,` +
        ` so TASK_STATEMENTS needs re-reading against the guide`,
    );
}

function report(ex, research) {
  const domainIds = new Set(ex.domains.map((d) => d.id));
  const problems = [];
  ex.questions.forEach((q, i) => checkQuestion(ex, q, i, domainIds, problems, research));

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

  const before = problems.length;
  const scen = checkScenarioDraw(ex, problems);
  if (scen)
    console.log(
      `  scenarios: ${scen.present} in the bank, ${ex.scenariosDrawn} per exam sim · ` +
        (problems.length === before
          ? `all ${scen.combos} combinations fit`
          : `${problems.length - before} of ${scen.combos} combinations broken`) +
        ` · tightest is ${scen.tightest.domain} on ${scen.tightest.combo}, ${scen.tightest.headroom} free slot(s) left`,
    );

  const cov = objectiveCoverage(ex, research);
  if (cov) printObjectiveCoverage(cov);

  if (problems.length) {
    console.log("");
    problems.forEach((p) => console.log(`  PROBLEM  ${p}`));
  }
  return problems.length;
}

const tracks = loadTracks();
const research = readResearch();
if (!research)
  console.log(
    `\nNo ${path.relative(path.join(__dirname, ".."), RESEARCH_DIR)}/ directory, so src resolution and` +
      ` the objective report are skipped.` +
      `\nThat directory is gitignored; both run where the research notes exist.`,
  );
const bad = tracks.reduce((a, ex) => a + report(ex, research), 0);
console.log(
  bad ? `\n${bad} structural problem(s) found.\n` : "\nNo structural problems.\n",
);
process.exit(bad ? 1 : 0);
