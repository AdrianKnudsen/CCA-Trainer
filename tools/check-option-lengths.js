/* Option-length tells, per domain, for both built banks.

   Usage:
     node tools/check-option-lengths.js              summary per domain
     node tools/check-option-lengths.js --items      also list every tell-bearing item

   Two metrics, and the order matters.

   PRIMARY: the share of single-answer items where the keyed option is longer
   than every distractor BY MORE THAN A VISIBLE MARGIN. "Pick the longest
   option" is what a candidate can actually exploit, and option shuffling does
   not wash it out the way it washes out position bias.

   The margin matters, and getting this wrong cost a pass of work. The obvious
   metric is "is the key strictly the longest", but that fires on a
   one-character difference nobody can see. Measured after the d2 length pass:
   its strict rate barely moved, 14/21 to 13/21, while its worst gap fell from
   48 characters to 10 and its median from 14 to 4 — the tell was gone and the
   metric could not tell. So the threshold is EXPLOITABLE_GAP below, and it
   separates the two banks cleanly where the strict measure does not:

       gap > 0   CCAR-F 65%   CCAO-F 23%
       gap > 5   CCAR-F 51%   CCAO-F 13%
       gap > 10  CCAR-F 35%   CCAO-F  9%     <- the discriminator
       gap > 20  CCAR-F 22%   CCAO-F  4%

   CCAO-F is the reference rather than a theoretical baseline: it is the same
   material, reviewed to parity by hand, and the tool prints its figure next to
   the Architect one so the comparison is in front of you. (For the strict
   measure a chance baseline does exist — 1/options, so 25% on four options —
   and that is still reported as context.)

   SECONDARY: the pooled mean keyed vs distractor option length, with the
   >20-character marker `docs/drafts/check-drafts.js` applies to the Associate
   drafts. It is a summary, not a target: closing every domain to a mean gap of
   19 still leaves 60% of items with the key strictly longest, because the mean
   hides which items carry it. Associate's real achieved standard is |gap| <= 7
   per domain, reached item by item.

   Reports only. It never fails a run, deliberately: which distractor to lift is
   a judgement about plausibility that no character count can make. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BANKS = ["questions-architect.js", "questions-associate.js"];
const APP_DIR = path.join(__dirname, "..", "app");
const MEAN_MARKER = 20;
const EXPLOITABLE_GAP = 10; // characters; below this the key being longest is not visible
const RATE_MARKER = 0.2; // flag a domain above this exploitable rate
const showItems = process.argv.includes("--items");

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

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

for (const ex of loadTracks()) {
  console.log(`\n${ex.code}`);

  const per = {};
  ex.domains.forEach(
    (d) => (per[d.id] = { n: 0, multi: 0, key: [], wrong: [], tells: [], single: 0, exploit: 0, opts: [] }),
  );

  ex.questions.forEach((q, i) => {
    const r = per[q.d];
    if (!r) return;
    const keys = Array.isArray(q.c) ? q.c : [q.c];
    r.n++;
    r.opts.push(q.a.length);
    if (Array.isArray(q.c)) r.multi++;

    q.a.forEach((o, j) => (keys.includes(j) ? r.key : r.wrong).push(o.length));

    /* Only single-answer items can have "the key is the longest option" mean
       anything: on a multiple-response item a candidate picking the longest
       options still has to pick the right number of them. */
    if (keys.length === 1) {
      r.single++;
      const kl = q.a[keys[0]].length;
      const gap = kl - Math.max(...q.a.filter((_, j) => j !== keys[0]).map((o) => o.length));
      if (gap > 0) r.tells.push({ i, gap, q: q.q.replace(/\s+/g, " ").slice(0, 62) });
      if (gap > EXPLOITABLE_GAP) r.exploit++;
    }
  });

  const allKey = [];
  const allWrong = [];
  let allTells = 0;
  let allSingle = 0;
  let allExploit = 0;

  ex.domains.forEach((d) => {
    const r = per[d.id];
    allKey.push(...r.key);
    allWrong.push(...r.wrong);
    allTells += r.tells.length;
    allSingle += r.single;
    allExploit += r.exploit;

    const ak = avg(r.key);
    const aw = avg(r.wrong);
    const gap = ak - aw;
    const chance = 100 / (avg(r.opts) || 4);
    const rate = r.single ? (r.tells.length / r.single) * 100 : 0;
    const gaps = r.tells.map((t) => t.gap);

    const exRate = r.single ? (r.exploit / r.single) * 100 : 0;
    console.log(
      `  ${d.id}  n=${String(r.n).padStart(3)} multi=${String(r.multi).padStart(2)}` +
        `  exploitable (>${EXPLOITABLE_GAP}) ${String(r.exploit).padStart(3)}/${String(r.single).padEnd(3)}` +
        ` = ${exRate.toFixed(0).padStart(3)}%` +
        `${exRate > RATE_MARKER * 100 ? "  <-- TELL" : ""}`,
    );
    console.log(
      `        strictly longest ${String(r.tells.length).padStart(3)}/${String(r.single).padEnd(3)}` +
        ` = ${rate.toFixed(0).padStart(3)}% (chance ${chance.toFixed(0)}%)` +
        `   gap median ${median(gaps).toFixed(0).padStart(3)}  max ${String(Math.max(0, ...gaps)).padStart(3)}`,
    );
    console.log(
      `        mean length: key ${ak.toFixed(1)}, distractor ${aw.toFixed(1)}, gap ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}` +
        `${Math.abs(gap) > MEAN_MARKER ? "  <-- mean marker" : ""}`,
    );

    if (showItems && r.tells.length) {
      r.tells
        .sort((a, b) => b.gap - a.gap)
        .forEach((t) => console.log(`          [${String(t.i).padStart(3)}] +${String(t.gap).padStart(3)}  ${t.q}`));
    }
  });

  const ak = avg(allKey);
  const aw = avg(allWrong);
  const rate = allSingle ? (allTells / allSingle) * 100 : 0;
  const exAll = allSingle ? (allExploit / allSingle) * 100 : 0;
  console.log(
    `  ALL      exploitable ${allExploit}/${allSingle} = ${exAll.toFixed(1)}%` +
      `   strictly longest ${allTells}/${allSingle} = ${rate.toFixed(1)}%` +
      `   mean gap ${(ak - aw).toFixed(1)}`,
  );
}

console.log(
  `\nPrimary metric is the exploitable rate: key longer than every distractor by more` +
    `\nthan ${EXPLOITABLE_GAP} characters. Compare a CCAR-F domain against the CCAO-F figures above —` +
    `\nthat bank was brought to parity by hand and is the standard here. Neither the` +
    `\nstrict rate nor the mean gap is a target: the strict rate cannot tell a` +
    `\none-character gap from a fifty-character one, and the mean hides which items carry it.\n`,
);
