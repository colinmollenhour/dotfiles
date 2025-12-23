# Streaming & Structured Output

## Text Streaming

### Basic Streaming

```typescript
const stream = await agent.streamText('Explain async/await')

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}

// Access final values (Promises resolve when streaming completes)
const [fullText, usage] = await Promise.all([
  stream.text,
  stream.usage,
])
console.log(`\nTotal: ${usage?.totalTokens} tokens`)
```

### Full Event Stream

```typescript
const response = await agent.streamText('Write a story')

for await (const chunk of response.fullStream) {
  switch (chunk.type) {
    case 'text-delta':
      process.stdout.write(chunk.textDelta)
      break
    case 'tool-call':
      console.log(`\nUsing tool: ${chunk.toolName}`)
      break
    case 'tool-result':
      console.log(`Tool completed: ${chunk.toolName}`)
      break
    case 'finish':
      console.log(`\nDone! Tokens: ${chunk.usage?.totalTokens}`)
      break
  }
}
```

---

## Structured Output

### generateObject (No Tool Support)

```typescript
import { z } from 'zod'

const profileSchema = z.object({
  name: z.string(),
  age: z.number(),
  skills: z.array(z.string()),
})

// Synchronous object generation
const result = await agent.generateObject(
  'Create a developer profile for Alex',
  profileSchema
)
console.log(result.object)
```

### streamObject

```typescript
const stream = await agent.streamObject(
  'Create a profile for Jamie',
  profileSchema
)

for await (const partial of stream.partialObjectStream) {
  console.log(partial) // Partial object as it builds
}
```

---

## Structured Output with Tools (experimental_output)

Use `experimental_output` with `generateText` when you need BOTH tools and structured output:

```typescript
import { Output } from 'ai'

const recipeSchema = z.object({
  name: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
})

// Agent can use tools AND return structured output
const result = await agent.generateText('Create a pasta recipe', {
  experimental_output: Output.object({ schema: recipeSchema }),
})
console.log(result.experimental_output)
```

### Streaming with experimental_output

```typescript
const stream = await agent.streamText('Create a detailed recipe', {
  experimental_output: Output.object({ schema: recipeSchema }),
})

for await (const partial of stream.experimental_partialOutputStream ?? []) {
  console.log(partial)
}
```

---

## React Integration

### Server Action

```typescript
// app/actions/chat.ts
'use server'

export async function chat(messages: UIMessage[]) {
  const result = await agent.streamText(messages)
  return result.toUIMessageStreamResponse()
}
```

### Client Component

```typescript
'use client'
import { useChat } from '@ai-sdk/react'

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  )
}
```

---

## Best Practices

### ✅ DO

- Use `fullStream` for detailed events
- Access final values via Promise properties (`stream.text`, `stream.usage`)
- Configure event types with `fullStreamEventForwarding` for sub-agents
- Use `toUIMessageStream()` for AI SDK integration

### ❌ DON'T

- Block the main thread waiting for stream completion
- Assume sub-agent text is visible without config
- Mix streaming and non-streaming patterns inconsistently
- Use `generateObject` when you need tool calling (use `experimental_output` instead)
