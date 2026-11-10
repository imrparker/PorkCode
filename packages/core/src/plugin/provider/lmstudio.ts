import { Effect, Schema } from "effect"
import { createLocalProviderPlugin } from "./local.js"

const RemoteModel = Schema.Struct({
  type: Schema.Literals(["llm", "embedding"]),
  key: Schema.String,
  display_name: Schema.String,
  architecture: Schema.NullOr(Schema.String).pipe(Schema.optional),
  loaded_instances: Schema.Array(
    Schema.Struct({
      config: Schema.Struct({ context_length: Schema.Int }),
    }),
  ),
  max_context_length: Schema.Int,
  capabilities: Schema.Struct({
    vision: Schema.Boolean,
    trained_for_tool_use: Schema.Boolean,
  }).pipe(Schema.optional),
})

const Response = Schema.Struct({ models: Schema.Array(RemoteModel) })

export const make = createLocalProviderPlugin({
  id: "opencode.provider.lmstudio",
  providerID: "lmstudio",
  name: "LM Studio",
  origin: "http://127.0.0.1:1234",
  stripPathSuffix: /\/(?:api\/)?v1$/,
  discover: (client) =>
    Effect.gen(function* () {
      const response = yield* client.getJson("/api/v1/models", Response)
      // LM Studio lists every downloaded model, but only loaded instances can serve requests; unloaded ones would
      // fail or stall on a load round-trip. The poll picks models up within the interval once they are loaded.
      return response.models
        .filter((model) => model.type === "llm" && model.key.length > 0 && model.loaded_instances.length > 0)
        .toSorted((a, b) => a.key.localeCompare(b.key))
    }),
  model: (item) => ({
    id: item.key,
    name: item.display_name || item.key,
    family: item.architecture,
    tools: item.capabilities?.trained_for_tool_use,
    vision: item.capabilities?.vision,
    context: Math.min(...item.loaded_instances.map((instance) => instance.config.context_length)),
  }),
})

export const LMStudioPlugin = make()
