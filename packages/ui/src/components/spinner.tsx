import { splitProps, type ComponentProps, type JSX } from "solid-js"
import { syncSpinPhase } from "../hooks/spin-phase"

// Every AI activity spinner (busy session tabs, the activity chip, subagents, tool cards) shows the breathing arc.
// Non-AI loading uses Loader.

/**
 * A single rounded-cap arc that rotates while its length eases in and out, reading as a calm breath rather than a
 * mechanical sweep. One SVG with compositor-friendly transform rotation plus a small dash animation; `syncSpinPhase`
 * pins every instance to the same start so spinners on screen stay in phase.
 * `width` and `height` size it like an SVG's attributes, below any CSS size.
 */
export function Spinner(
  props: Omit<ComponentProps<"span">, "style"> & {
    "data-component"?: string
    width?: number
    height?: number
    style?: JSX.CSSProperties
  },
) {
  const [local, rest] = splitProps(props, ["class", "classList", "data-component", "width", "height", "style"])

  return (
    <span
      {...rest}
      ref={syncSpinPhase}
      data-component={local["data-component"] ?? "spinner"}
      data-slot="spinner-ring"
      classList={{ ...local.classList, [local.class ?? ""]: !!local.class }}
      style={{
        ...local.style,
        "--spinner-width": local.width === undefined ? undefined : `${local.width}px`,
        "--spinner-height": local.height === undefined ? undefined : `${local.height}px`,
      }}
    >
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" pathLength={100} />
      </svg>
    </span>
  )
}
