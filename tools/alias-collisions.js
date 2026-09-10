/* Cross-check the assembled bank against the research row-alias map.

   `row-aliases.js` finds research rows that quote the same Anthropic sentence under
   different ids. This asks the follow-up: are BOTH sides of an alias pair cited by the
   bank? That is the defect that survived round 1 thirteen times, because a similarity
   check on the questions cannot see it — the writers phrase their stems independently,
   so the texts do not resemble each other at all.

   What this does NOT tell you: whether the shared row is the row that carries each
   item's KEY. A `src` lists supporting rows too, and two items legitimately leaning on
   the same background fact is normal and fine. So every pair below is a candidate for
   reading, not a finding. Expect roughly half to be legitimate on inspection; the ones
   to act on are where the aliased sentence is what makes each key correct.

   Run: node tools/alias-collisions.js
*/

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const RESEARCH = path.join(ROOT, "docs", "research");
const ROW = /^\|\s*((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2})\s*\|\s*(.+?)\s*\|\s*(https?:\/\/[^\s|]+)\s*\|/;

/* Row ids cited from an item's `src`. This pattern has to stay in step with
   ROW above: extending one and not the other is a silent false green, because
   `cited` comes back empty and every pair looks unshared. */
const SRC_ID = /\b(?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2}\b/g;

/* Rows and items are compared within one track only — a candidate sits one
   exam, so an Architect row and an Associate row are never the same fact for
   anybody's purposes. */
const trackOf = (id) => (id.startsWith("AR") ? "CCAR-F" : "CCAO-F");
const BANK_OF = { "CCAR-F": ["questions-architect.js", "ARCHITECT_Q"], "CCAO-F": ["questions-associate.js", "ASSOCIATE_Q"] };
const ONLY = process.argv[2] || null;

const rows = [];
for (const f of fs.readdirSync(RESEARCH).filter((f) => f.endsWith(".md"))) {
  if (f.startsWith("pressure-test")) continue;
  fs.readFileSync(path.join(RESEARCH, f), "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(ROW);
      if (m) rows.push({ id: m[1], quote: m[2], url: m[3], file: f });
    });
}

const words = (s) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));
const jac = (a, b) => {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  a.forEach((w) => b.has(w) && hit++);
  return hit / (a.size + b.size - hit);
};
const tok = rows.map((r) => words(r.quote));

const pairs = [];
for (let i = 0; i < rows.length; i++)
  for (let j = i + 1; j < rows.length; j++) {
    if (trackOf(rows[i].id) !== trackOf(rows[j].id)) continue;
    const same = rows[i].url === rows[j].url;
    const s = jac(tok[i], tok[j]);
    if ((same && s >= 0.45) || s >= 0.75) pairs.push([rows[i].id, rows[j].id, s]);
  }

/* Which rows does each bank actually cite, and from which items? */
let totalHits = 0;
for (const [code, [file, constName]] of Object.entries(BANK_OF)) {
  if (ONLY && code !== ONLY) continue;
  const ctx = { out: null };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "app", file), "utf8") + `\nout = ${constName};`, ctx);

  const cited = new Map();
  ctx.out.forEach((q, i) => {
    (String(q.src || "").match(SRC_ID) || []).forEach((id) => {
      if (!cited.has(id)) cited.set(id, []);
      cited.get(id).push({ i, d: q.d, q: q.q.slice(0, 62) });
    });
  });

  const own = pairs.filter(([a]) => trackOf(a) === code);
  const hits = own.filter(([a, b]) => cited.has(a) && cited.has(b));
  totalHits += hits.length;

  console.log(`\n${code}: ${ctx.out.length} items · ${cited.size} distinct rows cited · ${own.length} alias pairs known`);
  if (!hits.length) {
    console.log(`  No alias pair has both sides cited by this bank.`);
    continue;
  }
  console.log(`  ${hits.length} alias pair(s) with both sides cited — READ these; a shared supporting row is fine, a shared key is not:\n`);
  hits.forEach(([a, b, s]) => {
    console.log(`  ${a} = ${b}  (similarity ${s.toFixed(2)})`);
    [a, b].forEach((id) =>
      cited.get(id).forEach((u) => console.log(`      ${id}  #${u.i} ${u.d}  ${u.q}...`)),
    );
    console.log("");
  });
}

/* Exit non-zero on any hit. CCAO-F carries a recorded baseline of pairs that
   were read and kept — see TODO.md — so on that track the question is whether
   the count has moved, not whether it is zero. */
process.exit(totalHits ? 1 : 0);
