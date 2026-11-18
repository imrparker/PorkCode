import { describe, expect } from "bun:test"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Schedule } from "@opencode/core/schedule"
import { Session } from "@opencode/core/session"
import { Tool } from "@opencode/core/tool"
import { LoopTools } from "@opencode/core/tool/plugin/loop"
import { LayerNode } from "@opencode/util/effect/layer-node"
import type { CommandDefinition } from "@opencode/plugin/effect/command"
import { TuiEvent } from "@opencode/schema/tui-event"
import { DateTime, Effect, Fiber, Layer, Stream } from "effect"
import { testEffect } from "./lib/effect"
import { permissionLayer } from "./lib/permission"
import { registerToolPlugin, toolNodeReplacements } from "./lib/tool"

const sessionID = Session.ID.make("ses_loop_tool_test")
const now = DateTime.makeUnsafe("2026-11-18T13:00:00Z")

// The real Bus is part of the layer so toasts travel through the same publish path production uses.
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Tool.node, Database.node, Bus.node]), toolNodeReplacements()),
)

/** An in-memory Schedule service that records create inputs; the engine itself is covered in schedule.test.ts. */
const memory = () => {
  const rows = new Map<Schedule.ID, Schedule.Info>()
  const created: Schedule.CreateInput[] = []
  // `Schedule.Info` is the public view and does not carry origin, so the stub keeps it beside the row.
  const origins = new Map<Schedule.ID, Schedule.Origin>()
  const find = (id: Schedule.ID): Effect.Effect<Schedule.Info, Schedule.NotFoundError> => {
    const info = rows.get(id)
    return info ? Effect.succeed(info) : Effect.fail(new Schedule.NotFoundError({ scheduleID: id }))
  }
  const service = Schedule.Service.of({
    create: (input) =>
      Effect.sync(() => {
        created.push(input)
        const info: Schedule.Info = {
          id: Schedule.ID.make(`sch_${rows.size + 1}`),
          sessionID: input.sessionID,
          name: input.name,
          when: input.when ?? { type: "every", every: "30 seconds" },
          tz: "America/New_York",
          if: input.if,
          until: input.until,
          action: input.action,
          status: "active",
          nextDueAt: DateTime.add(now, { minutes: 45 }),
          runCount: 0,
          time: { created: now, updated: now },
        }
        rows.set(info.id, info)
        if (input.origin !== undefined) origins.set(info.id, input.origin)
        return info
      }),
    list: (input) =>
      Effect.sync(() =>
        [...rows.values()].filter(
          (info) =>
            (input?.sessionID === undefined || info.sessionID === input.sessionID) &&
            (input?.origin === undefined || origins.get(info.id) === input.origin),
        ),
      ),
    get: find,
    // /loop only creates, lists and removes; the other engine methods are out of scope here.
    pause: () => Effect.die("unused Schedule.pause"),
    resume: () => Effect.die("unused Schedule.resume"),
    remove: (id) => find(id).pipe(Effect.map(() => void rows.delete(id))),
    tick: Effect.void,
    run: Effect.never,
  })
  return { rows, created, service }
}

const setup = () =>
  Effect.gen(function* () {
    const schedules = memory()
    const commands: CommandDefinition[] = []
    yield* registerToolPlugin(LoopTools.Plugin, {
      event: { subscribe: () => Stream.never },
      command: {
        list: () => Effect.die("unused command.list"),
        reload: () => Effect.void,
        transform: (callback) =>
          Effect.sync(() => {
            callback({ add: (definition) => commands.push(definition) })
            return { dispose: Effect.void }
          }),
      },
    }).pipe(
      Effect.provide(Layer.succeed(Schedule.Service, schedules.service)),
      Effect.provide(permissionLayer({ assert: () => Effect.void })),
    )
    return { rows: schedules.rows, created: schedules.created, commands }
  })

const loop = (commands: CommandDefinition[]) => commands.find((command) => command.name === "loop")!

type Toast = { readonly message: string; readonly variant: "info" | "success" | "warning" | "error" }

/** Runs `/loop <text>` and returns the failure plus the toasts it published, whichever happened. */
const runLoop = Effect.fn("test.runLoop")(function* (text: string, commands: CommandDefinition[]) {
  const bus = yield* Bus.Service
  const fiber = yield* bus.subscribe(TuiEvent.ToastShow).pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
  yield* Effect.yieldNow
  // A failed command publishes nothing, so only the success path may await the subscriber.
  const result = yield* loop(commands)
    .execute({ sessionID, prompt: { text }, delivery: "steer" })
    .pipe(Effect.match({ onFailure: (error) => ({ error: error as Error }), onSuccess: () => undefined }))
  if (result !== undefined) return { error: result.error, toasts: [] as Toast[] }
  const events = yield* Fiber.join(fiber)
  return { error: undefined as Error | undefined, toasts: [...events].map((event) => event.data) as Toast[] }
})

describe("/loop command", () => {
  it.effect("registers the loop command unconditionally", () =>
    Effect.gen(function* () {
      const { commands } = yield* setup()
      expect(commands.map((command) => command.name)).toEqual(["loop"])
    }),
  )

  it.effect("starts a queued loop with the parsed cadence and a seven-day expiry", () =>
    Effect.gen(function* () {
      const { created, commands } = yield* setup()
      const { error, toasts } = yield* runLoop("45m review my changes", commands)

      expect(error).toBeUndefined()
      expect(created).toHaveLength(1)
      expect(created[0]).toMatchObject({
        sessionID,
        when: { type: "every", every: "45 minutes" },
        action: { type: "prompt", prompt: "review my changes" },
        ends: { after: "7 days" },
        delivery: "queue",
        origin: "loop",
      })
      expect(toasts).toHaveLength(1)
      expect(toasts[0]!.message).toContain("Loop started: every 45 minutes")
      expect(toasts[0]!.variant).toBe("success")
    }),
  )

  it.effect("passes a when-changes gate clause to the schedule as a shell condition", () =>
    Effect.gen(function* () {
      const { created, commands } = yield* setup()
      const { error } = yield* runLoop('45m when "git rev-parse HEAD" changes review my commits', commands)

      expect(error).toBeUndefined()
      expect(created[0]).toMatchObject({
        when: { type: "every", every: "45 minutes" },
        if: { type: "shell", run: "git rev-parse HEAD", changes: true },
        action: { type: "prompt", prompt: "review my commits" },
      })
    }),
  )

  it.effect("lists this session's live loops", () =>
    Effect.gen(function* () {
      const { commands } = yield* setup()
      yield* runLoop("5m check the deploy", commands)
      const { toasts } = yield* runLoop("list", commands)

      expect(toasts[0]!.message).toContain("check the deploy")
      expect(toasts[0]!.variant).toBe("info")
    }),
  )

  it.effect("stops a loop by number and reports what stopped", () =>
    Effect.gen(function* () {
      const { rows, commands } = yield* setup()
      yield* runLoop("5m check the deploy", commands)
      const first = [...rows.keys()][0]!
      const { error, toasts } = yield* runLoop("stop 1", commands)

      expect(error).toBeUndefined()
      expect(rows.has(first)).toBe(false)
      expect(toasts[0]!.message).toContain("Stopped the loop")
    }),
  )

  it.effect("stops every loop with `all` and reports the count", () =>
    Effect.gen(function* () {
      const { rows, commands } = yield* setup()
      yield* runLoop("5m check the deploy", commands)
      yield* runLoop("30m run the tests", commands)
      expect(rows.size).toBe(2)

      const { error, toasts } = yield* runLoop("stop all", commands)

      expect(error).toBeUndefined()
      expect(rows.size).toBe(0)
      expect(toasts[0]!.message).toContain("Stopped 2 loops")
    }),
  )

  it.effect("stops a loop by its id", () =>
    Effect.gen(function* () {
      const { rows, commands } = yield* setup()
      yield* runLoop("5m check the deploy", commands)
      const only = [...rows.keys()][0]!

      const { error } = yield* runLoop(`stop ${only}`, commands)

      expect(error).toBeUndefined()
      expect(rows.has(only)).toBe(false)
    }),
  )

  // The numeric branch is decimal-only, so a non-decimal or out-of-range target must not index into the list.
  it.effect("refuses stop targets that are not a listed number", () =>
    Effect.gen(function* () {
      const { rows, commands } = yield* setup()
      yield* runLoop("5m check the deploy", commands)
      yield* runLoop("30m run the tests", commands)

      for (const target of ["stop 0x2", "stop 9"]) {
        const { error } = yield* runLoop(target, commands)
        expect(error?.message).toContain("No single loop matches")
        expect(rows.size).toBe(2)
      }
    }),
  )

  it.effect("fails with usage text when an interval has no prompt", () =>
    Effect.gen(function* () {
      const { created, commands } = yield* setup()
      const { error } = yield* runLoop("5m", commands)

      expect(created).toHaveLength(0)
      expect(error?.message).toContain("Usage: /loop")
    }),
  )

  it.effect("fails when stopping with no loop running", () =>
    Effect.gen(function* () {
      const { commands } = yield* setup()
      const { error } = yield* runLoop("stop", commands)

      expect(error?.message).toContain("No loop is running")
    }),
  )
})

