/**
 * VoltAgent Tool Template
 *
 * Copy this template when creating new agent tools.
 * Update the name, description, parameters, and execute function.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'

export const myTool = createTool({
  // Tool name - use snake_case
  name: 'my_tool_name',

  // Clear description of what this tool does
  // The LLM uses this to decide when to call the tool
  description: 'Describe what this tool does and when to use it',

  // Parameter schema using Zod
  // ALWAYS use .describe() for each parameter
  parameters: z.object({
    // Required parameter
    requiredParam: z.string().describe('What this parameter is for'),

    // Optional parameter with default
    optionalParam: z.number().optional().describe('Optional: what this does'),

    // Enum parameter
    enumParam: z.enum(['option1', 'option2']).optional().describe('Choose an option'),

    // Array parameter
    arrayParam: z.array(z.string()).optional().describe('List of items'),
  }),

  // Optional: Tags for categorization and access control
  tags: ['category', 'feature'],

  // Execute function - receives parsed parameters and options
  execute: async (args, options) => {
    // Access context values passed from the API endpoint
    const userId = options?.context?.get('userId')
    const isAdmin = options?.context?.get('isAdmin') === 'true'

    // Access operation metadata
    const operationId = options?.operationId

    // Use scoped logger if available
    options?.logger?.info(`Executing tool for user ${userId}`)

    // Check if operation is still active (not cancelled)
    if (!options?.isActive) {
      throw new Error('Operation has been cancelled')
    }

    // Support cancellation for long-running operations
    const signal = options?.abortController?.signal
    if (signal?.aborted) {
      throw new Error('Tool cancelled before execution')
    }

    // Example: Database access (project-specific)
    // const db = useDB()
    // const results = await db.select().from(table).where(...)

    // Example: External API call with cancellation support
    // const response = await fetch('https://api.example.com', { signal })

    // Return structured result
    // The LLM will use this to formulate its response
    return {
      success: true,
      data: {
        // Your result data here
      },
      metadata: {
        executedBy: userId,
        timestamp: new Date().toISOString(),
      },
    }
  },
})

/**
 * Usage in agent:
 *
 * import { myTool } from './tools/myTool'
 *
 * const agent = new Agent({
 *   name: 'My Agent',
 *   model: anthropic('claude-3-5-haiku-20241022'),
 *   tools: [myTool],
 * })
 */
