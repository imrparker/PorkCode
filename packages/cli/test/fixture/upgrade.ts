import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Command } from "effect/cli"
import { Commands } from "../../src/commands/commands"
import upgrade from "../../src/commands/handlers/upgrade"
import { Updater } from "../../src/services/updater"

const record = (event: unknown) => console.log(`EVENT ${JSON.stringify(event)}`)

await Effect.runPromise(
  Command.runWith(Commands.commands.upgrade.spec.pipe(Command.withHandler(upgrade)), { version: "test" })(
    process.argv.slice(2),
  ).pipe(
    // Every member dies on call, so the tests prove the short-circuit never touches the updater.
    Effect.provideService(Updater.Service, {
      run: () => Effect.die("Manual upgrades must not check for automatic updates"),
      check: () => Effect.die("Manual upgrades must not check for TUI updates"),
      apply: () => Effect.die("Manual upgrades must not apply TUI updates"),
      removal: () => undefined,
      method: () =>
        Effect.sync(() => {
          record("method")
          return Updater.methods.find((method) => method === (process.env.UPGRADE_TEST_METHOD ?? "npm"))
        }),
    }),
    Effect.provide(NodeServices.layer),
  ),
)
