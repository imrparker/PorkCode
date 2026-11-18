import { createUniqueId, type ComponentProps } from "solid-js"

// The PorkCode wordmark in the UI font. Callers size it; `fade` dissolves the baseline into the surface and
// `outline` renders hairline letterforms for splash-style reveals. The brand name is exempt from translation.
export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      role="img"
      aria-label="porkcode"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`} opacity={props.muted === false ? 1 : 0.16 * 0.7}>
          <text
            x="360"
            y="92"
            text-anchor="middle"
            font-family="var(--font-family-sans)"
            font-size="84"
            font-weight="500"
            letter-spacing="-3"
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
            class={props.outline ? "[vector-effect:non-scaling-stroke]" : undefined}
          >
            porkcode
          </text>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="68" x2="360" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
