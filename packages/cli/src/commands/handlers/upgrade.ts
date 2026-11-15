import { intro, log, outro } from "@clack/prompts"
import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Updater } from "../../services/updater"
import { handlePromptErrors } from "../../ui/prompt"

// The command keeps its [target] and --method options so existing scripts still parse, but PorkCode
// has no release server: every invocation reports how to upgrade instead of fetching or installing.
export default Runtime.handler(
  Commands.commands.upgrade,
  Effect.fn("cli.upgrade")(
    function* () {
      intro("Upgrade")
      log.warn(Updater.upgradeGuidance)
      outro("Done")
    },
    handlePromptErrors,
  ),
)
