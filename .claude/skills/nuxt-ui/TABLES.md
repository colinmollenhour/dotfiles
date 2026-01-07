# Data Tables

Tables use `useFetch` with computed queries for reactive filtering.

## Table with useFetch

```vue
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const searchQuery = ref('')

const { data, status, refresh } = await useFetch('/api/items', {
  query: computed(() => ({
    search: searchQuery.value || undefined,
  })),
  default: () => ({ items: [], total: 0 }),
})

const items = computed(() => data.value?.items || [])

const columns: TableColumn<Item>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '', enableSorting: false },
]
</script>

<template>
  <UTable :data="items" :columns="columns" :loading="status === 'pending'">
    <template #status-cell="{ row }">
      <UBadge :color="row.original.status === 'active' ? 'success' : 'neutral'">
        {{ row.original.status }}
      </UBadge>
    </template>

    <template #actions-cell="{ row }">
      <UDropdownMenu :items="menuItems(row.original)">
        <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
      </UDropdownMenu>
    </template>

    <template #empty>
      <div class="flex flex-col items-center justify-center p-8 text-center">
        <UIcon name="i-lucide-inbox" class="w-12 h-12 text-muted mb-4" />
        <p class="text-sm text-muted">
          {{ searchQuery ? 'No items match your search.' : 'No items found.' }}
        </p>
        <UButton v-if="!searchQuery" class="mt-4" @click="openCreateModal">
          Add Item
        </UButton>
      </div>
    </template>
  </UTable>
</template>
```

## Table Guidelines

- Use `:loading="status === 'pending'"` tied to useFetch status
- Computed `query` auto-triggers refetch on filter changes
- Always provide `#empty` slot with contextual messaging
- Use `#[column]-cell` slots for custom rendering
- Use `<UDropdownMenu>` for row actions (kebab menu)
