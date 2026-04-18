# Nuxt UI Prose Components Reference

When the project uses [Nuxt UI v4](https://ui.nuxt.com) with `@nuxt/content` (this includes Docus, Nuxt UI Pro docs starter, etc.), the following prose components are auto-registered. Each maps to a `Prose<Name>` Vue component under the hood.

Source: <https://ui.nuxt.com/docs/typography>

Use `:::` (three colons) for components nested inside a `::` block.

## Accordion / AccordionItem

Collapsible Q&A sections. AccordionItem props: `label`, `icon` (note: `label`, not `title`). The parent `accordion` accepts a YAML block with `defaultValue` (array of item indices to open by default).

```mdc
::accordion
---
defaultValue:
  - '1'
---

::accordion-item{label="Is Nuxt UI free to use?" icon="i-lucide-circle-help"}
Yes! Nuxt UI is MIT-licensed and free.
::

::accordion-item{label="Can I use it without Nuxt?" icon="i-lucide-circle-help"}
Yes — it works with standalone Vue via the Vite plugin.
::
::
```

## Badge

Inline status / version badge. Supports markdown in the slot.

```mdc
::badge
**v3.0.0**
::
```

## Callout (and `note` / `tip` / `warning` / `caution` shortcuts)

Highlights important information. Props: `icon`, `color` (`primary` | `secondary` | `success` | `info` | `warning` | `error` | `neutral`), plus NuxtLink props (`to`, `target`) to make the whole callout a link.

```mdc
::callout{icon="i-lucide-info" color="info"}
Generic callout with custom icon and color.
::

::callout{to="/docs/getting-started" icon="i-lucide-square-play" color="neutral"}
Linkable callout — clicking navigates to `to`.
::
```

The shortcut variants are pre-styled callouts with sensible icons and colors:

```mdc
::note
Here's some additional information.
::

::tip
Here's a helpful suggestion.
::

::warning
Be careful with this action — it might have unexpected results.
::

::caution
This action cannot be undone.
::
```

## Card / CardGroup

Cards in a responsive grid, optionally linked. Card props: `title`, `icon`, `color`, plus NuxtLink props (`to`, `target`). Use a YAML block when props get long.

```mdc
::card-group

::card
---
title: Dashboard
icon: i-simple-icons-github
to: https://github.com/nuxt-ui-templates/dashboard
target: _blank
---
A dashboard with multi-column layout.
::

::card
---
title: Docs
icon: i-simple-icons-github
to: https://github.com/nuxt-ui-templates/docs
target: _blank
---
A documentation template with `@nuxt/content`.
::

::
```

## CodeCollapse

Wraps a code block in a collapsible container — keeps long snippets from dominating the page. Props: `icon`, `name`, `openText`, `closeText`, `open` (boolean, default `false`).

````mdc
::code-collapse

```css [app/assets/css/main.css]
@import "tailwindcss";
@import "@nuxt/ui";

@theme static {
  --font-sans: 'Public Sans', sans-serif;
  --color-primary: #00DC82;
  /* ...lots more lines... */
}
```

::
````

## CodeGroup

Group multiple code blocks behind tabs (e.g., one per package manager). The label in `[brackets]` after the language becomes the tab title.

````mdc
::code-group

```bash [npm]
npm install @nuxt/content
```

```bash [pnpm]
pnpm add @nuxt/content
```

```bash [yarn]
yarn add @nuxt/content
```

::
````

## CodePreview

Renders a live preview of MDC content alongside its source. Put the rendered content in the default slot and the source in a `#code` named slot.

````mdc
::code-preview
:icon{name="i-lucide-rocket"} Inline icon preview

#code
```mdc
:icon{name="i-lucide-rocket"} Inline icon preview
```
::
````

## CodeTree

Visualize a file/folder structure where each code block is a file. The tab/file label comes from the `[filename]` after the language. Props: `defaultValue` (path of the file selected initially), `expandAll` (boolean).

````mdc
::code-tree{default-value="app/app.config.ts"}

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css']
})
```

```ts [app/app.config.ts]
export default defineAppConfig({
  ui: {
    colors: { primary: 'green' }
  }
})
```

```css [app/assets/css/main.css]
@import "tailwindcss";
@import "@nuxt/ui";
```

::
````

## Collapsible

A single expandable section — useful for hiding long prop tables or supplementary detail.

```mdc
::collapsible
| Prop | Default | Type   |
|------|---------|--------|
| name |         | string |
| size | `md`    | string |
::
```

## Field / FieldGroup

Document API parameters or component props as a structured list. Field props: `name`, `type`, `required` (boolean), `description` (or use the default slot for markdown).

```mdc
::field-group
::field{name="title" type="string" required}
The page title shown in the header.
::
::field{name="icon" type="string"}
Icon name from any Iconify collection.
::
::
```

## Icon

Inline icon from any Iconify collection. The `i-lucide-*` and `i-simple-icons-*` collections are preloaded by Nuxt UI.

```mdc
:icon{name="i-lucide-rocket"}
:icon{name="i-simple-icons-nuxtdotjs"}
```

## Kbd

Inline keyboard key representation. Takes a `value` prop.

```mdc
Press :kbd{value="meta"} + :kbd{value="K"} to open search.
```

## Steps

Turns headings inside the block into a numbered step sequence using CSS counters. The `level` prop (`"2"`, `"3"`, default `"3"`, or `"4"`) selects which heading level becomes a step.

```mdc
::steps{level="4"}

#### Install the module
Run the install command in your project root.

#### Configure nuxt.config
Add `@nuxt/ui` to the `modules` array.

#### Start the dev server
Run `npm run dev` and open the printed URL.

::
```

## Tabs / TabsItem

Tabbed content panels. TabsItem props: `label`, `icon`.

````mdc
::tabs

:::tabs-item{label="Code" icon="i-lucide-code"}
```mdc
::callout
Lorem ipsum dolor sit amet.
::
```
:::

:::tabs-item{label="Preview" icon="i-lucide-eye"}
::callout
Lorem ipsum dolor sit amet.
::
:::

::
````

## Prompt (coming soon)

Listed in the Nuxt UI typography docs as upcoming — not yet available. Track at <https://ui.nuxt.com/docs/typography/prompt>.
