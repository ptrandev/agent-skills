# Walkthrough Credentials (example)

**You almost certainly do not need this file.** `/ui-walkthrough` drives the **e2e stack**, whose
accounts are seeded per run by `apps/agents-portal/e2e/seed/seed.mjs` with credentials already
committed in `apps/agents-portal/e2e/.env.e2e`. The skill reads them from the checkout at runtime,
so the default path needs **no credentials provisioned anywhere** — nothing gitignored, nothing set
in a routine's environment, nothing to leak.

This file exists only for the `--target=dev` opt-in described at the bottom. Copy it to
`dev-credentials.md` (gitignored) if you use that mode.

## Default: seeded emulator personas (no setup)

`firebase emulators:exec --project atllas-dev --only auth,firestore,database,storage,pubsub` —
the project ID is only a namespace label; traffic is intercepted by local emulators, state is fresh
in-memory per run (no `--import`), and `E2E_STUB_EXTERNAL=1` / `STUB_FORGE=1` short-circuit every
external SaaS call.

| `--personas=` | Seeded account | `.env.e2e` keys | State |
|---|---|---|---|
| `premium` *(default)* | `e2e-agent@e2e.test` | `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` | `statuses.core_premium.status=active` — clears the FE Guard paywall |
| `free` | `e2e-free@e2e.test` | `E2E_SEED_PASSWORD` | no membership — gating/upsell regressions |
| `admin` | `e2e-admin@e2e.test` | `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | admin surfaces |

Also seeded: `e2e-team-owner`, `e2e-team-member`, `e2e-client`, `e2e-onboarding`.

Better still, prefer the authenticated `storageState` the harness's per-persona **setup projects**
already produce, and import its cookies into the driver — then no password is typed at all.

## Real dev-environment accounts do NOT work here

An account like `phillip+premium@atllas.com` lives in **real atllas-dev**, not in the per-run
emulator, so it fails at the login form. It is not a credential problem — the user does not exist
in that database.

## `--target=dev` (opt-in, author mode, local only)

For deliberately walking the **real dev** stack (`yarn agents-portal`, which is not emulator-scoped).
**Never in reviewer mode, never in a routine**: reviewer evidence must come from a deterministic
stack, and a shared environment means real external side effects and other engineers' data in your
screenshots.

```
DEV_BASE_URL=http://localhost:3000
DEV_PREMIUM_EMAIL=phillip+premium@example.com
DEV_PREMIUM_PASSWORD=replace-me
```

Resolution order for `--target=dev`: `UIW_DEV_PREMIUM_EMAIL` / `UIW_DEV_PREMIUM_PASSWORD` env vars,
then this directory's `dev-credentials.md`, then `~/.claude/skills/full-send/dev-credentials.md`
(legacy `DEV_EMAIL`/`DEV_PASSWORD`). Nothing resolvable → skip with a neutral note, never a finding.

> `/full-send` keeps its own `dev-credentials.md` and should not be pointed at the seeded accounts:
> it boots `yarn agents-portal` against **real dev**, so real dev credentials are correct there.
