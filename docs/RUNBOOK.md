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
   npx wrangler@4.139.0 pages secret put MUSE_PASSWORD_HASH --project-name muse-live   # optional: rotate the shared password
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
