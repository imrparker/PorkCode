# PorkCode decoupling plan

Living document. Any agent working on PorkCode should read this and **update the checkboxes and Progress log** as it completes or discovers work. This is the single source of truth for the fork's separation roadmap.

## Goal

PorkCode forks OpenCode (upstream: `github.com/anomalyco/opencode`) to be a **local-first, non-cloud** coding agent. It talks only to endpoints the user configures: LM Studio, Ollama, vLLM, llama.cpp (`llama-server`), generic OpenAI-compatible and Anthropic-compatible servers — plus any provider reachable with a manual API key and/or custom `baseURL`. No built-in cloud vendors, no account sign-ins, no upstream-hosted services.

## Decisions made (2026-11-14)

| Question | Decision |
|---|---|
| Data/config isolation from upstream install | **Full isolation** — new `porkcode` roots/DB/config names. **No migration**: users set up fresh; old `opencode` files are left alone. |
| Internal npm scope `@opencode/*` (~2,008 files) | **Deferred** — keep internally; rename (if ever) happens last. |
| OpenCode Zen/Go provider integrations | **Remove** for full decoupling. |
| Other cloud providers (Copilot, Bedrock, Azure, …) | **Config-only access**: remove built-in OAuth/account-login flows; stay usable via config `apiKey` + custom `baseURL`. Key-based auth machinery must survive — only interactive sign-in goes. |

Boundary rule for all waves: strip cloud *products and sign-in flows*, never the generic provider machinery (`providers.<id>.settings.baseURL/apiKey`, `${VAR}` interpolation, AI-SDK option passthrough).

## Existing foundations (don't rebuild)

- `packages/core/src/plugin/provider/local.ts` — generic `createLocalProviderPlugin` factory: OpenAI-style `/v1/models` discovery, strips `/v1`, accepts key from config or stored credentials.
- Built-ins registered in `core/src/plugin/provider.ts`: `LMStudioPlugin`, `OllamaPlugin`, `VLLMPlugin`, `PromptCacheKeyPlugin`. Settings list: `app/src/settings/providers/providers.tsx`.
- Custom baseURL: `providers.<id>.settings.baseURL` written by `core/src/config.ts`; `${VAR}` interpolation in `model-resolver.ts`; `baseURL`/`endpoint` passthrough in `aisdk-native.ts`.
- Model catalog already excludes upstream cloud: `EXCLUDED_PROVIDERS = {"opencode", "opencode-go"}` in `core/src/models-dev.ts`.
- Root `install` script is already PorkCode-branded and **binary-only** (no release server; `-v/--version` errors by design).

## Wave 1 — identity & provider surface (no data break)

- [x] 1. Repo metadata: `github.com/anomalyco/opencode` → `github.com/imrparker/PorkCode` in all package.json/Cargo.toml/npm manifests, generated metadata (`cli/script/build.ts`, `pack.ts`, `build-node.ts`), and operational docs/tooling (see "keep as-is" for exceptions). Also fixed: `gui-plugins/src/updater/beta-notes.ts` + `desktop/script/beta-notes.ts` REPOSITORY constants (beta notes were fetching upstream releases — fork bug), `script/github/close-issues.ts`/`close-prs.ts` repo constants, `.opencode/tool/github-pr-search.ts`, `.opencode/command/issues.md`, `tui/src/component/error-component.tsx` crash-report URL (⚠️ needs an `bug-report.yml` issue template in imrparker/PorkCode or the link 404s), app/vscode/process-daemon READMEs, glossary README example.
- [x] 2. Telemetry & UA: OTLP `serviceName`, `porkcode.client`/`porkcode.run` attribute keys + default client → `porkcode` (`util/src/observability/otlp.ts`, `observability.ts`; core observability test updated, passes); CLI execArgv `--user-agent=porkcode/<channel>/<version>/cli`; desktop updater `User-Agent: porkcode/...`.
- [x] 3. Remote install URLs (`gui-plugins/src/wsl/remote-cli.ts`, `src/ssh/remote-cli.ts`): now curl `https://raw.githubusercontent.com/imrparker/PorkCode/develop/install`. PorkCode's install is binary-only, so `--version` sources fail loudly by design (no release server). Deeper fixes below belong to Wave 2 item 12.
- [ ] 4. Cloud auth removal, config-only access: remove console OAuth deep-link handling (`opencode://console/authorized`), "login with OpenCode" entries, Zen/Go residuals (`ai/src/effort-updates.ts`, `provider-error.ts`, core session refs, story fixtures, updater i18n stragglers). Then audit other built-in cloud OAuth/account-login integrations and strip interactive flows while keeping key-based auth.
- [ ] 5. Local endpoint shapes: add **llama.cpp** built-in (`createLocalProviderPlugin`, default `http://127.0.0.1:8080`) + settings entry; generic user-defined **OpenAI-compatible** provider (baseURL required); verify **Anthropic-compatible** custom baseURL (`/v1/messages` semantics, dummy keys for local servers) with a regression test.
- [ ] 6. Docs/skills: rewrite `core/src/plugin/skill/opencode.md`, `initialize.txt`, `report.md` to porkcode names/paths (rename skill file too).

## Wave 2 — storage & binary break (clean cut, no migration)

- [ ] 7. `packages/util/src/global.ts`: `const app = "opencode"` → `"porkcode"` → roots become `~/.local/share/porkcode`, `~/.config/porkcode`, `~/.cache/porkcode`, state/tmp likewise.
- [ ] 8. DB names (`cli/src/database-path.ts`): `porkcode.db` / `porkcode-<channel>.db`.
- [ ] 9. Config discovery (`core/src/config/discovery.ts`): `porkcode.json(c)`, `.porkcode/` dir (keep `.claude`/`.agents` compat reads); plan dir `~/.opencode/plan` → `~/.porkcode/plan` (`core/src/plugin/plan.ts`).
- [ ] 10. Env vars: rename all ~152 `PORKCODE_*` → `PORKCODE_*` (src, scripts, tests, CI workflows, dev:live). No fallback reads — clean break.
- [ ] 11. Binary name → `porkcode`: `cli/script/build.ts` binary/execArgv, package.json bin entries, pack archive names; desktop resource `opencode-cli.exe` → `porkcode-cli.exe` (build utils, electron-builder `extraResources`, main-process lookup).
- [ ] 12. Kill upstream-binary/update fallbacks. **Half done by `a737616` (pulled 2026-11-14):** `desktop/script/build.ts` now throws unless the CLI exists in `../cli/dist` or `PORKCODE_DESKTOP_ALLOW_UPSTREAM_CLI=1` is set, and verifies the bundled CLI's compiled channel via `verifyBundledCliChannel()` (spawns `debug paths db`, expects `opencode-porkcode.db`). Remaining: `gui-plugins/src/ssh/remote-cli.ts` `archiveUrl` fetches `registry.npmjs.org/@opencode/cli-<target>`; `cli/src/services/updater.ts` Homebrew path updates from `anomalyco/tap` (installs upstream opencode — disable or replace with a PorkCode source); CLI runtime depends on npm-published `@opencode/pty@0.4.0` (+ platform packages) built from `packages/process-daemon` but published by upstream. All must become build-only / self-hosted — PorkCode builds must never ship or update to upstream binaries.
- [ ] 13. Legacy no-op cleanup (optional, after fresh installs verified): legacy `auth.json` import migration (`20260805200742_import_legacy_credentials`) reads a file that will never exist in new dirs; remove code + `CredentialLegacy` later.

## Wave 3 — protocol

- [ ] 14. Deep-link scheme → `porkcode://`, keeping only the local `open?project=` route (console OAuth removed in item 4). Touches: desktop `electron-builder.config.ts` protocols, `src/main/lifecycle/index.ts` argv filter, `src/main/deep-links/machine.ts` + tests.

- [x] 15. Clean uninstall (desktop NSIS): `resources/windows/installer.nsh` `customUnInstall` now removes Electron userData (`$APPDATA\<appId>`), the electron-updater cache (`$LOCALAPPDATA\@opencodedesktop-updater`, name derived from package name — update alongside Wave 2 item 11 renames), and deletes a stale `opencode://` protocol class when it still points at the uninstalling install. Deliberately NOT removed: `~/.local/share/opencode` / `~/.config/opencode` (shared with CLI; holds credentials/sessions). x64 + arm64 installers rebuilt with this 2026-11-14 and copied to the user's Desktop.

## Verification checklist

- [x] `bun run check` from repo root — passes 2026-11-14 (needs the Node note above; 550 pre-existing anti-slop warnings are non-failing).
- [ ] Package tests: `packages/core`, `packages/cli`, `packages/desktop`, `packages/gui-plugins`.
- [ ] From-scratch run (the migration-free acceptance test): fresh PorkCode creates its own dirs + DB, no reads/writes under `~/.config/opencode` or `opencode.db`; add Ollama / LM Studio / custom-baseURL provider; session completes.
- [ ] Rebuild both Windows installers (x64 + arm64) end-to-end after Wave 2.

## Installer build recipe (Windows host)

The bundled CLI's channel is compiled in; it MUST be `porkcode` (`FORK_CLI_CHANNEL` in `desktop/script/utils.ts`). With the env var unset the channel falls back to the git branch name, the CLI registers in upstream's `service.json`, and a packaged PorkCode shows "Timed out waiting for the background service to start" — this is what broke the first 2026-11-14 installers. Never set `PORKCODE_VERSION` (forces channel `latest`).

```powershell
# x64: CLI (baseline variant is what desktop bundles), then app + installer
cd packages/cli;    $env:PORKCODE_CHANNEL='porkcode'; bun run script/build.ts --single --baseline
cd ../desktop;      $env:PORKCODE_CHANNEL='porkcode'; bun run build   # copies cli/dist into resources/, verifies channel
                    bunx electron-builder --win --x64 --publish never --config electron-builder.config.ts
# arm64 (cross-packaging from x64 host): same, with PORKCODE_TARGET set for BOTH steps; no --baseline.
# Channel verification is skipped for foreign-arch CLIs (x64 Windows cannot spawn them) — build with the right env.
```

Single-target CLI builds wipe `packages/cli/dist`; rebuild the target you need before each desktop build. After an arm64 pass, restore x64 `resources/opencode-cli.exe` + `.version` from `dist/win-unpacked/resources/` for local dev. Installed apps reuse a staged CLI under `%APPDATA%\<app id>\cli\<version>-<arch>` (`desktop-cli.ts` skips staging when the file exists) — reinstalling over the same version string does not restage it, so bump or clear that folder when testing channel fixes.

`bun run check` needs Node ≥ 22.18 on PATH: oxlint runs its `.ts` JS plugins (`.oxlintrc.json` jsPlugins) through a child Node process, and older Node rejects the `.ts` extension (`ERR_UNKNOWN_FILE_EXTENSION`). On Node 22.x < 22.18 set `NODE_OPTIONS=--experimental-strip-types`, or upgrade Node.

## Intentionally kept (do NOT "fix" these)

- Root `README.md` fork attribution + LICENSE provenance (MIT requirement).
- `CHANGELOG.md` historical entries referencing upstream.
- Issue/provenance links in code comments & patches: `core/src/mcp/client.ts`, `desktop/electron-builder.config.ts(+test)` (#51867), `patches/install-korean-ime-fix.sh`, test names citing upstream issues, `script/drive/subagent-eviction.*`.
- Test fixtures/story data using upstream URLs/paths as arbitrary strings (`beta-notes.test.ts` PR payloads, `domain.test.ts` paths, `link-segments.test.ts`, `markdown.stories.tsx`, tui plugin fixtures).
- `.opencode/glossary/<locale>.md` historical citation links; `translator.md` brand lists (they list real third-party names/repos as do-not-translate examples).
- Upstream-hosted third-party artifacts we consume and cannot republish today: `ghostty-web` (`github:anomalyco/ghostty-web#<sha>` in app + gui-plugins package.json), tree-sitter grammar wasm/queries under `anomalyco/tree-sitter-*` (`tui/src/parsers-config.ts`), strobe benchmark tool links in perf READMEs. These are supply-chain couplings to note, not branding bugs; revisit if we ever mirror them.
- `process-daemon/README.md` line "Moved from anomalyco/opencode-pty" (provenance) — but its `gh --repo` command examples DO point at PorkCode.

## Progress log

- 2026-11-14: Wave 1 items 1–3 done. Verified: core observability test passes; typecheck clean in util, gui-plugins, tui (cli scripts are string-only edits). Remaining `anomalyco` mentions are all on the keep-list or Wave 2 scope (brew tap, npm fallbacks). Next: item 4 (cloud auth removal), then 5 (llama.cpp + generic OpenAI-compatible + Anthropic baseURL verification), then 6 (skills/docs).
- 2026-11-14 (later): Rebuilt both Windows installers with Wave 1 changes and copied to the user's Desktop. Note: single-target CLI builds (`PORKCODE_TARGET=<t> bun run script/build.ts --skip-install`) WIPE `packages/cli/dist` — it currently holds only `cli-windows-arm64`; rebuild the target you need before a desktop build (desktop falls back to downloading upstream otherwise — never let that happen, see item 12). Desktop `resources/opencode-cli.exe` restored to x64-baseline for local dev.
- 2026-11-14 (uninstall cleanup): User uninstalled PorkCode Dev. Removed stale remnants: `%APPDATA%\com.imrparker.porkcode[.dev]`, `%LOCALAPPDATA%\@opencodedesktop-updater`, broken Start Menu `OpenCode Dev.lnk` (pointed at a deleted pre-rebrand build), and the stale HKCU `opencode://` protocol class pointing at the deleted exe. One orphan CLI-server process (staged under old userData) held a file lock — killed it after confirming it was not this session's host. Kept: upstream OpenCode desktop (`ai.opencode.desktop*`, `@opencode-aidesktop-updater`, valid `OpenCode.lnk`) and shared `~/.config/opencode` + `~/.local/share/opencode`. Implemented item 15 (clean uninstall) in installer.nsh; x64 installer rebuilt with it.
- 2026-11-14 (channel fix + pull): Pulled `a737616` (fast-forward, no overlap with uncommitted Wave 1 work). Root cause of the "Timed out waiting for the background service to start" screenshot found: earlier installers bundled a CLI compiled on the default dev channel (git-branch fallback), which registers in upstream's service registry — see recipe above. Rebuilt both installers with `PORKCODE_CHANNEL=porkcode` (x64 verified via `opencode-porkcode.db`; arm64 trusted-by-construction, cannot spawn on x64 host) and copied to the user's Desktop. Added cross-arch guard in `desktop/script/build.ts`: channel verification only runs when the bundled CLI matches the host arch, otherwise warns. Item 12 marked half-done.

- 2026-11-14: Plan agreed (isolation w/o migration, scope deferred, Zen/Go removed, config-only clouds). Wave 1 items 1–3 in progress.
- Build note from this machine: desktop installers build via `packages/desktop` → `bun run build` + `bunx electron-builder --win <arch>`; cross-arch needs `PORKCODE_TARGET=windows-arm64` (env var name changes in Wave 2 item 10). `packages/cli/dist` now holds all 12 CLI targets.
