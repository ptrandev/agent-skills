# Walkthrough credentials and personas

The single source of truth for who `/ui-walkthrough` logs in as. `SKILL.md` Phase 0 reads the values
at runtime and points here for the table.

`/ui-walkthrough` drives the **e2e stack**, whose accounts are seeded per run by
`apps/agents-portal/e2e/seed/seed.mjs` with credentials already committed in
`apps/agents-portal/e2e/.env.e2e`. The skill reads them from the checkout at runtime, so
the default path needs **no credentials provisioned anywhere**: nothing gitignored, nothing set in a
routine's environment, nothing to leak. Copy this file to `dev-credentials.md` (gitignored) only for
the `--target=dev` opt-in at the bottom.

## Default: seeded emulator personas (no setup)

`firebase emulators:exec --project atllas-dev --only auth,firestore,database,storage,pubsub`. The
project ID is only a namespace label; traffic is intercepted by local emulators, state is fresh
in-memory per run (no `--import`), and `E2E_STUB_EXTERNAL=1` / `STUB_FORGE=1` short-circuit every
external SaaS call.

| `--personas=` | Seeded account | `.env.e2e` keys | State |
|---|---|---|---|
| `premium` *(default)* | `e2e-agent@e2e.test` | `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` | `premiumMembership` -> `statuses.core_premium.status=active`, which clears the FE Guard paywall |
| `free` | `e2e-free@e2e.test` | `E2E_SEED_PASSWORD` | no membership, for gating/upsell regressions |
| `admin` | `e2e-admin@e2e.test` | `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | admin surfaces |

Also seeded and available if a surface needs them: `e2e-team-owner`, `e2e-team-member`, `e2e-client`,
`e2e-onboarding`.

Log in through the **form**. Importing the harness's `storageState` cookies does NOT authenticate
you, because the Firebase session lives in IndexedDB (`stack.md` has the measurement and the date).

## Real dev-environment accounts do NOT work here

An account like `phillip+premium@atllas.com` lives in **real atllas-dev**, not in the per-run
emulator, so it fails at the login form. It is not a credential problem: the user does not exist in
that database.

## `--target=dev` (opt-in, author mode, local only, attended only)

For deliberately walking the **real dev** stack (`yarn agents-portal`, which is not emulator-scoped).
`e2e` is the default in every role and environment, so nothing reaches this file unless a human typed
`--target=dev` (`SKILL.md` invariant 7). **Never in reviewer mode, never in a routine, never
unattended**: reviewer evidence must come from a deterministic stack, and a shared environment means
real external side effects and other engineers' data in your screenshots. The one exception to the
unattended half is `/full-send`'s rung-4 escape hatch (`full-send/evidence.md`), which sets
`UIW_ALLOW_DEV=1`.

```
DEV_BASE_URL=http://localhost:3000
DEV_PREMIUM_EMAIL=phillip+premium@example.com
DEV_PREMIUM_PASSWORD=replace-me
```

Resolution order for `--target=dev`: `UIW_DEV_PREMIUM_EMAIL` / `UIW_DEV_PREMIUM_PASSWORD` env vars,
then this directory's `dev-credentials.md`, then the loaded `full-send/dev-credentials.md`
(legacy `DEV_EMAIL`/`DEV_PASSWORD`). Nothing resolvable -> skip with a neutral note, never a finding.

> `/full-send` keeps its own `dev-credentials.md`. It delegates every capture to `/ui-walkthrough`
> on `e2e`, so that file is read only on the rung-4 escape hatch, where real dev credentials are
> correct. **Never** point it at the seeded accounts.
