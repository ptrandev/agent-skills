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
| `Atllas-Inc/pointsgpt` | `/Users/phillip/Git/pointsgpt` | `main` | FULL, base-compared |

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

`npm run build` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time.
Without them it still exits 0 and prints no warning, but every page in the export renders
"Couldn't load this page". Export the URL from `web/.env.example` and any placeholder key, because
nothing reaches that origin. `npm run typecheck` and `npm test` do not need them.

A Hyzl finding that rests on a deployed edge function, a Supabase migration, or the Grok model is
unverifiable here. Carry the same downgrade as the `aicc-queues` row.

### `Atllas-Inc/pointsgpt` (FULL, base-compared)

Chat-first award flight search: a Cloudflare Worker site, an admin Worker, Supabase edge functions,
and an iOS app. There is **no `package.json`, no lockfile, and no install step**. Every test is a
file you run directly. Verified 2026-09-16 in the clone.

```bash
deno test -A supabase/functions              # 57 files, ~28 s. Edge function behavior.
node site/<name>_test.mjs                     # one file per surface; run the ones the diff touches
node site/tests/previous-evidence_test.mjs
deno run -A admin-site/turn_scores_test.ts    # Deno, NOT node: it imports npm: specifiers
cd admin-site && node check.js                # must run from admin-site/, it opens ./worker.js
```

**`main` is not green, and no CI runs these.** `.github/workflows/deploy.yml` only deploys.
Verified red on `main` at `a018da5`: `supabase/functions/account/index_test.ts`,
`ask/first-search-flow_test.ts`, `ask/intake-flow_test.ts`, `ask/paid-followup_test.ts`, and
`site/fare_landing_test.mjs`.

**Never call a failure the PR's fault until you have re-run the same command on the PR's base
commit.** Same failure at base, record it as a pre-existing note and move on. New failure, it is the
PR's. Without that comparison every review in this repo opens with somebody else's bug.

`node` parses a file with no `package.json` as CommonJS, which is why `admin-site/check.js` exists
and why `node --check worker.js` is not a substitute for it. Read the comment at the top of
`check.js` before trusting any other syntax check there.

### Another repo

Run the typecheck, lint, or build script its `package.json` or build file defines. Without one, the
repo has no Tier 2, so review from the diff and post nothing.
