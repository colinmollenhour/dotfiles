---
description: Quick overview of Agent SOPs - what they are and how to use them
---

Explain Agent SOPs to the user and help them pick which one to run. Keep it brief and conversational.

Here's what you need to know:

**Agent SOPs** (Standard Operating Procedures) are structured markdown workflows that guide you through complex tasks reliably. They use RFC 2119 keywords (MUST, SHOULD, MAY) for precise control while staying flexible. Originated at Amazon, open-sourced via [Strands Agents](https://github.com/strands-agents/agent-sop).

All SOPs are invoked as slash commands with no inline arguments — just run the command and the agent will prompt you for the required info interactively.

Present the user with these available commands and what the agent will ask for:

**`/agent-sops/codebase-summary`** — Analyze a codebase and generate comprehensive documentation (AGENTS.md, README.md, etc). The agent will ask for:
- Path to the codebase (defaults to cwd)
- Whether to consolidate into a single file like AGENTS.md or README.md
- Whether to run in update mode (only refresh docs based on recent commits)

**`/agent-sops/pdd`** — Prompt-driven development. Transform a rough idea into a detailed design doc with implementation plan. The agent will ask for:
- Your rough idea (required — can be text, a file path, or a URL)
- Where to store planning artifacts (defaults to .sop/planning)

**`/agent-sops/code-task-generator`** — Break requirements into structured, actionable code task files. The agent will ask for:
- Input (required — a task description, file path, or path to a PDD plan from the previous SOP)
- Which PDD step to process (if using a PDD plan)
- Output directory and task name (both optional)

**`/agent-sops/code-assist`** — TDD implementation workflow: Explore, Plan, Code, Commit. The agent will ask for:
- Task description (required — what to implement, as text, file path, or URL)
- Mode: "interactive" for step-by-step collaboration or "auto" for autonomous execution (defaults to auto)
- Any additional context or supplementary info

**`/agent-sops/eval`** — Conversational evaluation framework for AI agents. Four phases: Plan, Data, Eval, Report. The agent will ask for:
- Just describe what you want to evaluate conversationally (e.g. "Build an evaluation plan for my QA agent at /path/to/agent")

---

Also mention the typical chaining order where each SOP's output feeds into the next as context:

`codebase-summary` -> `pdd` -> `code-task-generator` -> `code-assist`

Ask the user what they're trying to accomplish so you can recommend the right SOP (or chain) for their situation.
