import { Config } from "@opencode/core/config"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { PorkAgentPlugin, make } from "@opencode/core/plugin/provider/porkagent"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { Provider } from "@opencode/core/provider"
import { describe, expect, test } from "bun:test"
import { Duration, Effect, Layer } from "effect"
import { eventually } from "../lib/eventually"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(Layer.merge(PluginTestLayer, Config.testLayer()))

const addPlugin = Effect.fn(function* (origin: string, interval: Duration.Input = "1 hour") {
  const plugin = yield* Plugin.Service
  const host = yield* PluginHost.make(plugin, "test")
  yield* make(origin, interval).effect(host)
})

describe("PorkAgentPlugin", () => {
  test("is registered as a built-in provider plugin", () => {
    expect(PorkAgentPlugin.id).toBe("opencode.provider.porkagent")
    expect(ProviderPlugins.map((item) => item.id)).toContain("opencode.provider.porkagent")
  })

  it.live(
    "discovers loaded models through the responses package with the stored key",
    () =>
      Effect.acquireUseRelease(
        Effect.gen(function* () {
          const credentials = yield* Credential.Service
          const requests: Array<{ authorization: string | null; path: string }> = []
          const server = Bun.serve({
            port: 0,
            fetch: (request) => {
              const authorization = request.headers.get("authorization")
              requests.push({ authorization, path: new URL(request.url).pathname })
              if (authorization !== "Bearer pork-secret")
                return Response.json({ error: { type: "invalid_request", code: "invalid_api_key" } }, { status: 401 })
              return Response.json({
                models: [
                  remote("qwen/qwen3-coder", { loaded: true, vision: false, tools: true }),
                  remote("unloaded-model", { loaded: false }),
                  { type: "embedding", key: "nomic-embed", display_name: "Nomic Embed", loaded_instances: [{ config: { context_length: 2048 } }], max_context_length: 2048 },
                ],
              })
            },
          })
          const credential = yield* credentials.create({
            integrationID: Integration.ID.make("porkagent"),
            value: { type: "key", key: "pork-secret" },
          })
          return { requests, server, credential }
        }),
        ({ requests, server }) =>
          Effect.gen(function* () {
            const providers = yield* Provider.Service
            const modelState = yield* Model.Service
            const providerID = Provider.ID.make("porkagent")
            yield* addPlugin(server.url.origin)
            const coder = yield* eventually(
              modelState.get(providerID, Model.ID.make("qwen/qwen3-coder")),
              (model) => model !== undefined,
            )

            expect(requests).toContainEqual({ authorization: "Bearer pork-secret", path: "/api/v1/models" })
            // The Responses loader is what reports prompt-cache hits; the plain chat package would not.
            expect((yield* providers.get(providerID))?.package).toBe("@opencode/ai/providers/openai-compatible/responses")
            expect(coder).toMatchObject({
              name: "qwen/qwen3-coder",
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              limit: { context: 131_072 },
            })
            expect(yield* modelState.get(providerID, Model.ID.make("unloaded-model"))).toBeUndefined()
            expect(yield* modelState.get(providerID, Model.ID.make("nomic-embed"))).toBeUndefined()
          }),
        ({ server, credential }) =>
          Effect.gen(function* () {
            const credentials = yield* Credential.Service
            yield* Effect.promise(() => server.stop(true))
            yield* credentials.remove(credential.id)
          }),
      ),
    10_000,
  )

  it.live(
    "sends no doomed probe until a key is stored, then discovers on the switch",
    () =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const requests: Array<string | null> = []
          return {
            requests,
            created: { id: undefined as Credential.ID | undefined },
            server: Bun.serve({
              port: 0,
              fetch: (request) => {
                const authorization = request.headers.get("authorization")
                requests.push(authorization)
                if (authorization !== "Bearer late-secret")
                  return Response.json({ error: { type: "invalid_request", code: "invalid_api_key" } }, { status: 401 })
                return Response.json({ models: [remote("late-model", { loaded: true })] })
              },
            }),
          }
        }),
        ({ requests, server, created }) =>
          Effect.gen(function* () {
            const credentials = yield* Credential.Service
            const modelState = yield* Model.Service
            // The default interval is 1 hour, so only the credential-switch event can start discovery.
            yield* addPlugin(server.url.origin)
            created.id = (
              yield* credentials.create({
                integrationID: Integration.ID.make("porkagent"),
                value: { type: "key", key: "late-secret" },
              })
            ).id
            yield* eventually(
              modelState.get(Provider.ID.make("porkagent"), Model.ID.make("late-model")),
              (model) => model !== undefined,
            )
            // Any pre-key probe would have logged a null-authorization 401 attempt here.
            expect(requests).toEqual(["Bearer late-secret"])
          }),
        ({ server, created }) =>
          Effect.gen(function* () {
            const credentials = yield* Credential.Service
            yield* Effect.promise(() => server.stop(true))
            if (created.id !== undefined) yield* credentials.remove(created.id)
          }),
      ),
    10_000,
  )
})

function remote(key: string, options: { loaded: boolean; vision?: boolean; tools?: boolean }) {
  return {
    type: "llm",
    key,
    display_name: key,
    architecture: "qwen3",
    loaded_instances: options.loaded ? [{ config: { context_length: 131_072 } }] : [],
    max_context_length: 131_072,
    capabilities: { vision: options.vision ?? false, trained_for_tool_use: options.tools ?? true },
  }
}
