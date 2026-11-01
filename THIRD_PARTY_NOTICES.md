# Third-party notices

Factual inventory of third-party code and fonts shipped with Muse Live. Licence
texts are reproduced only where the text file is present in this repository; where
no text file ships, the component and licence name are listed without reproducing
text. The project licence itself is an owner decision (see the last section) — this
file is not a licence grant.

## Editor

- **Quill 2.0.3** (`js/vendor/quill/quill.js`, `quill.snow.css`) — BSD-3-Clause.
  The bundle header reads “For license information please see quill.js.LICENSE.txt”,
  but that text file is not present in this repository. No licence text is reproduced
  here; obtain it from the Quill project before redistributing.

## Playback / documents / maps (vendored or CDN-loaded)

- **hls.js 1.5.20** (`js/vendor/hls.min.js`) — Apache License 2.0. Licence text ships
  at `js/vendor/hls.js-LICENSE`.
- **jsPDF 4.2.1 + jsPDF-AutoTable 5.0.8** (`js/vendor/jspdf.umd.min.js`,
  `jspdf-autotable.min.js`) — MIT. Licence texts ship at `js/vendor/jspdf-LICENSE`
  and `js/vendor/jspdf-autotable-LICENSE`.
- **LibreDWG Web 0.7.8** (`js/libredwg/libredwg-web.wasm` + loaders) — GNU GPL v3.0.
  This is the component that forces the project-licence choice below.
- **pdf.js 3.11.174** (CDN) — Apache License 2.0.
- **MapLibre GL 5.24.0** (CDN, unpkg) — BSD-3-Clause.
- **Tailwind CSS Play CDN**, **SheetJS 0.20.3**, **Fuse.js**, **Photo Sphere Viewer**,
  **three.js**, **ffmpeg.wasm** — loaded from CDNs or vendored as pinned in
  `index.html` / `js/`; each remains under its own licence (MIT / Apache-2.0 as
  published by its project). No licence text for these ships in this repository.

## Fonts

- **Inter** (`assets/fonts/Inter-Regular.ttf`, `Inter-Bold.ttf`) — SIL Open Font
  License 1.1. The full licence text ships at `assets/fonts/OFL.txt`.
- **Google Sans Flex** (`assets/fonts/GoogleSansFlex-latin.woff2`) and **Noto Sans**
  (Google Fonts) — under their respective font licences as published by Google.

## Glasses companion

- **Meta Wearables UI Toolkit** (`@wearables-ui-toolkit/icons` 129.23.0,
  `@wearables-ui-toolkit/mrbd` 129.23.0, `glasses-src/`) — Apache License 2.0.
  The toolkit's Apache NOTICE file is not present in this repository, so no NOTICE
  text is reproduced here. Owner: ship the vendor NOTICE alongside the glasses
  build before publishing the repo.
- **React / ReactDOM 19.2.7** (`glasses-src/`) — MIT.

## Project licence — owner choice required

There is currently **no** `LICENSE` file in this repository. Two options, owner to choose:

1. **Adopt a GPL-compatible project licence** (keeps DWG import via LibreDWG), or
2. **Drop DWG import** (DXF import still works) and licence the project otherwise.

No licence file is created by the docs pass; see `docs/RUNBOOK.md` (“Licence choice”).
