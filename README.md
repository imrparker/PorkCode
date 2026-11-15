# PorkCode

PorkCode is a fork of [OpenCode](https://github.com/anomalyco/opencode), the open source AI coding agent. It only talks to providers you configure yourself. Any OpenAI-compatible or Anthropic-compatible endpoint works: a hosted gateway, a company proxy, or a local server like LM Studio, Ollama, or vLLM. There are no built-in cloud vendors.

## What changed from upstream

- Custom endpoints only. The bundled provider set is `openai-compatible`, `openai-compatible/responses`, `openai-compatible/images`, and `anthropic-compatible`. Hosted vendor packages that don't let you set a base URL were removed.
- No network calls by default. Update checks, the hosted model catalog, and the "What's New" changelog are off, and the bundled catalog ships empty. The app works offline until you add a provider.
- No vendor sign-in. Login lists, integration priorities, and Console/subscription flows from upstream were removed or left unreachable.

The rest is upstream OpenCode: the TUI, web UI, desktop app, agent loop, tools, permissions, plugins, and MCP support.

## Configuring a provider

Add providers to `opencode.json` in your project, or globally at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "providers": {
    "lmstudio": {
      "name": "LM Studio",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://localhost:1234/v1",
        "apiKey": "local"
      },
      "models": {
        "qwen3-coder-30b": { "name": "Qwen3 Coder 30B" }
      }
    },
    "company-anthropic": {
      "name": "Company Anthropic Proxy",
      "package": "@opencode/ai/providers/anthropic-compatible",
      "settings": {
        "baseURL": "https://llm.internal.example.com/anthropic/v1",
        "apiKey": "{env:ANTHROPIC_PROXY_API_KEY}"
      },
      "models": {
        "claude-sonnet-4-5": {}
      }
    }
  }
}
```

Any server that speaks the OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages wire format works. Use `@opencode/ai/providers/openai-compatible/responses` for servers on the Responses API and `@opencode/ai/providers/openai-compatible/images` for image generation.

LM Studio, Ollama, and vLLM need no config when they run on their default port. PorkCode detects them automatically and lists them under Settings > Providers. From there you can also point each one at another machine and store an API key.

### Optional environment flags

| Flag | Effect |
| --- | --- |
| `PORKCODE_ENABLE_MODELS_FETCH=1` | Fetch the community [models.dev](https://models.dev) catalog for model metadata. The upstream vendor's own hosted providers are filtered out. |
| `PORKCODE_ENABLE_AUTOUPDATE=1` | Turn update checks back on, against a feed you run yourself. |

## Development

Requires [Bun](https://bun.sh) at the version pinned in `packageManager`; older releases lack the `check` command and are rejected by the build scripts. Packaged builds also need Node on `PATH`: JS tools (`vite`, `electron-vite`, `electron-builder`) launch through `.cmd` shims, so an x64-emulated Node on ARM64 Windows fails to find the native bindings that Bun installed for arm64.

```bash
bun install

# TUI from source
bun run dev

# Web app (with the backend running: bun dev serve --port 4096)
bun run dev:web

# Desktop app
bun run dev:desktop

# Lint + typecheck
bun run check
```

Tests live in each package. Run them from that package's directory, for example `cd packages/core && bun run test`. The Playwright e2e suite runs with `bun run test:e2e:built` from `packages/app`.

## Building the Windows installer

The desktop app bundles the CLI into a per-user NSIS installer. Build order matters: CLI first, then the app, then wrap it. Both steps take their target from `PORKCODE_TARGET` (`windows-x64` or `windows-arm64`, defaulting to the host); set it in both when cross-packaging.

```powershell
# 1. CLI binary for the target. The desktop bundles the baseline variant on x64,
#    so keep --baseline there; ARM64 has no baseline variant.
#    Keep PORKCODE_CHANNEL=porkcode. It gives PorkCode its own background
#    service registration (service-porkcode.json), port, and database, so it
#    never shares or replaces an installed OpenCode service. The packaged
#    desktop app looks for exactly that file; with the variable unset the
#    channel falls back to your git branch name, and the app then times out at
#    startup waiting for a registration its CLI will never write.
cd packages\cli
$env:PORKCODE_CHANNEL = "porkcode"
$env:PORKCODE_VERSION = "0.0.1"
bun run script/build.ts --single --baseline   # on an ARM64 host: --single alone

# 2. Desktop app against that CLI. The APP packaging channel is prod, which
#    is correct here and separate from the CLI channel above. bun run build
#    bundles only what ../cli/dist holds and checks the executable's channel;
#    PORKCODE_DESKTOP_ALLOW_UPSTREAM_CLI=1 bundles a published upstream CLI
#    anyway, which registers where PorkCode will not look.
cd ..\desktop
$env:PORKCODE_CHANNEL = "prod"
Remove-Item Env:PORKCODE_VERSION -ErrorAction SilentlyContinue
bun run build

# 3. Unpacked app first, then the NSIS installer around it.
bun run script/pack.ts
Copy-Item dist\win-unpacked $env:TEMP\porkcode-app -Recurse   # win-arm64-unpacked for ARM64
$env:PORKCODE_DESKTOP_APP = "$env:TEMP\porkcode-app"
bun run script/pack.ts
```

The result is `dist/desktop/porkcode-desktop-win-<arch>.exe` at the repository root. It is unsigned, so SmartScreen shows a warning on first run. Click "More info", then "Run anyway". Don't commit installers to git. Attach them to a GitHub Release if you want to distribute them.

An installed app stages its bundled CLI under `%APPDATA%\<app id>\cli\<version>-<arch>` and reuses that copy, so after changing the CLI channel without bumping `PORKCODE_VERSION`, delete that directory before reinstalling.

## Attribution and license

PorkCode is derived from [OpenCode](https://github.com/anomalyco/opencode) by the opencode project, used under the MIT License. The original copyright notice stays in [LICENSE](LICENSE). This repository keeps a fresh history that starts at an import of upstream `dev` at commit [`73c95abac2`](https://github.com/anomalyco/opencode/commit/73c95abac21dfe308f649f10b7c7df549ef94c59). Everything after that import is PorkCode work.

Syncing from upstream works vendor-drop style. The import commit's tree matches `dev@73c95abac2` byte for byte, so a sync means applying `git diff <old-base>..<new-tip>` from an `upstream` remote onto this branch and committing the result. See [CHANGELOG.md](CHANGELOG.md) for what this fork changes and why.

```
MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
