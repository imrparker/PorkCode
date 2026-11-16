import { Pricing } from "@opencode/schema/pricing"
import { Project } from "@opencode/schema/project"
import { Session } from "@opencode/schema/session"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestError } from "../errors.js"

export const PricingGroup = HttpApiGroup.make("server.pricing")
  .add(
    HttpApiEndpoint.get("pricing.whatIf", "/api/experimental/pricing/what-if", {
      query: Schema.Struct({
        session: Session.ID.pipe(Schema.optional),
        project: Project.ID.pipe(Schema.optional),
        from: Schema.NumberFromString.pipe(Schema.optional),
        to: Schema.NumberFromString.pipe(Schema.optional),
      }),
      success: Schema.Struct({ data: Pricing.WhatIf }),
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.pricing.whatIf",
        summary: "Estimate what usage would have cost on paid models",
        description:
          "Experimental: may change without compatibility guarantees. Prices recorded token usage against the bundled reference rate card of published big-box API prices. Estimates only: token counts come from the models that actually ran, whose tokenizers differ, and only token rates are counted.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "pricing",
      description: "Estimated API cost of local usage on paid reference models.",
    }),
  )
