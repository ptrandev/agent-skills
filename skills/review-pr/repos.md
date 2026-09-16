# review-pr: verify depth per repo

**Read [../shared/repos.md](../shared/repos.md) first.** It owns the repo set, the clone paths, the
default branches, and the verify command for each. This file owns only what that depth means for a
**verdict**, which is this skill's decision and nobody else's.

Review every repo in that file unless `--repo` narrows the run.

| Repo | Verify depth | Effect on the verdict |
|---|---|---|
| `Atllas-Inc/codebase` | FULL | A clean pass can `APPROVE`. |
| `Atllas-Inc/aicc-queues` | COMPILE-ONLY | Reduced depth: **never** auto-`APPROVE`. A HIGH resting on runtime behavior downgrades to `COMMENT`, per the `SKILL.md` verdict table. |
| `Atllas-Inc/neema-simple-hyzl` | FULL | A clean pass can `APPROVE`. A finding the shared file calls unverifiable carries the `aicc-queues` downgrade. |
| `Atllas-Inc/pointsgpt` | FULL, base-compared | A clean pass can `APPROVE`, but only once the base comparison in the shared file has run. Without it, treat the depth as reduced. |
| Any other repo | none | Review from the diff, drop every finding to reduced confidence, and post nothing. |
