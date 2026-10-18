# Muse Live

**An operations platform for live events that are broadcast and streamed**, with **Muse**, an AI
agent that knows every show: readiness, gear, crew, venue, stream health, incidents and the
resource schedule.

**▶ [Live demo](https://muse-live.pages.dev)**: press *Start the 90-second demo*; no sign-in needed (read-only guest session).
**[How it’s built](https://muse-live.pages.dev/about)**: architecture, decisions and honest limits.

![A show's end-to-end live health: encode, contribute, ingest, package, deliver and watch, with an availability SLO](assets/about/chain.webp)

> Concept demo by Carlos Hurtado. Meta, Ray-Ban, Instagram, WhatsApp and Muse are trademarks of
> their owners; this is not an official Meta product.

## What it does

| | |
| --- | --- |
| **Live Streams wall** | Every program feed with end-to-end health: concurrent viewers, rebuffering, glass-to-glass latency, errors. |
| **Streaming plan per show** | Encoder → SRT contribution (bonded backup) → MediaConnect/MediaLive → packaging (HLS / LL-HLS / DASH) → multi-CDN → player QoE, plus ABR ladder, destinations, captions, loudness, pre-flight and an availability SLO with error budget. |
| **Incident Reports** | Blameless post-mortems: severity, viewer impact, time to detect and mitigate, timeline, root cause, owned action items. |
| **Muse Schedule** | Rooms, circuits, encoders, trucks and crew on one timeline; conflicts and labor rules checked as you book; ICS feeds. |
| **Productions** | Department readiness, techbook PDF export, site surveys, venue drawings, power, fiber, gear and crew. |
| **Muse (AI agent)** | Answers questions across all of it through tools, and proposes changes that a person confirms. |

<p>
<img src="assets/about/incidents.webp" width="49%" alt="Incident report: primary SRT contribution lost, 38 s of viewer-visible rebuffering before failover">
<img src="assets/about/schedule.webp" width="49%" alt="Muse Schedule timeline with a conflicts panel and one-click fixes">
</p>

## Architecture

```
Browser                                Cloudflare Pages (edge)                   Services
┌──────────────────────────────┐       ┌──────────────────────────────────┐      ┌───────────────────────┐
│ App shell + feature modules  │ HTTPS │ _middleware: HMAC sessions,      │ ───► │ Workers KV            │
│ Muse agent (tools run here)  │ ────► │   roles, guest demo, throttling  │ ───► │ Meta Model API        │
│ hls.js monitors → QoE beacons│       │ /api/museai  one model step/call │ ───► │ AWS CloudWatch · Mux  │
│ MuseSync: localStorage ⇄ KV  │       │ /api/kv /calendar /audit /qoe    │ ───► │ Facebook Graph API    │
└──────────────────────────────┘       │ /api/telemetry /fblive (SigV4…)  │      └───────────────────────┘
                                       └──────────────────────────────────┘
```

- **Static app + Pages Functions + Workers KV.** No servers to run; keys and tokens stay server-side.
- **Agent loop:** the browser sends the conversation and a live snapshot; `/api/museai` makes one call to
  Meta Model API; the browser runs any requested tools against the plan of record and posts results back
  (up to 8 steps). Writes always come back as Confirm cards.
- **Telemetry:** pipeline metrics are a seeded simulation (labeled *Demo*) until a stream is connected to
  AWS MediaLive / MediaConnect / CloudFront (CloudWatch, SigV4), Mux Data or Facebook Live. hls.js
  monitors post real QoE beacons.
- **Access:** signed sessions with roles (`admin`, `producer`, `engineer`, `viewer`), optional per-user
  accounts (PBKDF2) and OIDC SSO, an audit log, CSP and rate limits. The public guest demo is a
  read-only `viewer` session with its own Muse rate limit and daily token budget; `GUEST_DEMO=off` closes it.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SECURITY.md](docs/SECURITY.md).

### How Muse answers a question

The model never sees the database and never writes on its own.

1. The browser builds a live snapshot: every show’s readiness, dates, stream health and open incidents.
2. `POST /api/museai` adds the persona and tool schemas and makes **one** call to Meta Model API, so the key never leaves the server.
3. If the model asks for tools (production, techbook, crew, schedule, streaming, incidents, weather…), the browser runs them against the plan of record and posts the results back, for up to 8 steps.
4. Anything that would change data comes back as a Confirm card. A person decides, and Undo is offered.

## The job, and where it lives in the app

| Streaming & broadcast responsibility | In Muse Live |
| --- | --- |
| Deliver live events end to end | Per-show streaming plan: destinations and ingest, contribution and redundancy (SRT primary, bonded cellular backup), packaging (HLS / LL-HLS / DASH), CDN, captions and loudness, pre-flight and go-live checklist. |
| Encoding and ABR ladders | Encoding ladder per show: rungs, codecs and bitrates on the plan of record. |
| Monitoring and quality of experience | Live Streams wall; per-hop health; hls.js QoE beacons (startup, rebuffer, bitrate switches, errors); AWS MediaLive / MediaConnect / CloudFront and Mux Data adapters; availability SLO with error budget. |
| Incident response and post-mortems | Incident Reports: severity, viewer impact, time to detect and mitigate, timeline, root cause and action items, linked to each show. |
| Event production and broadcast planning | Department readiness, techbook PDF export, site surveys, venue drawings, power and fiber, gear and crew. |
| Resources: encoders, circuits, rooms, crew | Muse Schedule with conflict detection, labor rules, crew self-service and ICS feeds. |
| Facebook and Instagram Live | Server-side Graph API proxy for live video status and ingest stream health. |
| Automation and tooling | Muse, an agent with tools over all of the above; every write goes through a human confirmation step. |

## The guided demo

The landing page’s **Start the 90-second demo** opens a read-only guest session and an auto-playing tour:
home → Live Streams wall → a show’s end-to-end streaming chain → incident post-mortems → schedule
conflicts → Muse answering live → bookings → the techbook PDF, built from live data and opened in a new
tab. Space pauses, arrows step, Esc ends; the spotlight follows each target’s shape and every step is
announced to screen readers.

## Decisions and trade-offs

- **Edge first, no servers to run.** Static assets and Functions on Cloudflare Pages, state in Workers KV: deploys in seconds, nothing to patch, close to viewers.
- **Tools run in the browser.** The plan of record lives client-side today, so the agent’s tools do too; the server relays one model step at a time. As data moves into KV, tools can move server-side unchanged.
- **Simulated where it must be, real where it can be.** Pipeline numbers are a seeded simulation labeled *Demo* until connected to CloudWatch, Mux or Facebook Live; video monitors, QoE beacons and pre-flight checks are real.
- **Read-only by role, enforced on the server.** Viewer sessions (including the guest demo) are refused by every write endpoint; guests get their own Muse rate limit and daily token budget.
- **Blameless by design.** Incident reports focus on the system and the timeline, and every follow-up has an owner and a status.
- **Accessible from the start.** Keyboard paths, focus management, screen-reader announcements (including the tour) and contrast checked in both themes.

## Quality

- **Muse accuracy eval:** 40 / 40 questions on the real model, median answer 5.8 s ([eval/REPORT.md](eval/REPORT.md)).
- **Unit tests:** 25 (`node:test`): auth, sessions, guest access, KV, sync, incidents, SigV4, build rules.
- **End-to-end:** 7 Playwright suites, including a crawl of every view.
- **Accessibility:** axe WCAG 2.1 AA audit with 0 violations on the landing page, About page and main views, in light and dark themes.

## Quick start (local)

```bash
npm ci                         # dev tooling only — the app itself has no runtime dependencies
cp .dev.vars.example .dev.vars # or create it: MODEL_API_KEY=…  MUSE_PASSWORD_HASH=…
npm run dev                    # http://127.0.0.1:8788
```

`MUSE_PASSWORD_HASH` is `sha256("muse-live:" + <password>)`:
`printf 'muse-live:%s' 'your-password' | shasum -a 256`.
Without `MODEL_API_KEY`, Muse answers from built-in rules (offline mode).

`tools/dev-server.mjs` is a small Cloudflare Pages emulator in plain Node: it runs the middleware
and `functions/api/**`, applies `_headers`, and emulates the `MUSE_KV` binding (persisted to
`.dev-kv.json`). It exists because `wrangler pages dev` (workerd) needs macOS 13.5+.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local server with Functions + KV emulation |
| `npm run build` | Minify `js/muse-app-a.js` / `-b.js` → `*.min.js` + source maps, bump the `?v=` cache tag |
| `npm test` | Unit tests (`node:test`) |
| `npm run test:e2e` | Playwright end-to-end tests against the dev server and a mock Meta Model API |
| `npm run lint` / `npm run typecheck` | ESLint + TypeScript (JSDoc) checks for platform code and Functions |
| `npm run stage` | Deployable copy in `.stage/` (no tests, docs, sources, maps or secrets) |

## Honest limits

- Viewer and pipeline numbers are simulated unless a show is connected to real telemetry; every simulated number is labeled *Demo*.
- Stream monitors play public recordings of Meta events from YouTube, standing in for live program feeds.
- Most views are string-template JavaScript from an earlier build; [docs/MIGRATION.md](docs/MIGRATION.md) plans the move to React + TypeScript.
- Shared storage is last-write-wins per key: fine for a small team, not for a large one.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the system fits together
- [docs/MIGRATION.md](docs/MIGRATION.md): plan from the legacy bundles to React + TypeScript
- [docs/SECURITY.md](docs/SECURITY.md): auth, sessions, CSP, AI safety, known gaps
- [docs/RUNBOOK.md](docs/RUNBOOK.md): deploy, secrets, KV, accounts, SSO, operations

Admin pages: `/ops/` (health, audit log, users).
