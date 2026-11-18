import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261118045811_schedule_loop",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`schedule\` ADD \`delivery\` text;`)
      yield* tx.run(`ALTER TABLE \`schedule\` ADD \`origin\` text;`)
    })
  },
}

export default migration
