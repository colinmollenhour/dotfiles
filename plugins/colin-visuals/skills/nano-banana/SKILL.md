---
name: nano-banana
description: 'For agents other than agy: generate or edit images by shelling out to the agy (Antigravity) CLI: thumbnails, icons, diagrams, illustrations, photos. Not for use inside agy itself; agy uses its native image-generator subagent.'
allowed-tools: Bash(agy:*), Bash(file:*), Bash(ls:*), Bash(mkdir:*)
---

# Nano Banana Image Generation

This skill lets agents that are **not** agy (Claude Code, Codex, OpenCode, Grok, Pi) generate and edit images by running `agy` (the Antigravity CLI) in print mode. agy has a built-in `image-generator` subagent whose `generate_image` tool produces the image; the agy text model only relays the request.

## If You Are agy (Antigravity)

Do not use this skill, and do not run the `agy` command. You already have native image generation: call `invoke_subagent` with the `image-generator` subagent (or `generate_image` directly when it is in your tool list), then save or copy the result to the path the user asked for. The prompt tips, aspect ratios and checks below still apply.

## When to Use This Skill

When you are not agy, ALWAYS use this skill when the user:
- Asks for any image, graphic, illustration, or visual
- Wants a thumbnail, featured image, or banner
- Requests icons, diagrams, or patterns
- Asks to edit, modify, combine, or restore a photo
- Uses words like: generate, create, make, draw, design, visualize

Do NOT attempt to generate images through any other method (no SVG/canvas code as a substitute).

## Running agy

```bash
OUT="$PWD/nanobanana-output"; mkdir -p "$OUT"
agy --model gemini-3.8-flash-medium --add-dir "$OUT" --dangerously-skip-permissions --print \
  "Use your native image generation tool to generate <description>, <aspect ratio>. Save it as $OUT/<name>.png. State which tool produced it. If you have no image generation tool, say so plainly and do not fake it with code or SVG."
```

- Always give an **absolute** output path and `--add-dir` its directory.
- Pass `--dangerously-skip-permissions`. The generator saves a JPEG under `~/.gemini/antigravity-cli/brain/`, and agy then runs a shell command to convert or copy it to your path. If the user's agy `toolPermission` is `request-review`, print mode auto-denies that command: agy exits 0 with an empty reply and writes no file. Keep the prompt limited to the image task.
- `agy` writes its config, logs and artifacts under `~/.gemini/antigravity-cli/`. Inside a read-only-home sandbox it fails with `read-only file system` and `You are not logged into Antigravity`. Run it where that directory is writable (outside the harness sandbox, with the user's approval if the harness asks).
- Calls are slow (a generation is a subagent round trip). Use a generous timeout, several minutes.

## Model Selection

`--model` only picks the agy text model that relays the request. The image model is fixed by the `generate_image` tool and cannot be chosen, so output quality does not depend on `--model`. In side-by-side tests, `gemini-3.8-flash-medium` and `gemini-4-argon-medium` produced images of the same quality and followed the same instructions. Use `gemini-3.8-flash-medium` as the default. Run `agy models` to list others.

agy's text model may call the backend "Imagen 3"; do not repeat that. The tool reports no model on success. Its errors name the image model (`gemini-3.1-flash-image` as of 2026-11-25).

## Tool Parameters (what you can control)

| Parameter | Notes |
|-----------|-------|
| Prompt | What to depict, or how to edit the given images |
| AspectRatio | `1:1` (default), `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9` |
| ImagePaths | Up to 3 absolute paths to edit, combine, or use as references |

There is no pixel-size, count, or style parameter. Resolution follows the aspect ratio: 1024×1024 for `1:1`, 1376×768 for `16:9`.

## Common Sizes

Ask for the closest aspect ratio, then resize or crop afterwards (ImageMagick `magick`) if exact pixels matter.

| Use Case | Target | Ask for |
|----------|--------|---------|
| YouTube thumbnail | 1280x720 | `16:9` |
| Blog featured image | 1200x630 | `16:9`, crop to fit |
| Square social | 1080x1080 | `1:1` |
| Twitter/X header | 1500x500 | `16:9`, crop to fit |
| Vertical story | 1080x1920 | `9:16` |

## Editing and Restoring

Name the source file(s) in the prompt and say what must stay unchanged:

```bash
agy --model gemini-3.8-flash-medium --add-dir "$OUT" --dangerously-skip-permissions --print \
  "Use your native image generation tool to EDIT the existing image $OUT/banana.png: add a red baseball cap, keep everything else the same. Save the result as $OUT/banana-cap.png."
```

Save edits under a new filename so the original survives. Edits keep the subject and background well, but small details can vary, so check the result.

## Icons, Diagrams, Patterns

There are no dedicated commands. Put the intent in the prompt:
- **Icon**: "minimalist app icon, rounded corners, flat, centered, plain background, no text" with `1:1`.
- **Diagram**: "clean flowchart of ..., labeled boxes, modern style". Generated text is unreliable; for diagrams that must be exact, use the `tldraw-skill` skill instead.
- **Seamless pattern**: "seamless tileable pattern of ..."; check the tiling by eye.

## Variations

One call produces one image. For options, run `agy` once per variation with a distinct output name (`name-1.png`, `name-2.png`) and a changed prompt.

## Presenting Results

After each call:
1. `ls "$OUT"` and confirm the expected file exists. If it does not, agy's reply may still say it succeeded; the file wins.
2. Run `file <path>` and check that the real type matches the extension. agy converts from the JPEG artifact it keeps under `~/.gemini/antigravity-cli/brain/`; rename if they differ.
3. View the image before presenting it, and check it matches the request (text, count of objects, composition).
4. Give the user the path and offer variations.

## Prompt Tips

1. **Be specific**: style, mood, colors, composition, background.
2. **Say "no text"** unless you want text rendered.
3. **Reference styles**: "editorial photography", "flat illustration", "3D render", "watercolor".
4. **State the background**: if you ask for a plain light background, the model may still tint it, so say the color.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `You are not logged into Antigravity` | Run outside the read-only sandbox first; if it persists, the user must log in with `agy` interactively |
| `read-only file system` for `~/.gemini` | Same: agy needs a writable home config dir |
| agy says it has no image tool | Update agy (`agy update`); do not substitute code or SVG |
| Empty reply, no file, stderr says a tool was auto-denied | `--dangerously-skip-permissions` is missing (see Running agy) |
| File missing or wrong type | Check the reply for the artifact path under `~/.gemini/antigravity-cli/brain/` and convert it |
| Image refused or empty | Simplify the prompt and remove anything that could trip content policy |
| `HTTP 503` / `No capacity available for model gemini-3.1-flash-image` | Backend capacity, not your prompt or flags. agy still exits 0 with `status: SUCCESS`, so check for the file. Retry after a few minutes; if it persists, tell the user and offer the `codex-cli` image route |
