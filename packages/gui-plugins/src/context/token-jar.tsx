// "Pork Default" token jar — the skeuomorphic face of session context usage.
//
// Purely presentational: it reads the same memos the flat indicator/tab already use and paints them as
// brass tokens in a glass jar. The jar starts full; spending context drops coins out through the bottom,
// and compaction refills it. Only mounted when the `pork-default` theme is active — every other theme keeps
// the stock ProgressCircle and stats grid untouched.
//
// Animation model: every coin stays in the DOM (deterministic seeded layout, so coins never reshuffle).
// Spent coins get `data-hidden`, which CSS transitions into a staggered drop out of the jar's base; removing
// it plays the same transition backwards as a refill sweep. Reduced motion disables the transitions via
// frosted-surfaces.css — no timers or keyframes live here.

import { For, createMemo } from "solid-js"

const COIN_ID = "pork-default-coin"
const NICKEL_ID = "pork-default-nickel"

// Deterministic pseudo-random in [0,1) so coins settle in the same spots across reactive updates.
function jitter(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// One shared <defs> for every jar/coin on the page: a brass token stamped with a piggy bank.
// Duplicate ids across instances resolve to the first identical definition, which is harmless here.
export function TokenDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <radialGradient id={NICKEL_ID} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stop-color="#eef0f2" />
          <stop offset="55%" stop-color="#b7bcc1" />
          <stop offset="100%" stop-color="#787d82" />
        </radialGradient>
        <symbol id={COIN_ID} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill={`url(#${NICKEL_ID})`} stroke="#5c6166" stroke-width="1" />
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="#6b7075" stroke-width="0.8" opacity="0.7" />
          {/* Piggy bank stamp */}
          <g fill="#5c6166">
            <ellipse cx="11.6" cy="12.6" rx="5" ry="3.8" />
            <path d="M15.4 10.6 L17.4 9.2 L17.2 11.6 Z" />
            <ellipse cx="16.9" cy="12.9" rx="1.5" ry="1.8" />
            <rect x="8.4" y="15.4" width="1.6" height="2.4" rx="0.6" />
            <rect x="12.4" y="15.4" width="1.6" height="2.4" rx="0.6" />
          </g>
          <path
            d="M6.6 11.8 q-1.6 -0.6 -0.9 -2.1"
            fill="none"
            stroke="#5c6166"
            stroke-width="0.9"
            stroke-linecap="round"
          />
          <circle cx="17.3" cy="12.5" r="0.35" fill="#43484d" />
        </symbol>
      </defs>
    </svg>
  )
}

// The header gauge: a single nickel coin with the used share cut into it like a slot gauge.
export function CoinGauge(props: { percentage: number; size?: number }) {
  const radius = 6.5
  const circumference = () => 2 * Math.PI * radius

  return (
    <>
      <TokenDefs />
      <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7.2" fill={`url(#${NICKEL_ID})`} stroke="#5c6166" stroke-width="0.9" />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="#2f74b5"
          stroke-width="2.4"
          opacity="0.75"
          stroke-dasharray={`${(Math.max(0, Math.min(100, props.percentage)) / 100) * circumference()} ${circumference()}`}
          transform="rotate(-90 8 8)"
        />
        <circle cx="8" cy="8" r="2" fill="#5c6166" opacity="0.55" />
      </svg>
    </>
  )
}

type Coin = { id: number; x: number; y: number; tilt: number }

// A jar of nickel tokens. `remaining` is the percent still unspent; coins leaving or returning play a
// staggered drop/sweep (see .skeuo-jar-coin in frosted-surfaces.css).
function Jar(props: { remaining: number; width: number; height: number; capacity: number; perRow: number }) {
  const layout = createMemo<Coin[]>(() => {
    const coins: Coin[] = []
    const bodyTop = props.height * 0.28
    const bodyBottom = props.height - 10
    const rows = Math.ceil(props.capacity / props.perRow)
    const rowH = (bodyBottom - bodyTop) / rows

    for (let i = 0; i < props.capacity; i++) {
      const row = Math.floor(i / props.perRow)
      const col = i % props.perRow
      const slot = (props.width - 16) / props.perRow
      coins.push({
        id: i,
        x: 8 + col * slot + (row % 2 ? slot * 0.35 : 0) + jitter(i) * slot * 0.4,
        y: bodyBottom - rowH * (row + 0.6) + jitter(i + 99) * 3,
        tilt: (jitter(i + 7) - 0.5) * 28,
      })
    }

    return coins
  })

  const shown = createMemo(() => Math.round((Math.max(0, Math.min(100, props.remaining)) / 100) * props.capacity))
  const clipID = `skeuo-jar-clip-${props.width}-${props.height}`

  return (
    <svg class="skeuo-jar" width={props.width} height={props.height} viewBox={`0 0 ${props.width} ${props.height}`}>
      <defs>
        <clipPath id={clipID}>
          <rect x="12" y={props.height * 0.26} width={props.width - 24} height={props.height * 0.72} rx="12" />
        </clipPath>
      </defs>
      {/* Coins inside the glass: outer g drops, inner use keeps its tilt (CSS transform would override it). */}
      <g clip-path={`url(#${clipID})`}>
        <For each={layout()}>
          {(coin) => (
            <g
              class="skeuo-jar-coin"
              data-hidden={coin.id >= shown() ? "" : undefined}
              style={{ "transition-delay": `${(coin.id % 8) * 40}ms` }}
            >
              <use
                href={`#${COIN_ID}`}
                x={coin.x - 8}
                y={coin.y - 8}
                width="16"
                height="16"
                transform={`rotate(${coin.tilt} ${coin.x} ${coin.y})`}
              />
            </g>
          )}
        </For>
      </g>
      {/* Glass: body, neck, rim, and a highlight stripe. */}
      <rect
        x="10"
        y={props.height * 0.24}
        width={props.width - 20}
        height={props.height * 0.76}
        rx="14"
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(226,229,232,0.4)"
        stroke-width="1.5"
      />
      <rect
        x={props.width * 0.3}
        y={props.height * 0.1}
        width={props.width * 0.4}
        height={props.height * 0.16}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(226,229,232,0.4)"
        stroke-width="1.5"
      />
      <rect
        x={props.width * 0.24}
        y={props.height * 0.04}
        width={props.width * 0.52}
        height={props.height * 0.07}
        rx="4"
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(226,229,232,0.5)"
        stroke-width="1.5"
      />
      <rect x="16" y={props.height * 0.3} width="4" height={props.height * 0.55} rx="2" fill="rgba(255,255,255,0.16)" />
    </svg>
  )
}

// The menu-popover jar: the whole metaphor in a glance above the stat rows.
export function JarMini(props: { remaining: number }) {
  return (
    <div class="skeuo-jar-mini" aria-hidden="true">
      <TokenDefs />
      <Jar remaining={props.remaining} width={56} height={72} capacity={14} perRow={3} />
    </div>
  )
}

type Tray = { key: string; label: string; value: number }

// The context-tab desk scene: jar + change trays for the token breakdown + a price tag on the handle.
export function TokenJar(props: { remaining: number; cost: string; trays: Tray[] }) {
  const total = () => props.trays.reduce((sum, tray) => sum + tray.value, 0)
  // Coin height per tray scales with its share of the spend (sqrt so a big row doesn't tower).
  const stack = (value: number) =>
    value > 0 ? Math.max(1, Math.min(6, Math.round(Math.sqrt(value / Math.max(1, total())) * 7))) : 0

  return (
    <div class="skeuo-desk-scene" data-component="token-jar">
      <TokenDefs />
      <div class="skeuo-desk-scene__jar">
        <Jar remaining={props.remaining} width={120} height={156} capacity={42} perRow={6} />
        <span class="skeuo-price-tag">{props.cost}</span>
      </div>
      <div class="skeuo-trays">
        <For each={props.trays}>
          {(tray) => (
            <div class="skeuo-tray">
              <svg width="52" height="34" viewBox="0 0 52 34" aria-hidden="true">
                <ellipse
                  cx="26"
                  cy="28"
                  rx="24"
                  ry="5.5"
                  fill="rgba(70,74,78,0.3)"
                  stroke="rgba(226,229,232,0.3)"
                  stroke-width="1"
                />
                <For each={Array.from({ length: stack(tray.value) })}>
                  {(_, i) => (
                    <use
                      href={`#${COIN_ID}`}
                      x={18 + jitter(i() * 13) * 6}
                      y={20 - i() * 4.5}
                      width="15"
                      height="15"
                      transform={`rotate(${(jitter(i()) - 0.5) * 16} 26 ${22 - i() * 4})`}
                    />
                  )}
                </For>
              </svg>
              <div class="skeuo-tray__label">{tray.label}</div>
              <div class="skeuo-tray__value">{tray.value.toLocaleString()}</div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

// The jar drains as usage rises; unknown usage keeps it full.
export function jarRemaining(usage: number | null | undefined) {
  if (usage == null) return 100

  return Math.max(0, Math.min(100, 100 - usage))
}
