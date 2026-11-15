import path from "node:path"
import { PORKCODE_CHANNEL } from "./version"

export function databasePath(data: string) {
  const filename =
    process.env.PORKCODE_DB ??
    (["latest", "dev", "beta", "next", "prod"].includes(PORKCODE_CHANNEL) ||
    process.env.PORKCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.PORKCODE_DISABLE_CHANNEL_DB === "true"
      ? "opencode.db"
      : `opencode-${PORKCODE_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
