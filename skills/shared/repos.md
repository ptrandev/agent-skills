# The repos these skills work in

Owns the repo set, each repo's clone path and default branch, and the command that verifies a
change in it. Every skill that touches more than one repo reads this file instead of keeping its
own copy. **Each skill owns its own policy** (verdict depth, auto-resolve bar, tracker route) and
states it in its own `repos.md`.

Adding a repo means one row here and one row in each policy file that needs it.

## The repos

| Repo | Local clone | Default branch | Stack |
|---|---|---|---|
| `Atllas-Inc/codebase` | `/Users/phillip/Git/codebase` | `master` | Yarn 3 + Turbo monorepo |
| `Atllas-Inc/aicc-queues` | `/Users/phillip/Git/aicc-queues` | `master` | Gradle/JVM |
| `Atllas-Inc/neema-simple-hyzl` | `/Users/phillip/Git/neema-simple-hyzl` | `main` | Deno edge functions, plus `web/` and `voice-control/` npm packages |
| `Atllas-Inc/pointsgpt` | `/Users/phillip/Git/pointsgpt` | `main` | Cloudflare Workers, Deno edge functions, an iOS app. No `package.json` anywhere |

**Never assume `master`.** Read the PR's own base ref, or run the ladder in
[default-branch.md](default-branch.md).

Resolve a clone by trying `./$NAME`, then `$HOME/$NAME`, then `$HOME/Git/$NAME`, and take the first
hit. The paths above are the usual answer, not a guarantee.

## Verify commands

Run only what the changed files touch. **Never run a whole monorepo.** Capture each exit code. Do
not read the last output line.

### `Atllas-Inc/codebase`

Yarn 3 plus Turbo, per affected workspace: `yarn ci:typecheck`, `turbo run lint`, and the nearest
`vitest` target. Some vitest suites need the Firebase emulators. Typecheck and lint always work.

```bash
cd apps/api && yarn ci:typecheck 2>&1 | tail -30
cd apps/agents-portal && yarn lint 2>&1 | tail -30
cd apps/api && yarn test 2>&1 | tail -30
```

When the change modifies a shared package (`sdk`, `privs`, `common`, `ui`), rebuild it:
`cd packages/<name> && yarn build`. No other repo here has a `packages/` directory.

### `Atllas-Inc/aicc-queues`

```bash
./gradlew --no-daemon compileJava
./gradlew --no-daemon :<module>:test     # local only, when Redis and Postgres are up
```

Its integration tests need Redis, Postgres, and Firebase, so a cloud run is **compile-only**.
"Verified" there means *compiles*, not *tests pass*.

### `Atllas-Inc/neema-simple-hyzl`

Verified green on `main`, 2026-09-16.

```bash
deno task check && deno task lint && deno task test   # always; no service, no secret
cd web && npm ci && npm run typecheck && npm run build && npm test  # only if the diff touches web/
cd voice-control && npm ci && npm run typecheck        # only if the diff touches voice-control/
```

Use the repo's own Deno tasks, because a bare `deno check` loses the glob in bash. A fresh clone has
no `node_modules`, so `npm ci` comes first, and it needs the npm registry.

`npm run build` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time.
Without them it still exits 0 and prints no warning, but every page in the export renders
"Couldn't load this page". Export the URL from `web/.env.example` and any placeholder key, because
nothing reaches that origin. `npm run typecheck` and `npm test` do not need them.

A finding that rests on a deployed edge function, a Supabase migration, or the Grok model is
**unverifiable from a check here**.

### `Atllas-Inc/pointsgpt`

Chat-first award flight search. There is **no `package.json`, no lockfile, and no install step**.
Every test is a file you run directly. Verified 2026-09-16 in the clone.

```bash
deno test -A supabase/functions               # 57 files, ~28 s. Edge function behavior.
node site/<name>_test.mjs                     # one file per surface; run the ones the diff touches
node site/tests/previous-evidence_test.mjs
deno run -A admin-site/turn_scores_test.ts    # Deno, NOT node: it imports npm: specifiers
cd admin-site && node check.js                # must run from admin-site/, it opens ./worker.js
```

**`main` is not green, and no CI runs these.** `.github/workflows/deploy.yml` only deploys.
Verified red on `main` at `a018da5`: `supabase/functions/account/index_test.ts`,
`ask/first-search-flow_test.ts`, `ask/intake-flow_test.ts`, `ask/paid-followup_test.ts`, and
`site/fare_landing_test.mjs`.

**Never call a failure the change's fault until you have re-run the same command on the base
commit.** Same failure at base, record it as a pre-existing note and move on. New failure, it is the
change's. Without that comparison every run in this repo opens with somebody else's bug.

`node` parses a file with no `package.json` as CommonJS, which is why `admin-site/check.js` exists
and why `node --check worker.js` is not a substitute for it. Read the comment at the top of
`check.js` before trusting any other syntax check there.

A finding that rests on the live endpoint, the iOS app, or a deployed function is **unverifiable
from a check here**: the harness is not the app.

### Any other repo

Run the typecheck, lint, or build script its `package.json` or build file defines. Without one, the
repo has no verification, and every skill's reduced-confidence policy applies.

## Merge check

A skill that verifies a **merge** rather than a change has no changed-file set to narrow by, so it
runs the repo's cheapest whole-repo check instead of the per-file commands above.

| Repo | Merge check |
|---|---|
| `Atllas-Inc/codebase` | `yarn ci:typecheck` in `apps/api` |
| `Atllas-Inc/aicc-queues` | `./gradlew --no-daemon compileJava` |
| `Atllas-Inc/neema-simple-hyzl` | `deno task check`, then `deno task lint` |
| `Atllas-Inc/pointsgpt` | `deno check supabase/functions`, then `cd admin-site && node check.js` |
| Any other repo | The typecheck, lint, or build script its `package.json` or build file defines |
