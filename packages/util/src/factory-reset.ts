export * as FactoryReset from "./factory-reset.js"

import { Effect, FileSystem, Schedule } from "effect"
import path from "node:path"
import { Global } from "./global.js"

/**
 * Everything a factory reset removes lives under the Global paths plus `~/.porkcode`. The XDG roots are shared by
 * every channel, so wiping them clears all channels' databases, service registrations and caches at once; the next
 * launch recreates each directory (Global's acquire) and bootstraps an empty database from the schema.
 */
export interface Options {
  /** Also remove the curl-installed CLI binary under `~/.porkcode/bin` and its PATH lines in shell configs. */
  readonly includeCliBinary: boolean
}

export interface Report {
  readonly removed: ReadonlyArray<string>
  readonly failed: ReadonlyArray<{ path: string; message: string }>
}

/** The paths a reset would remove, in deletion order, for display and dry runs. */
export function targets(global: Global.Interface, options: Options) {
  const managed = path.join(global.home, ".porkcode")
  return [
    global.data,
    global.cache,
    global.state,
    global.tmp,
    global.config,
    path.join(managed, "plan"),
    ...(options.includeCliBinary ? [path.join(managed, "bin")] : []),
  ]
}

export const wipe = Effect.fn("FactoryReset.wipe")(function* (options: Options) {
  const global = yield* Global.Service
  const fs = yield* FileSystem.FileSystem
  const removed: string[] = []
  const failed: { path: string; message: string }[] = []
  for (const target of targets(global, options)) {
    if (!(yield* exists(fs, target))) continue
    yield* removeRetryingBusy(fs, target).pipe(
      Effect.tap(() => Effect.sync(() => removed.push(target))),
      Effect.catch((error) => Effect.sync(() => failed.push({ path: target, message: errorMessage(error) }))),
    )
  }
  if (options.includeCliBinary) yield* cleanShellConfigs(global.home)
  return { removed, failed } satisfies Report
})

function exists(fs: FileSystem.FileSystem, target: string) {
  return fs.exists(target).pipe(Effect.orElseSucceed(() => false))
}

// Windows reports a terminated service as gone before it releases its file handles, so the first removal can race
// that teardown; the same bounded retry `porkcode uninstall` uses covers the stopped background service.
function removeRetryingBusy(fs: FileSystem.FileSystem, target: string) {
  return fs.remove(target, { recursive: true, force: true }).pipe(
    Effect.retry({
      while: (error) => process.platform === "win32" && error.reason._tag === "Busy",
      schedule: Schedule.max([Schedule.spaced("250 millis"), Schedule.recurs(40)]),
    }),
  )
}

// Mirrors the installer's marker-guarded PATH lines; shared by every shell rc the curl installer may have edited.
function cleanShellConfigs(home: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
    const zsh = process.env.ZDOTDIR || home
    const candidates: Record<string, string[]> = {
      fish: [path.join(home, ".config/fish/config.fish"), path.join(xdg, "fish/config.fish")],
      zsh: [
        path.join(zsh, ".zshrc"),
        path.join(zsh, ".zshenv"),
        path.join(xdg, "zsh/.zshrc"),
        path.join(xdg, "zsh/.zshenv"),
      ],
      bash: [
        path.join(home, ".bashrc"),
        path.join(home, ".bash_profile"),
        path.join(home, ".profile"),
        path.join(xdg, "bash/.bashrc"),
        path.join(xdg, "bash/.bash_profile"),
      ],
      ash: [path.join(home, ".ashrc"), path.join(home, ".profile")],
      sh: [path.join(home, ".ashrc"), path.join(home, ".profile")],
    }
    const files = [...new Set(candidates[path.basename(process.env.SHELL || "bash")] ?? candidates.bash)]
    yield* Effect.forEach(files, (file) =>
      fs.readFileString(file).pipe(
        Effect.flatMap((content) => {
          const lines = content.split("\n")
          const cleaned = lines
            .filter(
              (line, index) => !isPathLine(line) && !(isInstallerComment(line) && isPathLine(lines[index + 1] ?? "")),
            )
            .join("\n")
          if (cleaned === content) return Effect.void
          return fs.writeFileString(file, cleaned)
        }),
        Effect.ignore,
      ),
    )
  })
}

function isPathLine(line: string) {
  return /^(?:export PATH=|fish_add_path\s)/.test(line.trim()) && line.includes(".porkcode/bin")
}

function isInstallerComment(line: string) {
  return line.trim() === "# added by PorkCode installer"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
