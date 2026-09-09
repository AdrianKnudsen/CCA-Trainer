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
const ROW = /^\|\s*((?:D[1-7]X?|PRE|BR)-\d{2})\s*\|\s*(.+?)\s*\|\s*(https?:\/\/[^\s|]+)\s*\|/;

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
    const same = rows[i].url === rows[j].url;
    const s = jac(tok[i], tok[j]);
    if ((same && s >= 0.45) || s >= 0.75) pairs.push([rows[i].id, rows[j].id, s]);
  }

/* Which rows does the bank actually cite, and from which items? */
const ctx = { out: null };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(ROOT, "app", "questions-associate.js"), "utf8") + "\nout = ASSOCIATE_Q;",
  ctx,
);
const cited = new Map();
ctx.out.forEach((q, i) => {
  (String(q.src || "").match(/\b(?:D[1-7]X?|PRE|BR)-\d{2}\b/g) || []).forEach((id) => {
    if (!cited.has(id)) cited.set(id, []);
    cited.get(id).push({ i, d: q.d, q: q.q.slice(0, 62) });
  });
});

const hits = pairs.filter(([a, b]) => cited.has(a) && cited.has(b));
console.log(`${ctx.out.length} items · ${cited.size} distinct rows cited · ${pairs.length} alias pairs known\n`);
if (!hits.length) {
  console.log("No alias pair has both sides cited by the bank.");
} else {
  console.log(`${hits.length} alias pair(s) with both sides cited — READ these; a shared supporting row is fine, a shared key is not:\n`);
  hits.forEach(([a, b, s]) => {
    console.log(`  ${a} = ${b}  (similarity ${s.toFixed(2)})`);
    [a, b].forEach((id) =>
      cited.get(id).forEach((u) => console.log(`      ${id}  #${u.i} ${u.d}  ${u.q}...`)),
    );
    console.log("");
  });
}
process.exit(hits.length ? 1 : 0);
