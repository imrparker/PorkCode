import { Duration, Effect, Option, Schema, Stream } from "effect"
import { HttpClientError, HttpClientResponse } from "effect/http"
import { createLocalProviderPlugin, type LocalDiscoveryClient } from "./local.js"

const providerID = "vllm"

const RemoteModel = Schema.Struct({
  id: Schema.String,
  owned_by: Schema.String,
  max_model_len: Schema.NullOr(Schema.Int),
})

const Response = Schema.Struct({ data: Schema.Array(RemoteModel) })

// vLLM's /v1/models reports no modality, so discovery asks the served model itself: a 1x1 image with
// max_tokens 1 completes on a vision model and is refused by a text-only one (vLLM 0.33 answers 400
// "Multi-modal processor not available for text-only models"). The probe is one tiny decode, and each
// definitive verdict is cached per endpoint, key and model ID, so a steady-state server is probed once
// per served model rather than every discovery cycle.
const PROBE_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC"
// The shared discovery budget (1 s on loopback) is too tight for a cold first decode.
const PROBE_TIMEOUT = Duration.seconds(10)
// A 2xx with a readable completion settles "vision". A refusal that names the modality settles
// "no vision". Anything else — a model that is not loaded (404), an unrelated 400, rate limits,
// server errors, timeouts — leaves the question open, so the previously published verdict stands
// and the next discovery cycle retries.
const MODALITY_REFUSAL = /text-only|multimodal|multi-modal|unexpected item type|vision|image/i
// Definitive verdicts only; bounded so endpoint churn cannot grow the map without limit.
const VERDICTS_MAX = 128
const verdicts = new Map<string, boolean>()
const ProbeImagePart = Schema.Struct({
  type: Schema.Literal("image_url"),
  image_url: Schema.Struct({ url: Schema.String }),
})
const ProbeTextPart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const ProbeRequest = Schema.Struct({
  model: Schema.String,
  max_tokens: Schema.Literal(1),
  stream: Schema.Literal(false),
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literal("user"),
      content: Schema.Array(Schema.Union([ProbeTextPart, ProbeImagePart])),
    }),
  ),
})
const ProbeResponse = Schema.Struct({ id: Schema.String })
const ErrorBody = Schema.Struct({
  error: Schema.Struct({ message: Schema.String.pipe(Schema.optional) }).pipe(Schema.optional),
})

export type ProbeVerdict = boolean | "unknown"

/** Settles the modality question from a probe outcome; everything unsettled stays open for the next cycle. */
export const classifyProbe = (status: number | undefined, message: string | undefined): ProbeVerdict => {
  if (status === undefined) return "unknown"
  if (status >= 200 && status < 300) return true
  if (status === 400 || status === 415 || status === 422)
    return message !== undefined && MODALITY_REFUSAL.test(message) ? false : "unknown"
  return "unknown"
}

/** The server's error message for a refused probe, or the raw body when it is not OpenAI error JSON. */
const refusalMessage = (response: HttpClientResponse.HttpClientResponse) =>
  Stream.decodeText(response.stream).pipe(
    Stream.mkString,
    Effect.map((text) => {
      const trimmed = text.trim()
      if (trimmed === "") return undefined
      const decoded = Schema.decodeUnknownOption(ErrorBody)(trimmed)
      if (Option.isSome(decoded)) {
        const message = decoded.value.error?.message
        if (message !== undefined && message !== "") return message
      }
      return trimmed
    }),
    Effect.catchIf(() => true, () => Effect.succeed(undefined)),
  )

/** Asks one served model whether it accepts image input; undefined means the question is still open. */
const probeVision = (client: LocalDiscoveryClient, model: string) =>
  Effect.gen(function* () {
    const key = `${client.root}\u0000${client.apiKey ?? ""}\u0000${model}`
    const cached = verdicts.get(key)
    if (cached !== undefined) return cached
    const attempt: ProbeVerdict = yield* client
      .postJson(
        "/v1/chat/completions",
        ProbeRequest,
        {
          model,
          max_tokens: 1,
          stream: false,
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
        PROBE_TIMEOUT,
      )
      .pipe(
        Effect.as(true),
        Effect.catchIf(() => true, (error) => {
          const response = HttpClientError.isHttpClientError(error) ? error.response : undefined
          if (response === undefined) return Effect.succeed<ProbeVerdict>("unknown")
          return refusalMessage(response).pipe(Effect.map((message) => classifyProbe(response.status, message)))
        }),
      )
    if (attempt !== "unknown") {
      if (verdicts.size >= VERDICTS_MAX) {
        const oldest = verdicts.keys().next().value
        if (oldest !== undefined) verdicts.delete(oldest)
      }
      verdicts.set(key, attempt)
    }
    // An unsettled question keeps the verdict published before it, if any.
    return verdicts.get(key)
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
  // Tool calling depends on vLLM server flags and parsers that model discovery does not report; vision
  // comes from the discovery probe, since /v1/models carries no modality.
  model: (item) => ({
    id: item.id,
    context: item.max_model_len,
    vision: item.vision,
  }),
})

export const VLLMPlugin = make()
