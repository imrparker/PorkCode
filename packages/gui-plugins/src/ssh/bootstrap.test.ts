import { expect, test } from "bun:test"
import { binaryPath, parseRegistration } from "./bootstrap"
import { RemoteCli } from "./remote-cli"

test("ignores stopped services and registrations that do not match the healthy endpoint", () => {
  const registration = { url: "http://127.0.0.1:1234", password: "secret", version: "2.0.0", pid: 42 }
  const frame = `PORKCODE_SSH_REGISTRATION_BEGIN\n${JSON.stringify(registration)}\nPORKCODE_SSH_REGISTRATION_END\n`
  expect(parseRegistration(`PORKCODE_SSH_STATUS=stopped\n${frame}`)).toBeUndefined()
  expect(parseRegistration(`PORKCODE_SSH_STATUS=http://127.0.0.1:9999\n${frame}`)).toBeUndefined()
  expect(
    parseRegistration(
      `PORKCODE_SSH_STATUS=${registration.url}\nPORKCODE_SSH_REGISTRATION_BEGIN\ninvalid\nPORKCODE_SSH_REGISTRATION_END\n`,
    ),
  ).toBeUndefined()
})

test("rejects unsafe versions and platforms in remote installation paths", () => {
  expect(() => binaryPath('2.0.0"; whoami')).toThrow()
  expect(() => RemoteCli.installScript({ version: '2.0.0"; whoami', source: { type: "archive" } })).toThrow()
  expect(() => RemoteCli.archiveUrl("linux-x64;whoami", "2.0.0")).toThrow()
})

test("builds archive URLs from the configured distribution base only", () => {
  const previous = process.env.PORKCODE_REMOTE_CLI_BASE

  try {
    delete process.env.PORKCODE_REMOTE_CLI_BASE
    expect(() => RemoteCli.archiveUrl("linux-x64-baseline-musl", "2.0.0-beta.1")).toThrow(
      /PORKCODE_REMOTE_CLI_BASE/,
    )

    process.env.PORKCODE_REMOTE_CLI_BASE = "https://files.example.com/porkcode/"
    expect(RemoteCli.archiveUrl("linux-x64-baseline-musl", "2.0.0-beta.1")).toBe(
      "https://files.example.com/porkcode/porkcode-linux-x64-baseline-musl.tar.gz",
    )
  } finally {
    if (previous === undefined) delete process.env.PORKCODE_REMOTE_CLI_BASE
    else process.env.PORKCODE_REMOTE_CLI_BASE = previous
  }
})
