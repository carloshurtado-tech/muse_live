# Security

## Access control

- **Gate**: `functions/_middleware.js` runs for every request (`_routes.json` includes `/*`).
  Signed-out: login page, brand assets and CSS only; app JS is replaced with an empty module;
  `/api/*` → 401; `/glasses/*` and `/ops/*` redirect to sign-in. Public by design:
  `/api/auth/config`, `/api/auth/oidc/*`, `/api/calendar(.ics)` (checks its own token).
- **Sign-in**: SSO via OIDC (authorization code + PKCE; configured with `OIDC_*`), per-user email +
  password (PBKDF2-SHA256, 100k iterations, per-user salt), or the shared access password while no
  accounts exist (`ALLOW_SHARED_PASSWORD=true` keeps it on).
- **Sessions**: HMAC-SHA256-signed `{user, name, role, exp}` in `muse_session` (HttpOnly,
  SameSite=Lax, Secure on HTTPS, 7 days). Secret = `SESSION_SECRET` (set it) or derived from the
  password hash. Disabled accounts lose API access immediately (checked per API request).
- **Roles**: admin · producer · engineer · viewer. Viewers can't write shared storage; only admins
  manage accounts, delete keys, and read the audit log and telemetry.
- **CSRF**: SameSite=Lax cookies plus an Origin check on every state-changing endpoint.
- **Audit**: logins (and failures), logouts, account changes and shared-data writes are appended to
  the D1 `audit_log` table (strict ordering, one row per entry) and mirrored to `audit:<date>` in
  KV (400-day TTL), visible at `/ops/audit.html`.

## Content Security Policy (`_headers`)

- `connect-src` / `media-src` list explicit hosts. Stream hosts (`MUSE_MEDIA_HOSTS`):
  `demo.unified-streaming.com`, `test-streams.mux.dev`, `devstreaming-cdn.apple.com`,
  `storage.googleapis.com`, `cph-p2p-msl.akamaized.net`. To embed another CDN, add its origin to **both** directives.
- `frame-src` allows only YouTube (`youtube-nocookie.com`, `youtube.com`) for the event monitors.
- `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `Permissions-Policy`: microphone and geolocation for this origin only (voice Muse, venue check-in).
- **Still required — and why:**
  - `'unsafe-inline'` (script): ~760 inline `onclick` handlers in the legacy bundles and the small
    boot scripts in `index.html`.
  - `'unsafe-eval'`: `js/muse-app-b.js` runs command-palette actions with `eval(r.action)` (~line 5065)
    and builds dropdown handlers with `new Function` (~lines 6486–6493); `js/muse-app-a.js` (~line 51)
    uses `new Function` for a feature test. Quill's UMD build also probes `new Function("return this")`.
  - `'wasm-unsafe-eval'`: LibreDWG (DWG → DXF) runs as WebAssembly.
  - Plan: MIGRATION.md M5 replaces these call sites with direct function references and delegated
    events, then moves to a nonce-based policy.
- `Cross-Origin-Embedder-Policy` is intentionally **not** set: `require-corp` breaks the YouTube
  embeds and third-party map tiles, and `credentialless` isn't supported consistently in Firefox.

## AI (Muse)

- The Meta Model API key exists only as a Pages secret; the browser talks to `/api/museai`.
- The server re-validates every message (roles, lengths) so a tampered client can't inject extra
  API parameters; tool calls are executed client-side against data the user can already see.
- Writes proposed by Muse need an explicit **Confirm** click; nothing changes on the model's own.
- Untrusted text (incident notes, wiki pages, chat) reaches the model as data; see the agent's
  injection guidance, rate limits (`MUSE_RATE_PER_MIN`) and daily cap (`MUSE_DAILY_TOKEN_CAP`) in
  `functions/api/museai.js`.
- The model base URL is pinned: `MUSE_API_BASE` defaults to `https://api.meta.ai/v1`; extra
  https origins are allowed only via `MUSE_API_BASE_ALLOWLIST`, plain http only for loopback
  (local dev / e2e mock). Anything else fails closed (503, no upstream call). See
  `resolveModelBase()` in `functions/_lib/abuse.js`; applied by `/api/museai` and `/api/voice`.

## Write-endpoint guards (`functions/_lib/abuse.js`)

- Every JSON write (`/api/museai` POST, `/api/kv/:key` PUT, `/api/telemetry` POST) shares one
  guard: Origin check (403) → `Content-Type: application/json` (415) → body size cap (413) →
  per-session rate limit (429). `/api/voice` keeps its own audio checks plus the shared rate
  bucket and the pinned model base.
- `/api/telemetry` POST additionally validates a strict schema: only the `aws` section
  (`region`, `medialiveChannelId`, `mediaconnectFlowArn`, `cloudfrontDistributionId`) and the
  `mux` section (`videoId`), all strings ≤ 256 chars; unknown keys, wrong types and overlong
  values are rejected (400). See `validateTelemetryConfig()` in `functions/api/telemetry.js`.
- `/api/kv/:key` PUT additionally enforces optimistic concurrency: `If-Match` /
  `If-None-Match` against the `X-Muse-Updated` version (412 on mismatch), so concurrent
  editors don't silently overwrite each other.

## Known gaps

- XSS defence relies on `esc()` in string templates in the legacy bundles (migration removes this class).
- Shared storage is last-write-wins per key (no field-level merge or locking).
- The local dev server is not hardened: it binds 127.0.0.1 by default, and `--host`
  (e.g. `--host 0.0.0.0` for trusted-LAN testing) prints an explicit warning because the dev
  server must never be exposed to the public internet.
