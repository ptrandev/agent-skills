---
name: delegate
description: >
  Tells the agent to hand work to subagents and stay the orchestrator. Use for "delegate",
  "use subagents", or "save your context".
---

# delegate

Use subagents to work in parallel and to keep your own context small.
You stay the orchestrator: you make every decision and verify every subagent result.

Before delegating recording, read the canonical [recording.md](../../global/recording.md):

1. Resolve this skill's real directory, because an installed skill directory is a link. Run
   `realpath "<base directory>"` in Bash. It follows every link, also a link on a parent directory.
   Without Bash, use PowerShell 7:
   `(Get-Item -LiteralPath '<base directory>').ResolveLinkTarget($true).FullName`.
   Keep the base directory when that returns nothing.
2. Read `../../global/recording.md` relative to that real directory.
3. If that file does not exist, stop and report the resolved path. **Do not search for another copy.**

Pass that file's resolved absolute path and its machine scope to every recording agent,
including Claude.
