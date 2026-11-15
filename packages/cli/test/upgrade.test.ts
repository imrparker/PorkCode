import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"

describe("upgrade command", () => {
  test("is registered in root help and documents its options", async () => {
    const root = await cli(["--help"], {}, "../src/index.ts")
    const help = await cli(["upgrade", "--help"], {}, "../src/index.ts")
    expect(root.exitCode).toBe(0)
    expect(root.stdout).toContain("upgrade")
    expect(help.exitCode).toBe(0)
    expect(help.stdout).toContain("[<target>]")
    expect(help.stdout).toContain("--method")
    expect(help.stdout).toContain("-m")
  })

  test("reports the rebuild guidance without touching the updater", async () => {
    const result = await cli([])
    expect(result.exitCode).toBe(0)
    expect(result.events).toEqual([])
    expect(result.stdout).toContain("PorkCode does not publish update feeds")
    expect(result.stdout).toContain("pulling the repository and rebuilding")
  })

  test("short-circuits explicit targets and methods", async () => {
    const result = await cli(["2.0.0", "--method", "npm"])
    expect(result.exitCode).toBe(0)
    expect(result.events).toEqual([])
    expect(result.stdout).toContain("PorkCode does not publish update feeds")
  })

  test.each(["apt", "brew", "winget"])("rejects %s as an installation method before running anything", async (method) => {
    const result = await cli(["--method", method])
    expect(result.exitCode).not.toBe(0)
    expect(result.events).toEqual([])
  })
})

async function cli(args: string[], env: Record<string, string> = {}, entry = "fixture/upgrade.ts") {
  const root = await mkdtemp(path.join(os.tmpdir(), "porkcode-upgrade-"))
  try {
    const child = Bun.spawn([process.execPath, path.join(import.meta.dir, entry), ...args], {
      cwd: path.join(import.meta.dir, ".."),
      env: isolatedEnv(root, env),
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    const events = stdout
      .split("\n")
      .filter((line) => line.startsWith("EVENT "))
      .map((line) => JSON.parse(line.slice(6)))
    expect(await Bun.file(path.join(root, "state", "porkcode", "service-local.json")).exists()).toBe(false)
    return { stdout, stderr, exitCode, events }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
