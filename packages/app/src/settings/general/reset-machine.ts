/**
 * The factory-reset confirmation flow as one machine. The dialog is the only observable surface: it opens, the user
 * types the confirmation word and submits, then the app wipes everything and quits — so `wiping` normally ends in a
 * window close rather than another transition. A failed or stalled wipe returns to an error state the dialog shows.
 */

export const CONFIRMATION_WORD = "RESET"

export type ResetState =
  | { status: "idle" }
  | { status: "confirming"; includeCliBinary: boolean; typed: string }
  | { status: "wiping"; includeCliBinary: boolean }
  | { status: "failed"; message: string; includeCliBinary: boolean; typed: string }

export type ResetEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "cliToggled"; includeCliBinary: boolean }
  | { type: "typed"; value: string }
  | { type: "submit" }
  | { type: "failed"; message: string }

export type ResetEffect = { type: "reset"; includeCliBinary: boolean }

export function createResetState(): ResetState {
  return { status: "idle" }
}

export function transitionReset(state: ResetState, event: ResetEvent): { state: ResetState; effects?: ResetEffect[] } {
  switch (event.type) {
    case "open":
      if (state.status !== "idle") return { state }
      return { state: { status: "confirming", includeCliBinary: false, typed: "" } }
    case "close":
      // Quitting cannot be taken back; closing does nothing while the wipe runs.
      if (state.status === "wiping") return { state }
      return { state: { status: "idle" } }
    case "cliToggled":
      if (state.status !== "confirming") return { state }
      return { state: { ...state, includeCliBinary: event.includeCliBinary } }
    case "typed":
      if (state.status !== "confirming") return { state }
      return { state: { ...state, typed: event.value } }
    case "submit": {
      // Claim the wipe synchronously in the same event that leaves `confirming`, so a second press cannot re-enter.
      if (state.status === "confirming" && state.typed !== CONFIRMATION_WORD) return { state }
      if (state.status !== "confirming" && state.status !== "failed") return { state }
      const includeCliBinary = state.includeCliBinary
      return { state: { status: "wiping", includeCliBinary }, effects: [{ type: "reset", includeCliBinary }] }
    }
    case "failed":
      if (state.status !== "wiping") return { state }
      // Only a correctly typed word reaches `wiping`, so the retry starts with it already entered.
      return {
        state: {
          status: "failed",
          message: event.message,
          includeCliBinary: state.includeCliBinary,
          typed: CONFIRMATION_WORD,
        },
      }
  }
}

export const canSubmitReset = (state: ResetState) =>
  (state.status === "confirming" && state.typed === CONFIRMATION_WORD) || state.status === "failed"
