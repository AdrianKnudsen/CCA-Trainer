/* Print one domain's questions with their bank index.

   Usage:
     node tools/domain-items.js CCAR-F d3
     node tools/domain-items.js CCAR-F d3 --full     also print explanations

   The Architect bank is interleaved: its section comments claim contiguous
   per-domain blocks, but the actual `d` values drift from the headings, so a
   domain's items are scattered across ~2000 lines. Every phase of the quality
   work reads one domain at a time, and hunting for them by hand each time is
   how an item gets missed.

   Option lengths are printed alongside because the working view for the length
   pass is exactly this list: which item's keyed option is uniquely longest, and
   by how much. That saves loading the same domain twice through two tools. */

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

const argv = process.argv.slice(2);
const full = argv.includes("--full");
const [code, domain] = argv.filter((a) => !a.startsWith("--"));

if (!code || !domain) {
  console.error('Usage: node tools/domain-items.js CCAR-F d3 [--full]');
  process.exit(2);
}

const tracks = loadTracks();
const ex = tracks.find((t) => t.code === code);
if (!ex) {
  console.error(`Unknown track "${code}". Known: ${tracks.map((t) => t.code).join(", ")}`);
  process.exit(2);
}
const dom = ex.domains.find((d) => d.id === domain);
if (!dom) {
  console.error(`Unknown domain "${domain}" on ${code}. Known: ${ex.domains.map((d) => d.id).join(", ")}`);
  process.exit(2);
}

const keysOf = (q) => (Array.isArray(q.c) ? q.c : [q.c]);
const wrap = (t, indent) =>
  (t || "").replace(/\s+/g, " ").replace(new RegExp(`(.{1,${96 - indent}})(\\s|$)`, "g"), `$1\n${" ".repeat(indent)}`).trimEnd();

const items = [];
ex.questions.forEach((q, i) => {
  if (q.d === domain) items.push({ i, q });
});

let tell = 0;
let single = 0;

console.log(`\n${code} ${domain} — ${dom.name} (${dom.weight}%) · ${items.length} items\n`);

items.forEach(({ i, q }) => {
  const keys = keysOf(q);
  const flags = [q.official ? "OFFICIAL" : null, q.sc ? q.sc : null, Array.isArray(q.c) ? `Select ${keys.length}` : null]
    .filter(Boolean)
    .join(" · ");

  const kLen = keys.map((k) => q.a[k].length);
  const wLen = q.a.map((o, j) => (keys.includes(j) ? null : o.length)).filter((x) => x !== null);
  let mark = "";
  if (keys.length === 1) {
    single++;
    const gap = kLen[0] - Math.max(...wLen);
    if (gap > 0) {
      tell++;
      mark = `  <-- key longest by ${gap}`;
    }
  }

  console.log(`[${i}]${flags ? "  " + flags : ""}`);
  console.log(`  q:   ${wrap(q.q, 7)}`);
  q.a.forEach((o, j) => {
    console.log(`  ${keys.includes(j) ? "*" : " "}${j}  (${String(o.length).padStart(3)})  ${wrap(o, 13)}`);
  });
  console.log(`  len: key ${kLen.join("/")}  distractors ${wLen.join("/")}${mark}`);
  console.log(`  src: ${q.src || "(none)"}`);
  if (full) console.log(`  e:   ${wrap(q.e, 7)}`);
  console.log("");
});

const pct = single ? ((tell / single) * 100).toFixed(0) : "0";
console.log(`${tell} of ${single} single-answer items have the key as strictly longest option (${pct}%).`);
console.log(`Chance level for a 4-option item is 25%.\n`);
