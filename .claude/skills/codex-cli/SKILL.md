---
name: codex-cli
description: Run OpenAI Codex CLI headlessly for one-shot tasks, code reviews, and native raster image generation or editing. Use when the user mentions Codex, asks to shell out to GPT through Codex, requests `codex exec` or `codex review`, or wants Codex to create a PNG/JPEG, infographic, thumbnail, mockup, or image variant.
---

# Codex CLI

Use `codex` for headless OpenAI agent runs, reviews, and raster image generation. Prefer the dedicated CLI flags over generic `-c` configuration overrides when both exist.

## Preflight

```bash
codex --version
```

If authentication fails, ask the user to run `codex login`.

## One-Shot Tasks

```bash
codex exec --ephemeral "Your prompt here" </dev/null
```

Always close stdin with `</dev/null` when the prompt is supplied as an argument. In a headless process, open stdin can leave Codex waiting at `Reading additional input from stdin...`.

For a long prompt file, use stdin instead of an argument and do not also redirect from `/dev/null`:

```bash
codex exec --ephemeral - < .tmp/codex-task.md
```

Useful flags:

- `--ephemeral`: do not persist the one-shot session.
- `-m, --model <MODEL>`: select the exact model when the user requests one.
- `-C, --cd <DIR>`: set the working root.
- `--skip-git-repo-check`: allow a non-git working directory.
- `-s, --sandbox workspace-write`: permit writes within the workspace.
- `-i, --image <FILE>`: attach one or more input images.
- `-o, --output-last-message <FILE>`: save the final assistant message.
- `--json`: emit JSONL events when machine-readable execution details are needed.
- `-c model_reasoning_effort="high"`: set reasoning effort when requested; this has no dedicated flag.

Use `-m <MODEL>`, not `-c model="<MODEL>"`, for ordinary model selection.

`-o` writes only the final assistant text. It does not capture generated artifacts and is not an image output flag.

## Code Review

Choose the review scope explicitly:

```bash
codex review --uncommitted </dev/null
codex review --base <BRANCH> </dev/null
codex review --commit <SHA> </dev/null
```

`--base` is not universally required. Use exactly one scope matching the request: uncommitted changes, a branch comparison, or a commit.

`codex review` does not support `--ephemeral`. It writes session state under `~/.codex/`; when the host sandbox blocks that path, run it with the host sandbox disabled or with appropriate filesystem permission.

## Native Image Generation

Use this workflow when the requested deliverable is a genuine PNG/JPEG rather than SVG, HTML, Mermaid, Canvas, Graphviz, or drawing code.

First verify the installed Codex exposes image generation:

```bash
codex features list
```

Continue only when `image_generation` is available. If it is missing, report the limitation rather than silently creating a programmatic substitute.

### Generate An Image

1. Create a concise project-local brief such as `.tmp/codex-image/task.md`.
2. Choose an absolute output path inside the writable workspace.
3. Run Codex with `image_generation` enabled.
4. Verify and visually inspect the artifact.
5. Make one targeted regeneration or edit if the first image has obvious defects.

Canonical GPT-5.6 Sol invocation:

```bash
codex exec \
  --ephemeral \
  --skip-git-repo-check \
  --enable image_generation \
  --sandbox workspace-write \
  -C "/absolute/path/to/project" \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  -o ".tmp/codex-image/codex-last-message.txt" \
  "Read .tmp/codex-image/task.md and follow it exactly. Use the built-in image-generation tool. Save or copy the final raster image to /absolute/path/to/project/.tmp/codex-image/result.png. Do not substitute SVG, HTML, Mermaid, Canvas, Graphviz, or drawing code. Inspect the result and iterate once if it has obvious defects." \
  </dev/null
```

Use the exact model requested by the user. Use `gpt-5.6-sol` only when the user requests it or the calling workflow deliberately selects it; otherwise preserve the configured default. Do not invent model IDs.

Codex's selected language model orchestrates the request and invokes a separate built-in OpenAI image generator. Describe the result as generated through Codex's built-in image generator, not as pixels directly emitted by the orchestrating GPT model.

### Image Brief Shape

Keep content requirements separate from execution instructions:

```markdown
# Image Task

Use case: infographic-diagram
Asset type: 16:10 landscape technical infographic
Primary request: <what the image must communicate>
Composition: <layout and hierarchy>
Style: <visual language>
Color palette: <palette>
Text: <exact required copy>
Must include: <required concepts and relationships>
Avoid: illegible small text, malformed lettering, clutter, crossed connectors, watermarks

Create a genuine raster image with the built-in image-generation tool.
Do not create a programmatic substitute.
```

For dense infographics, prioritize readable exact text and simplify secondary copy. Image generators often corrupt small labels and equations even when the overall composition is strong.

### Edit An Existing Image

```bash
codex exec \
  --ephemeral \
  --skip-git-repo-check \
  --enable image_generation \
  --sandbox workspace-write \
  -C "/absolute/path/to/project" \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  -i "/absolute/path/to/project/input.png" \
  "Use the attached image as the edit target. Change only <REQUESTED_CHANGE>. Preserve <INVARIANTS>. Use the built-in image-generation tool and save the final result to /absolute/path/to/project/output.png." \
  </dev/null
```

Do not overwrite the source unless the user explicitly requests replacement.

### Validate Image Artifacts

Success requires all of the following:

- `codex exec` exits successfully.
- The requested output exists and is non-empty.
- The file is a real raster image rather than markup with an image extension.
- The host can open the image.
- Visual inspection confirms the main requirements, text quality, composition, and aspect ratio.

Do not treat Codex's final message as proof the artifact exists. Verify the exact path independently.

If metadata utilities are unavailable, use the host's image reader. For a PNG, `xxd -l 24 <PATH>` shows the PNG signature (`89504e470d0a1a0a`) and IHDR width/height bytes.

If no artifact appears, inspect the final Codex message and retry once with a shorter prompt that repeats the absolute destination. Do not switch to an API script, API-key fallback, or non-raster substitute without explicit approval.

## Caveats

- Never combine prompt stdin (`codex exec ... - < task.md`) with `</dev/null`.
- `codex exec --ephemeral` is generally appropriate for short isolated tasks.
- Use a project-local prompt file for large contexts rather than a huge shell argument.
- Keep output paths inside the workspace when using `--sandbox workspace-write`.
- Verify generated files independently instead of trusting a success message.
