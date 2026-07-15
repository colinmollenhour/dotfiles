# Memory Configuration

VoltAgent supports persistent conversation memory through storage adapters.

## In-Memory Storage (Default)

```typescript
import { Agent } from '@voltagent/core'

const agent = new Agent({
  name: 'Agent',
  model: anthropic('claude-3-5-haiku-20241022'),
  // memory: default InMemoryStorage (non-persistent)
})
```

**Note:** Default memory is lost when the process restarts.

---

## LibSQL Storage (Local SQLite)

```typescript
import { Agent, Memory } from '@voltagent/core'
import { LibSQLMemoryAdapter } from '@voltagent/libsql'

const memory = new Memory({
  storage: new LibSQLMemoryAdapter({
    url: 'file:./.data/memory.db',
  }),
})

const agent = new Agent({
  name: 'Agent with Persistent Memory',
  model: anthropic('claude-3-5-haiku-20241022'),
  memory,
})
```

---

## Turso (Remote/Production)

```typescript
const memory = new Memory({
  storage: new LibSQLMemoryAdapter({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
    tablePrefix: 'voltagent_',
  }),
})
```

---

## Using Memory in Conversations

```typescript
// First message - establish context
await agent.generateText('My name is Sarah', {
  userId: 'user-123',
  conversationId: 'chat-001',
})

// Agent remembers across messages
await agent.generateText("What's my name?", {
  userId: 'user-123',
  conversationId: 'chat-001',
})
// Response: "Your name is Sarah."
```

**Critical:** Always provide `userId` and `conversationId` for memory to work.

---

## Memory Options

```typescript
const agent = new Agent({
  name: 'Agent',
  model: anthropic('claude-3-5-haiku-20241022'),
  memory,
  memoryOptions: {
    contextLimit: 10, // Keep only 10 recent messages
  },
})
```

---

## Semantic Search (Advanced)

```typescript
const memory = new Memory({
  storage: new LibSQLMemoryAdapter({ /* ... */ }),
  vectorAdapter: new OpenAIEmbeddingAdapter(),
  semanticSearch: {
    enabled: true,
    topK: 5, // Retrieve 5 most relevant messages
  },
})
```

---

## Common Issues

### Memory not persisting
- Check if using default InMemoryStorage (non-persistent)
- Verify `userId` and `conversationId` are being passed
- For LibSQL, ensure file path is writable
- For Turso, verify credentials are correct

### Context growing too large
- Use `contextLimit` in memoryOptions
- Enable semantic search for large conversation histories
