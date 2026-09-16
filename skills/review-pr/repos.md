# review-pr: target repos and verify commands

Owns the default repo set, each repo's clone path, and its Tier 2 verify commands. `SKILL.md` keeps
none of them. Read this at Phase 0, and skip the sections for repos not under review.

## Targets (default repos)

Review these unless `--repo` narrows the run.

| Repo | Local clone | Default branch | Verify depth |
|------|-------------|----------------|--------------|
| `Atllas-Inc/codebase` | `/Users/phillip/Git/codebase` | `master` | FULL |
| `Atllas-Inc/aicc-queues` | `/Users/phillip/Git/aicc-queues` | `master` | COMPILE-ONLY |
| `Atllas-Inc/neema-simple-hyzl` | `/Users/phillip/Git/neema-simple-hyzl` | `main` | FULL |

**Never assume `master`.** Read the PR's own base ref, as Phase 2 already does.

## Verify commands

Run only what the changed files touch. Capture each exit code. Do not read the last output line.

### `Atllas-Inc/codebase` (FULL)

Yarn 3 plus Turbo, per affected workspace: `yarn ci:typecheck`, `turbo run lint`, and the nearest
`vitest` target. Some vitest suites need the Firebase emulators. Typecheck and lint always work.

### `Atllas-Inc/aicc-queues` (COMPILE-ONLY)

```bash
./gradlew --no-daemon compileJava
```

Its integration tests need Redis, Postgres, and Firebase. "Verified" here means *compiles*, not
*tests pass*, which drives the downgrade row in the `SKILL.md` verdict table.

### `Atllas-Inc/neema-simple-hyzl` (FULL)

Verified green on `main`, 2026-09-16.

```bash
deno task check && deno task lint && deno task test   # always; no service, no secret
cd web && npm ci && npm run typecheck && npm run build && npm test  # only if the diff touches web/
cd voice-control && npm ci && npm run typecheck        # only if the diff touches voice-control/
```

Use the repo's own Deno tasks, because a bare `deno check` loses the glob in bash. A fresh clone has
no `node_modules`, so `npm ci` comes first.

A Hyzl finding that rests on a deployed edge function, a Supabase migration, or the Grok model is
unverifiable here. Carry the same downgrade as the `aicc-queues` row.

### Another repo

Run the typecheck, lint, or build script its `package.json` or build file defines. Without one, the
repo has no Tier 2, so review from the diff and post nothing.
