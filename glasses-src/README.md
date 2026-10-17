# Muse on Meta Ray-Ban Display

A glanceable companion to Muse Live for engineers on the floor: stream tally, alerts and
incidents, Ask Muse (voice or presets) and a countdown to the next show on air, built for the
600 × 600 additive display of Meta Ray-Ban Display glasses with Meta's official
**UI Toolkit** (`@wearables-ui-toolkit/mrbd` + `@wearables-ui-toolkit/icons`), React 19,
Vite and TypeScript.

| Screen | What it shows | Input |
| --- | --- | --- |
| On air | One row per LIVE / REHEARSAL show. Tally: red = on air, amber = degraded, green = healthy rehearsal. Viewers and glass-to-glass latency. | Select a row for the stage at fault, the top alert and Muse's recommendation |
| Alerts | Stream alerts plus open incidents (SEV-1…4). | Select for a short summary |
| Ask Muse | Push-to-talk (select to start, select again to send) or presets: "Are we healthy?", "What's the biggest risk?", "Next show on air?". Answers are at most two sentences. | |
| Next up | Next show on air with a live countdown. | |

Navigation is the toolkit's directional focus: swipe = arrow keys, pinch = Enter, back = Escape.
Deep links: `?tab=0..3` opens a screen, `?demo=1` forces demo data.

## Data
- `GET /api/kv/live-status` every 5 s — the snapshot Muse Live publishes from the desktop app
  (`MuseStreaming.liveStatus()`). Missing, unauthorised or older than 60 s → built-in demo data,
  labelled "Demo data" on screen.
- `POST /api/museai` with `{ mode: 'glance', messages, snapshot }` — Muse answers from the live
  snapshot without tools. If Muse can't be reached, the app answers deterministically from the
  snapshot and says so.
- `POST /api/voice` (audio blob) → `{ ok, text }` — Meta Muse Voice Transcribe, then Ask Muse.

## Build
The source lives here; the built app is committed to `../glasses/` and served by Pages at
`/glasses/` (the same login cookie as Muse Live).

```sh
npm install            # in a copy outside the iCloud repo — keep node_modules out of the repo
npm run build          # tsc --noEmit && vite build  → dist/
# then copy dist/ to ../glasses/
```

`npm run dev` serves on Vite with `/api` proxied to a local Muse Live dev server on :8788.
First load is ~192 KB gzipped (JS 175 KB + CSS 17 KB), inside Meta's 300 KB guidance for the
glasses. Icons are separate SVGs fetched only when used.

## Presenter preview
`/glasses/preview.html` mounts the same app at its native 600 × 600 inside a tinted lens over a
venue photo, blended additively (black is see-through, as on the real display). "Raw 600 × 600"
shows the display alone. Arrow keys / Enter / Esc or the on-screen wristband pad drive it.

## Load it on the glasses
Per Meta's Web Apps docs the app must be on a public **HTTPS** URL:
1. Deploy Muse Live (the app is then at `https://<host>/glasses/`).
2. In the **Meta AI** app: Devices → Display Glasses settings → App connections → Web apps →
   **Add a web app**, enter a name ("Muse") and the URL. (A QR deep link into the Meta AI app
   works too.)
3. Test in the Meta Ray-Ban Display Simulator (Chrome) first; it is not a substitute for testing
   on the glasses.

Note: `/glasses/` sits behind Muse Live's sign-in. On the device, the wearer needs a session
(sign in once in the glasses browser) or a device token from the platform — see the parent
project's auth notes.

## Licences
UI Toolkit source: Apache-2.0. `@wearables-ui-toolkit/icons`: Meta Wearables Developer Terms.
Toolkit fonts are excluded from the Apache grant and ship under their own terms.
