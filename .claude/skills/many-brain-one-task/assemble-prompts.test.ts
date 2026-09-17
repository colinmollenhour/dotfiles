#!/usr/bin/env bun
import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "assemble-prompts.ts")
const TMP = mkdtempSync(join(tmpdir(), "assemble-prompts-test-"))
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("assemble-prompts --append", () => {
  test("repeated --append is cumulative, not last-wins", () => {
    const a = join(TMP, "a.md")
    const b = join(TMP, "b.md")
    const role = join(TMP, "role.md")
    const outDir = join(TMP, "out")
    mkdirSync(outDir, { recursive: true })
    writeFileSync(role, "ROLE\n")
    writeFileSync(a, "PACK-A\n")
    writeFileSync(b, "PACK-B\n")
    const r = Bun.spawnSync(
      [
        "bun",
        SCRIPT,
        "--append",
        a,
        "--append",
        b,
        "--out-dir",
        outDir,
        `${role}:state.full.md`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect(r.exitCode).toBe(0)
    const body = readFileSync(join(outDir, "state.full.md"), "utf8")
    expect(body).toContain("ROLE")
    expect(body).toContain("PACK-A")
    expect(body).toContain("PACK-B")
    expect(body.indexOf("PACK-A")).toBeLessThan(body.indexOf("PACK-B"))
    expect(body).toContain("<<<ISSUE>>>")
  })

  test("merits outputs skip the auto ISSUE form", () => {
    const role = join(TMP, "merits-role.md")
    const outDir = join(TMP, "out-merits")
    mkdirSync(outDir, { recursive: true })
    writeFileSync(role, "MERITS\n")
    const r = Bun.spawnSync(
      ["bun", SCRIPT, "--out-dir", outDir, `${role}:merits.full.md`],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect(r.exitCode).toBe(0)
    const body = readFileSync(join(outDir, "merits.full.md"), "utf8")
    expect(body).toBe("MERITS\n")
    expect(body).not.toContain("<<<ISSUE>>>")
  })
})
