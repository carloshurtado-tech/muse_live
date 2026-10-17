# Muse Live

Broadcast **and live-streaming** operations platform for Meta live events, with **Muse**, an AI
agent that knows every show: readiness, gear, crew, venue weather, stream health, incidents and
the resource schedule. Built on Cloudflare Pages + Pages Functions; Muse runs on Meta Model API.

> Concept / demo build. Meta, Ray-Ban, Instagram, WhatsApp and Muse names are trademarks of
> their owners; this is not an official Meta product.

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
| `npm test` | Unit tests (`node:test`) — auth, sessions, KV, observability, incident search, SigV4, build/stage rules |
| `npm run test:e2e` | Playwright end-to-end tests against the dev server and a mock Meta Model API |
| `npm run lint` / `npm run typecheck` | ESLint + TypeScript (JSDoc) checks for platform code and Functions |
| `npm run stage` | Deployable copy in `.stage/` (no tests, docs, sources, maps or secrets) |

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the system fits together
- [docs/MIGRATION.md](docs/MIGRATION.md) — plan from the legacy bundles to React + TypeScript
- [docs/SECURITY.md](docs/SECURITY.md) — auth, sessions, CSP, AI safety, known gaps
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — deploy, secrets, KV, accounts, SSO, operations

Admin pages: `/ops/` (health, audit log, users).
