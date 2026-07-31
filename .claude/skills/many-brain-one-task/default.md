Use the following:

- Claude CLI with the latest available Opus model at maximum reasoning effort
- OpenCode with OpenAI/GPT-5.6 Sol at high reasoning effort (agent `colin-mbot-gpt`)
- Grok CLI with Grok 4.5 at high reasoning effort; fall back to OpenCode agent `colin-mbot-grok` when the first-party CLI is unavailable

Resolve and record the exact model/provider IDs before launch. Prefer Grok CLI (or OpenCode `colin-mbot-grok`) as the backup when a primary cannot run. Do not use Kimi as a default or backup participant unless the user explicitly names it.
