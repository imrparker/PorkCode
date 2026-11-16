import { describe, expect, test } from "bun:test"
import { NodeFileSystem } from "@effect/platform-node"
import { Effect, FileSystem, Layer } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { FactoryReset } from "../src/factory-reset.js"
import { Global } from "../src/global.js"

// A fresh temp root per run keeps the wipe away from any real profile; Global.layerWith mkdirs every path it is given.
function fixture() {
  const root = path.join(os.tmpdir(), `factory-reset-${crypto.randomUUID()}`)
  const home = path.join(root, "home")
  return {
    root,
    home,
    global: {
      home,
      data: path.join(root, "data", "porkcode"),
      cache: path.join(root, "cache", "porkcode"),
      config: path.join(root, "config", "porkcode"),
      state: path.join(root, "state", "porkcode"),
      tmp: path.join(root, "tmp", "porkcode"),
      bin: path.join(root, "cache", "porkcode", "bin"),
      log: path.join(root, "data", "porkcode", "log"),
      repos: path.join(root, "data", "porkcode", "repos"),
    } satisfies Global.Interface,
  }
}

function run<T>(global: Global.Interface, effect: Effect.Effect<T, never, Global.Service | FileSystem.FileSystem>) {
  return Effect.runPromise(effect.pipe(Effect.provide(Layer.merge(Global.layerWith(global), NodeFileSystem.layer))))
}

describe("FactoryReset.targets", () => {
  test("covers every global root plus the plan scratch dir, and only adds bin when opted in", () => {
    const scope = fixture()
    expect(FactoryReset.targets(scope.global, { includeCliBinary: false })).toEqual([
      scope.global.data,
      scope.global.cache,
      scope.global.state,
      scope.global.tmp,
      scope.global.config,
      path.join(scope.home, ".porkcode", "plan"),
    ])
    expect(FactoryReset.targets(scope.global, { includeCliBinary: true })).toContain(
      path.join(scope.home, ".porkcode", "bin"),
    )
  })
})

describe("FactoryReset.wipe", () => {
  test("removes every target and leaves files outside them alone", async () => {
    const scope = fixture()
    await run(
      scope.global,
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await fs.mkdir(path.join(scope.global.data, "shell"), { recursive: true })
          await fs.writeFile(path.join(scope.global.data, "porkcode.db"), "db")
          await fs.mkdir(scope.global.cache, { recursive: true })
          await fs.writeFile(path.join(scope.global.cache, "ripgrep.exe"), "rg")
          await fs.mkdir(scope.global.config, { recursive: true })
          await fs.writeFile(path.join(scope.global.config, "porkcode.json"), "{}")
          await fs.mkdir(path.join(scope.home, ".porkcode", "plan"), { recursive: true })
          await fs.mkdir(path.join(scope.home, ".porkcode", "bin"), { recursive: true })
          await fs.writeFile(path.join(scope.home, ".porkcode", "bin", "porkcode"), "binary")
          await fs.mkdir(path.join(scope.home, "projects"), { recursive: true })
          await fs.writeFile(path.join(scope.home, "notes.md"), "keep me")
        })
        const report = yield* FactoryReset.wipe({ includeCliBinary: false })
        expect(report.failed).toEqual([])
        expect(report.removed).toEqual([
          scope.global.data,
          scope.global.cache,
          scope.global.state,
          scope.global.tmp,
          scope.global.config,
          path.join(scope.home, ".porkcode", "plan"),
        ])
      }),
    )
    await expect(fs.stat(path.join(scope.global.data))).rejects.toThrow()
    await expect(fs.stat(path.join(scope.global.cache))).rejects.toThrow()
    await expect(fs.stat(path.join(scope.global.config))).rejects.toThrow()
    // The CLI binary and the user's own files survive a reset that did not opt into removing them.
    await expect(fs.stat(path.join(scope.home, ".porkcode", "bin", "porkcode"))).resolves.toBeTruthy()
    await expect(fs.readFile(path.join(scope.home, "notes.md"), "utf8")).resolves.toBe("keep me")
    await fs.rm(scope.root, { recursive: true, force: true })
  })

  test("removes the CLI binary and strips installer PATH lines from the shell config", async () => {
    const scope = fixture()
    const previousShell = process.env.SHELL
    process.env.SHELL = "/bin/bash"
    try {
      await run(
        scope.global,
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(scope.home, ".porkcode", "bin"), { recursive: true })
            await fs.writeFile(
              path.join(scope.home, ".bashrc"),
              'export PATH="$HOME/bin:$PATH"\n# added by PorkCode installer\nexport PATH="$HOME/.porkcode/bin:$PATH"\necho hi\n',
            )
          })
          const report = yield* FactoryReset.wipe({ includeCliBinary: true })
          expect(report.failed).toEqual([])
        }),
      )
      await expect(fs.stat(path.join(scope.home, ".porkcode", "bin"))).rejects.toThrow()
      const rc = await fs.readFile(path.join(scope.home, ".bashrc"), "utf8")
      expect(rc).not.toContain(".porkcode/bin")
      expect(rc).toContain('export PATH="$HOME/bin:$PATH"')
      expect(rc).toContain("echo hi")
    } finally {
      if (previousShell === undefined) delete process.env.SHELL
      else process.env.SHELL = previousShell
      await fs.rm(scope.root, { recursive: true, force: true })
    }
  })

  test("missing targets are skipped without failing the report", async () => {
    const scope = fixture()
    // Global's acquire creates its own directories, so only those exist here; ~/.porkcode/plan never does.
    const report = await run(scope.global, FactoryReset.wipe({ includeCliBinary: false }))
    expect(report.removed).toEqual([
      scope.global.data,
      scope.global.cache,
      scope.global.state,
      scope.global.tmp,
      scope.global.config,
    ])
    expect(report.failed).toEqual([])
    await fs.rm(scope.root, { recursive: true, force: true })
  })
})
