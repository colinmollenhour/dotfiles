Use the following:

- Claude Code / Claude CLI with Opus at **high** thinking effort (native `Agent` for discovery, validation, integration, summarization — not `max`/`xhigh`)
- OpenCode with OpenAI/GPT-5.6 Sol at high reasoning effort (agent `colin-mbot-gpt`; via OpenAI, not Zen). `mbot-run` now defaults `--variant high` and `--agent colin-mbot-gpt` for GPT slots — do not omit them from the plan and do not use agent `build`. On an OpenCode host, `launch --detach` then `barrier`.
- Grok CLI with Grok 4.5 at high reasoning effort; fall back to OpenCode `colin-mbot-grok` when the first-party CLI is unavailable

Do **not** include CodeRabbit / `cr` as a participant, even if the CLI is installed and authenticated. Do **not** include Gemini, Kimi, GLM, or other models unless the user explicitly names them. Prefer Grok as the **only** backup when a primary cannot run — never invent a substitute lineup. Default OpenCode wall-clock: 20 minutes (`--timeout` / `--timeout-ms 1200000`); max one retry per slot.

For OpenCode, put `"attach": "http://100.110.251.42:4095"` on `plan.json` (this host's Tailscale IP — Claude's sandbox proxy cannot resolve the hostname `seamus`). `OPENCODE_SERVER_HOST` / `PORT` are already in the environment from Seamus `gitlab.env` and win over the attach URL. Do not pass `occtl --attach`.

### Required `--title` format (cost reporting)

Every OpenCode participant title (set on the `mbot-run` plan slot) must include:

```text
ultra|{gitlabProjectPath}|!{mrIid}|{bucketOr-}|{role}|{modelShort}|retry{N}
```

Example: `ultra|shipstream/server|!2740|-|state|gpt-5.6-sol|retry0`

Use `-` for bucket when not bucketed. Bump `retryN` and use a distinct `--out` for every re-launch.
