# Troubleshooting

## Common Issues

### Agent not calling tools

**Symptoms:** Agent responds with text but never uses available tools

**Solutions:**
1. Ensure tool descriptions are clear and specific
2. Check that parameters have `.describe()` calls
3. Verify the user query actually requires the tool
4. Try with `temperature: 0` for more deterministic behavior

```typescript
// ❌ Vague description
const tool = createTool({
  name: 'search',
  description: 'Search for data',
  // ...
})

// ✅ Specific description
const tool = createTool({
  name: 'search_exercises',
  description: 'Search the exercise database by name, muscle group, or equipment. Returns matching exercises with details.',
  parameters: z.object({
    query: z.string().describe('Search term (exercise name, muscle like "chest", or equipment like "dumbbell")'),
    limit: z.number().optional().describe('Maximum results to return (default: 10)'),
  }),
  // ...
})
```

---

### Memory not persisting

**Symptoms:** Agent forgets context between messages or restarts

**Causes & Solutions:**

1. **Using default InMemoryStorage** - Switch to LibSQL:
   ```typescript
   import { LibSQLMemoryAdapter } from '@voltagent/libsql'

   const memory = new Memory({
     storage: new LibSQLMemoryAdapter({
       url: 'file:./.data/memory.db',
     }),
   })
   ```

2. **Missing userId/conversationId**:
   ```typescript
   // ❌ Missing identifiers
   await agent.generateText('Hello')

   // ✅ With identifiers
   await agent.generateText('Hello', {
     userId: 'user-123',
     conversationId: 'chat-001',
   })
   ```

3. **File path not writable** - Check permissions on the database file location

4. **Turso credentials incorrect** - Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

---

### Sub-agent text not visible in stream

**Symptoms:** Sub-agent tool calls visible but text output missing

**Solution:** Configure `fullStreamEventForwarding` with `text-delta`:

```typescript
const supervisor = new Agent({
  name: 'Supervisor',
  subAgents: [workerAgent],
  supervisorConfig: {
    fullStreamEventForwarding: {
      types: ['tool-call', 'tool-result', 'text-delta'], // Include text-delta!
    },
  },
})
```

Also ensure you're consuming `fullStream`, not just `textStream`:
```typescript
for await (const chunk of response.fullStream) {
  if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.textDelta)
  }
}
```

---

### Rate limits or timeout errors

**Symptoms:** API errors about rate limits or requests timing out

**Solutions:**

1. **Implement retry logic**:
   ```typescript
   const agent = new Agent({
     name: 'Agent',
     model: anthropic('claude-3-5-haiku-20241022'),
     maxRetries: 3,
   })
   ```

2. **Limit tool iterations**:
   ```typescript
   const agent = new Agent({
     name: 'Agent',
     model: anthropic('claude-3-5-haiku-20241022'),
     maxSteps: 10, // Limit tool call loops
   })
   ```

3. **Control response size**:
   ```typescript
   await agent.generateText('Write a story', {
     maxOutputTokens: 1000,
   })
   ```

4. **Use smaller models for simple tasks**:
   ```typescript
   // For simple queries
   model: anthropic('claude-3-5-haiku-20241022')

   // For complex reasoning
   model: anthropic('claude-3-5-sonnet-20241022')
   ```

---

### Tool execution errors

**Symptoms:** Tools fail with unhandled errors

**Solution:** Add proper error handling:

```typescript
const tool = createTool({
  name: 'fetch_data',
  description: 'Fetch data from API',
  parameters: z.object({
    endpoint: z.string(),
  }),
  execute: async ({ endpoint }, options) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        signal: options?.abortController?.signal,
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request cancelled')
      }
      // Return error info instead of throwing
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
})
```

---

### Observability not working

**Symptoms:** VoltOps console not showing agent activity

**Solutions:**

1. Check VoltAgent server is running (port 3141):
   ```bash
   curl http://localhost:3141/health
   ```

2. Verify environment variables:
   ```bash
   echo $VOLTAGENT_PUBLIC_KEY
   echo $VOLTAGENT_SECRET_KEY
   ```

3. Check firewall allows localhost connections

4. Check browser console for WebSocket connection errors

---

## Debug Mode

Enable detailed logging:

```typescript
import { createPinoLogger } from '@voltagent/logger'

const logger = createPinoLogger({
  name: 'voltagent-debug',
  level: 'debug',
})

new VoltAgent({
  agents: { agent },
  logger,
})
```

---

## Health Checks

```bash
# Check if server is running
curl http://localhost:3141/health

# List available agents
curl http://localhost:3141/agents

# Check observability status
curl http://localhost:3141/observability/status
```

---

## Getting Help

- [VoltAgent Documentation](https://voltagent.dev/docs/quick-start)
- [GitHub Issues](https://github.com/voltagent/voltagent/issues)
- [Discord Community](https://s.voltagent.dev/discord)
