---
name: claude-cli
user-invocable: false
description: 'Shell out to claude CLI.'
allowed-tools: Bash(claude *)
---

# Claude CLI

From Claude Code, prefer the native Agent tool for delegated work. From another host, or for an explicitly headless run, use print mode.

```bash
claude -p --model opus -- "Review the changes" </dev/null
```

Choose the requested model or omit `--model` for the configured default. Add `--name` to label a batch session and `--effort` when requested. See `claude --help` for supported values.

Pass task data such as a diff on stdin. For trusted shared instructions in a file, use the file-specific flag.

```bash
claude -p --append-system-prompt-file .tmp/review-instructions.md \
  -- "Review this diff" < changes.diff > review.txt
```

Use `--output-format json` for structured results. Keep stderr separate when parsing stdout. Print mode uses the session's available tools and permissions.
