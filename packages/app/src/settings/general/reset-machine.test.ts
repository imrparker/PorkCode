import { describe, expect, test } from "bun:test"
import { CONFIRMATION_WORD, canSubmitReset, createResetState, transitionReset, type ResetState } from "./reset-machine"

const confirming = (over: Partial<{ includeCliBinary: boolean; typed: string }> = {}): ResetState => ({
  status: "confirming",
  includeCliBinary: false,
  typed: "",
  ...over,
})

describe("factory reset machine", () => {
  test("submit without the confirmation word never claims the wipe", () => {
    const result = transitionReset(confirming({ typed: "reset" }), { type: "submit" })
    expect(result.effects).toBeUndefined()
    expect(result.state).toEqual(confirming({ typed: "reset" }))
    expect(canSubmitReset(result.state)).toBe(false)
  })

  test("a correct submit claims the wipe once and carries the scope into the effect", () => {
    const first = transitionReset(confirming({ includeCliBinary: true, typed: CONFIRMATION_WORD }), { type: "submit" })
    expect(first.state).toEqual({ status: "wiping", includeCliBinary: true })
    expect(first.effects).toEqual([{ type: "reset", includeCliBinary: true }])
    // A second press while wiping must not spawn a second wipe.
    const second = transitionReset(first.state, { type: "submit" })
    expect(second.effects).toBeUndefined()
    expect(second.state).toBe(first.state)
  })

  test("closing cannot cancel a running wipe", () => {
    const wiping: ResetState = { status: "wiping", includeCliBinary: false }
    expect(transitionReset(wiping, { type: "close" }).state).toBe(wiping)
  })

  test("a failed wipe returns to an error state with the word still entered so retry can submit", () => {
    const failed = transitionReset(
      { status: "wiping", includeCliBinary: true },
      { type: "failed", message: "boom" },
    ).state
    expect(failed).toEqual({ status: "failed", message: "boom", includeCliBinary: true, typed: CONFIRMATION_WORD })
    expect(canSubmitReset(failed)).toBe(true)
    const retry = transitionReset(failed, { type: "submit" })
    expect(retry.effects).toEqual([{ type: "reset", includeCliBinary: true }])
  })

  test("scope and typed edits only apply while confirming", () => {
    for (const state of [createResetState(), { status: "wiping", includeCliBinary: false } as ResetState]) {
      expect(transitionReset(state, { type: "cliToggled", includeCliBinary: true }).state).toBe(state)
      expect(transitionReset(state, { type: "typed", value: "x" }).state).toBe(state)
    }
  })

  test("open only starts from idle and close returns to idle from every dialog phase", () => {
    expect(transitionReset(createResetState(), { type: "open" }).state.status).toBe("confirming")
    const openAgain = transitionReset(confirming(), { type: "open" })
    expect(openAgain.state).toEqual(confirming())
    expect(transitionReset(confirming({ typed: "x" }), { type: "close" }).state).toEqual({ status: "idle" })
  })
})
