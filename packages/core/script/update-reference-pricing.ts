#!/usr/bin/env bun
/**
 * Prints the bundled reference rate card (src/pricing/rate-card.ts) as a Markdown table so a maintainer can
 * diff it against the vendors' published price lists. There is no machine-readable endpoint to fetch from:
 * edit `references` and bump `asOf` by hand when prices move, then re-run this to review the result.
 */
import { PricingRateCard } from "../src/pricing/rate-card"

const usd = (value: number) => `$${value}`

console.log(`Reference rates last checked ${new Date(PricingRateCard.asOf).toISOString().slice(0, 10)}.\n`)
console.log("| Model | Provider | In | Out | Cache read | Cache write | Notes |")
console.log("| --- | --- | --- | --- | --- | --- | --- |")
for (const reference of PricingRateCard.references) {
  for (const [index, set] of reference.rates.entries()) {
    const effective = set.from === undefined ? "" : `from ${new Date(set.from).toISOString().slice(0, 10)}: `
    for (const cost of set.cost) {
      const tier = cost.tier ? `over ${cost.tier.size.toLocaleString()} prompt tokens: ` : ""

      console.log(
        `| ${index === 0 ? reference.name : ""} | ${index === 0 ? reference.provider : ""} | ` +
          `${usd(cost.input)} | ${usd(cost.output)} | ${usd(cost.cache.read)} | ${usd(cost.cache.write)} | ` +
          `${effective}${tier}${index === 0 ? (reference.note ?? "") : ""} |`,
      )
    }
  }
}
