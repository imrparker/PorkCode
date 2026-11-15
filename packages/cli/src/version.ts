import { Option, Schema } from "effect"

declare const PORKCODE_VERSION: string
declare const PORKCODE_CHANNEL: string
declare const PORKCODE_ARTIFACT: string
declare const PORKCODE_RELEASE_HIGHLIGHTS: string

const version = typeof PORKCODE_VERSION === "string" ? PORKCODE_VERSION : "local"
const channel = typeof PORKCODE_CHANNEL === "string" ? PORKCODE_CHANNEL : "local"
const artifact = typeof PORKCODE_ARTIFACT === "string" ? PORKCODE_ARTIFACT : "cli"
// Stable release builds embed the release notes' Highlights; every other build has none.
const highlights =
  typeof PORKCODE_RELEASE_HIGHLIGHTS === "string"
    ? Option.getOrElse(
        Schema.decodeUnknownOption(
          Schema.fromJsonString(Schema.Array(Schema.Struct({ title: Schema.String, body: Schema.String }))),
        )(PORKCODE_RELEASE_HIGHLIGHTS),
        () => [],
      )
    : []

export {
  version as PORKCODE_VERSION,
  channel as PORKCODE_CHANNEL,
  artifact as PORKCODE_ARTIFACT,
  highlights as PORKCODE_HIGHLIGHTS,
}
export const PORKCODE_LOCAL = channel === "local"
