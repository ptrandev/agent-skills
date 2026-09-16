# Hyzl stack: `Atllas-Inc/neema-simple-hyzl`

Owns everything this repo does differently: its target, its boot, its personas, its route mapping,
its scenario states, and the label its evidence must carry. Read it at Phase 0 when `$NAME` is
`neema-simple-hyzl`, in place of [stack.md](stack.md) and
[dev-credentials.example.md](dev-credentials.example.md). Every other phase runs unchanged.

The repo documents the stack itself in `web/tests/README.md`. Read that file in the checkout before
booting. This file owns the walkthrough contract, that file owns the fixture behavior.

## Target: fixtures only

The target is the **fixture host**, always. `web/tests/preview-server.mjs` serves the static export
from `web/out` on `127.0.0.1`, injects `web/tests/fixtures.js` into every HTML response in memory,
and sets `Content-Security-Policy: connect-src 'self'`. The browser cannot reach a real API, so the
sealed-stack requirement in invariant 7 is met.

**Refuse `--target=dev` in this repo, in either role.** `npm run dev` there talks to real Supabase.
Say so in a neutral note and walk the fixture host instead:

```bash
if [ "$TARGET" = dev ]; then
  echo "REFUSING --target=dev in neema-simple-hyzl: npm run dev hits real Supabase (invariant 7)."
  TARGET=fixtures
fi
```

**The posted comment names the target as** `Stack: hyzl fixtures (static export, contract fixtures,
no live Supabase)`.

## Ports and lanes

Two ports, both derived from [concurrency.md](concurrency.md)'s `$LANE`. This repo is lane-capable
at every lane, because both ports are plain environment variables with no file literal behind them.

| Service | Lane 0 | Formula |
|---|---|---|
| fixture host (`HYZL_FIXTURE_PORT`) | 3000 | `3000 + OFFSET` |
| `browse` daemon | 6499 | `6499 + LANE` |

Skip the `LANE_CAPABLE` probe in [concurrency.md](concurrency.md). It reads
`scripts/e2e-stack.sh`, which this repo does not have. Set `LANE_CAPABLE=1` and `LANE_MAX=3`.

## Boot

```bash
PORT=$((3000 + LANE * 10))
cd "$WORKDIR/web"
npm ci                                   # a worktree has no node_modules
# Both are read at BUILD time and baked into the export. Without them every page
# renders "Couldn't load this page" and every screenshot shows that error instead
# of the PR. Neither is a secret and neither is ever reached: the fixture wrapper
# intercepts that origin and the host's CSP blocks the network.
export NEXT_PUBLIC_SUPABASE_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.example | cut -d= -f2-)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-anon-key
npm run build                            # writes web/out, which the host serves
HYZL_FIXTURE_PORT=$PORT node tests/preview-server.mjs > "$SCRATCH/hyzl-preview.log" 2>&1 &
HYZL_PID=$!
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/home/" && break
  sleep 1
done
BASE_URL="http://localhost:$PORT"
```

**Verified 2026-09-16 on lane 1 (port 3010):** this boot renders the populated `/home/` surface with
`window.__hyzlFixture` present, 16 intercepted requests, 0 escaped, and no horizontal scroll.

**Never skip `npm run build`.** The host serves `web/out`, a committed-artifact-free directory built
from source. A stale `out/` from an earlier branch renders the **old** code while every screenshot
claims to show the PR. That is the evidence-integrity failure invariant 6 exists to prevent, and
nothing in the page reveals it.

Kill `$HYZL_PID` in the EXIT trap. The host holds no database and no emulator, so teardown is that
one signal plus the lane teardown in [concurrency.md](concurrency.md).

## Health check (Phase 4)

Three assertions, all required. A failure is a **neutral note** and a skipped walkthrough, never a
finding.

```bash
curl -sI "$BASE_URL/home/" | grep -q 'X-Hyzl-Preview: contract-fixtures-only'   # the fixture host, not a dev server
curl -s  "$BASE_URL/home/" | grep -q '<script src="/__fixtures.js"></script>'   # injection reached the HTML
git -C "$WORKDIR" rev-parse HEAD | grep -qx "$HEAD_SHA"                        # the build came from the PR head
```

Assert the third one **before** the build, and again after, because the build is the only thing
that carries the PR's code into `web/out`.

Then assert in-page, through the driver: `typeof window.__hyzlFixture` returns `object`. A page
without it is the raw export with no fixtures, so its data is empty and every screenshot is
misleading.

## Personas

No credential file, no login form, no seeding step. The persona is two query parameters, and the
fixture script reads them at page load.

| `--personas` value | Query parameters |
|---|---|
| `premium` (default) | `auth=on&admin=0` |
| `admin` | `auth=on&admin=1` |
| `free` | `auth=on&admin=0&scenario=empty` |
| signed-out | `auth=off` |

`free` has no separate account in this repo. It maps to the `empty` scenario, an authenticated
merchant with zero apps. Say which mapping you used in the readiness line.

An explicit `scenario` resets the fixture database. Without one, the database survives reloads and
client navigation in the tab's session storage, so **pass a scenario on every first navigation to a
surface**, or the previous surface's writes leak into the shot.

## Route mapping (Phase 3)

Replace the `apps/agents-portal/src/(pages|components)/` filter with this one:

```bash
grep -E '^web/(app|components)/' "$SCRATCH/files-$NAME-$PR.txt"
```

- **`web/app/**/page.tsx` -> route directly.** `web/app/home/page.tsx` -> `/home/`.
  `web/app/page.tsx` -> `/`. **Keep the trailing slash**: `next.config.ts` sets
  `trailingSlash: true`, and the host serves `out/<route>/index.html`.
- **A `layout.tsx` covers every route beneath its own directory.** `web/app/signin/layout.tsx`
  reaches `/signin/` alone. The root `web/app/layout.tsx` reaches everything, so walk three
  authenticated shell surfaces for it: `/home/`, `/inbox/`, `/settings/`. Those two are the only
  layouts in the repo as of 2026-09-16, so **list the layouts before applying this rule** rather
  than trusting the count.
- **`web/components/**` -> walk importers transitively up to `web/app/`**, the same procedure
  Phase 3 already describes.
- **`web/app/test/` is a developer page.** Walk it only when the diff touches it.

Every other Phase 3 rule holds unchanged, including the no-cap rule and the ascending walk order.

## Scenario states (Phase 5a)

`web/tests/README.md` owns the full list and what each one contains. Walk `populated` on every
surface. Add a second state only when the diff reaches that code path:

| Diff touches | Add |
|---|---|
| an empty-state branch | `empty` |
| a loading or skeleton branch | `loading` |
| an error branch | `error` |
| onboarding or app creation | `setup` |
| a health or degraded banner | `broken` |
| an admin-only surface | `admin-empty` with `admin=1` |

Navigate as `$BASE_URL/<route>/?scenario=<state>&auth=on&admin=<0|1>`.

## Overrides in the shared phase files

These files are written for `codebase`. Apply the override, then follow the rest of the file.

| File | Override |
|---|---|
| [coverage.md](coverage.md) | Ledger rows come from `web/app/` and `web/components/`. |
| [driver.md](driver.md) | No `storageState`: the persona is a query parameter. The Playwright script goes at `web/uiw-drive.mjs`. The repo ships no Playwright, so prefer `browse`. |
| [concurrency.md](concurrency.md) | Skip the `LANE_CAPABLE` probe. A lane above 0 needs a worktree, because `web/out` is what the host serves. |
| [stack.md](stack.md) | Not read at all. This file replaces it. |

The teardown is `kill $HYZL_PID` plus the lane teardown. There is no hold spec, no emulator, no
injected test file, and no branch-restore beyond the one the checkout-strategy table already does.

## What this evidence proves

The fixtures prove rendering and request-contract behavior. They do **not** prove live
authentication, backend deployment, RLS enforcement, provider access, or SMS delivery.

**Label the posted screenshots `contract fixtures`**, per `web/tests/README.md`, and carry this
sentence in the comment: "Contract fixtures: these shots prove rendering and request contracts, not
live authentication, RLS, or delivery."

The deterministic detectors in Phase 5b keep their full weight, because horizontal scroll, touch
targets under 44px, clipped text, and console errors are defects whatever the data source. A
**judged** finding stays non-blocking here exactly as it is everywhere else (invariant 3).

**Never raise a finding about the data itself.** Fixture rows are authored test data, so a wrong
name, an odd date, or an empty list is the fixture speaking, not the PR.
