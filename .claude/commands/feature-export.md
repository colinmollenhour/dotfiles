---
description: Create an implementation guide for a feature in this repo so you can port it to another repo
argument-hint: Describe the feature, sources, etc...
allowed-tools: Bash(git show:*), Bash(git diff:*), Bash(git log:*), Bash(grep:*), Read, Edit
---

I need you to create a detailed implementation guide for porting a feature from this project to another similar project. The feature I want to document is: #$ARGUMENTS

Both projects share the same base structure so focus on the specific implementation details rather than general setup.

Please follow these steps:

1. **Git History Analysis**
   Start by examining git history to find all changes related to this feature:

   ```bash
   # Search commit messages for feature-related keywords
   git log --all --oneline --grep="{feature_keyword}"

   # Look at recent commits that might contain the feature
   git log --oneline -20

   # If you know specific files, check their history
   git log --oneline -- path/to/file.ts
   ```

   Once you identify relevant commits:
   - Use `git show {commit_hash}` to see the complete diff for each commit
   - Note commit messages for context on why changes were made
   - Look for related commits (features often span multiple commits)
   - Pay attention to small changes in existing files (not just new files)
   - Check for configuration changes, dependency updates, etc.

   This will give you the complete picture of:
   - What files were created
   - What existing files were modified
   - What configuration was changed
   - How tests were updated
   - The order in which components were built

2. **Feature Discovery & Analysis**
   - Search for all files related to this feature (using keywords from git history)
   - Identify implementation files:
     - Components (app/components/)
     - Composables (app/composables/)
     - API endpoints (server/api/)
     - Database schema/queries (server/database/)
     - Utilities (server/utils/, app/utils/)
   - Find tests:
     - Unit tests (tests/unit/)
     - E2E tests (tests/e2e/)
     - Test utilities (tests/e2e/utils/test-helpers.ts)
     - Test fixtures (tests/e2e/fixtures.ts)
     - Test API endpoints (server/api/_test/)
   - Check for:
     - Configuration changes (nuxt.config, package.json)
     - Database migrations (server/database/migrations/)
     - Environment variables
     - Middleware (app/middleware/, server/middleware/)

3. **Understand the Implementation**
   - Read all related files to understand the feature
   - Identify core logic and helper functions
   - Note integration points with other features
   - Document architectural patterns used
   - Map out data flow (UI → API → Database)
   - Review git diffs to understand what was modified in existing files

4. **Analyze Testing Infrastructure**
   - **Test Utilities**: Any new helpers added to `tests/e2e/utils/test-helpers.ts`?
   - **Test Fixtures**: Any new fixtures added to `tests/e2e/fixtures.ts`?
   - **Test API Endpoints**: Any new endpoints in `server/api/_test/`?
   - **Cleanup Updates**: Were changes made to `server/api/_test/cleanup.post.ts`?
   - **Test Patterns**: What testing patterns are used? (fixtures, helpers, direct flows)
   - **Coverage**: What scenarios are tested? (happy path, edge cases, errors)

5. **Create Implementation Guide**
   Create a markdown file at `./FEATURE-{FEATURE_NAME}.md` with the following structure:

   ```markdown
   # Feature Export: {Feature Name}

   ## Overview
   Brief description of what this feature does and why it's useful.

   ## Git History Context
   Document the commits that introduced this feature:
   - Commit hashes and messages
   - Order of implementation (what was built first)
   - Any refactoring or related changes to existing code
   - Key decisions noted in commit messages

   ## Prerequisites
   - Required packages (with versions from package.json)
   - Required configuration
   - Any dependencies on other features

   ## Implementation Files

   ### Application Files

   #### Components
   For each component file:
   - **Path**: `app/components/path/to/Component.vue`
   - **Purpose**: What this component does
   - **Props/Emits**: Interface definitions
   - **Git Context**: Was this new or modified? What changed?
   - **Full Code**: Complete implementation with all imports
   ```vue
   <script setup lang="ts">
   // Full component code here
   </script>
   ```

   #### Composables
   For each composable:
   - **Path**: `app/composables/useFeature.ts`
   - **Purpose**: What this composable provides
   - **Exports**: Functions and return types
   - **Git Context**: New file or modification?
   - **Full Code**: Complete implementation
   ```typescript
   // Full composable code here
   ```

   #### Pages (if applicable)
   - **Path**: `app/pages/path/to/page.vue`
   - **Route**: The URL this page creates
   - **Git Context**: New file or modification?
   - **Full Code**: Complete implementation

   #### Middleware (if applicable)
   - **Path**: `app/middleware/feature.ts` or `server/middleware/feature.ts`
   - **Purpose**: What this middleware does
   - **Git Context**: New file or modification?
   - **Full Code**: Complete implementation

   ### Backend Files

   #### API Endpoints
   For each endpoint:
   - **Path**: `server/api/path/to/endpoint.post.ts`
   - **Method**: GET/POST/PUT/DELETE
   - **Purpose**: What this endpoint does
   - **Request/Response**: Zod schemas
   - **Git Context**: New file or modification?
   - **Full Code**: Complete implementation
   ```typescript
   // Full endpoint code here
   ```

   #### Database Schema
   If schema changes are needed:
   - **Path**: `server/database/schema/table-name.ts`
   - **Tables Added/Modified**: List of changes
   - **Git Context**: What was added vs what existed before?
   - **Full Code**: Complete schema definitions
   ```typescript
   // Full schema code here
   ```

   #### Database Queries
   For each query file:
   - **Path**: `server/database/queries/feature.ts`
   - **Purpose**: What queries this provides
   - **Git Context**: New file or modification?
   - **Full Code**: Complete implementation
   ```typescript
   // Full query code here
   ```

   #### Utilities
   For server or app utilities:
   - **Path**: `server/utils/feature.ts` or `app/utils/feature.ts`
   - **Purpose**: What utilities this provides
   - **Git Context**: New file or additions to existing file?
   - **Full Code**: Complete implementation

   ### Modified Existing Files
   **IMPORTANT**: Document any modifications to existing files that aren't primarily about this feature:

   For each modified file:
   - **Path**: `path/to/existing-file.ts`
   - **Why Modified**: How this supports the new feature
   - **Changes Made**: What was added/changed (use git diff as reference)
   - **Code Snippets**: The exact additions/modifications
   ```typescript
   // Show the specific changes, with context
   ```

   ### Testing Files

   #### Test Utilities
   If new test helpers were added to `tests/e2e/utils/test-helpers.ts`:
   - **Functions Added**: List of new helper functions
   - **Purpose**: What each helper does
   - **Full Code**: Complete implementation of each helper
   ```typescript
   // Full helper code here with JSDoc comments
   ```

   #### Test Fixtures
   If new fixtures were added to `tests/e2e/fixtures.ts`:
   - **Fixtures Added**: Names of new fixtures
   - **Purpose**: What each fixture provides
   - **Setup Logic**: How the fixture is created
   - **Full Code**: Complete fixture implementation
   ```typescript
   // Full fixture code here
   ```

   #### Test API Endpoints
   If new test endpoints were created in `server/api/_test/`:
   - **Path**: `server/api/_test/endpoint-name.post.ts`
   - **Purpose**: What test scenario this enables
   - **Request/Response**: Expected data structures
   - **Full Code**: Complete implementation
   ```typescript
   // Full test endpoint code here
   ```

   #### Cleanup Endpoint Updates
   If `server/api/_test/cleanup.post.ts` was modified:
   - **Tables Added**: New tables in cleanup logic
   - **Code Changes**: Exact code to add to cleanup endpoint
   ```typescript
   // Cleanup logic to add
   ```

   #### E2E Tests
   For each E2E test file:
   - **Path**: `tests/e2e/feature.spec.ts`
   - **Test Cases**: List of scenarios covered
   - **Fixtures/Helpers Used**: What test utilities are used
   - **Full Code**: Complete test file
   ```typescript
   // Full test code here
   ```

   #### Unit Tests
   For each unit test file:
   - **Path**: `tests/unit/feature.test.ts`
   - **Test Cases**: What's being tested
   - **Full Code**: Complete test file
   ```typescript
   // Full test code here
   ```

   ## Database Migrations
   If migrations are needed:
   - **Generated File**: Name of migration file in `server/database/migrations/`
   - **SQL Changes**: What tables/columns are added/modified
   - **Migration Command**: `pnpm db:generate` creates migration automatically
   - **Full SQL**: Complete migration SQL (for reference)
   ```sql
   -- Migration SQL here
   ```

   ## Configuration Changes

   ### package.json
   If dependencies were added:
   ```json
   {
     "dependencies": {
       "package-name": "^1.0.0"
     },
     "devDependencies": {
       "dev-package": "^1.0.0"
     }
   }
   ```

   ### nuxt.config.ts
   If config changes are needed:
   ```typescript
   // Config changes here - show what was added/modified
   ```

   ### Environment Variables
   If new environment variables are needed:
   ```bash
   # Add to .env
   NEW_VAR=value
   ```

   ### Other Configuration Files
   Document any other config changes found in git history:
   - tsconfig.json
   - playwright.config.ts
   - vitest.config.ts
   - etc.

   ## Implementation Steps
   Step-by-step guide for implementing this feature in the target project:

   1. **Install Dependencies** (if any)
      ```bash
      pnpm add package-name
      ```

   2. **Update Configuration** (if needed)
      - Modify nuxt.config.ts
      - Add environment variables
      - Update other config files

   3. **Create Database Schema** (if needed)
      - Add/modify schema files in `server/database/schema/`
      - Run `pnpm db:generate` to create migration
      - Dev server will auto-apply migration

   4. **Create Backend Files** (in order of dependencies)
      - Utilities first
      - Database queries
      - API endpoints
      - Middleware

   5. **Modify Existing Backend Files** (if needed)
      - Follow the documented changes to existing files
      - Ensure changes integrate properly with existing code

   6. **Create Frontend Files**
      - Composables
      - Components
      - Pages
      - Middleware

   7. **Modify Existing Frontend Files** (if needed)
      - Follow the documented changes to existing files

   8. **Create Test Infrastructure**
      - Test API endpoints (if any)
      - Update cleanup endpoint
      - Add test fixtures
      - Add test helpers

   9. **Write Tests**
      - Unit tests
      - E2E tests

   10. **Verify Implementation**
      - Run `pnpm typecheck`
      - Run `pnpm format .`
      - Run `pnpm test:unit`
      - Run `pnpm test:e2e:ai`
      - Manually test the feature

   ## Testing Guide

   ### Test Utilities Usage
   If new helpers were added, show how to use them:
   ```typescript
   import { newHelper } from './utils/test-helpers'

   test('example', async ({ page }) => {
     await newHelper(page, options)
   })
   ```

   ### Test Fixtures Usage
   If new fixtures were added, show how to use them:
   ```typescript
   import { test } from './fixtures'

   test('example', async ({ newFixture, page }) => {
     // newFixture is already set up and ready to use
   })
   ```

   ### Running Tests
   ```bash
   # Run specific test file
   pnpm test:e2e:ai tests/e2e/feature.spec.ts

   # Run specific test case
   pnpm test:e2e:ai tests/e2e/feature.spec.ts --grep "test case name"

   # Run unit tests
   pnpm test:unit tests/unit/feature.test.ts
   ```

   ## Verification Checklist
   - [ ] All dependencies installed
   - [ ] Configuration updated
   - [ ] Database migrations applied
   - [ ] All files created in correct locations
   - [ ] Existing files modified correctly
   - [ ] Test infrastructure in place
   - [ ] Cleanup endpoint updated (if test data is created)
   - [ ] Tests passing (unit and E2E)
   - [ ] No TypeScript errors (`pnpm typecheck`)
   - [ ] No linting errors (`pnpm format .`)
   - [ ] Feature working as expected in dev mode

   ## Example Usage
   Provide clear examples of how to use this feature:
   ```typescript
   // Example code showing feature usage
   ```

   ## Common Pitfalls
   Document any gotchas discovered (from git history or implementation):
   - Import path considerations
   - Timing issues in tests
   - Database constraint considerations
   - Test cleanup requirements
   - Issues that were fixed in follow-up commits

   ## Related Features
   List any features this depends on or enhances:
   - Feature A (required dependency)
   - Feature B (enhanced by this feature)
   ```

6. **Include Complete Code**
   - For EVERY file (new or modified), include the COMPLETE implementation
   - Include all imports, types, and dependencies
   - Add inline comments for complex logic
   - Show exact file paths
   - For modified files, clearly indicate what was added vs what existed

7. **Document Test Patterns**
   - Explain why certain test patterns were chosen
   - Document test helper design decisions
   - Note any test reliability improvements
   - Include examples of test usage

After completing this analysis and documentation, save the implementation guide and let me know it's ready. The guide should be comprehensive enough that another AI agent in the target project can implement this feature completely without needing to reference the source project.
