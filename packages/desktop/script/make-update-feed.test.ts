import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const script = path.join(import.meta.dir, "make-update-feed.ts")

function spawn(args: string[]) {
  return Bun.spawnSync({
    cmd: [process.execPath, script, ...args],
    env: { ...process.env, SOURCE_DATE_EPOCH: "1794819600" },
  })
}

// The digests below are the sha512 base64 of these exact fixture contents; electron-updater verifies them byte for byte.
test("writes a feed listing every artifact and defaulting to the first", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "porkcode-feed-"))
  const x64 = path.join(dir, "porkcode-desktop-win-x64.exe")
  const arm64 = path.join(dir, "porkcode-desktop-win-arm64.exe")
  await writeFile(x64, "x64-installer-bytes")
  await writeFile(`${x64}.blockmap`, "blockmap-bytes")
  await writeFile(arm64, "arm64-installer-bytes")

  const result = spawn(["2026.1116.57", path.join(dir, "latest.yml"), x64, arm64])

  expect(result.exitCode).toBe(0)
  expect(await Bun.file(path.join(dir, "latest.yml")).text()).toBe(
    [
      "version: 2026.1116.57",
      "files:",
      "  - url: porkcode-desktop-win-x64.exe",
      "    sha512: 'FNdQM4p32+dwh/zlaQFDEAgGYP3zPr2t0+IkHk72v+QoLUdHNs/GHJwOF1qPYAPU+xl+TpdOA7VnNCnbZvMXjA=='",
      "    size: 19",
      "    blockMapSize: 14",
      "  - url: porkcode-desktop-win-arm64.exe",
      "    sha512: 'xiHdhA02gBH3YchBtTtLILGdh6ds16Gwxz7f54z7ccCocM2Bd0C7uWsfJf4GqwBJLsVdIu2oEAjVbqgCrs/3mA=='",
      "    size: 21",
      "path: porkcode-desktop-win-x64.exe",
      "sha512: 'FNdQM4p32+dwh/zlaQFDEAgGYP3zPr2t0+IkHk72v+QoLUdHNs/GHJwOF1qPYAPU+xl+TpdOA7VnNCnbZvMXjA=='",
      "releaseDate: '2026-11-16T09:00:00.000Z'",
      "",
    ].join("\n"),
  )
})

test("refuses a missing artifact so the feed never points at nothing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "porkcode-feed-"))
  const result = spawn(["2026.1116.57", path.join(dir, "latest.yml"), path.join(dir, "missing.exe")])

  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain("does not exist")
})

test("refuses a malformed version and missing arguments", () => {
  const badVersion = spawn(["v2026", "latest.yml", import.meta.file])
  expect(badVersion.exitCode).not.toBe(0)
  expect(badVersion.stderr.toString()).toContain("Not a valid update version")

  const noArgs = spawn([])
  expect(noArgs.exitCode).toBe(1)
  expect(noArgs.stderr.toString()).toContain("usage:")
})
