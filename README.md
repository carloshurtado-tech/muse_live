<p align="center">
  <img src="assets/brand/meta-mark-animated.svg" width="96" alt="Meta">
</p>

<p align="center">
  <img src="assets/brand/muse-mascot.webp" width="460" alt="Muse, the Muse Live mascot, operating a broadcast camera">
</p>

<h1 align="center">Muse Live</h1>

<p align="center">
  <b>Live broadcast and streaming operations.</b><br>
  Plan every show, watch every stream end to end, learn from every incident.
</p>

<p align="center">
  <a href="https://muse-live.pages.dev"><img src="https://img.shields.io/badge/%E2%96%B6%20Start%20the%2090--second%20demo-0866FF?style=for-the-badge" alt="Start the 90-second demo"></a>
  <a href="https://muse-live.pages.dev/about"><img src="https://img.shields.io/badge/How%20it%E2%80%99s%20built-1C2B33?style=for-the-badge" alt="How it's built"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare%20Pages%20%2B%20Workers%20KV-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Pages and Workers KV">
  <img src="https://img.shields.io/badge/AI-Meta%20Model%20API-0866FF?logo=meta&logoColor=white" alt="Meta Model API">
  <img src="https://img.shields.io/badge/streaming-HLS%20%C2%B7%20LL--HLS%20%C2%B7%20SRT-1C2B33" alt="HLS, LL-HLS, SRT">
  <img src="https://img.shields.io/badge/a11y-WCAG%202.1%20AA%20%C2%B7%200%20axe%20violations-1E7B34" alt="WCAG 2.1 AA, 0 axe violations">
  <img src="https://img.shields.io/badge/Muse%20eval-40%2F40-1E7B34" alt="Muse eval 40 of 40">
</p>

---

Muse Live is an operations platform for live events that are both broadcast and streamed: the plan of record for every show, end-to-end stream health from encoder to viewer, blameless incident reports, finance, per-show communication, and **Muse**, an AI agent that can read all of it and propose changes for a person to confirm.

> **Try it:** open the [live demo](https://muse-live.pages.dev) and press **Start the 90-second demo**. No sign-in needed: you get a read-only guest session and a guided tour that plays itself (Space pauses, arrows step, Esc ends).

## Who built it

**Carlos Hurtado.** Designed and built Muse Live: product, front end, edge functions, the Muse agent, tests and the guided demo. [GitHub](https://github.com/carloshurtado-tech)

## What you’ll see

![A show's live health: encode, contribute, ingest, package, deliver and watch, with sparklines for viewers, rebuffer ratio, SRT loss and CDN egress](assets/about/chain.webp)
<sub>**Streaming:** end-to-end health per show: encoder → SRT contribution → MediaConnect/MediaLive → packaging → multi-CDN → player QoE. Each show also tracks a 99.9% availability SLO with its error budget.</sub>

<table>
  <tr>
    <td width="50%"><img src="assets/about/incidents.webp" alt="Incident report: primary SRT contribution lost, 38 s of viewer-visible rebuffering before failover, with impact numbers and timeline"></td>
    <td width="50%"><img src="assets/about/schedule.webp" alt="Muse Schedule timeline with utilization and a conflicts panel with one-click fixes"></td>
  </tr>
  <tr>
    <td><sub><b>Incidents:</b> blameless post-mortems with impact, time to detect and mitigate, root cause, timeline and owned follow-ups.</sub></td>
    <td><sub><b>Scheduling:</b> rooms, circuits, encoders, trucks and crew on one timeline, with conflicts and labor rules checked as you book.</sub></td>
  </tr>
</table>

**The guided demo** walks through: the home view → the Live Streams wall → one show’s end-to-end streaming chain → incident post-mortems → finance (“always on budget”) → Muse answering live → Omni, every conversation for a show in one place → the techbook, built as a PDF from live data and opened in a new tab.

## The job, and where it lives in the app

| Streaming & broadcast responsibility | In Muse Live |
| --- | --- |
| **Deliver live events end to end** | Per-show streaming plan: destinations and ingest, contribution and redundancy (SRT primary, bonded cellular backup), packaging (HLS / LL-HLS / DASH), CDN, captions and loudness, pre-flight and go-live checklist. |
| **Encoding and ABR ladders** | Encoding ladder per show: rungs, codecs and bitrates on the plan of record. |
| **Monitoring and quality of experience** | Live Streams wall; per-hop health; hls.js QoE beacons (startup, rebuffer, bitrate switches, errors); AWS MediaLive / MediaConnect / CloudFront and Mux Data adapters; availability SLO with error budget. |
| **Incident response and post-mortems** | Incident Reports: severity, viewer impact, time to detect and mitigate, timeline, root cause and action items, linked to each show. |
| **Event production and broadcast planning** | Department readiness, techbook PDF export, site surveys, venue drawings, power and fiber, gear and crew, for a world tour across Meta offices. |
| **Resources: encoders, circuits, rooms, crew** | Muse Schedule with conflict detection, labor rules, crew self-service and ICS calendar feeds. |
| **Budget and vendors** | Finance: budget against actuals, purchase orders, invoices and vendor payments per show. |
| **Communication** | Omni: every email, Teams chat and TOC alert linked to the show, PO or incident it is about. |
| **Facebook and Instagram Live** | Server-side Graph API proxy for live video status and ingest stream health. |
| **Automation and tooling** | Muse, an agent with tools over all of the above; every write goes through a human confirmation step. |

## Architecture

<p align="center"><img src="assets/about/architecture.svg" alt="Architecture: browser app, Cloudflare Pages edge functions, and services (Workers KV, Meta Model API, AWS CloudWatch and Mux Data, Facebook Graph API)"></p>

A static single-page app at the edge, a thin server layer for anything secret, and an agent loop where the model plans and the browser runs the tools.

### How Muse answers a question

The model never sees the database and never writes on its own.

1. The browser builds a live snapshot: every show’s readiness, dates, stream health and open incidents.
2. `POST /api/museai` adds the persona and tool schemas and makes **one** call to Meta Model API, so the key never leaves the server.
3. If the model asks for tools (production, techbook, crew, schedule, streaming, incidents, weather…), the browser runs them against the plan of record and posts the results back, for up to 8 steps.
4. Anything that would change data comes back as a **Confirm** card. A person decides, and Undo is offered.

## How it’s checked

| Result | What it measures |
| --- | --- |
| **40 / 40** | Muse accuracy eval on the real model, median answer 5.8 s ([eval/REPORT.md](eval/REPORT.md)) |
| **27** | unit tests: auth, sessions, guest access and AI spend limits, KV, sync, incidents, SigV4, build |
| **16** | Playwright end-to-end tests, including a crawl of every view and every show tab |
| **0** | axe WCAG 2.1 AA violations on the landing page, About page and main views, light and dark |

## Decisions and trade-offs

- **Edge first, no servers to run.** Static assets and Functions on Cloudflare Pages, state in Workers KV: deploys in seconds, nothing to patch, close to viewers everywhere.
- **Tools run in the browser.** The plan of record lives client-side today, so the agent’s tools do too; the server relays one model step at a time. As data moves into KV, tools can move server-side unchanged.
- **Simulated where it must be, real where it can be.** Pipeline numbers are a seeded simulation labeled *Demo* until a stream is connected to CloudWatch, Mux or Facebook Live; video monitors, QoE beacons and pre-flight checks are real.
- **Read-only by role, enforced on the server.** Viewer sessions, including the public guest demo, are refused by every write endpoint. Guests get their own Muse rate limit, request-size and output caps, and a daily token budget charged before each call.
- **Blameless by design.** Incident reports focus on the system and the timeline, and every follow-up has an owner and a status.
- **Accessible from the start.** Keyboard paths, focus management, screen-reader announcements (including the guided tour) and contrast checked in both themes.

## Honest limits

- Viewer counts, bitrates and other pipeline metrics are simulated unless a show is connected to real telemetry; every simulated number is labeled *Demo*.
- Stream monitors play public recordings of Meta events from YouTube, standing in for live program feeds.
- Most views are string-template JavaScript from an earlier build; newer modules are self-contained, and [docs/MIGRATION.md](docs/MIGRATION.md) plans the move to React + TypeScript.
- Shared storage is last-write-wins per key: fine for a small team, not for a large one.
- This is a concept demo, not an official Meta product.

---

## Run it locally

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

| Command | What it does |
| --- | --- |
| `npm run dev` | Local server with Functions + KV emulation |
| `npm run build` | Minify `js/muse-app-a.js` / `-b.js` → `*.min.js` + source maps, bump the `?v=` cache tag |
| `npm test` | Unit tests (`node:test`) |
| `npm run test:e2e` | Playwright end-to-end tests against the dev server and a mock Meta Model API |
| `npm run lint` / `npm run typecheck` | ESLint + TypeScript (JSDoc) checks for platform code and Functions |
| `npm run stage` | Deployable copy in `.stage/` (no tests, docs, sources, maps or secrets) |

**Docs:** [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Runbook](docs/RUNBOOK.md) · [Migration plan](docs/MIGRATION.md) · Admin pages at `/ops/` (health, audit log, users).

<p align="center"><sub>Muse Live is a concept demo by Carlos Hurtado and is not affiliated with or endorsed by Meta. Meta, Ray-Ban, Instagram, WhatsApp and Muse are trademarks of their owners. Event recordings belong to their owners.</sub></p>
