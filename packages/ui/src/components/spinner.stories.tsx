import { Spinner } from "./spinner"

const docs = `### Overview
Activity indicator for AI work: a running session, turn, subagent or tool. Busy session tabs, \`ActivityRing\`
and the session progress indicator render it. Other loading states use \`Loader\`.

### Variants and states
- Breathing arc: one rounded-cap arc rotates while its length eases in and out, reading as a calm breath.

### Behavior
- CSS animation only. \`syncSpinPhase\` pins every instance to the same start, so spinners on screen stay in phase.
- Reduced motion freezes it on a still arc.

### Accessibility
- Use alongside text or aria-live regions to convey loading state.
`

type Args = { speed: number; size: number }

export default {
  title: "UI/Spinner",
  id: "components-spinner",
  component: Spinner,
  tags: ["autodocs"],
  args: { speed: 1, size: 16 },
  argTypes: {
    speed: { control: { type: "range", min: 0.25, max: 2, step: 0.05 } },
    size: { control: { type: "range", min: 12, max: 48, step: 1 } },
  },
  render: (args: Args) => (
    <Spinner style={{ width: `${args.size}px`, height: `${args.size}px`, "--spinner-time": String(1 / args.speed) }} />
  ),
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const BreathingArc = {}
