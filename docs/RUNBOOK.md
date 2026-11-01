# Runbook

## Local development

```bash
npm ci
cp .dev.vars.example .dev.vars    # add MODEL_API_KEY for the live model
npm run dev                       # http://127.0.0.1:8788
npm run check                     # lint + typecheck + unit tests
npm run test:e2e                  # Playwright (chromium; firefox in CI)
```

## Build and deploy (Cloudflare Pages project `muse-live`)

```bash
npm run build                      # minify bundles + source maps, bump ?v= cache tag
npm run stage                      # .stage/public + .stage/functions (no dev files)
cd .stage && npx wrangler@4.139.0 pages deploy public --project-name muse-live --branch main --commit-dirty=true
```

Static assets are cached `immutable` (see `_headers`), so the `?v=` tag must change on every
deploy — `npm run build` does it.

## One-time production setup

1. **Shared storage (KV)** — required for sync, accounts, audit and telemetry:
   ```bash
   npx wrangler@4.139.0 kv namespace create muse-live-kv
   ```
   Then bind it: Cloudflare dashboard → Workers & Pages → `muse-live` → Settings → Bindings →
   Add → KV namespace → Variable name **`MUSE_KV`** → `muse-live-kv` (Production and Preview).
   Redeploy afterwards.
2. **Secrets** (each prompts for the value):
   ```bash
   npx wrangler@4.139.0 pages secret put MODEL_API_KEY --project-name muse-live
   npx wrangler@4.139.0 pages secret put SESSION_SECRET --project-name muse-live   # openssl rand -base64 48
   npx wrangler@4.139.0 pages secret put MUSE_PASSWORD_HASH --project-name muse-live   # REQUIRED: shared-password hash (no safe default; rotate if ever exposed)
   npx wrangler@4.139.0 pages secret put MUSE_FEED_SECRET --project-name muse-live   # REQUIRED: calendar-feed signing secret (long random value; without it feeds fall back to the password hash)
   ```
3. **Accounts**: sign in with the shared password → `/ops/users.html` → add yourself as **admin**
   first. From then on the shared password stops working (set `ALLOW_SHARED_PASSWORD=true` to keep it).
   The login screen must offer an email field for this mode (it asks when `/api/auth/config`
   reports `accounts: true` or the login response says `needEmail`).
4. **SSO (optional)**: register an OIDC app with redirect URI
   `https://muse-live.pages.dev/api/auth/oidc/callback`, then set `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
   `OIDC_CLIENT_SECRET` (secret), optionally `OIDC_ALLOWED_DOMAINS=meta.com`, `OIDC_DEFAULT_ROLE`,
   `OIDC_LABEL`. Meta's internal IdP can be used only if it exposes standard OIDC.

## Operating

- `/ops/` — overview; `/ops/health.html` errors/usage/Muse counts per day; `/ops/audit.html`;
  `/ops/users.html` (admins).
- Lock someone out: `/ops/users.html` → Disable (takes effect on their next API call).
- Rotate everyone's sessions: change `SESSION_SECRET`.
- Muse offline: `/api/museai` returns 503 when `MODEL_API_KEY` is missing; the drawer falls back to
  built-in answers. 402 from Meta = billing; 429 = rate limit.
- Guest demo (landing page "Start the 90-second demo"): `POST /api/auth/guest` issues a read-only
  `viewer` session for 24 h. Set `GUEST_DEMO=off` to hide the buttons, refuse new guests and end
  existing guest sessions. Guests can't use voice; Muse allows them `MUSE_GUEST_RATE_PER_MIN`
  (default 10) requests per minute and all guests share `MUSE_GUEST_DAILY_TOKEN_CAP` (default 1500000)
  tokens per day, inside the workspace's `MUSE_DAILY_TOKEN_CAP`. Guest requests are capped at 200 KB and
  4000 output tokens, and each is charged a worst-case estimate before the model call.

## Deploy guard (CI must be green first)

Deploys are manual and ignore CI unless you check. Before deploying, require the
CI run for the exact commit to have succeeded (this does not change `stage.mjs`,
so local staging keeps working):

```bash
[ "$(gh run list -c $(git rev-parse HEAD) -L1 --json conclusion -q '.[0].conclusion')" = success ] && npm run stage && cd .stage && npx wrangler@4.139.0 pages deploy public --project-name muse-live --branch main --commit-dirty=true
```

If the guard fails, fix CI first (known historical blockers: the a11y contrast
rules and the WebGL-less shade test, which now skips without WebGL).

## Symptom → action

| Symptom | First checks | Action |
|---|---|---|
| Slack send fails / 503 | `SLACK_BOT_TOKEN` / `SLACK_WEBHOOK_URL` set in production? Bot in the channel? | Set the secrets (below), redeploy, resend from the Omni thread. Webhook-only setups post via webhook; a missing bot token must not block the webhook path. Check `/ops/audit.html` for the failed-send entry. |
| Gmail send fails / “Gmail authorization lapsed” (502) | Refresh token expired (Testing-mode OAuth tokens live 7 days)? `GMAIL_*` set? | Re-auth (next section), update `GMAIL_REFRESH_TOKEN`, redeploy. Sends fail closed; the in-app fix is never rolled back. |
| Stream Check (SAM) down / checks “unavailable” | `MODEL_API_KEY` valid? `/api/streamcheck` 429/5xx? Daily token budget hit? | “Unavailable” is the correct degraded display — never treat it as clean. Check billing/rate limits, wait for the daily cap to reset (midnight UTC) or raise `MUSE_DAILY_TOKEN_CAP`. |
| Transcribe / captions down | `MODEL_API_KEY` valid? `/api/transcribe` errors in `/ops/health.html`? | Captions show unavailable; do not present the last line as live. Fix the key/budget as for SAM. |
| Corrupt KV value (bad JSON, wrong shape) | Which key (`/api/kv/:key`, `users:`, `obs:`, `audit:`)? Error in `/ops/health.html`? | Read the key in the Cloudflare dashboard (KV → `muse-live-kv`), restore the last good value or delete the key so the app reseeds, then reload. Last-write-wins: coordinate editors first. |
| Function 500 | `/ops/health.html` error groups; `wrangler pages deployment list` for the live commit | Check the Function logs in the dashboard, verify bindings (`MUSE_KV`, `MUSE_D1`, `MUSE_DB`, `MUSE_MEDIA`) and required secrets, redeploy the last good commit (Rollback, below). |
| Slow model / answers cut off | Model latency; 45 s class timeouts; `/api/museai` status | The drawer falls back to built-in rules when the model is unreachable. Check the Meta Model API status and `MUSE_REASONING_EFFORT` (lower = faster); retry rather than raising caps blindly. |
| Muse offline (503) | `MODEL_API_KEY` missing/invalid | Set/rotate the key (below) and redeploy. 402 = billing, 429 = rate limit. |

## Gmail re-auth (`GMAIL_*`)

Omni mail exchanges `GMAIL_REFRESH_TOKEN` for access tokens
(`functions/api/omni/mail.js`). In OAuth “Testing” mode refresh tokens expire
after 7 days.

1. Preferred: Google Cloud Console → OAuth consent screen → **Publish app**
   (“In production”), then mint one fresh refresh token with scope
   `gmail.send` and store it: `npx wrangler@4.139.0 pages secret put GMAIL_REFRESH_TOKEN --project-name muse-live` (likewise `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`). Redeploy.
2. If publishing is blocked: mint a 7-day token on **Tue Nov 3** — it then lasts
   until about **Nov 10**, past the Nov 9 announcement. Put a calendar hold to
   re-mint before it lapses; after expiry sends return 502 until you do.

## Rollback

- **Pages (static + Functions):** Cloudflare dashboard → Workers & Pages →
  `muse-live` → Deployments → pick the last good deployment → **Rollback**.
  Rollback restores that deployment's code and assets immediately.
- **D1 / R2 do not roll back.** Database rows and media blobs written by the bad
  deployment stay written. If a bad deployment wrote bad data, fix the data
  (KV value, D1 row, R2 object) by hand after the code rollback; there is no
  point-in-time restore in this runbook.
- Secrets are not part of a deployment rollback; a rotated secret stays rotated.

## Alerting

- Turn on Cloudflare notifications for the `muse-live` Pages project (deployment
  failures, Function errors) → deliver to the owner: **OWNER_NAME / OWNER_CONTACT
  (placeholder — owner to fill)**.
- Add an external uptime check on `https://muse-live.pages.dev/api/ping`
  (expects `{ ok: true }`) paging the same owner placeholder. `/ops/health.html`
  counts browser-reported errors only; it does not alert on server failures by
  itself.

## Environment & bindings (verified from `functions/` — `grep -rhoE "env\\.[A-Z_]+" functions`)

Bindings (Cloudflare dashboard → `muse-live` → Settings → Bindings; not secrets):

| Name | Kind | Used for |
|---|---|---|
| `MUSE_KV` | KV namespace | Shared state, users, audit fallback, observe aggregates, usage counters |
| `MUSE_D1` | D1 database | Audit log, transcripts (FTS) |
| `MUSE_DB` | D1 database | Asset graph / media registry (`functions/api/assets/`) |
| `MUSE_MEDIA` | R2 bucket | Media blobs (panos, caption files, segments) |

Secrets (`wrangler pages secret put … --project-name muse-live`):

| Name | Required? | Used for |
|---|---|---|
| `MODEL_API_KEY` | Yes for live AI | Muse drawer, Stream Check (SAM), Transcribe, Voice (`/api/museai`, `/api/streamcheck`, `/api/transcribe`, `/api/voice`) |
| `SESSION_SECRET` | Yes | Session-cookie HMAC (falls back to a value derived from the password hash — set it explicitly) |
| `MUSE_PASSWORD_HASH` | **Required** | Shared-password hash, `sha256("muse-live:" + password)` |
| `MUSE_FEED_SECRET` | **Required** | Calendar-feed (`.ics`) link signing; without it signing falls back to the password hash |
| `SHADEMAP_API_KEY` | For Sun & Shadow | Served to the client only via `GET /api/shademap-key`; empty = panels show a no-key note |
| `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL` | For Omni Slack | Bot post + webhook fallback (`functions/api/omni/slack.js`) |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | For Omni Gmail | OAuth refresh → `gmail.send` (`functions/api/omni/mail.js`) |
| `FB_GRAPH_TOKEN` | For FB Live | Graph API proxy (`functions/api/fblive.js`); never reaches the browser |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (+ `AWS_SESSION_TOKEN`) | For AWS telemetry | CloudWatch SigV4 (`functions/api/telemetry.js`) |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | For Mux telemetry | Mux Data basic auth (`functions/api/telemetry.js`) |
| `OIDC_CLIENT_SECRET` | With SSO | OIDC code exchange (with `OIDC_ISSUER`, `OIDC_CLIENT_ID` below) |

Plain variables (Pages → Settings → Variables, or `.dev.vars` locally):

| Name | Default in code | Used for |
|---|---|---|
| `MUSE_MODEL` | Built-in default model | Model name for `/api/museai` |
| `MUSE_REASONING_EFFORT` | `low` (`minimal` for glances) | Default reasoning effort |
| `MUSE_API_BASE`, `MUSE_API_BASE_ALLOWLIST` | Built-in Meta endpoint | Model-API base override + allowlist (`functions/_lib/abuse.js`) |
| `MUSE_RATE_PER_MIN`, `MUSE_GUEST_RATE_PER_MIN` | 30 / 10 | Per-session Muse rate limits |
| `MUSE_DAILY_TOKEN_CAP`, `MUSE_GUEST_DAILY_TOKEN_CAP` | 2000000 / 1500000 | Daily token budgets (KV counters) |
| `GUEST_DEMO` | on (`off` disables) | Guest-demo kill switch |
| `ALLOW_SHARED_PASSWORD` | off once accounts exist | Keep the shared password alongside per-user accounts |
| `AWS_REGION` | `us-east-1` | CloudWatch region |
| `FB_GRAPH_VERSION` | `v26.0` | Graph API version |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_ALLOWED_DOMAINS`, `OIDC_DEFAULT_ROLE`, `OIDC_LABEL`, `OIDC_SCOPES` | — / `viewer` / “Continue with SSO” / `openid email profile` | Optional SSO (see One-time setup) |

## Analytics note (`/ops` pages)

`index.html` and `about.html` gate Google Analytics (`G-35PR2RKJ51`) behind
denied-by-default consent and skip it on localhost. The four admin pages still
load the tag unconditioned and need the same edit (outside the docs pass —
owner/parent to apply): `ops/index.html`, `ops/health.html`, `ops/audit.html`,
`ops/users.html`. First-party telemetry (`js/muse-observe.js`) is unaffected.

## CSP candidates (no change made)

`_headers` was left unchanged: every media host in `MUSE_MEDIA_HOSTS` appears in
both `connect-src` and `media-src` and stays. Hosts with zero hits in
`js/` + `index.html` + `about.html` at audit time — candidates to trim only after
a boot test, never blind: `https://esm.run`, `https://esm.sh`, `https://*.esm.sh`,
`https://data.jsdelivr.com`, `https://*.convex.site`. Do not trim
Tailwind/Quill/CDN or map hosts that the app actually loads.

## iCloud conflict copies (owner to delete — not deleted by the docs pass)

Staging now excludes `name N.ext` copies (`/ \d+\./` in `stage.mjs`, including the
`functions/` copy), but the source copies still sit in the working tree and in
the old `.stage/`. Regenerate the list with
`find . -name "* [0-9]*" -not -path "./node_modules/*" -not -path "./.stage/*" -not -path "./.git/*"`.
Owner: review and delete them in Finder/Terminal; until then they are excluded
from deploys but still synced by iCloud.

## Licence choice (owner)

No `LICENSE` file exists. Either adopt a GPL-compatible project licence (keeps
LibreDWG DWG import) or drop DWG import (DXF still works). See
`THIRD_PARTY_NOTICES.md`. Do not publish the repo until one option is chosen
and the glasses UI Toolkit NOTICE ships with the build.
