import { PricingWhatIf } from "@opencode/core/pricing/what-if"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { InvalidRequestError } from "@opencode/protocol/errors"
import { Api } from "../api"

export const PricingHandler = HttpApiBuilder.group(Api, "server.pricing", (handlers) =>
  Effect.gen(function* () {
    return handlers.handle("pricing.whatIf", Effect.fn(function* (ctx) {
      return {
        data: yield* PricingWhatIf.get({
          sessionID: ctx.query.session,
          projectID: ctx.query.project,
          from: ctx.query.from,
          to: ctx.query.to,
        }).pipe(Effect.mapError(() => new InvalidRequestError({ message: "Price range must end after it starts" }))),
      }
    }))
  }),
)
