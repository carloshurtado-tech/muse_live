# Submission draft — Muse Live: Show Caller (Oct 27, 2026 freeze)

Indie · Build for Your World · Meta Global AI Developer Hackathon

> Date note: every commit whose message says “Day” is dated Oct 27, 2026. “Day 1–7” below names work packages, not separate calendar days. Muse Live itself predates the window — see the dated disclosure on the About page. Owner to confirm (Q1) whether any work-package drafting predates Oct 27; this draft states only what the code and `git log` show.

## Title / tagline

**Muse Live: Show Caller** — ninety seconds to air, one grounded brief, human-approved execution.

## Description

Ninety seconds to air, a live show is a hundred things that can go wrong at once. Show Caller
reads them all at once — schedule, streams, incidents, crew, equipment — into a deterministic,
rules-based risk brief where every line names the record it came from. Nothing invented,
unknowns stated as unknowns. Show Caller does not call the chat model; the brief is computed
by rules in `js/muse-showcaller.js`.

It proposes the fix — never touching the on-air booking when another one can move — and a human
approves. Approval re-verifies the world before anything executes; a stale plan refuses itself.
The approval reachable in the UI today is the test-feed retry (“Approve & run” on the streams
wall). On approval the in-app fix runs and the glasses tally is republished. Slack and Gmail
connectors exist (`functions/api/omni/`) and file sends in the show's Omni thread when
production secrets are configured; no send fires from Approve until targets are wired, so
none is claimed here. A dead channel never rolls back the fix.

Stream Check gives it eyes: SAM 3.1 segments the frame via `/api/streamcheck` (no chat model
sees the pixels); black frames are caught by pixel math, not a guess. Errored checks are shown
as **unavailable**, never as clean. Chunked captions over Voice Transcribe carry a stated
~12 s lag — the searchable transcript exists by construction.

If the model goes down, the deterministic rule engine still runs. The demo never depends on a
single call succeeding.

Fictional demo data only: Harbor Lights Live. Maya Chen (producer), Jordan Reyes (director).

## Models (Meta Model API)

- **Muse Spark 1.3** — reasoning + tool calls for the Muse drawer (`POST /api/museai`). The Show Caller brief itself is deterministic rules and makes no model call.
- **SAM 3.1** (`sam-3.1` via `/v1/responses`) — frame segmentation; lower-third concept locked
  to `caption bar`.
- **Muse Voice Transcribe 1.0** — chunked caption windows (realtime WebSocket relay cut by
  design: the key cannot live in a browser handshake).
- No image-generation model is called by this codebase (`grep -r muse-image js functions` → 0 hits). Seeded Site Survey photos that are AI-generated are labelled illustrative in the app.

## Measured numbers (Oct 27, 2026 freeze)

- Unit: run `npm test` (Node 22, `node --test tests/unit/*.test.mjs`) — the pass count is reported by the runner at run time; no hard-coded count is published here. ESLint + `tsc` clean at freeze.
- Stream Check and captions are covered by the offline fault matrix and unit tests in the repo; no unlogged live-run fractions or cost figures are claimed.

## Proof artifacts

- In-repo verification: README hackathon build map (per-feature files + verification links);
  `tests/unit/showcaller.test.mjs` (scenario eval + headline on real seeds + end-to-end gate).
- Day-log files (`day1-*.md` … `day7-*.md`) are not in this repository and are not cited as proof.
- Live Slack/Gmail receipts require production secrets and are owner-verified, not claimed here.

## Open items (owner actions)

- [x] Repo public (visibility for judges) — public since Nov 1, 2026.
- [x] Logged-out link check of the deployed site — anonymous `/` and `/about` return 200,
  and the guest-reviewer session serves the full app (write endpoints refuse viewers).
- [ ] Harbor Lights scenario slots confirmed.
- [ ] Gmail re-auth ~Nov 3 (7-day test-mode expiry) — publish the OAuth app (“In production”) or mint a fresh token Nov 3 (lasts ~Nov 10); steps in `docs/RUNBOOK.md`.
- [x] Film the demo video (owner). Film the live `caption bar` check; do not present AI-generated survey photos as real frames. — Done: https://youtu.be/AivANsi4Bvs (embedded click-to-play on `/about`).
- [x] Licence: GPL-3.0 (`LICENSE`, keeps the LibreDWG DWG importer working). See `THIRD_PARTY_NOTICES.md`.
- [ ] X / gallery post-submission.
