// The part of the SSH plugin's remote CLI scripts that WSL uses. Plugins share only contracts, so
// keep the two copies in step.

export function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function requireVersion(version: string) {
  if (version !== "local" && !/^[0-9][a-zA-Z0-9.+-]*$/.test(version)) throw new Error(version)

  return version
}

export function discoverScript() {
  return `cli=""
if [ -z "$cli" ] && [ -x "$HOME/.porkcode/bin/porkcode" ]; then cli="$HOME/.porkcode/bin/porkcode"; fi
if [ -n "$cli" ]; then printf '%s\\n' "$cli"; fi
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

/**
 * The managed CLI installer also configures the user's shell PATH. Without a local binary, PorkCode
 * comes from standalone archives (`porkcode-<target>.tar.gz`) served from PORKCODE_REMOTE_CLI_BASE;
 * there is no release server to fall back on.
 */
export function installScript(input: { version: string; binary?: string }) {
  const version = requireVersion(input.version)

  if (input.binary)
    return `set -eu
curl -fsSL https://raw.githubusercontent.com/imrparker/PorkCode/develop/install | bash -s -- --binary ${input.binary}
test "$("$HOME/.porkcode/bin/porkcode" --version | awk '{print $NF}' | sed 's/^v//')" = ${quote(version)}
`

  const base = process.env.PORKCODE_REMOTE_CLI_BASE?.trim()

  if (!base)
    throw new Error(
      "No PorkCode CLI distribution is configured. Set PORKCODE_REMOTE_CLI_BASE to a URL serving porkcode-<target>.tar.gz archives, or stage the binary in the distro.",
    )

  return `set -eu
arch=$(uname -m)
case "$arch" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) echo "unsupported architecture: $arch" >&2; exit 2 ;; esac
target="linux-$arch-baseline"
if [ -f /etc/alpine-release ] || (ldd --version 2>&1 | grep -qi musl); then target="$target-musl"; fi
destination="$HOME/.porkcode/bin/porkcode"
mkdir -p "$(dirname "$destination")"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
curl -fsSL --connect-timeout 15 --max-time 300 ${quote(base.endsWith("/") ? base.slice(0, -1) : base)}/porkcode-"$target".tar.gz -o "$stage/archive.tgz"
tar -xzf "$stage/archive.tgz" -C "$stage"
chmod 755 "$stage/porkcode"
test "$("$stage/porkcode" --version | awk '{print $NF}' | sed 's/^v//')" = ${quote(version)}
mv "$stage/porkcode" "$destination"
`
}
