<!--
  Built-in skill. Name and description are registered in code at
  packages/core/src/plugin/skill.ts. The body below becomes the skill's
  content.
-->

# Report a PorkCode Issue

Use this skill when the user wants to report a PorkCode issue or bug. Your job
is to turn the user's problem into a useful GitHub issue with standard
diagnostics plus the context needed to reproduce and resolve it.

PorkCode issues are tracked at <https://github.com/imrparker/PorkCode>. Do not
file against upstream OpenCode; this fork owns its own bug tracker.

## Workflow

1. Collect the standard diagnostics below.
2. Ask only for missing details that are necessary to reproduce or understand
   impact.
3. Draft the issue in the standard format below.
4. Publish it with GitHub CLI after the user confirms the title and body.

Do not publish an issue without user confirmation. If GitHub CLI is not
installed or not authenticated, explain the blocker and provide the exact issue
title/body for the user.

## Standard Diagnostics

Collect these values when possible:

- PorkCode version: run `porkcode --version`.
- Operating system: run `uname -a` on Unix-like systems, or `ver` on Windows.
- Terminal: inspect `$TERM`, `$TERM_PROGRAM`, `$COLORTERM`, and any obvious
  terminal app context the user provides.
- Shell: inspect `$SHELL` on Unix-like systems, or `%COMSPEC%`/`$ComSpec` on
  Windows when relevant.
- Install/channel context: include whether this appears to be local, dev, beta,
  or release if the version output or environment reveals it.
- Active plugins: inspect PorkCode config for configured plugins when possible.
  Check likely config locations such as `porkcode.json`, `porkcode.jsonc`,
  `.porkcode/porkcode.json`, and `~/.config/porkcode/porkcode.json`. Record
  configured plugin entries, local plugin files under `.porkcode/plugins/` or
  `~/.config/porkcode/plugins/`, and note if plugin status could not be
  determined.

If a diagnostic command fails, include `Unavailable` with the reason instead of
guessing.

## User-Specific Context

Capture the details that make the issue actionable:

- What the user was trying to do.
- What happened.
- What the user expected to happen.
- Reproduction steps, ideally minimal and numbered.
- Relevant logs, stack traces, screenshots, terminal output, or config snippets.
- Whether the issue is reproducible consistently, intermittently, or only once.
- Recent changes that may be related, such as updating PorkCode, changing
  config, installing a plugin, changing terminal, switching workspace, or
  changing which local model server (LM Studio, Ollama, vLLM, llama.cpp, or a
  custom endpoint) was in use.
- Workarounds tried and whether they helped.

Avoid pasting secrets. Redact tokens, API keys, private URLs, usernames, and
project-specific confidential data unless the user explicitly says it is safe.

## Issue Format

Use this exact structure unless the repository issue template requires
otherwise:

```markdown
## Summary

<!-- One or two sentences describing the bug and impact. -->

## Environment

- PorkCode version: <!-- value or Unavailable: reason -->
- OS: <!-- value or Unavailable: reason -->
- Terminal: <!-- value or Unavailable: reason -->
- Shell: <!-- value or Unavailable: reason -->
- Install/channel: <!-- value or Unavailable: reason -->
- Active plugins: <!-- list, none found, or Unavailable: reason -->

## Reproduction

1. <!-- step -->
2. <!-- step -->
3. <!-- step -->

## Expected Behavior

<!-- What should have happened. -->

## Actual Behavior

<!-- What happened instead. Include exact errors when available. -->

## Additional Context

<!-- Logs, config snippets, screenshots, frequency, workarounds, related notes. -->
```

Keep the title short and searchable. Prefer the form:

```text
<area>: <specific failure or symptom>
```

Examples: `tui: skills dialog crashes outside location provider`,
`cli: local service config writes release filename`.

## Publishing With GitHub CLI

Use GitHub CLI from a PorkCode repository checkout when available; otherwise
target the fork explicitly with `--repo imrparker/PorkCode`:

```sh
gh issue create --repo imrparker/PorkCode --title "<title>" --body-file <file>
```

Write the body to a temporary markdown file first so quoting, newlines, logs,
and code fences are preserved. If labels are obvious and the repo accepts them,
add `--label bug`; otherwise omit labels rather than guessing.

After publishing, report the created issue URL to the user and mention any
diagnostics that were unavailable.
