# CCA Trainer

Practice tool for two of the four exams in Anthropic's Claude Certification
Program:

- **Claude Certified Architect – Foundations** (CCAR-F) — 5 domains, scenario-based
- **Claude Certified Associate – Foundations** (CCAO-F) — 7 domains, no scenarios

Both exams are 60 items in 120 minutes with a 720/1000 (72%) pass mark. Switch
between them with the tabs at the top.

## Running it

Open `index.html` directly in a browser. There is no build step, no dependencies
and no server — everything is plain HTML, CSS and JavaScript.

Because it runs from `file://`, the question data is loaded through `<script>`
tags rather than `fetch()`; a browser blocks `fetch()` of a local file under that
origin's CORS policy.

## Layout

```
index.html                    entry point — open this
README.md
app/
  cca-trainer.css             all styling, both themes
  cca-trainer.js              state, storage, rendering, exam clock
  questions-architect.js      CCAR-F domains, scenarios, question bank
  questions-associate.js      CCAO-F domains and question bank
assets/
  favicon.svg
tools/
  validate-questions.js       dev tool, see below
  check-explanation-leaks.js  dev tool, see below
docs/                         internal notes — gitignored, local only
  guides/                     the official Anthropic exam guides (PDF)
  research/                   sourced fact inventories behind the questions
  superpowers/                design specs and plans
```

Each exam is a **track**: one data file holding its domains, its question bank
and an exam descriptor carrying its facts and all of its on-screen prose.
`cca-trainer.js` never reads a track's data directly — it goes through `exam()`,
which returns the active track. Adding a third exam means adding one data file
and one entry to `EXAMS`.

## How a session is drawn

An **exam sim** on a scenario track picks `scenariosDrawn` of that track's
scenarios at random — four of six on Architect, the structure the exam guide
describes — and asks every question the bank holds for each of them. The rest of
the 60 items are drawn from questions belonging to no scenario, against
per-domain targets set by the real exam weights and already reduced by whatever
the scenarios contributed. A scenario's questions stay together as a block, and
the blocks are shuffled among the standalone questions as units, so a scenario
is equally likely to sit anywhere in the session.

A **practice round** is 11 questions and does not use the scenario draw — it is
too short for four complete sets, so scenario questions turn up individually.
Focusing on a single domain serves that whole domain instead.

## Checking the question banks

```
node tools/validate-questions.js
```

Catches structural mistakes — an answer index pointing past the end of the
options, a domain id that doesn't exist on that track, duplicate option text, a
missing explanation, a dangling scenario reference — and reports how many
questions each domain holds against its real exam weight, including how many are
still missing before a weighted 60-item draw can be filled. Exits non-zero if
anything is wrong.

On a scenario track it also proves the draw is possible at all: it enumerates
every combination of scenarios the exam sim could pick and checks that none of
them overfills a domain's target or leaves more slots than that domain has
scenario-free questions to fill them with. Neither is visible in the per-domain
table, which counts a domain's whole pool.

On the Architect track it then prints the objective report: for each of the
guide's task statements, how many questions reach it. A domain can sit exactly
on its weight while every question in it tests two of that domain's six task
statements, and the per-domain table cannot see the difference — matching the
blueprint's weights and matching its shape are separate properties. Coverage is
counted through two channels kept apart: what a question cites itself, and what
the fact inventories say they back. The report never fails the run, because
what a question tests is a judgement and a tool can only see what it cites.

It does **not** check whether an answer is factually correct. That is what the
sourced fact inventories in `docs/research/` and an adversarial review pass are
for.

```
node tools/check-explanation-leaks.js
```

Finds explanations that give away another question's answer. An explanation is
free text, so it can state, as an aside, the exact fact that is a different
item's correct answer — and a candidate who meets that explanation first has
been handed an answer instead of learning it. Each track is checked only
against itself, since a candidate sits one exam.

Both tools read the built banks in `app/`, and the Associate bank is generated
from the drafts, so run them after a rebuild rather than before.

## What's stored in the browser

| Key                      | Holds                        |
| ------------------------ | ---------------------------- |
| `cca:stats:v2:<track>`   | Mastery per domain, per exam |
| `cca:session:v2:<track>` | A paused session, per exam   |
| `cca:exam:v1`            | Which track was open last    |
| `cca:theme:v1`           | Light/dark choice            |

Progress is isolated per track, so studying one exam can't disturb the other.
The bottom-right trash button clears only the active track's progress. Older
single-track keys (`cca:stats:v1`) are migrated to the Architect track on first
run and deliberately left in place as a backup.

## Honesty about the questions

The questions are practice questions written against the domains and objectives
in the official exam guides. They are **not** real exam items — those are
confidential and proctored. Each guide's own published sample questions are
included verbatim and marked `official: true`.

Prices, usage limits and plan features change; those are avoided as
answer-critical content. Verify any such number in Anthropic's documentation
before the exam.

An exam sim draws four of the six scenarios as the guide describes, but only 24
of its 60 items belong to a scenario at all, where the guide calls the exam
scenario-based throughout. A consequence worth knowing: the guide's twelve sample
questions sit three apiece in four of the six scenarios, so every exam sim
carries at least six of them.

One deliberate difference from the real exam: an exam sim **can** be paused and
the clock stops. The real proctored exam cannot be paused, so the summary reports
how many times a run was paused.
