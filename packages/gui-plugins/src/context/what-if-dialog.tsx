import { createMemo, For, Show } from "solid-js"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { useI18n } from "@opencode/ui/context/i18n"
import type { ExperimentalPricingWhatIfOutput } from "@opencode/client/promise"
import { usePlugin, type DialogHandle, type Dialogs } from "@opencode/plugin/gui"
import type definition from "./index"

/** Opens the full comparison table; picking a row pins it as the Context tab's reference model. */
export function openWhatIfDialog(dialogs: Dialogs, whatIf: ExperimentalPricingWhatIfOutput) {
  dialogs.open((dialog) => <DialogWhatIf whatIf={whatIf} dialog={dialog} />)
}

function DialogWhatIf(props: { whatIf: ExperimentalPricingWhatIfOutput; dialog: DialogHandle }) {
  const ctx = usePlugin<typeof definition>()
  const i18n = useI18n()

  const usd = createMemo(() => new Intl.NumberFormat(i18n.locale(), { style: "currency", currency: "USD" }))

  const asOf = createMemo(
    () => new Intl.DateTimeFormat(i18n.locale(), { dateStyle: "medium" }).format(new Date(props.whatIf.asOf)),
  )

  // Cheapest first, so the realistic candidates sit at the top of a long rate card.
  const sorted = createMemo(() => [...props.whatIf.comparisons].toSorted((a, b) => a.cost - b.cost))

  return (
    <Dialog size="large" class="w-[min(calc(100vw-40px),620px)] max-h-[min(calc(100vh-80px),640px)] overflow-hidden">
      <DialogHeader closeLabel={ctx.t("pricing.dialog.close")}>
        <DialogTitleGroup
          title={ctx.t("pricing.dialog.title")}
          description={ctx.t("pricing.dialog.subtitle", { date: asOf() })}
        />
      </DialogHeader>
      <DialogBody class="flex flex-col">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-4 pb-1 text-12-regular text-text-weak">
          <span>{ctx.t("pricing.dialog.model")}</span>
          <span>{ctx.t("pricing.dialog.cost")}</span>
        </div>
        <For each={sorted()}>
          {(comparison) => {
            const pinned = () => ctx.stores.pricing.value.reference === comparison.reference.id

            return (
              <button
                type="button"
                class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-md px-4 py-2 text-left hover:bg-surface-base"
                onClick={() => {
                  ctx.stores.pricing.update((draft) => {
                    draft.reference = comparison.reference.id
                  })
                  props.dialog.close()
                }}
              >
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="flex items-center gap-2 text-14-medium text-text-strong">
                    <span class="min-w-0 truncate">{comparison.reference.name}</span>
                    <Show when={pinned()}>
                      <Icon name="check" size="small" class="shrink-0 text-text-strong" />
                    </Show>
                  </span>
                  <span class="truncate text-12-regular text-text-weak">
                    {comparison.reference.provider}
                    <Show when={comparison.reference.note}>
                      {" · "}
                      {comparison.reference.note}
                    </Show>
                  </span>
                </span>
                <span class="text-14-medium tabular-nums text-text-strong">{usd().format(comparison.cost)}</span>
              </button>
            )
          }}
        </For>
        <p class="px-4 pt-3 pb-1 text-12-regular text-text-weak">{ctx.t("pricing.dialog.note")}</p>
      </DialogBody>
    </Dialog>
  )
}

/** The pinned reference's row for the Context tab: what this session would have cost on that model. */
export function WhatIfSummary(props: { whatIf: ExperimentalPricingWhatIfOutput }) {
  const ctx = usePlugin<typeof definition>()
  const i18n = useI18n()

  const usd = createMemo(() => new Intl.NumberFormat(i18n.locale(), { style: "currency", currency: "USD" }))

  const asOf = createMemo(
    () => new Intl.DateTimeFormat(i18n.locale(), { dateStyle: "medium" }).format(new Date(props.whatIf.asOf)),
  )

  // A rate-card refresh can retire the pinned id; fall back to the first reference rather than an empty row.
  const comparison = createMemo(
    () =>
      props.whatIf.comparisons.find((entry) => entry.reference.id === ctx.stores.pricing.value.reference) ??
      props.whatIf.comparisons[0],
  )

  return (
    <div class="flex flex-col gap-3">
      <div class="text-12-medium text-text-base">{ctx.t("pricing.section")}</div>
      <Show when={comparison()}>
        {(entry) => (
          <div class="grid grid-cols-1 @[32rem]:grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <div class="text-12-regular text-text-weak">
                {ctx.t("pricing.onModel", { model: entry().reference.name })}
              </div>
              <div class="text-12-medium tabular-nums text-text-strong">{usd().format(entry().cost)}</div>
            </div>
          </div>
        )}
      </Show>
      <div class="flex items-center justify-between gap-4">
        <span class="min-w-0 truncate text-12-regular text-text-weak">{ctx.t("pricing.asOf", { date: asOf() })}</span>
        <button
          type="button"
          class="shrink-0 text-12-medium text-text-base underline-offset-2 hover:underline"
          onClick={() => openWhatIfDialog(ctx.dialogs, props.whatIf)}
        >
          {ctx.t("pricing.seeAll")}
        </button>
      </div>
    </div>
  )
}
