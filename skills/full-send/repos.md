# full-send: per-repo routes

Owns the tracker route and the verify commands for each repo this skill runs in. `SKILL.md` keeps
neither. Read it at Phase 0 for the tracker, and again at Phase 4 for the commands.

A repo not listed here is not special-cased. Read its root `AGENTS.md` or `CLAUDE.md` for the
tracker, and its `package.json` or build file for the scripts.

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

Run only what the changed files touch. Capture each exit code. Do not read the last output line.

### `Atllas-Inc/codebase`

```bash
cd apps/api && yarn ci:typecheck 2>&1 | tail -30
cd apps/agents-portal && yarn lint 2>&1 | tail -30
cd apps/api && yarn test 2>&1 | tail -30
cd apps/agents-portal && yarn test 2>&1 | tail -30
```

### `Atllas-Inc/aicc-queues`

```bash
./gradlew --no-daemon compileJava
./gradlew --no-daemon :<module>:test     # local only, when Redis and Postgres are up
```

### `Atllas-Inc/neema-simple-hyzl`

Run the three root tasks on every change. They need no service and no secret. Add a package's npm
checks only when the diff touches that package. A fresh clone has no `node_modules`, so `npm ci`
comes first. Use the repo's own Deno tasks, because a bare `deno check` loses the glob in bash.

```bash
deno task check && deno task lint && deno task test
cd web && npm ci && npm run typecheck && npm run build && npm test
cd voice-control && npm ci && npm run typecheck
```

`npm run build` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time.
Without them it still exits 0 and prints no warning, but every page in the export renders
"Couldn't load this page". Export the URL from `web/.env.example` and any placeholder key, because
nothing reaches that origin. `npm run typecheck` and `npm test` do not need them.

Migrations and edge-function deploys are out of reach from a check. Record any acceptance criterion
that rests on deployed behavior as unverified in the Phase 9 report.

### `Atllas-Inc/pointsgpt`

No `package.json`, no lockfile, no install step. Every test is a file you run directly.

```bash
deno test -A supabase/functions               # edge functions, 57 files
node site/<name>_test.mjs                     # the surfaces the diff touches
deno run -A admin-site/turn_scores_test.ts    # Deno, not node: it imports npm: specifiers
cd admin-site && node check.js                # from admin-site/, it opens ./worker.js
```

**`main` is not green and no CI runs these**, so re-run any failing command on the PR's base commit
before treating it as this change's fault. Same failure at base is pre-existing: note it, never fix
it, and never let it block the PR.

**Never upload an iOS build.** `AGENTS.md` there sets three conditions, and one of them is a test
the author did by hand on a device. This skill cannot satisfy that, so it stops short of a build and
says so in the Phase 9 report.
