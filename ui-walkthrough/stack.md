# Stack boot and lifecycle

How `/ui-walkthrough` gets the PR's code running and healthy before Phase 5 drives it. Read this at
the start of Phase 4, after [concurrency.md](concurrency.md) has set the lane. `SKILL.md` keeps only
the two target rules and the pointer here.

Every port below is written at its lane-0 value. **Use the lane's value**, from
[concurrency.md](concurrency.md)'s port map, in every command you actually run.

## `--target=dev`: the typed opt-in, lane 0 only

Reached only when a human typed `--target=dev` or exported `UIW_TARGET=dev`, or `/full-send` set
`UIW_ALLOW_DEV=1` under its own escape hatch. **Nothing derives this target** (invariant 7). Read
*Target selection* in `SKILL.md` before booting it.

`yarn agents-portal` (`npm run set-dev` + `turbo run dev --filter=agents-portal --filter=api
--filter=ui`) against **real atllas-dev**. Dev-mode Next, no `next build`, no emulator boot, no
seed, usually already running.

- **Unattended runs never get `dev`.** Phase 0 sets `ATTENDED=0` when `UIW_UNATTENDED=1`, `CI` is
  set, or the environment is a routine. `dev` under `ATTENDED=0` exits with a neutral note, unless
  `UIW_ALLOW_DEV=1`. It never falls back to `e2e` silently, because the evidence would describe a
  different environment than the run intended.
- **It occupies the machine.** `yarn agents-portal` binds `:3000` and `:4000` with no port
  parameterization, so a `dev` walkthrough takes the ports the operator's own dev server needs and
  blocks lane 0 for every concurrent run. That cost is the reason `e2e` is the default.
- **Reuse an existing `:3000` only if it serves this branch**: `git rev-parse HEAD` equals the PR
  head **and** the tree is clean. Otherwise restart it.
- **Dev mode shows overlays.** Next's dev indicator, hydration warnings, and Fast Refresh toasts can
  land in a screenshot and read as UI defects. Dismiss or hide them (`browse prettyscreenshot
  --cleanup --hide`) and never report an overlay as a finding.
- **No external stubbing.** Exercise happy paths that don't fire real integrations. Skip a surface
  rather than trigger a real charge, call, or SMS, and note the skip.
- **Real data lands in published screenshots.** Prefer your own records. If another user's data is
  visible on a surface, capture a narrower element shot rather than the full page.

## `--target=e2e` (the default): what the stack actually is (verified in the checkout, not assumed)

`yarn e2e:stack` -> `scripts/e2e-stack.sh` -> `firebase emulators:exec --project atllas-dev --only
auth,firestore,database,storage,pubsub 'bash scripts/e2e-ci.sh'`, and `e2e-ci.sh` does
env -> pubsub topics -> **seed** -> API -> `next build` -> **Playwright** -> teardown.

- **Local emulators, never real atllas-dev.** `--project atllas-dev` is only the project-ID
  namespace so SDKs configured for that project bind to the local emulator. No `--import`, so
  state is fresh in-memory per run, authored entirely by `e2e/seed/seed.mjs`.
- **Externals are stubbed** (`E2E_STUB_EXTERNAL=1`, `STUB_FORGE=1` from `e2e/.env.e2e`): no real
  Stripe/Vapi/Twilio/Cloudinary/Forge.
- **Interception is env-var-driven** (`*_EMULATOR_HOST` in `e2e/.env.e2e`). A process started
  **outside** that env talks to **real atllas-dev**. **Never hand-start the FE/API for a
  walkthrough:** everything must run **inside** `emulators:exec` with `.env.e2e` loaded. It fails
  *silently*: the app works, the screenshots look fine, and you were driving production-adjacent
  data.

## `yarn e2e:stack` alone cannot host a walkthrough

It runs the Playwright suite and tears the stack down, so there is no persistent stack to drive.
Hold it open by passing a **hold spec** that Playwright keeps running while you drive the app from
outside. Write it into the **ephemeral checkout only** (uncommitted, never a repo change, the same
rule `/review-pr` applies to its TLS launch arg):

```ts
// $WORKDIR/apps/agents-portal/e2e/tests/uiw-hold.spec.ts   (testDir is ./e2e/tests)
import { test } from '@playwright/test'
test('ui-walkthrough hold', async () => {
  test.setTimeout(0)   // config sets timeout: 60000, so the hold must opt out
  await new Promise(r => setTimeout(r, Number(process.env.UIW_HOLD_SECONDS ?? 900) * 1000))
})
```

**The hold spec must never take a `{ page }` fixture.** Playwright launches a browser lazily, when a
fixture asks for one, so a fixture-free test holds the stack open without ever launching a browser.
That is the only reason the hold survives a cloud sandbox whose bundled Chromium does not match the
repo's Playwright pin (`SKILL.md` Phase 0, *Cloud browser build*). Verified 2026-08-13 in a routine
sandbox: this spec passed, the same spec with `{ page }` failed at launch.

```bash
# Invoke the SCRIPT, not `yarn e2e:stack`. See "backgrounding" below.
# E2E_LANE and the vars from `e2e-lane.mjs env` are already exported by concurrency.md, so the
# backgrounded script inherits them and derives its own preflight list. Never pass
# E2E_PREFLIGHT_PORTS: it overrides that list and drops the Hub and Logging ports.
env -u VSCODE_CWD UIW_HOLD_SECONDS=900 bash scripts/e2e-stack.sh uiw-hold.spec.ts --project="$PROJ" &
```

**`env -u VSCODE_CWD` is required, not hygiene.** Claude Code runs in the VSCode extension host,
which exports `VSCODE_CWD=/`. `firebase-tools` gates its template path on that variable
(`lib/vsCodeUtils.js`), so every emulator boot from a VSCode-hosted session dies with
`ENOENT … lib/templates/hosting/init.js`. It looks like corrupt `node_modules` and invites a
pointless reinstall. Verified 2026-07-30. Terminal-launched `claude` is unaffected, which is why it
reproduces only sometimes. The same fix applies to `/review-pr`'s Tier-3 boot and `/full-send`.

**Backgrounding: call `bash scripts/e2e-stack.sh`, never `yarn e2e:stack`.** Backgrounding the
**outer yarn wrapper** kills the run mid-flight. Yarn 3 puts a temp shim dir on `PATH` for its
children, and when the backgrounded wrapper's environment is torn down the stack dies at the
Playwright hand-off with
`scripts/e2e-procgroup.sh: /private/var/folders/…/xfs-*/yarn: No such file or directory`. Invoking
the script directly skips that wrapper entirely and holds fine. (`nohup … & disown` gets reaped, and
`setsid` does not exist on macOS. Neither is the fix.)

**Pre-warm before you boot, or the hold never happens.** A cold boot is emulators -> seed -> SDK
build -> API -> `next build` -> Playwright, \~15 min, over the Bash tool's hard 600 s per-call
ceiling. A `git merge` of the base branch invalidates the caches that would otherwise save you. Run
the two expensive steps in their own foreground calls first, then boot:

```bash
npx turbo run build --filter=@atllasinc/sdk           # usually a full cache hit (~1 s)
set -a; . apps/agents-portal/e2e/.env.e2e; set +a      # build with the same env the stack uses
eval "$(node scripts/e2e-lane.mjs env "$LANE")"        # lane wins over the lane-0 literals above
export NEXT_PUBLIC_BACK_URL="http://localhost:${BACK_PORT}/"
export NEXT_PUBLIC_FRONT_URL="http://localhost:${E2E_FE_PORT}/"
yarn workspace agents-portal e2e:build                 # ~2 min cold, and it is the long pole
```

**Order matters: source `.env.e2e` first, then eval the lane.** `.env.e2e` carries the lane-0
literals for `PUBSUB_EMULATOR_HOST` and every `NEXT_PUBLIC_FB_EMU_*_PORT`, and `next build` bakes
the `NEXT_PUBLIC_*` values into the bundle. Sourcing after the eval would ship a frontend calling
lane 0's emulators from lane 1. `e2e-ci.sh` solves the same problem the same way, by re-exporting
after the source.

**The two URLs are set by hand here because `e2e-lane.mjs env` does not emit them.**
`e2e-stack.sh` derives both from the effective ports after its own eval. This pre-warm runs outside
`e2e-stack.sh`, so it repeats that derivation. Skip either one and the bundle points at another
lane. **Do this on lane 0 too**, so one code path covers every lane.

Then poll `$BASE_URL` (the lane's FE port) for a 200 and wait for the hold spec's own log line before driving.
**Poll with `curl`, never `pgrep -f`.** A `pgrep -f` wait loop matches the waiting shell's own
command line, so the condition can never go false and the loop spins forever. **Budget \~120 s** for
readiness. Miss it -> teardown, neutral note, no retry spiral. The FE is `next start` over a
prebuilt bundle, so no dev overlays pollute screenshots.

Pick `$PROJ` at runtime (`npx playwright test --list` in the checkout). **Don't hardcode a project
name**, they change. Choose a chromium project that **depends on the persona setup project** you
need: those setup projects log each persona in and write an authenticated `storageState`.

- **Form login is the working path.** Fill the seeded persona from Phase 0 and submit.
- **`storageState` cookie-import does NOT authenticate you.** Don't reach for it. The harness writes
  `e2e/.auth/user.json` with `indexedDB: true`, and the Firebase JS SDK keeps the session in
  **IndexedDB**, not cookies: the file's 7 cookies are analytics/Stripe only (`_ga`, `__stripe_mid`,
  `ph_…`). `browse cookie-import` moves cookies alone, so importing them yields a **logged-out**
  browser that still loads the page. You'd screenshot the login screen or an empty dashboard and
  never notice. Verified 2026-07-30. Replaying `origins[].indexedDB` works but needs a driver that
  can write IndexedDB pre-navigation, which is exactly what the Playwright `storageState` driver in
  Phase 0 does. Form login is simpler and honest for the `browse` path.

## Getting the PR's code on disk: untracked is not dirty

`/review-pr` Phase 3 says clean clone -> `gh pr checkout`, dirty clone -> worktree at the head SHA.
For a **walkthrough** that rule is too blunt, because a worktree needs its own `yarn install`: the
repo is `nodeLinker: node-modules` with `enableGlobalCache: false`, so that's **\~3.6 GB and minutes
of install per run**, on a machine where the main clone already has those deps.

Refine it by *what kind* of dirty:

| Working tree | Action | Why |
|---|---|---|
| clean | `gh pr checkout` | reuses `node_modules` |
| **untracked files only** | `gh pr checkout` | untracked files survive a branch switch untouched; nothing of the user's is at risk |
| untracked files that **collide** with paths the PR adds | worktree | the checkout would refuse or clobber |
| **modified/staged tracked** files | worktree | never switch branches under someone's edits |

```bash
git -C "$CLONE" status --porcelain | grep -qv '^??' && DIRTY_TRACKED=1 || DIRTY_TRACKED=0
```

**Always restore the user's branch in teardown.** Record `git rev-parse --abbrev-ref HEAD` before
checkout and switch back in the EXIT trap. This skill borrows the clone, it doesn't take it.
Worktree path -> `git worktree remove --force` instead, and expect the install cost.

## Lifecycle: defer to the harness, then to `/review-pr`

**Let the repo's own preflight do the port checking**, and trust it over your own probe. Observed
2026-07-30: a hand-rolled `lsof` sweep reported every port free, then `e2e-preflight.mjs` refused the
boot because :4000 was held by an API from a **different conductor worktree** on the same machine,
naming its pid, command, and cwd. Multi-worktree setups make this the normal case. `e2e-stack.sh`
builds the port list from the effective `BACK_PORT` and `E2E_FE_PORT` plus
`node scripts/e2e-lane.mjs backend-ports "$E2E_LANE"`, then runs `e2e-preflight.mjs`, which fails
loudly naming the squatter's pid/command/cwd. The lane list covers the Hub (4400) and Logging
(4500) ports that `firebase.json` never declares and `emulators:exec` always starts. Reimplementing
an `lsof` list here would drift from `firebase.json`; it already has. **Never set `E2E_KILL_SQUATTERS=1`**: killing a process you don't
own is exactly the "provably ours" rule violation `/review-pr` forbids. Its failure is a **neutral
note**, never a finding.

**[concurrency.md](concurrency.md) owns the lock**, one per lane, taken in Phase 0. Lane 0's path is
the literal `/private/tmp/ui-walkthrough/review-pr-stack.lock` that
the loaded `review-pr/stack-lifecycle.md` names, so a `review-pr` walkthrough and a lane-0
`/ui-walkthrough` still cannot both boot. `/review-pr` has no lane concept and always uses lane 0.
**Do not add a second lock here.**

For everything else (post-boot identity assertion, `yarn turbo run build --filter='./packages/*'`
pre-build, Node 24 per `.nvmrc`, EXIT-trap teardown) read
the loaded `review-pr/stack-lifecycle.md` and follow it. It's verified against a cloud boot; a
second copy would drift. Read its lock block as the lane-0 case of
[concurrency.md](concurrency.md)'s.
