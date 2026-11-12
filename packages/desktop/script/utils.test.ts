import { expect, test } from "bun:test"
import { isForkCliDatabase } from "./utils"

// A packaged PorkCode waits for the registration its own channel writes. Bundling a CLI compiled with another
// channel makes it spawn a daemon that registers in upstream's service.json on upstream's port instead, so the app
// times out after 120 s ("Timed out waiting for the background service to start"). The build asks the bundled
// executable which database it uses; this is what an answer has to look like to pass.
test.each([
  { reported: "C:\\Users\\pk\\.local\\share\\opencode\\opencode-porkcode.db", expected: true },
  { reported: "/home/pk/.local/share/opencode/opencode-porkcode.db", expected: true },
  // The build that shipped the bug: an upstream CLI shares opencode.db with an installed OpenCode.
  { reported: "C:\\Users\\pk\\.local\\share\\opencode\\opencode.db", expected: false },
  { reported: "/home/pk/.local/share/opencode/opencode.db", expected: false },
  // Other channels keep their own file, and none of them is the fork's.
  { reported: "/home/pk/.local/share/opencode/opencode-dev.db", expected: false },
  { reported: "/home/pk/.local/share/opencode/opencode-local.db", expected: false },
  // An OPENCODE_DB override would answer a path that says nothing about the compiled-in channel, so the guard
  // unsets both overrides before asking; any directory is accepted as long as the file is the channel's own.
  { reported: "C:\\custom\\opencode-porkcode.db", expected: true },
  { reported: ":memory:", expected: false },
  { reported: "", expected: false },
  { reported: "/home/pk/.local/share/opencode/opencode-porkcode.db\n", expected: true },
])("accepts only the fork channel's own database from $reported", ({ reported, expected }) => {
  expect(isForkCliDatabase(reported)).toBe(expected)
})

test("derives the expected database from a sanitized channel", () => {
  expect(isForkCliDatabase("/var/lib/opencode/opencode-porkcode.db")).toBe(true)
  expect(isForkCliDatabase("/var/lib/opencode/opencode-my-channel.db", "my/channel")).toBe(true)
})
