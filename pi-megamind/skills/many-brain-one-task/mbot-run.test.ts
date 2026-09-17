#!/usr/bin/env bun
import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  defaultOpencodeAgent,
  defaultOpencodeVariant,
  inferProjectDir,
  resolvePlanPath,
  stripDuplicateRunPrefix,
} from "./mbot-paths.ts"
import { collectCandidates, parseIssueBlocks } from "./mbot-candidates.ts"
import { isRich, loadUltraReviewIdentity } from "./mbot-run.ts"

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "mbot-run.ts")
const TMP = mkdtempSync(join(tmpdir(), "mbot-run-test-"))
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("stripDuplicateRunPrefix", () => {
  const runDir = "/home/colin/Projects/app/.tmp/ultra-provisioner"
  test("leaves prompts/x.md alone", () => {
    expect(stripDuplicateRunPrefix("prompts/b1-state.md", runDir)).toBe(
      "prompts/b1-state.md",
    )
  })
  test("strips .tmp/<run>/ prefix", () => {
    expect(
      stripDuplicateRunPrefix(
        ".tmp/ultra-provisioner/prompts/b1-state.md",
        runDir,
      ),
    ).toBe("prompts/b1-state.md")
  })
  test("strips absolute run dir prefix", () => {
    expect(
      stripDuplicateRunPrefix(
        "/home/colin/Projects/app/.tmp/ultra-provisioner/results/x.out",
        runDir,
      ),
    ).toBe("results/x.out")
  })
  test("strips basename prefix", () => {
    expect(
      stripDuplicateRunPrefix("ultra-provisioner/prompts/x.md", runDir),
    ).toBe("prompts/x.md")
  })
})

describe("resolvePlanPath", () => {
  test("does not double-join a repo-relative prompt onto run_dir", () => {
    const repo = join(TMP, "repo")
    const runDir = join(repo, ".tmp", "ultra-N")
    mkdirSync(join(runDir, "prompts"), { recursive: true })
    const prompt = join(runDir, "prompts", "b1-state.md")
    writeFileSync(prompt, "role")
    const resolved = resolvePlanPath(".tmp/ultra-N/prompts/b1-state.md", {
      runDir,
      projectDir: repo,
      cwd: repo,
    })
    expect(resolved).toBe(prompt)
    expect(resolved.includes(".tmp/ultra-N/.tmp/ultra-N")).toBe(false)
  })
  test("resolves run-dir-relative prompts/", () => {
    const repo = join(TMP, "repo2")
    const runDir = join(repo, ".tmp", "ultra-N")
    mkdirSync(join(runDir, "prompts"), { recursive: true })
    const prompt = join(runDir, "prompts", "x.md")
    writeFileSync(prompt, "x")
    const resolved = resolvePlanPath("prompts/x.md", {
      runDir,
      projectDir: repo,
      cwd: repo,
    })
    expect(resolved).toBe(prompt)
  })
})

describe("inferProjectDir", () => {
  test("walks up from <repo>/.tmp/<id>", () => {
    expect(inferProjectDir("/repo/.tmp/ultra-1")).toBe("/repo")
  })
  test("honors explicit project_dir", () => {
    expect(inferProjectDir("/repo/.tmp/ultra-1", "/other")).toBe("/other")
  })
})

describe("OpenCode defaults", () => {
  test("GPT Sol models get colin-mbot-gpt-sol", () => {
    expect(defaultOpencodeAgent("openai/gpt-5.6-sol")).toBe("colin-mbot-gpt-sol")
    expect(defaultOpencodeAgent("gpt-5.6-sol")).toBe("colin-mbot-gpt-sol")
  })
  test("GPT Astra models get colin-mbot-gpt-astra", () => {
    expect(defaultOpencodeAgent("openai/gpt-6-astra")).toBe("colin-mbot-gpt-astra")
    expect(defaultOpencodeAgent("gpt-6-astra")).toBe("colin-mbot-gpt-astra")
  })
  test("GPT Terra models get colin-mbot-gpt-terra", () => {
    expect(defaultOpencodeAgent("openai/gpt-5.6-terra")).toBe("colin-mbot-gpt-terra")
  })
  test("non-GPT models do not guess an agent", () => {
    expect(defaultOpencodeAgent("opencode/gemini-3.1-pro")).toBeUndefined()
    expect(defaultOpencodeAgent("grok-4.6")).toBeUndefined()
  })
  test("variant defaults to high unless blanked", () => {
    expect(defaultOpencodeVariant(undefined)).toBe("high")
    expect(defaultOpencodeVariant("xhigh")).toBe("xhigh")
    expect(defaultOpencodeVariant("")).toBeUndefined()
    expect(defaultOpencodeVariant("none")).toBeUndefined()
  })
})

describe("Ultra Review version", () => {
  const noSeamus = { ...process.env }
  delete noSeamus.SEAMUS_GIT_SHA
  delete noSeamus.GIT_COMMIT

  test("identity is Ultra Review 0.5", () => {
    const id = loadUltraReviewIdentity(noSeamus)
    expect(id.product).toBe("Ultra Review")
    expect(id.version).toBe("0.5")
    expect(id.label).toBe("Ultra Review 0.5")
    expect(id.header).toBe("AI Ultra Review 0.5")
  })

  test("SEAMUS_GIT_SHA overrides the skill version with a short sha", () => {
    const id = loadUltraReviewIdentity({ ...noSeamus, SEAMUS_GIT_SHA: "51b6aba0123456789abcdef" })
    expect(id.version).toBe("51b6aba")
    expect(id.label).toBe("Ultra Review 51b6aba")
    expect(id.header).toBe("AI Ultra Review 51b6aba")
  })

  test("init freezes ultra_review into STATE.json", () => {
    const repo = join(TMP, "version-repo")
    const runDir = join(repo, ".tmp", "ultra-ver")
    mkdirSync(runDir, { recursive: true })
    const r = Bun.spawnSync(["bun", SCRIPT, "init", "--run-dir", runDir], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
      env: noSeamus,
    })
    expect(r.exitCode).toBe(0)
    const printed = JSON.parse(r.stdout.toString())
    expect(printed.ultra_review.label).toBe("Ultra Review 0.5")
    const state = JSON.parse(readFileSync(join(runDir, "STATE.json"), "utf8"))
    expect(state.ultra_review.version).toBe("0.5")
    expect(state.ultra_review.header).toBe("AI Ultra Review 0.5")
  })
})

describe("parseIssueBlocks", () => {
  test("reads harness ISSUE blocks", () => {
    const text = `<<<ISSUE>>>
role: state
file: foo.go
anchor: bar
severity: high
confidence: high
invariant: X must hold
trigger: t
harm: h
evidence: e
fix: f
<<<END>>>
`
    const blocks = parseIssueBlocks(text)
    expect(blocks.length).toBe(1)
    expect(blocks[0].file).toBe("foo.go")
    expect(blocks[0].anchor).toBe("bar")
    expect(blocks[0].invariant).toBe("X must hold")
  })
  test("accepts line: as an alias for anchor:", () => {
    const text = `<<<ISSUE>>>
file: foo.go
line: 42
invariant: X
<<<END>>>
`
    const blocks = parseIssueBlocks(text)
    expect(blocks[0].anchor).toBe("42")
  })
})

describe("isRich", () => {
  test("thin VERDICT-only stub is not rich", () => {
    expect(isRich("VERDICT: 0 candidates\n")).toBe(false)
  })
  test("ISSUE block is rich even when short", () => {
    expect(isRich("<<<ISSUE>>>\nfile: a.ts\nanchor: 1\n<<<END>>>\n")).toBe(true)
  })
  test("interstitial progress note is not rich", () => {
    expect(isRich("Continuing through State…\n")).toBe(false)
  })
  test("harvest scores a thin VERDICT stub as empty, not ok", () => {
    const repo = join(TMP, "thin-repo")
    const runDir = join(repo, ".tmp", "ultra-thin")
    mkdirSync(join(runDir, "results"), { recursive: true })
    writeFileSync(join(runDir, "results", "gpt.out"), "VERDICT: 0 candidates\n")
    const r = Bun.spawnSync(["bun", SCRIPT, "harvest", "--run-dir", runDir], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(r.exitCode).toBe(0)
    const harvest = JSON.parse(r.stdout.toString())
    expect(harvest.slots[0].status).toBe("empty")
  })
})

describe("mbot-run launch path + plan merge (external slots, no models)", () => {
  const repo = join(TMP, "cli-repo")
  const runDir = join(repo, ".tmp", "ultra-cli")

  function writePlan(name: string, slots: unknown[]) {
    const path = join(runDir, name)
    writeFileSync(
      path,
      JSON.stringify(
        {
          run_dir: runDir,
          project_dir: repo,
          timeout_ms: 5000,
          slots,
        },
        null,
        2,
      ) + "\n",
    )
    return path
  }

  test("launch resolves doubled prompt paths for external slots", () => {
    mkdirSync(join(runDir, "prompts"), { recursive: true })
    mkdirSync(join(runDir, "results"), { recursive: true })
    writeFileSync(join(runDir, "prompts", "b1-state.md"), "prompt body\n")
    const plan = writePlan("plan-a.json", [
      {
        slot: "b1-state-opus",
        planned_model: "opus",
        harness: "external",
        prompt: ".tmp/ultra-cli/prompts/b1-state.md",
        out: ".tmp/ultra-cli/results/b1-state-opus.out",
      },
    ])
    const r = Bun.spawnSync(["bun", SCRIPT, "launch", "--plan", plan], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = r.stdout.toString()
    expect(r.exitCode).toBe(0)
    const summary = JSON.parse(stdout)
    expect(summary.ok).toBe(true)
    const out = summary.slots[0].out as string
    expect(out.includes(".tmp/ultra-cli/.tmp/ultra-cli")).toBe(false)
    expect(out.endsWith("/results/b1-state-opus.out")).toBe(true)
    const meta = JSON.parse(
      readFileSync(join(runDir, "results", "b1-state-opus.meta.json"), "utf8"),
    )
    expect(meta.prompt.includes(".tmp/ultra-cli/.tmp/ultra-cli")).toBe(false)
    expect(meta.prompt.endsWith("/prompts/b1-state.md")).toBe(true)
    expect(meta.wall_ms === undefined || meta.wall_ms === 0 || meta.ended_at == null).toBe(
      true,
    )
  })

  test("second launch merges slots into plan.json instead of clobbering", () => {
    writeFileSync(join(runDir, "prompts", "integration.md"), "int\n")
    const plan = writePlan("plan-b.json", [
      {
        slot: "integration-gpt",
        planned_model: "gpt-5.6-sol",
        harness: "external",
        prompt: "prompts/integration.md",
        out: "results/integration-gpt.out",
      },
    ])
    const r = Bun.spawnSync(["bun", SCRIPT, "launch", "--plan", plan], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(r.exitCode).toBe(0)
    const registry = JSON.parse(readFileSync(join(runDir, "plan.json"), "utf8"))
    const ids = registry.slots.map((s: { slot: string }) => s.slot).sort()
    expect(ids).toEqual(["b1-state-opus", "integration-gpt"])
  })

  test("barrier does not treat an empty external slot as terminal", () => {
    const r = Bun.spawnSync(
      ["bun", SCRIPT, "barrier", "--run-dir", runDir, "--timeout-ms", "200", "--poll-ms", "50"],
      { cwd: repo, stdout: "pipe", stderr: "pipe" },
    )
    expect(r.exitCode).toBe(1)
    const summary = JSON.parse(r.stdout.toString())
    expect(summary.ok).toBe(false)
    expect(summary.slots.some((s: { terminal: boolean }) => !s.terminal)).toBe(true)
  })

  test("barrier unblocks once the external body exists", () => {
    const body = "<<<ISSUE>>>\nfile: x.ts\nanchor: 1\n<<<END>>>\n"
    writeFileSync(join(runDir, "results", "b1-state-opus.out"), body)
    writeFileSync(join(runDir, "results", "integration-gpt.out"), body)
    const r = Bun.spawnSync(
      ["bun", SCRIPT, "barrier", "--run-dir", runDir, "--timeout-ms", "2000", "--poll-ms", "50"],
      { cwd: repo, stdout: "pipe", stderr: "pipe" },
    )
    expect(r.exitCode).toBe(0)
    const summary = JSON.parse(r.stdout.toString())
    expect(summary.ok).toBe(true)
  })

  test("launch --detach returns immediately with a pid", () => {
    writeFileSync(join(runDir, "prompts", "later.md"), "x\n")
    const plan = writePlan("plan-c.json", [
      {
        slot: "later-opus",
        planned_model: "opus",
        harness: "external",
        prompt: "prompts/later.md",
        out: "results/later-opus.out",
      },
    ])
    const r = Bun.spawnSync(["bun", SCRIPT, "launch", "--plan", plan, "--detach"], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = r.stdout.toString()
    expect(r.exitCode).toBe(0)
    const summary = JSON.parse(stdout)
    expect(summary.detached).toBe(true)
    expect(typeof summary.pid).toBe("number")
  })
})

describe("collectCandidates", () => {
  test("ids are per-slot and actual_model is populated", () => {
    const repo = join(TMP, "cand-repo")
    const runDir = join(repo, ".tmp", "ultra-cand")
    const results = join(runDir, "results")
    mkdirSync(results, { recursive: true })
    const issue = `<<<ISSUE>>>
file: a.ts
anchor: 1
invariant: x
<<<END>>>
`
    writeFileSync(join(results, "z-slot.out"), issue)
    writeFileSync(
      join(results, "z-slot.meta.json"),
      JSON.stringify({ slot: "z-slot", actual_model: "opus" }),
    )
    writeFileSync(join(results, "a-slot.out"), issue)
    writeFileSync(
      join(results, "a-slot.meta.json"),
      JSON.stringify({ slot: "a-slot", actual_model: "gpt" }),
    )
    const first = collectCandidates(runDir)
    expect(first.candidates.map((c) => c.id).sort()).toEqual(["a-slot/R001", "z-slot/R001"])
    writeFileSync(join(results, "m-slot.out"), issue)
    writeFileSync(
      join(results, "m-slot.meta.json"),
      JSON.stringify({ slot: "m-slot", actual_model: "grok" }),
    )
    const second = collectCandidates(runDir)
    const bySlot = Object.fromEntries(second.candidates.map((c) => [c.slot, c]))
    expect(bySlot["a-slot"].id).toBe("a-slot/R001")
    expect(bySlot["z-slot"].id).toBe("z-slot/R001")
    expect(bySlot["a-slot"].actual_model).toBe("gpt")
    expect(bySlot["m-slot"].id).toBe("m-slot/R001")
  })
})
