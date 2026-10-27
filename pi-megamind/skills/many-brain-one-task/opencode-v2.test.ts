#!/usr/bin/env bun
import { describe, expect, test } from "bun:test"
import {
  assistantTextFromMessage,
  modelsFromV1Providers,
  modelsFromV2Catalog,
  runOpencodeV1,
  runOpencodeV2,
  splitProviderModel,
  textFromAssistantMessages,
} from "./opencode-v2.ts"

describe("OpenCode catalog parsers", () => {
  test("v2 catalog uses providerID and modelID", () => {
    expect(
      modelsFromV2Catalog({
        data: [
          { providerID: "openai", modelID: "gpt-6.1-sol" },
          { providerID: "openrouter", modelID: "openai/gpt-6.1-sol" },
        ],
      }),
    ).toEqual(["openai/gpt-6.1-sol", "openrouter/openai/gpt-6.1-sol"])
  })

  test("v1 catalog keeps the providers map", () => {
    expect(
      modelsFromV1Providers({
        providers: [{ id: "openai", models: { "gpt-6.1-sol": {} } }],
      }),
    ).toEqual(["openai/gpt-6.1-sol"])
  })

  test("provider/model split keeps the first segment as the provider", () => {
    expect(splitProviderModel("openrouter/openai/gpt-6.1-sol")).toEqual({
      providerID: "openrouter",
      id: "openai/gpt-6.1-sol",
    })
  })

  test("assistant text skips reasoning and tool parts", () => {
    const message = {
      type: "assistant",
      content: [
        { type: "reasoning", text: "hidden" },
        { type: "text", text: "OPENCODE_SMOKE_OK" },
        { type: "tool", name: "read" },
      ],
    }
    expect(assistantTextFromMessage(message)).toBe("OPENCODE_SMOKE_OK")
    expect(textFromAssistantMessages([message])).toBe("OPENCODE_SMOKE_OK")
  })
})

describe("runOpencodeV2", () => {
  test("sends one prompt and returns the assistant text", async () => {
    let prompted = false
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url)
        if (req.method === "POST" && url.pathname === "/api/session") {
          const body = await req.json()
          expect(body.model).toEqual({ id: "gpt-6.1-sol", providerID: "openai", variant: "high" })
          return Response.json({ data: { id: "ses_unit" } })
        }
        if (url.pathname === "/api/session/ses_unit/model" || url.pathname === "/api/session/ses_unit/agent") {
          return new Response(null, { status: 204 })
        }
        if (req.method === "POST" && url.pathname === "/api/session/ses_unit/prompt") {
          prompted = true
          const body = await req.json()
          expect(body.text).toContain("hello")
          return Response.json({ data: { time: { created: 10 } } })
        }
        if (url.pathname === "/api/session/ses_unit/permission") return Response.json({ data: [] })
        if (url.pathname === "/api/session/active") return Response.json({ data: {} })
        if (url.pathname === "/api/session/ses_unit/message" && url.searchParams.get("type") === "idle") {
          return Response.json({ data: [{ time: { created: 11 } }] })
        }
        if (url.pathname === "/api/session/ses_unit/message") {
          return Response.json({
            data: [{ content: [{ type: "text", text: "OPENCODE_SMOKE_OK" }] }],
          })
        }
        if (url.pathname === "/api/session/ses_unit") {
          return Response.json({ data: { cost: 0.02, tokens: { output: 4 } } })
        }
        return new Response("nope", { status: 404 })
      },
    })
    try {
      const result = await runOpencodeV2({
        baseUrl: `http://127.0.0.1:${server.port}`,
        model: "openai/gpt-6.1-sol",
        variant: "high",
        agent: "colin-mbot-gpt-sol",
        prompt: "hello",
        directory: "/tmp",
        timeoutMs: 5000,
        title: "unit",
      })
      expect(prompted).toBe(true)
      expect(result.code).toBe(0)
      expect(result.text).toBe("OPENCODE_SMOKE_OK")
      expect(result.sessionId).toBe("ses_unit")
      expect(result.costUsd).toBe(0.02)
    } finally {
      server.stop(true)
    }
  })
})

describe("runOpencodeV1", () => {
  test("posts prompt_async and reads the finished assistant message", async () => {
    let prompted = false
    let replied = false
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url)
        if (req.method === "POST" && url.pathname === "/session") {
          return Response.json({ id: "ses_v1" })
        }
        if (req.method === "GET" && url.pathname === "/session/ses_v1/message") {
          if (!prompted) return Response.json([])
          return Response.json([
            {
              info: {
                id: "msg_v1",
                role: "assistant",
                cost: 0.04,
                tokens: { output: 2 },
                finish: "stop",
                time: { completed: Date.now() },
              },
              parts: [{ type: "text", text: "OPENCODE_SMOKE_OK" }],
            },
          ])
        }
        if (req.method === "POST" && url.pathname === "/session/ses_v1/prompt_async") {
          prompted = true
          const body = await req.json()
          expect(body.model).toEqual({ providerID: "openai", modelID: "gpt-6.1-sol" })
          expect(body.parts).toEqual([{ type: "text", text: "hello" }])
          expect(body.variant).toBe("high")
          expect(url.searchParams.get("directory")).toBe("/tmp")
          return new Response(null, { status: 204 })
        }
        if (url.pathname === "/permission") {
          return Response.json([{ id: "perm_1", sessionID: "ses_v1" }, { id: "perm_other", sessionID: "ses_other" }])
        }
        if (req.method === "POST" && url.pathname.startsWith("/session/") && url.pathname.includes("/permissions/")) {
          expect(url.pathname).toBe("/session/ses_v1/permissions/perm_1")
          replied = true
          const body = await req.json()
          expect(body).toEqual({ response: "once" })
          return Response.json({})
        }
        return new Response(`nope ${url.pathname}`, { status: 404 })
      },
    })
    try {
      const result = await runOpencodeV1({
        baseUrl: `http://127.0.0.1:${server.port}`,
        model: "openai/gpt-6.1-sol",
        variant: "high",
        prompt: "hello",
        directory: "/tmp",
        timeoutMs: 5000,
        title: "unit",
      })
      expect(prompted).toBe(true)
      expect(replied).toBe(true)
      expect(result.code).toBe(0)
      expect(result.text).toBe("OPENCODE_SMOKE_OK")
      expect(result.sessionId).toBe("ses_v1")
      expect(result.costUsd).toBe(0.04)
    } finally {
      server.stop(true)
    }
  })
})
