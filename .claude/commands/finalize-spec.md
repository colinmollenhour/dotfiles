---
description: Augment the current plan with thorough software development planning to create a thorough spec.
argument-hint: Additional context if needed (e.g. "Skip implementation order")
allowed-tools: Read
---

I have discussed the current plan at length and arrived at a high-level plan that accurately represents the functionality I desire. However, before we call this done, you must do further examination and augment the plan with thorough software development planning sections which are meant to guarantee a high quality outcome when we go to implementation.

Explore each of the Required Enhancements sections (unless otherwise noted in the User Notes section or it's obviously not applicable) as a Senior SWE would do and enhance the plan as described. Be thorough in your research but concise in your output. That is, don't add lots of useless reading but ensure we don't forget anything important as this will be the FINAL spec.

If new questions arise during this exercise, then ask me questions as you normally would but try to be autonomous.

Execution: Feel free to spawn sub-agents to explore each of the enhancement sections in parallel.

## User Notes

$ARGUMENTS

---

## Required Enhancements

### 1. Validation Criteria
Add a **Validation** section with:
- Explicit pass/fail acceptance criteria for each feature
- Expected outputs or state changes
- Conditions that would indicate failure

### 2. Edge Cases & Error Handling
Add a section covering:
- Boundary conditions and invalid inputs
- Failure modes and how they should be handled
- Race conditions or concurrency issues (if applicable)

### 3. Test Requirements
Add a **Testing** section with:
- **Automated tests**: Unit and integration tests needed, with suggested test cases
- **Manual testing scenario**: Step-by-step instructions for a basic smoke test the developer can run immediately after implementation. Add a reminder for the agent to provide these to the user after implementation is complete.

### 4. Documentation Updates
Add a **Documentation** section listing:
- Files that need updating (README, API docs, inline comments, etc.)
- New documentation that should be created
- Changelog entry if applicable

### 5. Dependencies & Setup
Add a **Prerequisites** section noting:
- New packages or version requirements
- Environment variables or config changes
- Database migrations or schema changes
- External service requirements

### 6. Breaking Changes & Migration
Flag any:
- API changes affecting existing consumers
- Data format changes requiring migration
- Backwards compatibility concerns
- Deprecations

### 7. Security Checklist
Review for:
- Authentication/authorization requirements
- Input validation and sanitization
- Data exposure or privacy risks
- Secrets handling

### 8. Performance Considerations
Note any concerns about:
- Latency impact
- Memory usage
- Scalability at volume
- Database query efficiency

### 9. Implementation Order
If the plan has multiple parts, sequence steps logically, identify dependencies between tasks and note parallelizable work if there are opportunities for work to occur in parallel using multiple sub-agents.

Allow up to three agents in parallel. For example, provide a list of project phases and the agent number they should be assigned to. Err on the side of NOT using parallel workers if it would likely be problematic. An example might be one agent writing frontend+e2e tests, one writing backend+unit tests and one writing documentation.

### 10. Code Review Focus Areas
Suggest what reviewers should scrutinize most carefully. E.g. if there is a critical feature that is a risk for authentication bypass or user input injection note the areas and the applicable CWEs.

### 11. Tech Debt Notes
Document any:
- Conscious shortcuts or compromises
- Future improvements flagged for later
- Known limitations of the current approach

---

## Output Format

You should not output the entire plan as a message but rather I will want you to write the final plan to the file `SPECS-*.md` where `*` is a good short name for the feature. E.g.: `SPECS-Integrate-QStash-and-refactor-webhooks.md`. If you're in plan mode, tell me when you're done and instruct me to change to Build mode to write the plan. If you're in build mode, just write the files and await further instructions.

- Present the enhanced plan with these sections integrated naturally.
- Use the same formatting style as the original plan.
- Omit sections that genuinely don't apply, but err on the side of inclusion.
- Mark skipped sections as N/A or Skipped.
- If the plan already includes a similar or identical section, then either add to it as appropriate or leave it be. 


DEBUG MODE: If the user notes mention __DEBUG_MODE__, then first write the current plan to disk as `PLANS_DRAFT_*.md` so the user can compare the plans from before this command was used and the final specs after.

