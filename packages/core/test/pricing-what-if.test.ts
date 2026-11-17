import { describe, expect, test } from "bun:test"
import { DateTime, Effect, Schema } from "effect"
import { Database } from "@opencode/core/database/database"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Agent } from "@opencode/core/agent"
import { Model } from "@opencode/core/model"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import type { TokenUsage } from "@opencode/schema/token-usage"
import { PricingRateCard } from "@opencode/core/pricing/rate-card"
import { PricingWhatIf } from "@opencode/core/pricing/what-if"
import { SessionUsage } from "@opencode/core/session/usage"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node])))

const encodeMessage = Schema.encodeSync(SessionMessage.Info)
const model = { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") }
const tokens = (input: number, output = 0, cacheRead = 0, cacheWrite = 0): TokenUsage.Info => ({
  input,
  output,
  reasoning: 0,
  cache: { read: cacheRead, write: cacheWrite },
})

const seedSession = (id: string, overrides?: Partial<typeof SessionTable.$inferInsert>) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
    yield* db
      .insert(SessionTable)
      .values({
        id: Session.ID.make(id),
        project_id: Project.ID.global,
        slug: "pricing-test",
        directory: "/project",
        title: "pricing test",
        version: "test",
        ...overrides,
      })
      .run()
    return db
  })

const seedMessage = (
  sessionID: string,
  id: string,
  seq: number,
  at: number,
  usage: TokenUsage.Info,
) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const { id: _, type, ...data } = encodeMessage(
      SessionMessage.Assistant.make({
        id: SessionMessage.ID.make(id),
        type: "assistant",
        agent: Agent.defaultID,
        model,
        content: [],
        time: { created: DateTime.makeUnsafe(at) },
        tokens: usage,
      }),
    )
    yield* db
      .insert(SessionMessageTable)
      .values({ id: SessionMessage.ID.make(id), session_id: Session.ID.make(sessionID), type, seq, time_created: at, data })
      .run()
  })

describe("PricingRateCard", () => {
  describe("rates(reference, at)", () => {
    const carbon = PricingRateCard.references.find((entry) => entry.id === "gemini-4-carbon")!

    test("applies a scheduled repricing from its effective date", () => {
      const before = PricingRateCard.rates(carbon, Date.UTC(2026, 10, 30))[0]
      const after = PricingRateCard.rates(carbon, Date.UTC(2026, 11, 1))[0]
      expect(Number(before.input)).toBe(2)
      expect(Number(after.input)).toBe(4)
      expect(Number(after.output)).toBe(20)
    })

    test("falls back to the undated set before any dated one", () => {
      expect(Number(PricingRateCard.rates(carbon, Date.UTC(2020, 0, 1))[0].input)).toBe(2)
    })

    test("returns the only set for models without repricings", () => {
      const sonnet = PricingRateCard.references.find((entry) => entry.id === "claude-sonnet-5.5")!
      expect(PricingRateCard.rates(sonnet, Date.UTC(2030, 0, 1))).toEqual(sonnet.rates[0].cost)
    })
  })

  describe("calculateCost against the rate card", () => {
    test("Haiku long-context tier applies only above 100,000 prompt tokens", () => {
      const haiku = PricingRateCard.references.find((entry) => entry.id === "claude-haiku-5.5")!
      expect(SessionUsage.calculateCost(haiku.rates[0].cost, tokens(100_000))).toBeCloseTo(0.01, 10)
      expect(SessionUsage.calculateCost(haiku.rates[0].cost, tokens(100_001))).toBeCloseTo(0.0500005, 10)
    })

    test("GPT-6 long-context tier counts cached tokens toward the boundary", () => {
      const astra = PricingRateCard.references.find((entry) => entry.id === "gpt-6-astra")!
      expect(SessionUsage.calculateCost(astra.rates[0].cost, tokens(272_000))).toBeCloseTo(2.72, 10)
      expect(SessionUsage.calculateCost(astra.rates[0].cost, tokens(200_000, 0, 72_001))).toBeCloseTo(4.144002, 10)
    })

    test("DeepSeek bills uncached input at the miss rate and cache reads at the hit rate", () => {
      const pro = PricingRateCard.references.find((entry) => entry.id === "deepseek-v4-pro")!
      expect(SessionUsage.calculateCost(pro.rates[0].cost, tokens(1_000, 0, 999_000))).toBeCloseTo(0.022638, 10)
    })

    test("implicit-cache vendors charge nothing for cache writes", () => {
      const hydrogen = PricingRateCard.references.find((entry) => entry.id === "gemini-4-hydrogen")!
      expect(SessionUsage.calculateCost(hydrogen.rates[0].cost, tokens(0, 0, 0, 500_000))).toBeCloseTo(0, 10)
    })

    test("reasoning bills as output", () => {
      const sonnet = PricingRateCard.references.find((entry) => entry.id === "claude-sonnet-5.5")!
      expect(SessionUsage.calculateCost(sonnet.rates[0].cost, { ...tokens(0), reasoning: 1_000 })).toBeCloseTo(0.01, 10)
    })
  })
})

describe("PricingWhatIf", () => {
  it.effect("prices every step and applies dated repricings per step", () =>
    Effect.gen(function* () {
      yield* seedSession("ses_whatif_dated")
      const usage = tokens(1_000, 500)
      yield* seedMessage("ses_whatif_dated", "msg_nov", 0, Date.UTC(2026, 10, 20), usage)
      yield* seedMessage("ses_whatif_dated", "msg_dec", 1, Date.UTC(2026, 11, 20), usage)

      const result = yield* PricingWhatIf.get({ sessionID: Session.ID.make("ses_whatif_dated") })
      expect(result.asOf).toBe(PricingRateCard.asOf)
      expect(result.steps).toBe(2)
      expect(result.tokens).toEqual(tokens(2_000, 1_000))

      const cost = (id: string) => result.comparisons.find((entry) => entry.reference.id === id)!.cost
      // Sonnet is flat: 2 x ($2/1M x 1,000 + $10/1M x 500). Carbon doubles on Dec 1, so its two steps price differently.
      expect(cost("claude-sonnet-5.5")).toBeCloseTo(0.014, 10)
      expect(cost("gemini-4-carbon")).toBeCloseTo(0.021, 10)
      expect(result.comparisons.length).toBe(PricingRateCard.references.length)
    }),
  )

  it.effect("includes subagent sessions of the requested session", () =>
    Effect.gen(function* () {
      yield* seedSession("ses_whatif_parent")
      yield* seedSession("ses_whatif_child", { parent_id: Session.ID.make("ses_whatif_parent") })
      yield* seedMessage("ses_whatif_parent", "msg_parent", 0, Date.UTC(2026, 10, 20), tokens(1_000))
      yield* seedMessage("ses_whatif_child", "msg_child", 0, Date.UTC(2026, 10, 20), tokens(3_000))

      const result = yield* PricingWhatIf.get({ sessionID: Session.ID.make("ses_whatif_parent") })
      expect(result.steps).toBe(2)
      expect(result.tokens.input).toBe(4_000)
      expect(result.comparisons.find((entry) => entry.reference.id === "claude-sonnet-5.5")!.cost).toBeCloseTo(0.008, 10)
    }),
  )

  it.effect("excludes inherited history from a forked session", () =>
    Effect.gen(function* () {
      const boundary = Date.UTC(2026, 10, 20)
      yield* seedSession("ses_whatif_source")
      yield* seedSession("ses_whatif_fork", { fork_session_id: Session.ID.make("ses_whatif_source"), time_created: boundary })
      yield* seedMessage("ses_whatif_fork", "msg_before", 0, boundary - 1_000, tokens(5_000))
      yield* seedMessage("ses_whatif_fork", "msg_after", 1, boundary, tokens(1_000))

      const result = yield* PricingWhatIf.get({ sessionID: Session.ID.make("ses_whatif_fork") })
      expect(result.steps).toBe(1)
      expect(result.tokens.input).toBe(1_000)
    }),
  )

  it.effect("filters by time range and rejects an inverted one", () =>
    Effect.gen(function* () {
      yield* seedSession("ses_whatif_range")
      yield* seedMessage("ses_whatif_range", "msg_first", 0, Date.UTC(2026, 10, 1), tokens(7_000))
      yield* seedMessage("ses_whatif_range", "msg_second", 1, Date.UTC(2026, 10, 10), tokens(1_000))

      const result = yield* PricingWhatIf.get({
        sessionID: Session.ID.make("ses_whatif_range"),
        from: Date.UTC(2026, 10, 5),
        to: Date.UTC(2026, 10, 15),
      })
      expect(result.steps).toBe(1)
      expect(result.tokens.input).toBe(1_000)

      const error = yield* PricingWhatIf.get({ from: 10, to: 5 }).pipe(Effect.flip)
      expect(error._tag).toBe("Pricing.InvalidRangeError")
    }),
  )

  it.effect("prices a whole project without crossing into other projects", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      yield* db
        .insert(ProjectTable)
        .values({ id: Project.ID.make("proj_other"), worktree: AbsolutePath.make("/other"), sandboxes: [] })
        .run()
      yield* seedSession("ses_whatif_home")
      yield* seedMessage("ses_whatif_home", "msg_home", 0, Date.UTC(2026, 10, 20), tokens(1_000))
      yield* seedSession("ses_whatif_other", { project_id: Project.ID.make("proj_other") })
      yield* seedMessage("ses_whatif_other", "msg_other", 0, Date.UTC(2026, 10, 20), tokens(9_000))

      const result = yield* PricingWhatIf.get({ projectID: Project.ID.global })
      expect(result.steps).toBe(1)
      expect(result.tokens.input).toBe(1_000)
    }),
  )
})
