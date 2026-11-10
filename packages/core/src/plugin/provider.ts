import { LMStudioPlugin } from "./provider/lmstudio.js"
import { OllamaPlugin } from "./provider/ollama.js"
import { PromptCacheKeyPlugin } from "./provider/prompt-cache-key.js"
import { VLLMPlugin } from "./provider/vllm.js"
import type { PluginInternal } from "./internal.js"

// PorkCode connects to local inference servers and user-configured OpenAI- or
// Anthropic-compatible endpoints only. Hosted vendor plugins (Console, ChatGPT, Copilot, ...)
// were removed; custom providers load through DynamicProviderPlugin and config.
export const ProviderPlugins: PluginInternal.InternalPlugin[] = [LMStudioPlugin, OllamaPlugin, VLLMPlugin, PromptCacheKeyPlugin]
