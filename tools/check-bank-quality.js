/* Heuristic quality checks on the built banks: absolutes-only distractor
   clusters, explanations that restate their own key, short explanations, and
   vocabulary from the exam guide's out-of-scope list. Dev tool; the app never
   loads it.

   node tools/check-bank-quality.js [CCAR-F|CCAO-F]

   Reports only and always exits 0 — every check here is a heuristic over free
   text (an out-of-scope word can appear in a stem that rules the topic out, an
   absolutes cluster can be the honest shape of a question about absolutes), so
   a hit is something to read, not a build failure. */

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

/* Kept in step with the Associate bank's own definition of an absolute. */
const ABSOLUTES =
  /\b(always|never|all of the above|none of the above|every single|no need to|completely eliminat)/i;

/* CCAR-F guide v1.0 §17 "Out-of-Scope Topics", plus the Technologies-adjacent
   items the same section rules out. The exam guide is the authority on what is
   tested, so this list is transcribed from it rather than judged. */
const OUT_OF_SCOPE = {
  "CCAR-F": [
    [/\bfine[- ]?tun/i, "fine-tuning or training custom models"],
    [/\bOAuth\b|API key rotation/i, "auth protocol details"],
    [/\brate[- ]?limit|\bquota|pricing calculat/i, "rate limits, quotas, pricing"],
    [/token[- ]?count|tokeniz/i, "token counting or tokenization"],
    [/computer[- ]?use|browser automation/i, "computer use"],
    [/\bvision\b|image analysis/i, "vision or image analysis"],
    [/server-sent event|\bstreaming API\b/i, "streaming implementation"],
    [/embedding model|vector database/i, "embeddings or vector databases"],
    [/prompt cach/i, "prompt caching beyond knowing it exists"],
    [/Constitutional AI|\bRLHF\b/i, "safety-training methodology"],
    [/benchmark|model comparison metric/i, "benchmarking or model comparison"],
    [/\b(deploy|host)ing (an? )?MCP server|container orchestration/i, "deploying or hosting MCP servers"],
    [/\bAWS\b|\bGCP\b|\bAzure\b/i, "cloud provider configuration"],
  ],
  /* The Associate bank is hand-maintained and already clean against this
     list; it runs here mainly as a regression check on future edits. */
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
