Use the following:

- Claude CLI with the latest available Opus model at **high** reasoning effort (not max/xhigh unless the user asks)
- OpenCode with OpenAI/GPT-5.6 Sol at high reasoning effort (agent `colin-mbot-gpt`)
- Grok CLI with Grok 4.5 at high reasoning effort; fall back to OpenCode agent `colin-mbot-grok` when the first-party CLI is unavailable

For each participant, use a fresh independent session, allow read-only repository tools, and persist the complete final output to disk under the run `results/` dir. Resolve and record the exact model/provider IDs before launch. Prefer Grok CLI (or OpenCode `colin-mbot-grok`) as the backup when a primary cannot run. Do not use Kimi, GLM, or other experimental models as a default or backup unless the user explicitly names them.
