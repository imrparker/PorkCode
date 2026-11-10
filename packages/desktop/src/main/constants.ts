import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "PorkCode Dev",
  beta: "PorkCode Beta",
  prod: "PorkCode",
}

const appIDs: Record<string, string> = {
  dev: "com.imrparker.porkcode.dev",
  beta: "com.imrparker.porkcode.beta",
  prod: "com.imrparker.porkcode",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "PorkCode Dev"

// userData, and with it the single-instance lock, logs, drafts, and CLI stages, is named after this id;
// keeping upstream's ai.opencode.desktop made PorkCode a second instance of OpenCode on the same data.
export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "com.imrparker.porkcode.dev"
