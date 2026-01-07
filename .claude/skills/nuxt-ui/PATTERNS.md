# Patterns & Best Practices

## Core Principles

- **Clarity & Simplicity:** The UI should be self-explanatory. If a user has to think about what a button does, the design failed.
- **Consistency:** Use the same components, colors, and terminology for the same actions throughout.
- **User Control & Freedom:** Users should easily undo actions, navigate freely, and understand where they are.
- **Feedback & Communication:** Provide immediate feedback for every interaction (loading states, toasts, empty states).
- **Efficiency:** Arrange information logically, streamline workflows, respond quickly.

## Accessibility

- **Semantic HTML:** Use elements for their purpose (`<button>`, `<nav>`).
- **Form Labels:** All inputs must have labels via `<UFormField>`.
- **Keyboard Navigation:** All interactive elements keyboard accessible.
- **Focus States:** Visible focus indicators.
- **ARIA Labels:** Add `aria-label` to icon-only buttons.

## Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| Forms without Zod | Always use schema with UForm |
| Missing loading states | `:loading` on buttons, `status === 'pending'` on tables |
| Generic empty states | Custom `#empty` slot with contextual message and CTA |
| Using `@close` on modals | Use `v-model:open` for two-way binding |
| Hardcoded modal sizes | Use VueUse breakpoints for responsive fullscreen |
| No toast feedback | Always show success/error toasts |
| `USelect` for long lists | Use `USelectMenu` with `searchable` for 5+ items |
| Missing error handling | Try/catch with `error?.data?.message` in toast |

## Fetching Component Docs

1. Fetch `https://ui.nuxt.com/llms.txt`
2. Find the component link (e.g., `- [Modal](https://ui.nuxt.com/raw/components/modal.md)`)
3. Fetch the raw markdown for Props, Slots, and Events

### Targeted WebFetch Template

```
"Extract ONLY the documentation for [UComponent] from Nuxt UI.
Include: Props, Slots, Events, code examples.
Exclude everything else. Return a concise summary."
```
