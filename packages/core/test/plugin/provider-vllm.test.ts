import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Integration } from "@opencode/core/integration"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { make, VLLMPlugin, classifyProbe } from "@opencode/core/plugin/provider/vllm"
import { Provider } from "@opencode/core/provider"
import { Document, Event, Info } from "@opencode/schema/config"
import { describe, expect, test } from "bun:test"
import { Duration, Effect, Layer, Schema } from "effect"
import { eventually } from "../lib/eventually"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(Layer.merge(PluginTestLayer, Config.testLayer()))
const decode = Schema.decodeUnknownSync(Info)

const addPlugin = Effect.fn(function* (origin: string, interval: Duration.Input = "1 hour") {
  const plugin = yield* Plugin.Service
  const host = yield* PluginHost.make(plugin, "test")
  yield* make(origin, interval).effect(host)
})

const remoteModel = (id: string, max_model_len = 32_768, owned_by = "vllm") => ({
  id,
  object: "model",
  created: 1,
  owned_by,
  root: id,
  parent: null,
  max_model_len,
  permission: [],
})

describe("VLLMPlugin", () => {
  it.live("waits for readiness and discovers official vLLM model metadata", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const state = { healthy: false, models: 0, probes: 0 }
        return {
          state,
          server: Bun.serve({
            port: 0,
            fetch: (request) => {
              const path = new URL(request.url).pathname
              if (path === "/health") return new Response(null, { status: state.healthy ? 200 : 503 })
              if (request.method === "POST" && path === "/v1/chat/completions") {
                state.probes++
                return Response.json({ id: "cmpl-probe", object: "chat.completion" })
              }
              state.models++
              return Response.json({
                object: "list",
                data: [
                  remoteModel("Qwen/Qwen3-Coder", 65_536),
                  remoteModel("unknown-limit", 0),
                  remoteModel("foreign-model", 4096, "other"),
                ],
              })
            },
          }),
        }
      }),
      ({ state, server }) =>
        Effect.gen(function* () {
          const providers = yield* Provider.Service
          const modelState = yield* Model.Service
          const providerID = Provider.ID.make("vllm")
          expect(VLLMPlugin.id).toBe("opencode.provider.vllm")
          expect(ProviderPlugins.map((item) => item.id)).toContain("opencode.provider.vllm")
          yield* addPlugin(server.url.origin, "5 millis")
          yield* Effect.promise(() => Bun.sleep(20))
          expect(yield* providers.get(providerID)).toBeUndefined()
          expect(state.models).toBe(0)

          state.healthy = true
          const model = yield* eventually(
            modelState.get(providerID, Model.ID.make("Qwen/Qwen3-Coder")),
            (item) => item !== undefined,
          )
          expect(yield* providers.get(providerID)).toEqual({
            id: providerID,
            name: "vLLM",
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `${server.url.origin}/v1`, provider: "vllm", apiKey: "" },
            activation: "enabled",
          })
          expect((yield* providers.available()).map((provider) => provider.id)).toContain(providerID)
          expect(model).toMatchObject({
            modelID: "Qwen/Qwen3-Coder",
            name: "Qwen/Qwen3-Coder",
            capabilities: { tools: false, input: ["text", "image"], output: ["text"] },
            limit: { context: 65_536, output: 32_000 },
          })
          expect(yield* modelState.get(providerID, Model.ID.make("unknown-limit"))).toMatchObject({
            limit: { context: 200_000, output: 32_000 },
          })
          expect(yield* modelState.get(providerID, Model.ID.make("foreign-model"))).toBeUndefined()
          // Both served models are probed once; the verdicts are cached, so refreshes stop probing.
          expect(state.probes).toBe(2)
          yield* Effect.promise(() => Bun.sleep(20))
          expect(state.probes).toBe(2)
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  it.live("keeps models text-only and caches the verdict when the vision probe is refused", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const state = { probes: 0 }
        return {
          state,
          server: Bun.serve({
            port: 0,
            fetch: (request) => {
              const path = new URL(request.url).pathname
              if (path === "/health") return new Response()
              if (request.method === "POST" && path === "/v1/chat/completions") {
                state.probes++
                return new Response(
                  JSON.stringify({
                    error: {
                      message: "Multi-modal processor not available for text-only models",
                      type: "BadRequestError",
                      code: 400,
                    },
                  }),
                  { status: 400, headers: { "content-type": "application/json" } },
                )
              }
              return Response.json({ object: "list", data: [remoteModel("text-only-model")] })
            },
          }),
        }
      }),
      ({ state, server }) =>
        Effect.gen(function* () {
          const modelState = yield* Model.Service
          const providerID = Provider.ID.make("vllm")
          yield* addPlugin(server.url.origin, "5 millis")
          const model = yield* eventually(
            modelState.get(providerID, Model.ID.make("text-only-model")),
            (item) => item !== undefined,
          )
          expect(model).toMatchObject({
            modelID: "text-only-model",
            capabilities: { tools: false, input: ["text"], output: ["text"] },
          })
          // A definitive refusal is cached per endpoint and model, so refreshes stop probing.
          yield* Effect.promise(() => Bun.sleep(20))
          expect(state.probes).toBe(1)
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  it.live("keeps models text-only and keeps retrying while the vision probe stays unsettled", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const state = { probes: 0 }
        return {
          state,
          server: Bun.serve({
            port: 0,
            fetch: (request) => {
              const path = new URL(request.url).pathname
              if (path === "/health") return new Response()
              if (request.method === "POST" && path === "/v1/chat/completions") {
                state.probes++
                // A model that is not loaded (or a proxy 404) settles nothing.
                return new Response(JSON.stringify({ error: { message: "The model does not exist" } }), {
                  status: 404,
                  headers: { "content-type": "application/json" },
                })
              }
              return Response.json({ object: "list", data: [remoteModel("unloaded-model")] })
            },
          }),
        }
      }),
      ({ state, server }) =>
        Effect.gen(function* () {
          const modelState = yield* Model.Service
          const providerID = Provider.ID.make("vllm")
          yield* addPlugin(server.url.origin, "5 millis")
          const model = yield* eventually(
            modelState.get(providerID, Model.ID.make("unloaded-model")),
            (item) => item !== undefined,
          )
          expect(model).toMatchObject({
            modelID: "unloaded-model",
            capabilities: { tools: false, input: ["text"], output: ["text"] },
          })
          // An unsettled verdict is not cached, so the next discovery cycle retries the probe.
          const before = state.probes
          yield* Effect.promise(() => Bun.sleep(30))
          expect(state.probes).toBeGreaterThan(before)
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  it.live("keeps a confirmed vision capability through transient probe failures", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const state = { probes: 0, answering: true }
        return {
          state,
          server: Bun.serve({
            port: 0,
            fetch: (request) => {
              const path = new URL(request.url).pathname
              if (path === "/health") return new Response()
              if (request.method === "POST" && path === "/v1/chat/completions") {
                state.probes++
                if (!state.answering) return new Response("overloaded", { status: 503 })
                return Response.json({ id: "cmpl-probe", object: "chat.completion" })
              }
              return Response.json({ object: "list", data: [remoteModel("vision-model")] })
            },
          }),
        }
      }),
      ({ state, server }) =>
        Effect.gen(function* () {
          const modelState = yield* Model.Service
          const providerID = Provider.ID.make("vllm")
          yield* addPlugin(server.url.origin, "5 millis")
          const model = yield* eventually(
            modelState.get(providerID, Model.ID.make("vision-model")),
            (item) => item !== undefined,
          )
          expect(model).toMatchObject({ capabilities: { input: ["text", "image"] } })

          // A 5xx settles nothing; the confirmed verdict stands instead of flipping to text-only.
          state.answering = false
          yield* Effect.promise(() => Bun.sleep(30))
          expect(yield* modelState.get(providerID, Model.ID.make("vision-model"))).toMatchObject({
            capabilities: { input: ["text", "image"] },
          })
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  it.live("refreshes inventory while retaining the last success through transient failures", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const state = { failing: false, models: [remoteModel("first-model")] }
        return {
          state,
          server: Bun.serve({
            port: 0,
            fetch: (request) => {
              if (state.failing) return new Response(null, { status: 503 })
              if (new URL(request.url).pathname === "/health") return new Response()
              return Response.json({ object: "list", data: state.models })
            },
          }),
        }
      }),
      ({ state, server }) =>
        Effect.gen(function* () {
          const modelState = yield* Model.Service
          const providerID = Provider.ID.make("vllm")
          yield* addPlugin(server.url.origin, "5 millis")
          yield* eventually(modelState.get(providerID, Model.ID.make("first-model")), (model) => model !== undefined)

          state.failing = true
          state.models = [remoteModel("second-model")]
          yield* Effect.promise(() => Bun.sleep(30))
          expect(yield* modelState.get(providerID, Model.ID.make("first-model"))).toBeDefined()
          expect(yield* modelState.get(providerID, Model.ID.make("second-model"))).toBeUndefined()

          state.failing = false
          yield* eventually(modelState.get(providerID, Model.ID.make("second-model")), (model) => model !== undefined)
          expect(yield* modelState.get(providerID, Model.ID.make("first-model"))).toBeUndefined()
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  it.live("replaces and restores same-ID Models.dev entries after an empty success", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const models = [remoteModel("discovered-model")]
        return {
          models,
          server: Bun.serve({
            port: 0,
            fetch: (request) =>
              new URL(request.url).pathname === "/health"
                ? new Response()
                : Response.json({ object: "list", data: models }),
          }),
        }
      }),
      ({ models, server }) =>
        Effect.gen(function* () {
          const providers = yield* Provider.Service
          const modelState = yield* Model.Service
          const integrations = yield* Integration.Service
          const providerID = Provider.ID.make("vllm")
          yield* integrations.transform((editor) => {
            editor.update(Integration.ID.make("vllm"), (integration) => {
              integration.name = "vLLM"
            })
            editor.method.update({
              integrationID: Integration.ID.make("vllm"),
              method: { type: "env", names: ["VLLM_API_KEY"] },
            })
          })
          yield* providers.transform((editor) => {
            editor.update(providerID, (provider) => {
              provider.name = "vLLM"
              provider.package = "@opencode/ai/providers/openai-compatible"
              provider.integrationID = Integration.ID.make("vllm")
              provider.activation = "auto"
            })
            editor.models.update(providerID, Model.ID.make("static-model"), () => {})
          })

          yield* addPlugin(server.url.origin, "5 millis")
          yield* eventually(
            modelState.get(providerID, Model.ID.make("discovered-model")),
            (model) => model !== undefined,
          )
          // The plugin keeps its own key-method integration registered so Settings can list the backend
          // and store a key even while it answers; what takeover removes is the Models.dev binding.
          expect(yield* integrations.get(Integration.ID.make("vllm"))).toBeDefined()
          expect((yield* providers.get(providerID))?.integrationID).toBeUndefined()
          expect((yield* providers.get(providerID))?.activation).toBe("enabled")
          expect(yield* modelState.get(providerID, Model.ID.make("static-model"))).toBeUndefined()

          models.splice(0)
          yield* eventually(
            providers.snapshot(),
            (snapshot) => snapshot.records.get(providerID)?.models.has(Model.ID.make("static-model")) === true,
          )
          expect(yield* modelState.get(providerID, Model.ID.make("discovered-model"))).toBeUndefined()
          expect(yield* modelState.get(providerID, Model.ID.make("static-model"))).toBeUndefined()
          expect(yield* integrations.get(Integration.ID.make("vllm"))).toBeDefined()
          expect((yield* providers.get(providerID))?.integrationID).toBe(Integration.ID.make("vllm"))
          expect((yield* providers.get(providerID))?.activation).toBe("auto")
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  it.live(
    "reloads layered custom endpoint and bearer authentication settings",
    () =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const requests: Array<{ authorization: string | null; path: string }> = []
          return {
            requests,
            initial: Bun.serve({
              port: 0,
              fetch: (request) =>
                new URL(request.url).pathname === "/health"
                  ? new Response()
                  : Response.json({ object: "list", data: [remoteModel("initial-model")] }),
            }),
            configured: Bun.serve({
              port: 0,
              fetch: (request) => {
                requests.push({
                  authorization: request.headers.get("authorization"),
                  path: new URL(request.url).pathname,
                })
                if (new URL(request.url).pathname === "/proxy/health") return new Response()
                return Response.json({ object: "list", data: [remoteModel("configured-model")] })
              },
            }),
          }
        }),
        ({ requests, initial, configured }) =>
          Effect.gen(function* () {
            const bus = yield* Bus.Service
            const providers = yield* Provider.Service
            const modelState = yield* Model.Service
            const config = yield* Config.Test
            const providerID = Provider.ID.make("vllm")
            yield* addPlugin(initial.url.origin)
            yield* eventually(
              modelState.get(providerID, Model.ID.make("initial-model")),
              (model) => model !== undefined,
            )

            const baseURL = `${configured.url.origin}/proxy/v1`
            yield* config.setEntries([configuration({ baseURL }), configuration({ apiKey: "secret" })])
            yield* bus.publish(Event.Updated, {})
            yield* eventually(
              modelState.get(providerID, Model.ID.make("configured-model")),
              (model) => model !== undefined,
            )

            expect(requests).toContainEqual({ authorization: "Bearer secret", path: "/proxy/health" })
            expect(requests).toContainEqual({ authorization: "Bearer secret", path: "/proxy/v1/models" })
            expect(yield* modelState.get(providerID, Model.ID.make("initial-model"))).toBeUndefined()
            expect((yield* providers.get(providerID))?.settings).toEqual({
              baseURL,
              provider: "vllm",
              apiKey: "secret",
            })

            requests.splice(0)
            yield* config.setEntries([configuration({ baseURL }), configuration({ apiKey: "next-secret" })])
            yield* bus.publish(Event.Updated, {})
            yield* eventually(providers.get(providerID), (provider) => provider?.settings?.apiKey === "next-secret")
            expect(requests).toContainEqual({ authorization: "Bearer next-secret", path: "/proxy/health" })
            expect(requests).toContainEqual({ authorization: "Bearer next-secret", path: "/proxy/v1/models" })
          }),
        ({ initial, configured }) => Effect.promise(() => Promise.all([initial.stop(true), configured.stop(true)])),
      ),
    10_000,
  )
})

function configuration(settings: { baseURL?: string; apiKey?: string }) {
  return new Document({
    type: "document",
    info: decode({ providers: { vllm: { settings } } }),
  })
}

describe("classifyProbe", () => {
  test("settles vision on a completed probe", () => {
    expect(classifyProbe(200, undefined)).toBe(true)
  })

  test("settles text-only on a refusal that names the modality", () => {
    expect(classifyProbe(400, "Multi-modal processor not available for text-only models")).toBe(false)
    expect(classifyProbe(415, "Unexpected item type in content")).toBe(false)
    expect(classifyProbe(422, "The model does not support image input")).toBe(false)
  })

  test("leaves everything else open", () => {
    expect(classifyProbe(404, "The model does not exist")).toBe("unknown")
    expect(classifyProbe(400, "max_tokens must be positive")).toBe("unknown")
    expect(classifyProbe(429, "Rate limit reached")).toBe("unknown")
    expect(classifyProbe(500, "overloaded")).toBe("unknown")
    expect(classifyProbe(undefined, undefined)).toBe("unknown")
  })
})
