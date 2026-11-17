export * as Pricing from "./pricing.js"

import { Schema } from "effect"
import { Model } from "./model.js"
import { Money } from "./money.js"
import { NonNegativeInt, optional } from "./schema.js"
import { TokenUsage } from "./token-usage.js"

/**
 * One published rate set of a reference model. `from` is when the rates take effect as epoch milliseconds, so a
 * vendor's scheduled repricing stays priced correctly on both sides of the change; omitted means the oldest set.
 */
export interface RateSet extends Schema.Schema.Type<typeof RateSet> {}
export const RateSet = Schema.Struct({
  from: Schema.Finite.pipe(optional),
  cost: Schema.Array(Model.Cost),
}).annotate({ identifier: "Pricing.RateSet" })

/** A paid model in the bundled reference rate card, priced at its published API rates. */
export interface Reference extends Schema.Schema.Type<typeof Reference> {}
export const Reference = Schema.Struct({
  id: Schema.NonEmptyString,
  provider: Schema.String,
  name: Schema.String,
  /** The vendor's own model identifier, as in `claude-sonnet-5.5`. */
  apiID: Schema.String,
  rates: Schema.Array(RateSet),
  /** Anything a reader needs to interpret the rate, such as "off-peak rates; peak is double". */
  note: Schema.String.pipe(optional),
}).annotate({ identifier: "Pricing.Reference" })

/** What the priced usage would have cost on one reference model. */
export interface Comparison extends Schema.Schema.Type<typeof Comparison> {}
export const Comparison = Schema.Struct({
  reference: Reference,
  cost: Money.USD,
}).annotate({ identifier: "Pricing.Comparison" })

/**
 * Estimated API cost of local usage on every reference model. Estimates only: token counts come from the
 * models that actually ran, whose tokenizers differ from a reference model's, and only token rates are counted.
 */
export interface WhatIf extends Schema.Schema.Type<typeof WhatIf> {}
export const WhatIf = Schema.Struct({
  /** When every bundled rate was last checked against the vendor's published price list, as epoch milliseconds. */
  asOf: Schema.Finite,
  steps: NonNegativeInt,
  tokens: TokenUsage.Info,
  comparisons: Schema.Array(Comparison),
}).annotate({ identifier: "Pricing.WhatIf" })
