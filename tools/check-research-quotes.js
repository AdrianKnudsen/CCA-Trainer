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

   AND CHECK WHAT CAME BACK. Measured 2026-09-10: a `.md` URL whose path does
   not exist returns HTTP 200 with the app shell, not an error — 363 KB of HTML
   for `claude-code/sdk/sdk-overview.md`, for one. So the status code proves
   nothing, and a careless fetch leaves an HTML file sitting in sources/ that no
   quote can ever match. This tool refuses such a file by name rather than
   letting it fail every row that cites it.

   TWO HEURISTICS THAT LOOK RIGHT AND ARE NOT, both established by measurement:

   Requiring YAML frontmatter would reject the real corpus. Most pages on
   docs.claude.com begin "> ## Documentation Index" rather than a "---" block.

   Rejecting a file that contains "<script" would also reject a real page.
   `agent-sdk--typescript.md` is 357 KB of genuine reference markdown that
   carries one MDX component tag, <script src="..." defer />, on line 9. A
   drafted version of this check had that rule and would have deleted the page
   and then failed every row citing it. So the discriminator is STRUCTURAL: the
   shell announces itself with a doctype or an <html> element at the very start,
   and it carries no markdown headings at all. An isolated tag inside prose
   proves nothing either way.

   FILE NAMING. New pages are saved as a path slug — the last two path segments
   joined by a double dash, `claude-code--memory.md` — because the last segment
   alone collides as soon as two pages share it, and `overview.md` and `mcp.md`
   both exist under several paths. The ten pages fetched for the d2 inventory
   predate that rule and keep their single-segment names; both forms are
   accepted.

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

const rawFiles = fs.readdirSync(SRC).filter((f) => f.endsWith(".md"));

/* A source file that is really the single-page-app shell is worse than a
   missing one: it makes every row citing that page fail for a reason that looks
   like a fabricated quote. Name it instead.

   Two structural signals, both required to be absent for the file to pass as
   markdown, and deliberately NOT a tag scan — see the header. */
const isShell = (text) => {
  const head = text.slice(0, 4096);
  if (/^\s*<(?:!doctype|html)\b/i.test(text)) return "starts with a doctype or <html>";
  /* A real page has markdown structure early: an ATX heading, or the
     "> ## Documentation Index" preamble docs.claude.com prepends. The shell has
     neither, and is dense with head-element markup instead. */
  const hasMarkdown = /^\s{0,3}#{1,6}\s/m.test(head) || /^>\s*#{1,6}\s/m.test(head) || /^---\s*$/m.test(head);
  if (!hasMarkdown && /<(?:meta|link|div)\b/i.test(head)) return "no markdown structure, and head-element markup instead";
  return null;
};

const htmlFiles = [];
const corpus = [];
for (const f of rawFiles) {
  const text = fs.readFileSync(path.join(SRC, f), "utf8");
  const why = isShell(text);
  if (why) {
    htmlFiles.push(`${f} — ${why}`);
    continue;
  }
  corpus.push({ name: f, body: canon(text) });
}
if (htmlFiles.length) {
  console.error(`\n${htmlFiles.length} file(s) in ${SRC} are HTML, not markdown — refetch with the .md URL:`);
  htmlFiles.forEach((f) => console.error(`  ${f}`));
  console.error("");
  process.exit(2);
}

/* Candidate filenames for a row's own URL: the path slug first, then the
   legacy last-segment name. A fragment found in the row's own page is the
   normal case; a fragment found only somewhere else means the row's URL is
   wrong, which is a real defect that corpus-wide matching hides. */
const fileCandidates = (url) => {
  const segs = (url || "").replace(/^https?:\/\//, "").replace(/\.md$/, "").split("/").filter(Boolean);
  const last = segs[segs.length - 1];
  const prev = segs[segs.length - 2];
  return [prev && last ? `${prev}--${last}.md` : null, last ? `${last}.md` : null].filter(Boolean);
};
const byName = new Map(corpus.map((c) => [c.name, c]));

const rows = fs
  .readFileSync(INV, "utf8")
  .split("\n")
  .filter((l) => /^\|\s*[A-Z]+\d*-\d+\s*\|/.test(l));

const missing = [];
const unchecked = [];
const elsewhere = [];
const usedFiles = new Set();
let matched = 0;

for (const row of rows) {
  const cells = row.split("|");
  const id = cells[1].trim();
  const claim = cells[2] || "";
  const url = ((cells[3] || "").match(/https?:\/\/[^\s|]+/) || [])[0] || "";
  const own = fileCandidates(url).map((n) => byName.get(n)).filter(Boolean);
  own.forEach((c) => usedFiles.add(c.name));
  let checkedAny = false;

  for (const quoted of claim.match(/"[^"]{30,}"/g) || []) {
    // An ellipsis in a row joins two separate quotes; check each side alone.
    for (const part of quoted.slice(1, -1).split("…")) {
      const frag = canon(part);
      if (frag.length < 30) continue;
      checkedAny = true;
      if (own.some((c) => c.body.includes(frag))) {
        matched++;
        continue;
      }
      const found = corpus.find((c) => c.body.includes(frag));
      if (!found) {
        missing.push({ id, frag: part.trim() });
        continue;
      }
      matched++;
      /* Found, but not on the page the row credits. Either the URL is wrong or
         the page is not in sources/ under a name this derives. Both are worth
         a line; neither is a fabricated quote, so neither fails the run. */
      elsewhere.push({ id, url, found: found.name, tried: fileCandidates(url).join(" or ") });
    }
  }
  if (!checkedAny) unchecked.push(id);
}

console.log(`\n${rows.length} rows · ${matched} quoted fragment(s) found verbatim in a fetched page`);
if (unchecked.length)
  console.log(`  no fragment of 30+ characters to check: ${unchecked.join(", ")}`);

if (elsewhere.length) {
  console.log(`\n  ${elsewhere.length} fragment(s) verified, but not on the page the row credits:`);
  elsewhere.forEach((e) => console.log(`  ELSEWHERE  ${e.id}: found in ${e.found}, expected ${e.tried}`));
}

/* Pages nobody cites. With ten sources this was curiosity; across four new
   inventories it is the signal that a page was fetched and then not mined, or
   that a row's URL drifted from the file it was saved as. */
const orphans = corpus.filter((c) => !usedFiles.has(c.name)).map((c) => c.name);
if (orphans.length)
  console.log(`\n  ${orphans.length} fetched page(s) cited by no row in this inventory: ${orphans.join(", ")}`);

if (missing.length) {
  console.log(`\n  ${missing.length} fragment(s) NOT found in any fetched page:`);
  missing.forEach((m) => console.log(`  MISSING  ${m.id}: ${m.frag.slice(0, 110)}`));
  console.log("");
  process.exit(1);
}
console.log("\nEvery checkable fragment is present verbatim in a fetched source.\n");
