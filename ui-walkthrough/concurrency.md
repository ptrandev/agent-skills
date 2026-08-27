# Lanes: running two walkthroughs at once

Owns lane allocation, the port map, the per-lane lock, `browse` daemon scoping, the codebase
capability probe, and lane teardown. Read it at the end of Phase 0, before [stack.md](stack.md).
Carry `$LANE`, `$LOCK`, `$SCRATCH`, `$BASE_URL`, `$WORKDIR`, and `$B_ENV` out of it.

A lane is one complete, non-overlapping set of resources: TCP ports, a lock, a `browse` daemon, and
a scratch dir. One run holds one lane for its whole life. Lane 0 is the legacy fixed set, so
`/review-pr` (which knows nothing about lanes) and a lane-0 walkthrough still collide correctly on
the same lock.

## Port map

`OFFSET=$((LANE * 10))`, added to every port. Lanes are capped at **4** (0 through 3), because each
e2e stack runs JVM emulators plus a Node API plus `next start`.

| Service | Lane 0 | Formula |
|---|---|---|
| FE (`E2E_FE_PORT`) | 3000 | `3000 + OFFSET` |
| API (`BACK_PORT`) | 4000 | `4000 + OFFSET` |
| auth emulator | 9099 | `9099 + OFFSET` |
| firestore emulator | 8080 | `8080 + OFFSET` |
| database emulator | 9000 | `9000 + OFFSET` |
| storage emulator | 9199 | `9199 + OFFSET` |
| pubsub emulator | 8085 | `8085 + OFFSET` |
| `browse` daemon | 6499 | `6499 + LANE` |

**A step of 10 is deliberate, not arbitrary.** A step of 100 makes lane 1's auth port 9199, which is
lane 0's storage port. At a step of 10 no two services in the table collide inside the 4-lane cap.
**Never widen the step or raise the cap without re-checking every pair in the table.**

## Lane capability: the emulator ports are not parameterized yet

`E2E_FE_PORT` and `BACK_PORT` already follow the lane (`scripts/e2e-ci.sh`,
`apps/agents-portal/playwright.config.ts`). The five emulator ports do **not**: they are literals in
`firebase.json`, and `apps/agents-portal/e2e/.env.e2e` hardcodes `PUBSUB_EMULATOR_HOST` and every
`NEXT_PUBLIC_FB_EMU_*_PORT` to match. A lane above 0 therefore boots its emulators onto lane 0's
ports and `e2e-preflight.mjs` refuses it.

Probe the main clone, never assume. This runs before any worktree exists:

```bash
LANE_CAPABLE=0
LC_ALL=C grep -q 'E2E_LANE' "$CLONE/scripts/e2e-stack.sh" 2>/dev/null && LANE_CAPABLE=1
LANE_MAX=$( [ "$LANE_CAPABLE" = 1 ] && echo 3 || echo 0 )
```

`LANE_CAPABLE=0` -> **lane 0 only**, and a second concurrent `e2e` run defers with a neutral note,
exactly as before lanes existed. `LANE_CAPABLE=1` -> export `E2E_LANE=$LANE` and let the harness
derive every port from it. Tracked in **AP-1898**.

**Never `sed` ports into the checkout to force a lane.** `/review-pr`'s `stack-lifecycle.md` forbids
it, and a rewritten `firebase.json` is a source edit (invariant 9).

## Claiming a lane

Take the first lane whose lock is free **and** whose ports are all free. Both checks, in that order,
because a free lock with busy ports means a foreign process owns them.

```bash
mkdir -p /private/tmp/ui-walkthrough
LANE=""
for N in $(seq 0 "$LANE_MAX"); do
  if [ -n "${ARG_LANE:-}" ] && [ "$ARG_LANE" != "$N" ]; then continue; fi   # --lane=N pins one lane
  CAND=$( [ "$N" = 0 ] && echo /private/tmp/ui-walkthrough/review-pr-stack.lock \
                       || echo "/private/tmp/ui-walkthrough/stack-lane-$N.lock" )
  if ! mkdir "$CAND" 2>/dev/null; then
    OLDPID=$(cat "$CAND/pid" 2>/dev/null)
    if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then continue; fi   # live run, next lane
    rm -rf "$CAND" && mkdir "$CAND" || continue                               # stale, reclaim
  fi
  echo $$ > "$CAND/pid"
  O=$(( N * 10 ))
  BUSY=$(lsof -nP -sTCP:LISTEN \
    -iTCP:$((3000+O)) -iTCP:$((4000+O)) -iTCP:$((8080+O)) -iTCP:$((8085+O)) \
    -iTCP:$((9000+O)) -iTCP:$((9099+O)) -iTCP:$((9199+O)) 2>/dev/null | tail -n +2 || true)
  if [ -n "$BUSY" ]; then rm -rf "$CAND"; continue; fi   # foreign squatter, try the next lane
  LANE="$N"; LOCK="$CAND"; break
done
# `if`, not `cond && { ... }`: a false `&&` list returns 1, which aborts the run under `set -e`.
if [ -z "$LANE" ]; then
  if [ -n "${ARG_LANE:-}" ]; then echo "SKIP: lane $ARG_LANE is busy."
  else echo "SKIP: every lane 0..$LANE_MAX is busy."; fi
  exit 0
fi
```

Every lane busy -> **neutral note, no wait, no retry spiral** (invariant 2). Name the cap in the
note: `all 4 lanes busy` reads differently from `lane 0 busy, checkout has no lane support`.

Verified 2026-08-26 against five states: free machine, lane-0 lock held by a live pid, `--lane=0`
pinned to a held lane, a stale lock whose pid is dead, and all four lanes held. On that machine a
Firebase emulator suite already held 8080, 9000, 9099, and 9199, and the loop routed to lane 1
instead of failing. That is the case this exists for.

**Keep the `|| true`.** `lsof` exits 1 when it matches nothing, which is the success case here, and
under `set -o pipefail` that status propagates out of the command substitution and aborts the run.

**The `lsof` probe is advisory, not authoritative.** It misses squatters outside this checkout.
`scripts/e2e-preflight.mjs` is the real gate and runs inside the boot. Its refusal is a neutral
note, never a finding. **Never set `E2E_KILL_SQUATTERS=1`**: killing a process you do not own
violates the "provably ours" rule.

## Exporting the lane

```bash
O=$(( LANE * 10 ))
export E2E_LANE="$LANE"                                   # honored once AP-1898 lands
export E2E_FE_PORT=$((3000+O)) BACK_PORT=$((4000+O))
export NEXT_PUBLIC_BACK_URL="http://localhost:$((4000+O))/"
export E2E_PREFLIGHT_PORTS="$((4000+O)),$((3000+O)),$((9099+O)),$((8080+O)),$((9000+O)),$((9199+O)),$((8085+O))"
SCRATCH="/private/tmp/ui-walkthrough/lane-$LANE"; mkdir -p "$SCRATCH"
BASE_URL="http://localhost:$((3000+O))"
```

`e2e-ci.sh` captures an outer `BACK_PORT` and `NEXT_PUBLIC_BACK_URL` before it sources `.env.e2e`,
then re-exports them, so these win over the committed defaults. `E2E_FE_PORT` is read directly by
`playwright.config.ts` for `baseURL` and `webServer`. **Set both `BACK_PORT` and
`NEXT_PUBLIC_BACK_URL`.** The FE bakes `NEXT_PUBLIC_BACK_URL` at `next build`, so a lane that moves
the API without moving that URL builds a frontend pointed at another lane's API.

## RAM: a lane you cannot feed is not a free lane

[driver.md](driver.md) exits the run below \~8 GB total RAM. That budget is **per lane**. Before
taking a lane above 0, require 8 GB of *free* RAM on top of what is already running:

```bash
FREE_MB=$(( $(vm_stat | LC_ALL=C sed -n 's/^Pages free: *\([0-9]*\)\./\1/p') * 4096 / 1048576 ))
if [ "$LANE" != 0 ] && [ "${FREE_MB:-0}" -lt 8000 ]; then
  rm -rf "$LOCK"; echo "SKIP: ${FREE_MB}MB free < 8GB for lane $LANE"; exit 0
fi
```

**Release the lock on every exit path after claiming it**, this one included. A lane held by a run
that never booted blocks the next one.

## A lane above 0 needs its own checkout

Ports are not the only shared resource. Two runs in the **same directory** collide on the checked
out branch, `apps/agents-portal/.next`, `apps/agents-portal/e2e/.auth/*.json`, the injected
`uiw-hold.spec.ts`, and the `uiw-drive.mjs` driver. Separate ports do not separate any of those.

**Lane 0 uses the checkout-strategy table in [stack.md](stack.md). Every lane above 0 uses a
worktree**, whatever that table says:

```bash
if [ "$LANE" != 0 ]; then WORKDIR="$SCRATCH/checkout"; fi   # git worktree add "$WORKDIR" "$HEAD_SHA"
```

Pay the cost knowingly: the repo is `nodeLinker: node-modules` with `enableGlobalCache: false`, so a
worktree needs its own `yarn install`, roughly **3.6 GB and several minutes**. Budget it before
claiming lane 1, and `git worktree remove --force` in teardown. A second concurrent walkthrough is
worth that; a third rarely is.

## Scoping the `browse` daemon

`browse` is a daemon, and its default state file is `<project>/.gstack/browse.json` on port 6499. Two
runs sharing that daemon share one browser: tabs, cookies, and viewport all collide, and one run's
`browse stop` kills the other's session mid-matrix.

Give each lane its own daemon. Prefix **every** `browse` call with `$B_ENV`:

```bash
B_ENV="env BROWSE_STATE_FILE=$SCRATCH/browse.json BROWSE_PORT=$((6499+LANE))"
$B_ENV "$B" goto "$BASE_URL"
```

Verified 2026-08-26: two daemons launched with distinct `BROWSE_STATE_FILE` and `BROWSE_PORT` values
ran side by side, each reporting `Status: healthy` with its own pid, and `lsof` showed both listening
(6551, 6552). **Do not skip the state file.** `BROWSE_PORT` alone leaves both lanes writing one
`browse.json`, so the second launch overwrites the first lane's pid, port, and auth token, and the
first lane can no longer reach its own daemon.

## `--target=dev` is lane 0 only

`yarn agents-portal` has no port parameterization: `turbo run dev` binds `:3000` and `:4000` from the
apps' own configs. A `dev` run therefore takes lane 0 or nothing. Combined with invariant 7 this is
the intent: `dev` is the rare typed opt-in, and it does not get to displace concurrent `e2e` runs.

Pin the lane **before** *Claiming a lane* runs, so the loop never hands `dev` a lane it cannot use:

```bash
if [ "$TARGET" = dev ]; then ARG_LANE=0; fi
```

Lane 0 busy then means no `dev` walkthrough this run: neutral note, and the loop's own
`lane 0 is busy` exit covers it. **Do not** re-run it as `e2e` to salvage the run
(invariant 7): say which target was refused and why.

## Teardown

Add to the EXIT trap, alongside the stack teardown in [stack.md](stack.md):

```bash
$B_ENV "$B" stop 2>/dev/null || true          # this lane's daemon only, never a bare `browse stop`
if [ "$LANE" != 0 ]; then git worktree remove --force "$WORKDIR" 2>/dev/null || true; fi
rm -rf "$LOCK"
```

**Never run a bare `browse stop`**, and never `rm -rf /private/tmp/ui-walkthrough`. Both reach into
lanes this run does not own (invariant 8). `$SCRATCH` holds the run's PNGs, so leave it: Phase 9
reports from it and the next run on that lane overwrites it.
