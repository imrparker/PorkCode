import { For, Show, createMemo, type ComponentProps, type JSX } from "solid-js"
import { ProgressCircle } from "@opencode/ui/progress-circle"
import { Button } from "@opencode/ui/button"
import { Menu } from "@opencode/ui/menu"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { Tooltip } from "@opencode/ui/tooltip"
import { useI18n } from "@opencode/ui/context/i18n"
import { lastAssistantWithUsage } from "@opencode/client/solid"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { catalogModel, syncCatalog } from "./catalog"
import type definition from "./index"
import { useWhatIf } from "./what-if"

export function SessionContextUsage(props: {
  session: MountedSession
  /** False while the session's view is detached; it loads nothing until selected again. */
  active?: boolean
  variant?: "button" | "indicator"
  placement?: ComponentProps<typeof Tooltip>["placement"]
  /** The button shows only its ring and opens the usage in a menu, so a narrow header keeps room for the title. */
  compact?: boolean
}) {
  const ctx = usePlugin<typeof definition>()
  const layout = ctx.layout
  const i18n = useI18n()

  const catalog = syncCatalog(
    () => props.session,
    () => props.active !== false,
  )

  const variant = createMemo(() => props.variant ?? "button")

  const messages = createMemo(() =>
    props.session.id ? props.session.server.data.session.message.list(props.session.id) : [],
  )

  const usd = createMemo(
    () =>
      new Intl.NumberFormat(i18n.locale(), {
        style: "currency",
        currency: "USD",
      }),
  )

  const info = createMemo(() =>
    props.session.id ? props.session.server.data.session.get(props.session.id) : undefined,
  )

  // Same step as the TUI: after the last completed compaction and before an undo boundary.
  const context = createMemo(() => {
    const message = lastAssistantWithUsage(messages(), info()?.revert?.messageID)

    if (!message) return
    const model = catalogModel(props.session, message.model)?.model

    const total =
      message.tokens.input +
      message.tokens.output +
      message.tokens.reasoning +
      message.tokens.cache.read +
      message.tokens.cache.write

    return {
      total,
      usage: model?.limit.context ? Math.round((total / model.limit.context) * 100) : null,
    }
  })

  const tokens = createMemo(() =>
    new Intl.NumberFormat(i18n.locale(), { notation: "compact", maximumFractionDigits: 0 })
      .format(context()?.total ?? 0)
      .toLocaleLowerCase(i18n.locale()),
  )

  // A root session's cost includes its subagent sessions, as in the TUI.
  const spent = createMemo(() => (props.session.id ? props.session.server.data.session.cost(props.session.id) : 0))

  const cost = createMemo(() => usd().format(spent()))

  // Spend anywhere in the family keeps the cost visible, even when this session's model is free.
  const showCost = createMemo(() => {
    if (spent() > 0) return true
    const ref = info()?.model ?? messages().findLast((item) => item.type === "assistant")?.model
    const model = ref ? catalogModel(props.session, ref)?.model : undefined

    if (!model) return true

    return model.cost.some((cost) => cost.input > 0 || cost.output > 0 || cost.cache.read > 0 || cost.cache.write > 0)
  })

  const openContext = () => {
    if (!props.session.id) return
    catalog.retry()
    layout.toggle(`${ctx.id}:main`, props.session)
  }

  // Estimated cost on paid reference models; asked only when the menu opens, so the header loads nothing extra.
  const whatIf = useWhatIf(() => props.session)

  const sortedComparisons = createMemo(() => {
    const data = whatIf.data()

    if (!data || data.steps === 0) return []

    return [...data.comparisons].toSorted((a, b) => a.cost - b.cost)
  })

  const pinReference = (reference: string) => {
    ctx.stores.pricing.update((draft) => {
      draft.reference = reference
    })
  }

  const viewContext = () => {
    if (!props.session.id) return
    catalog.retry()
    layout.open(`${ctx.id}:main`, props.session)
  }

  const circle = () => (
    <div class="flex items-center justify-center">
      <ProgressCircle
        appearance="indicator"
        size={16}
        strokeWidth={2}
        percentage={context()?.usage ?? 0}
        style={{
          "--progress-circle-background": "var(--v2-background-bg-layer-04)",
          "--progress-circle-background-overlay": "var(--v2-overlay-simple-overlay-pressed, transparent)",
          "--progress-circle-progress": "var(--v2-icon-icon-base, var(--icon-base))",
        }}
      />
    </div>
  )

  const compactCircle = () => (
    <div class="flex items-center justify-center">
      <ProgressCircle appearance="compact" size={16} percentage={context()?.usage ?? 0} />
    </div>
  )

  const menuRow = (name: JSX.Element, value: JSX.Element) => (
    <div class="flex h-7 min-w-0 items-center gap-4 px-3 text-[13px] font-[440] leading-[var(--line-height-compact)] tracking-[-0.04px]">
      <span class="shrink-0 text-v2-text-text-muted">{name}</span>
      <span class="ml-auto min-w-0 truncate text-right tabular-nums text-v2-text-text-base">{value}</span>
    </div>
  )

  const usageMenu = () => (
    <Menu
      placement="bottom-end"
      gutter={4}
      modal={false}
      onOpenChange={(open) => {
        if (open) {
          catalog.retry()
          whatIf.refresh()
        }
      }}
    >
      <Tooltip value={ctx.t("usage.view")} placement={props.placement ?? "top"}>
        <Menu.Trigger
          as={Button}
          type="button"
          variant="ghost-muted"
          class="group shrink-0"
          style={{ padding: "0 6px", color: "var(--v2-text-text-faint)" }}
          aria-label={ctx.t("usage.view")}
        >
          {compactCircle()}
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal>
        <Menu.Content class="w-[200px] max-w-[calc(100vw-16px)]" aria-label={ctx.t("usage.view")}>
          {menuRow(ctx.t("usage.tokens"), context()?.total.toLocaleString(i18n.locale()) ?? "0")}
          <Show when={showCost()}>{menuRow(ctx.t("usage.cost"), cost())}</Show>
          {menuRow(ctx.t("usage.usage"), `${context()?.usage ?? 0}%`)}
          <Menu.Separator />
          <Menu.Item onSelect={viewContext}>{ctx.t("usage.view")}</Menu.Item>
          <Show when={sortedComparisons().length > 0}>
            <Menu.Separator />
            <Menu.Sub gutter={4} overflowPadding={24}>
              <Menu.SubTrigger class="[&_[data-slot=menu-v2-item-chevron]]:text-v2-icon-icon-muted">
                {ctx.t("pricing.compare")}
              </Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent class="max-h-[66.667dvh] w-[240px] !p-0 [@media(max-height:600px)]:max-h-[calc(100dvh-48px)]">
                  <MenuScroll viewportClass="p-0.5">
                    <For each={sortedComparisons()}>
                      {(comparison) => (
                        <Menu.Item onSelect={() => pinReference(comparison.reference.id)}>
                          <span class="min-w-0 flex-1 truncate">{comparison.reference.name}</span>
                          <span class="shrink-0 tabular-nums text-v2-text-text-muted">
                            {usd().format(comparison.cost)}
                          </span>
                        </Menu.Item>
                      )}
                    </For>
                  </MenuScroll>
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
            <Menu.Item
              onSelect={async () => {
                const data = whatIf.data()

                if (!data) return

                const { openWhatIfDialog } = await import("./what-if-dialog")

                if (ctx.signal.aborted) return
                openWhatIfDialog(ctx.dialogs, data)
              }}
            >
              {ctx.t("pricing.seeAll")}
            </Menu.Item>
          </Show>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )

  return (
    <Show when={props.session.id}>
      <Show when={!props.compact} fallback={usageMenu()}>
        <Show
          when={variant() === "indicator"}
          fallback={
            <Tooltip value={ctx.t("usage.toggle")} placement={props.placement ?? "top"}>
              <Button
                type="button"
                variant="ghost-muted"
                class="group shrink-0"
                style={{ padding: "0 6px", color: "var(--v2-text-text-faint)" }}
                onClick={openContext}
                aria-expanded={layout.state(`${ctx.id}:main`, props.session) === "visible"}
                aria-label={ctx.t("usage.toggle")}
              >
                <span class="flex items-center gap-2 whitespace-nowrap group-active:text-v2-text-text-muted">
                  {compactCircle()}
                  <span>{tokens()}</span>
                  <Show when={showCost()}>
                    <span aria-hidden="true" class="flex w-1.5 shrink-0 items-center justify-center">
                      ·
                    </span>
                    <span>{cost()}</span>
                  </Show>
                </span>
              </Button>
            </Tooltip>
          }
        >
          {circle()}
        </Show>
      </Show>
    </Show>
  )
}
