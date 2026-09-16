# babysit-prs: verify commands and the auto-resolve bar

Owns the verify command per repo and the verification depth that sets the auto-resolve bar. Read it
at the verify step, after the fixes for one PR are made. Skip the sections for repos not in this run.

Run only what the changed files touch. **Never run the whole monorepo.**

```bash
# codebase: Yarn 3 (Berry) + Turbo monorepo, per affected workspace.
cd apps/api && yarn ci:typecheck 2>&1 | tail -30
cd apps/agents-portal && yarn lint 2>&1 | tail -30
# plus the nearest test target (e.g. vitest) for the changed code, if one exists

# aicc-queues: Gradle/JVM. Compile-only in the cloud, per the verification depth table below.
./gradlew --no-daemon compileJava
./gradlew --no-daemon :<module>:test     # local only, when Redis+Postgres are up

# neema-simple-hyzl: Deno at the root, npm inside web/ and voice-control/.
# Always run the three root tasks. They need no service and no secret.
deno task check && deno task lint && deno task test
# Add these only when the diff touches that directory. A fresh clone has no node_modules.
# npm run build needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY exported, or it
# exits 0 and silently exports pages that all render "Couldn't load this page". Take the URL from
# web/.env.example and use any placeholder key: nothing reaches that origin.
cd web && npm ci && npm run typecheck && npm run build && npm test
cd voice-control && npm ci && npm run typecheck

# pointsgpt: no package.json, no install. Every test is a file you run directly.
deno test -A supabase/functions               # edge functions
node site/<name>_test.mjs                     # the surfaces the diff touches
deno run -A admin-site/turn_scores_test.ts    # Deno, not node: it imports npm: specifiers
cd admin-site && node check.js                # from admin-site/, it opens ./worker.js
```

**Verification depth per repo sets the auto-resolve bar.**

| Repo | Verification depth | Auto-resolve bar |
|---|---|---|
| `codebase` | Full Tier 2: per-workspace `yarn ci:typecheck`, `turbo run lint`, `vitest`. Some vitest suites need Firebase emulators; typecheck and lint always work. | Green typecheck, lint, and the nearest test target. |
| `aicc-queues` (cloud sandbox) | **Compile-only**, because its integration tests need Redis and Postgres, absent there. "Verified" means *compiles*, not *tests pass*. | Auto-resolve genuinely mechanical fixes only. Route anything whose correctness depends on runtime behavior to the Needs-you queue instead of resolving it on a compile alone. |
| `pointsgpt` | Full Tier 2, but **`main` is not green and no CI runs the tests**. **Never** call a failure the fix's fault before re-running the same command on the PR's base commit. Same failure at base means pre-existing. | Green on the tests the fix touches, judged against the base, not against zero failures. A fix whose correctness depends on the live endpoint, the iOS app, or a deployed function goes to the Needs-you queue: the harness is not the app. |
| `neema-simple-hyzl` | Full Tier 2: `deno task check`, `deno task lint`, `deno task test`, plus the npm checks of a touched package. The Deno tasks need no service and no secret. `npm ci` needs the npm registry, so a `web/` fix drops to triage-only when the registry is unreachable. | Green root tasks, and the npm checks of every package the fix touched. A fix whose correctness depends on a deployed edge function, a Supabase migration, or the Grok model goes to the Needs-you queue: none of those is reachable from a check. |
