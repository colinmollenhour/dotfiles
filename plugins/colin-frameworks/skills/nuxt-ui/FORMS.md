# Forms

All forms use Zod schemas integrated with UForm for validation.

## Form Structure with Zod

```vue
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: undefined,
  email: undefined,
})

const toast = useToast()
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    await $fetch('/api/endpoint', { method: 'POST', body: event.data })
    toast.add({ title: 'Success', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error?.data?.message || 'An error occurred',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" @submit="onSubmit">
    <UFormField label="Name" name="name" required>
      <UInput v-model="state.name" />
    </UFormField>

    <UFormField label="Email" name="email" required>
      <UInput v-model="state.email" type="email" />
    </UFormField>

    <UButton type="submit" :loading="loading">Submit</UButton>
  </UForm>
</template>
```

## Form Field Guidelines

- **`<UFormField>`:** Required wrapper. Use `name` matching schema key, `required` for asterisk.
- **`<UInput>`:** Single-line text.
- **`<UTextarea>`:** Multi-line text.
- **`<USelect>`:** Simple dropdowns (< 5 options).
- **`<USelectMenu>`:** Searchable, supports multi-select (5+ options).
- **`<UCheckbox>`:** Multiple selections.
- **`<URadioGroup>`:** Single selection from small set.
- **`<USwitch>`:** On/off toggle.
- **`<USlider>`:** Value on continuum.

## Select Components

```vue
<!-- Simple dropdown -->
<USelect
  v-model="category"
  :items="categoryOptions"
  value-key="value"
  placeholder="Select category"
/>

<!-- Searchable, multi-select -->
<USelectMenu
  v-model="muscles"
  :items="muscleOptions"
  :multiple="true"
  value-key="value"
  searchable
/>
```

**Options format:**
```typescript
const options = computed(() => [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
])
```

## Toast Notifications

Use `useToast()` for all user feedback:

```typescript
const toast = useToast()

// Success
toast.add({
  title: 'Changes saved',
  description: 'Your profile has been updated.',
  color: 'success',
})

// Error
toast.add({
  title: 'Failed to save',
  description: error?.data?.message || 'An unexpected error occurred.',
  color: 'error',
})
```
