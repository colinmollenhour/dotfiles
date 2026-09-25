---
name: whiteboard
description: Sketch explanations on a live-reloading HTML whiteboard the user watches in their browser while you edit. Use when the user asks for a whiteboard, asks you to "draw", "sketch", "diagram", or "walk me through" a design, change, architecture, flow, schema, or plan visually, or when a running explanation of 3+ interacting parts would read better as a page than as terminal text. Not for polished published pages (use Artifacts) or static image exports (use tldraw-skill / pretty-mermaid).
allowed-tools: Bash(whiteboard *), Bash(*/whiteboard/scripts/whiteboard *)
---

# Whiteboard

A board is one plain HTML file. A tiny zero-dependency Node server serves the boards and injects
a live-reload client, so every time you save a board, the user's open tab reloads at the same
scroll position. You draw by editing the file.

## CLI

The script is `scripts/whiteboard` in this skill's directory. When it is not on `PATH`, call it by full path:

```bash
WB=$(command -v whiteboard || echo "$HOME/.claude/skills/whiteboard/scripts/whiteboard")
[ -x "$WB" ] || WB="$HOME/.agents/skills/whiteboard/scripts/whiteboard"
```

| Command | Does |
|---|---|
| `whiteboard start` | Starts the background server. Safe to repeat: when a server is already running it just prints the URL. |
| `whiteboard new <project>/<topic>` | Creates `~/.whiteboard/<project>/<topic>.html` from the template and prints its path and URL. |
| `whiteboard url [<name>]` | Prints the URL of a board, or of the index page. |
| `whiteboard errors [--clear]` | Prints the JS and Mermaid errors reported by browsers that have a board open. |
| `whiteboard publish <name>` | Bundles the board into one self-contained HTML file and uploads it with `snip-upload`. Prints the public URL. |
| `whiteboard status` / `stop` | Show the server and its connected viewers, or stop it. |

Defaults: boards live in `$WHITEBOARD_DIR` (`~/.whiteboard`), port `$WHITEBOARD_PORT` (4477). The server
binds to `$WHITEBOARD_HOST`. When that is unset it uses the machine's Tailscale address (100.64.0.0/10), then
`127.0.0.1`. Pass `--host 0.0.0.0` (or `all`) to listen on every adapter, including LAN and localhost,
and `start` then prints a URL for each one. The user bookmarks one index URL, and it lists every board,
newest first. To move a running server to another host or port, run `whiteboard stop` first; `start`
refuses to start a second server on the same directory.

**Worktree-scoped boards.** The server exits on its own within a couple of seconds after its board directory
is deleted or replaced. For work in a git worktree, keep the boards in the worktree so that removing the
worktree also stops the server: pass `--dir "$(git rev-parse --show-toplevel)/.whiteboard"` to every
`whiteboard` command (shell env doesn't persist between calls), and add `.whiteboard/` to
`$(git rev-parse --git-common-dir)/info/exclude` so it stays out of `git status`. Each directory gets its
own server. Without an explicit port, a busy one moves to the next free port starting at 4477, so read the
URL `start` prints instead of assuming 4477.

`whiteboard status` lists the connected viewers (page and remote address). Use it to confirm the user
actually has the board open, for example that a Tailscale address shows up.

**Sandboxed shells:** a server started in a network-isolated sandbox cannot be reached from outside it,
and it cannot see the Tailscale interface. Run `whiteboard start` outside the sandbox, or check that the
printed URL uses the host the user connects to. Editing board files needs no special access.

## Workflow

1. `whiteboard start`, then `whiteboard new <project>/<topic>`. Use the repo or task name as `<project>`
   and a kebab-case topic.
2. Give the user the board URL once, as a clickable link. After that, don't repeat it.
3. Build the board in passes. The user watches it fill in, so save a useful skeleton first (title, one-line
   subtitle, section headings), then fill each section. Use the Edit tool for changes to an existing board;
   don't rewrite the whole file, because the user may be reading one part while you change another.
4. After adding or changing Mermaid or scripts, run `whiteboard errors` if a browser has the board open.
   Fix anything it reports, then run `whiteboard errors --clear`.
5. Keep talking in the terminal as usual. The board holds the picture, and the terminal holds the
   conversation. When you change the board, say what changed in one line ("added the retry path to the
   sequence diagram").
6. When the user asks to change the board, edit the same file. Start a new board only for a new topic.

## Publishing

`whiteboard publish <project>/<topic>` shares a board with someone who can't reach the live server.
`snip-upload` stores one file per URL, so `publish` builds a single self-contained file:

- Local stylesheets (including `@import` and `url()`), scripts, images, SVGs, and fonts are inlined, with
  binaries as data URIs. The live-reload client is left out.
- Remote URLs stay as they are. Mermaid and highlight.js load from their CDNs when the page is viewed.
- The upload keeps `snip-upload`'s random suffix, so the URL can't be guessed. The bucket deletes files
  after 90 days. `--no-random` gives a predictable URL, and `--out FILE` writes the bundle without uploading.
- It prints what it inlined on stderr. Read the `WARNING not bundled` line: missing files and links to
  other local boards won't work in the published copy. Publish those boards separately, or remove the links.
- It can't see paths a script builds at runtime (`fetch('data.json')`). Put that data inline in the
  board if it will be published.

Uploading needs network access and the `snip-upload` credentials, so run `publish` outside the sandbox.
Publishing makes the board public, so only publish when the user asks, and give them the URL as a link.

## Writing a board

Start from the template. It links `/_wb/board.css` (the whiteboard look: dotted background, light and dark
themes, a mobile layout) and `/_wb/board.js` (loads Mermaid and highlight.js only when the page uses them).
Board-specific CSS goes in the template's `<style>` block. You can use any HTML, inline SVG, or script.
Relative links to other files under `~/.whiteboard` work, and saving those files reloads the board too.

Available building blocks:

| Class | Markup | Use for |
|---|---|---|
| `wb-page` | `<main class="wb-page">` (add `wide` for full width) | Page container. |
| `subtitle` | `<p class="subtitle">` under the `h1` | One-line summary of the board. |
| `card` | `<div class="card"><h3>…</h3>…</div>`, `card focus` to highlight | Components, modules, options. |
| `grid` / `cols` / `row` | wrapping card grid / 2–3 columns / inline flex row | Layout. |
| `flow` | `<div class="flow">` with cards inside | A left-to-right chain with arrows (stacks vertically on phones). |
| `sticky` | `<div class="sticky">`, plus `pink`, `blue`, `green`, or `orange` | Open questions, notes, asides. |
| `callout` | `<div class="callout">`, plus `warn`, `danger`, or `ok` | Risks, decisions, gotchas. |
| `tag` | `<span class="tag">`, plus `add`, `del`, or `muted` | new / removed / unchanged labels. |
| `steps` | `<ol class="steps">` | Ordered plans and timelines. |
| `diff` | `<pre class="diff">` with `<span class="add|del|hunk">` lines | Small, focused code changes. |
| `mermaid` | `<pre class="mermaid">sequenceDiagram …</pre>` | Sequence, flowchart, ER, state, and class diagrams. |
| code | `<pre><code class="language-ts">` | Highlighted snippets. |

What makes a good board:

- **Pick the right diagram.** Use a sequence diagram for runtime interactions, `erDiagram` for schemas,
  `flowchart` or `stateDiagram-v2` for branching logic and lifecycles, and `flow` cards for simple
  pipelines. Keep each diagram under about 12 nodes; split it rather than cram it.
- **Summarize code, don't paste it.** Show signatures, pseudocode, and the 3–10 lines that matter. A
  board is not a diff viewer.
- **Mark what changed.** Use `tag add`/`tag del` and `card focus` on the parts the discussion is about.
- **Park open questions on stickies** so they stay visible until they are resolved, then delete them.
- **Escape `<` and `&`** as `&lt;` and `&amp;` inside `<pre>` and `<code>`, Mermaid source included.
  `>` is safe, so arrows like `-->` and `->>` can be written as they are.
