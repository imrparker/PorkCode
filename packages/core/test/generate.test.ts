import { describe, expect } from "bun:test"
import {
  AIError,
  AuthenticationError,
  HttpContext,
  InvalidRequestError,
  LanguageModel,
  LLMClient,
  ProviderInternalError,
  QuotaExceededError,
  RateLimitError,
  TransportError,
} from "@opencode/ai/effect"
import { RequestExecutor } from "@opencode/ai/route"
import { OpenAIChat } from "@opencode/ai/protocols"
import { TestLLM } from "@opencode/ai/testing"
import { AISDK } from "@opencode/core/aisdk"
import { Credential } from "@opencode/core/credential"
import { Generate } from "@opencode/core/generate"
import { Integration } from "@opencode/core/integration"
import { IntegrationConnection } from "@opencode/core/integration/connection"
import { ModelResolver } from "@opencode/core/model-resolver"
import { ID, Info, Model, Ref, VariantID } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Npm } from "@opencode/util/npm"
import { Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpClient, HttpClientResponse } from "effect/http"
import { testEffect } from "./lib/effect"

const selected = Info.make({
  ...Info.default(Provider.ID.make("test-provider"), ID.make("gemini")),
  package: Provider.aisdk("@ai-sdk/perplexity"),
})
const runtime = LanguageModel.make({ id: "gemini", provider: "test-provider", route: OpenAIChat.route })
const reference = Ref.make({ providerID: selected.providerID, id: selected.id })

const providers = Layer.mock(Provider.Service, {
  get: () => Effect.undefined,
})
const models = Layer.mock(Model.Service, {
  get: () => Effect.succeed(selected),
})
const integrations = Layer.mock(Integration.Service, {
  revision: () => 0,
  connection: {
    active: () => Effect.undefined,
    resolve: () => Effect.die("unused"),
    key: () => Effect.die("unused"),
    external: () => Effect.die("unused"),
    activate: () => Effect.die("unused"),
    update: () => Effect.die("unused"),
    remove: () => Effect.die("unused"),
    status: () => Effect.die("unused"),
  },
  oauth: {
    connect: () => Effect.die("unused"),
    status: () => Effect.die("unused"),
    complete: () => Effect.die("unused"),
    cancel: () => Effect.die("unused"),
  },
  command: {
    connect: () => Effect.die("unused"),
    status: () => Effect.die("unused"),
    cancel: () => Effect.die("unused"),
  },
})
const npm = Layer.mock(Npm.Service, {
  add: () => Effect.die("unused"),
  which: () => Effect.die("unused"),
})
const aisdk = Layer.mock(AISDK.Service, {
  hook: {
    sdk: () => Effect.die("unused"),
    language: () => Effect.die("unused"),
  },
  model: () => Effect.succeed(runtime),
})
const client = TestLLM.testLayer({ fallback: TestLLM.text("OK", "generate") })

const resolver = ModelResolver.layer.pipe(Layer.provide(Layer.mergeAll(providers, models, integrations, npm, aisdk)))
const generateDeps = Layer.mergeAll(models, RequestExecutor.fetchLayer)
const it = testEffect(Generate.layer.pipe(Layer.provide(Layer.mergeAll(resolver, client, generateDeps))))
const resolverIt = testEffect(resolver)
const retryIt = testEffect(
  Generate.layer.pipe(Layer.provideMerge(Layer.mergeAll(resolver, TestLLM.testLayer(), generateDeps))),
)

it.effect("loads dynamic AI SDK models", () =>
  Effect.gen(function* () {
    const generate = yield* Generate.Service
    const result = yield* generate.text({
      prompt: "Return exactly OK",
      model: Ref.make({ providerID: selected.providerID, id: selected.id }),
    })

    expect(result).toBe("OK")
  }),
)

retryIt.effect("retries a stateless call the provider never received", () =>
  Effect.gen(function* () {
    const generate = yield* Generate.Service
    const llm = yield* TestLLM.Test
    yield* llm.push(
      TestLLM.failAfter(
        new AIError({
          reason: new TransportError({
            message: "connect ECONNREFUSED",
            transport: "http",
            operation: "request",
            code: "ECONNREFUSED",
          }),
        }),
      ),
      TestLLM.text("Fresh answer", "success"),
    )
    const result = yield* generate
      .text({ prompt: "Answer privately", model: reference })
      .pipe(Effect.forkChild({ startImmediately: true }))
    yield* llm.wait(1)
    yield* TestClock.adjust("3 seconds")
    expect(yield* Fiber.join(result)).toBe("Fresh answer")
    const requests = yield* llm.requests()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toBe(requests[0])
  }),
)

// The provider may already have run (and billed) these, so a one-shot call doesn't repeat them.
for (const reason of [
  new TransportError({ message: "Disconnected", transport: "http", operation: "read" }),
  new TransportError({ message: "Timed out", transport: "http", operation: "request", code: "Timeout" }),
  new ProviderInternalError({ message: "Internal error" }),
]) {
  retryIt.effect(`does not retry a stateless ${reason._tag} failure the provider may have run`, () =>
    Effect.gen(function* () {
      const generate = yield* Generate.Service
      const llm = yield* TestLLM.Test
      yield* llm.always(TestLLM.failAfter(new AIError({ reason })))
      yield* generate.text({ prompt: "Answer privately", model: reference }).pipe(Effect.flip)
      expect(yield* llm.requests()).toHaveLength(1)
    }),
  )
}

for (const [reason, expected] of [
  [
    new AuthenticationError({ message: "Invalid credentials" }),
    { _tag: "Generate.ProviderRequestError", reason: "authentication" },
  ],
  [new QuotaExceededError({ message: "No quota" }), { _tag: "Generate.ProviderRequestError", reason: "rate_limit" }],
  [new InvalidRequestError({ message: "Invalid prompt" }), { _tag: "Generate.InvalidRequestError" }],
] as const) {
  retryIt.effect(`does not retry stateless ${reason._tag} failures`, () =>
    Effect.gen(function* () {
      const generate = yield* Generate.Service
      const llm = yield* TestLLM.Test
      yield* llm.push(TestLLM.failAfter(new AIError({ reason })))
      const result = yield* generate.text({ prompt: "Answer privately", model: reference }).pipe(Effect.flip)
      expect(result).toMatchObject({ ...expected, message: reason.message })
      expect(yield* llm.requests()).toHaveLength(1)
    }),
  )
}

retryIt.effect("honors provider backoff and cancels without another generation", () =>
  Effect.gen(function* () {
    const generate = yield* Generate.Service
    const llm = yield* TestLLM.Test
    yield* llm.always(
      TestLLM.failAfter(new AIError({ reason: new RateLimitError({ message: "Wait", retryAfterMs: 5_000 }) })),
    )
    const result = yield* generate
      .text({ prompt: "Answer privately", model: reference })
      .pipe(Effect.forkChild({ startImmediately: true }))
    yield* llm.wait(1)
    yield* TestClock.adjust("4999 millis")
    expect(yield* llm.requests()).toHaveLength(1)
    yield* Fiber.interrupt(result)
    yield* TestClock.adjust("1 minute")
    expect(Exit.hasInterrupts(yield* Fiber.await(result))).toBe(true)
    expect(yield* llm.requests()).toHaveLength(1)
  }),
)

retryIt.effect("retries an overloaded provider at most three times", () =>
  Effect.gen(function* () {
    const generate = yield* Generate.Service
    const llm = yield* TestLLM.Test
    const overloaded = new ProviderInternalError({
      message: "Overloaded",
      http: new HttpContext({ url: "https://provider.example/v1", status: 529, headers: {} }),
    })
    yield* llm.always(TestLLM.failAfter(new AIError({ reason: overloaded })))
    const result = yield* generate
      .text({ prompt: "Answer privately", model: reference })
      .pipe(Effect.flip, Effect.forkChild({ startImmediately: true }))
    yield* llm.wait(1)
    yield* TestClock.adjust("2 minutes")
    expect(yield* Fiber.join(result)).toMatchObject({ _tag: "Generate.ProviderRequestError", reason: "overloaded" })
    expect(yield* llm.requests()).toHaveLength(4)
  }),
)

resolverIt.effect("resolves dynamic models with their catalog metadata", () =>
  Effect.gen(function* () {
    const resolver = yield* ModelResolver.Service
    const result = yield* resolver.resolve(Ref.make({ providerID: selected.providerID, id: selected.id }))

    expect(result).toEqual({
      model: runtime,
      ref: Ref.make({ providerID: selected.providerID, id: selected.id }),
      capabilities: selected.capabilities,
      cost: selected.cost,
      limit: selected.limit,
    })
  }),
)

testEffect(Layer.empty).effect("attributes each stateless completion without creating a stored session", () =>
  Effect.gen(function* () {
    const sessions: string[] = []
    const http = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          const session = request.headers["x-opencode-session"]
          if (!session)
            return HttpClientResponse.fromWeb(
              request,
              Response.json(
                {
                  error: { type: "MissingSessionID", message: "Session ID is required" },
                },
                { status: 400 },
              ),
            )
          sessions.push(session)
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              `data: ${JSON.stringify({
                id: "completion",
                object: "chat.completion.chunk",
                created: 1,
                model: "gemini",
                choices: [{ index: 0, delta: { content: "OK" }, finish_reason: "stop" }],
              })}\n\ndata: [DONE]\n\n`,
              { headers: { "content-type": "text/event-stream" } },
            ),
          )
        }),
      ),
    )
    const executor = RequestExecutor.layer.pipe(Layer.provide(http))
    const native = LLMClient.layer.pipe(Layer.provide(executor))
    yield* Effect.gen(function* () {
      const generate = yield* Generate.Service
      for (let index = 0; index < 2; index++) {
        expect(
          yield* generate.text({
            prompt: "Return exactly OK",
            model: Ref.make({ providerID: selected.providerID, id: selected.id }),
          }),
        ).toBe("OK")
      }
    }).pipe(Effect.provide(Generate.layer.pipe(Layer.provide(Layer.mergeAll(resolver, native, models, executor)))))
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toStartWith("ses_")
    expect(sessions[1]).not.toBe(sessions[0])
  }),
)

describe("image generation", () => {
  const catalog = [
    Info.make({
      ...Info.default(Provider.ID.openai, ID.make("gpt-image-1-mini")),
      type: "image",
      package: "@opencode/ai/providers/openai-compatible/images",
      settings: { baseURL: "https://img.test/v1" },
    }),
    Info.make({
      ...Info.default(Provider.ID.opencode, ID.make("gpt-image-2.5-sunburst")),
      type: "image",
      package: "@opencode/ai/providers/openai-compatible/images",
      settings: { baseURL: "https://img.test/v1" },
    }),
    Info.make({
      ...Info.default(Provider.ID.make("zai"), ID.make("glm-image")),
      type: "image",
      package: "@opencode/ai/providers/openai-compatible/images",
      settings: { baseURL: "https://gen.z.test/v4" },
    }),
    Info.make({
      ...Info.default(Provider.ID.openai, ID.make("gpt-5")),
      package: "@opencode/ai/providers/openai-compatible",
    }),
    Info.make({
      ...Info.default(Provider.ID.make("acme"), ID.make("flux-dev")),
      type: "image",
      package: "@opencode/ai/providers/openai-compatible/images",
      settings: { baseURL: "https://reject.test/v1" },
      variants: [{ id: VariantID.make("high"), body: { quality: "hd" } }],
    }),
  ]
  const mediaProviders = Layer.mock(Provider.Service, {
    get: (providerID) =>
      Effect.succeed(
        Provider.Info.make({
          ...Provider.Info.empty(providerID),
          activation: "enabled",
          settings: { apiKey: `${providerID}-key` },
        }),
      ),
  })
  const mediaModels = Layer.mock(Model.Service, {
    get: (providerID, modelID) =>
      Effect.succeed(
        catalog.find(
          (model) => (model.type ?? "chat") === "chat" && model.providerID === providerID && model.id === modelID,
        ),
      ),
    available: (types) => Effect.succeed(catalog.filter((model) => (types ?? ["chat"]).includes(model.type ?? "chat"))),
  })
  // An OpenCode Console login keeps its server and organization as credential metadata.
  const mediaIntegrations = Layer.mock(Integration.Service, {
    revision: () => 0,
    connection: {
      active: (id) =>
        Effect.succeed(
          id === Integration.ID.make("opencode")
            ? IntegrationConnection.CredentialInfo.make({
                type: "credential",
                id: Credential.ID.make("console"),
                label: "Acme",
                method: "oauth",
              })
            : undefined,
        ),
      resolve: () =>
        Effect.succeed(
          Credential.OAuth.make({
            type: "oauth",
            methodID: Integration.MethodID.make("device"),
            access: "console-token",
            refresh: "refresh",
            expires: Number.MAX_SAFE_INTEGER,
            metadata: { server: "https://console.example", orgID: "org_123", orgName: "Acme" },
          }),
        ),
      key: () => Effect.die("unused"),
      external: () => Effect.die("unused"),
      activate: () => Effect.die("unused"),
      update: () => Effect.die("unused"),
      remove: () => Effect.die("unused"),
      status: () => Effect.die("unused"),
    },
    oauth: {
      connect: () => Effect.die("unused"),
      status: () => Effect.die("unused"),
      complete: () => Effect.die("unused"),
      cancel: () => Effect.die("unused"),
    },
    command: {
      connect: () => Effect.die("unused"),
      status: () => Effect.die("unused"),
      cancel: () => Effect.die("unused"),
    },
  })
  const requests: { url: string; headers: Record<string, string>; body: unknown }[] = []
  const http = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.gen(function* () {
        const text = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
        requests.push({ url: request.url, headers: request.headers, body: text ? JSON.parse(text) : undefined })
        if (request.url === "https://images.example/fox") return HttpClientResponse.fromWeb(request, new Response(PNG))
        if (request.url === "https://gen.z.test/v4/images/generations")
          return HttpClientResponse.fromWeb(
            request,
            Response.json({ created: 1, data: [{ url: "https://images.example/fox" }] }),
          )
        if (request.url === "https://img.test/v1/images/generations")
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              data: [{ b64_json: "aW1hZ2U=" }],
              output_format: "png",
              usage: { input_tokens: 9, output_tokens: 272 },
            }),
          )
        return HttpClientResponse.fromWeb(
          request,
          Response.json({ error: { message: "Bad request" } }, { status: 400 }),
        )
      }),
    ),
  )
  const executor = RequestExecutor.layer.pipe(Layer.provide(http))
  const mediaResolver = ModelResolver.layer.pipe(
    Layer.provide(Layer.mergeAll(mediaProviders, mediaModels, mediaIntegrations, npm, aisdk)),
  )
  const mediaIt = testEffect(
    Generate.layer.pipe(Layer.provide(Layer.mergeAll(mediaResolver, client, mediaModels, executor))),
  )
  const ref = (providerID: string, id: string, variant?: string) =>
    Ref.make({
      providerID: Provider.ID.make(providerID),
      id: ID.make(id),
      ...(variant ? { variant: VariantID.make(variant) } : {}),
    })

  mediaIt.effect("generates images through the model's image entrypoint with the provider key", () =>
    Effect.gen(function* () {
      requests.length = 0
      const generate = yield* Generate.Service
      const result = yield* generate.image({ model: ref("openai", "gpt-image-1-mini"), prompt: "A black circle" })
      expect(requests[0]).toMatchObject({
        url: "https://img.test/v1/images/generations",
        headers: { authorization: "Bearer openai-key" },
        body: { model: "gpt-image-1-mini", prompt: "A black circle" },
      })
      // The HTTP response schema only accepts plain JSON, so nothing may be undefined.
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result)
      expect(result).toMatchObject({
        images: [{ type: "image", data: "aW1hZ2U=", mime: "image/png" }],
        tokens: { input: 9, output: 272 },
      })
    }),
  )

  mediaIt.effect("keeps credential metadata out of image requests", () =>
    Effect.gen(function* () {
      requests.length = 0
      const generate = yield* Generate.Service
      yield* generate.image({ model: ref("opencode", "gpt-image-2.5-sunburst"), prompt: "A black circle" })
      expect(requests[0]).toMatchObject({
        url: "https://img.test/v1/images/generations",
        headers: { authorization: "Bearer console-token" },
      })
      expect(requests[0]?.body).toStrictEqual({ model: "gpt-image-2.5-sunburst", prompt: "A black circle" })
    }),
  )

  mediaIt.effect("downloads URL images and detects their type from the bytes", () =>
    Effect.gen(function* () {
      const generate = yield* Generate.Service
      const result = yield* generate.image({ model: ref("zai", "glm-image"), prompt: "A fox" })
      expect(result.images).toEqual([{ type: "image", data: Buffer.from(PNG).toString("base64"), mime: "image/png" }])
    }),
  )

  mediaIt.effect("sends a variant's body overlay and maps provider rejections", () =>
    Effect.gen(function* () {
      requests.length = 0
      const generate = yield* Generate.Service
      const error = yield* generate
        .image({ model: ref("acme", "flux-dev", "high"), prompt: "A black circle" })
        .pipe(Effect.flip)
      expect(requests[0]?.body).toMatchObject({ model: "flux-dev", quality: "hd" })
      expect(error).toMatchObject({ _tag: "Generate.ProviderRequestError", reason: "invalid_request", status: 400 })
    }),
  )

  mediaIt.effect("rejects models of another type and unknown models", () =>
    Effect.gen(function* () {
      const generate = yield* Generate.Service
      const chat = yield* generate.image({ model: ref("openai", "gpt-5"), prompt: "x" }).pipe(Effect.flip)
      expect(chat._tag).toBe("Generate.UnsupportedModelError")
      const image = yield* generate
        .decisions({
          model: ref("openai", "gpt-image-1-mini"),
          input: [],
          questions: [{ type: "predicate", name: "a", instructions: "?" }],
        })
        .pipe(Effect.flip)
      expect(image._tag).toBe("Generate.UnsupportedModelError")
      const unknown = yield* generate.image({ model: ref("openai", "nope"), prompt: "x" }).pipe(Effect.flip)
      expect(unknown._tag).toBe("Generate.ModelNotFoundError")
      const text = yield* generate.text({ model: ref("openai", "gpt-image-1-mini"), prompt: "x" }).pipe(Effect.flip)
      expect(text._tag).toBe("Generate.UnsupportedModelError")
      const unknownText = yield* generate.text({ model: ref("openai", "nope"), prompt: "x" }).pipe(Effect.flip)
      expect(unknownText._tag).toBe("Generate.ModelNotFoundError")
    }),
  )
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
