# Third-Party Notices

PorkCode is licensed under the MIT License (see [LICENSE](LICENSE)). It bundles or
redistributes third-party components whose licenses require attribution and license text
to accompany copies. Those notices are collected here.

## Fonts shipped in this repository

| Font | File(s) | License | Copyright |
| --- | --- | --- | --- |
| Geist Sans (variable) | `packages/app/public/assets/Geist-Variable.woff2` | SIL Open Font License 1.1 | Copyright (c) 2023 Vercel, in collaboration with basement.studio (https://github.com/vercel/geist-font) |
| Geist Mono (variable) | `packages/app/public/assets/GeistMono-Variable.woff2` | SIL Open Font License 1.1 | Copyright (c) 2023 Vercel, in collaboration with basement.studio (https://github.com/vercel/geist-font) |
| JetBrains Mono (Nerd Font patched) | `packages/ui/src/assets/fonts/JetBrainsMonoNerdFontMono-*.woff2`, `packages/app/public/assets/JetBrainsMonoNerdFontMono-*.woff2` | SIL Open Font License 1.1 (font); MIT (Nerd Fonts icon patches) | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono); Nerd Fonts copyright per https://www.nerdfonts.com |

The full SIL Open Font License 1.1 text is reproduced in
[`THIRD-PARTY-NOTICES/OFL-1.1.txt`](THIRD-PARTY-NOTICES/OFL-1.1.txt).

## Office document rendering engine

The Microsoft Office preview features use the BetterOffice packages
(`@betteroffice/docx`, `@betteroffice/xlsx`, `@betteroffice/pptx`, `@betteroffice/fonts`),
licensed under the Apache License 2.0:

> BetterOffice
> Copyright 2026 Elia Hilse, The OpenOOXML Project
> Copyright 2026 The OpenOOXML contributors

https://github.com/openooxml/betteroffice

The docx editing component is eigenpal's docx editor, also Apache License 2.0:

> Copyright 2026 EigenPal Inc.

https://github.com/eigenpal/docx-editor

The full Apache License 2.0 text is reproduced in
[`THIRD-PARTY-NOTICES/apache-2.0.txt`](THIRD-PARTY-NOTICES/apache-2.0.txt).

### Rust crates compiled into the BetterOffice wasm engines

The published BetterOffice engines compile Rust crates whose names, versions, licenses and
copyright lines are recorded in [`THIRD-PARTY-NOTICES/crates.json`](THIRD-PARTY-NOTICES/crates.json),
generated from each engine's `Cargo.lock` and crate license files. The referenced license
texts (MIT variants, BSD-2/3-Clause, Zlib, Unicode-3.0) are included in the same file.

## Node dependencies

All other runtime third-party software ships as npm dependencies; each package includes its
own license file inside `node_modules`, which is carried into packaged application builds.
