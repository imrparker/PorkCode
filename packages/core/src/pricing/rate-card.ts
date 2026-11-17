export * as PricingRateCard from "./rate-card.js"

import { Money } from "@opencode/schema/money"
import type { Model } from "@opencode/schema/model"
import type { Pricing } from "@opencode/schema/pricing"

const usd = (value: number) => Money.USDPerMillionTokens.make(value)

/** One published rate set. `write` is omitted where the vendor caches implicitly and charges nothing to write. */
type Rate = { input: number; output: number; read: number; write?: number }

const cost = (rate: Rate): Model.Info["cost"] => [
  {
    input: usd(rate.input),
    output: usd(rate.output),
    cache: { read: usd(rate.read), write: usd(rate.write ?? 0) },
  },
]

/** A long-context rate that applies once a request's prompt grows past `size` tokens. */
const tier = (size: number, rate: Rate): Model.Info["cost"][number] => ({
  ...cost(rate)[0],
  tier: { type: "context", size },
})

/** Vendor-dated repricings take effect at 00:00 UTC on the stated day. */
const utc = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day)

export const asOf = utc(2026, 11, 16)

/**
 * Published API prices of big-box models, bundled so the app stays offline. Rates are USD per million tokens at
 * each vendor's standard tier; reasoning bills as output everywhere here. `input` is uncached input (a vendor's
 * "cache miss") and `read` is a cache hit. Batch, priority/ultrafast speeds, data-residency uplifts and tool
 * surcharges are deliberately not modelled.
 */
export const references: ReadonlyArray<Pricing.Reference> = [
  {
    id: "claude-fable-5.2",
    provider: "Anthropic",
    name: "Claude Fable 5.2",
    apiID: "claude-fable-5-2",
    rates: [{ cost: cost({ input: 8, output: 40, read: 0.2, write: 10 }) }],
    note: "Cache write at the 5-minute rate; the 1-hour write is $16 per million.",
  },
  {
    id: "claude-opus-5.5",
    provider: "Anthropic",
    name: "Claude Opus 5.5",
    apiID: "claude-opus-5-5",
    rates: [{ cost: cost({ input: 4, output: 20, read: 0.2, write: 5 }) }],
    note: "Cache write at the 5-minute rate; the 1-hour write is $8 per million.",
  },
  {
    id: "claude-sonnet-5.5",
    provider: "Anthropic",
    name: "Claude Sonnet 5.5",
    apiID: "claude-sonnet-5-5",
    rates: [{ cost: cost({ input: 2, output: 10, read: 0.1, write: 2.5 }) }],
    note: "Cache write at the 5-minute rate; the 1-hour write is $4 per million.",
  },
  {
    id: "claude-haiku-5.5",
    provider: "Anthropic",
    name: "Claude Haiku 5.5",
    apiID: "claude-haiku-5-5",
    rates: [
      {
        cost: [
          cost({ input: 0.1, output: 0.5, read: 0.01, write: 0.125 })[0],
          tier(100_000, { input: 0.5, output: 2.5, read: 0.05, write: 0.625 }),
        ],
      },
    ],
    note: "Every rate doubles once a prompt passes 100,000 tokens.",
  },
  {
    id: "gpt-6-astra",
    provider: "OpenAI",
    name: "GPT-6 Astra",
    apiID: "gpt-6-astra",
    rates: [
      {
        cost: [
          cost({ input: 10, output: 50, read: 1, write: 12.5 })[0],
          tier(272_000, { input: 20, output: 75, read: 2, write: 25 }),
        ],
      },
    ],
    note: "Cache write at the 30-minute rate; long-context rates apply above 272K input tokens.",
  },
  {
    id: "gpt-6.1-sol",
    provider: "OpenAI",
    name: "GPT-6.1 Sol",
    apiID: "gpt-6.1-sol",
    rates: [
      { cost: [cost({ input: 2, output: 10, read: 0.1, write: 2.5 })[0], tier(272_000, { input: 4, output: 15, read: 0.2, write: 5 })] },
    ],
    note: "Cache write at the 30-minute rate; long-context rates apply above 272K input tokens.",
  },
  {
    id: "gpt-6-luna",
    provider: "OpenAI",
    name: "GPT-6 Luna",
    apiID: "gpt-6-luna",
    rates: [
      {
        cost: [
          cost({ input: 0.1, output: 0.5, read: 0.01, write: 0.125 })[0],
          tier(272_000, { input: 0.2, output: 0.75, read: 0.02, write: 0.25 }),
        ],
      },
    ],
    note: "Cache write at the 30-minute rate; long-context rates apply above 272K input tokens.",
  },
  {
    id: "gpt-5.4-mini",
    provider: "OpenAI",
    name: "GPT-5.4 mini",
    apiID: "gpt-5.4-mini",
    rates: [{ cost: cost({ input: 0.75, output: 4.5, read: 0.075 }) }],
    note: "Caching is implicit and free to write.",
  },
  {
    id: "gemini-4-carbon",
    provider: "Google",
    name: "Gemini 4 Carbon",
    apiID: "gemini-4-carbon",
    rates: [
      { cost: cost({ input: 2, output: 10, read: 0.1 }) },
      { from: utc(2026, 12, 1), cost: cost({ input: 4, output: 20, read: 0.2 }) },
    ],
    note: "Introductory rates end 30 November 2026; every rate doubles on 1 December.",
  },
  {
    id: "gemini-4-argon",
    provider: "Google",
    name: "Gemini 4 Argon",
    apiID: "gemini-4-argon",
    rates: [
      { cost: cost({ input: 2, output: 10, read: 0.1 }) },
      { from: utc(2026, 12, 1), cost: cost({ input: 4, output: 20, read: 0.2 }) },
    ],
    note: "Introductory rates end 30 November 2026; every rate doubles on 1 December.",
  },
  {
    id: "gemini-4-hydrogen",
    provider: "Google",
    name: "Gemini 4 Hydrogen",
    apiID: "gemini-4-hydrogen",
    rates: [{ cost: cost({ input: 1.5, output: 7.5, read: 0.075 }) }],
    note: "Caching is implicit and free to write.",
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "Google",
    name: "Gemini 3.5 Flash-Lite",
    apiID: "gemini-3.5-flash-lite",
    rates: [{ cost: cost({ input: 0.3, output: 2.5, read: 0.03 }) }],
    note: "Caching is implicit and free to write.",
  },
  {
    id: "deepseek-v4-pro",
    provider: "DeepSeek",
    name: "DeepSeek V4 Pro",
    apiID: "deepseek-v4-pro",
    rates: [{ cost: cost({ input: 0.66, output: 1.98, read: 0.022 }) }],
    note: "Off-peak rates; DeepSeek doubles every rate during peak hours.",
  },
  {
    id: "deepseek-flash",
    provider: "DeepSeek",
    name: "DeepSeek V4.1 Flash",
    apiID: "deepseek-flash",
    rates: [{ cost: cost({ input: 0.15, output: 0.6, read: 0.003 }) }],
    note: "Off-peak rates; DeepSeek doubles every rate during peak hours.",
  },
]

/** The rate set in force at `at`, so a scheduled repricing prices each step on the side of the change it ran on. */
export function rates(reference: Pricing.Reference, at: number): Model.Info["cost"] {
  const applicable = reference.rates.filter((entry) => entry.from === undefined || entry.from <= at)
  return (
    applicable.reduce<Pricing.RateSet | undefined>(
      (best, entry) => ((best?.from ?? -Infinity) > (entry.from ?? -Infinity) ? best : entry),
      undefined,
    )?.cost ?? []
  )
}
