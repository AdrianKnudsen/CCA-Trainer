/* ============================================================
   CCA Trainer · near-duplicate items in the built banks
   ------------------------------------------------------------
   A development tool, NOT part of the app. index.html never loads it.

       node tools/find-duplicate-items.js [CCAR-F [d3]]

   Finds the slots. The whole content strategy for the Architect domains is
   "write new sourced items into the slots freed by duplicates", and until this
   existed there was no way to find a duplicate in the Architect bank at all:
   `assemble.js`'s near-duplicate pass loads the Associate drafts only,
   `validate-questions.js` has no duplicate check, and `check-drafts.js` is
   Associate-only.

   It is NOT the same tool as `alias-collisions.js`, and that distinction is why
   this file exists. That one maps research-row aliases onto the items citing
   them, so it can say nothing about an item with no `src` — and 118 of the 151
   Architect items have none until their domain has been sourced. Using it to
   find duplicate slots is circular: the slots have to be known before the
   research, not after.

   Metric and thresholds are lifted verbatim from `assemble.js` so the two
   agree: Jaccard over tokens longer than 3 characters, flagged at
   key >= 0.6, or key >= 0.45 with stem >= 0.4. A shared keyed answer is the
   signal that matters — two items worded quite differently can teach the
   identical fact, which is what wastes weighted practice. High stem overlap
   alone is usually shared scenario vocabulary, which is why stem never flags
   on its own.

   Read the caveat in assemble.js too: of the 16 duplicates the Associate review
   removed, only one was genuine text duplication. The other 15 were
   domain-ownership mistakes — a real, distinct fact sitting in a domain whose
   objectives do not cover it — and those score ~0.2 here. No threshold finds
   them; a human reading the item against the guide's objective list does.

   Reports only, exit 0. Similarity is a heuristic and a false positive must
   not be able to block anything.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BANKS = ["questions-architect.js", "questions-associate.js"];
const APP_DIR = path.join(__dirname, "..", "app");

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

const [onlyCode, onlyDomain] = process.argv.slice(2);

const tokens = (s) =>
  new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  a.forEach((w) => b.has(w) && hit++);
  return hit / (a.size + b.size - hit);
}

let grand = 0;

for (const ex of loadTracks()) {
  if (onlyCode && ex.code !== onlyCode) continue;

  const sig = ex.questions.map((q, i) => {
    const keys = Array.isArray(q.c) ? q.c : [q.c];
    return {
      i,
      d: q.d,
      official: !!q.official,
      sc: q.sc || null,
      stem: tokens(q.q),
      key: tokens(keys.map((k) => q.a[k]).join(" ")),
      short: (q.q || "").replace(/\s+/g, " ").slice(0, 74),
    };
  });

  const near = [];
  for (let i = 0; i < sig.length; i++) {
    for (let j = i + 1; j < sig.length; j++) {
      if (onlyDomain && sig[i].d !== onlyDomain && sig[j].d !== onlyDomain) continue;
      const key = jaccard(sig[i].key, sig[j].key);
      const stem = jaccard(sig[i].stem, sig[j].stem);
      if (key >= 0.6 || (key >= 0.45 && stem >= 0.4)) near.push({ i, j, key, stem });
    }
  }
  near.sort((x, y) => y.key - x.key);
  grand += near.length;

  console.log(`\n${ex.code}${onlyDomain ? ` (pairs touching ${onlyDomain})` : ""}: ${near.length} near-duplicate pair(s)`);

  near.forEach(({ i, j, key, stem }) => {
    const a = sig[i];
    const b = sig[j];
    /* An official item can never be the one rewritten — its stem, options and
       key reproduce the guide's published sample — so a pair involving one has
       exactly one editable side, and it is worth seeing that at a glance. */
    const notes = [
      a.d !== b.d ? "CROSS-DOMAIN" : null,
      a.official || b.official ? `OFFICIAL on ${a.official ? `[${a.i}]` : ""}${a.official && b.official ? " and " : ""}${b.official ? `[${b.i}]` : ""}` : null,
      a.sc || b.sc ? `scenario ${[a.sc, b.sc].filter(Boolean).join("/")}` : null,
    ].filter(Boolean);

    console.log(`\n  key ${key.toFixed(2)}  stem ${stem.toFixed(2)}   [${a.i}] ${a.d} <-> [${b.i}] ${b.d}${notes.length ? "   " + notes.join(" · ") : ""}`);
    console.log(`    [${a.i}] ${a.short}`);
    console.log(`    [${b.i}] ${b.short}`);
  });
}

console.log(
  grand
    ? `\n${grand} pair(s) to read. A pair is a candidate slot, not a finding —` +
      `\nkeep both when each tests a different side of the fact, and record why.\n`
    : `\nNo near-duplicate pairs above the thresholds.\n`,
);
