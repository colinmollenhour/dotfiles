---
name: codex-cli
user-invocable: false
description: Run headless Codex tasks, code reviews, and native raster image generation or editing.
---

# Codex CLI

## Headless tasks

```bash
codex exec --ephemeral -o answer.txt "Summarize the changes" </dev/null
codex exec --ephemeral -o answer.txt - < task.md
```

Close stdin when passing only a prompt argument. Use `-` to read the full prompt from a file. Wait for exit before reading the output file. Piping a live run to `head` can terminate it early.

Use the configured model unless the caller selects one with `-m`. Set the working directory with `-C`. Use `--json` for event output or `-o` for the final message. Check `codex exec --help` for flags supported by the installed CLI.

## Reviews

Choose the scope that matches the request. The exec subcommand supports ephemeral review sessions.

```bash
codex exec review --ephemeral --uncommitted </dev/null
codex exec review --ephemeral --base main </dev/null
codex exec review --ephemeral --commit HEAD </dev/null
```

## Raster image generation and editing

Check `codex features list` for `image_generation`. Give the built-in image tool the composition, exact text, dimensions or aspect ratio, and an absolute writable destination. For edits, attach the source with `-i` and describe what to preserve.

```bash
codex exec --ephemeral --enable image_generation --sandbox workspace-write \
  "Use image generation to create a landscape illustration of a harbor. Save the PNG to $PWD/harbor.png." </dev/null
```

For a detailed brief, pass it on stdin. Verify that the requested file opens as a raster image and inspect the result, especially text and crop. The final message saved by `-o` contains text.
