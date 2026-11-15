# PorkCode

Use this guide as the starting point for work involving PorkCode itself. It
covers the core concepts needed to configure and customize PorkCode, extend it
with plugins, and build integrations with its API and clients.

PorkCode is a local-first fork of OpenCode. It talks only to endpoints the user
configures — LM Studio, Ollama, vLLM, llama.cpp (`llama-server`), generic
OpenAI-compatible and Anthropic-compatible servers, plus any provider reachable
with a manual API key and/or custom `baseURL`. There are no built-in cloud
vendors, no account sign-ins, and no upstream-hosted services.

## Source of truth

PorkCode publishes no hosted documentation site. Answer from this overview, the
running installation, and the source repository at
<https://github.com/imrparker/PorkCode>:

- `porkcode --help` (and `<command> --help`) lists every CLI command, flag, and
  accepted value. Never guess a command or flag; check the help output.
- The running server exposes its HTTP API as an OpenAPI document at
  `/openapi.json`.
- When behavior is still unclear and the repository checkout is available, read
  the code — it wins over any assumption.

Do not use upstream `opencode.ai` documentation or the upstream OpenCode product
as a source of truth for PorkCode: PorkCode has removed cloud sign-ins, hosted
providers, and updater feeds, so upstream pages describe features this build
does not have. State the difference instead of recommending upstream behavior.

## Providers

PorkCode connects to model servers without accounts or OAuth consoles:

- Built-in local backends are detected automatically while their server answers
  on its default address: LM Studio (`http://127.0.0.1:1234`), Ollama
  (`http://127.0.0.1:11434`), vLLM (`http://127.0.0.1:8000`), and llama.cpp
  (`http://127.0.0.1:8080`). Settings > Providers lists them, shows detection
  status, and edits each server address and API key.
- Any other OpenAI-compatible or Anthropic-compatible server is configured in
  `providers.<id>` with `settings.baseURL` and models under `models`. A
  configured endpoint without a `package` uses the built-in OpenAI-compatible
  wrapper; set `"package": "@opencode/ai/providers/anthropic-compatible"` for
  Anthropic Messages servers (the request goes to `<baseURL>/messages`).
- Authentication is a plain key: `settings.apiKey`, an environment variable, or
  a key stored through Settings. Dummy keys are fine for local servers that do
  not check them.

## CLI and TUI settings

CLI and TUI preferences are separate from PorkCode's server and project
configuration. They live in the global `~/.config/porkcode/cli.json` (or
`$XDG_CONFIG_HOME/porkcode/cli.json`). There is no project-local CLI
configuration. Set `PORKCODE_CLI_CONFIG_CONTENT` to merge inline JSON over the
global settings. Most preferences can also be changed from the TUI by pressing
`Ctrl+P` and selecting **Open settings**.

Keybindings live under `keybinds` in `cli.json`. The leader key is the
`keybinds.leader` entry; leader timing is configured separately under
`leader.timeout`. Bindings can use a string, an array of strings, or an object
when event behavior such as `preventDefault` is required. Disable a binding with
`"none"` or `false`. Never guess a command ID or default binding — inspect the
current `cli.json`, its schema in the repository, or the TUI settings UI.

Do not put terminal preferences (themes, keybindings) in `porkcode.json(c)`.

## Configuration

PorkCode's server and project configuration uses JSON or JSONC. Global
configuration lives at `~/.config/porkcode/porkcode.json(c)` and applies to
every project for that user. Project configuration can live in any directory as
`porkcode.json(c)` or `.porkcode/porkcode.json(c)`, including nested packages in
a monorepo.

During ordinary project discovery, PorkCode searches the current Location
directory and every ancestor through the filesystem root, including directories
above the detected project or repository root. It merges direct `porkcode.json(c)`
files from the farthest ancestor to the current directory, then does the same
for `.porkcode/porkcode.json(c)` files. Every discovered `.porkcode` config
overrides every discovered direct config. Global filesystem configuration has
lower precedence than these discovered documents.

Common configuration fields include `model`, `default_agent`, `permissions`,
`agents`, `commands`, `plugins`, `providers`, `mcp`, `skills`, `instructions`,
`formatter`, and `lsp`. Do not guess field names or shapes: read the schema in
the repository (`packages/schema`) or an existing working config, and preserve
unrelated settings when editing an existing file.

Config changes apply without a restart. PorkCode watches config files and
reloads agents, commands, skills, MCP servers, and plugins after a save. The TUI
does the same for `cli.json`. To force a full reload, use `/reload`. Don't tell
the user to restart PorkCode after editing config.

## MCP servers

Configure MCP servers under `mcp.servers`. Prefer the CLI because it preserves
unrelated configuration. Use `--global` when the user asks to set up a service
for themselves without limiting it to the current project; omit it when they
explicitly want project-local configuration.

```sh
porkcode mcp add <name> --global --url <remote-url>
porkcode mcp list
```

Remote servers use OAuth by default. If `mcp list` reports that a server needs
authentication, tell the user to run `/mcps`, select the server, and sign in.
Do not run `porkcode mcp auth` through the shell tool: it starts an interactive
flow whose authorization link can be hidden in background process output. Use
the user-facing MCP interface instead.

Report the server as configured but awaiting sign-in until its connection
status confirms it is connected.

OAuth credentials are never written into configuration; they go to PorkCode's
local credential store in its data directory. Do not ask for or store an API key when the server
supports OAuth. Use header-based credentials only when OAuth is unavailable or
the user explicitly requires them, and use an environment substitution such as
`{env:MCP_API_KEY}` instead of writing a secret into configuration.

## Plugins

Plugins are TypeScript modules loaded at runtime from config `plugins` entries,
local files under a `plugins/` directory next to the config (global
`~/.config/porkcode/plugins` or project `.porkcode/plugins`), or npm packages.
They hook into provider requests, tools, permissions, and events through the
plugin API in the repository (`packages/plugin`). Manage them with
`porkcode plugin add|list|remove`. For questions about plugin APIs, read the
repository source rather than upstream docs; the fork's plugin surface may
differ.

## Service

PorkCode uses a client-server architecture. Interfaces such as the TUI connect
to a background PorkCode service, which owns sessions, configuration, plugins,
permissions, and tool execution. Its registration lives under the XDG state
directory (`~/.local/state/porkcode`), and the session database is
`porkcode[-<channel>].db`.

PorkCode normally discovers or starts the shared background service
automatically. Restart it only if it is stuck or unhealthy, not to apply
configuration changes:

```sh
porkcode service restart
```

Check its status after restarting:

```sh
porkcode service status
```

## API

PorkCode exposes an HTTP API from its server. The API is described by an OpenAPI
document available from the running server at `/openapi.json`.

In Code Mode, use the built-in `opencode` tool namespace first, called inside
`execute` as `tools.opencode.*`. These tools skip the shell round-trip and
handle discovery and authentication; find its tools with Code Mode's `search`,
for example `search({ namespace: "opencode" })`. For anything they do not cover,
use the `porkcode api` command. It uses the same discovery and authentication
flow as the TUI and may start the background service when no compatible healthy
service is available. It accepts either an HTTP method and path or an OpenAPI
operation ID.

Call an endpoint with an HTTP method and path:

```sh
porkcode api get /api/info
```

Pass a request body with `--data` or `-d`, and additional headers with
`--header` or `-H`:

```sh
porkcode api post /api/example --data '{"key":"value"}'
porkcode api get /api/example --header 'X-Example:value'
```

Request bodies default to `Content-Type: application/json`. When PorkCode is
connected to an explicit server instead of its managed background service, use
the same configured server and authentication context rather than constructing
an unauthenticated request separately.

## Clients

`@opencode/client` (the repository's generated TypeScript client for the HTTP
API) and the embeddable SDK are workspace packages built from the PorkCode
repository; they are not published to npm by this fork. For an external
application, talk to the server's HTTP API directly using `/openapi.json`, or
build against the repository. The default entrypoint exposes Promise-based
resource clients and async iterables for streaming endpoints; the `effect`
entrypoint exposes typed Effects, Streams, and decoded schema values, and its
`Service` API can discover, start, stop, and authenticate with the local
background service from a Node application.

## Troubleshooting

PorkCode runs a client and a background server. Start by determining whether a
problem belongs to the client, the shared server, or one project.

- Check the service with `porkcode service status` and verify the API with
  `porkcode api get /api/info`.
- Compare with `porkcode --standalone`, which runs the TUI with a private
  server, to isolate shared-service issues.
- Inspect `~/.local/share/porkcode/log/porkcode[-<channel>].log`. Filter
  `role=cli` for client startup and `role=server` for sessions, providers,
  plugins, permissions, and tools.
- Run one reproduction with `PORKCODE_LOG_LEVEL=DEBUG` when normal logs are not
  sufficient.
- For local model servers, verify the server itself answers on the configured
  address before changing PorkCode configuration.
- Do not delete or edit the database, service registration, or service config
  while diagnosing a problem. Back up persistent data before inspecting it with
  external tools.
- Redact API keys, authorization headers, prompts, file contents, and other
  sensitive data before sharing diagnostics.

When the user wants to report what you found, use the `report` skill.
