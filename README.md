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
