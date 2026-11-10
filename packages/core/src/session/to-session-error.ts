import { AIError, ToolFailure, type FinishReasonDetails } from "@opencode/ai/effect"
import { Tool } from "@opencode/schema/tool"
import { SessionError } from "@opencode/schema/session-error"
import { Permission } from "../permission.js"
import { Integration } from "../integration.js"
import { AgentNotFoundError, StepFailedError } from "./error.js"
import { ModelResolver } from "../model-resolver.js"
import { ModelRetry } from "../model-retry.js"
import { SessionRunnerModel } from "./runner/model.js"

export function toSessionError(cause: unknown): SessionError.Error {
  if (cause instanceof AIError) {
    switch (cause.reason._tag) {
      case "RateLimit":
        return providerError("provider.rate-limit", cause.reason)
      case "Authentication":
        return providerError("provider.auth", cause.reason)
      case "QuotaExceeded":
        // The fork connects to local providers only, so hosted free-tier, Go and workspace-budget envelopes are not
        // special-cased; they surface as ordinary quota refusals with the provider's own message.
        return providerError("provider.quota", cause.reason)
      case "ContentPolicy":
        return providerError("provider.content-filter", cause.reason)
      case "Transport":
        if (ModelRetry.isUnreachable(cause)) return unreachable(cause.reason)
        return providerError("provider.transport", cause.reason)
      case "ProviderInternal":
        return providerError("provider.internal", cause.reason)
      case "InvalidProviderOutput":
        return providerError("provider.invalid-output", cause.reason)
      case "InvalidRequest":
        return providerError("provider.invalid-request", cause.reason)
      case "UnsupportedOperation":
        return providerError("provider.unsupported-operation", cause.reason)
      case "UnknownProvider":
        return providerError("provider.unknown", cause.reason)
      case "Timeout":
        return providerError("provider.timeout", cause.reason)
      default: {
        const exhaustive: never = cause.reason
        return exhaustive
      }
    }
  }
  if (cause instanceof Permission.BlockedError) return { type: "permission.rejected", message: cause.message }
  if (cause instanceof Permission.CorrectedError) return { type: "permission.rejected", message: cause.feedback }
  if (cause instanceof ToolFailure || cause instanceof Tool.Error) {
    if (cause.error === undefined) return { type: "tool.execution", message: cause.message }
    // The canonical error is the sole model-visible representation, so a cause
    // with no message must not erase the tool's curated failure message.
    const unwrapped = toSessionError(cause.error)
    return unwrapped.message === "" ? { ...unwrapped, type: "tool.execution", message: cause.message } : unwrapped
  }
  if (cause instanceof StepFailedError) return cause.error
  if (cause instanceof ModelResolver.UnsupportedCompactionError)
    return { type: "provider.unsupported-operation", message: cause.message }
  if (cause instanceof AgentNotFoundError) return { type: "unknown", message: cause.message }
  if (
    cause instanceof SessionRunnerModel.ModelNotSelectedError ||
    cause instanceof SessionRunnerModel.ModelUnavailableError ||
    cause instanceof ModelResolver.VariantUnavailableError ||
    cause instanceof ModelResolver.UnsupportedPackageError ||
    cause instanceof ModelResolver.ModelConfigurationError ||
    cause instanceof ModelResolver.ModelInitializationError ||
    cause instanceof ModelResolver.UnresolvedProviderVariablesError
  )
    return { type: "provider.no-route", message: cause.message }
  if (cause instanceof Integration.AuthorizationError) return { type: "provider.auth", message: cause.message }
  return { type: "unknown", message: cause instanceof Error ? cause.message : String(cause) }
}

export function contentFilterError(summary: string, reason: FinishReasonDetails): SessionError.Error {
  return {
    type: "provider.content-filter",
    message: [reason.category === undefined ? summary : `${summary} (${reason.category})`, reason.explanation]
      .filter(Boolean)
      .join(": "),
  }
}

// Names the network as the problem, so a DNS outage doesn't read like a broken model or provider.
function unreachable(reason: AIError["reason"]): SessionError.Error {
  const host = "url" in reason && reason.url !== undefined ? URL.parse(reason.url)?.hostname : undefined
  return {
    ...providerError("provider.transport", reason),
    message: `Can't reach ${host || "the provider"}. Check the network connection. (${reason.message})`,
  }
}

function providerError(type: string, reason: AIError["reason"]): SessionError.Error {
  const status = reason.http?.status
  const retryAfterMs = "retryAfterMs" in reason ? reason.retryAfterMs : undefined
  return {
    type,
    message: reason.message,
    ...(status === undefined ? {} : { status }),
    ...(reason.body === undefined ? {} : { response: { body: reason.body } }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  }
}
