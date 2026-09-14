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

   TRACK PARTITION. Associate rows are D1-..D7-, D7X-, PRE- and BR-; Architect
   rows are AR1-..AR5-. The two are compared only within their own track,
   because an alias across tracks means nothing — a candidate sits one exam, the
   same partition `check-explanation-leaks.js` makes for the same reason. That
   matters more than it looks: both tracks quote the same prompt-engineering
   pages, so pooling them would manufacture pairs nobody can act on.

   WHY THERE IS A CLUSTER REPORT, and why text similarity alone is not enough.
   Associate's real aliases are near-verbatim duplicate sentences: D7-07 = D2-47
   scores 1.00. Architect rows are different in kind — longer (median 203
   characters against 160) and distinct sentences taken from the SAME page, each
   describing a different aspect of one mechanism. Two rows that a question
   author would wrongly treat as two facts therefore score nowhere near a
   useful floor.

   Measured 2026-09-10, on the 45 AR2 rows. Extending the row regex alone found
   zero pairs. Adding a containment measure — what share of the shorter row's
   content words the longer one carries — did not help either: AR2-23 and
   AR2-24, both about the `paths` frontmatter field on rules and both cited by
   the bank, score Jaccard 0.31 and containment 0.50, while the top of the whole
   AR2 distribution is only 0.58. Any floor low enough to catch them returns
   most of the file.

   So the containment floors stay high enough to mean something, and the
   Architect work is done by a CLUSTER REPORT instead: rows grouped by source
   URL and by the guide task statement they serve. AR2-23 through AR2-29 are one
   such group — one page, one objective, seven rows — and that group is the
   review unit. It is what the inventory's author actually did, in prose, in the
   objective column; this only makes it mechanical. A group is not a defect. It
   is a set of rows a human has to read together before any of them is keyed,
   because that is where "two ids, one fact" hides.

   Run: node tools/row-aliases.js [CCAR-F|CCAO-F]

   With no argument it reports both tracks. Name a track to see only its pairs
   and clusters, which is what you want while working one bank.
*/

const fs = require("fs");
const path = require("path");

const RESEARCH = path.join(__dirname, "..", "docs", "research");
/* The third column is normally a URL, but a row whose authority IS the exam guide
   has no URL to give — the guide is a PDF, and its text lives in the corpus as a
   fetched source file. Those rows cite that file's path instead. Requiring a URL
   here dropped them from the analysis silently, which on the Architect side is
   most of the guide-only material and therefore the opposite of what this tool is
   for. */
const ROW = /^\|\s*((?:D[1-7]X?|PRE|BR)-\d{2}|AR[1-5]-\d{2,3})\s*\|\s*(.+?)\s*\|\s*(https?:\/\/[^\s|]+|[^\s|]+\.md)\s*\|\s*(.*?)\s*\|/;
const trackOf = (id) => (id.startsWith("AR") ? "CCAR-F" : "CCAO-F");

/* Jaccard floors, unchanged, plus the containment floors. Containment is set
   lower than you might expect because it is a directional measure: 0.70 means
   the longer row already carries seven in ten of the shorter row's content
   words, which for two rows off one page is a duplicate fact rather than a
   coincidence. Different pages need near-total containment before it means
   anything. */
const JAC_SAME_URL = 0.45;
const JAC_CROSS_URL = 0.75;
const CONTAIN_SAME_URL = 0.75;
const CONTAIN_CROSS_URL = 0.9;
const CLUSTER_MIN = 2; // rows sharing one URL and one objective
const ONLY = process.argv[2] || null;
const MIN_WORDS = 5; // below this, containment is noise

const rows = [];
for (const f of fs.readdirSync(RESEARCH).filter((f) => f.endsWith(".md"))) {
  if (f.startsWith("pressure-test")) continue; // reports quote rows, they don't define them
  fs.readFileSync(path.join(RESEARCH, f), "utf8")
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(ROW);
      if (m) rows.push({ id: m[1], quote: m[2], url: m[3], objective: m[4] || "", file: f, line: i + 1 });
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
const contain = (a, b) => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < MIN_WORDS) return 0;
  let hit = 0;
  small.forEach((w) => big.has(w) && hit++);
  return hit / small.size;
};

const tok = rows.map((r) => words(r.quote));
const alias = [];
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    if (trackOf(rows[i].id) !== trackOf(rows[j].id)) continue;
    if (ONLY && trackOf(rows[i].id) !== ONLY) continue;
    const sameUrl = rows[i].url === rows[j].url;
    const s = jac(tok[i], tok[j]);
    const c = contain(tok[i], tok[j]);
    const byJac = sameUrl ? s >= JAC_SAME_URL : s >= JAC_CROSS_URL;
    const byContain = sameUrl ? c >= CONTAIN_SAME_URL : c >= CONTAIN_CROSS_URL;
    if (byJac || byContain)
      alias.push({ a: rows[i], b: rows[j], s, c, sameUrl, why: byJac ? (byContain ? "both" : "jaccard") : "contains" });
  }
}
alias.sort((x, y) => Math.max(y.s, y.c) - Math.max(x.s, x.c));

const perTrack = {};
rows.forEach((r) => (perTrack[trackOf(r.id)] = (perTrack[trackOf(r.id)] || 0) + 1));
console.log(
  `${rows.length} rows across ${new Set(rows.map((r) => r.file)).size} files` +
    ` (${Object.entries(perTrack).map(([t, n]) => `${t} ${n}`).join(", ")})\n`,
);
console.log(`${alias.length} alias pair(s) — the same fact under two ids, within one track:\n`);
alias.forEach(({ a, b, s, c, sameUrl, why }) => {
  const cross = a.file !== b.file ? "CROSS-FILE" : "same file ";
  console.log(
    `  jac ${s.toFixed(2)} contains ${c.toFixed(2)} [${why}] ${cross} ${a.id} = ${b.id}${sameUrl ? "" : "  (different URLs)"}`,
  );
  console.log(`        ${a.file}:${a.line}  ${a.quote.slice(0, 88)}`);
  console.log(`        ${b.file}:${b.line}  ${b.quote.slice(0, 88)}`);
});

/* Cluster report: rows sharing one source page and one guide task statement.
   The objective column is free text, so the key is its leading identifier
   ("3.3", "Domain 4") when it has one and the whole cell otherwise. */
const objKey = (o) => {
  const m = /^\**\s*(\d+\.\d+|Domain \d+)/.exec(o);
  return m ? m[1] : o.replace(/\s+/g, " ").slice(0, 28) || "(none)";
};

const clusters = new Map();
rows.forEach((r) => {
  const k = `${trackOf(r.id)}\u0000${r.url}\u0000${objKey(r.objective)}`;
  if (!clusters.has(k)) clusters.set(k, []);
  clusters.get(k).push(r);
});

const big = [...clusters.entries()]
  .filter(([k, v]) => v.length >= CLUSTER_MIN && (!ONLY || k.startsWith(ONLY + "\u0000")))
  .sort((a, b) => b[1].length - a[1].length);

console.log(`\n${big.length} cluster(s) of ${CLUSTER_MIN}+ rows on one page serving one objective.`);
console.log(`Read each cluster together. This is where "two ids, one fact" hides on the`);
console.log(`Architect side, where quotes are long and distinct enough that no similarity`);
console.log(`floor separates them from the rest of the page.\n`);

big.forEach(([k, v]) => {
  const [track, url, obj] = k.split("\u0000");
  console.log(`  ${track}  ${v.length} rows  ${obj}  ${url.replace(/^https?:\/\//, "")}`);
  console.log(`      ${v.map((r) => r.id).join(", ")}`);
});
console.log("");
