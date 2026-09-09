/* ============================================================
   CCA Trainer · research quote verifier
   ------------------------------------------------------------
   A development tool, NOT part of the app. index.html never loads it.

       node tools/check-research-quotes.js [inventory.md] [sources-dir]

   Why this exists: a fabricated "verbatim" quote is the one defect the whole
   sourcing method cannot survive, and it is invisible on reading — the row
   looks exactly like a real one. One row in the CCAR-F d2 inventory was
   written from the shape of a CLI table rather than from the page, and only a
   mechanical check caught it.

   Defaults to the CCAR-F d2 inventory and docs/research/sources/, which holds
   the source pages as raw markdown. Refresh a page with:

       curl -sL -o docs/research/sources/memory.md \
         https://docs.claude.com/en/docs/claude-code/memory.md

   Note the .md suffix: the HTML URL returns the single-page-app shell, and
   summarising the page through a model defeats the purpose.

   Both sides are normalised before comparing — markdown links to their text,
   emphasis and code ticks removed, smart quotes and dashes folded — because
   an inventory row legitimately reformats what it quotes. A fragment the tool
   cannot check is reported rather than passed silently.

   Exits non-zero if any fragment is missing, so it can gate a commit.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INV = process.argv[2] || path.join(ROOT, "docs/research/ccar-d2-claude-code.md");
const SRC = process.argv[3] || path.join(ROOT, "docs/research/sources");

const canon = (s) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // markdown link -> its text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

for (const p of [INV, SRC]) {
  if (!fs.existsSync(p)) {
    console.error(`Can't find ${p}`);
    process.exit(2);
  }
}

const corpus = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ name: f, body: canon(fs.readFileSync(path.join(SRC, f), "utf8")) }));

const rows = fs
  .readFileSync(INV, "utf8")
  .split("\n")
  .filter((l) => /^\|\s*[A-Z]+\d*-\d+\s*\|/.test(l));

const missing = [];
const unchecked = [];
let matched = 0;

for (const row of rows) {
  const cells = row.split("|");
  const id = cells[1].trim();
  const claim = cells[2] || "";
  let checkedAny = false;

  for (const quoted of claim.match(/"[^"]{30,}"/g) || []) {
    // An ellipsis in a row joins two separate quotes; check each side alone.
    for (const part of quoted.slice(1, -1).split("…")) {
      const frag = canon(part);
      if (frag.length < 30) continue;
      checkedAny = true;
      if (corpus.some((c) => c.body.includes(frag))) matched++;
      else missing.push({ id, frag: part.trim() });
    }
  }
  if (!checkedAny) unchecked.push(id);
}

console.log(`\n${rows.length} rows · ${matched} quoted fragment(s) found verbatim in a fetched page`);
if (unchecked.length)
  console.log(`  no fragment of 30+ characters to check: ${unchecked.join(", ")}`);

if (missing.length) {
  console.log(`\n  ${missing.length} fragment(s) NOT found in any fetched page:`);
  missing.forEach((m) => console.log(`  MISSING  ${m.id}: ${m.frag.slice(0, 110)}`));
  console.log("");
  process.exit(1);
}
console.log("\nEvery checkable fragment is present verbatim in a fetched source.\n");
