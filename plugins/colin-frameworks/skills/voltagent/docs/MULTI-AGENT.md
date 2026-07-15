# Multi-Agent Orchestration

VoltAgent supports multi-agent workflows through sub-agents and supervisor patterns.

## Basic Sub-Agents

```typescript
// Define specialized agents
const researchAgent = new Agent({
  name: 'WebResearcher',
  instructions: 'Search and summarize web content.',
  model: anthropic('claude-3-5-haiku-20241022'),
  tools: [webSearchTool],
})

const writerAgent = new Agent({
  name: 'Writer',
  instructions: 'Write clear, concise content.',
  model: anthropic('claude-3-5-haiku-20241022'),
})

// Create supervisor agent
const supervisor = new Agent({
  name: 'Coordinator',
  instructions: `
    Coordinate research and writing tasks.
    Delegate research to WebResearcher.
    Delegate writing to Writer.
    Available agents: WebResearcher, Writer.
  `,
  model: anthropic('claude-3-5-sonnet-20241022'),
  subAgents: [researchAgent, writerAgent],
})

// Supervisor delegates automatically
const result = await supervisor.generateText('Research AI trends and write summary')
```

---

## Supervisor Configuration

```typescript
const supervisor = new Agent({
  name: 'Content Supervisor',
  instructions: 'Coordinate content creation workflow',
  model: anthropic('claude-3-5-haiku-20241022'),
  subAgents: [writerAgent, editorAgent],
  supervisorConfig: {
    // Add custom guidelines
    customGuidelines: [
      'Always thank the user at the end',
      'Keep responses concise and actionable',
    ],

    // Include previous agent interactions (default: true)
    includeAgentsMemory: true,

    // Configure event forwarding for streaming
    fullStreamEventForwarding: {
      types: ['tool-call', 'tool-result', 'text-delta'],
    },

    // Error handling
    throwOnStreamError: false,
    includeErrorInEmptyResponse: true,
  },
})
```

---

## Early Termination (Bail)

Use `bail()` to skip supervisor processing when a sub-agent produces final output:

```typescript
const supervisor = new Agent({
  name: 'Workout Supervisor',
  subAgents: [exerciseAgent, workoutBuilder],
  hooks: {
    onHandoffComplete: async ({ agent, result, bail, context }) => {
      // Bail when subagent produces final output
      if (agent.name === 'Workout Builder') {
        context.logger?.info('Final output received, bailing')
        bail() // Skip supervisor processing, return directly
      }
    },
  },
  supervisorConfig: {
    // Must include text-delta to see subagent output in stream
    fullStreamEventForwarding: {
      types: ['tool-call', 'tool-result', 'text-delta'],
    },
  },
})
```

**Benefits:**
- Saves tokens by skipping unnecessary supervisor processing
- Reduces latency for final responses
- Allows sub-agents to produce user-facing output directly

---

## Handoff Hook

```typescript
const hooks = createHooks({
  onHandoff: async ({ agent, sourceAgent }) => {
    console.log(`Handoff: ${sourceAgent.name} → ${agent.name}`)
  },

  onHandoffComplete: async ({ agent, result, bail }) => {
    console.log(`${agent.name} completed with result:`, result)
  },
})
```

---

## Best Practices

### ✅ DO

- Give sub-agents clear, focused purposes
- Use descriptive agent names (used by supervisor LLM)
- Configure `fullStreamEventForwarding` if you need text output
- Use `bail()` to optimize token usage for final outputs

### ❌ DON'T

- Create generic sub-agents without clear roles
- Expect text-delta events by default (only tool events forwarded)
- Bail on every subagent (defeats supervisor purpose)
- Forget that bail requires proper event forwarding config
