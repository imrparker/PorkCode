import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { APP_ID } from "./constants"

/**
 * The two-phase factory reset handoff. Phase A (Settings > Reset) stops the background service through the bundled
 * CLI's `reset --force`, records this marker in the OS temp directory, and relaunches. Phase B runs synchronously in
 * configureApplication before Chromium opens its profile: it deletes everything still on disk — Electron userData,
 * updater caches, macOS preference leftovers, and any XDG stragglers a late file-handle release left behind — so the
 * launch that follows sees none of it, exactly like a first install. The marker lives in temp rather than userData
 * because userData is one of the things being deleted.
 */
export interface Scope {
  readonly includeCliBinary: boolean
}

const MARKER = "porkcode-factory-reset.json"
const DONE = "porkcode-factory-reset.done.json"

function markerPath() {
  return path.join(os.tmpdir(), MARKER)
}

export function writeResetMarker(scope: Scope) {
  writeFileSync(markerPath(), JSON.stringify({ at: Date.now(), ...scope } satisfies Scope & { at: number }))
}

/** When a reset handoff is pending, delete everything it covers and retire the marker. Returns whether one ran. */
export function applyResetMarker(userData: string) {
  if (!existsSync(markerPath())) return false
  const scope = readScope()
  for (const target of resetPaths(userData, scope)) remove(target)
  // Retiring the marker keeps a crash mid-sweep from re-running it; the OS temp directory collects the record.
  renameSync(markerPath(), path.join(os.tmpdir(), DONE))
  return true
}

function readScope(): Scope {
  try {
    const parsed = JSON.parse(readFileSync(markerPath(), "utf8")) as Partial<Scope>
    return { includeCliBinary: parsed.includeCliBinary === true }
  } catch {
    return { includeCliBinary: false }
  }
}

function resetPaths(userData: string, scope: Scope) {
  const home = os.homedir()
  const xdg = (env: string, fallback: readonly string[]) =>
    path.join(process.env[env] || path.join(home, ...fallback), "porkcode")
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local")
  // The updater cache directory name is the sanitized package name; see script/pack.ts.
  const updater =
    process.platform === "win32"
      ? path.join(localAppData, "@opencodedesktop-updater")
      : path.join(home, "Library", "Caches", "@opencodedesktop-updater")
  const managed = path.join(home, ".porkcode")
  return [
    userData,
    updater,
    // macOS keeps app state outside userData; cfprefsd may rewrite the plist until it next reloads.
    ...(process.platform === "darwin"
      ? [
          path.join(home, "Library", "Preferences", `${APP_ID}.plist`),
          path.join(home, "Library", "Saved Application State", `${APP_ID}.savedState`),
          path.join(home, "Library", "HTTPStorages", APP_ID),
          path.join(home, "Library", "Caches", APP_ID),
        ]
      : []),
    xdg("XDG_DATA_HOME", [".local", "share"]),
    xdg("XDG_CACHE_HOME", [".cache"]),
    xdg("XDG_STATE_HOME", [".local", "state"]),
    // Global honors PORKCODE_CONFIG_DIR over the XDG config root; delete whichever one is in effect.
    process.env.PORKCODE_CONFIG_DIR || xdg("XDG_CONFIG_HOME", [".config"]),
    path.join(os.tmpdir(), "porkcode"),
    path.join(managed, "plan"),
    ...(scope.includeCliBinary ? [path.join(managed, "bin")] : []),
  ]
}

// The previous instance has exited and the background service was stopped before the relaunch, so handles are
// normally free here; a straggler that still refuses to go is skipped rather than blocking first launch.
function remove(target: string) {
  try {
    rmSync(target, { recursive: true, force: true })
  } catch {}
}
