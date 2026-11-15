import { readFileSync } from "node:fs"
import path from "node:path"
import { app } from "electron"
import type { Endpoint } from "@opencode/client/service"
import { CHANNEL, SERVICE_FILE } from "../constants"

// The main thread idles between showing the first window and evaluating the main bundle, waiting
// for the renderer's asset requests. That slot is long enough to find out whether a compatible
// background service is already running, so the renderer's first data request is not the first
// moment anyone asks. The probe only looks; a service that has to be started waits for the layers,
// which set the environment the CLI expects.
let probe: Promise<Endpoint | undefined> | undefined

export function startSidecarProbe() {
  if (!app.isPackaged) return
  const version = CHANNEL === "beta" ? undefined : bundledVersion()

  if (version === "") return
  probe = import("@opencode/client/service").then(({ Service }) =>
    Service.discover({ version, file: registrationFile() }),
  ).catch(() => undefined)
}

// The fork channel's registration, at the same location BackgroundService.prepare reads; see SERVICE_FILE in constants.ts.
function registrationFile() {
  const state = process.env.XDG_STATE_HOME ?? path.join(app.getPath("home"), ".local", "state")

  return path.join(state, "porkcode", SERVICE_FILE)
}

/** The probe's result, once: a later connect must not adopt a service that may have exited since boot. */
export function takeSidecarProbe() {
  const result = probe ?? Promise.resolve(undefined)
  probe = undefined

  return result
}

function bundledVersion() {
  try {
    return readFileSync(path.join(process.resourcesPath, "porkcode-cli.version"), "utf8").trim()
  } catch {
    return ""
  }
}
