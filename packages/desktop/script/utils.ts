import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Option, Schema } from "effect"

const CLI_VERSION = "dev"

const Manifest = Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString }))

export type Channel = "dev" | "beta" | "prod"

export function resolveChannel(): Channel {
  const raw = process.env.PORKCODE_CHANNEL

  if (raw === "dev" || raw === "beta" || raw === "prod") return raw

  if (raw === "latest") return "prod"

  return "dev"
}

export const CLI_BINARIES: Array<{ target: string; package: string; os: string; cpu: string }> = [
  {
    target: "darwin-arm64",
    package: "@opencode/cli-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
  },
  {
    target: "darwin-x64",
    package: "@opencode/cli-darwin-x64-baseline",
    os: "darwin",
    cpu: "x64",
  },
  {
    target: "windows-arm64",
    package: "@opencode/cli-windows-arm64",
    os: "win32",
    cpu: "arm64",
  },
  {
    target: "windows-x64",
    package: "@opencode/cli-windows-x64-baseline",
    os: "win32",
    cpu: "x64",
  },
  {
    target: "linux-x64",
    package: "@opencode/cli-linux-x64-baseline",
    os: "linux",
    cpu: "x64",
  },
  {
    target: "linux-arm64",
    package: "@opencode/cli-linux-arm64",
    os: "linux",
    cpu: "arm64",
  },
]

function nativeTarget() {
  const { platform, arch } = process

  if (platform === "darwin") return arch === "arm64" ? "darwin-arm64" : "darwin-x64"

  if (platform === "win32") return arch === "arm64" ? "windows-arm64" : "windows-x64"

  if (platform === "linux") return arch === "arm64" ? "linux-arm64" : "linux-x64"
  throw new Error(`Unsupported platform: ${platform}/${arch}`)
}

export function getCurrentCli(target = process.env.PORKCODE_TARGET ?? nativeTarget()) {
  const binaryConfig = CLI_BINARIES.find((item) => item.target === target)

  if (!binaryConfig) throw new Error(`CLI configuration not available for target '${target}'`)

  return binaryConfig
}

export function nodePtyPackage(target?: string) {
  const cli = getCurrentCli(target)

  return `@lydell/node-pty-${cli.os}-${cli.cpu}`
}

export async function downloadCliToResources(version = CLI_VERSION, dest = windowsify("resources/opencode-cli")) {
  const { $ } = await import("bun")
  const cli = getCurrentCli()
  const directory = await mkdtemp(join(tmpdir(), "opencode-cli-"))

  try {
    await $`bun install --no-save --cwd ${directory} ${`${cli.package}@${version}`} ${`--os=${cli.os}`} ${`--cpu=${cli.cpu}`}`
    await copyCliToResources(join(directory, "node_modules", cli.package), dest)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  console.log(`Copied ${cli.package}@${version} to ${dest}`)
}

export async function copyBuiltCliToResources(root: string, dest = windowsify("resources/opencode-cli")) {
  const cli = getCurrentCli()
  const directory = cli.package.replace("@opencode/", "")
  await copyCliToResources(join(root, directory), dest)
}

// The package directory is an npm package: its package.json version is the string the executable
// prints for --version. Writing it next to the executable spares the desktop a ~400 ms spawn of the
// 200 MB binary on first launch.
async function copyCliToResources(pkg: string, dest: string) {
  const cli = getCurrentCli()
  await copyFile(join(pkg, "bin", cli.os === "win32" ? "opencode.exe" : "opencode"), dest)
  await prepareCli(dest)

  const manifest = Option.getOrUndefined(
    Schema.decodeUnknownOption(Manifest)(await Bun.file(join(pkg, "package.json")).text()),
  )

  if (!manifest) throw new Error(`Bundled CLI package has no version: ${pkg}`)
  await Bun.write(versionFile(dest), manifest.version)
}

export function versionFile(cli: string) {
  return join(dirname(cli), "opencode-cli.version")
}

async function prepareCli(dest: string) {
  const { $ } = await import("bun")

  if (process.platform !== "win32") await chmod(dest, 0o755)

  if (process.platform === "darwin") await $`codesign --force --sign - ${dest}`
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path

  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}

// The channel the fork's bundled CLI must be built with. A CLI from any other channel registers in upstream's
// service.json on upstream's port, so a packaged PorkCode spawns it, watches it exit against an installed OpenCode
// service, and times out waiting for its own registration file (SERVICE_FILE in src/main/constants.ts). Keep in
// sync with the PORKCODE_CHANNEL define in packages/cli.
export const FORK_CLI_CHANNEL = "porkcode"

function forkCliDatabaseName(channel = FORK_CLI_CHANNEL) {
  return `opencode-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`
}

// A reported database belongs to the fork CLI only when it is that channel's own file. Upstream builds answer
// `opencode.db`; another channel or an PORKCODE_DB override answers something else. Separators are normalized
// because the executable prints its platform's paths and build hosts run Windows, Linux and macOS alike.
export function isForkCliDatabase(reported: string, channel = FORK_CLI_CHANNEL) {
  const normalized = reported.trim().replaceAll("\\", "/")

  return (normalized.split("/").at(-1) ?? "") === forkCliDatabaseName(channel)
}

// The channel is baked into the executable and reaches no artifact a build could read, so ask the bundled binary
// where it would keep its database. `debug paths db` prints one path without touching a running service; the two
// overrides that also move the database are removed so the answer reflects the compiled-in channel alone.
export async function verifyBundledCliChannel(dest = windowsify("resources/opencode-cli")) {
  const result = Bun.spawnSync({
    cmd: [dest, "debug", "paths", "db"],
    env: { ...process.env, PORKCODE_DB: undefined, PORKCODE_DISABLE_CHANNEL_DB: undefined },
    stderr: "pipe",
  })

  if (result.exitCode !== 0)
    throw new Error(`Bundled CLI at ${dest} failed to report its paths: ${result.stderr.toString().trim()}`)

  const database = result.stdout.toString().trim()

  if (!isForkCliDatabase(database))
    throw new Error(
      `Bundled CLI at ${dest} is not a PorkCode build: it uses database ${database || "(none reported)"}, expected ` +
        `${forkCliDatabaseName()}. Build the CLI with PORKCODE_CHANNEL=${FORK_CLI_CHANNEL} first ` +
        "(README: Building the Windows installer).",
    )

  console.log(`Bundled CLI channel verified: ${database}`)
}
