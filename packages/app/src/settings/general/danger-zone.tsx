import { Component, Match, Show, Switch, createSignal, onCleanup, type Accessor } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { Loader } from "@opencode/ui/loader"
import { TextField } from "@opencode/ui/text-field"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import {
  CONFIRMATION_WORD,
  canSubmitReset,
  createResetState,
  transitionReset,
  type ResetEffect,
  type ResetEvent,
  type ResetState,
} from "./reset-machine"

/**
 * The factory-reset row and its confirmation dialog. Only desktop builds carry `platform.factoryReset`; a web app
 * pointed at someone's server must never wipe the machine it merely displays, so the section hides without it.
 */
export const DangerZoneSection: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const [state, setState] = createSignal<ResetState>(createResetState())

  // The app quits as soon as the wipe finishes; a settled call — resolved or a dropped connection — is only a real
  // failure once this window is still alive after a grace period. The driver owns the timer, never the machine.
  let pending: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(pending))
  const report = (message: string, graceMs: number) => {
    clearTimeout(pending)
    pending = setTimeout(() => dispatch({ type: "failed", message }), graceMs)
  }

  const run = (effect: ResetEffect) => {
    platform.factoryReset?.({ includeCliBinary: effect.includeCliBinary }).then(
      () => report(language.t("settings.general.reset.stall"), 6000),
      (error: unknown) => report(error instanceof Error ? error.message : String(error), 2500),
    )
  }

  const dispatch = (event: ResetEvent) => {
    const next = transitionReset(state(), event)
    setState(next.state)
    for (const effect of next.effects ?? []) run(effect)
  }

  return (
    <Show when={platform.factoryReset}>
      <section class="settings-section" aria-label={language.t("settings.general.dangerZone.title")}>
        <h3 class="settings-section-title">{language.t("settings.general.dangerZone.title")}</h3>
        <SettingsList>
          <SettingsRow
            title={language.t("settings.general.reset.title")}
            description={language.t("settings.general.reset.description")}
          >
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                dispatch({ type: "open" })
                void dialog.push(
                  () => (
                    <DialogFactoryReset
                      view={state}
                      onToggle={(includeCliBinary) => dispatch({ type: "cliToggled", includeCliBinary })}
                      onTyped={(value) => dispatch({ type: "typed", value })}
                      onSubmit={() => dispatch({ type: "submit" })}
                    />
                  ),
                  () => dispatch({ type: "close" }),
                )
              }}
            >
              {language.t("settings.general.reset.button")}
            </Button>
          </SettingsRow>
        </SettingsList>
      </section>
    </Show>
  )
}

const DialogFactoryReset: Component<{
  view: Accessor<ResetState>
  onToggle: (includeCliBinary: boolean) => void
  onTyped: (value: string) => void
  onSubmit: () => void
}> = (props) => {
  const language = useLanguage()
  const dialog = useDialog()

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("settings.general.reset.dialog.title")}
          description={
            <div class="flex flex-col gap-2">
              <div>{language.t("settings.general.reset.dialog.warning")}</div>
              <div>{language.t("settings.general.reset.dialog.keeps")}</div>
              <Show when={failure(props.view())}>
                <div>{failure(props.view())}</div>
              </Show>
            </div>
          }
        />
      </DialogHeader>
      <Switch>
        <Match when={props.view().status === "wiping"}>
          <div class="flex items-center gap-3 py-6">
            <Loader />
            <span>{language.t("settings.general.reset.wiping")}</span>
          </div>
        </Match>
        <Match when={true}>
          <div class="flex flex-col gap-4 pt-2">
            <Checkbox
              checked={editable(props.view()).includeCliBinary}
              description={language.t("settings.general.reset.dialog.cli.description")}
              onChange={(checked: boolean) => props.onToggle(checked)}
            >
              {language.t("settings.general.reset.dialog.cli.title")}
            </Checkbox>
            <TextField
              type="text"
              label={language.t("settings.general.reset.dialog.confirm.label")}
              hideLabel
              placeholder={language.t("settings.general.reset.dialog.confirm.placeholder", {
                word: CONFIRMATION_WORD,
              })}
              value={editable(props.view()).typed}
              onInput={(event) => props.onTyped(event.currentTarget.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="neutral" autofocus onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button type="button" variant="danger" disabled={!canSubmitReset(props.view())} onClick={props.onSubmit}>
              {language.t("settings.general.reset.action")}
            </Button>
          </DialogFooter>
        </Match>
      </Switch>
    </Dialog>
  )
}

// The two editable phases share their fields; `wiping` never renders this branch, so the fallback is unreachable.
function editable(state: ResetState) {
  return state.status === "confirming" || state.status === "failed" ? state : { includeCliBinary: false, typed: "" }
}

function failure(state: ResetState) {
  return state.status === "failed" ? state.message : undefined
}
