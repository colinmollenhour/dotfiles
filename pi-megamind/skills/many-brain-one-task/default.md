Use native participants from the current host by default.

When the host is OMP:

- Launch three OMP-native participants in one `task` batch as `omp-primary`, `omp-secondary`, and `omp-tertiary`.
- Give them distinct roles appropriate to the task. Use the task agent types advertised by the current OMP session.
- Keep Megamind in the current visible `Main` session; children only return bounded opinions or work products.
- Omit the `model` field unless the user or profile pins an OMP model id or model role.

When the host is Pi:

- Use Pi with the current/default model as `pi-primary`, `pi-secondary`, and `pi-tertiary`.
- Prefer Pi child agents through `pi-fast-subagent` when its `subagent` tool is available.
- Otherwise run each participant with `pi --print < .tmp/<run-id>/<participant>.md` and save stdout under `.tmp/<run-id>/results/`.

If the user names explicit agents, models, or harnesses, honor those instead of these defaults.
