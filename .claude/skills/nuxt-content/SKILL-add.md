
## Routing Best Practices

### Avoiding Route Ambiguity with Optional Catch-All Routes
When creating a documentation section or any area using dynamic routes for content, avoid using optional catch-all routes like `[[...slug]].vue` if you also need to support the root path (e.g., `/docs`) and sub-paths (e.g., `/docs/getting-started`) reliably.

Nuxt/Vue Router can have trouble disambiguating the root path when using `[[...slug]].vue`.

**Recommended Pattern:**
Split the implementation into two explicit files:

1. `pages/docs/index.vue` - Handles the root `/docs` path
   ```vue
   <script setup>
   const { data: page } = await useAsyncData('docs-index', () => 
     queryCollection('docs').path('/docs').first()
   )
   // ... handle page not found ...
   </script>
   ```

2. `pages/docs/[...slug].vue` - Handles all nested paths (slug is required)
   ```vue
   <script setup>
   const route = useRoute()
   const slug = route.params.slug.join('/')
   const { data: page } = await useAsyncData(`docs-${slug}`, () => 
     queryCollection('docs').path(`/docs/${slug}`).first()
   )
   // ... handle page not found ...
   </script>
   ```

This ensures predictable routing behavior and prevents 404 errors on the root path.
