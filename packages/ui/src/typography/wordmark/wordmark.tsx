import { createUniqueId, type ComponentProps } from "solid-js"

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
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M0 18.4286H73.8462V110.5714H18.4615V129H0V18.4286ZM18.4615 36.8571V92.1429H55.3846V36.8571H18.4615Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M92.3077 18.4286H166.1538V110.5714H92.3077V18.4286ZM110.7692 36.8571V92.1429H147.6923V36.8571H110.7692Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M184.6154 18.4286H258.4615V36.8571H203.0769V110.5714H184.6154V18.4286Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M276.9231 18.4286H295.3846V55.2857H313.8462V36.8571H332.3077V18.4286H350.7692V110.5714H332.3077V92.1429H313.8462V73.7143H295.3846V110.5714H276.9231V18.4286Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M369.2308 18.4286H443.0769V36.8571H387.6923V92.1429H443.0769V110.5714H369.2308V18.4286Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M461.5385 18.4286H535.3846V110.5714H461.5385V18.4286ZM480 36.8571V92.1429H516.9231V36.8571H480Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M609.2308 0H627.6923V110.5714H553.8462V18.4286H609.2308V0ZM572.3077 36.8571V92.1429H609.2308V36.8571H572.3077Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M646.1538 18.4286H720V73.7143H664.6154V92.1429H720V110.5714H646.1538V18.4286ZM664.6154 36.8571V55.2857H701.5385V36.8571H664.6154Z"
            />
          </g>
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
