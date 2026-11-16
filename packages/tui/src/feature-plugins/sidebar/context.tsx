import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createResource, Show } from "solid-js"
import { contextUsage } from "../../util/session"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

/** The sidebar shows this reference by default; the app's Context tab lets you pin another. */
const DEFAULT_REFERENCE = "claude-sonnet-5.5"

export function SidebarContext(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const msg = createMemo(() => props.context.data.session.message.list(props.sessionID))
  const session = createMemo(() => props.context.data.session.get(props.sessionID))
  const cost = createMemo(() => props.context.data.session.cost(props.sessionID))

  // Estimated API cost on paid reference models; the string key refetches only when the session or step count moves.
  const [whatIf] = createResource(
    () => `${props.sessionID}:${msg().length}`,
    () => props.context.client.experimental.pricing.whatIf({ session: props.sessionID }),
  )
  const wouldHave = createMemo(() => {
    const data = whatIf.latest

    if (!data || data.steps === 0) return

    const comparison =
      data.comparisons.find((entry) => entry.reference.id === DEFAULT_REFERENCE) ?? data.comparisons[0]

    if (!comparison || comparison.cost <= 0) return
    return { cost: money.format(comparison.cost), name: comparison.reference.name }
  })

  const state = createMemo(() =>
    contextUsage(msg(), props.context.data.location.model.list(session()?.location), session()?.revert?.messageID),
  )

  return (
    <Show when={state() || cost() > 0}>
      <box>
        <text fg={theme.text.base}>
          <b>Context</b>
        </text>
        <Show when={state()}>
          {(value) => (
            <>
              <text fg={theme.text.muted}>{value().tokens.toLocaleString()} tokens</text>
              <Show when={value().percent !== undefined}>
                <text fg={theme.text.muted}>{value().percent}% used</text>
              </Show>
            </>
          )}
        </Show>
        <Show when={cost() > 0}>
          <text fg={theme.text.muted}>{money.format(cost())} spent</text>
        </Show>
        <Show when={wouldHave()}>
          {(value) => (
            <text fg={theme.text.muted}>would-have ≈ {value().cost} on {value().name}</text>
          )}
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.context",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarContext context={context} sessionID={props.sessionID} />,
    })
  },
})
