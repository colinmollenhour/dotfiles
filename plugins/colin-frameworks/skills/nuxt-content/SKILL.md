---
name: nuxt-content
user-invocable: false
description: 'Author or edit Nuxt Content Markdown using MDC syntax and Vue components.'
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Nuxt Content Markdown

Match the collection schema and nearby pages. Check `app/components/content/` or `components/content/` for project-specific tags. For Nuxt UI typography components, consult the bundled [component examples](./nuxt-ui-components.md).

## MDC fences and slots

Each nested block adds one colon. Close every block on its own line with the same number of colons as its opener. Align a named slot directive with the component it belongs to.

```md
::card
#title
Installation

#default
  :::note
  Restart the dev server after changing the config.
  :::
::
```

If a heading disappears or the rest of a page renders inside one card, check the preceding closing fence. If a slot name leaks into the rendered page, check its indentation.

- Keep an inline component in its surrounding paragraph. Use empty braces to delimit its name when text immediately follows, as in `:hello{}-world`.
- Pass strings with `{label="Install"}` and structured data with `{:items='["a","b"]'}`. For complex props use a YAML block delimited by `---` immediately below the opener.
- Give custom prose components distinct names when Nuxt UI registers the same tag. Check the built page for literal component tags if development and prerender output differ.
- For a section with separate root and nested pages, check both routes. An explicit `index.vue` and `[...slug].vue` can resolve ambiguity in an optional catch-all.

The [Nuxt Content Markdown guide](https://content.nuxt.com/docs/files/markdown) covers collection configuration, rendering, and MDC syntax.
