import { Button } from "@opencode/ui/button"
import { Badge } from "@opencode/ui/badge"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { ProviderIcon } from "@opencode/ui/provider-icon"
import { showToast } from "@/shell/notifications/toast"
import { useProviders } from "@/providers/catalog/providers"
import { useIntegrations } from "@/providers/catalog/integrations"
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
  untrack,
  type Component,
  For,
  type JSX,
  Show,
} from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { DialogConnectProvider, useProviderConnectController } from "@/providers/connect/dialog"
import { ProviderModelIcon } from "@/providers/models/provider-group"
import { SettingsList } from "@/settings/list"
import { activeProviderAccount, providerAccounts, type ProviderAccount } from "./accounts"
import { AccountNameInput } from "./account-name"
import { useProviderAccountActions } from "./account-actions"
import { DialogLocalBackendEdit } from "./local-edit"
import {
  availableProviders,
  connectedProviders,
  createSettingsProvidersState,
  providerAccountView,
  transitionSettingsProviders,
  type SettingsProvidersEffect,
  type SettingsProvidersEvent,
} from "./machine"
import "@/settings/settings.css"

type ProviderSource = "env" | "api" | "account" | "config" | "custom"

type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

// PorkCode's core use case. These backends self-register their models while they run (core plugin
// provider/local.ts), so the rows stay listed with a live detection state instead of vanishing until
// a server answers; other ports are set through opencode.json providers.<id>.settings.baseURL.
const LOCAL_BACKENDS: ReadonlyArray<{ id: string; name: string; url: string; requiresKey?: boolean }> = [
  { id: "porkagent", name: "PorkAgent", url: "https://api.porkagent.com", requiresKey: true },
  { id: "lmstudio", name: "LM Studio", url: "http://127.0.0.1:1234" },
  { id: "ollama", name: "Ollama", url: "http://127.0.0.1:11434" },
  { id: "vllm", name: "vLLM", url: "http://127.0.0.1:8000" },
  { id: "llamacpp", name: "llama.cpp", url: "http://127.0.0.1:8080" },
]

export const SettingsProviders: Component<{
  directory: string | undefined
  headerAction?: JSX.Element
}> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const providers = useProviders(() => props.directory)
  const integrations = useIntegrations(() => props.directory)
  const providerConnect = useProviderConnectController()
  const accountActions = useProviderAccountActions(() => props.directory)

  const [pageState, setPageState] = createSignal(createSettingsProvidersState<ProviderItem>())
  const accountView = createMemo(() => providerAccountView(pageState()))

  // Local backend rows show the configured server address instead of the built-in default; config
  // documents arrive lowest to highest priority, so the last definition wins. Settings can be open
  // without an active workspace route, so the source stays defined and falls back to base config.
  const [configEntries, { refetch: refetchConfig }] = createResource(
    () => props.directory ?? "",
    (directory) => serverSdk.api.config.get(directory ? { location: { directory } } : undefined),
  )

  onCleanup(
    serverSdk.event.on("config.updated", () => {
      void refetchConfig()
    }),
  )

  const configuredBaseUrl = (id: string) => {
    if (configEntries.state !== "ready" && configEntries.state !== "refreshing") return undefined

    for (let index = configEntries.latest.length - 1; index >= 0; index -= 1) {
      const entry = configEntries.latest[index]

      if (!entry || entry.type !== "document") continue

      const value = entry.info.providers?.[id]?.settings?.baseURL

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- providers.<id>.settings.baseURL lives in the settings rest record as arbitrary JSON; narrow before display
      if (typeof value === "string" && value.trim()) return value.trim()
    }

    return undefined
  }

  const storedKeyID = (id: string) =>
    integrations.list().find((item) => item.id === id)?.connections.find((connection) => connection.type === "credential")
      ?.id

  const dispatch = (event: SettingsProvidersEvent<ProviderItem>) => {
    const result = transitionSettingsProviders(untrack(pageState), event)
    setPageState(result.state)
    result.effects.forEach(
      (effect) => void Promise.try(() => run(effect)).catch((cause: unknown) => console.error(cause)),
    )
  }

  // Results that arrive after Settings closes still report through a toast, as the user asked for the change.
  const run = (effect: SettingsProvidersEffect) => {
    if (effect.type === "dialog.open") {
      providerConnect.select(effect.provider)
      void dialog.show(
        () => (
          <DialogConnectProvider
            directory={props.directory}
            defaultLocation={props.directory === undefined}
            controller={providerConnect}
            onConnected={(providerID) => dispatch({ type: "provider.reconnected", providerID })}
          />
        ),
        () => dispatch({ type: "dialog.closed", attempt: effect.attempt }),
      )

      return
    }

    if (effect.type === "catalog.refresh") {
      void accountActions
        .refresh()
        .catch(() => undefined)
        .finally(() => dispatch({ type: "dialog.refresh.settled", attempt: effect.attempt }))

      return
    }

    // The actions toast their own request failures; anything else they throw still settles the menus.
    if (effect.type === "account.activate.run" || effect.type === "account.remove.run") {
      const input = { integrationID: effect.integrationID, provider: effect.providerName, account: effect.account }
      void Promise.try(() =>
        effect.type === "account.activate.run"
          ? accountActions.activate(input)
          : accountActions.remove({ ...input, final: effect.final }),
      )
        .catch((error) =>
          showToast({ title: language.t("common.requestFailed"), description: formatServerError(error, language.t) }),
        )
        .finally(() => dispatch({ type: "account.settled", attempt: effect.attempt }))

      return
    }

    if (effect.type === "disconnect.run") {
      void serverSdk.api.integration
        .get({
          integrationID: effect.integrationID,
          location: props.directory ? { directory: props.directory } : undefined,
        })
        .then(async (integration) => {
          const credentials = integration.data?.connections.filter((item) => item.type === "credential") ?? []

          if (credentials.length === 0) {
            dispatch({ type: "disconnect.failed", attempt: effect.attempt, reason: { kind: "no-credentials" } })

            return
          }

          await Promise.all(
            credentials.map((credential) => serverSdk.api.credential.remove({ credentialID: credential.id })),
          )
          dispatch({ type: "disconnect.succeeded", attempt: effect.attempt })
        })
        .catch((error) =>
          dispatch({ type: "disconnect.failed", attempt: effect.attempt, reason: { kind: "request", error } }),
        )

      return
    }

    if (effect.type === "toast.disconnected") {
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.disconnect.toast.disconnected.title", { provider: effect.providerName }),
        description: language.t("provider.disconnect.toast.disconnected.description", {
          provider: effect.providerName,
        }),
      })

      return
    }

    showToast({
      title: language.t("common.requestFailed"),
      description:
        effect.reason.kind === "no-credentials"
          ? language.t("provider.disconnect.toast.noCredentials.description", { provider: effect.providerName })
          : language.tDynamic(
              "provider.disconnect.toast.failed.description",
              formatServerError(effect.reason.error, language.t),
              { provider: effect.providerName },
            ),
    })
  }

  // A provider's account actions follow its integration, which a custom provider may share with
  // the catalog entry it was derived from.
  const integration = (item: ProviderItem) => {
    const id = item.integrationID ?? item.id

    return integrations.list().find((entry) => entry.id === id)
  }

  // The list stays as it was while the dialog connects, so a new sign-in that briefly drops providers
  // from the catalog can't flash rows behind the dialog.
  const connect = (provider?: string) => dispatch({ type: "dialog.opened", provider, catalog: untrack(available) })

  const available = createMemo(() => availableProviders(pageState(), providers.connected()))

  // Tells the machine which providers the server catalog lists, so a confirmed removal stops hiding a
  // provider once the server drops it and shows it again if it is later reconnected.
  createEffect(
    on(
      () => available().map((item) => item.id),
      (providerIDs) => dispatch({ type: "catalog.synced", providerIDs }),
    ),
  )

  const connected = createMemo(() => connectedProviders(pageState(), available()))

  // Connection state comes from the integration list like the TUI: credential
  // connections mean an API key or an account login, env connections mean detected
  // environment variables, and a connectionless integration is config-provided.
  const source = (item: ProviderItem): ProviderSource | undefined => {
    const current = integration(item)
    const credential = current?.connections.find((connection) => connection.type === "credential")

    if (credential) return credential.method === "key" ? "api" : "account"

    if (current?.connections.some((connection) => connection.type === "env")) return "env"

    if (current) return "config"

    if (!("source" in item)) return
    const value = item.source

    if (value === "env" || value === "api" || value === "config" || value === "custom") return value

    return
  }

  const type = (item: ProviderItem) => {
    const current = source(item)

    if (current === "env") return language.t("settings.providers.tag.environment")

    if (current === "api") return language.t("provider.connect.method.apiKey")

    if (current === "account") return language.t("settings.providers.tag.account")

    if (current === "config") return language.t("settings.providers.tag.config")

    if (current === "custom") return language.t("settings.providers.tag.custom")

    return language.t("settings.providers.tag.other")
  }

  const canDisconnect = (item: ProviderItem) => {
    const current = integration(item)

    if (current) return current.connections.some((connection) => connection.type === "credential")
    const currentSource = source(item)

    return currentSource !== "env" && currentSource !== "config"
  }

  const canManageAccounts = (item: ProviderItem) => providerAccounts(integration(item)).length > 0

  const disconnect = (item: ProviderItem, name: string) =>
    dispatch({
      type: "disconnect.requested",
      providerIDs: [item.id],
      integrationID: item.integrationID ?? item.id,
      providerName: name,
    })

  const activate = (provider: ProviderItem, providerName: string, account: ProviderAccount) =>
    dispatch({
      type: "account.activate.requested",
      integrationID: provider.integrationID ?? provider.id,
      providerName,
      account,
      activeCredentialID: activeProviderAccount(integration(provider))?.id,
      catalog: untrack(available),
    })

  const remove = (provider: ProviderItem, providerName: string, account: ProviderAccount) =>
    dispatch({
      type: "account.remove.requested",
      integrationID: provider.integrationID ?? provider.id,
      providerName,
      account,
      final: providerAccounts(integration(provider)).length === 1,
      catalog: untrack(available),
    })

  function AccountMenu(menuProps: { provider: ProviderItem; name?: string }) {
    const accounts = () => providerAccounts(integration(menuProps.provider))
    const active = () => activeProviderAccount(integration(menuProps.provider))
    const name = () => menuProps.name ?? menuProps.provider.name
    const renaming = () => accounts().find((account) => account.id === accountView().renaming)

    return (
      <Show
        when={renaming()}
        fallback={
          <AccountMenuTrigger provider={menuProps.provider} name={name()} accounts={accounts()} active={active()} />
        }
      >
        {(account) => (
          <AccountNameInput
            value={account().label}
            class="settings-provider-account-input"
            onSave={(label) => accountActions.rename(account(), label)}
            onClose={() => dispatch({ type: "account.rename.closed" })}
          />
        )}
      </Show>
    )
  }

  function AccountMenuTrigger(menuProps: {
    provider: ProviderItem
    name: string
    accounts: ProviderAccount[]
    active: ProviderAccount | undefined
  }) {
    const accounts = () => menuProps.accounts
    const active = () => menuProps.active
    const name = () => menuProps.name

    return (
      <div class="settings-provider-account-actions">
        <Menu placement="bottom-end" gutter={6}>
          <Menu.Trigger
            as={Button}
            size="normal"
            variant="ghost-muted"
            class="settings-provider-account-trigger"
            aria-label={language.t("settings.providers.account.manage", { provider: name() })}
          >
            <span>{active()?.label}</span>
            <Icon name="chevron-down" size="small" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content class="settings-provider-account-menu" onEscapeKeyDown={(event) => event.stopPropagation()}>
              <Menu.Group>
                <Menu.GroupLabel>{language.t("settings.providers.account.group")}</Menu.GroupLabel>
                <Menu.RadioGroup
                  class="settings-provider-account-list"
                  value={active()?.id}
                  onChange={(credentialID) => {
                    const account = accounts().find((item) => item.id === credentialID)

                    if (account) activate(menuProps.provider, name(), account)
                  }}
                >
                  <For each={accounts()}>
                    {(account) => (
                      <Menu.RadioItem value={account.id} closeOnSelect disabled={accountView().busy}>
                        <span class="settings-provider-account-label">{account.label}</span>
                      </Menu.RadioItem>
                    )}
                  </For>
                </Menu.RadioGroup>
              </Menu.Group>
              <Menu.Separator />
              <Menu.Item disabled={accountView().busy} onSelect={() => connect(menuProps.provider.id)}>
                <Icon name="plus" size="small" class="shrink-0" />
                {language.t("settings.providers.account.add")}
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
        <Menu placement="bottom-end" gutter={6}>
          <Menu.Trigger
            as={IconButton}
            variant="ghost-muted"
            size="large"
            icon={<Icon name="outline-dots" />}
            disabled={accountView().busy || !active()}
            aria-label={language.t("dialog.provider.accounts.options", { account: active()?.label ?? "" })}
          />
          <Menu.Portal>
            <Menu.Content onCloseAutoFocus={(event) => accountView().renaming && event.preventDefault()}>
              <Menu.Item
                onSelect={() => {
                  const account = active()

                  if (account) dispatch({ type: "account.rename.started", credentialID: account.id })
                }}
              >
                {language.t("common.rename")}
              </Menu.Item>
              <Menu.Item
                onSelect={() => {
                  const account = active()

                  if (account) remove(menuProps.provider, name(), account)
                }}
              >
                {language.t("dialog.provider.accounts.remove")}
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
      </div>
    )
  }

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="settings-tab-title">{language.t("settings.providers.title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{language.t("settings.providers.description")}</span>
          </div>
          <div class="settings-tab-header-actions">{props.headerAction}</div>
        </div>
      </div>

      <div class="settings-tab-body settings-tab-body--sectioned settings-providers">
        <div class="settings-section" data-component="connected-providers-section">
          <h3 class="settings-section-title">{language.t("settings.providers.section.connected")}</h3>
          <SettingsList variant="catalog">
            <Show
              when={connected().length > 0}
              fallback={<div class="settings-provider-empty">{language.t("settings.providers.connected.empty")}</div>}
            >
              <For each={connected()}>
                {(item) => (
                  <div class="settings-provider-row group">
                    <div class="settings-provider-lead">
                      <ProviderModelIcon provider={item} class="settings-provider-icon shrink-0" />

                      <div class="settings-provider-main">
                        <span class="settings-provider-name truncate">{item.name}</span>
                        <Badge>{type(item)}</Badge>
                      </div>
                    </div>
                    <Show
                      when={canManageAccounts(item)}
                      fallback={
                        <Show
                          when={canDisconnect(item)}
                          fallback={
                            <span class="settings-provider-env-hint">
                              {language.t("settings.providers.connected.environmentDescription")}
                            </span>
                          }
                        >
                          <Button size="normal" variant="ghost-muted" onClick={() => disconnect(item, item.name)}>
                            {language.t("common.disconnect")}
                          </Button>
                        </Show>
                      }
                    >
                      <Show when={activeProviderAccount(integration(item))?.status}>
                        {(status) => (
                          <Button
                            size="normal"
                            variant="ghost-muted"
                            class="text-[var(--v2-state-fg-warning)]"
                            title={status().message}
                            onClick={() => connect(item.id)}
                          >
                            {language.t("dialog.provider.needsSignIn")}
                          </Button>
                        )}
                      </Show>
                      <AccountMenu provider={item} />
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </SettingsList>
        </div>

        <div class="settings-section" data-component="local-backends-section">
          <h3 class="settings-section-title">{language.t("settings.providers.section.local")}</h3>
          <SettingsList variant="catalog">
            <For each={LOCAL_BACKENDS}>
              {(backend) => {
                // Detection follows the server catalog: the local plugin registers the provider with its
                // discovered models while the backend answers, and drops it again when the server goes away.
                const detected = () => Object.keys(providers.all().get(backend.id)?.models ?? {}).length > 0

                return (
                  <div class="settings-provider-row">
                    <div class="settings-provider-lead">
                      <ProviderIcon id={backend.id} class="settings-provider-icon shrink-0" />

                      <div class="settings-provider-copy">
                        <div class="settings-provider-main">
                          <span class="settings-provider-name">{backend.name}</span>
                          <Badge>
                            {language.t(
                              detected() ? "settings.providers.local.detected" : "settings.providers.local.waiting",
                            )}
                          </Badge>
                        </div>
                        <p class="settings-provider-description font-mono">
                          {configuredBaseUrl(backend.id) ?? backend.url}
                        </p>
                        {/* Key-gated backends list no models until the host-supplied key is stored, so say where to get it. */}
                        <Show when={backend.requiresKey && !storedKeyID(backend.id)}>
                          <p class="settings-provider-description">{language.t("settings.providers.local.keyRequired")}</p>
                        </Show>
                      </div>
                    </div>
                    <Button
                      size="normal"
                      variant="ghost-muted"
                      onClick={() =>
                        dialog.show(() => (
                          <DialogLocalBackendEdit
                            backend={{
                              id: backend.id,
                              name: backend.name,
                              defaultUrl: backend.url,
                              baseUrl: configuredBaseUrl(backend.id),
                              keyCredentialID: storedKeyID(backend.id),
                            }}
                            directory={props.directory}
                          />
                        ))
                      }
                    >
                      {language.t("common.edit")}
                    </Button>
                  </div>
                )
              }}
            </For>
          </SettingsList>
        </div>
      </div>
    </>
  )
}
