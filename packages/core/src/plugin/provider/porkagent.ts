import { Effect, Schema } from "effect"
import { createLocalProviderPlugin } from "./local.js"

// PorkAgent is a hosted LM Studio instance (OpenAI-compatible plus the native /api surface) reached over an
// HTTPS tunnel. It requires a Bearer key on every request and reports prompt-cache hits only on the
// Responses API, so models run through the responses loader rather than the plain chat one. That surface drops
// function_call argument tokens from output_tokens (LM Studio 0.4.28), so models carry the
// usageExcludesToolCallTokens compatibility key to have them estimated back into session totals.
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
  id: "opencode.provider.porkagent",
  providerID: "porkagent",
  name: "PorkAgent",
  origin: "https://api.porkagent.com",
  stripPathSuffix: /\/(?:api\/)?v1$/,
  package: "@opencode/ai/providers/openai-compatible/responses",
  requiresKey: true,
  discover: (client) =>
    Effect.gen(function* () {
      const response = yield* client.getJson("/api/v1/models", Response)
      // Only loaded instances can serve requests; unloaded ones would fail or stall on a load round-trip.
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
    // LM Studio's /v1/responses reports output_tokens equal to reasoning_tokens whenever a function_call is produced;
    // its chat surface counts arguments correctly but the responses loader is required for cache-hit reporting.
    compatibility: { usageExcludesToolCallTokens: true },
  }),
})

export const PorkAgentPlugin = make()
