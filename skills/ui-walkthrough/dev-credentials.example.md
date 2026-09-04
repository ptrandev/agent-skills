# Walkthrough credentials and personas

Choose the target before configuring credentials:

| Target | Setup |
|---|---|
| `e2e` (default) | None. The stack seeds local emulator accounts for every run. |
| `dev` | Copy this file to `dev-credentials.md` and fill in the dev credentials below. |

## E2e personas

The e2e stack reads committed values from `apps/agents-portal/e2e/.env.e2e`. It runs against fresh
Firebase emulators with external services stubbed.

| `--personas=` | Account | Environment keys | State |
|---|---|---|---|
| `premium` (default) | `e2e-agent@e2e.test` | `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD` | Active premium membership |
| `free` | `e2e-free@e2e.test` | `E2E_SEED_PASSWORD` | No membership |
| `admin` | `e2e-admin@e2e.test` | `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | Admin access |

The seed also provides `e2e-team-owner`, `e2e-team-member`, `e2e-client`, and
`e2e-onboarding` personas.

Log in through the form. Firebase stores its session in IndexedDB, so imported browser cookies do
not authenticate the persona.

Real dev accounts do not exist in the emulator and cannot log in to the e2e stack.

## Dev target

`--target=dev` walks the shared dev environment. Use it only for an attended, local run in author
mode. It can trigger real integrations and expose other engineers' data.

```text
DEV_BASE_URL=http://localhost:3000
DEV_PREMIUM_EMAIL=phillip+premium@example.com
DEV_PREMIUM_PASSWORD=replace-me
```

The skill resolves dev credentials in this order:

1. `UIW_DEV_PREMIUM_EMAIL` and `UIW_DEV_PREMIUM_PASSWORD`
2. This directory's gitignored `dev-credentials.md`
3. `full-send/dev-credentials.md`, using legacy `DEV_EMAIL` and `DEV_PASSWORD`

Missing dev credentials produce a neutral skip, not a finding.

`full-send` normally delegates capture against e2e. Its own dev credentials apply only to its
explicit dev escape hatch.
