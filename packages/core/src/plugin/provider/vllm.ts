import { Effect, Exit, Schema } from "effect"
import { HttpClientError } from "effect/http"
import { createLocalProviderPlugin, type LocalDiscoveryClient } from "./local.js"

const providerID = "vllm"

const RemoteModel = Schema.Struct({
  id: Schema.String,
  owned_by: Schema.String,
  max_model_len: Schema.NullOr(Schema.Int),
})

const Response = Schema.Struct({ data: Schema.Array(RemoteModel) })

// vLLM's /v1/models reports no modality, so discovery asks the served model itself: a 1x1 image
// with max_tokens 1 completes on a vision model and is refused by a text-only one. The probe is one
// tiny decode, and each verdict is cached per endpoint, key and model ID, so a steady-state server
// is probed once per served model rather than every discovery cycle.
const PROBE_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC"
const ProbeResponse = Schema.Struct({ id: Schema.String })
const probed = new Map<string, boolean>()
// Refusals that settle modality: the model exists but rejects image input. Auth, rate-limit and
// server errors stay unprobed and retry on the next discovery cycle.
const REFUSALS = [400, 404, 405, 415, 422]

const probeVision = (client: LocalDiscoveryClient, model: string) =>
  Effect.gen(function* () {
    const key = `${client.root}\u0000${client.apiKey ?? ""}\u0000${model}`
    const cached = probed.get(key)
    if (cached !== undefined) return cached
    const attempt = yield* client
      .postJson(
        "/chat/completions",
        Schema.Json,
        {
          model,
          max_tokens: 1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "color" },
                { type: "image_url", image_url: { url: `data:image/png;base64,${PROBE_IMAGE}` } },
              ],
            },
          ],
        },
        ProbeResponse,
      )
      .pipe(
        Effect.as(true),
        Effect.catch((error) =>
          HttpClientError.isHttpClientError(error) &&
          error.reason._tag === "StatusCodeError" &&
          REFUSALS.includes(error.reason.response.status)
            ? Effect.succeed(false)
            : Effect.fail(error),
        ),
        Effect.exit,
      )
    if (Exit.isFailure(attempt)) return false
    probed.set(key, attempt.value)
    return attempt.value
  })

export const make = createLocalProviderPlugin({
  id: "opencode.provider.vllm",
  providerID,
  name: "vLLM",
  origin: "http://127.0.0.1:8000",
  discover: (client) =>
    Effect.gen(function* () {
      yield* client.get("/health")
      const response = yield* client.getJson("/v1/models", Response)
      const models = response.data
        .filter((model) => model.owned_by === providerID && model.id.length > 0)
        .toSorted((a, b) => a.id.localeCompare(b.id))
      return yield* Effect.forEach(models, (model) =>
        probeVision(client, model.id).pipe(Effect.map((vision) => ({ ...model, vision }))),
      )
    }),
  // Tool calling depends on vLLM server flags and parsers that model discovery does not report.
  model: (item) => ({
    id: item.id,
    context: item.max_model_len,
    vision: item.vision,
  }),
})

export const VLLMPlugin = make()
