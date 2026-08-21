/* ============================================================
   CCA Trainer · logic
   ------------------------------------------------------------
   State + storage, rendering and the exam clock. The DOMAINS,
   SCENARIOS and Q data live in questions.js, loaded via a <script>
   tag right before this file (see index.html) — so they're already
   defined as globals by the time this file runs.
   Loaded at the bottom of index.html — i.e. AFTER #app exists in the DOM —
   so we don't have to wait for any "ready" event.

   The styles live in cca-trainer.css.

   Note: the small anti-flash theme script is still INLINE in the
   <head> of index.html. It must run before first paint to avoid flashing
   the wrong theme, and therefore can't wait for this file to download.
   The rest of the theme logic (the toggle button itself) lives down here.
   ============================================================ */

/* ---------- State + persistence ---------- */
const STORE_KEY = "cca:stats:v1";
const SESSION_KEY = "cca:session:v1";
const PASS_PCT = 72; // CCA pass mark is 720/1000 = 72%
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
  DOMAINS.forEach((d) => (s[d.id] = { seen: 0, correct: 0 }));
  return s;
}
let stats = blankStats();
let savedSession = null; // paused session loaded from storage

async function loadStats() {
  try {
    const r = await store.get(STORE_KEY);
    if (r && r.value) {
      stats = JSON.parse(r.value);
    }
  } catch (e) {
    /* keep blank stats */
  }
  // backfill any new domains
  DOMAINS.forEach((d) => {
    if (!stats[d.id]) stats[d.id] = { seen: 0, correct: 0 };
  });
}
async function saveStats() {
  try {
    await store.set(STORE_KEY, JSON.stringify(stats));
  } catch (e) {}
}
async function resetStats() {
  stats = blankStats();
  try {
    await store.delete(STORE_KEY);
  } catch (e) {}
  render();
}

/* Persist the in-progress session so it survives a reload */
async function persistSession() {
  if (!session) {
    return;
  }
  try {
    await store.set(SESSION_KEY, JSON.stringify({ mode, focus, session }));
  } catch (e) {}
}
async function loadSavedSession() {
  try {
    const r = await store.get(SESSION_KEY);
    if (r && r.value) {
      savedSession = JSON.parse(r.value);
    }
  } catch (e) {}
}
async function clearSavedSession() {
  savedSession = null;
  try {
    await store.delete(SESSION_KEY);
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
  const den = DOMAINS.reduce((a, d) => a + d.weight, 0); // total exam weight (100)
  let num = 0;
  DOMAINS.forEach((d) => {
    const s = stats[d.id];
    if (s.seen) num += d.weight * (s.correct / s.seen);
  });
  return den ? Math.round((num / den) * 100) : 0;
}
function totalSeen() {
  return DOMAINS.reduce((a, d) => a + stats[d.id].seen, 0);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Shuffle a question's answer options and remap the correct index,
   so the right answer isn't always in the same position. */
function shuffleOptions(q) {
  const order = shuffle(q.a.map((_, i) => i));
  return { ...q, a: order.map((i) => q.a[i]), c: order.indexOf(q.c) };
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
  let pool;
  if (focus === "weighted") {
    // proportional-ish mix across all domains
    pool = shuffle(Q);
    const n = mode === "exam" ? 60 : 10;
    // weighted sampling: roughly follow exam weights
    const picks = [];
    const byDom = {};
    DOMAINS.forEach(
      (d) => (byDom[d.id] = shuffle(Q.filter((q) => q.d === d.id))),
    );
    const targets = DOMAINS.map((d) => ({
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
    pool = shuffle(Q.filter((q) => q.d === focus));
  }
  // shuffle the answer options for each picked question (stored in the session,
  // so the order stays stable across pause/resume)
  pool = pool.map(shuffleOptions);
  pool = regroupScenarios(pool); // questions sharing a scenario appear back-to-back
  session = {
    items: pool,
    i: 0,
    answered: false,
    lastPick: null,
    correctCount: 0,
    log: [],
    elapsedMs: 0,
  };
}

/* ---------- Rendering ---------- */
const app = document.getElementById("app");
function dom(id) {
  return DOMAINS.find((d) => d.id === id);
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

function renderHome() {
  const ready = overallReadiness();
  const seen = totalSeen();
  app.innerHTML = `
    <div class="eyebrow">Claude Certified Architect · Foundations — 1 of 4 exams in Anthropic's Claude Certification Program</div>
    <h1>CCA Trainer</h1>
    <p class="lede">Active recall beats passive reading. Practice scenario questions weighted across the five domains, see where you stand per domain, and build toward a pass.</p>

    <div class="card">
      <div class="meter-head">
        <h2>Mastery per domain</h2>
        <span class="sub">width = exam weight · fill = % correct so far</span>
      </div>
      <div class="barlabels">
        ${DOMAINS.map(
          (d) => `
          <div class="barlabel" style="flex:${d.weight};">
            <div class="nm">${d.short}</div>
            <div class="wt">${d.weight}%</div>
          </div>`,
        ).join("")}
      </div>
      <div class="bar" role="img" aria-label="Mastery per domain, width corresponds to exam weight">
        ${DOMAINS.map(
          (d) => `
          <div class="seg" style="flex:${d.weight}; background:${d.hex}1f;">
            <div class="fill" style="height:${masteryPct(d)}%; background:${d.hex};"></div>
          </div>`,
        ).join("")}
      </div>
      <div class="legend">
        ${DOMAINS.map((d) => {
          const s = stats[d.id];
          return `
          <div class="row"><span class="dot" style="background:${d.hex}"></span>${d.short}
          <span class="pct">${s.seen ? masteryPct(d) + "% of " + s.seen + " tried" : "not tried yet"}</span></div>`;
        }).join("")}
      </div>
      <div class="readiness">
        <span class="num">${seen ? ready + "%" : "–"}</span>
        <span class="cap">weighted readiness${seen ? "" : " · no practice yet"}</span>
      </div>
      ${helpBlock(`
        <p>This is your progress dashboard — read-only, it just reflects how you're doing.</p>
        <p>Each column's <b>width</b> is that domain's weight on the real exam — Agentic counts most (27%), Context least (15%). The coloured <b>fill</b> is your accuracy: the % of the questions you've <i>tried</i> in that domain that you got right. It's not a completion bar — 2 of 2 correct shows as a full 100%, because it measures how well you've done so far, not how much is left.</p>
        <p>The <b>legend</b> below reads "<i>X% of N tried</i>" per domain — your accuracy and how many you've attempted. "Not tried yet" means you haven't touched that domain.</p>
        <p><b>Weighted readiness</b> rolls all five domains into one number, each counted by its exam weight — a rough estimate of how exam-ready you are. Domains you haven't practised yet count as 0%, so one domain alone can't get you near 100%; it climbs as you cover more ground AND answer correctly. Aim for <b>72%+</b> (the real pass mark).</p>`)}
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
            ${DOMAINS.map((d) => `<button class="chip" data-v="${d.id}" aria-pressed="${focus === d.id}"${focus === d.id ? ` style="background:${d.hex};border-color:${d.hex};color:#fff"` : ""}>${d.short}</button>`).join("")}
          </div>
        </div>`
            : ""
        }
      </div>
      <div class="btnrow">
        <button class="btn" id="startBtn">${savedSession ? "Start new (discard paused) →" : "Start session →"}</button>
      </div>
      ${helpBlock(`
        <p>Pick how you want to practise, then press <b>Start</b>.</p>
        <p><b>Mode · Practice</b> reveals the correct answer and an explanation after every question, so you learn as you go.</p>
        <p><b>Mode · Exam sim</b> hides the answers until the end, uses 60 questions, and runs a 120-minute clock — like the real test.</p>
        <p><b>Focus</b> (practice only) — "Weighted mix" samples across all five domains by their exam weight, or pick a single domain to drill it on its own. Exam sim always uses the weighted mix.</p>
        <p>Progress saves automatically, and you can pause mid-session and resume later. The <b>trash icon</b> in the bottom-left corner clears your mastery stats (your paused session and theme stay).</p>`)}
    </div>

    <div class="disclaimer">
      This trainer covers only <b>Claude Certified Architect – Foundations</b> (exam code CCAR-F), 1 of 4 exams in Anthropic's Claude Certification Program — it doesn't cover the other three. The questions are practice questions written to test the concepts in the five domains — not real exam items, which are secret and proctored. The five domains, their weights (27/20/20/18/15), the 60-item/120-minute format and the 720/1000 pass mark are all confirmed against the official Anthropic Exam Guide (v1.0, July 2026). Pricing, rate limits and context sizes change — verify such numbers in the official documentation before the exam.
    </div>
  `;
  document.getElementById("modeOpts").addEventListener("click", (e) => {
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
  document.getElementById("startBtn").addEventListener("click", async () => {
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
  const d = dom(it.d);
  const total = session.items.length;
  app.innerHTML = `
    <div class="qmeta">
      <span class="domtag" style="background:${d.hex}">${d.short}</span>
      <div class="qmeta-right">
        ${mode === "exam" ? '<span class="examclock" id="examTimer" aria-hidden="true"></span>' : ""}
        <span class="progress-mini">${session.i + 1} / ${total} · ${mode === "exam" ? "exam sim" : "practice"}</span>
        <button class="link-btn" id="pauseBtn" title="Save and go to overview">Pause</button>
        <button class="link-btn danger" id="abortBtn" title="Discard this session">Quit</button>
      </div>
    </div>
    <div class="card">
      ${
        it.sc && SCENARIOS[it.sc]
          ? `<div class="scenario">
        <div class="scenario-head"><span class="scenario-tag">Scenario</span><span class="scenario-title">${SCENARIOS[it.sc].title}</span></div>
        <p class="scenario-context">${SCENARIOS[it.sc].context}</p>
      </div>`
          : ""
      }
      <div class="qtext">${it.q}</div>
      <div class="answers" id="answers">
        ${it.a.map((opt, k) => `<button class="ans" data-k="${k}"><span class="key">${"ABCD"[k]}</span><span>${opt}</span></button>`).join("")}
      </div>
      <div id="explainSlot"></div>
      <div class="btnrow" id="navSlot"></div>
    </div>
  `;
  const answersEl = document.getElementById("answers");
  answersEl.addEventListener("click", (e) => {
    const b = e.target.closest(".ans");
    if (!b || session.answered) return;
    pick(parseInt(b.dataset.k, 10));
  });
  document.getElementById("pauseBtn").addEventListener("click", async () => {
    timerFreeze(); // stop the exam clock; resumes on continue
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
  // If resuming onto an already-answered question, restore its revealed state
  if (session.answered && session.lastPick != null) {
    revealAnswer(session.lastPick);
  }
  // Exam-sim clock (count-up with target); freezes when leaving this screen.
  if (mode === "exam") {
    session.elapsedMs = session.elapsedMs || 0;
    const t = document.getElementById("examTimer");
    if (t) renderTimerInto(t);
    timerEnsureRunning();
  }
}

function revealAnswer(k) {
  const it = session.items[session.i];
  const correct = k === it.c;
  const btns = [...document.querySelectorAll(".ans")];
  btns.forEach((b, idx) => {
    b.setAttribute("disabled", "true");
    if (idx === it.c) b.classList.add("correct");
    if (idx === k && !correct) b.classList.add("wrong");
  });
  if (mode === "study") {
    document.getElementById("explainSlot").innerHTML = `
      <div class="explain">
        <div class="verdict ${correct ? "ok" : "no"}">${correct ? "Correct" : "Wrong"}</div>
        <p>${it.e}</p>
      </div>`;
  }
  const last = session.i === session.items.length - 1;
  document.getElementById("navSlot").innerHTML =
    `<button class="btn" id="nextBtn">${last ? "See summary →" : "Next →"}</button>`;
  document.getElementById("nextBtn").addEventListener("click", next);
}

function pick(k) {
  const it = session.items[session.i];
  const d = dom(it.d);
  session.answered = true;
  session.lastPick = k;
  const correct = k === it.c;
  if (correct) session.correctCount++;
  session.log.push({ d: it.d, correct });
  stats[d.id].seen++;
  if (correct) stats[d.id].correct++;
  saveStats();
  revealAnswer(k);
  persistSession();
}

function next() {
  if (session.i < session.items.length - 1) {
    session.i++;
    session.answered = false;
    session.lastPick = null;
    persistSession();
    renderQuestion();
  } else {
    timerFreeze();
    clearSavedSession();
    renderSummary();
  }
}

function renderSummary() {
  const total = session.items.length;
  const pct = Math.round((100 * session.correctCount) / total);
  const passed = pct >= PASS_PCT;
  // per-domain breakdown for this session
  const byDom = {};
  DOMAINS.forEach((d) => (byDom[d.id] = { seen: 0, correct: 0 }));
  session.log.forEach((l) => {
    byDom[l.d].seen++;
    if (l.correct) byDom[l.d].correct++;
  });
  const practiced = DOMAINS.filter((d) => byDom[d.id].seen > 0);
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
  // Exam-sim total time vs target (count-up clock)
  const examTime =
    mode === "exam"
      ? `<p class="resume-meta">⏱ Total time: ${fmtClock(session.elapsedMs || 0)} · ${(session.elapsedMs || 0) <= examTargetMs() ? "within target ✓" : "over target (" + fmtClock(examTargetMs()) + ")"}</p>`
      : "";

  app.innerHTML = `
    <div class="eyebrow">Session complete</div>
    <h1>${session.correctCount} / ${total} correct</h1>
    <div class="passmark ${passed ? "pass" : "fail"}">${passed ? "✓ Pass" : "✗ Not yet"} · ${pct}% · 72% to pass</div>
    <p class="lede">${passed ? "At or above the 72% pass mark — that's the level you want going into the proctored exam." : pct >= 60 ? "Just under the 72% pass mark. Review your weak domains and run it again." : "Early days. Take the weakest domains one at a time in practice mode."}</p>
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

/* ---------- Exam timer (count-up with a fixed target; exam mode only) ---------- */
const EXAM_TARGET_MS = 120 * 60 * 1000; // the real exam is 60 items in 120 minutes
let timerRunningSince = null; // ms timestamp while ticking, else null (NOT persisted)
let timerInterval = null;
let timerTickCount = 0;

function examTargetMs() {
  return EXAM_TARGET_MS;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function renderTimerInto(el) {
  const elapsed = session.elapsedMs || 0;
  el.textContent = `⏱ ${fmtClock(elapsed)} / ${fmtClock(examTargetMs())}`;
  el.classList.toggle("over", elapsed >= examTargetMs());
}
function timerTick() {
  if (!session || timerRunningSince == null) return;
  const now = Date.now();
  session.elapsedMs = (session.elapsedMs || 0) + (now - timerRunningSince);
  timerRunningSince = now;
  const el = document.getElementById("examTimer");
  if (el) renderTimerInto(el);
  if (++timerTickCount % 5 === 0) persistSession(); // light periodic save (~5s)
}
function timerEnsureRunning() {
  if (mode !== "exam" || !session) return;
  if (timerRunningSince == null) timerRunningSince = Date.now();
  if (timerInterval == null) timerInterval = setInterval(timerTick, 1000);
}
function timerFreeze() {
  if (timerRunningSince != null && session) {
    session.elapsedMs =
      (session.elapsedMs || 0) + (Date.now() - timerRunningSince);
  }
  timerRunningSince = null;
  if (timerInterval != null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (session) persistSession();
}

/* ---------- Clear-progress button ---------- */
function setupClearButton() {
  const btn = document.getElementById("clearBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (
      confirm(
        "Reset all progress (mastery per domain)? This can't be undone. Your paused session and theme are kept.",
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
  await loadStats();
  await loadSavedSession();
  render();
})();
