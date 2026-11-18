export * as LoopTools from "./loop.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import type { Session } from "@opencode/schema/session"
import { TuiEvent } from "@opencode/schema/tui-event"
import { Effect } from "effect"
import { Bus } from "../../bus.js"
import { Schedule } from "../../schedule.js"
import { ScheduleLoop } from "../../schedule/loop.js"
import { summary, toView } from "./schedule.js"

export const Plugin = {
  id: "opencode.tool.loop",
  effect: Effect.fn("LoopTools.Plugin")(function* (ctx: Context) {
    const schedules = yield* Schedule.Service
    const bus = yield* Bus.Service

    // Command execution runs with the Session's Location ambient, so a toast reaches the client showing that one.
    const notice = (message: string, variant: "success" | "info") =>
      bus.publish(TuiEvent.ToastShow, { message, variant, duration: 8_000 }).pipe(Effect.asVoid)

    /** Loops the user can still act on; finished ones are noise in a list or as a stop target. */
    const live = (sessionID: Session.ID) =>
      schedules
        .list({ sessionID, origin: "loop" })
        .pipe(Effect.map((rows) => rows.filter((row) => row.status !== "done")))

    // Parsing and creating happen in code rather than through the model: a misread interval would set the cadence for
    // every later iteration, and arming a loop should not cost a turn.
    const run = Effect.fn("LoopTools.run")(function* (sessionID: Session.ID, text: string) {
      const parsed = ScheduleLoop.parse(text)
      if (parsed.type === "usage") return yield* Effect.fail(new Error(parsed.reason))

      if (parsed.type === "list") {
        const loops = yield* live(sessionID)
        if (loops.length === 0) return yield* notice("No loops in this session.", "info")
        return yield* notice(
          ["This session's loops:", ...loops.map((loop, index) => `${index + 1}. ${summary(toView(loop))}`)].join("\n"),
          "info",
        )
      }

      if (parsed.type === "stop") {
        const loops = yield* live(sessionID)
        if (loops.length === 0) return yield* Effect.fail(new Error("No loop is running in this session."))
        const target = parsed.target?.trim()
        if (target?.toLowerCase() === "all") {
          yield* Effect.forEach(loops, (loop) => schedules.remove(loop.id), { discard: true })
          return yield* notice(`Stopped ${loops.length} loop${loops.length === 1 ? "" : "s"}.`, "success")
        }
        const match = resolve(loops, target)
        if (match === undefined)
          return yield* Effect.fail(
            new Error(
              `No single loop matches ${JSON.stringify(target ?? "")}. Run /loop to list them, then stop one by number.`,
            ),
          )
        yield* schedules.remove(match.id)
        return yield* notice(`Stopped the loop: ${summary(toView(match))}`, "success")
      }

      const info = yield* schedules.create({
        sessionID,
        when: { type: "every", every: parsed.every },
        ...(parsed.gate === undefined ? {} : { if: parsed.gate }),
        ends: { after: parsed.endsAfter },
        action: { type: "prompt", prompt: parsed.prompt },
        // A timer fire waits for the Session to go idle instead of cutting into in-flight work and refilling its step
        // allowance, which is how a recurring loop would keep itself running indefinitely.
        delivery: "queue",
        origin: "loop",
      })
      const next = toView(info).nextDueAt ?? ""
      return yield* notice(
        [
          `Loop started: every ${parsed.every}${parsed.gate === undefined ? "" : `, only when "${parsed.gate.run}" changes`}.`,
          ...parsed.notes,
          `Next run ${next.replace("T", " ")}. Ends after ${parsed.endsAfter}; stop with /loop stop.`,
        ].join(" "),
        "success",
      )
    })

    yield* ctx.command.transform((editor) => {
      editor.add({
        name: "loop",
        description: "repeat a prompt on an interval in this session [list | stop <number|id|all>]",
        execute: (input) => run(input.sessionID, input.prompt.text.trim()).pipe(Effect.asVoid),
      })
    })
  }),
}

/** Finds the loop a `/loop stop` target names: its number in the list, its id, or text unique among this session's loops. */
function resolve(loops: Schedule.Info[], target: string | undefined) {
  if (target === undefined) return loops.length === 1 ? loops[0] : undefined
  if (/^\d+$/.test(target)) {
    const index = Number(target)
    if (index >= 1 && index <= loops.length) return loops[index - 1]
  }
  if (target.startsWith("sch_")) return loops.find((loop) => loop.id === target)
  const matches = loops.filter((loop) =>
    `${loop.name ?? ""} ${loop.action.prompt}`.toLowerCase().includes(target.toLowerCase()),
  )
  return matches.length === 1 ? matches[0] : undefined
}
