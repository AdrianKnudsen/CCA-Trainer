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

   FILE NAMING. New pages are saved as a path slug — the last two meaningful
   path segments joined by a double dash, `claude-code--memory.md` — because the
   last segment alone collides as soon as two pages share it, and `overview.md`
   and `mcp.md` both exist under several paths. The ten pages fetched for the d2
   inventory predate that rule and keep their single-segment names; both forms
   are accepted.

   Two parts of that are easy to get wrong, and getting them wrong is what made
   this gate useless for a while — measured 2026-09-15, only 45 of the 83 URLs
   cited across the four new inventories resolved:

   `docs` and `en` are dropped from the path before the last two segments are
   taken. They carry no information, they are in every Anthropic docs URL, and
   they appear in BOTH orders — `/docs/en/` on platform.claude.com, `/en/docs/`
   on docs.claude.com — so position cannot be relied on.

   The host contributes a prefix, and that prefix is a FOSSIL of the URL the page
   was fetched from rather than a transform of the host the row cites now.
   `code.claude.com/docs/en/agent-teams` is on disk as
   `claude-code--agent-teams.md`, because the page lived at
   `docs.claude.com/en/docs/claude-code/agent-teams` when it was fetched. So the
   mapping is a table, not a rule, and it cannot be complete: three rows cite a
   page that moved or was never fetched, and those are reported rather than
   papered over.

   A row whose authority IS the exam guide has no URL at all. The guide is a PDF
   whose text lives in the corpus as a `pdftotext` extract, so such a row cites
   that file's path, and it gets a first-class match against that file. Before
   this, 169 guide rows fell through to a corpus-wide search and were reported as
   if their provenance were unknown.

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

/* Segments that carry no information and appear in no filename. Dropped by
   name rather than by position: the two orders `/docs/en/` and `/en/docs/` are
   both in use. */
const BOILERPLATE = new Set(["docs", "en"]);

/* Host -> filename prefix. A table rather than a rule, because the prefix
   records the URL a page was fetched from — see the header. An unlisted host
   contributes its first label, which is what `www--` and
   `modelcontextprotocol--` names came from. */
const HOST_PREFIX = {
  "docs.claude.com": "",
  "code.claude.com": "claude-code",
  "platform.claude.com": "platform",
};

/* Candidate filenames for a row's own URL: the path slug first, then the two
   legacy forms. A fragment found in the row's own page is the normal case; a
   fragment found only somewhere else means the row's URL is wrong, which is a
   real defect that corpus-wide matching hides. */
const fileCandidates = (url) => {
  const parts = (url || "").replace(/^https?:\/\//, "").replace(/\.md$/, "").split("/").filter(Boolean);
  const host = parts[0] || "";
  const segs = parts.slice(1).filter((seg) => !BOILERPLATE.has(seg));
  if (!segs.length) return [];
  const prefix = host in HOST_PREFIX ? HOST_PREFIX[host] : host.split(".")[0];

  /* Tails of the last three, two and one segment, longest first because a
     longer tail is the more specific claim. Three is not padding: the MCP spec
     is served per version, so `specification/2026-07-28/server/tools` is on disk
     as `modelcontextprotocol--2026-07-28--server--tools.md` and an undated
     `modelcontextprotocol--server--tools.md` sits beside it holding different
     text. Deriving only the last two segments credited the wrong one of the two
     and reported three correct rows as misattributed. */
  const names = [];
  for (const n of [3, 2, 1]) {
    if (segs.length < n) continue;
    const tail = segs.slice(-n).join("--");
    if (prefix) names.push(`${prefix}--${tail}.md`);
    names.push(`${tail}.md`);
  }
  return [...new Set(names)];
};

/* The source cell is either a URL or, for a guide row, a path to the extract in
   the corpus. Both name a page; only the first needs deriving. */
const citedFiles = (cell) => {
  const url = (cell.match(/https?:\/\/[^\s|)`]+/) || [])[0] || "";
  if (url) return { cited: url, names: fileCandidates(url) };
  const filePath = (cell.match(/([A-Za-z0-9._-]+\.md)/) || [])[1] || "";
  return { cited: filePath, names: filePath ? [filePath] : [] };
};

const byName = new Map(corpus.map((c) => [c.name, c]));

const rows = fs
  .readFileSync(INV, "utf8")
  .split("\n")
  .filter((l) => /^\|\s*[A-Z]+\d*-\d+\s*\|/.test(l));

const missing = [];
const unchecked = [];
const elsewhere = [];
const noPage = new Map();
const usedFiles = new Set();
let matched = 0;

for (const row of rows) {
  const cells = row.split("|");
  const id = cells[1].trim();
  const claim = cells[2] || "";
  const { cited, names } = citedFiles(cells[3] || "");
  const own = names.map((n) => byName.get(n)).filter(Boolean);
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
      /* Found, but not on the page the row credits — and the two reasons for
         that mean opposite things, which is why they are reported apart.

         The credited page IS in the corpus and the quote is not in it: that is
         a possible misattribution, and catching it is why per-page matching
         exists at all. Reporting it in the same list as the case below is what
         buried 359 of these in noise.

         The credited page is NOT in the corpus under any name this derives: the
         tool never had the page to compare against, so the row may be perfectly
         correct. Grouped by target, because rows share URLs.

         Neither is a fabricated quote, so neither fails the run. */
      if (own.length) {
        elsewhere.push({ id, cited, found: found.name, tried: names.join(" or ") });
      } else {
        const key = cited || "(no URL or file path in the source cell)";
        if (!noPage.has(key)) noPage.set(key, { ids: new Set(), tried: names.join(" or ") || "nothing to derive" });
        noPage.get(key).ids.add(id);
      }
    }
  }
  if (!checkedAny) unchecked.push(id);
}

console.log(`\n${rows.length} rows · ${matched} quoted fragment(s) found verbatim in a fetched page`);
if (unchecked.length)
  console.log(`  no fragment of 30+ characters to check: ${unchecked.join(", ")}`);

if (elsewhere.length) {
  console.log(`\n  ${elsewhere.length} fragment(s) verified, but NOT on the page the row credits,`);
  console.log(`  whose page IS in the corpus — so each of these is a possible misattribution:`);
  elsewhere.forEach((e) => console.log(`  ELSEWHERE  ${e.id}: found in ${e.found}, credits ${e.tried}`));
}

if (noPage.size) {
  const rowCount = [...noPage.values()].reduce((n, v) => n + v.ids.size, 0);
  console.log(`\n  ${rowCount} row(s) cite a page that is not in ${path.basename(SRC)}/ under any`);
  console.log(`  derivable name, so their quotes could only be checked corpus-wide:`);
  for (const [cited, v] of noPage)
    console.log(`  NO-PAGE  ${cited}\n             tried ${v.tried}\n             rows ${[...v.ids].join(", ")}`);
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
