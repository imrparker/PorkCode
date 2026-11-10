import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { TextInput } from "@opencode/ui/text-input"
import { createSignal, type Component, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"

export type LocalBackend = {
  id: string
  name: string
  // The plugin's built-in origin, shown as the placeholder for an unset address.
  defaultUrl: string
  // The configured override from providers.<id>.settings.baseURL, if any.
  baseUrl?: string
  keyCredentialID?: string
}

// Points a local backend at any reachable server and stores its API key. The address goes to the
// global config (core's local plugins fold it back out on reload); the key goes to the credential
// store under the backend's integration id, which is what discovery and inference both read.
export const DialogLocalBackendEdit: Component<{ backend: LocalBackend; directory: string | undefined }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useServerSDK()
  const [baseUrl, setBaseUrl] = createSignal(props.backend.baseUrl ?? "")
  const [apiKey, setApiKey] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [removing, setRemoving] = createSignal(false)
  const [keyRemoved, setKeyRemoved] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const stored = () => props.backend.keyCredentialID !== undefined && !keyRemoved()
  const trimmed = () => baseUrl().trim()
  // Empty means no override; anything else must be a real http(s) address.
  const invalid = () => {
    const value = trimmed()
    if (!value) return false
    if (!URL.canParse(value)) return true
    const url = new URL(value)
    return url.protocol !== "http:" && url.protocol !== "https:"
  }

  const save = (event?: SubmitEvent) => {
    event?.preventDefault()
    if (saving() || invalid()) return
    const value = trimmed()
    setSaving(true)
    setError(undefined)
    void Promise.resolve()
      .then(() => {
        if (value === (props.backend.baseUrl ?? "")) return
        return sdk.api.experimental.config.update({ providers: { [props.backend.id]: { baseURL: value || null } } })
      })
      .then(() => {
        const key = apiKey().trim()
        if (!key) return
        return sdk.api.integration.connect.key({
          integrationID: props.backend.id,
          location: props.directory ? { directory: props.directory } : undefined,
          key,
        })
      })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.providers.local.saved.title", { provider: props.backend.name }),
        })
        dialog.close()
      })
      .catch((cause: unknown) => {
        setError(formatServerError(cause, language.t))
        setSaving(false)
      })
  }

  const removeStoredKey = () => {
    const credentialID = props.backend.keyCredentialID
    if (!credentialID || removing() || keyRemoved()) return
    setRemoving(true)
    void sdk.api.credential
      .remove({ credentialID })
      .then(() => {
        setKeyRemoved(true)
        setRemoving(false)
      })
      .catch((cause: unknown) => {
        setError(formatServerError(cause, language.t))
        setRemoving(false)
      })
  }

  return (
    <Dialog>
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("settings.providers.local.dialog.title", { provider: props.backend.name })}
          description={language.t("settings.providers.local.dialog.description")}
        />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-5 px-3 pb-4 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
        <form onSubmit={save} class="flex flex-col items-start gap-5 self-stretch">
          <label class="flex w-full flex-col gap-2 font-[530] leading-4 text-v2-text-text-base">
            {language.t("settings.providers.local.baseUrl")}
            <TextInput
              class="!w-full font-mono"
              name="baseUrl"
              value={baseUrl()}
              onInput={(event) => setBaseUrl(event.currentTarget.value)}
              placeholder={props.backend.defaultUrl}
              readOnly={saving()}
              invalid={invalid()}
              autocomplete="off"
              spellcheck={false}
            />
          </label>
          <Show when={invalid()}>
            <div role="alert" class="-mt-3 text-xs text-v2-state-fg-danger">
              {language.t("settings.providers.local.baseUrl.invalid")}
            </div>
          </Show>
          <label class="flex w-full flex-col gap-2 font-[530] leading-4 text-v2-text-text-base">
            {language.t("settings.providers.local.apiKey")}
            <TextInput
              class="!w-full"
              type="password"
              name="apiKey"
              value={apiKey()}
              onInput={(event) => setApiKey(event.currentTarget.value)}
              placeholder={language.t(
                stored() ? "settings.providers.local.apiKey.stored" : "provider.connect.apiKey.placeholder",
              )}
              readOnly={saving()}
              autocomplete="off"
              spellcheck={false}
            />
          </label>
          <Show when={stored()}>
            <Button
              type="button"
              size="normal"
              variant="ghost-muted"
              disabled={removing()}
              onClick={removeStoredKey}
            >
              {language.t("settings.providers.local.apiKey.remove")}
            </Button>
          </Show>
          <Show when={error()}>
            {(message) => (
              <div role="alert" class="text-xs text-v2-state-fg-danger">
                {message()}
              </div>
            )}
          </Show>
          <Button type="submit" variant="contrast" disabled={saving() || invalid()} aria-busy={saving()}>
            {language.t("common.save")}
          </Button>
        </form>
      </DialogBody>
    </Dialog>
  )
}
