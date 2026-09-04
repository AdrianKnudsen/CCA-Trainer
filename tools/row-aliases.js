/* Find research rows that quote the same source sentence under different ids.

   Why this exists: the bank was researched by four agents writing four inventories.
   Where two of them read the same Anthropic page, they recorded the same sentence
   under different row ids — BR-05 and D4-69 are one sentence, so are BR-06 and
   D4-68. Nothing reconciled them, so a question written against BR-05 and a question
   written against D4-69 are the same question in two domains, and no similarity check
   on the *questions* reliably catches it because the two writers phrased their stems
   independently.

   It also caused a self-inflicted defect: a fix round was told to write new Domain 1
   items from the brainstorming rows, without anyone knowing Domain 4 already owned
   those rows. That round removed sixteen duplicates and created two.

   Run: node tools/row-aliases.js
*/

const fs = require("fs");
const path = require("path");

const RESEARCH = path.join(__dirname, "..", "docs", "research");
const ROW = /^\|\s*((?:D[1-7]X?|PRE|BR)-\d{2})\s*\|\s*(.+?)\s*\|\s*(https?:\/\/[^\s|]+)\s*\|/;

const rows = [];
for (const f of fs.readdirSync(RESEARCH).filter((f) => f.endsWith(".md"))) {
  if (f.startsWith("pressure-test")) continue; // reports quote rows, they don't define them
  fs.readFileSync(path.join(RESEARCH, f), "utf8")
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(ROW);
      if (m) rows.push({ id: m[1], quote: m[2], url: m[3], file: f, line: i + 1 });
    });
}

const byId = new Map();
rows.forEach((r) => {
  if (byId.has(r.id) && byId.get(r.id).quote !== r.quote)
    console.log(`  ID COLLISION ${r.id}: ${byId.get(r.id).file}:${byId.get(r.id).line} vs ${r.file}:${r.line}`);
  byId.set(r.id, r);
});

const words = (s) =>
  new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
  );
const jac = (a, b) => {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  a.forEach((w) => b.has(w) && hit++);
  return hit / (a.size + b.size - hit);
};

/* Same URL is the strong prior — two rows quoting the same page are candidates even
   when one records a longer excerpt than the other. Different pages need a much
   higher textual overlap before it means anything. */
const tok = rows.map((r) => words(r.quote));
const alias = [];
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const sameUrl = rows[i].url === rows[j].url;
    const s = jac(tok[i], tok[j]);
    if ((sameUrl && s >= 0.45) || s >= 0.75) alias.push({ a: rows[i], b: rows[j], s, sameUrl });
  }
}
alias.sort((x, y) => y.s - x.s);

console.log(`${rows.length} rows across ${new Set(rows.map((r) => r.file)).size} files\n`);
console.log(`${alias.length} alias pair(s) — the same sentence under two ids:\n`);
alias.forEach(({ a, b, s, sameUrl }) => {
  const cross = a.file !== b.file ? "CROSS-FILE" : "same file ";
  console.log(`  ${s.toFixed(2)} ${cross} ${a.id} = ${b.id}${sameUrl ? "" : "  (different URLs)"}`);
  console.log(`        ${a.file}:${a.line}  ${a.quote.slice(0, 88)}`);
  console.log(`        ${b.file}:${b.line}  ${b.quote.slice(0, 88)}`);
});
