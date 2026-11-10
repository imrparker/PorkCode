# Changelog

This file records how **PorkCode** diverges from upstream [opencode](https://github.com/anomalyco/opencode), newest first. It is not a release history: entries describe structural changes to the fork, grouped by category rather than by version. Upstream's own changelog was dropped on purpose — read it in the upstream repository if you need per-release notes for the base.

PorkCode is based on opencode `dev` at commit `73c95abac2`, imported as this repository's first commit; everything after that import is PorkCode work. It is used under the MIT License (see [LICENSE](LICENSE) and [README.md](README.md)). When syncing from upstream, keep this file as-is and add a new entry for anything the sync changes.

## Unreleased — fork base (2026-11-10)

### Added

- **Local backends board on the Providers page.** Settings → Providers now always lists LM Studio (`127.0.0.1:1234`), Ollama (`11434`) and vLLM (`8000`) with a live **Detected** / **Waiting for server** badge driven by the auto-discovery plugins below; rows stay listed while a backend is down so you can see what PorkCode will pick up. Custom ports keep being set through `providers.<id>.settings.baseURL` in `opencode.json`. (`683e37c`)
- **Windows installer build.** `packages/desktop` now packages a signed-off (unsigned) NSIS installer branded end to end: artifact `porkcode-desktop-win-x64.exe`, product name PorkCode, publisher imrparker, appId `com.imrparker.porkcode`, and a placeholder "P" monogram icon set replacing upstream's logo. Build the CLI first (`packages/cli`, `--single --baseline`, with `OPENCODE_CHANNEL=porkcode`), then the desktop with `OPENCODE_CHANNEL=prod` via `bun run build` + the two-step `script/pack.ts`. (`e250474142`, `703b66a0ac`)
- **Runs side by side with an installed OpenCode.** Packaged PorkCode talks only to its own background-service channel: the bundled CLI is built with `OPENCODE_CHANNEL=porkcode`, so its daemon registers in `service-porkcode.json` on a hash-derived port and uses a fork-owned database, and the desktop app probes exactly that file. Before this, PorkCode shared upstream's `service.json`; once versions diverged (see 0.0.1 below), each app would terminate the other's server as a "version mismatch" on startup. Now neither client sees the other. (`2ea4f77`)
- **Model auto-discovery for local backends.** The LM Studio, Ollama, and vLLM plugins poll your backend's model endpoint (`/api/v1/models`, `/api/tags`, `/v1/models`) every 30 seconds and register whatever it serves — no `opencode.jsonc` edits when you load, unload, or add a model.
- **LM Studio lists only loaded models.** Unloaded models would fail or stall when selected, so they are hidden; a model appears in the picker within one poll interval after you load it, and its context length comes from the running instance.

### Removed

- **"Popular providers" section and its "Show more providers" link** from Settings → Providers — upstream vendor-catalog UI that was always empty here, since its list only ever named hosted vendors this fork removed. Connecting an integration still works wherever the server actually exposes one: the model picker's unpaid dialog lists them and opens the same connect flow. (`683e37c`)
- **Hosted vendor provider plugins and protocols** (~8,300 lines): OpenAI, Claude Agent, Google Vertex AI, Azure OpenAI, Amazon Bedrock, GitHub Copilot, GitLab, xAI, OpenRouter, Cloudflare AI Gateway / Workers AI, Databricks, DigitalOcean, Kilo, LLM Gateway, Modal, Neon, NVIDIA, SAP AI Core, Snowflake Cortex, ZenMux, Cerebras, and friends. What remains is the compatible loaders — `openai-compatible`, `openai-compatible/responses`, `openai-compatible/images`, `anthropic-compatible` — plus the local-provider plugins (LM Studio, Ollama, vLLM). (`8c700c165a`, `9413a6f9b8`)
- **Vendor sign-in and monetization flows:** Console subscription, usage limits, free-model ("zen") logic, hosted voice route, the About page, and upsell dialogs. (`ab83ecafdf`, `a5dd7dca14`)
- **opencode.ai branding:** website and trademark strings across all locales, menu/settings/error/titlebar/notification links, and the project avatar's upstream favicon fetch. Display identity is PorkCode throughout. (`d82c22082a`, `252bb9323a`)
- **Upstream docs and CI bloat:** original README, contributing and security guides, cloud/enterprise documentation, GitHub workflow definitions. (`44bfbffe3e`, `14798adc2e`, `ca64bb670d`)

### Replaced

- **Fork-native versioning.** All packages moved from the inherited upstream `2.2.5` to PorkCode's own `0.0.1`; the installer metadata, updater comparison base, and service registration all report it. (`aeacd0b`)
- **Model catalog source is now [models.dev](https://models.dev)** and the bundled snapshot ships empty, so nothing is fetched until you opt in. (`16a9be29b4`)
- The upstream vendor's own hosted providers (`opencode`, `opencode-go`) are blocklisted from the community catalog — they would otherwise load as generic compatible providers against endpoints this fork does not serve. (`20de04a385`)

### Re-gated (offline by default)

- Network features that upstream runs unconditionally are now behind flags and **off** by default:
  | Flag | Effect when set to `1` |
  | --- | --- |
  | `OPENCODE_ENABLE_MODELS_FETCH` | Fetch the models.dev catalog for model metadata. |
  | `OPENCODE_ENABLE_AUTOUPDATE` | Re-enable update checks against a feed you operate. |
- No update feeds are configured out of the box, and "What's New" no longer fetches or displays a remote changelog — it makes zero requests. (`a23f388642`, `a5dd7dca14`)
- Desktop background checks now honor that flag as well: upstream's electron-updater checked the release feed at startup and every ten minutes (against this fork's repository that was pure 404 noise). With the flag unset neither runs; the **Check for Updates** menu item still works on demand. (`ec5ae39`)

### Fixed

- **Desktop launches alongside an installed OpenCode.** The fork renamed display identity but left the runtime app id as upstream's `ai.opencode.desktop`, so PorkCode shared OpenCode's userData, logs, CLI staging — and its single-instance lock, which made whichever app started second quit silently. Runtime identity is now `com.imrparker.porkcode[.dev/.beta]`. (`8bee639`)
- **Installer builds register their CLI where the app looks.** Building the bundled CLI with `OPENCODE_CHANNEL=prod` put its registration in a private `service-prod.json`, invisible to every client — the desktop spawned the daemon successfully, then timed out after 120 s waiting on `service.json`. Packaged builds now build the CLI with `OPENCODE_CHANNEL=porkcode` and the app polls that channel's file (see "Runs side by side" above); the README build steps say so. (`8bee639`, `2ea4f77`)
- **Wordmark `k` and loading-screen mark.** The fork's redrawn pixel `k` closed its outline wrong and rendered as a stem plus two vertical bars; it is now a proper staircase arm and leg. The desktop loading splash swaps upstream's "O" mark for the wordmark's lowercase `p`. (`36796a5`)
- **Windows checkouts without symlink support.** `packages/app/src/custom-elements.d.ts` was a git symlink; materialized as plain text by `core.symlinks=false` checkouts it broke typechecking. It is now a triple-slash reference directive that works everywhere. (`ec5297b`)
- **Broken `/models` discovery against authenticated backends.** Upstream's model checks never passed the API key stored through `/connect` — only a key hand-written in the config file was sent — so every poll of a password-protected backend (e.g. LM Studio with an API key set) errored with `invalid_api_key` and the model list stayed empty. PorkCode passes the stored key on discovery requests and re-authenticates live when the credential switches, no restart. (`3b9fc900b8`)
- Desktop production builds work again: the fork's removal of the root `install` script had broken the embedded installer asset (`desktop-cli.ts` imports it as raw text), and `@opencode/script` crashed on the deleted `.github/TEAM_MEMBERS`. Restored an offline-only PorkCode `install` script (installs a local binary to `~/.opencode/bin`, no hosted downloads) and made the team roster optional. (`049e16104a`, `c0c5df37bc`)
- llama.cpp context-overflow responses are classified correctly and title generation pauses after one instead of failing repeatedly. (`ce33e461a1`)
- Desktop honors an explicit `XDG_STATE_HOME` behind an opt-in flag rather than always relocating state. (`25ff95e004`)
