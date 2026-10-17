# Muse Live — Architecture

Muse Live is a single-page web app served by **Cloudflare Pages**. Server logic runs in
**Pages Functions** (Workers runtime); shared state lives in **Workers KV**; the AI agent, Muse,
calls **Meta Model API** (`muse-spark-1.3`, OpenAI-compatible) from a Function so the key never
reaches the browser.

```
Browser (index.html + js/*)                               Cloudflare Pages
┌──────────────────────────────────────────────┐          ┌───────────────────────────────────────────┐
│ Legacy app bundles  muse-app-a/b.min.js      │  HTTPS   │ functions/_middleware.js  (auth gate,     │
│  productions, techbook, crew, survey, CAD…   │ ───────► │   signed sessions, roles, redirects)      │
│ Feature modules                               │          │ /api/museai      one agent step → Meta   │
│  muse-streaming   muse-incidents              │          │ /api/voice       speech-to-text → Meta    │
│  muse-schedule    muse-agent  muse-voice      │          │ /api/kv/:key     shared storage (KV)      │
│ Platform                                      │          │ /api/auth/*      accounts, SSO (OIDC)     │
│  muse-observe (telemetry)  muse-sync (KV)     │          │ /api/observe     product telemetry        │
└──────────────────────────────────────────────┘          │ /api/audit       audit log                │
                                                           │ /api/calendar(.ics) schedule feeds        │
                                                           │ /api/telemetry   CloudWatch / Mux adapters│
                                                           └───────────────┬───────────────────────────┘
                                                                           │ MUSE_KV (Workers KV)
```

## Front end

| Layer | Files | Notes |
| --- | --- | --- |
| Shell + legacy app | `index.html`, `js/muse-app-a.js`, `js/muse-app-b.js` (≈2 MB source, minified to `*.min.js`) | String-template views (`innerHTML`), global functions called from inline `onclick`, state in globals (`productions`, `order`, …) persisted to `localStorage` (`muselive_*`). |
| Feature modules | `js/muse-streaming.js`, `js/muse-incidents.js`, `js/muse-schedule.js`, `js/muse-agent.js`, `js/muse-voice.js`, … | Self-contained IIFEs exposing one global each (`MuseStreaming`, `MuseIncidents`, `MuseSchedule`, `MuseAgent`). They are the template for the migration (see MIGRATION.md). |
| Platform | `js/muse-observe.js` (load first), `js/muse-sync.js` (load early) | Telemetry and shared storage; no changes needed in other modules. |
| Styles | `css/muse.css` | One stylesheet: compiled Tailwind utilities, app layers, and a final Meta UI Toolkit token layer (Noto Sans, toolkit radius/spacing scales, exact dark palette). |
| Glasses | `glasses/` | Ray-Ban Display companion web app (reads `/api/kv/live-status`). |

Views are `.view-pane` elements switched by `switchView(view)`; productions render into
`#view-<key>` with sub-tabs via `setProjTab(key, tab)`.

## Muse — the agent loop

1. The browser builds a **live snapshot** (every show's readiness, dates, stream health, open incidents).
2. `POST /api/museai` with the conversation + snapshot. The Function adds the persona and the tool
   schemas and makes **one** call to Meta Model API.
3. If the model asks for tools, the **browser** runs them against the plan of record
   (`js/muse-agent.js`: production, department, techbook, equipment, crew, schedule, site, weather
   via Open-Meteo, streaming, incidents, bookings, availability, conflicts, ops, wiki…) and posts
   the results back. Repeat until the model answers (max 8 steps).
4. Changes are never automatic: write tools render a **Confirm** card; the user decides; Undo is offered.

Why tools run client-side: the plan of record lives in the browser today. As data moves to KV
(MIGRATION.md, M2), tools can move server-side and work headless (glasses, Slack, cron).

## Storage

| Data | Where | Shared? |
| --- | --- | --- |
| Productions, edits, custom shows | `localStorage` `muselive_edits`, `muselive_custom` | Yes, mirrored to KV by `MuseSync` |
| Incidents, streams, schedule | `muselive_incidents_v1`, `muselive_streams_v1`, `muselive_schedule_v1` | Yes, mirrored |
| Live status for glasses | KV `live-status` (published by the streaming module) | Yes |
| Accounts | KV `users:<email>` (PBKDF2 hashes) | Server only |
| Audit log | KV `audit:<yyyy-mm-dd>` | Server only (admins read) |
| Product telemetry | KV `obs:<yyyy-mm-dd>` daily aggregates | Server only (admins read) |

`MuseSync` mirrors allow-listed localStorage keys as envelopes `{updated, by, data}`: last write
wins per key; on load the newest copy is applied (the page reloads once); later remote changes show
“Updated by … · Reload”. KV values are capped at 256 KB per key; larger values stay on-device.

## Security model (summary — see SECURITY.md)

- Every request passes `functions/_middleware.js`. Signed-out visitors get only the login page,
  brand assets and CSS; app JS is withheld; APIs return 401.
- Sessions are HMAC-signed tokens (`user`, `role`, expiry) in an HttpOnly, SameSite=Lax cookie.
- Roles: `admin` (accounts, audit, telemetry), `producer`, `engineer` (write), `viewer` (read-only).
- Secrets (Meta key, AWS/Mux keys, session secret, OIDC secret) live in Pages secrets, never in the client.
