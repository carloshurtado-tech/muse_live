# Migration plan — legacy bundles → React 19 + TypeScript + Vite

## Where we are (honestly)

- `js/muse-app-a.js` + `js/muse-app-b.js`: ~2 MB of hand-written ES5 that builds views as HTML
  strings (`innerHTML`), wires ~760 inline `onclick` handlers to ~1,500 global functions, and keeps
  state in mutable globals persisted to `localStorage`.
- It works, it's fast enough, and it has a large surface: techbook PDF, CAD/DWG viewer, 360 survey,
  finance, travel, crew, schedule, telemetry maps, wiki.
- Costs: no module boundaries or types, XSS risk wherever a template forgets `esc()`, CSP needs
  `'unsafe-inline'` (inline handlers) and `'unsafe-eval'` (see SECURITY.md), hard to unit-test, and
  no reuse of Meta design-system components.

The newer modules (`muse-streaming`, `muse-incidents`, `muse-schedule`, `muse-agent`, `muse-sync`)
already follow a "one module, one global API, data via functions" shape. They migrate first.

## Target

- React 19 + TypeScript (strict) + Vite; ES modules; code-split per surface.
- Meta UI Toolkit tokens/components (`@wearables-ui-toolkit/*` for the glasses app; the same tokens
  power the web theme) — one design system across web and glasses.
- Typed domain model (`Production`, `Department`, `Booking`, `Incident`, `Stream`) shared by the
  client, Functions and Muse tool schemas (generate the JSON schemas from the TS types).
- Server-side source of truth (KV for the sync mirror; D1 `muse-live-db` for anything
  queryable — transcripts with FTS keyword search, the R2 media registry, the audit log;
  R2 bucket `muse-live-media` for blobs; schema in `migrations/0001_init.sql`),
  so Muse tools can run server-side.

## Strategy: strangler fig, one surface at a time

1. **M0 — Foundations (done in this build).** `package.json`, lint, typecheck, unit + e2e tests in
   CI, build script with source maps, deploy stager, shared KV storage + accounts, observability.
2. **M1 — Shell + islands.** Add Vite with multiple entry points. Mount React "islands" into
   existing `.view-pane` containers; the legacy router (`switchView`) stays. A thin `legacyBridge`
   exposes the globals the islands need (`productions`, `navGo`, `toast`) as typed functions.
3. **M2 — Data layer.** Replace direct global mutation with a store (`useSyncExternalStore`) whose
   persistence adapter is `MuseSync`/KV. Legacy code reads through getters during the transition.
4. **M3 — Migrate self-contained surfaces** (least coupled first): Incident Reports → Live Streams
   → Muse drawer → Muse Schedule → Dashboard home. Each lands behind a flag with an e2e spec.
5. **M4 — Production workspace.** Overview / department board / techbook editor, then crew,
   pack list, finance, travel. Techbook PDF generation moves to a typed module (or a Function).
6. **M5 — Remove legacy patterns.** Delete inline handlers and `eval`/`new Function` call sites →
   drop `'unsafe-eval'`, move to nonce-based CSP, drop `'unsafe-inline'` for scripts.
7. **M6 — Retire `muse-app-a/b`.** CAD viewer and 360 engine stay as isolated modules.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Hidden coupling through globals | Inventory globals per surface first (lint rule for implicit globals in migrated code); bridge module with explicit exports. |
| Regressions in rarely used screens | The e2e crawl visits every view and production tab in light and dark; add a spec per migrated surface before switching it on. |
| Two UI stacks during the transition | Islands share the same CSS tokens; legacy CSS is scoped to `.legacy` containers as surfaces move. |
| Data shape drift between devices | TS types + runtime validation (zod) at the storage boundary; versioned keys (`*_v2`) with migrations. |
| Performance | Code-split per view; keep the CAD/WASM and PDF engines lazy (they already are). |
