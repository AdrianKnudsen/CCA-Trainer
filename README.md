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

One deliberate difference from the real exam: an exam sim **can** be paused and
the clock stops. The real proctored exam cannot be paused, so the summary reports
how many times a run was paused.
