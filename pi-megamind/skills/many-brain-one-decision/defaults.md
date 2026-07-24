Use native debaters from the current host by default.

Default personalities:

- pragmatic-operator
- keep-it-simple-stupid
- user-advocate
- paranoid-security

When the host is OMP:

- Launch four OMP-native debaters in one `task` batch per round.
- Keep Megamind in the current visible `Main` session as moderator.
- Use the task agent types advertised by the current OMP session.
- Omit the `model` field unless the user or profile pins an OMP model id or model role.

When the host is Pi:

- Use Pi with the current/default model for all four personalities.
- Prefer Pi child agents through `pi-fast-subagent` when its `subagent` tool is available.
- Otherwise run each debater with `pi --print < .tmp/many-brain-one-decision/<slug>/round-N/<debater>.md` and save stdout under that round's `results/` directory.

If a profile line names a personality with `as "personality-name"`, use that personality for the listed model. Explicit agents, models, or harnesses override these defaults.
