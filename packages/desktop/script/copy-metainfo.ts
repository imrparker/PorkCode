import { resolveChannel } from "./utils"

const arg = process.argv[2]

const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

// Keep in sync with APP_IDS in electron-builder.config.ts; importing that module would run the
// whole packaging config (and require the target CLI) just to name a file.
const appId = channel === "prod" ? "com.imrparker.porkcode" : `com.imrparker.porkcode.${channel}`

const productName = channel === "prod" ? "PorkCode" : `PorkCode ${channel.charAt(0).toUpperCase() + channel.slice(1)}`

const summary = `Open source AI coding agent for custom providers${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="com.imrparker">
    <name>imrparker</name>
  </developer>

  <description>
    <p>
      PorkCode is an open source coding agent that runs only against providers you configure
      yourself, such as OpenAI-compatible or Anthropic-compatible endpoints and local backends.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/imrparker/PorkCode/issues</url>
  <url type="homepage">https://github.com/imrparker/PorkCode</url>
  <url type="vcs-browser">https://github.com/imrparker/PorkCode</url>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)

console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
