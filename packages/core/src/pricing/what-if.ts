export * as PricingWhatIf from "./what-if.js"

import { Effect, Schema, type Types } from "effect"
import { sql } from "drizzle-orm"
import { Money } from "@opencode/schema/money"
import type { Pricing } from "@opencode/schema/pricing"
import { TokenUsage } from "@opencode/schema/token-usage"
import type { Project } from "@opencode/schema/project"
import type { SessionSchema } from "../session/schema.js"
import { Database } from "../database/database.js"
import { SessionMessageTable, SessionTable } from "../session/sql.js"
import { SessionUsage } from "../session/usage.js"
import { PricingRateCard } from "./rate-card.js"

type Input = {
  /** Price this session and its subagents. Takes precedence over `projectID` when both are given. */
  readonly sessionID?: SessionSchema.ID
  readonly projectID?: Project.ID
  readonly from?: number
  readonly to?: number
}

type StepRow = {
  timeCreated: number | null
  input: number | null
  output: number | null
  reasoning: number | null
  cacheRead: number | null
  cacheWrite: number | null
}

export class InvalidRangeError extends Schema.TaggedError<InvalidRangeError>()("Pricing.InvalidRangeError", {
  from: Schema.Finite,
  to: Schema.Finite,
}) {}

/**
 * Prices recorded usage against every bundled reference model. Each step is priced on its own so a vendor's
 * long-context tier sees the prompt size that request actually had, and dated rate sets price steps either side
 * of a scheduled repricing. Estimates only: token counts come from the models that actually ran.
 */
export const get = Effect.fn("PricingWhatIf.get")(function* (input: Input = {}) {
  if (input.from !== undefined && input.to !== undefined && input.from >= input.to)
    return yield* new InvalidRangeError({ from: input.from, to: input.to })
  const db = (yield* Database.Service).db
  const family =
    input.sessionID === undefined
      ? sql``
      : sql`WITH RECURSIVE family(id) AS (
          SELECT ${input.sessionID}
          UNION ALL
          SELECT child.id FROM ${SessionTable} AS child JOIN family ON child.parent_id = family.id
        )`
  const rows = yield* db.all<StepRow>(
    sql`${family}
      SELECT
        message.time_created AS timeCreated,
        json_extract(message.data, '$.tokens.input') AS input,
        json_extract(message.data, '$.tokens.output') AS output,
        json_extract(message.data, '$.tokens.reasoning') AS reasoning,
        json_extract(message.data, '$.tokens.cache.read') AS cacheRead,
        json_extract(message.data, '$.tokens.cache.write') AS cacheWrite
      FROM ${SessionMessageTable} AS message
      JOIN ${SessionTable} AS session ON session.id = message.session_id
      WHERE message.type = 'assistant'
        AND (session.fork_session_id IS NULL OR message.time_created >= session.time_created)
        ${input.from === undefined ? sql`` : sql`AND message.time_created >= ${input.from}`}
        ${input.to === undefined ? sql`` : sql`AND message.time_created < ${input.to}`}
        ${input.projectID === undefined ? sql`` : sql`AND session.project_id = ${input.projectID}`}
        ${input.sessionID === undefined ? sql`` : sql`AND message.session_id IN (SELECT id FROM family)`}
    `,
  ).pipe(Effect.orDie)

  const tokens: Types.DeepMutable<TokenUsage.Info> = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  const spent = new Map<string, number>()
  for (const row of rows) {
    const step: TokenUsage.Info = {
      input: row.input ?? 0,
      output: row.output ?? 0,
      reasoning: row.reasoning ?? 0,
      cache: { read: row.cacheRead ?? 0, write: row.cacheWrite ?? 0 },
    }
    tokens.input += step.input
    tokens.output += step.output
    tokens.reasoning += step.reasoning
    tokens.cache.read += step.cache.read
    tokens.cache.write += step.cache.write

    const at = row.timeCreated ?? Date.now()
    for (const reference of PricingRateCard.references) {
      spent.set(
        reference.id,
        (spent.get(reference.id) ?? 0) + SessionUsage.calculateCost(PricingRateCard.rates(reference, at), step),
      )
    }
  }

  return {
    asOf: PricingRateCard.asOf,
    steps: rows.length,
    tokens,
    comparisons: PricingRateCard.references.map((reference) => ({
      reference,
      cost: Money.USD.make(spent.get(reference.id) ?? 0),
    })),
  } satisfies Pricing.WhatIf
})
