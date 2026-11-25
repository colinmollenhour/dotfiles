Use the following, all at **high** reasoning effort (not max/xhigh unless the user asks):

- The latest available Opus model (currently Opus 5.5) via the host default route
- The latest available GPT Sol model (currently GPT-6.2 Sol) through OpenCode `openai`, agent `colin-mbot-gpt-sol`, variant `high`
- The latest available Gemini Neon model (currently Gemini 4 Neon, `openrouter/google/gemini-4-neon`) through OpenCode, agent `colin-mbot-gemini-neon`, variant `high`. On an Antigravity (agy) host, run it as a native subagent instead.

Resolve "latest" from the live catalog (`/api/model` on OpenCode 2, `/config/providers` on OpenCode 1, `agy models` for agy) and record the exact model/provider IDs before launch. If a newer Opus, Sol or Neon is listed, use it and update the matching `colin-mbot-*` agent.

For each participant, use a fresh independent session, allow read-only repository tools, and persist the complete final output to disk under the run `results/` dir.

No Grok, and no backup model: when a primary cannot run, retry it once with the same model, then proceed with the available participants and report the missing one. Do not use Grok, Kimi, GLM, or other experimental models as a participant or backup unless the user explicitly names them.
