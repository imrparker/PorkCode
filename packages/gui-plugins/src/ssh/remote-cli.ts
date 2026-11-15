export * as RemoteCli from "./remote-cli"

import { Schema } from "effect"

export class Failure extends Schema.TaggedError<Failure>()("RemoteCliFailure", {
  code: Schema.Literals(["platform", "version", "install"]),
  detail: Schema.String,
}) {
  override get message() {
    return this.detail
  }
}

export function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function requireVersion(version: string) {
  if (version !== "local" && !/^[0-9][a-zA-Z0-9.+-]*$/.test(version))
    throw new Failure({ code: "version", detail: version })

  return version
}

export function discoverScript(options: { fromPath?: boolean; cache?: { directory: string; prefix: string } } = {}) {
  return `cli=${options.fromPath ? "$(command -v porkcode || true)" : '""'}
if [ -z "$cli" ] && [ -x "$HOME/.porkcode/bin/porkcode" ]; then cli="$HOME/.porkcode/bin/porkcode"; fi
${
  options.cache
    ? `if [ -z "$cli" ]; then
  for binary in "$HOME"/${quote(options.cache.directory)}/${quote(options.cache.prefix)}*/porkcode; do
    if [ -x "$binary" ]; then cli="$binary"; fi
  done
fi
`
    : ""
}if [ -n "$cli" ]; then printf '%s\\n' "$cli"; fi
`
}

// Adapters supply a quoted shell expression, including remote HOME or wslpath expansion.
export function versionScript(command: string) {
  return `if [ -x ${command} ]; then ${command} --version 2>/dev/null || true; fi\n`
}

export function parseVersion(output: string) {
  const line = output
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim()

  if (!line) return null
  const marker = line.lastIndexOf(" v")
  const version = marker === -1 ? line : line.slice(marker + 2)

  if (!version) throw new Error("V2 CLI did not provide a version")

  return version
}

export const probeScript = `set -eu
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$os" in linux|darwin) ;; *) exit 2 ;; esac
case "$arch" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) exit 2 ;; esac
target="$os-$arch"
if [ "$arch" = x64 ]; then target="$target-baseline"; fi
if [ "$os" = linux ]; then
  if [ -f /etc/alpine-release ] || (ldd --version 2>&1 | grep -qi musl); then target="$target-musl"; fi
fi
printf 'PORKCODE_REMOTE_TARGET=%s\\n' "$target"
`

// PorkCode publishes no CLI archives to a public registry; downloading upstream `@opencode/*`
// binaries would install OpenCode itself. Remote hosts fetch the standalone archives built by
// packages/cli/script/pack.ts (`porkcode-<target>.tar.gz`) from a base URL the user configures,
// such as an internal file server or a GitHub release of this repository. Without a configured
// base, remote installs fail with an actionable error instead of reaching for upstream binaries.
export function archiveUrl(target: string, version: string) {
  if (!/^(linux|darwin)-(x64-baseline|arm64)(-musl)?$/.test(target))
    throw new Failure({ code: "platform", detail: target })

  const base = process.env.PORKCODE_REMOTE_CLI_BASE?.trim()

  if (!base)
    throw new Failure({
      code: "install",
      detail:
        "No PorkCode CLI distribution is configured. Set PORKCODE_REMOTE_CLI_BASE to a URL serving porkcode-<target>.tar.gz archives, or stage the binary on the remote host.",
    })

  requireVersion(version)

  return `${base.endsWith("/") ? base : `${base}/`}porkcode-${target}.tar.gz`
}

type Source = { type: "download"; url: string } | { type: "archive" } | { type: "installer"; binary: string }

export function installScript(input: { version: string; directory?: string; source: Source }) {
  const version = requireVersion(input.version)

  // The managed CLI installer also configures the user's shell PATH. Private
  // installations use archives so their destination and shell setup stay isolated.
  if (input.source.type === "installer")
    return `set -eu
curl -fsSL https://raw.githubusercontent.com/imrparker/PorkCode/develop/install | bash -s -- --binary ${quote(input.source.binary)}
${verifyScript('"$HOME/.porkcode/bin/porkcode"', version)}
`

  return `set -eu
umask 077
destination="$HOME"/${quote(`${input.directory ?? ".porkcode/bin"}/porkcode`)}
mkdir -p "$(dirname "$destination")"
stage=$(mktemp -d "$(dirname "$destination")/.install-XXXXXX")
trap 'rm -rf "$stage"' EXIT
${stageBinary(input.source)}
chmod 755 "$stage/porkcode"
${verifyScript('"$stage/porkcode"', version)}
mv "$stage/porkcode" "$destination"
`
}

function stageBinary(source: Exclude<Source, { type: "installer" }>) {
  if (source.type === "archive") return 'cat > "$stage/archive.tgz"\ntar -xzf "$stage/archive.tgz" -C "$stage"'

  return `url=${quote(source.url)}
if command -v curl >/dev/null 2>&1; then
  curl -fsSL --connect-timeout 15 --max-time 180 "$url" -o "$stage/archive.tgz"
else
  wget -T 180 -O "$stage/archive.tgz" "$url"
fi
tar -xzf "$stage/archive.tgz" -C "$stage"`
}

function verifyScript(command: string, version: string) {
  return `test "$(${command} --version | awk '{print $NF}' | sed 's/^v//')" = ${quote(version)}`
}
