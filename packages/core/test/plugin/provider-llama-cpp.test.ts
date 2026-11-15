import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Integration } from "@opencode/core/integration"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { LlamaCppPlugin, make } from "@opencode/core/plugin/provider/llama-cpp"
import { Provider } from "@opencode/core/provider"
import { Document, Event, Info } from "@opencode/schema/config"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { eventually } from "../lib/eventually"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(Layer.merge(PluginTestLayer, Config.testLayer()))
const decode = Schema.decodeUnknownSync(Info)

const addPlugin = Effect.fn(function* (origin: string) {
  const plugin = yield* Plugin.Service
  const host = yield* PluginHost.make(plugin, "test")
  yield* make(origin, "5 millis").effect(host)
})

describe("LlamaCppPlugin", () => {
  it.live("discovers models from llama-server's /v1/models response shape", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => ({
        server: Bun.serve({
          port: 0,
          fetch: (request) => {
            if (new URL(request.url).pathname !== "/v1/models") return new Response("Not found", { status: 404 })
            // llama.cpp answers with `models`, not OpenAI's `data`, and reports no capabilities.
            return Response.json({ models: [{ id: "qwen3-coder" }, { id: "" }, { id: "gemma" }] })
          },
        }),
      })),
      ({ server }) =>
        Effect.gen(function* () {
          const providers = yield* Provider.Service
          const modelState = yield* Model.Service
          const integrations = yield* Integration.Service
          const providerID = Provider.ID.make("llamacpp")
          expect(LlamaCppPlugin.id).toBe("opencode.provider.llama-cpp")
          expect(ProviderPlugins.map((item) => item.id)).toContain("opencode.provider.llama-cpp")
          yield* addPlugin(server.url.origin)

          const model = yield* eventually(
            modelState.get(providerID, Model.ID.make("gemma")),
            (item) => item !== undefined,
          )
          expect(yield* providers.get(providerID)).toEqual({
            id: providerID,
            name: "llama.cpp",
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `${server.url.origin}/v1`, provider: "llamacpp", apiKey: "" },
            activation: "enabled",
          })
          // The integration stays registered so Settings lists the backend and can store a key before it answers.
          expect(yield* integrations.get(Integration.ID.make("llamacpp"))).toBeDefined()
          expect(model).toMatchObject({
            modelID: "gemma",
            name: "gemma",
            capabilities: { tools: true, input: ["text"], output: ["text"] },
          })
          // Empty IDs are dropped; only the two real models remain.
          expect(yield* modelState.get(providerID, Model.ID.make(""))).toBeUndefined()
          expect((yield* providers.snapshot()).records.get(providerID)?.models.size).toBe(2)
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  it.live("discovers through a configured baseURL override", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const paths: string[] = []
        return {
          paths,
          defaultServer: Bun.serve({ port: 0, fetch: () => new Response("Not found", { status: 404 }) }),
          configuredServer: Bun.serve({
            port: 0,
            fetch: (request) => {
              const path = new URL(request.url).pathname
              paths.push(path)
              if (path !== "/proxy/v1/models") return new Response("Not found", { status: 404 })
              return Response.json({ models: [{ id: "remote-model" }] })
            },
          }),
        }
      }),
      ({ defaultServer, configuredServer, paths }) =>
        Effect.gen(function* () {
          const bus = yield* Bus.Service
          const providers = yield* Provider.Service
          const modelState = yield* Model.Service
          const config = yield* Config.Test
          const providerID = Provider.ID.make("llamacpp")
          yield* addPlugin(defaultServer.url.origin)
          expect(yield* modelState.get(providerID, Model.ID.make("remote-model"))).toBeUndefined()

          const baseURL = `${configuredServer.url.origin}/proxy/v1`
          yield* config.setEntries([
            new Document({ type: "document", info: decode({ providers: { llamacpp: { settings: { baseURL } } } }) }),
          ])
          yield* bus.publish(Event.Updated, {})

          yield* eventually(
            modelState.get(providerID, Model.ID.make("remote-model")),
            (model) => model !== undefined,
          )
          expect(paths).toContain("/proxy/v1/models")
          expect((yield* providers.get(providerID))?.settings?.baseURL).toBe(baseURL)
        }),
      ({ defaultServer, configuredServer }) =>
        Effect.promise(() => Promise.all([defaultServer.stop(true), configuredServer.stop(true)])),
    ),
  )
})
