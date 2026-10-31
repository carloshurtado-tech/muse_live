# Stream Check fault-injection eval

Deterministic fault matrix for Stream Check: five fault types times three
stand-in programs, scored against shipped detectors. Every run logs ground
truth (fault, stream, window) next to the verdict, and the summary table is
computed from those logs only — never estimated.

## Fault-injection path

Tried first: `npm install -g mock-hls-server@0.1.1`. The install succeeded
and the tool runs, but it only fakes a live/event playlist from a VOD
source — it has no fault support (no black, frozen, muted, or down
variants). So the eval pairs it with a minimal local layer:

- `mock-hls-server` (global): fake-live base for browser rehearsal, e.g.
  `mock-hls-server --loop` plus
  `http://127.0.0.1:8080/proxy?url=<VOD m3u8, encoded>`.
- `fault-server.mjs` (this folder): deterministic fault variants as plain
  playlists — clean control, black window (`EXT-X-GAP`), frozen picture
  (window repeats one segment), muted (video-only master, no audio
  rendition), down (503), flaky (503 once, then 200 for retry rehearsal).

Fault windows are playlist-level and standards-based; segment bodies are
placeholder TS (sync bytes only), so the server validates playlist plumbing
and the feed-down path, not decoding.

## Run

Node lives at `$HOME/.local/node-v22.14.0/bin` (system node is too old);
prefix `PATH` accordingly. Never run bare `npm install` in the repo.

```
node eval/streamcheck/fault-server.mjs [port]   # default 8077, for browser rehearsal
node eval/streamcheck/run-eval.mjs [--out dir]  # full matrix; writes run.jsonl + table.json + table.csv
node eval/streamcheck/rehearse-feed-down.mjs    # down/up/retry path with the shipped check
```

`run-eval.mjs` defaults to `test-results/streamcheck-eval/<timestamp>/`
(gitignored). Signal faults run the shipped `MuseStreamCheck` math
(`analyzePixels`/`isBlack`, `frameDelta`/`isStill`/`isFrozen`,
`audioEnergy`/`isSilent`/`silenceHeld`) over deterministic stand-in frames;
the `down` fault runs the shipped `MuseTestFeeds.check` over real HTTP
against the fault server.

## How the numbers are computed

`stats.mjs` reads the run rows and nothing else:

- `detection_rate` = flagged fault-samples / fault samples, per fault type.
- `false_alarm_rate` = flagged clean-samples / clean samples.
- `ttd_p50_s` / `ttd_p90_s` = quantiles over per-(fault, stream) first-flag
  minus window start, at the 1 s sample quantum. Never detected → empty.
- `mean_latency_ms` = measured detector/check time per sample.
- `model_calls` = counted model calls per sample (0 for every check in this
  matrix — they are deterministic math). No dollar figures: there is no
  list price in the repo, and dollars would be estimates.

A rate over zero samples is blank, never zero.

## Cut gate, freeze, and rehearsal scope

Schedule gate (per tasking): feature freeze Nov 1 EOD; the Stream Check cut
rule applies — behavior not demonstrated by this eval's logs does not ship.
Implemented here as the `run-eval.mjs` exit code: 0 only when the clean
control passes with zero false alarms and every fault is detected on every
program; 1 otherwise. Per-sample detection rates below 1 (frozen 0.8,
muted 0.9) are the measured cost of the documented 2 s streak rules — the
ramp samples are necessarily unflagged, and the TTD column shows the delay.
`rehearse-feed-down.mjs` covers the playlist-fetch half of the
feed-down path (down → FEED DOWN, retry → up); the playback-verify half
(video element states after `VERIFY_MS`) needs a browser and stays manual.

All overlay and program labels in the fault feeds are fictional rehearsal
names; test content is never presented as production programming.
