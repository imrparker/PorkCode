import { expect, test } from "bun:test"
import { Env } from "../src/env"

test("session environment omits server credentials", () => {
  const previousPassword = process.env.PORKCODE_PASSWORD
  const previousLegacyPassword = process.env.PORKCODE_SERVER_PASSWORD
  const previousValue = process.env.PORKCODE_SESSION_ENV_TEST
  process.env.PORKCODE_PASSWORD = "password"
  process.env.PORKCODE_SERVER_PASSWORD = "legacy"
  process.env.PORKCODE_SESSION_ENV_TEST = "included"

  const environment = Env.session()

  if (previousPassword === undefined) delete process.env.PORKCODE_PASSWORD
  else process.env.PORKCODE_PASSWORD = previousPassword
  if (previousLegacyPassword === undefined) delete process.env.PORKCODE_SERVER_PASSWORD
  else process.env.PORKCODE_SERVER_PASSWORD = previousLegacyPassword
  if (previousValue === undefined) delete process.env.PORKCODE_SESSION_ENV_TEST
  else process.env.PORKCODE_SESSION_ENV_TEST = previousValue

  expect(environment.PORKCODE_PASSWORD).toBeUndefined()
  expect(environment.PORKCODE_SERVER_PASSWORD).toBeUndefined()
  expect(environment.PORKCODE_SESSION_ENV_TEST).toBe("included")
})
