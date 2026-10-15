# Components

## Buttons (`<UButton>`)

| Variant | Use Case | Example |
|---------|----------|---------|
| `solid` (default) | Primary action | "Save", "Submit", "Create" |
| `outline` | Secondary action | "View Details", "Export" |
| `ghost` | Tertiary/icon buttons | Table row actions, Cancel |
| `link` | Navigation-like | "Learn more", "View all" |

**Always use `loading` prop on async actions:**
```vue
<UButton :loading="saving" type="submit">Save</UButton>
```

**Icon buttons need aria-label:**
```vue
<UButton
  icon="i-lucide-trash"
  variant="ghost"
  :aria-label="`Delete ${item.name}`"
/>
```

## Dropdown Menus (`<UDropdownMenu>`)

Structure items as nested arrays for grouping:

```typescript
const menuItems = (item: Item) => [
  [
    { label: 'Edit', icon: 'i-lucide-square-pen', onSelect: () => handleEdit(item) },
    { label: 'Hide', icon: 'i-lucide-eye-off', onSelect: () => handleHide(item) },
  ],
  [
    { label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => handleDelete(item) },
  ],
]
```

```vue
<UDropdownMenu :items="menuItems(item)" mode="click">
  <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
</UDropdownMenu>
```

## Data Display

- **`<UAvatar>`:** Represent users. Use `<UAvatarGroup>` for lists.
- **`<UBadge>`:** Status labels, counts, tags. Use color for meaning.
- **`<UProgress>`:** Determinate progress (file uploads, multi-step).
- **`<UKbd>`:** Keyboard shortcuts.
- **`<UIcon>`:** Icons from `i-lucide-*` or `i-heroicons-*`.

## Layout & Structure

### Page Structure
- **`<UContainer>`:** Primary wrapper for main content. Provides consistent padding and max-width.
- **`<UCard>`:** Group related content. Use `header`, `body`, and `footer` slots for organization.

### Content Organization
- **`<UAccordion>`:** Condense long content (FAQs). Use `multiple` prop if users need to compare items.
- **`<UCollapsible>`:** Single show/hide section (e.g., "Advanced Settings").
- **`<UTabs>`:** Switch between related views (e.g., "Profile", "Settings", "Billing").

### Responsive Design
- **Mobile-First:** Use Tailwind prefixes (`sm:`, `md:`, `lg:`, `xl:`) to adapt layouts.
- **Grids:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
