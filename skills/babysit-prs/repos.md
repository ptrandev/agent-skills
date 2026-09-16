# babysit-prs: the auto-resolve bar per repo

**Read [../shared/repos.md](../shared/repos.md) first.** It owns the repo set, the clone paths, and
the verify command for each. This file owns only the bar a fix must clear before you **resolve**
a thread, which is this skill's decision and nobody else's.

A resolved thread is invisible to the author, so the bar is what protects them.

| Repo | Auto-resolve bar |
|---|---|
| `Atllas-Inc/codebase` | Green typecheck, green lint, and the nearest test target. |
| `Atllas-Inc/aicc-queues` | A compile is the only evidence available in the cloud. Auto-resolve genuinely mechanical fixes only. Route anything whose correctness depends on runtime behavior to the Needs-you queue rather than resolving it on a compile alone. |
| `Atllas-Inc/neema-simple-hyzl` | Green root Deno tasks, plus the npm checks of every package the fix touched. A `web/` fix drops to triage-only when the npm registry is unreachable. |
| `Atllas-Inc/pointsgpt` | Green on the tests the fix touches, judged **against the base**, not against zero failures. |
| Any other repo | Whatever check the repo defines, green. No check, no auto-resolve. |

**Route to the Needs-you queue instead of resolving** whenever the shared file calls the evidence
unverifiable: a deployed edge function, a migration, the Grok model, the live endpoint, or the iOS
app. Never resolve a thread on evidence the repo cannot produce.
