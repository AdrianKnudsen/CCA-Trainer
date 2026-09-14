/* ============================================================
   CCA Trainer · item-quality checks against the built banks
   ------------------------------------------------------------
   A development tool, NOT part of the app. index.html never loads it.

       node tools/check-bank-quality.js [CCAR-F|CCAO-F]

   Four checks that existed only in `docs/drafts/check-drafts.js`, which reads
   the Associate drafts. Two consequences that tool cannot escape: the Architect
   bank has no drafts, so it has never been through any of them; and the five
   Associate early-block items live only in the bank, so they have not either.
   That second blind spot is the same one that hid two real explanation leaks.

   Measured on the Architect bank when this was written (2026-09-10): absolutes
   clusters 0, explanations restating their own key 1, explanations under 40
   characters 0. So the standing damage is near zero. The reason to have it is
   regression protection through a rewrite of 457 distractors, where "always"
   and "never" are the most tempting words to reach for when an option has to
   get longer, and where a lengthened explanation can start by restating what it
   is supposed to teach.

   Plus a vocabulary report for the guide's own out-of-scope list. Anthropic
   publishes plenty that the exam explicitly does not test, and a question can
   drift onto it while every structural check stays green.

   REPORTS ONLY. It always exits 0, and that is a design decision, not an
   oversight: every check here is a heuristic over free text. An out-of-scope
   word can appear legitimately in a stem that rules the topic out, and an
   absolutes cluster can be the honest shape of a question about absolutes.
   Wiring any of it to an exit code would start failing builds on correct items,
   so the numbers are here to be read.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BANKS = ["questions-architect.js", "questions-associate.js"];
const APP_DIR = path.join(__dirname, "..", "app");
const ONLY = process.argv[2] || null;

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

/* Verbatim from check-drafts.js so the two agree on what an absolute is. */
const ABSOLUTES =
  /\b(always|never|all of the above|none of the above|every single|no need to|completely eliminat)/i;

/* CCAR-F guide v1.0 §17 "Out-of-Scope Topics", plus the Technologies-adjacent
   items the same section rules out. The exam guide is the authority on what is
   tested, so this list is transcribed from it rather than judged. */
const OUT_OF_SCOPE = {
  "CCAR-F": [
    [/\bfine[- ]?tun/i, "fine-tuning or training custom models"],
    [/\bOAuth\b|API key rotation/i, "auth protocol details"],
    [/\brate limit|\bquota|pricing calculat/i, "rate limits, quotas, pricing"],
    [/token count|tokeniz/i, "token counting or tokenization"],
    [/computer use|browser automation/i, "computer use"],
    [/\bvision\b|image analysis/i, "vision or image analysis"],
    [/server-sent event|\bstreaming API\b/i, "streaming implementation"],
    [/embedding model|vector database/i, "embeddings or vector databases"],
    [/prompt cach/i, "prompt caching beyond knowing it exists"],
    [/Constitutional AI|\bRLHF\b/i, "safety-training methodology"],
    [/benchmark|model comparison metric/i, "benchmarking or model comparison"],
    [/\b(deploy|host)ing (an? )?MCP server|container orchestration/i, "deploying or hosting MCP servers"],
    [/\bAWS\b|\bGCP\b|\bAzure\b/i, "cloud provider configuration"],
  ],
  /* The Associate list is check-drafts.js's, which the drafts already pass.
     It runs here only for the five early-block items that tool never sees. */
  "CCAO-F": [
    [/\bAgent SDK\b/i, "Agent SDK is Architect/Developer scope"],
    [/\bMCP\b|Model Context Protocol/i, "MCP is Architect/Developer scope"],
    [/\bClaude Code\b/i, "Claude Code is Architect/Developer scope"],
    [/\bCowork\b/i, "Cowork is post-guide"],
    [/\bFable\b|\bMythos\b/i, "model class is post-guide"],
    [/\bXML tag/i, "XML tags are forbidden ground"],
  ],
};

for (const ex of loadTracks()) {
  if (ONLY && ex.code !== ONLY) continue;
  console.log(`\n${ex.code} — ${ex.questions.length} items`);

  const notes = { absolutes: [], restates: [], shortExp: [], scope: [] };

  ex.questions.forEach((q, i) => {
    const keys = Array.isArray(q.c) ? q.c : [q.c];
    const at = `[${i}] ${q.d}${q.official ? " OFFICIAL" : ""}`;
    const keyed = keys.map((k) => q.a[k]);
    const wrong = q.a.filter((_, j) => !keys.includes(j));

    /* An absolutes cluster is solvable without knowledge: if every wrong
       option hedges with "always"/"never" and the key does not, the shape of
       the options gives the answer away. */
    if (wrong.length >= 2 && !keyed.some((o) => ABSOLUTES.test(o)) && wrong.every((o) => ABSOLUTES.test(o)))
      notes.absolutes.push(at);

    /* An explanation that opens by restating the key teaches nothing — it
       repeats what the candidate just read. */
    if (keyed.some((o) => (q.e || "").trim().startsWith(o.trim().slice(0, 30))))
      notes.restates.push(at);

    if ((q.e || "").trim().length < 40) notes.shortExp.push(at);

    const haystack = [q.q, q.e, ...q.a].join(" ");
    for (const [re, why] of OUT_OF_SCOPE[ex.code] || []) {
      const m = haystack.match(re);
      if (m) notes.scope.push(`${at}  "${m[0]}" — ${why}`);
    }
  });

  const report = (label, list, hint) => {
    console.log(`  ${label}: ${list.length}`);
    if (list.length) {
      list.slice(0, 12).forEach((x) => console.log(`      ${x}`));
      if (list.length > 12) console.log(`      … and ${list.length - 12} more`);
      if (hint) console.log(`      ${hint}`);
    }
  };

  report("absolutes only in the wrong options", notes.absolutes);
  report("explanation opens by restating its own key", notes.restates);
  report("explanation under 40 characters", notes.shortExp, "(the validator's own floor is 20)");
  report("out-of-scope vocabulary", notes.scope, "read each — a stem can rule a topic out legitimately");
}

console.log("\nReport only; nothing here fails a run. Read the hits.\n");
