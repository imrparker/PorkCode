import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import {
  ai,
  AIClient,
  AIError,
  DecisionClient,
  Generation,
  ImageClient,
  LanguageModel,
  LLMClient,
  LLMEvent,
  Media,
  RawEvent,
} from "@opencode/ai/effect"
import { AI } from "@opencode/ai"
import { Speech, SpeechClient, SpeechEvent, TranscriptionClient, Video, VideoClient } from "@opencode/ai/experimental"
import { Route, Protocol, RequestExecutor, WebSocketTransport } from "@opencode/ai/route"
import { AnthropicCompatible, OpenAICompatible, OpenAICompatibleResponses } from "@opencode/ai/providers"
import {
  AnthropicMessages,
  OpenAIChat,
  OpenAICompatibleChat,
  OpenAICompatibleResponses,
  OpenAIResponses,
  OpenResponses,
  OpenResponsesChannel,
} from "@opencode/ai/protocols"
import { TestLLM } from "@opencode/ai/testing"

describe("public exports", () => {
  test("modality, provider, and protocol entrypoints load first in a fresh process", async () => {
    const results = await Promise.all(
      ["image", "video", "speech", "transcription", "providers", "protocols"].map(async (entry) => {
        const child = Bun.spawn(
          [process.execPath, "-e", `await import(${JSON.stringify(`${import.meta.dir}/../src/${entry}.ts`)})`],
          { stderr: "pipe" },
        )
        return { entry, exitCode: await child.exited, stderr: await new Response(child.stderr).text() }
      }),
    )
    expect(results.filter((result) => result.exitCode !== 0)).toEqual([])
  })

  test("root exposes app-facing runtime APIs", () => {
    expect(ai.request).toBeFunction()
    expect(LLMClient.Service).toBeFunction()
    expect(LLMClient.layer).toBeDefined()
    expect(AIError).toBeFunction()
    expect(LanguageModel.make).toBeFunction()
    expect(Media.bytes).toBeFunction()
    expect(ai.image.generate).toBeFunction()
    expect(Video.start).toBeFunction()
    expect(Video.resume).toBeFunction()
    expect(VideoClient.layer).toBeDefined()
    expect(Speech.generate).toBeFunction()
    expect(Speech.stream).toBeFunction()
    expect(SpeechClient.layer).toBeDefined()
    expect(SpeechEvent.is.audioDelta).toBeFunction()
    expect(Generation).toBeFunction()
    expect(TestLLM.testLayer).toBeFunction()
    expect(TestLLM.Test.of).toBeFunction()
    expect(ai.decision.generate).toBeFunction()
    expect(DecisionClient.layer).toBeDefined()
    expect(DecisionClient.fetchLayer).toBeDefined()
  })

  test("both entry points export the raw event type", () => {
    const event: RawEvent = LLMEvent.raw({ data: { type: "ping" } })
    const promiseEvent: AI.RawEvent = event
    expect(RawEvent).toBe(AI.RawEvent)
    expect(LLMEvent.is.raw(promiseEvent)).toBe(true)
  })

  test("AIClient.layerWith shares one executor across every client", async () => {
    let built = 0
    const counting = Layer.effect(
      RequestExecutor.Service,
      Effect.sync(() => {
        built++
        return RequestExecutor.Service.of({ execute: () => Effect.die("unexpected request") })
      }),
    )
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* LLMClient.Service
        yield* ImageClient.Service
        yield* VideoClient.Service
        yield* SpeechClient.Service
        yield* TranscriptionClient.Service
        yield* RequestExecutor.Service
      }).pipe(Effect.provide(AIClient.layerWith(counting))),
    )
    expect(built).toBe(1)
  })

  test("route barrel exposes route-authoring APIs", () => {
    expect(Route.make).toBeFunction()
    expect(Protocol.make).toBeFunction()
    expect(WebSocketTransport.makeDirect).toBeFunction()
  })

  test("provider barrels expose user-facing facades", async () => {
    const { OpenAICompatibleResponses } = await import("@opencode/ai/providers")

    expect(OpenAICompatible.model).toBeFunction()
    expect(OpenAICompatible.provider.configure).toBe(OpenAICompatible.configure)
    expect(OpenAICompatible.configure({ baseURL: "https://compat.test/v1" }).model("fixture").route.id).toBe(
      "openai-compatible-chat",
    )
    expect(OpenAICompatible.configure({ baseURL: "https://compat.test/v1" }).image("flux").route.id).toBe(
      "openai-images",
    )
    for (const name of ["baseten", "cerebras", "deepinfra", "deepseek", "fireworks", "groq", "togetherai"]) {
      expect(OpenAICompatible).not.toHaveProperty(name)
    }
    expect(AnthropicCompatible.configure({ baseURL: "https://anthropic.test/v1" }).model("fixture").route.id).toBe(
      "anthropic-compatible-messages",
    )
    expect(
      OpenAICompatibleResponses.configure({ baseURL: "https://responses.test/v1" }).model("fixture").route.id,
    ).toBe("openai-compatible-responses")
  })

  test("protocol barrels expose supported low-level routes", () => {
    expect(OpenAIChat.route.id).toBe("openai-chat")
    expect(OpenAICompatibleChat.route.id).toBe("openai-compatible-chat")
    expect(OpenResponses.protocol.id).toBe("open-responses")
    expect(OpenResponsesChannel.transport).toBeFunction()
    expect(OpenAICompatibleResponses.route.id).toBe("openai-compatible-responses")
    expect(OpenAICompatibleResponses.route.protocol).toBe("open-responses")
    expect(OpenAIResponses.route.id).toBe("openai-responses")
    expect(AnthropicMessages.route.id).toBe("anthropic-messages")
  })
})
