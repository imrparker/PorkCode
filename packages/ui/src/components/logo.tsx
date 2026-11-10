import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  // The wordmark's lowercase p glyph, lifted to the origin; the counter carries the shadow tone like Mark.
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 73.8462 110.5714"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.4615 18.4286H55.3846V73.7143H18.4615Z" fill="var(--icon-weak-base)" />
      <path
        d="M0 0H73.8462V92.1429H18.4615V110.5714H0V0ZM18.4615 18.4286V73.7143H55.3846V18.4286H18.4615Z"
        fill="var(--icon-strong-base)"
      />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M18 30H6V18H18V30Z" fill="var(--icon-weak-base)" />
        <path d="M0 12H24V6H0ZM0 30H6V12H0ZM18 30H24V12H18ZM0 36H24V30H0ZM0 42H6V36H0Z" fill="var(--icon-base)" />
        <path d="M48 30H36V18H48V30Z" fill="var(--icon-weak-base)" />
        <path d="M30 12H54V6H30ZM30 30H36V12H30ZM48 30H54V12H48ZM30 36H54V30H30Z" fill="var(--icon-base)" />
        <path d="M60 12H84V6H60ZM60 36H66V12H60Z" fill="var(--icon-base)" />
        <path d="M90 18H96V6H90ZM108 12H114V6H108ZM102 18H114V12H102ZM90 24H114V18H90ZM90 36H96V24H90ZM102 30H114V24H102ZM108 36H114V30H108Z" fill="var(--icon-base)" />
        <path d="M144 30H126V18H144V30Z" fill="var(--icon-weak-base)" />
        <path d="M120 12H144V6H120ZM120 30H126V12H120ZM120 36H144V30H120Z" fill="var(--icon-strong-base)" />
        <path d="M168 30H156V18H168V30Z" fill="var(--icon-weak-base)" />
        <path d="M150 12H174V6H150ZM150 30H156V12H150ZM168 30H174V12H168ZM150 36H174V30H150Z" fill="var(--icon-strong-base)" />
        <path d="M198 30H186V18H198V30Z" fill="var(--icon-weak-base)" />
        <path d="M198 6H204V0H198ZM180 12H204V6H180ZM180 30H186V12H180ZM198 30H204V12H198ZM180 36H204V30H180Z" fill="var(--icon-strong-base)" />
        <path d="M234 30H216V24H234V30Z" fill="var(--icon-weak-base)" />
        <path d="M210 12H234V6H210ZM210 18H216V12H210ZM228 18H234V12H228ZM210 24H234V18H210ZM210 30H216V24H210ZM210 36H234V30H210Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
