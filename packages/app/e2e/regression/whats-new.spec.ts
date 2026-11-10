import { expect, test, type Page } from "@playwright/test"
import pkg from "../../package.json" with { type: "json" }
import { SERVER, type SeedInput } from "../utils/app"
import { expectAppVisible } from "../utils/waits"
import { mockWorkspace } from "../utils/workspace"

// The web app's version, which What's New compares with the version last seen.
const current = pkg.version

const SEEN = "opencode.global.dat:plugin.updater.seen"

// A user who last saw 1.9.1, stored where the app kept it before the updater plugin owned What's New.
const upgraded = { storage: { "highlights.v1": { version: "1.9.1" } } }

// PorkCode publishes no hosted changelog (CHANGELOG_URL is empty), so every start marks the release
// seen and stays closed without a request; even an upgrade from an older version shows nothing.
for (const row of [
  { name: "the first run only remembers the version", seed: {} },
  {
    name: "a version seen before, stored as highlights.v1, shows nothing",
    seed: { storage: { "highlights.v1": { version: current } } },
  },
  { name: "an upgrade from 1.9.1 marks the release seen without a dialog", seed: upgraded },
  {
    name: "release notes turned off before, in settings.v3, only remember the version",
    seed: { ...upgraded, settings: { general: { releaseNotes: false } } },
  },
]) {
  test(`What's New: ${row.name}`, async ({ page }) => {
    const requests: string[] = []

    await page.route("https://opencode.ai/changelog.json", (route) => {
      requests.push(route.request().url())
      return route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" } })
    })

    await start(page, row.seed)
    await expect.poll(() => stored(page, SEEN)).toEqual({ version: current })
    expect(requests).toHaveLength(0)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })
}

test("a rejected update check shows one failure title without repeating it as a description", async ({ page }) => {
  await mockWorkspace(page, { name: "UpdateCheck", sessions: [] })
  await page.goto(
    `/e2e/utils/settings-wsl.html?${new URLSearchParams({ server: SERVER, mode: "stopped", updater: "" })}`,
  )
  const settings = page.getByTestId("settings-screen")
  const check = settings.getByRole("button", { name: "Check now", exact: true })
  await expect(check).toBeEnabled()
  await check.click()
  await expect(page.getByText("Request failed", { exact: true })).toBeVisible()
  await expect(page.getByText("Request failed", { exact: true })).toHaveCount(1)
  await expect(page.getByText("You're up to date", { exact: true })).toHaveCount(0)
})

/** Opens Home over one empty project, with this storage, and waits until the window renders. */
async function start(page: Page, seed: SeedInput) {
  await mockWorkspace(page, { name: "Whats New", sessions: [], seed })
  await page.goto("/")
  await expectAppVisible(page.getByRole("button", { name: "Settings", exact: true }))
}

function stored(page: Page, key: string) {
  return page.evaluate((name) => localStorage.getItem(name), key).then((raw) => JSON.parse(raw ?? "null"))
}
