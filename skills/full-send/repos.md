# full-send: per-repo routes

Owns the tracker route per repo. Read it at Phase 0, before the first ticket call.
[../shared/repos.md](../shared/repos.md) owns the clone paths, the default branches, and the verify
commands.

A repo not listed here is not special-cased. Read its root `AGENTS.md` or `CLAUDE.md` for the
tracker.

## Tracker route (Phase 0)

The Linear MCP is bound to one workspace. A repo on another board gets its ticket filed in the
wrong place with no error, so resolve the route before the first fetch or create.

| Repo | Route |
|---|---|
| `Atllas-Inc/codebase`, `Atllas-Inc/aicc-queues` | Linear MCP. Issue prefix `AP`. |
| `Atllas-Inc/neema-simple-hyzl` | Workspace `hyzlsimple`, team `HyzlSimple`, issue prefix `HYZ`. **The Linear MCP cannot reach it.** Call `https://api.linear.app/graphql` with `LINEAR_API_KEY` from the repo-root `.env` in the `Authorization` header, no `Bearer` prefix. The same key is in Supabase Vault as `Linear_api_key`. **Never** print the key, and never put it in a prompt, a commit, or a log line. |
| `Atllas-Inc/pointsgpt` | Workspace `pointsgpt`, team `PointsGPT`, issue prefix `POI`. **The Linear MCP cannot reach it**, and that board belongs to a different company. Same GraphQL call and the same `.env` key rule as the row above. **Never** print the key. |

**Stop and ask** when a repo names a tracker with no route here. **Do not** file the ticket on the
nearest board.

## Verify commands (Phase 4)

**Read [../shared/repos.md](../shared/repos.md).** It owns the command for each repo. Run only what
the changed files touch.

Two rules this skill adds on top:

- **Note a pre-existing failure. Do not fix it.** In `pointsgpt` that means running the failing
  command on the base commit first, as the shared file requires.
- **Never upload an iOS build.** `pointsgpt`'s `AGENTS.md` sets three conditions, and one of them is
  a test the author did by hand on a device. This skill cannot satisfy that, so it stops short of a
  build and says so in the Phase 9 report.
