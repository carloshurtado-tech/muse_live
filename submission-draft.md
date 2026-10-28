# Submission draft — Muse Live: Show Caller (Day 7 freeze, Oct 27, 2026)

Indie · Build for Your World · Meta Global AI Developer Hackathon

## Title / tagline

**Muse Live: Show Caller** — ninety seconds to air, one grounded brief, human-approved execution.

## Description

Ninety seconds to air, a live show is a hundred things that can go wrong at once. Show Caller
reads them all at once — schedule, streams, incidents, crew, equipment — into a risk brief where
every line cites the record it came from. Nothing invented, unknowns stated as unknowns.

It proposes the fix — never touching the on-air booking when another one can move — and a human
approves. Approval re-verifies the world before anything executes; a stale plan refuses itself.
On approval it executes, posts to Slack, emails the vendor, files both in the show's Omni thread,
and pushes the tally to the glasses. One conversation, every channel, fully audited. A dead
channel never rolls back the fix.

Stream Check gives it eyes: SAM 3.1 segments the frame (Spark never sees the pixels, only SAM's
output); black frames are caught by pixel math, not a guess. Chunked captions over Voice
Transcribe carry a stated ~12 s lag — the searchable transcript exists by construction.

If the model goes down, the deterministic rule engine still runs. The demo never depends on a
single call succeeding.

Fictional demo data only: Harbor Lights Live. Maya Chen (producer), Jordan Reyes (director).

## Models (Meta Model API)

- **Muse Spark 1.3** — reasoning + tool calls (brief, action plan, wording; citation-checked).
- **SAM 3.1** (`sam-3.1` via `/v1/responses`) — frame segmentation; lower-third concept locked
  to `caption bar` (proven: 1 box exactly on the strap, c 0.726; jargon phrasings return 0).
- **Muse Voice Transcribe 1.0** — chunked caption windows (realtime WebSocket relay cut by
  design: the key cannot live in a browser handshake).
- **Muse Image 1.0** — demo set-dressing only (Day 6 lower-third proof frame; proof artifact,
  not Harbor Lights naming — see open items).
- **Muse Wonder 1.0** — probed (HTTP 200, Spark drop-in shape), parked: no capability gap found
  in rehearsal, pricing unverified. First cost cut per the standing rule.

## Measured numbers (Day 7 freeze, build `?v=20261027-kvyr`)

- Unit: **153/153 green** (`node --test tests/unit/*.test.mjs`) — 85/85 hackathon slice at
  freeze (Show Caller 15 scenario checks incl. headline on real seeds + end-to-end gate,
  Stream Check 9, Omni 7, Transcribe 3, Captions 3, pre-existing 48) plus merged 2.0 tests and
  the Live Streams thumbnail-click regression tests. ESLint + `tsc` clean.
- Rehearsal cost ≈ **$0.07 vs $0.115 cap** (Show Caller loop $0.03–0.05, Stream Check ≈$0.01,
  10 caption windows ≈$0.005). Running hackathon model spend ≈ $0.14.
- Stream Check cut gate: 12-run live matrix 11/12 + probes (mean 1.3 s/run); lower-third
  positive proven Day 6 (`caption bar`), absence re-verified on bumper + open.
- Captions soak: 6/6 clips through the live endpoint (mean 1.8 s per 5–10 s clip).

## Proof artifacts

- Day logs: `day1-sam-test-log.md`, `day1-smoke-test-log.md`, `day1-smoke-test-run-sheet.md`,
  `day2-showcaller-log.md`, `day3-showcaller-log.md`, `day4-streamcheck-log.md`,
  `day5-hardening-log.md`, `day6-submission-log.md`, `day7-freeze-log.md`,
  `day7-video-roughcut.md` (3:00 script, 6 beats).
- In-repo verification: README hackathon build map (per-feature files + verification links);
  `tests/unit/showcaller.test.mjs` (eval set + headline + gate); Day 7 messy-rehearsal checks
  (headline moves WhatsApp test → CRK 1, black/white pixel math, `caption bar` box, captions
  v0.1.0, expired-plan refusal).
- Live integrations verified Oct 27: Slack `#showcaller-demo` post (ts 1793118683.349689, bot
  path, audited); Gmail send + RFC 2047 subject fix (id 1a17e4576a845694, renders correctly).

## Open items (unchanged since Day 6)

- [x] Repo public (visibility for judges).
- [x] Logged-out link check of the deployed site — anonymous `/` and `/about` return 200,
  and the guest-reviewer session serves the full app (write endpoints refuse viewers).
- [ ] Harbor Lights scenario slots confirmed.
- [ ] Gmail re-auth ~Nov 3 (7-day test-mode expiry).
- [ ] Day 9 filming: regenerate the lower-third frame with Harbor Lights naming (1 image,
  ~$0.01) or film the live `caption bar` check — the Day 6 "DR. ALEX CHEN" frame is a proof
  artifact only, do not put it in the video.
- [ ] X / gallery post-submission.
