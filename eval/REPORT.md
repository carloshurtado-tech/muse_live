# Muse accuracy eval

Full run 2026-10-17T16:01:08.875Z (40 questions, real model `muse-spark-1.3`, live Muse Live data).

**40 / 40 passed (100%)** · median answer time 5.8 s · 778,241 model tokens

| Category | Passed | Avg time |
|---|---|---|
| readiness | 8 / 8 | 9.3 s |
| techbook | 6 / 6 | 5.3 s |
| streaming | 8 / 8 | 4.4 s |
| incidents | 9 / 9 | 7.8 s |
| schedule | 4 / 4 | 8.9 s |
| crew | 3 / 3 | 3.2 s |
| venue | 2 / 2 | 3.8 s |

Confirmation run 2026-10-17T16:13:32.877Z after the final changes: **8 / 8** passed, median 7.0 s (`results-confirm.json`).

## How to run

```
BASE=http://127.0.0.1:8788 PASSWORD=<access password> node eval/run.mjs            # all questions
node eval/run.mjs --only inc-01,sch-01                                            # a subset
```

Needs `playwright-core` (or `PLAYWRIGHT_CORE=/path/to/playwright-core`) and a Chromium (`CHROME=/path`). Each question runs in a fresh conversation against the real model, so a full run costs roughly 40–90 model calls.

## How grading works

Each question in `questions.json` lists required facts as groups of regex alternatives; every group must appear in the answer, and any `forbid` pattern fails it. Golden facts come from the seed data (department board, techbooks, streaming plans, incident reports, Muse Schedule, crew, venues). Weather is excluded because it is live.

Caveat: Muse Schedule conflicts and demo dates are generated relative to today, so schedule questions check robust facts (CRK 4 double-booking, Alex Marlowe, Cameron Holt) rather than exact times.
