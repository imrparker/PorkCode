export * as ScheduleLoop from "./loop.js"

import { Schedule } from "@opencode/schema/schedule"

/** Cadence for `/loop <prompt>` when the user gives no interval. */
const DEFAULT_AMOUNT = 10
const DEFAULT_UNIT: Unit = "minutes"
/** A loop always dies eventually, so a forgotten one cannot run forever. */
export const DEFAULT_ENDS_AFTER = "7 days"

export const USAGE = 'Usage: /loop [interval] [when "<command>" changes] <prompt> | /loop list | /loop stop <number|id|all>'
export const NONPOSITIVE = `The interval must be a positive duration, such as 30s, 5m or 2 hours.\n${USAGE}`
/** The engine expires a loop after DEFAULT_ENDS_AFTER, so an interval that long could never fire once. */
export const TOO_LONG = `A loop must fire before its ${DEFAULT_ENDS_AFTER} expiry; use /schedule for longer intervals.\n${USAGE}`
/** A quoted gate clause that is present but not where it parses would otherwise ride along as prompt prose. */
export const GATE_PLACEMENT = `The when "<command>" changes clause goes right after the interval.\n${USAGE}`

type Unit = "seconds" | "minutes" | "hours" | "days" | "weeks" | "months"

const MILLIS: Record<Unit, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  // Approximation only so intervals at or beyond the horizon are rejected by the WEEK check; never real scheduling math.
  months: 2_592_000_000,
}
/** Matches DEFAULT_ENDS_AFTER; an interval this long cannot fire before the loop expires. */
const WEEK = 7 * 24 * 60 * 60 * 1_000
const UNITS: Record<string, Unit> = {
  s: "seconds",
  sec: "seconds",
  secs: "seconds",
  second: "seconds",
  seconds: "seconds",
  m: "minutes",
  min: "minutes",
  mins: "minutes",
  minute: "minutes",
  minutes: "minutes",
  h: "hours",
  hr: "hours",
  hrs: "hours",
  hour: "hours",
  hours: "hours",
  d: "days",
  day: "days",
  days: "days",
  week: "weeks",
  weeks: "weeks",
  month: "months",
  months: "months",
}

const AMOUNT = String.raw`\d+(?:\.\d+)?`
const WORDS = String.raw`s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|week|weeks|month|months`
/** An interval leading the prompt: `5m`, `45 minutes`, `2 hours,`. */
const LEADING = new RegExp(`^(${AMOUNT}) ?(${WORDS})\\b[,:]?,?\\s*`, "i")
/** An interval trailing the prompt: `check CI every 20 minutes`. */
const TRAILING_EVERY = new RegExp(`\\bevery\\s+(${AMOUNT}) ?(${WORDS})\\b[.,;:!?]*\\s*$`, "i")
/** A quoted gate clause: `when "git rev-parse HEAD" changes`. Each quote style may contain the other. Quotes keep prose like "when it breaks" out of it. */
const GATE = /^when\s+(?:"([^"]+)"|'([^']+)')\s+changes\b[.,;:]?\s*/i
/** Only to reject a negative interval; the minus sign is deliberately absent from the accepted patterns above. */
const NEGATIVE = new RegExp(`^-\\s*${AMOUNT} ?(${WORDS})\\b`, "i")

export type Parsed =
  | { readonly type: "list" }
  | { readonly type: "stop"; readonly target?: string }
  | {
      readonly type: "start"
      /** Canonical duration for `Schedule.When.Every`, e.g. "45 minutes". The engine rejects short forms like "5m". */
      readonly every: string
      readonly prompt: string
      /** Recurring gate so the loop costs nothing on slots where nothing changed. */
      readonly gate?: Schedule.ShellCondition
      readonly endsAfter: string
      readonly notes: readonly string[]
    }
  | { readonly type: "usage"; readonly reason: string }

/** Turns `/loop` arguments into a list, stop or start action without involving the model. */
export const parse = (input: string): Parsed => {
  const text = input.trim()
  if (text === "") return { type: "list" }
  if (text.toLowerCase() === "list") return { type: "list" }
  if (/^stop\b/i.test(text)) return { type: "stop", target: text.slice(4).trim() || undefined }

  const interval = readInterval(text)
  if (interval.type === "error") return { type: "usage", reason: interval.reason }

  const gate = GATE.exec(interval.rest)
  // A clause that is present but not where it parses would otherwise ride along as prompt prose, silently turning a
  // change-gated loop into an ungated one. Say so instead.
  if (gate === null && /\bwhen\s+["']/i.test(interval.rest)) return { type: "usage", reason: GATE_PLACEMENT }

  const prompt = (gate === null ? interval.rest : interval.rest.slice(gate[0].length)).trim()
  if (prompt === "") return { type: "usage", reason: USAGE }

  // A gated loop may poll every 15 seconds; an ungated one has the engine's one-minute floor.
  const condition =
    gate === null ? undefined : { type: "shell" as const, run: gate[1] ?? gate[2], changes: true as const }
  const floor = condition === undefined ? MILLIS.minutes : 15_000
  const millis = interval.amount * MILLIS[interval.unit]
  if (millis >= WEEK) return { type: "usage", reason: TOO_LONG }

  return {
    type: "start",
    every: durationText(Math.max(millis, floor)),
    prompt,
    ...(condition === undefined ? {} : { gate: condition }),
    endsAfter: DEFAULT_ENDS_AFTER,
    notes:
      millis < floor
        ? [`The minimum interval here is ${durationText(floor)}, so the loop runs that often.`]
        : [],
  }
}

type Interval =
  | { readonly type: "ok"; readonly amount: number; readonly unit: Unit; readonly rest: string }
  | { readonly type: "error"; readonly reason: string }

/** Reads a leading (`5m`, `45 minutes,`) or trailing (`every 20 minutes`) interval. Absent means the default cadence. */
const readInterval = (text: string): Interval => {
  if (NEGATIVE.test(text)) return { type: "error", reason: NONPOSITIVE }
  const leading = LEADING.exec(text)
  // Separators the interval leaves behind are noise, not prompt text; only this branch consumes from the front.
  if (leading)
    return positive(
      Number(leading[1]),
      UNITS[leading[2].toLowerCase()],
      text.slice(leading[0].length).replace(/^[\s.,;:!]+/, ""),
    )
  const trailing = TRAILING_EVERY.exec(text)
  if (trailing === null) return { type: "ok", amount: DEFAULT_AMOUNT, unit: DEFAULT_UNIT, rest: text }
  // Drop a separator the user left before "every" ("check ci, every 5m"), mirroring the leading branch.
  const prompt = text.slice(0, trailing.index).replace(/[.,;:!]+\s*$/, "")
  return positive(Number(trailing[1]), UNITS[trailing[2].toLowerCase()], prompt)
}

// A zero interval would otherwise clamp to the floor and start a loop the user did not ask for.
const positive = (amount: number, unit: Unit, rest: string): Interval =>
  amount === 0 ? { type: "error", reason: NONPOSITIVE } : { type: "ok", amount, unit, rest }

/** Renders a duration in the largest whole unit that divides it evenly, since `Schedule.Duration` reads best as one. */
const durationText = (millis: number) => {
  const units: Unit[] = ["days", "hours", "minutes", "seconds"]
  const unit = units.find((candidate) => millis % MILLIS[candidate] === 0 && MILLIS[candidate] <= millis) ?? "seconds"
  const amount = millis / MILLIS[unit]
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`
}
