Use Pi-backed debaters by default.

Default debaters:
- Pi with the current/default model as `pi-pragmatic-operator`.
- Pi with the current/default model as `pi-keep-it-simple-stupid`.
- Pi with the current/default model as `pi-user-advocate`.
- Pi with the current/default model as `pi-paranoid-security`.

Routing preference:
- If the `pi-fast-subagent` package is installed and the `subagent` tool is available, launch each debater as a Pi child agent with its assigned personality.
- Otherwise run each debater with `pi --print < .tmp/many-brain-one-decision/<slug>/round-N/<debater>.md` and save stdout under that round's `results/` directory.

Assign personalities dynamically based on the decision. If the user does not name personalities, start with:

- pragmatic-operator
- keep-it-simple-stupid
- user-advocate
- paranoid-security

If a profile line names a personality with `as "personality-name"`, use that personality for the listed model.
