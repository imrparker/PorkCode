import { describe, expect, test } from "bun:test"
import { ScheduleLoop } from "@opencode/core/schedule/loop"
import { Schedule } from "@opencode/schema/schedule"
import { Option } from "effect"

type Case = { readonly input: string; readonly expected: ScheduleLoop.Parsed }

/** `every` is always the canonical long form ("45 minutes", "1 day") because the schedule engine rejects short units. */

describe("ScheduleLoop.parse", () => {
  const lists: Case[] = [
    { input: "", expected: { type: "list" } },
    { input: "   ", expected: { type: "list" } },
    { input: "\t\n ", expected: { type: "list" } },
    { input: "list", expected: { type: "list" } },
    { input: "  LIST  ", expected: { type: "list" } },
  ]

  const stops: Case[] = [
    { input: "stop", expected: { type: "stop" } },
    { input: "STOP", expected: { type: "stop" } },
    { input: "stop 2", expected: { type: "stop", target: "2" } },
    { input: "stop all", expected: { type: "stop", target: "all" } },
    { input: "stop check ci", expected: { type: "stop", target: "check ci" } },
  ]

  const starts: Case[] = [
    // Leading interval, short and spelled out.
    {
      input: "5m check the deploy",
      expected: { type: "start", every: "5 minutes", prompt: "check the deploy", endsAfter: "7 days", notes: [] },
    },
    // A trailing comma after the interval is consumed, not left in the prompt.
    {
      input: "45 minutes, review my changes",
      expected: { type: "start", every: "45 minutes", prompt: "review my changes", endsAfter: "7 days", notes: [] },
    },
    // Punctuation the leading interval leaves behind is noise, not prompt text.
    {
      input: "5m.check ci",
      expected: { type: "start", every: "5 minutes", prompt: "check ci", endsAfter: "7 days", notes: [] },
    },
    {
      input: "2 hours x",
      expected: { type: "start", every: "2 hours", prompt: "x", endsAfter: "7 days", notes: [] },
    },
    // Amount 1 reads as a singular unit.
    {
      input: "1 day x",
      expected: { type: "start", every: "1 day", prompt: "x", endsAfter: "7 days", notes: [] },
    },
    // No interval at all falls back to the default cadence.
    {
      input: "check the deploy",
      expected: { type: "start", every: "10 minutes", prompt: "check the deploy", endsAfter: "7 days", notes: [] },
    },
    // Trailing "every" clause is stripped from the prompt.
    {
      input: "check CI every 20 minutes",
      expected: { type: "start", every: "20 minutes", prompt: "check CI", endsAfter: "7 days", notes: [] },
    },
    {
      input: "run tests every 5m",
      expected: { type: "start", every: "5 minutes", prompt: "run tests", endsAfter: "7 days", notes: [] },
    },
    // A separator left before the trailing "every" clause is dropped, not kept in the prompt.
    {
      input: "check ci, every 20 minutes",
      expected: { type: "start", every: "20 minutes", prompt: "check ci", endsAfter: "7 days", notes: [] },
    },
    // Repeated separators after a trailing interval are still consumed.
    {
      input: "run tests every 5m!!",
      expected: { type: "start", every: "5 minutes", prompt: "run tests", endsAfter: "7 days", notes: [] },
    },
    // The trap: prose "every" with no amount must not consume an interval.
    {
      input: "check every PR",
      expected: { type: "start", every: "10 minutes", prompt: "check every PR", endsAfter: "7 days", notes: [] },
    },
    // Only a quoted gate counts; unquoted prose stays in the prompt.
    {
      input: "when it breaks fix ci",
      expected: { type: "start", every: "10 minutes", prompt: "when it breaks fix ci", endsAfter: "7 days", notes: [] },
    },
    // Leading quoted gate with the default interval.
    {
      input: 'when "git rev-parse HEAD" changes review my commits',
      expected: {
        type: "start",
        every: "10 minutes",
        prompt: "review my commits",
        gate: { type: "shell", run: "git rev-parse HEAD", changes: true },
        endsAfter: "7 days",
        notes: [],
      },
    },
    // Interval and gate together.
    {
      input: '45m when "x" changes do y',
      expected: {
        type: "start",
        every: "45 minutes",
        prompt: "do y",
        gate: { type: "shell", run: "x", changes: true },
        endsAfter: "7 days",
        notes: [],
      },
    },
    // A single-quoted gate counts too, so it is never dropped into the prompt as ungated prose.
    {
      input: "when 'git rev-parse HEAD' changes review commits",
      expected: {
        type: "start",
        every: "10 minutes",
        prompt: "review commits",
        gate: { type: "shell", run: "git rev-parse HEAD", changes: true },
        endsAfter: "7 days",
        notes: [],
      },
    },
    // A double-quoted gate may contain an apostrophe, such as a quoted commit message.
    {
      input: "when \"git commit -m 'wip'\" changes ship it",
      expected: {
        type: "start",
        every: "10 minutes",
        prompt: "ship it",
        gate: { type: "shell", run: "git commit -m 'wip'", changes: true },
        endsAfter: "7 days",
        notes: [],
      },
    },
    // The largest interval under the expiry still starts.
    {
      input: "6 days x",
      expected: { type: "start", every: "6 days", prompt: "x", endsAfter: "7 days", notes: [] },
    },
    // With no interval, a leading separator is real prompt text, not noise to strip.
    {
      input: ".NET review build failures",
      expected: {
        type: "start",
        every: "10 minutes",
        prompt: ".NET review build failures",
        endsAfter: "7 days",
        notes: [],
      },
    },
  ]

  // Below the floor, `every` is raised and a note explains it. Ungated loops have a
  // one-minute floor; gated ones may poll down to 15 seconds.
  const clamped: Case[] = [
    {
      input: "30s ping",
      expected: {
        type: "start",
        every: "1 minute",
        prompt: "ping",
        endsAfter: "7 days",
        notes: ["The minimum interval here is 1 minute, so the loop runs that often."],
      },
    },
    // Gated loops keep any cadence at or above the 15-second floor.
    {
      input: '20s when "x" changes ping',
      expected: {
        type: "start",
        every: "20 seconds",
        prompt: "ping",
        gate: { type: "shell", run: "x", changes: true },
        endsAfter: "7 days",
        notes: [],
      },
    },
    {
      input: '15s when "x" changes ping',
      expected: {
        type: "start",
        every: "15 seconds",
        prompt: "ping",
        gate: { type: "shell", run: "x", changes: true },
        endsAfter: "7 days",
        notes: [],
      },
    },
    // Under the gated floor it clamps to 15 seconds, not a minute.
    {
      input: '10s when "x" changes ping',
      expected: {
        type: "start",
        every: "15 seconds",
        prompt: "ping",
        gate: { type: "shell", run: "x", changes: true },
        endsAfter: "7 days",
        notes: ["The minimum interval here is 15 seconds, so the loop runs that often."],
      },
    },
  ]

  const usages: Case[] = [
    { input: "5m", expected: { type: "usage", reason: ScheduleLoop.USAGE } },
    { input: 'when "x" changes', expected: { type: "usage", reason: ScheduleLoop.USAGE } },
    { input: '45m when "x" changes', expected: { type: "usage", reason: ScheduleLoop.USAGE } },
    // A zero interval would otherwise clamp to the floor and start a loop nobody asked for.
    { input: "0m check ci", expected: { type: "usage", reason: ScheduleLoop.NONPOSITIVE } },
    { input: "0 minutes check ci", expected: { type: "usage", reason: ScheduleLoop.NONPOSITIVE } },
    { input: "-5m check ci", expected: { type: "usage", reason: ScheduleLoop.NONPOSITIVE } },
    // A gate clause after the prompt cannot be told apart from prose, so it is refused rather than ignored.
    {
      input: 'review my commits when "git rev-parse HEAD" changes',
      expected: { type: "usage", reason: ScheduleLoop.GATE_PLACEMENT },
    },
    // An interval at or beyond the expiry could never fire once, so it is refused instead of failing in the engine.
    { input: "10 days x", expected: { type: "usage", reason: ScheduleLoop.TOO_LONG } },
    { input: "7 days check ci", expected: { type: "usage", reason: ScheduleLoop.TOO_LONG } },
    // Weeks and months parse as intervals, then hit the same expiry rejection rather than a silent default cadence.
    { input: "1 week check ci", expected: { type: "usage", reason: ScheduleLoop.TOO_LONG } },
    { input: "2 weeks x", expected: { type: "usage", reason: ScheduleLoop.TOO_LONG } },
    { input: "check ci every 2 months", expected: { type: "usage", reason: ScheduleLoop.TOO_LONG } },
  ]

  test.each([...lists, ...stops, ...starts, ...clamped, ...usages])("$input", ({ input, expected }) => {
    expect(ScheduleLoop.parse(input)).toEqual(expected)
  })

  test("start results always end after 7 days", () => {
    const parsed = ["check the deploy", "5m x", 'when "x" changes y', "30s ping"].map((input) =>
      ScheduleLoop.parse(input),
    )
    expect(parsed.map((result) => (result.type === "start" ? result.endsAfter : result.type))).toEqual([
      "7 days",
      "7 days",
      "7 days",
      "7 days",
    ])
  })

  test("a bare stop carries no target", () => {
    const parsed = ScheduleLoop.parse("stop")
    expect(parsed.type).toBe("stop")
    if (parsed.type === "stop") expect(parsed.target).toBeUndefined()
  })

  // The command accepts `all` as well, so the guidance must not omit it.
  test("usage advertises every supported stop target", () => {
    expect(ScheduleLoop.USAGE).toContain("stop <number|id|all>")
  })

  // The engine parses `Schedule.Duration` from long-form strings only, so every cadence the parser emits must be one.
  test("every emitted interval is a duration the schedule engine accepts", () => {
    const inputs = [
      "5m x",
      "45 minutes, x",
      "2 hours x",
      "1 day x",
      "check every PR",
      "30s ping",
      '20s when "x" changes ping',
      '10s when "x" changes ping',
    ]
    for (const input of inputs) {
      const parsed = ScheduleLoop.parse(input)
      expect(parsed.type).toBe("start")
      if (parsed.type !== "start") continue
      expect(Option.getOrUndefined(Schedule.durationMillis(parsed.every))).toBeTypeOf("number")
    }
  })
})
