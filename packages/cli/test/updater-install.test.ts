import { NodeServices } from "@effect/platform-node"
import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { expect } from "bun:test"
import { Effect, FileSystem, PlatformError, Stream } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

function fixture(
  respond: (command: {
    readonly command: string
    readonly args: ReadonlyArray<string>
  }) => Partial<AppProcess.RunResult> & {
    error?: AppProcess.AppProcessError
  } = () => ({}),
  name = "@opencode/cli",
  executableOverride?: (root: string, home: string) => Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "porkcode-updater-" })
    const execPath = process.execPath
    const modules = path.join(root, "node_modules")
    const executable = executableOverride
      ? yield* executableOverride(root, path.join(root, "home"))
      : path.join(modules, "@opencode", "cli", "bin", "porkcode")
    yield* fs.makeDirectory(path.dirname(executable), { recursive: true })
    yield* fs.writeFileString(executable, "binary")
    if (!executableOverride)
      yield* fs.writeFileString(
        path.join(modules, "@opencode", "cli", "package.json"),
        JSON.stringify({ name, bin: { porkcode: "bin/porkcode" } }),
      )
    const commands: string[][] = []
    const global = Global.make({
      home: path.join(root, "home"),
      data: path.join(root, "data"),
      cache: path.join(root, "cache"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      tmp: path.join(root, "tmp"),
      bin: path.join(root, "bin"),
      log: path.join(root, "log"),
      repos: path.join(root, "repos"),
    })
    const updater = yield* Updater.Service.pipe(
      Effect.provide(Updater.layer),
      Effect.provideService(Global.Service, global),
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        realPath: (input) => (input === execPath ? fs.realPath(executable) : fs.realPath(input)),
      }),
      Effect.provideService(
        AppProcess.Service,
        AppProcess.Service.of({
          ...spawner,
          run: (command) =>
            Effect.suspend(() => {
              if (command._tag !== "StandardCommand") return Effect.die("Unexpected piped command")
              const args = command.args.map(String)
              commands.push([command.command, ...args])
              const result = respond({ command: command.command, args })
              if (result.error) return Effect.fail(result.error)
              return Effect.succeed({
                command: command.command,
                exitCode: 0,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                stdoutTruncated: false,
                stderrTruncated: false,
                ...result,
              })
            }),
          runStream: () => Stream.die("Unexpected streaming command"),
        }),
      ),
    )
    return { updater, commands, global, fs, executable }
  })
}

const windows = process.platform === "win32" ? it.live : it.live.skip
const unix = process.platform === "win32" ? it.live.skip : it.live

;(["npm", "pnpm", "bun", "yarn", "vp", undefined] as const).forEach((method) => {
  it.live(`method detection identifies ${method ?? "an unknown installation"} using the V2 package`, () =>
    Effect.gen(function* () {
      const test = yield* fixture((command) => ({
        stdout: Buffer.from(
          command.command === method
            ? method === "vp"
              ? JSON.stringify([{ name: "@opencode/cli", version: "2.3.4" }])
              : "@opencode/cli@2.3.4"
            : command.command === "vp"
              ? "[]"
              : "porkcode-ai@1.0.0",
        ),
      }))
      expect(yield* test.updater.method()).toBe(method)
      expect(test.commands).toEqual([
        ["npm", "list", "-g", "--depth=0", "@opencode/cli"],
        ["pnpm", "list", "-g", "--depth=0", "@opencode/cli"],
        ["bun", "pm", "ls", "-g"],
        ["yarn", "global", "list"],
        ["vp", "list", "-g", "--json", "@opencode/cli"],
      ])
    }),
  )
})

it.live("method detection tolerates unavailable package managers", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) =>
      command.command === "yarn"
        ? { stdout: Buffer.from("@opencode/cli@2.3.4") }
        : { error: new AppProcess.AppProcessError({ command: command.command }) },
    )
    expect(yield* test.updater.method()).toBe("yarn")
    expect(test.commands).toHaveLength(5)
  }),
)

it.live("vp detection ignores no-match output that repeats the package name", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) => ({
      stdout: Buffer.from(command.command === "vp" ? "No global packages matching '@opencode/cli'." : ""),
    }))
    expect(yield* test.updater.method()).toBeUndefined()
  }),
)

it.live("the Node distribution detects its published npm package", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      (command) => ({ stdout: Buffer.from(command.command === "npm" ? "@opencode/cli-node@2.3.4" : "") }),
      "@opencode/cli-node",
    )
    expect(yield* test.updater.method()).toBe("npm")
    const removal = test.updater.removal("npm")
    if (!removal) return yield* Effect.die("Expected npm removal command")
    expect(removal.command).toEqual(["npm", "uninstall", "--global", "@opencode/cli-node"])
  }),
)

it.live("source checkouts detect no method and offer no removal", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "not-opencode")
    expect(yield* test.updater.method()).toBeUndefined()
    expect(test.commands).toEqual([])
    expect(test.updater.removal("npm")).toBeUndefined()
  }),
)

const removals = [
  { method: "npm", command: ["npm", "uninstall", "--global", "@opencode/cli"] },
  { method: "pnpm", command: ["pnpm", "remove", "--global", "@opencode/cli"] },
  { method: "bun", command: ["bun", "remove", "--global", "@opencode/cli"] },
  { method: "yarn", command: ["yarn", "global", "remove", "@opencode/cli"] },
  { method: "vp", command: ["vp", "uninstall", "-g", "@opencode/cli"] },
] as const

removals.forEach(({ method, command }) => {
  it.live(`${method} removal runs its global uninstall`, () =>
    Effect.gen(function* () {
      const test = yield* fixture()
      const removal = test.updater.removal(method)
      if (!removal) return yield* Effect.die(`Expected ${method} removal command`)
      expect(removal.command).toEqual([...command])
      yield* removal.run
      expect(test.commands).toEqual([[...command]])
    }),
  )
})

it.live("curl installs have no package-manager removal; uninstall cleans the binary and PATH itself", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    expect(test.updater.removal("curl")).toBeUndefined()
    expect(test.commands).toEqual([])
  }),
)

it.live("removal failures expose stderr instead of reporting success", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({ exitCode: 1, stderr: Buffer.from("  registry denied access\n") }))
    const removal = test.updater.removal("npm")
    if (!removal) return yield* Effect.die("Expected npm removal command")
    const error = yield* removal.run.pipe(Effect.flip)
    expect(error.message).toBe("registry denied access")
    expect(test.commands).toHaveLength(1)
  }),
)

// Links are named porkcode-upgrade-<pid>-<random>.exe; read them from inside the uninstall run.
const links = (directory: string) =>
  existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith("porkcode-")) : []
const upgradeLinks = (directory: string) =>
  links(directory).filter((name) => name.startsWith(`porkcode-upgrade-${process.pid}-`))

windows("windows keeps the uninstall link in the temporary directory, not the removed cache", () =>
  Effect.gen(function* () {
    const layout = { tmp: "" }
    const test = yield* fixture(() => {
      expect(upgradeLinks(layout.tmp)).toHaveLength(1)
      return {}
    })
    layout.tmp = test.global.tmp
    yield* test.fs.makeDirectory(test.global.cache, { recursive: true })
    const removal = test.updater.removal("bun")
    if (!removal) return yield* Effect.die("Expected bun removal command")
    yield* removal.run
    expect(test.commands).toEqual([["bun", "remove", "--global", "@opencode/cli"]])
    expect(links(test.global.cache)).toEqual([])
    expect(links(test.global.tmp)).toEqual([])
  }),
)

windows("windows releases the uninstall link when the package manager fails", () =>
  Effect.gen(function* () {
    const layout = { tmp: "" }
    const test = yield* fixture(() => {
      expect(upgradeLinks(layout.tmp)).toHaveLength(1)
      return { exitCode: 1, stderr: Buffer.from("registry denied access") }
    })
    layout.tmp = test.global.tmp
    const removal = test.updater.removal("npm")
    if (!removal) return yield* Effect.die("Expected npm removal command")
    const error = yield* removal.run.pipe(Effect.flip)
    expect(error.message).toBe("registry denied access")
    expect(yield* test.fs.readFileString(test.executable)).toBe("binary")
    expect(links(test.global.tmp)).toEqual([])
  }),
)

windows("windows detects the curl binary under ~/.porkcode/bin and offers no removal", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      () => ({}),
      "@opencode/cli",
      (_root, home) => Effect.succeed(path.join(home, ".porkcode", "bin", "porkcode.exe")),
    )
    const original = process.execPath
    process.execPath = test.executable
    yield* Effect.addFinalizer(() => Effect.sync(() => (process.execPath = original)))
    expect(yield* test.updater.method()).toBe("curl")
    expect(test.updater.removal("curl")).toBeUndefined()
    expect(test.commands).toEqual([])
  }),
)

unix("curl method detection resolves symlinked home directories", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      () => ({}),
      "@opencode/cli",
      (root, home) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const realHome = path.join(root, "real-home")
          const bin = path.join(realHome, ".porkcode", "bin", "porkcode")
          yield* fs.makeDirectory(path.dirname(bin), { recursive: true })
          yield* fs.symlink(realHome, home)
          return bin
        }),
    )
    expect(yield* test.updater.method()).toBe("curl")
    expect(test.commands).toEqual([])
  }),
)

unix("other platforms never link the running binary", () =>
  Effect.gen(function* () {
    const layout = { tmp: "" }
    const test = yield* fixture(() => {
      expect(links(layout.tmp)).toEqual([])
      return {}
    })
    layout.tmp = test.global.tmp
    const removal = test.updater.removal("bun")
    if (!removal) return yield* Effect.die("Expected bun removal command")
    yield* removal.run
    expect(yield* test.fs.readFileString(test.executable)).toBe("binary")
  }),
)
