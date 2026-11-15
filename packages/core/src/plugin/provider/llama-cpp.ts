import { Effect, Schema } from "effect"
import { createLocalProviderPlugin } from "./local.js"

const RemoteModel = Schema.Struct({
  id: Schema.String,
})

// llama-server answers /v1/models with `models` (not OpenAI's `data`) and reports no per-model
// capabilities; tool support depends on the --jinja launch flag and vision on a projector file.
const Response = Schema.Struct({ models: Schema.Array(RemoteModel) })

export const make = createLocalProviderPlugin({
  id: "opencode.provider.llama-cpp",
  providerID: "llamacpp",
  name: "llama.cpp",
  origin: "http://127.0.0.1:8080",
  discover: (client) =>
    Effect.gen(function* () {
      const response = yield* client.getJson("/v1/models", Response)
      return response.models.filter((model) => model.id.length > 0).toSorted((a, b) => a.id.localeCompare(b.id))
    }),
  // Agents are llama.cpp's main use here, so models advertise tool support; a server started without
  // --jinja ignores the tools parameter and answers in plain text rather than failing.
  model: (item) => ({
    id: item.id,
    tools: true,
  }),
})

export const LlamaCppPlugin = make()
