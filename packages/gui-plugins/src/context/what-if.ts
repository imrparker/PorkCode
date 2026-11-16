import { createResource, createSignal } from "solid-js"
import type { MountedSession } from "@opencode/plugin/gui"

/**
 * Estimated API cost of the session's usage on the bundled reference rate card. Nothing is requested until the
 * first `refresh()`, so a header indicator asks only when its menu opens; pass `immediate` for a surface that
 * shows the figures on mount.
 */
export function useWhatIf(session: () => MountedSession, options?: { immediate?: boolean }) {
  const [enabled, setEnabled] = createSignal(options?.immediate === true)

  const [whatIf, actions] = createResource(
    () => (enabled() ? session().id : undefined),
    (id) => session().server.client.experimental.pricing.whatIf({ session: id }),
  )

  return {
    /** The last result; undefined before the first load and after a failure. */
    data: () => whatIf.latest,
    error: () => whatIf.state === "errored",
    refresh: () => {
      // Enabling runs the first fetch on its own; only an already-enabled source needs a forced refetch.
      if (!enabled()) return void setEnabled(true)
      actions.refetch()
    },
  }
}
