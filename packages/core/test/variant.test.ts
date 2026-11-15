import { expect, test } from "bun:test"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Variant } from "@opencode/core/variant"

const model = (packageName: string, modelID: string, output?: number, providerID = "test") => {
  const result = Model.Info.default(Provider.ID.make(providerID), Model.ID.make(modelID)) as Model.MutableInfo
  result.package = packageName
  result.modelID = Model.ID.make(modelID)
  if (output !== undefined) result.limit = { ...result.limit, output }
  return Model.Info.make(result)
}

const resolve = (input: Model.Info, supports: readonly Variant.Support[]) =>
  Variant.resolve(input, supports).map((item) => ({ ...item, id: String(item.id) }))

const ANTHROPIC = "@opencode/ai/providers/anthropic-compatible"
const OPENAI = "@opencode/ai/providers/openai-compatible"
const RESPONSES = "@opencode/ai/providers/openai-compatible/responses"
const ADAPTIVE = { type: "adaptive", display: "summarized" }

test("spells Anthropic-compatible effort variants by Claude generation", () => {
  // Manual-thinking generations (3.7 through pre-4.6) fall back to token budgets; the budget ceiling is
  // the Messages output maximum, not the catalog limit.
  for (const id of ["claude-sonnet-3.7", "claude-sonnet-3-7", "claude-3.7-sonnet", "claude-3-7-sonnet"])
    expect(resolve(model(ANTHROPIC, id), [{ type: "effort" }])).toEqual([
      { id: "high", settings: { thinking: { type: "enabled", budgetTokens: 16000 } } },
      { id: "max", settings: { thinking: { type: "enabled", budgetTokens: 31999 } } },
    ])

  // Opus 4.5 is past manual-thinking but still spells effort on top of a fixed enabled budget.
  expect(resolve(model(ANTHROPIC, "claude-opus-4-5"), [{ type: "effort", values: ["low", "high"] }])).toEqual([
    { id: "low", settings: { effort: "low", thinking: { type: "enabled", budgetTokens: 16000 } } },
    { id: "high", settings: { effort: "high", thinking: { type: "enabled", budgetTokens: 16000 } } },
  ])

  // Adaptive generations spell effort with adaptive thinking; 4.6 has no xhigh step, later ones do.
  expect(resolve(model(ANTHROPIC, "claude-sonnet-4-6"), [{ type: "effort" }]).map((item) => item.id)).toEqual([
    "low",
    "medium",
    "high",
    "max",
  ])
  expect(resolve(model(ANTHROPIC, "claude-opus-6"), [{ type: "effort" }])).toEqual(
    ["low", "medium", "high", "xhigh", "max"].map((effort) => ({
      id: effort,
      settings: { effort, thinking: ADAPTIVE },
    })),
  )

  // Always-thinking families never offer a way to turn thinking off.
  expect(
    resolve(model(ANTHROPIC, "claude-mythos-1"), [{ type: "effort", values: ["none", "low"] }]),
  ).toEqual([{ id: "low", settings: { effort: "low", thinking: ADAPTIVE } }])
  expect(resolve(model(ANTHROPIC, "claude-fable-2"), [{ type: "toggle" }])).toEqual([])
})

test("spells Anthropic-compatible budgets and toggles", () => {
  expect(
    resolve(model(ANTHROPIC, "claude-haiku-4-5", 64_000), [{ type: "budget_tokens", min: 1_024, max: 64_000 }]),
  ).toEqual([
    { id: "high", settings: { thinking: { type: "enabled", budgetTokens: 16_000 } } },
    { id: "max", settings: { thinking: { type: "enabled", budgetTokens: 31_999 } } },
  ])

  expect(resolve(model(ANTHROPIC, "claude-sonnet-4-6"), [{ type: "toggle" }])).toEqual([
    { id: "none", settings: { thinking: { type: "disabled" } } },
    { id: "thinking", settings: { thinking: ADAPTIVE } },
  ])

  // A manual model too small for a legal budget has no toggle either.
  expect(resolve(model(ANTHROPIC, "claude-sonnet-3-7", 1_024), [{ type: "toggle" }])).toEqual([])
})

test("spells OpenAI-compatible effort variants", () => {
  expect(resolve(model(OPENAI, "gpt-5.4"), [{ type: "effort", values: ["low", "xhigh"] }])).toEqual([
    { id: "low", settings: { reasoningEffort: "low" } },
    { id: "xhigh", settings: { reasoningEffort: "xhigh" } },
  ])
  expect(resolve(model(OPENAI, "gpt-5.4"), [{ type: "effort" }]).map((item) => item.id)).toEqual([
    "low",
    "medium",
    "high",
  ])
  // Chat Completions has no budget or toggle spelling.
  expect(resolve(model(OPENAI, "gpt-5.4"), [{ type: "budget_tokens", min: 1024 }])).toEqual([])
})

test("routes NVIDIA models through chat template kwargs", () => {
  const nvidia = (id: string, output?: number) => model(OPENAI, id, output, "nvidia")

  expect(resolve(nvidia("deepseek-v4-flash"), [{ type: "toggle" }])).toEqual([
    { id: "none", body: { chat_template_kwargs: { thinking: false } } },
    { id: "thinking", body: { chat_template_kwargs: { thinking: true } } },
  ])
  expect(
    resolve(nvidia("deepseek-v4-flash"), [{ type: "effort" }]),
  ).toEqual([
    { id: "none", body: { chat_template_kwargs: { thinking: false } } },
    { id: "high", body: { chat_template_kwargs: { thinking: true, reasoning_effort: "high" } } },
    { id: "max", body: { chat_template_kwargs: { thinking: true, reasoning_effort: "max" } } },
  ])

  // Kimi 2.6 only toggles; Kimi 3 spells effort as settings once it is asked for explicitly.
  expect(resolve(nvidia("kimi-k2.6"), [{ type: "effort", values: ["low", "high"] }])).toEqual([
    { id: "none", body: { chat_template_kwargs: { thinking: false } } },
    { id: "thinking", body: { chat_template_kwargs: { thinking: true } } },
  ])
  expect(resolve(nvidia("kimi-k3"), [{ type: "effort" }])).toEqual([
    { id: "low", settings: { reasoningEffort: "low" } },
    { id: "high", settings: { reasoningEffort: "high" } },
    { id: "max", settings: { reasoningEffort: "max" } },
  ])

  expect(resolve(nvidia("minimax-m3"), [{ type: "toggle" }])).toEqual([
    { id: "none", body: { chat_template_kwargs: { thinking_mode: "disabled" } } },
    { id: "thinking", body: { chat_template_kwargs: { thinking_mode: "enabled" } } },
  ])

  expect(resolve(nvidia("glm-4.7"), [{ type: "toggle" }])).toEqual([
    { id: "none", body: { chat_template_kwargs: { enable_thinking: false } } },
    { id: "thinking", body: { chat_template_kwargs: { enable_thinking: true, clear_thinking: false } } },
  ])

  // Template-only models turn into a toggle when the catalog names no effort levels.
  expect(resolve(nvidia("qwen3-32b"), [{ type: "effort" }])).toEqual([
    { id: "none", body: { chat_template_kwargs: { enable_thinking: false } } },
    { id: "thinking", body: { chat_template_kwargs: { enable_thinking: true } } },
  ])
  expect(resolve(nvidia("qwen3-32b"), [{ type: "effort", values: ["low", "high"] }])).toEqual([
    { id: "low", settings: { reasoningEffort: "low" } },
    { id: "high", settings: { reasoningEffort: "high" } },
  ])

  expect(resolve(nvidia("llama-4-maverick", 8_192), [{ type: "budget_tokens", min: 1_024 }])).toEqual([
    { id: "high", body: { chat_template_kwargs: { enable_thinking: true }, reasoning_budget: 4_096 } },
    { id: "max", body: { chat_template_kwargs: { enable_thinking: true }, reasoning_budget: 8_191 } },
  ])
})

test("spells Responses-compatible variants with encrypted reasoning", () => {
  const expected = (effort: string) => ({
    id: effort,
    settings: { reasoningEffort: effort, reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
  })
  expect(resolve(model(RESPONSES, "gpt-5.4"), [{ type: "effort", values: ["low", "xhigh"] }])).toEqual([
    expected("low"),
    expected("xhigh"),
  ])
  expect(resolve(model("@opencode/ai/providers/openai-compatible-responses", "gpt-5.4"), [{ type: "effort" }])).toEqual(
    ["low", "medium", "high"].map(expected),
  )
  expect(resolve(model(RESPONSES, "gpt-5.4"), [{ type: "toggle" }])).toEqual([])
})

test("spells nothing for unknown or missing packages", () => {
  expect(resolve(model("@opencode/ai/providers/openai/chat", "gpt-5.4"), [{ type: "effort" }])).toEqual([])
  const bare = Model.Info.default(Provider.ID.make("test"), Model.ID.make("mystery"))
  expect(Variant.resolve(bare, [{ type: "effort" }])).toEqual([])
})
