Use Pi-backed participants by default.

Primary participants:
- Pi with the current/default model as `pi-primary`.
- Pi with the current/default model as `pi-secondary`.
- Pi with the current/default model as `pi-tertiary`.

Routing preference:
- If the `pi-fast-subagent` package is installed and the `subagent` tool is available, use Pi child agents through that tool.
- Otherwise run each participant with `pi --print < .tmp/<run-id>/<participant>.md` and save stdout under `.tmp/<run-id>/results/`.

If the user names explicit agents or models, honor those instead of these defaults.
