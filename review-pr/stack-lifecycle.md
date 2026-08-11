# review-pr: stack lifecycle (Phase 6)

How the Tier-3 dynamic walkthrough boots the PR's code locally, and how it stops. This file is the
**source of truth for the machine-wide stack lock**: `/ui-walkthrough` Phase 4 reads it from here
instead of keeping a second copy that would drift. Read it before any boot.

There is no preview deploy, so the walkthrough boots the PR's code locally. Booting someone else's
branch is the most failure-prone and highest-noise part of this skill. These rules keep its evidence
trustworthy.

## One stack at a time, machine-wide

Acquire the lock before boot; release it in teardown. The lock path is a **fixed absolute literal**,
not `$TMPDIR`-derived and not `$SCRATCH`-derived. Two processes with different `$TMPDIR` values would
each take "the" lock and boot two stacks onto the same pinned ports. `/ui-walkthrough` pins the same
literal path.

```bash
mkdir -p /private/tmp/ui-walkthrough
LOCK=/private/tmp/ui-walkthrough/review-pr-stack.lock   # literal, shared with /ui-walkthrough
if ! mkdir "$LOCK" 2>/dev/null; then
  OLDPID=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    echo "stack busy (PR being walked by pid $OLDPID): defer"; exit 0   # NEEDS-DYNAMIC-RUN note
  fi
  rm -rf "$LOCK" && mkdir "$LOCK"      # stale lock from a dead run: reclaim
fi
echo $$ > "$LOCK/pid"
```

Sequential: the ports below are pinned and `browse` is a singleton Chromium daemon, so two stacks
cannot coexist. Per-repo agents may run in parallel (see `orchestration.md`), but Tier-3
walkthroughs serialize on this lock; an agent that finds it held defers with a NEEDS-DYNAMIC-RUN note
rather than waiting.

## Pinned ports: free-or-abort preflight, and the repo already owns this check

The stack's ports come from repo config and are NOT relocatable without editing the checkout (FE
`baseURL` is hardcoded, emulator ports live in `firebase.json`). **Prefer the harness's own
preflight.** `scripts/e2e-stack.sh` runs `node scripts/e2e-preflight.mjs --ports
"${E2E_PREFLIGHT_PORTS:-4000,3000,9099,8080,9000,9199,8085}" --checkout "$ROOT"`, which fails loudly
naming the squatter's pid/command/cwd. A hand-maintained list here drifts from `firebase.json`, and
did: the set below previously omitted **9000** (the `database` emulator, which `--only` *does* start)
and included **4001** (the emulator UI, which `--only` does *not* start, so requiring it free is a
false blocker). Never set `E2E_KILL_SQUATTERS=1`: killing a process you don't own violates the
"provably ours" rule below.

If you need a pre-lock check before invoking the harness, match its list exactly:

```bash
BUSY=$(lsof -nP -iTCP:3000 -iTCP:4000 -iTCP:8080 -iTCP:8085 -iTCP:9000 -iTCP:9099 -iTCP:9199 \
       -sTCP:LISTEN 2>/dev/null | tail -n +2)
if [ -n "$BUSY" ]; then rm -rf "$LOCK"; echo "SKIP_WALKTHROUGH: ports occupied"; echo "$BUSY"; fi
```

This probe misses squatters outside this checkout; the harness preflight is authoritative. Observed
2026-07-30: the `lsof` sweep reported every port free, then `e2e-preflight.mjs` refused the boot
because :4000 was held by an API in a different conductor worktree.

Any port occupied -> **do not boot, do not walk through**. Release the lock, add a neutral
NEEDS-DYNAMIC-RUN note naming the port and likely cause ("is your dev stack running?"). This gate is
load-bearing, not hygiene: `playwright.config.ts` sets `reuseExistingServer: true`, so if something
already listens on :3000 (the user's dev server on `master`), the walkthrough would **silently
validate that code instead of the PR's** and produce screenshots "proving" whatever is already
running. A port conflict that errors is loud; validating the wrong stack is quiet. This preflight
converts the quiet failure into a loud skip. Kill a leftover only if it's provably ours: its PID is
in a previous run's `$LOCK/pid` **and** its command line matches the stack (`ps -p <pid> -o
command=` shows `next start` / `firebase emulators`). Anything else -> skip, never kill.

## Pre-build: workspace packages, on Node 20

Build the shared workspace packages **before** booting, at the PR head:

```bash
yarn turbo run build --filter='./packages/*'
```

`scripts/e2e-stack.sh` does **not** build them, and a fresh `yarn install` leaves their `dist/`
empty, so the stack's `next build` hard-fails resolving `loop-stats` (consumed by `loop-renderer`,
among others). Confirm **Node 20** is active first, per the repo's `.nvmrc`. Node 22 breaks the
`re2` native addon and risks build/runtime drift.

*(Verified via cloud boot spike 2026-07-26: emulators and API boot fine headlessly. This pre-build
is the one gap between a fresh clone and a healthy `:3000`.)*

`ui-walkthrough/stack.md` points here for this step. Keep it here, not in a second copy.

## Post-boot identity assertion

After the stack reports healthy, confirm :3000 is owned by a process this run spawned (`lsof -nP
-iTCP:3000 -sTCP:LISTEN` PID is a descendant of the stack we started) before driving the browser.
This is what makes walkthrough evidence attributable to the PR's code rather than to whatever
answered the port.

## State isolation

State isolation comes free from the existing harness: `yarn e2e:stack` runs `firebase
emulators:exec` with per-run in-memory emulators seeded by `e2e/seed/seed.mjs` (no `--import`), and
external services are stubbed. Never point the walkthrough at the dev database or real services. If
the stubbed stack can't exercise the surface, that's a NEEDS-DYNAMIC-RUN note, not a reason to relax
stubbing.

## Boot budget and teardown

**Boot budget: ~120 s to healthy** (matches the Playwright `webServer` timeout). Miss it -> tear
down, release the lock, neutral note ("stack didn't boot in budget"), move on. No retry spiral.

**Guaranteed teardown, and boot failures are never findings.** `emulators:exec` tears down the
emulators on its own exit. Everything else this run started (API process, `next start`, browse tabs)
is killed by an EXIT trap that also releases the lock. Teardown must not depend on the walkthrough
succeeding. Triage discipline: "didn't boot on my machine" is not "PR broken". Infra failures (ports,
budget, emulator crash) produce **neutral report notes only**. A posted finding requires misbehavior
observed **in the app, on a healthy, identity-verified stack**. If the stack ever gains first-class
port parameterization, move to a dedicated review-port block then. Do not `sed` ports into the
checkout to force one now.
