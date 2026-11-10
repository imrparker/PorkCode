# PorkCode

PorkCode is a fork of [OpenCode](https://github.com/anomalyco/opencode), the open source AI coding agent, rebuilt to run **only against providers you configure yourself**. Point it at any OpenAI-compatible or Anthropic-compatible endpoint — a hosted gateway, your company's proxy, or a local backend like LM Studio, Ollama, or vLLM — and nothing else.

## What this fork changes

- **Custom endpoints only.** The bundled provider set is limited to `openai-compatible`, `openai-compatible/responses`, `openai-compatible/images`, `anthropic-compatible`, and their settings modules. Hosted vendor packages that do not let you set a custom base URL were removed.
- **No external services by default.** Auto-update checks, the hosted model catalog, and the "What's New" changelog are all off; the bundled catalog ships empty. The app works fully offline until you add a provider.
- **No vendor sign-in.** Login lists, integration priorities, and Console/subscription flows from upstream were removed or left unreachable.

Everything else — the TUI, web UI, desktop app, agent loop, tools, permissions, plugins, MCP support — is upstream OpenCode.

## Configure a provider

Add providers to `opencode.json` in your project (or `~/.config/opencode/opencode.json` globally):

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

Any server that speaks the OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages wire format works. Use `@opencode/ai/providers/openai-compatible/responses` for servers that implement the Responses API and `@opencode/ai/providers/openai-compatible/images` for image-generation models.

### Optional environment flags

| Flag | Effect |
| --- | --- |
| `OPENCODE_ENABLE_MODELS_FETCH=1` | Fetch the community [models.dev](https://models.dev) catalog for model metadata (the upstream vendor's own hosted providers are filtered out). |
| `OPENCODE_ENABLE_AUTOUPDATE=1` | Re-enable update checks against a feed you operate. |

## Development

Requires [Bun](https://bun.sh).

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

Tests live per package; run them from a package directory, e.g. `cd packages/core && bun run test`. App e2e tests (Playwright) run with `bun run test:e2e:built` from `packages/app`.

## Building the Windows installer

The desktop app bundles the CLI and packages into a per-user NSIS installer. Build the CLI first, then the app, then wrap it:

```powershell
# 1. CLI binary (the desktop bundles the win-x64 baseline variant).
#    OPENCODE_VERSION gives release semantics: channel "latest", so the daemon
#    registers in the shared service.json that every client discovers. Building
#    with OPENCODE_CHANNEL=prod instead would hide the service from all clients.
cd packages\cli
$env:OPENCODE_VERSION = "2.2.5"
bun run script/build.ts --single --baseline

# 2. Desktop app against that CLI (prod is correct for the APP packaging channel)
cd ..\desktop
$env:OPENCODE_CHANNEL = "prod"
Remove-Item Env:OPENCODE_VERSION -ErrorAction SilentlyContinue
bun run build

# 3. Unpacked app, then the NSIS installer around it
bun run script/pack.ts
Copy-Item dist\win-unpacked $env:TEMP\porkcode-app -Recurse
$env:OPENCODE_DESKTOP_APP = "$env:TEMP\porkcode-app"
bun run script/pack.ts
```

The result is `dist/desktop/porkcode-desktop-win-x64.exe` at the repository root. It is unsigned, so SmartScreen shows a warning on first run ("More info → Run anyway"); installers are not committed to git — attach them to a GitHub Release if you want to distribute them.

## Attribution and license

PorkCode is derived from [OpenCode](https://github.com/anomalyco/opencode) by the opencode project, used under the MIT License. This repository keeps a fresh history that starts at an import of upstream `dev` at commit [`73c95abac2`](https://github.com/anomalyco/opencode/commit/73c95abac21dfe308f649f10b7c7df549ef94c59); every later commit is a PorkCode change. The original copyright notice is kept in [LICENSE](LICENSE).

Upstream updates are applied vendor-drop style: the import commit's tree matches `dev@73c95abac2` byte for byte, so syncing means applying `git diff <old-base>..<new-tip>` from an `upstream` remote onto this branch and committing the result.

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
