import { confirm, intro, log, outro, spinner } from "@clack/prompts"
import { Service } from "@opencode/client/effect/service"
import { FactoryReset } from "@opencode/util/factory-reset"
import { Global } from "@opencode/util/global"
import { Effect, FileSystem } from "effect"
import path from "node:path"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { ServerConnection } from "../../services/server-connection"
import { handlePromptErrors, prompt, requireInteractive } from "../../ui/prompt"

export default Runtime.handler(
  Commands.commands.reset,
  Effect.fn("cli.reset")(function* (input) {
    intro("Reset PorkCode to a fresh install")
    const fs = yield* FileSystem.FileSystem
    const global = yield* Global.Service
    // Read registrations directly: ServiceConfig.options() can migrate files even during a dry run.
    const services = (yield* fs.exists(global.state))
      ? (yield* fs.readDirectory(global.state)).filter((name) => /^service(?:-.*)?\.json$/.test(name))
      : []
    // All channels share these directories, so a reset clears every channel's sessions, settings and caches at once.
    const scope = { includeCliBinary: input.includeCliBinary }
    const present = yield* Effect.filter(FactoryReset.targets(global, scope), (target) =>
      fs.exists(target).pipe(Effect.orElseSucceed(() => false)),
    )

    log.message("The following will be removed (shared by PorkCode versions and channels):")
    present.forEach((file) => log.info(`  ${file}`))
    services.forEach((name) =>
      log.info(`  Stop background service and persistent terminals: ${path.join(global.state, name)}`),
    )
    if (!present.length && !services.length) log.warn("Nothing to remove.")

    if (input.dryRun) {
      log.warn("Dry run - no changes made")
      outro("Done")
      return
    }
    if (!input.force) {
      yield* requireInteractive("Use --force to reset without an interactive terminal, or --dry-run to preview.")
      const accepted = yield* prompt(() =>
        confirm({
          message: "This permanently deletes every session, project, credential, setting and cache. Continue?",
          initialValue: false,
        }),
      )
      if (!accepted) {
        outro("Cancelled")
        return
      }
    }

    const progress = spinner()
    if (services.length) {
      progress.start("Stopping background services...")
      yield* Effect.forEach(services, (name) =>
        Effect.gen(function* () {
          const options = { file: path.join(global.state, name) }
          yield* ServerConnection.shutdownPersistentPty(options).pipe(Effect.ignore)
          yield* Service.stop(options)
        }),
      ).pipe(
        Effect.tap(() => Effect.sync(() => progress.stop("Background services stopped"))),
        Effect.tapCause(() => Effect.sync(() => progress.stop("Failed to stop background services", 1))),
      )
    }

    progress.start("Removing data, settings, and caches...")
    const report = yield* FactoryReset.wipe(scope)
    if (report.failed.length) {
      progress.stop("Some paths could not be removed", 1)
      report.failed.forEach((failure) => log.warn(`  ${failure.path}: ${failure.message}`))
      // A running executable cannot delete itself on Windows, so tell the user how to finish removing it.
      if (scope.includeCliBinary && process.execPath.startsWith(path.join(global.home, ".porkcode", "bin"))) {
        log.message("To finish removing the CLI binary, run:")
        log.info(`  rm '${process.execPath.replaceAll("'", "'\\''")}'`)
      }
      yield* Effect.fail(new Error(report.failed.map((failure) => `${failure.path}: ${failure.message}`).join("\n")))
    }
    progress.stop("Removed everything; the next launch starts like a fresh install")
    report.removed.forEach((file) => log.info(`  ${file}`))
    outro("Done")
  }, handlePromptErrors),
)
