/* Finds research rows that quote the same source sentence under two different
   row ids — a fact recorded independently by two inventories, which a question
   written against either row keys in its own domain, and no similarity check
   on the *questions* reliably catches, since the two stems are usually phrased
   independently.

   node tools/row-aliases.js [CCAR-F|CCAO-F]

   Compares only within one track — Associate rows against Associate, Architect
   against Architect — since an alias across tracks means nothing: a candidate
   sits one exam only. With no argument it reports both. */

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
   Architect rows tend to be longer, distinct sentences off the same page, each
   describing a different aspect of one mechanism — a similarity floor loose
   enough to catch those as aliases also returns most of the file, so grouping
   by page and objective instead is what the actual review has to happen on.

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
