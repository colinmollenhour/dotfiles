# Overlays

## Modals (`<UModal>`)

Use for blocking, focused tasks. Always use `v-model:open`:

```vue
<script setup lang="ts">
import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'

const showModal = ref(false)
const editingItem = ref<Item | null>(null)

const breakpoints = useBreakpoints(breakpointsTailwind)
const smallerThanXl = breakpoints.smaller('xl')

function openCreateModal() {
  editingItem.value = null
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingItem.value = null
}
</script>

<template>
  <UModal
    v-model:open="showModal"
    :title="editingItem ? 'Edit' : 'Create'"
    :fullscreen="smallerThanXl"
  >
    <template #body>
      <MyForm :item="editingItem" @submit="handleSubmit" @cancel="closeModal" />
    </template>
  </UModal>
</template>
```

## Slideovers (`<USlideover>`)

Use for complex forms or detail panels:

```vue
<USlideover v-model:open="isOpen" title="Select Item">
  <template #body>
    <!-- Content -->
  </template>
  <template #footer>
    <div class="flex justify-end gap-3">
      <UButton variant="ghost" @click="isOpen = false">Cancel</UButton>
      <UButton @click="confirm">Confirm</UButton>
    </div>
  </template>
</USlideover>
```

## Other Overlays

- **`<UPopover>`:** Non-critical info on click.
- **`<UTooltip>`:** Brief hints on hover. Never put critical info here.
- **`<UAlert>`:** Persistent page-level messages.
