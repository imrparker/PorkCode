#!/usr/bin/env bun
import { $ } from "bun"
import { exists } from "node:fs/promises"
import path from "node:path"
import {
  copyBuiltCliToResources,
  downloadCliToResources,
  FORK_CLI_CHANNEL,
  getCurrentCli,
  resolveChannel,
  verifyBundledCliChannel,
} from "./utils"
import { verifyBundles } from "./verify-bundles"

// Prepares resources/ (icons, metainfo, the bundled CLI) for PORKCODE_CHANNEL and builds the app into out/.
// The CLI comes from ../cli/dist when it holds the target; a published upstream CLI is only bundled behind an
// explicit override, because its baked channel registers where a packaged PorkCode never looks.
const dir = path.resolve(import.meta.dir, "..")

const cli = path.resolve(dir, "../cli/dist")

const channel = resolveChannel()

process.chdir(dir)

await $`bun ./script/copy-icons.ts ${channel}`

await $`bun ./script/copy-metainfo.ts ${channel}`

const built = await exists(path.join(cli, getCurrentCli().package.replace("@opencode/", "")))

// A published upstream CLI registers in upstream's service.json on upstream's port, so the app would spawn it,
// watch it exit against an installed OpenCode service, and time out waiting for its own registration file.
if (!built && process.env.PORKCODE_DESKTOP_ALLOW_UPSTREAM_CLI !== "1")
  throw new Error(
    `Desktop builds bundle the CLI from ${cli}; build it first with PORKCODE_CHANNEL=${FORK_CLI_CHANNEL} ` +
      "(README: Building the Windows installer). Set PORKCODE_DESKTOP_ALLOW_UPSTREAM_CLI=1 to bundle a " +
      "published upstream CLI anyway.",
  )

if (built) await copyBuiltCliToResources(cli)

if (!built) {
  console.warn(`Bundling a published upstream ${channel} CLI; it registers where PorkCode will not look`)
  await downloadCliToResources(channel === "beta" ? "beta" : undefined)
}

// The channel is compiled into the executable, so verify the copy that actually landed in resources/.
// Cross-arch packaging cannot run the target binary (Windows x64 refuses ARM64 executables), so the
// spawn check runs only when the bundled CLI matches this host; cross builds rely on building the
// CLI with PORKCODE_CHANNEL=porkcode themselves.
if (built && getCurrentCli().cpu === process.arch) await verifyBundledCliChannel()
if (built && getCurrentCli().cpu !== process.arch)
  console.warn(`Skipping bundled-CLI channel verification for ${getCurrentCli().target}; this host cannot run it`)

await $`bunx electron-vite build`

await verifyBundles(path.join(dir, "out"))
