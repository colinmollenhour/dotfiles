---
name: cli-design
description: 'Design, implement, or review CLI UX: args, flags, help, output, errors, config, interactivity, and distribution.'
---

# CLI Design

Use this skill when designing, implementing, or reviewing command-line interfaces. Distilled from Command Line Interface Guidelines: https://clig.dev/

## Core Shape

Good CLI = human-first text UI + scriptable system part.

- Humans first when humans are primary users
- Machines still matter: stable streams, exit codes, non-interactive behavior
- Small parts compose: stdin, stdout, stderr, pipes, JSON, plain text, signals
- Convention wins unless convention hurts usability
- Output says enough: silence can feel broken; noise hides truth
- CLI use is conversation: run, fail, adjust, inspect, continue
- Robust tools feel robust: responsive, clear, safe, recoverable
- Break rules only with clear purpose and user benefit

## Agent Workflow

Before changing CLI behavior:

1. Identify primary users: interactive humans, scripts, CI, other tools, or mixed.
2. Identify primary workflows: common commands, state changes, destructive operations, inspection commands.
3. Preserve existing public behavior unless user asks for breaking change or behavior is clearly broken.
4. Prefer mature parser and small conventional surface over custom clever interface.
5. Review final design against checklist near end.

Ask one short question when destructive behavior, compatibility, or public API expectations are unclear.

## Non-Negotiables

- Use mature argument parser when possible.
- Return `0` on success, non-zero on failure.
- Primary command output goes to `stdout`.
- Errors, warnings, progress, logs, prompts, and status go to `stderr`.
- Machine-readable output goes to `stdout`.
- `-h` and `--help` always mean help; never overload `-h`.
- `--version` prints version and exits.
- Prompt only when `stdin` is TTY.
- Never require prompt; every input must be passable by flag, arg, file, or stdin.
- Non-interactive mode must fail clearly, not hang.
- Dangerous operations need confirmation or explicit force/confirm flags.
- Do not accept secrets directly via flags. Avoid secrets in env vars.

## Help

Help is interface, not appendix.

- `cmd --help` and `cmd -h` show full help.
- If missing required args, show concise help unless command is interactive by default.
- For subcommands, support `cmd help`, `cmd help subcmd`, `cmd subcmd --help`, `cmd subcmd -h`.
- If help flag appears anywhere, show help and ignore other args.
- Lead with examples; users copy examples first.
- Put common flags/subcommands before rare ones.
- Include short description, usage, examples, options, commands, docs URL, support/issues URL.
- Use scan-friendly headings: `USAGE`, `EXAMPLES`, `OPTIONS`, `COMMANDS`.
- Keep default help concise; move exhaustive examples to docs, cheat sheet, or `examples` command.
- If command expects piped input and `stdin` is TTY, show help or clear message, then exit.

Good concise help shape:

```text
mycmd does thing.

Usage:
  mycmd [options] <input>

Examples:
  mycmd --json data.txt
  other | mycmd -

Run `mycmd --help` for all options.
```

## Documentation

- Provide searchable web docs.
- Provide terminal-accessible docs tied to installed version.
- Consider man pages, but do not rely only on `man`.
- If man pages exist, expose through `cmd help topic`.
- Link help output to exact web page/anchor when useful.

## Output

Default output should be human-readable, brief, and useful.

- Show output on success when silence would look broken or state changed.
- Keep success output short; add `-q`/`--quiet` for less output.
- If command changes state, say what changed.
- Make current state inspectable with `status`, `list`, `show`, or equivalent.
- Suggest next commands when workflow continues.
- Do not print developer-only diagnostics by default; reserve for `--debug` or `--verbose`.
- Do not treat `stderr` as logfile; avoid `INFO/WARN/ERR` clutter unless verbose/debug.
- Put important final result where user sees it, often near end.

Machine output:

- Provide `--json` for structured output.
- Keep JSON stable; scripts depend on it.
- Provide `--plain` when rich human formatting breaks `grep`, `awk`, or line-oriented use.
- Encourage scripts to use `--json` or `--plain`, not rich human output.
- Human output may evolve; machine output needs compatibility care.

Streams:

- Data intended for pipe: `stdout`.
- Progress/status/errors/prompts: `stderr`.
- If `stdout` piped but `stderr` is TTY, progress on `stderr` is okay.

## Color, Symbols, Pager

- Use color sparingly and intentionally.
- Red means error or danger; do not make everything loud.
- Disable color when output stream is not TTY.
- Disable color when `NO_COLOR` is set and non-empty.
- Disable color when `TERM=dumb`.
- Support `--no-color` when color exists.
- Optionally support app-specific `MYAPP_NO_COLOR`.
- Respect `FORCE_COLOR` only if safe and expected.
- No spinners/progress animations when output stream is not TTY.
- Symbols/emoji can clarify structure; overuse makes tool feel toy-like and hurts accessibility.
- Use pager for large text only when interactive.
- Good `less` options: `less -FIRX`.

## Errors

Errors are docs at moment of need.

- Catch expected errors and rewrite for humans.
- Say what failed, why if known, and how to fix.
- Keep signal high; group repeated errors under one explanation.
- Avoid stack traces for expected errors.
- For unexpected errors: give debug log path or traceback option plus bug-report instructions.
- Make bug reports easy; prefill URL when feasible.
- If user input looks mistyped, suggest likely command.
- Do not auto-run corrected command when it may change state.
- If you accept misspelled/alternate syntax automatically, it becomes supported interface.

Good error shape:

```text
Cannot write `file.txt`: permission denied.

Fix: make file writable with `chmod +w file.txt`, or choose another output path with `--output`.
```

Bad error shape:

```text
Traceback (most recent call last): ...
EACCES
```

## Arguments And Flags

Flags are clearer and more future-proof; args are shorter.

- Prefer flags for multiple distinct inputs.
- Positional args are fine for repeated simple objects: `rm file1 file2`.
- Two different positional meanings are smell; exception for famous/simple forms like `cp <source> <dest>`.
- Provide full long flag for every option.
- Short flags only for common options.
- Make defaults right for most users.
- Make args, flags, and subcommands order-independent when parser allows.
- Support `-` as stdin/stdout filename when command reads/writes files.
- For optional flag values, use explicit sentinel like `none`; avoid blank ambiguity.
- Do not add arbitrary abbreviations; explicit aliases are okay if stable.

Common flag meanings:

| Flag | Meaning |
| --- | --- |
| `-a`, `--all` | all |
| `-d`, `--debug` | debug output |
| `-f`, `--force` | skip confirmation / force action |
| `--json` | JSON output |
| `-h`, `--help` | help only |
| `-n`, `--dry-run` | show changes, do not apply |
| `--no-input` | disable prompts/interactivity |
| `-o`, `--output` | output file/path |
| `-p`, `--port` | port |
| `-q`, `--quiet` | less output |
| `-u`, `--user` | user |
| `--version` | version |
| `-v` | avoid if ambiguous: verbose vs version |

## Interactivity

- Prompt only when `stdin` is TTY.
- If `--no-input`, do not prompt or open editors.
- In non-interactive mode, fail with exact flag/arg needed.
- Prompt for missing input only when interactive and safe.
- Password prompts must disable echo.
- Make escape route clear.
- Ctrl-C must work unless wrapping another program; if special escape exists, print it.
- Do not make users learn by hanging.

## Dangerous Operations

Danger level decides confirmation strength.

- Mild: local small change. Maybe confirm if surprising.
- Moderate: big local change, remote change, bulk mutation, hard-to-undo action. Usually confirm; offer `--dry-run`.
- Severe: delete complex remote/system resource. Require typed resource name or `--confirm=<name>`.
- For scripts, use `--force` or `--confirm=<name>` rather than prompt.
- Show what will change before confirmation.
- Consider hidden danger: changing one number might delete many resources.

## Secrets

- Do not accept `--password value`, `--token value`, or other secret flag values.
- Flags leak through process lists and shell history.
- Env vars can leak through logs, debuggers, child processes, and other users.
- Prefer `--password-file`, `--token-file`, stdin, credential helpers, keychains, secret managers, or sockets.
- If accepting stdin secret, document safe usage clearly.

## Subcommands

Use subcommands when tool has multiple workflows or object types.

- Keep terminology, flag names, output style, and error style consistent across subcommands.
- Prefer clear object/action structure; `noun verb` often scales well: `container create`, `user delete`.
- `verb noun` can be okay if simpler and conventional for domain.
- Group help by workflow, not alphabet only, when many commands exist.
- Avoid ambiguous pairs like `update`/`upgrade` unless distinction is obvious and documented.
- Avoid catch-all subcommands; they block future names.
- Avoid arbitrary abbreviation. Stable aliases are okay.
- Each subcommand needs its own help.

## Robustness

- Validate input early before expensive or destructive work.
- For long work, print first feedback fast, roughly within 100ms.
- Show progress for long operations when interactive.
- Keep parallel output readable; avoid interleaved log soup.
- If progress UI hides logs, print relevant logs on failure.
- Use network timeouts.
- Make retries recoverable: up-arrow + enter should often continue or safely retry.
- Prefer idempotent operations.
- Consider concurrent runs, CI, non-TTY, flaky network, weird filesystems, partial failure.
- Keep implementation simple; special-case piles feel fragile.

## Signals

- On Ctrl-C, acknowledge immediately, then clean up.
- Cleanup should have timeout.
- If second Ctrl-C forces exit or skips cleanup, say so.
- Restore terminal state before exit.

Good interrupt text:

```text
^CGracefully stopping... press Ctrl-C again to force
```

## Configuration

Use right mechanism for stability and scope.

- Per-invocation behavior: flags.
- Per-context behavior: env vars or config.
- Per-project behavior: version-controlled config file.
- Complex stable settings: config file.

Precedence, highest first:

1. Flags
2. Environment variables
3. Project config
4. User config
5. System config

Config file rules:

- Follow XDG Base Directory spec where possible.
- Ask before modifying external/system/shared config.
- Prefer dedicated config files over appending to shared shell files.
- If modifying shared config, mark block clearly with dated comments.
- Do not use `.env` as substitute for structured config.

## Environment Variables

Env vars are for behavior that varies by execution context.

- Names: uppercase letters, numbers, underscores; do not start with number.
- Prefer single-line values.
- Do not commandeer standard names for app-specific meaning.
- Respect common vars where relevant: `NO_COLOR`, `FORCE_COLOR`, `DEBUG`, `EDITOR`, `PAGER`, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `SHELL`, `TERM`, `TERMINFO`, `TERMCAP`, `TMPDIR`, `HOME`, `LINES`, `COLUMNS`.
- Read `.env` only when appropriate for project env settings.
- Do not treat env vars as safe secret storage.

## Naming

- Command names should be simple, memorable, lowercase, short, easy to type.
- Avoid cryptic names and overly generic names.
- Use dashes only when needed.
- Avoid collisions with existing commands on common platforms.
- Test spoken and typed ergonomics.
- Bad: `DownloadURL`, `convert` if colliding with system command.
- Good: short domain-specific name that users can remember and type fast.

## Distribution

- Prefer single binary when feasible.
- Otherwise use native package managers and standard install paths.
- Tread lightly on user machine.
- Make uninstall easy.
- Put uninstall instructions near install instructions.
- Avoid install steps that mutate shell config without consent.

## Analytics

- Do not phone home usage or crash data without consent.
- Prefer opt-in.
- If opt-out, disclose clearly and make disabling easy.
- Explain what is collected, why, retention, and anonymization.
- Consider lower-trust-cost alternatives: docs analytics, download counts, issue prompts, user interviews.

## Future-Proofing

- Additive changes are safest.
- Changing existing semantics breaks scripts and muscle memory.
- Deprecate with warnings before removing behavior.
- Human output can change more freely than machine output.
- Avoid catch-all syntax that prevents future subcommands or flags.
- Avoid interface depending on external internet content that may disappear.
- Once users script against behavior, it is API.

## Review Checklist

When reviewing or designing CLI, verify:

- Parser handles conventional args/flags/help.
- `stdout`/`stderr` separation is correct.
- Exit codes are meaningful.
- Help has examples, common options, docs/support links.
- Works in non-interactive mode.
- Prompts gated on TTY and disabled by `--no-input`.
- Dangerous operations confirm, dry-run, or require explicit force/confirm.
- Secrets stay out of flags/env vars.
- Default output is human-readable and brief.
- Machine output has `--json` or `--plain` where needed.
- Success and state changes are visible enough.
- Errors are actionable and low-noise.
- Color/progress/pager respect TTY and env vars.
- Subcommands are consistent and future-proof.
- Config precedence is documented.
- Common env vars are respected.
- Ctrl-C behavior is safe and clear.
- Naming is short, lowercase, memorable, non-conflicting.
- Install/uninstall are clean.
- Analytics are absent or consent-based.

## Tradeoffs To Preserve

- Humans like readable defaults; scripts need stable formats.
- Silence is script-friendly but can make humans think tool froze.
- Flags cost keystrokes but reduce ambiguity and future breakage.
- Prompts help discovery but break automation unless gated.
- Auto-correction helps typos but can hide mistakes and create support burden.
- Color/emoji can clarify but hurt accessibility and seriousness if overused.
- Parallelism speeds work but complicates progress output.
- Convention is powerful; break it only when it demonstrably harms users.
