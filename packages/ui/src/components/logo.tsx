// The PorkCode monogram: a rounded lowercase p with a soft offset echo, echoing the two-tone depth of the old mark
// without its pixel grid. Callers size it; logo.css matches the Mark viewBox so the echo is never clipped.

const P_LETTER = (offset: number, fill: string) => (
  <g transform={`translate(${offset} ${offset})`}>
    <rect x="2.6" y="1.8" width="3.6" height="16.4" rx="1.8" fill={fill} />
    <path
      fill-rule="evenodd"
      d="M4.4 1.8h5a5.7 5.7 0 0 1 0 11.4H4.4V1.8Zm3.6 3.4v4.6h1.4a2.3 2.3 0 0 0 0-4.6H8Z"
      fill={fill}
    />
  </g>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 17 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {P_LETTER(1.4, "var(--icon-weak-base)")}
      {P_LETTER(0, "var(--icon-strong-base)")}
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  // Typographic lockup: the monogram plus the brand name in the UI font. textLength keeps the wordmark footprint
  // stable while the user's sans choice loads or differs. The brand name is exempt from translation.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
      role="img"
      aria-label="porkcode"
    >
      <g transform="translate(6 1) scale(2)">
        {P_LETTER(1.4, "var(--icon-weak-base)")}
        {P_LETTER(0, "var(--icon-strong-base)")}
      </g>
      <text
        x="52"
        y="31"
        font-family="var(--font-family-sans)"
        font-size="27"
        font-weight="500"
        letter-spacing="-0.5"
        fill="currentColor"
        textLength="176"
        lengthAdjust="spacingAndGlyphs"
      >
        porkcode
      </text>
    </svg>
  )
}
