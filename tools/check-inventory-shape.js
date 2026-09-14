#!/usr/bin/env node
/* Structural gate for an Architect research inventory.
 *
 * `check-research-quotes.js` proves the quotes are real; this proves the file is
 * shaped like an inventory at all. It exists because the four Architect
 * inventories are generated per domain rather than written by one hand, so the
 * failure mode is a file that reads fine and is missing the section a later
 * phase depends on — the coverage table is what proves every task statement has
 * a row, and the permutation header is what stops guide Domain 2 material being
 * filed under app `d2`.
 *
 *   node tools/check-inventory-shape.js                      all ccar-*.md
 *   node tools/check-inventory-shape.js docs/research/x.md    one file
 *
 * Exits 1 on a defect, 2 if a named file is missing. Reports only on the parts
 * a machine can judge; the prose is a human's job.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RESEARCH = path.join(ROOT, "docs", "research");

/* Guide domain -> app id. Only d1 and d5 share a number, which is the whole
   reason this table is checked rather than assumed. */
const PERM = { 1: "d1", 2: "d4", 3: "d2", 4: "d3", 5: "d5" };
const WEIGHT = { d1: 27, d4: 18, d2: 20, d3: 20, d5: 15 };
const STATEMENTS = {
  d1: ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"],
  d4: ["2.1", "2.2", "2.3", "2.4", "2.5"],
  d2: ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"],
  d3: ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"],
  d5: ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"],
};
const SECTIONS = [
  "## Fact table",
  "## Guide conflicts, in full",
  "## Coverage against the guide's task statements",
  "## Replacement-item candidates",
  "## Still to source",
];

let bad = 0;
const say = (f, m) => {
  console.log(`  ${f}: ${m}`);
  bad++;
};

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs
      .readdirSync(RESEARCH)
      .filter((f) => /^ccar-d[1-5]-.*\.md$/.test(f))
      .map((f) => path.join(RESEARCH, f));

if (!files.length) {
  console.log("No Architect inventory found in docs/research/ — nothing to check.");
  process.exit(0);
}

console.log("Architect inventory shape\n");

for (const fp of files) {
  if (!fs.existsSync(fp)) {
    console.log(`MISSING FILE ${fp}`);
    process.exit(2);
  }
  const name = path.basename(fp);
  const txt = fs.readFileSync(fp, "utf8");
  const lines = txt.split("\n");

  /* --- header: "# Domain N (app dX) — Name (W%)" --- */
  const h = lines[0].match(/^#\s+Domain\s+(\d)\s+\(app\s+`(d[1-5])`\)\s+—\s+(.+?)\s+\((\d+)%\)\s*$/);
  let app = null;
  if (!h) {
    say(name, `first line is not a permutation header: "${lines[0].slice(0, 70)}"`);
  } else {
    const [, gd, appId, , w] = h;
    app = appId;
    if (PERM[gd] !== appId) say(name, `header maps guide Domain ${gd} to app \`${appId}\`; the guide's Domain ${gd} is \`${PERM[gd]}\``);
    if (Number(w) !== WEIGHT[appId]) say(name, `header weight ${w}% but \`${appId}\` is ${WEIGHT[appId]}%`);
    const fromName = name.match(/^ccar-(d[1-5])-/)?.[1];
    if (fromName && fromName !== appId) say(name, `filename says \`${fromName}\`, header says \`${appId}\``);
  }

  /* --- sections --- */
  for (const s of SECTIONS) if (!txt.includes(`\n${s}`)) say(name, `missing section "${s}"`);

  /* --- fact table --- */
  const ns = app ? app.replace("d", "AR") : "AR";
  const rowRe = new RegExp(`^\\|\\s*(${ns}-\\d{2,3})\\s*\\|\\s*(.+?)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(.*?)\\s*\\|\\s*(.*?)\\s*\\|\\s*$`);
  const rows = [];
  for (const l of lines) {
    const m = l.match(rowRe);
    if (m) rows.push({ id: m[1], quote: m[2], url: m[3], obj: m[4], flags: m[5] });
  }
  if (!rows.length) {
    say(name, `fact table has no ${ns}-nn rows — check the column order and the id namespace`);
    continue;
  }

  /* ids: unique, contiguous from 01, no gaps. A gap means a row was cut after
     numbering, which breaks the promise that an id is stable. */
  const nums = rows.map((r) => Number(r.id.split("-")[1]));
  const dupIds = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dupIds.length) say(name, `duplicate row ids: ${[...new Set(dupIds)].map((n) => `${ns}-${String(n).padStart(2, "0")}`).join(", ")}`);
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  if (sorted[0] !== 1) say(name, `ids start at ${sorted[0]}, expected 1`);
  const gaps = sorted.filter((n, i) => i && n !== sorted[i - 1] + 1);
  if (gaps.length) say(name, `id sequence has ${gaps.length} gap(s), first before ${ns}-${String(gaps[0]).padStart(2, "0")} — renumber after curating, not before`);
  const wrongWidth = rows.filter((r) => {
    const d = r.id.split("-")[1];
    return d.length === 2 ? false : d.length === 3 ? d[0] === "0" : true;
  });
  if (wrongWidth.length) say(name, `zero-padded three-digit ids: ${wrongWidth.slice(0, 3).map((r) => r.id).join(", ")} — pad to two, then grow`);

  /* every row must name an objective that belongs to this domain */
  const ok = app ? STATEMENTS[app] : [];
  const stray = rows.filter((r) => {
    const s = r.obj.match(/\b(\d\.\d)\b/);
    return s && !ok.includes(s[1]);
  });
  if (stray.length)
    say(
      name,
      `${stray.length} row(s) cite a task statement outside \`${app}\`: ${[...new Set(stray.map((r) => r.obj.match(/\b(\d\.\d)\b/)[1]))].join(", ")} — this is the permutation trap`,
    );
  const noObj = rows.filter((r) => !/\b\d\.\d\b/.test(r.obj));
  if (noObj.length) say(name, `${noObj.length} row(s) name no task statement in the objective column`);

  /* --- coverage table must account for every statement --- */
  const cov = txt.split("## Coverage against the guide's task statements")[1] || "";
  const missing = ok.filter((s) => !cov.includes(s));
  if (missing.length) say(name, `coverage table does not mention task statement(s) ${missing.join(", ")}`);

  /* a statement with no row at all is a coverage hole, not a thin patch */
  const covered = new Set(rows.map((r) => r.obj.match(/\b(\d\.\d)\b/)?.[1]).filter(Boolean));
  const uncovered = ok.filter((s) => !covered.has(s));
  if (uncovered.length) say(name, `no row serves task statement(s) ${uncovered.join(", ")}`);

  /* --- quote sanity: a table cell holding no quotation mark is usually a
         paraphrase that slipped in unflagged --- */
  const unquoted = rows.filter((r) => !/["“”]/.test(r.quote) && !/PARAPHRASE/i.test(r.flags));
  if (unquoted.length) say(name, `${unquoted.length} row(s) carry no quotation marks and no PARAPHRASE flag: ${unquoted.slice(0, 3).map((r) => r.id).join(", ")}`);

  const stated = txt.match(/\*\*Row count:\s*(\d+)\*\*/);
  if (stated && Number(stated[1]) !== rows.length) say(name, `header says "Row count: ${stated[1]}" but the table has ${rows.length}`);

  const perStmt = ok.map((s) => `${s}:${rows.filter((r) => r.obj.includes(s)).length}`).join(" ");
  console.log(`${name}  ${rows.length} rows  ${perStmt}`);
}

console.log("");
if (bad) {
  console.log(`${bad} defect(s).`);
  process.exit(1);
}
console.log("Shape OK.");
