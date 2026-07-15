# Lifecycle Hooks

VoltAgent provides hooks for observability and control at key lifecycle points.

## Creating Hooks

```typescript
import { createHooks } from '@voltagent/core'

const hooks = createHooks({
  onStart: async ({ agent, context }) => {
    console.log(`Agent ${agent.name} starting`)
    console.log(`Operation ID: ${context.operationId}`)
  },

  onEnd: async ({ agent, output, error, context }) => {
    if (error) {
      console.error('Agent failed:', error.message)
    } else {
      console.log('Completed:', output?.usage?.totalTokens, 'tokens')
    }
  },
})

const agent = new Agent({
  name: 'Agent with Hooks',
  model: anthropic('claude-3-5-haiku-20241022'),
  hooks,
})
```

---

## Available Hooks

### Agent Lifecycle

```typescript
const hooks = createHooks({
  // Before agent starts processing
  onStart: async ({ agent, context }) => {},

  // After agent completes (success or error)
  onEnd: async ({ agent, output, error, context }) => {},
})
```

### Tool Lifecycle

```typescript
const hooks = createHooks({
  // Before tool execution
  onToolStart: async ({ agent, tool, args, context }) => {
    console.log(`Tool ${tool.name} starting with:`, args)
  },

  // After tool execution
  onToolEnd: async ({ agent, tool, output, error }) => {
    if (error) {
      console.error(`Tool ${tool.name} failed:`, error)
    }
  },
})
```

### Message Preparation

```typescript
import { messageHelpers } from '@voltagent/core'

const hooks = createHooks({
  // Transform messages before sending to LLM
  onPrepareMessages: async ({ messages, rawMessages, context }) => {
    const enhanced = messages.map((msg) => {
      if (msg.role === 'user') {
        const timestamp = new Date().toLocaleTimeString()
        msg = messageHelpers.addTimestampToMessage(msg, timestamp)
      }

      // Redact sensitive data
      msg = messageHelpers.mapMessageContent(msg, (text) => {
        return text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]')
      })

      return msg
    })

    return { messages: enhanced }
  },

  // Prepare model-specific messages
  onPrepareModelMessages: async ({ modelMessages, uiMessages }) => {
    if (!modelMessages.some((msg) => msg.role === 'system')) {
      return {
        modelMessages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'Operate safely' }],
          },
          ...modelMessages,
        ],
      }
    }
    return {}
  },
})
```

### Sub-Agent Handoff

```typescript
const hooks = createHooks({
  // When control passes to sub-agent
  onHandoff: async ({ agent, sourceAgent }) => {
    console.log(`Handoff: ${sourceAgent.name} → ${agent.name}`)
  },

  // When sub-agent completes
  onHandoffComplete: async ({ agent, result, bail, context }) => {
    if (agent.name === 'FinalOutputAgent') {
      bail() // Skip supervisor processing
    }
  },
})
```

---

## Tool Access Control

Use `onToolStart` to enforce permissions:

```typescript
import { ToolDeniedError } from '@voltagent/core'

const hooks = createHooks({
  onToolStart: ({ agent, tool, args, context }) => {
    // Check permissions based on tags
    if (tool.tags?.includes('destructive')) {
      const userRole = context.context.get('userRole')
      if (userRole !== 'admin') {
        throw new ToolDeniedError({
          toolName: tool.name,
          message: 'Admin permission required',
          code: 'TOOL_FORBIDDEN',
        })
      }
    }
  },
})
```

---

## Guardrails

### Input Guardrails

```typescript
const agent = new Agent({
  name: 'Guarded Assistant',
  model: anthropic('claude-3-5-haiku-20241022'),
  inputGuardrails: [
    {
      id: 'reject-empty',
      name: 'Reject Empty Prompts',
      handler: async ({ inputText }) => {
        if (inputText.trim().length === 0) {
          return {
            pass: false,
            action: 'block',
            message: 'Prompt cannot be empty.',
          }
        }
        return { pass: true }
      },
    },
  ],
})
```

### Output Guardrails

```typescript
const agent = new Agent({
  name: 'Guarded Assistant',
  model: anthropic('claude-3-5-haiku-20241022'),
  outputGuardrails: [
    {
      id: 'trim-output',
      name: 'Trim Whitespace',
      handler: async ({ output }) => ({
        pass: true,
        action: 'modify',
        modifiedOutput: typeof output === 'string'
          ? output.trim()
          : output,
      }),
    },
  ],
})
```

---

## Complete Example

```typescript
const hooks = createHooks({
  onStart: async ({ agent, context }) => {
    console.log(`[${context.operationId}] Agent ${agent.name} started`)
  },

  onToolStart: async ({ tool, args }) => {
    console.log(`  → Tool ${tool.name}:`, args)
  },

  onToolEnd: async ({ tool, output, error }) => {
    if (error) {
      console.error(`  ✗ Tool ${tool.name} failed:`, error.message)
    } else {
      console.log(`  ✓ Tool ${tool.name} completed`)
    }
  },

  onEnd: async ({ agent, output, error, context }) => {
    if (error) {
      console.error(`[${context.operationId}] Failed:`, error.message)
    } else {
      const tools = context.steps
        .flatMap((s) => s.toolInvocations || [])
        .map((t) => t.toolName)
      console.log(`[${context.operationId}] Completed`)
      console.log(`  Tools used: ${tools.join(', ') || 'none'}`)
      console.log(`  Tokens: ${output?.usage?.totalTokens}`)
    }
  },
})
```
