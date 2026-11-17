#!/usr/bin/env bun
import { stat } from "node:fs/promises"
import path from "node:path"

// Writes an electron-updater feed file (latest.yml / latest-mac.yml) over artifacts that are already built, so one
// release can list installers produced by separate CI jobs. electron-builder writes only the feed of its own run, and
// its afterPack check allows exactly one bundled CLI per build, so a multi-arch release cannot come from one call.
//
//   bun script/make-update-feed.ts <version> <outfile> <artifact...>
//
// The first artifact is the feed's default path, so pass the installer current installs are expected to match first.
// A sibling <artifact>.blockmap is recorded as blockMapSize for the differential download. SOURCE_DATE_EPOCH pins
// releaseDate for a reproducible run, the same convention electron-builder honors.

const [version, out, ...artifacts] = process.argv.slice(2)

if (!version || !out || artifacts.length === 0) {
  console.error("usage: bun script/make-update-feed.ts <version> <outfile> <artifact...>")
  process.exit(1)
}

// electron-updater compares the version with semver; a malformed one would poison the feed until the next release.
if (!/^\d+\.\d+\.\d+([-+.]\w+)*$/.test(version)) throw new Error(`Not a valid update version: ${version}`)

const entries = await Promise.all(artifacts.map(readArtifact))

await Bun.write(out, feed(version, entries))

console.log(`Wrote ${out} for ${entries.map((item) => item.url).join(", ")}`)

async function readArtifact(artifact: string) {
  const file = Bun.file(artifact)

  if (!(await file.exists())) throw new Error(`Update artifact does not exist: ${artifact}`)

  return {
    url: path.basename(artifact),
    sha512: new Bun.CryptoHasher("sha512").update(await file.arrayBuffer()).digest("base64"),
    size: (await stat(artifact)).size,
    blockMapSize: (await Bun.file(`${artifact}.blockmap`).exists())
      ? (await stat(`${artifact}.blockmap`)).size
      : undefined,
  }
}

function feed(version: string, entries: Awaited<ReturnType<typeof readArtifact>[]>) {
  return (
    [
      `version: ${version}`,
      "files:",
      ...entries.flatMap((entry) => [
        `  - url: ${entry.url}`,
        `    sha512: '${entry.sha512}'`,
        `    size: ${entry.size}`,
        ...(entry.blockMapSize === undefined ? [] : [`    blockMapSize: ${entry.blockMapSize}`]),
      ]),
      `path: ${entries[0].url}`,
      `sha512: '${entries[0].sha512}'`,
      // Quoted so a YAML parser hands electron-updater the string rather than a Date object.
      `releaseDate: '${new Date(Number(process.env.SOURCE_DATE_EPOCH ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()}'`,
    ].join("\n") + "\n"
  )
}
