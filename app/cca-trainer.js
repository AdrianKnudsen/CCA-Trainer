/* ============================================================
   CCA Trainer · logic
   ------------------------------------------------------------
   State + storage, rendering and the exam clock.

   The app covers two separate certification exams ("tracks"). Each track owns
   its domains, question bank and prose, and ships as its own data file
   (questions-architect.js, questions-associate.js), loaded via <script> tags
   right before this file (see index.html) — so EXAM_ARCHITECT and
   EXAM_ASSOCIATE are already defined as globals by the time this file runs.
   Nothing below reads a track's data directly; it all goes through exam(),
   which returns the descriptor for whichever track is currently selected.
   Loaded at the bottom of index.html — i.e. AFTER #app exists in the DOM —
   so we don't have to wait for any "ready" event.

   The styles live in cca-trainer.css.

   Note: the small anti-flash theme script is still INLINE in the
   <head> of index.html. It must run before first paint to avoid flashing
   the wrong theme, and therefore can't wait for this file to download.
   The rest of the theme logic (the toggle button itself) lives down here.
   ============================================================ */

/* ---------- State + persistence ---------- */
/* ---------- Storage keys ----------
   Stats and a paused session are per track, so studying one exam can neither
   pollute nor wipe the other's progress. The v1 keys were single-track; the
   stats are migrated to v2:architect on first run (see migrateV1) and
   deliberately left in place afterwards as a cheap backup. A v1 paused session
   is not migrated — migrateV1 says why. */
const EXAM_KEY = "cca:exam:v1"; // last selected track
function statsKey() {
  return `cca:stats:v2:${examId}`;
}
function sessionKey() {
  return `cca:session:v2:${examId}`;
}
/* Bumped whenever the in-progress session shape changes. A stored session from
   an older shape is dropped rather than half-restored: the pre-review-flow
   shape had a single `lastPick` and a running tally instead of per-item
   records, and there's no honest way to reconstruct one from the other. */
const SESSION_V = 2;
const V1_STORE_KEY = "cca:stats:v1";

/* ---------- Exam tracks ----------
   The two certifications the trainer covers. Each descriptor carries its own
   exam facts (item count, time limit, pass mark) and its own prose, so nothing
   about one exam is hardcoded in the renderer below. */
const EXAMS = [EXAM_ARCHITECT, EXAM_ASSOCIATE];
let examId = EXAMS[0].id;
function exam() {
  return EXAMS.find((e) => e.id === examId) || EXAMS[0];
}
/* Milliseconds allowed for one exam sim, from the active track's time limit.
   Derived rather than a module constant: the two exams happen to share
   120 minutes today, and a shared constant would quietly be wrong the day
   one of them changes. */
function examTargetMs() {
  return exam().minutes * 60 * 1000;
}
let mem = {}; // last-resort fallback when neither window.storage nor localStorage works
/* Storage adapter: prefer the host's window.storage; otherwise localStorage so progress
   and a paused session survive a page refresh in a normal browser; finally in-memory.
   Values are always JSON strings, matching the window.storage {value} shape. */
const store = {
  async get(k) {
    if (window.storage) {
      try {
        return await window.storage.get(k);
      } catch (e) {}
    }
    try {
      return { value: localStorage.getItem(k) };
    } catch (e) {
      return { value: k in mem ? mem[k] : null };
    }
  },
  async set(k, v) {
    if (window.storage) {
      try {
        await window.storage.set(k, v);
        return;
      } catch (e) {}
    }
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      mem[k] = v;
    }
  },
  async delete(k) {
    if (window.storage) {
      try {
        await window.storage.delete(k);
        return;
      } catch (e) {}
    }
    try {
      localStorage.removeItem(k);
    } catch (e) {
      delete mem[k];
    }
  },
};
function blankStats() {
  const s = {};
  exam().domains.forEach((d) => (s[d.id] = { seen: 0, correct: 0 }));
  return s;
}
let stats = {}; // populated by loadStats(), once the active track is known
let savedSession = null; // paused session loaded from storage

/* One-time move of the pre-two-track mastery stats onto the Architect track's
   key. Guarded on the target being absent so it can't run twice and clobber
   newer progress, and cca:stats:v1 is never deleted: that's the real study
   history, it costs nothing to keep, and it's the only safety net if this
   migration turns out to be wrong.

   A paused v1 session is deliberately not migrated. Its payload predates
   session.picks, so loadSavedSession would read the copy, see the version
   mismatch and delete it on the next load — copying it only moved something
   about to be discarded. An old paused session is therefore dropped, which
   loadSavedSession does cleanly; the stats it contributed to are untouched. */
async function migrateV1() {
  const to = "cca:stats:v2:architect";
  try {
    const target = await store.get(to);
    if (target && target.value) return; // already migrated, or newer data
    const old = await store.get(V1_STORE_KEY);
    if (old && old.value) await store.set(to, old.value);
  } catch (e) {
    /* storage unavailable — nothing to migrate, blank stats are fine */
  }
}

/* Which track was open last. Falls back to the first track when unset or when
   the stored id no longer matches a track. */
async function loadExamChoice() {
  try {
    const r = await store.get(EXAM_KEY);
    if (r && r.value && EXAMS.some((e) => e.id === r.value)) examId = r.value;
  } catch (e) {
    /* keep the default track */
  }
}
async function saveExamChoice() {
  try {
    await store.set(EXAM_KEY, examId);
  } catch (e) {}
}

async function loadStats() {
  stats = blankStats(); // every domain of the active track, zeroed
  let stored = null;
  try {
    const r = await store.get(statsKey());
    if (r && r.value) stored = JSON.parse(r.value);
  } catch (e) {
    /* unreadable — the zeroed stats above are the right fallback */
  }
  if (!stored) return;
  // Copy across only domains this track actually has. Anything else in the blob
  // belongs to another track (or a removed domain) and is dropped rather than
  // carried along.
  exam().domains.forEach((d) => {
    const v = stored[d.id];
    if (v && typeof v.seen === "number" && typeof v.correct === "number") {
      stats[d.id] = { seen: v.seen, correct: v.correct };
    }
  });
}
async function saveStats() {
  try {
    await store.set(statsKey(), JSON.stringify(stats));
  } catch (e) {}
}
async function resetStats() {
  stats = blankStats();
  try {
    await store.delete(statsKey());
  } catch (e) {}
  render();
}

/* Persist the in-progress session so it survives a reload */
async function persistSession() {
  if (!session) {
    return;
  }
  try {
    await store.set(sessionKey(), JSON.stringify({ mode, focus, session }));
  } catch (e) {}
}
async function loadSavedSession() {
  savedSession = null;
  try {
    const r = await store.get(sessionKey());
    if (!r || !r.value) return;
    const parsed = JSON.parse(r.value);
    if (!parsed.session || parsed.session.v !== SESSION_V) {
      // Session from an older app version — discard it rather than crash on a
      // field that no longer exists.
      await store.delete(sessionKey());
      return;
    }
    savedSession = parsed;
  } catch (e) {
    /* unreadable — treat as no paused session */
  }
}
async function clearSavedSession() {
  savedSession = null;
  try {
    await store.delete(sessionKey());
  } catch (e) {}
}

/* ---------- Session ---------- */
let mode = "study"; // "study" | "exam"
let focus = "weighted"; // "weighted" | domain id
let session = null;

function masteryPct(d) {
  const s = stats[d.id];
  return s.seen ? Math.round((100 * s.correct) / s.seen) : 0;
}
function overallReadiness() {
  // Weighted by exam weight across ALL domains: a domain you haven't practised
  // counts as 0, so a single domain can't push readiness to 100% — it climbs only
  // as you cover more domains AND keep answering correctly.
  const doms = exam().domains;
  const den = doms.reduce((a, d) => a + d.weight, 0); // total exam weight (100)
  let num = 0;
  doms.forEach((d) => {
    const s = stats[d.id];
    if (s.seen) num += d.weight * (s.correct / s.seen);
  });
  return den ? Math.round((num / den) * 100) : 0;
}
function totalSeen() {
  return exam().domains.reduce((a, d) => a + stats[d.id].seen, 0);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Shuffle a question's answer options and remap the correct answer to the new
   positions, so the right answer isn't always in the same place. `order[newPos]`
   is the old index, so the new index of an old index is order.indexOf(old) —
   applied element-wise for a multiple-response set. */
function shuffleOptions(q) {
  const order = shuffle(q.a.map((_, i) => i));
  const remap = (old) => order.indexOf(old);
  return {
    ...q,
    a: order.map((i) => q.a[i]),
    c: Array.isArray(q.c) ? q.c.map(remap).sort((x, y) => x - y) : remap(q.c),
  };
}

/* ---------- Answers ----------
   A question's correct answer is either a single option index (`c: 2`) or a set
   of them (`c: [1, 3]`) for a multiple-response item, which the real exam also
   uses. Array.isArray(q.c) is the whole mechanism, which is why the 151
   single-answer Architect questions written before multiple-response existed
   need no edits at all. */
function correctSet(q) {
  return Array.isArray(q.c) ? q.c : [q.c];
}
function isMulti(q) {
  return Array.isArray(q.c);
}
/* How many options the candidate must select — stated on the item, as the real
   exam states it. */
function pickCount(q) {
  return correctSet(q).length;
}
/* All-or-nothing, matching the exam: a partly-right multiple-response item
   scores zero. `sel` is always an array, single-answer items included. */
function isCorrect(q, sel) {
  const want = correctSet(q);
  return sel.length === want.length && want.every((i) => sel.includes(i));
}
function answeredCount() {
  return session.picks.filter((p) => p.sel.length > 0).length;
}
function flaggedCount() {
  return session.picks.filter((p) => p.flagged).length;
}
/* Score the whole session from its final answers. Deliberately a pure function
   of session.picks rather than a running tally: with free navigation in exam
   mode an item can be answered, revisited and changed, and a running counter
   would double-count it. */
function scoreSession() {
  let correct = 0;
  const byDom = {};
  exam().domains.forEach((d) => (byDom[d.id] = { seen: 0, correct: 0 }));
  session.items.forEach((it, k) => {
    const p = session.picks[k];
    const ok = p.sel.length > 0 && isCorrect(it, p.sel);
    if (ok) correct++;
    // An unanswered item counts as seen and wrong — that's how the real exam
    // scores it, and skipping it here would flatter the mastery stats.
    byDom[it.d].seen++;
    if (ok) byDom[it.d].correct++;
  });
  return { correct, byDom };
}

/* Keep questions that share a scenario together: walk the (already shuffled) pool,
   and whenever we hit the first unplaced question of a scenario, pull all of that
   scenario's other selected questions in right after it. Standalone questions keep
   their order. */
function regroupScenarios(items) {
  const out = [];
  const placed = new Array(items.length).fill(false);
  for (let i = 0; i < items.length; i++) {
    if (placed[i]) continue;
    out.push(items[i]);
    placed[i] = true;
    const sc = items[i].sc;
    if (sc) {
      for (let j = i + 1; j < items.length; j++) {
        if (!placed[j] && items[j].sc === sc) {
          out.push(items[j]);
          placed[j] = true;
        }
      }
    }
  }
  return out;
}

function buildSession() {
  const ex = exam();
  let pool;
  if (focus === "weighted") {
    // proportional-ish mix across all domains
    const n = mode === "exam" ? ex.items : 10;
    // weighted sampling: roughly follow exam weights
    const picks = [];
    const byDom = {};
    ex.domains.forEach(
      (d) => (byDom[d.id] = shuffle(ex.questions.filter((q) => q.d === d.id))),
    );
    const targets = ex.domains.map((d) => ({
      id: d.id,
      t: Math.max(1, Math.round((n * d.weight) / 100)),
    }));
    targets.forEach((tt) => {
      for (let i = 0; i < tt.t && byDom[tt.id].length; i++) {
        picks.push(byDom[tt.id].pop());
      }
    });
    pool = shuffle(picks);
  } else {
    pool = shuffle(ex.questions.filter((q) => q.d === focus));
  }
  // shuffle the answer options for each picked question (stored in the session,
  // so the order stays stable across pause/resume)
  pool = pool.map(shuffleOptions);
  pool = regroupScenarios(pool); // questions sharing a scenario appear back-to-back
  session = {
    v: SESSION_V,
    items: pool,
    i: 0,
    // One record per item, so an answer can be revisited and changed without
    // the stats being touched more than once (see scoreSession).
    picks: pool.map(() => ({ sel: [], flagged: false, revealed: false })),
    remainingMs: mode === "exam" ? examTargetMs() : null,
    pauses: 0,
    submitted: false,
    timedOut: false,
  };
}

/* ---------- Rendering ---------- */
const app = document.getElementById("app");
function dom(id) {
  return exam().domains.find((d) => d.id === id);
}

function render() {
  if (session) {
    renderQuestion();
    return;
  }
  renderHome();
}

/* A faint "?" + a hover/focus overlay scoped to the card it sits in.
   `body` is the explanation HTML shown inside that card's frame. */
function helpBlock(body) {
  return `
      <button class="help-btn" type="button" aria-label="What is this?" title="What is this?">?</button>
      <div class="help-overlay" role="note">
        <span class="help-tag">What is this?</span>
        <div class="help-body">${body}</div>
      </div>`;
}

/* The exam switcher. Rendered only by renderHome(), so it simply doesn't exist
   in the DOM during a session — you can't change track mid-test, the same way
   the Focus field is already absent in exam mode.

   Not a role="tablist": this swaps the app's entire dataset rather than
   revealing one panel of a tab group. Toggle buttons in a labelled group
   describe what actually happens. */
function examTabs() {
  return `
    <div class="examtabs" role="group" aria-label="Exam" id="examTabs">
      ${EXAMS.map(
        (e) =>
          `<button class="chip" data-v="${e.id}" aria-pressed="${e.id === examId}">${e.tab}<span class="examtabs-code">${e.code}</span></button>`,
      ).join("")}
    </div>`;
}

/* Switching track reloads that track's own stats and paused session; the other
   track's stored data is never touched. */
async function switchExam(id) {
  if (id === examId) return;
  examId = id;
  await saveExamChoice();
  focus = "weighted"; // domain ids aren't comparable across tracks
  savedSession = null;
  await loadStats();
  await loadSavedSession();
  renderHome();
}

function renderHome() {
  const ex = exam();
  const ready = overallReadiness();
  const seen = totalSeen();
  app.innerHTML = `
    ${examTabs()}
    <div class="eyebrow">${ex.copy.eyebrow}</div>
    <h1>CCA Trainer</h1>
    <p class="lede">${ex.copy.lede}</p>

    <div class="card">
      <div class="meter-head">
        <h2>Mastery per domain</h2>
        <span class="sub">width = exam weight · fill = % correct so far</span>
      </div>
      <div class="barlabels">
        ${ex.domains
          .map(
            (d) => `
          <div class="barlabel" style="flex:${d.weight};">
            <div class="nm">${d.short}</div>
            <div class="wt">${d.weight}%</div>
          </div>`,
          )
          .join("")}
      </div>
      <div class="bar" role="img" aria-label="Mastery per domain, width corresponds to exam weight">
        ${ex.domains
          .map(
            (d) => `
          <div class="seg" style="flex:${d.weight}; background:${d.hex}1f;">
            <div class="fill" style="height:${masteryPct(d)}%; background:${d.hex};"></div>
          </div>`,
          )
          .join("")}
      </div>
      <div class="legend">
        ${ex.domains
          .map((d) => {
            const s = stats[d.id];
            return `
          <div class="row"><span class="dot" style="background:${d.hex}"></span>${d.short}
          <span class="pct">${s.seen ? masteryPct(d) + "% of " + s.seen + " tried" : "not tried yet"}</span></div>`;
          })
          .join("")}
      </div>
      <div class="readiness">
        <span class="num">${seen ? ready + "%" : "–"}</span>
        <span class="cap">weighted readiness${seen ? "" : " · no practice yet"}</span>
      </div>
      ${helpBlock(ex.copy.masteryHelp)}
    </div>

    ${
      savedSession
        ? `
    <div class="card mt resume">
      <h2>Paused session</h2>
      <p class="resume-meta">${dom(savedSession.session.items[savedSession.session.i].d).short} · question ${savedSession.session.i + 1} / ${savedSession.session.items.length} · ${savedSession.mode === "exam" ? "exam sim" : "practice"}</p>
      <div class="btnrow">
        <button class="btn" id="resumeBtn">Resume session →</button>
        <button class="btn ghost sm" id="dropBtn">Discard</button>
      </div>
      ${helpBlock(`
        <p>You paused a session earlier. <b>Resume</b> picks it up exactly where you left off — same questions, same order, and the exam clock too if it was an exam sim.</p>
        <p><b>Discard</b> throws it away so you can start fresh. Starting a brand-new session also discards a paused one.</p>`)}
    </div>`
        : ""
    }

    <div class="card mt">
      <h2>Start a new session</h2>
      ${
        ex.questions.length === 0
          ? `<p class="emptybank">No questions in this bank yet. The ${ex.tab} question bank is still being written — the seven domains and their weights above are already the real ones from the official Exam Guide, so the dashboard works, but there's nothing to practise on yet.</p>`
          : `
      <div class="controls">
        <div class="field">
          <label>Mode</label>
          <div class="opts" id="modeOpts">
            <button class="chip" data-v="study" aria-pressed="${mode === "study"}">Practice · explanations as you go</button>
            <button class="chip" data-v="exam" aria-pressed="${mode === "exam"}">Exam sim · answers at the end</button>
          </div>
        </div>
        ${
          mode === "study"
            ? `
        <div class="field">
          <label>Focus</label>
          <div class="opts" id="focusOpts">
            <button class="chip" data-v="weighted" aria-pressed="${focus === "weighted"}">Weighted mix</button>
            ${ex.domains.map((d) => `<button class="chip" data-v="${d.id}" aria-pressed="${focus === d.id}"${focus === d.id ? ` style="background:${d.hex};border-color:${d.hex};color:#fff"` : ""}>${d.short}</button>`).join("")}
          </div>
        </div>`
            : ""
        }
      </div>
      <div class="btnrow">
        <button class="btn" id="startBtn">${savedSession ? "Start new (discard paused) →" : "Start session →"}</button>
      </div>`
      }
      ${helpBlock(ex.copy.startHelp)}
    </div>

    <div class="disclaimer">${ex.copy.disclaimer}</div>
  `;
  document.getElementById("examTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    switchExam(b.dataset.v);
  });
  const modeOpts = document.getElementById("modeOpts");
  if (modeOpts)
    modeOpts.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      mode = b.dataset.v;
      if (mode === "exam") focus = "weighted"; // exam always uses the weighted mix
      renderHome();
    });
  const focusOpts = document.getElementById("focusOpts");
  if (focusOpts)
    focusOpts.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      focus = b.dataset.v;
      renderHome();
    });
  const startBtn = document.getElementById("startBtn");
  if (startBtn)
    startBtn.addEventListener("click", async () => {
      await clearSavedSession();
      buildSession();
      await persistSession();
      render();
    });
  const resB = document.getElementById("resumeBtn");
  if (resB)
    resB.addEventListener("click", () => {
      mode = savedSession.mode;
      focus = savedSession.focus;
      session = savedSession.session;
      savedSession = null;
      render();
    });
  const drpB = document.getElementById("dropBtn");
  if (drpB)
    drpB.addEventListener("click", async () => {
      await clearSavedSession();
      renderHome();
    });
}

function renderQuestion() {
  const it = session.items[session.i];
  const p = session.picks[session.i];
  const d = dom(it.d);
  const total = session.items.length;
  const multi = isMulti(it);
  const examMode = mode === "exam";
  app.innerHTML = `
    <div class="qmeta">
      <span class="domtag" style="background:${d.hex}">${d.short}</span>
      <div class="qmeta-right">
        ${examMode ? '<span class="examclock" id="examTimer" aria-hidden="true"></span>' : ""}
        <span class="progress-mini">${session.i + 1} / ${total} · ${examMode ? "exam sim" : "practice"}</span>
        ${examMode ? `<button class="link-btn flag${p.flagged ? " on" : ""}" id="flagBtn" aria-pressed="${p.flagged}" title="Mark this item to come back to">${p.flagged ? "★ Flagged" : "☆ Flag"}</button>` : ""}
        ${examMode ? '<button class="link-btn" id="reviewBtn" title="See all items and their status">Review</button>' : ""}
        <button class="link-btn" id="pauseBtn" title="${examMode ? "Stops the clock and saves. The real exam can't be paused — the summary counts your pauses." : "Save and go to overview"}">Pause</button>
        <button class="link-btn danger" id="abortBtn" title="Discard this session">Quit</button>
      </div>
    </div>
    <div class="card">
      ${
        it.sc && exam().scenarios && exam().scenarios[it.sc]
          ? `<div class="scenario">
        <div class="scenario-head"><span class="scenario-tag">Scenario</span><span class="scenario-title">${exam().scenarios[it.sc].title}</span></div>
        <p class="scenario-context">${exam().scenarios[it.sc].context}</p>
      </div>`
          : ""
      }
      <div class="qtext">${it.q}</div>
      ${multi ? `<div class="selecthint">Select ${pickCount(it)}</div>` : ""}
      <div class="answers" id="answers"${multi ? ` role="group" aria-label="Select ${pickCount(it)} of ${it.a.length}"` : ""}>
        ${it.a
          .map((opt, k) => {
            const on = p.sel.includes(k);
            // Multiple-response options are a selection from a set, so they get
            // checkbox semantics; a screen reader then announces checked state.
            // Single-answer options stay plain buttons: one click commits, which
            // is a command, not a toggle.
            /* At the cap, an unchecked option can't be checked until something
               is unchecked, so say so rather than leaving a button that looks
               live and does nothing. */
            const atCap = multi && !on && !p.revealed && p.sel.length >= pickCount(it);
            const sem = multi
              ? ` role="checkbox" aria-checked="${on}"${atCap ? ' aria-disabled="true"' : ""}`
              : "";
            return `<button class="ans${on ? " picked" : ""}" data-k="${k}"${sem}><span class="key">${String.fromCharCode(65 + k)}</span><span>${opt}</span></button>`;
          })
          .join("")}
      </div>
      <div id="explainSlot"></div>
      <div class="btnrow" id="navSlot"></div>
    </div>
  `;
  document.getElementById("answers").addEventListener("click", (e) => {
    const b = e.target.closest(".ans");
    if (!b) return;
    onOptionClick(parseInt(b.dataset.k, 10));
  });
  const flagBtn = document.getElementById("flagBtn");
  if (flagBtn)
    flagBtn.addEventListener("click", () => {
      p.flagged = !p.flagged;
      persistSession();
      renderQuestion();
    });
  const reviewBtn = document.getElementById("reviewBtn");
  if (reviewBtn) reviewBtn.addEventListener("click", renderReview);
  document.getElementById("pauseBtn").addEventListener("click", async () => {
    timerFreeze(); // stop the exam clock; resumes on continue
    if (examMode) session.pauses = (session.pauses || 0) + 1;
    await persistSession(); // already persisted, but ensure latest
    await loadSavedSession(); // refresh savedSession for the home banner
    session = null;
    renderHome();
  });
  document.getElementById("abortBtn").addEventListener("click", async () => {
    timerFreeze();
    await clearSavedSession();
    session = null;
    renderHome();
  });
  renderNav();
  // In practice mode, an item already answered stays revealed across a
  // pause/resume or a re-render.
  if (!examMode && p.revealed) revealAnswer();
  // Exam-sim clock (countdown); freezes when leaving this screen.
  if (examMode) {
    const t = document.getElementById("examTimer");
    if (t) renderTimerInto(t);
    timerEnsureRunning();
  }
}

/* Clicking an option. Practice keeps its original behaviour exactly: one click
   commits the answer and reveals it immediately, with no extra submit step.
   Multiple-response items have to toggle instead — there's no other way to know
   the candidate has finished choosing. */
function onOptionClick(k) {
  const it = session.items[session.i];
  const p = session.picks[session.i];
  if (mode === "study" && p.revealed) return; // already committed
  if (isMulti(it)) {
    const at = p.sel.indexOf(k);
    if (at !== -1) p.sel.splice(at, 1);
    /* Selection is capped at the number of answers the item states, so a
       "Select 3" item accepts three and a "Select 2" two. Picking beyond the
       cap does nothing rather than replacing an earlier pick: which one to drop
       is the candidate's decision, so changing your mind means deselecting one
       and then choosing another. Before the cap, an over-selection left the
       submit button reading "Select -1 more" and disabled. */
    else if (p.sel.length < pickCount(it)) p.sel.push(k);
    else return;
    p.sel.sort((a, b) => a - b);
  } else {
    p.sel = [k];
    if (mode === "study") {
      commitPractice();
      persistSession();
      renderQuestion();
      return;
    }
  }
  persistSession();
  renderQuestion();
}

/* Practice mode commits to the mastery stats as you go, one item at a time —
   the original behaviour. Exam mode commits nothing until submit. */
function commitPractice() {
  const it = session.items[session.i];
  const p = session.picks[session.i];
  p.revealed = true;
  const st = stats[it.d];
  st.seen++;
  if (isCorrect(it, p.sel)) st.correct++;
  saveStats();
}

/* The buttons under the answers. Practice is one-way. Exam mode gets free
   back/next plus submit, because the real exam does. */
function renderNav() {
  const it = session.items[session.i];
  const p = session.picks[session.i];
  const last = session.i === session.items.length - 1;
  const slot = document.getElementById("navSlot");
  if (mode === "study") {
    if (isMulti(it) && !p.revealed) {
      const need = pickCount(it);
      const ready = p.sel.length === need;
      slot.innerHTML = `<button class="btn" id="submitAnsBtn"${ready ? "" : " disabled"}>${ready ? "Check answer →" : `Select ${need - p.sel.length} more`}</button>`;
      document.getElementById("submitAnsBtn").addEventListener("click", () => {
        commitPractice();
        persistSession();
        renderQuestion();
      });
      return;
    }
    if (!p.revealed) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = `<button class="btn" id="nextBtn">${last ? "See summary →" : "Next →"}</button>`;
    document.getElementById("nextBtn").addEventListener("click", next);
    return;
  }
  slot.innerHTML = `
    <button class="btn ghost sm" id="prevBtn"${session.i === 0 ? " disabled" : ""}>← Back</button>
    <button class="btn" id="nextBtn"${last ? " disabled" : ""}>Next →</button>
    <button class="btn ghost sm" id="submitExamBtn">Submit exam</button>`;
  document
    .getElementById("prevBtn")
    .addEventListener("click", () => goTo(session.i - 1));
  document
    .getElementById("nextBtn")
    .addEventListener("click", () => goTo(session.i + 1));
  document
    .getElementById("submitExamBtn")
    .addEventListener("click", confirmSubmit);
}

function goTo(i) {
  if (i < 0 || i >= session.items.length) return;
  session.i = i;
  persistSession();
  renderQuestion();
}

/* Practice-mode reveal: mark the right answer, mark a wrong pick, explain. */
function revealAnswer() {
  const it = session.items[session.i];
  const p = session.picks[session.i];
  const want = correctSet(it);
  const ok = isCorrect(it, p.sel);
  [...document.querySelectorAll(".ans")].forEach((b, idx) => {
    b.setAttribute("disabled", "true");
    if (want.includes(idx)) b.classList.add("correct");
    if (p.sel.includes(idx) && !want.includes(idx)) b.classList.add("wrong");
  });
  document.getElementById("explainSlot").innerHTML = `
      <div class="explain">
        <div class="verdict ${ok ? "ok" : "no"}">${ok ? "Correct" : "Wrong"}</div>
        <p>${it.e}</p>
      </div>`;
}

function next() {
  if (session.i < session.items.length - 1) {
    goTo(session.i + 1);
  } else {
    timerFreeze();
    clearSavedSession();
    renderSummary();
  }
}

/* The review screen: every item with its status, so you can find the ones you
   parked. The real exam has this, and using it well — budgeting time, coming
   back to flagged items — is part of what's being practised. */
function renderReview() {
  timerFreeze();
  const total = session.items.length;
  const unanswered = total - answeredCount();
  app.innerHTML = `
    <div class="qmeta">
      <span class="domtag" style="background:var(--ink-soft)">Review</span>
      <div class="qmeta-right">
        <span class="examclock" id="examTimer" aria-hidden="true"></span>
        <span class="progress-mini">${answeredCount()} / ${total} answered · ${flaggedCount()} flagged</span>
      </div>
    </div>
    <div class="card">
      <h2>Review your answers</h2>
      <p class="resume-meta">${unanswered === 0 ? "Every item has an answer." : `${unanswered} item${unanswered === 1 ? "" : "s"} still unanswered.`}</p>
      <div class="reviewgrid" id="reviewGrid">
        ${session.items
          .map((it, k) => {
            const p = session.picks[k];
            const state = p.sel.length ? "done" : "todo";
            return `<button class="revcell ${state}${p.flagged ? " flagged" : ""}" data-k="${k}" title="${dom(it.d).short}${p.flagged ? " · flagged" : ""}${p.sel.length ? "" : " · unanswered"}">${k + 1}</button>`;
          })
          .join("")}
      </div>
      <div class="reviewlegend">
        <span><span class="swatch done"></span>answered</span>
        <span><span class="swatch todo"></span>unanswered</span>
        <span><span class="swatch flagged"></span>flagged</span>
      </div>
      <div class="btnrow">
        <button class="btn ghost sm" id="backToQBtn">← Back to question ${session.i + 1}</button>
        <button class="btn" id="submitExamBtn2">Submit exam</button>
      </div>
    </div>
  `;
  document.getElementById("reviewGrid").addEventListener("click", (e) => {
    const b = e.target.closest(".revcell");
    if (!b) return;
    goTo(parseInt(b.dataset.k, 10));
  });
  document
    .getElementById("backToQBtn")
    .addEventListener("click", () => goTo(session.i));
  document
    .getElementById("submitExamBtn2")
    .addEventListener("click", confirmSubmit);
  const t = document.getElementById("examTimer");
  if (t) renderTimerInto(t);
  timerEnsureRunning();
}

/* Submitting is explicit and irreversible, so it names what's still blank. */
function confirmSubmit() {
  const unanswered = session.items.length - answeredCount();
  const msg = unanswered
    ? `Submit the exam with ${unanswered} item${unanswered === 1 ? "" : "s"} unanswered? Unanswered items are scored as incorrect. This can't be undone.`
    : "Submit the exam? This can't be undone.";
  if (confirm(msg)) submitExam(false);
}

/* Commits the stats and shows the summary. Guarded by session.submitted so the
   countdown expiring while a confirm dialog is open can't score twice. */
function submitExam(timedOut) {
  if (!session || session.submitted) return;
  session.submitted = true;
  session.timedOut = !!timedOut;
  timerFreeze();
  const { byDom } = scoreSession();
  exam().domains.forEach((d) => {
    stats[d.id].seen += byDom[d.id].seen;
    stats[d.id].correct += byDom[d.id].correct;
  });
  saveStats();
  clearSavedSession();
  renderSummary();
}

function renderSummary() {
  const ex = exam();
  const total = session.items.length;
  // Scored from the final per-item answers, so a changed answer counts once.
  const { correct, byDom } = scoreSession();
  const pct = Math.round((100 * correct) / total);
  const passed = pct >= ex.passPct;
  const unanswered = total - answeredCount();
  const practiced = ex.domains.filter((d) => byDom[d.id].seen > 0);
  // weakest practiced domain
  let weak = null,
    wv = 2;
  practiced.forEach((d) => {
    const r = byDom[d.id].correct / byDom[d.id].seen;
    if (r < wv) {
      wv = r;
      weak = d;
    }
  });
  // Exam-sim reporting: how long it took, whether the clock ran out, whether
  // anything was left blank, and how many times the clock was stopped — the
  // real exam can't be paused, so a paused run isn't a clean rehearsal.
  const used = examTargetMs() - (session.remainingMs || 0);
  const examTime =
    mode === "exam"
      ? `<p class="resume-meta">⏱ Time used: ${fmtClock(used)} of ${fmtClock(examTargetMs())}${
          session.timedOut ? " · time expired" : ""
        }${unanswered ? ` · ${unanswered} unanswered, scored as incorrect` : ""}${
          session.pauses ? ` · paused ${session.pauses}×` : ""
        }</p>`
      : "";

  app.innerHTML = `
    <div class="eyebrow">${session.timedOut ? "Time expired" : "Session complete"}</div>
    <h1>${correct} / ${total} correct</h1>
    <div class="passmark ${passed ? "pass" : "fail"}">${passed ? "✓ Pass" : "✗ Not yet"} · ${pct}% · ${ex.passPct}% to pass</div>
    <p class="lede">${passed ? `At or above the ${ex.passPct}% pass mark — that's the level you want going into the proctored exam.` : pct >= 60 ? `Just under the ${ex.passPct}% pass mark. Review your weak domains and run it again.` : "Early days. Take the weakest domains one at a time in practice mode."}</p>
    ${examTime}

    <div class="card">
      <h2>This session · per domain</h2>
      <div class="sumgrid">
        ${practiced
          .map((d) => {
            const s = byDom[d.id];
            const r = Math.round((100 * s.correct) / s.seen);
            return `
          <div class="sumrow">
            <span class="nm">${d.short}</span>
            <span class="track"><span class="trackfill" style="width:${r}%; background:${d.hex}"></span></span>
            <span class="sc">${s.correct}/${s.seen}</span>
          </div>`;
          })
          .join("")}
      </div>
      ${weak ? `<div class="focusnote">Next focus: <b>${weak.name}</b>. It was the weakest this session — drill it on its own in practice mode until you're consistent.</div>` : ""}
    </div>

    <div class="btnrow">
      <button class="btn" id="againBtn">New session →</button>
      <button class="btn ghost sm" id="homeBtn">To overview</button>
    </div>
  `;
  document.getElementById("againBtn").addEventListener("click", async () => {
    buildSession();
    await persistSession();
    render();
  });
  document.getElementById("homeBtn").addEventListener("click", () => {
    session = null;
    render();
  });
}

/* ---------- Theme toggle ---------- */
const THEME_KEY = "cca:theme:v1";
const MOON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const dark = theme === "dark";
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = dark ? SUN_SVG : MOON_SVG; // sun while dark (click → light); moon while light
    btn.setAttribute("aria-pressed", String(dark));
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }
}

function setupThemeToggle() {
  // Sync the button (icon/aria) with whatever the <head> script already set.
  applyTheme(currentTheme());
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* storage blocked */
      }
    });
  }
  // Live-follow OS changes ONLY while no explicit choice is stored.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      let hasChoice = false;
      try {
        hasChoice = !!localStorage.getItem(THEME_KEY);
      } catch (_) {}
      if (!hasChoice) applyTheme(e.matches ? "dark" : "light");
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange); // older Safari
  }
}

/* ---------- Exam timer (countdown with a hard stop; exam mode only) ----------
   The real exam shows time REMAINING and ends when it hits zero, so this does
   too — that's the thing worth rehearsing.

   timerRunningSince is deliberately NOT persisted: it's an anchor against the
   wall clock, and it's meaningless after a reload. On reload the countdown
   picks up from the last persisted remainingMs (saved every ~5s), so a crash or
   a closed laptop can hand back up to 5 seconds rather than draining the whole
   clock while the page wasn't open. */
const WARN_MS = 10 * 60 * 1000; // "you have 10 minutes left" territory
let timerRunningSince = null; // ms timestamp while ticking, else null (NOT persisted)
let timerInterval = null;
let timerTickCount = 0;

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function remainingMs() {
  return Math.max(
    0,
    session.remainingMs == null ? examTargetMs() : session.remainingMs,
  );
}
function renderTimerInto(el) {
  const left = remainingMs();
  el.textContent = `⏱ ${fmtClock(left)} left`;
  el.classList.toggle("warn", left > 0 && left <= WARN_MS);
  el.classList.toggle("over", left === 0);
}
function timerTick() {
  if (!session || session.submitted || timerRunningSince == null) return;
  const now = Date.now();
  session.remainingMs = remainingMs() - (now - timerRunningSince);
  timerRunningSince = now;
  if (session.remainingMs <= 0) {
    session.remainingMs = 0;
    submitExam(true); // hard stop: unanswered items score as incorrect
    return;
  }
  const el = document.getElementById("examTimer");
  if (el) renderTimerInto(el);
  if (++timerTickCount % 5 === 0) persistSession(); // light periodic save (~5s)
}
function timerEnsureRunning() {
  if (mode !== "exam" || !session || session.submitted) return;
  if (session.remainingMs == null) session.remainingMs = examTargetMs();
  if (session.remainingMs <= 0) {
    submitExam(true);
    return;
  }
  if (timerRunningSince == null) timerRunningSince = Date.now();
  if (timerInterval == null) timerInterval = setInterval(timerTick, 1000);
}
function timerFreeze() {
  if (timerRunningSince != null && session) {
    session.remainingMs = Math.max(
      0,
      remainingMs() - (Date.now() - timerRunningSince),
    );
  }
  timerRunningSince = null;
  if (timerInterval != null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (session && !session.submitted) persistSession();
}

/* ---------- Clear-progress button ---------- */
function setupClearButton() {
  const btn = document.getElementById("clearBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (
      confirm(
        `Reset your ${exam().tab} progress (mastery per domain)? This can't be undone. Your other exam's progress, your paused session and your theme are kept.`,
      )
    ) {
      resetStats(); // clears stored stats + re-renders
    }
  });
}

/* ---------- boot ---------- */
setupThemeToggle();
setupClearButton();
(async function () {
  await migrateV1();
  await loadExamChoice();
  await loadStats();
  await loadSavedSession();
  render();
})();
