Use the following:

- Claude Code / Claude CLI with Opus at **high** thinking effort (native `Agent` for discovery, validation, integration, summarization — not `max`/`xhigh`)
- OpenCode with OpenAI/GPT-5.6 Sol at high reasoning effort (agent `colin-mbot-gpt`; via OpenAI, not Zen)
- Grok CLI with Grok 4.5 at high reasoning effort; fall back to OpenCode `colin-mbot-grok` when the first-party CLI is unavailable
- CodeRabbit when `cr` is authenticated

Do **not** include Gemini, Kimi, GLM, or other models unless the user explicitly names them. Prefer Grok as the **only** backup when a primary cannot run — never invent a substitute lineup. Default OpenCode wall-clock: 20 minutes (`--timeout` / `--timeout-ms 1200000`); max one retry per slot.

For OpenCode use `--attach seamus:4095`.

### Required `--title` format (cost reporting)

Every OpenCode / `occtl run` participant title must include:

```text
ultra|{gitlabProjectPath}|!{mrIid}|{bucketOr-}|{role}|{modelShort}|retry{N}
```

Example: `ultra|shipstream/server|!2740|-|state|gpt-5.6-sol|retry0`

Use `-` for bucket when not bucketed. Bump `retryN` and use a distinct `--out` for every re-launch.
