# Stack boot and lifecycle

How `/ui-walkthrough` gets the PR's code running and healthy before Phase 5 drives it. Read this at
the start of Phase 4. `SKILL.md` keeps only the two target rules and the pointer here.

## `--target=dev` (author, local, attended)

The fast path: `yarn agents-portal` (`npm run set-dev` + `turbo run dev --filter=agents-portal
--filter=api --filter=ui`) against **real atllas-dev**. Dev-mode Next, no `next build`, no emulator
boot, no seed, usually already running.

- **Unattended runs never get `dev`.** Phase 0 sets `ATTENDED=0` when `UIW_UNATTENDED=1`, `CI` is
  set, or the environment is a routine. `dev` under `ATTENDED=0` exits with a neutral note. It never
  falls back to `e2e` silently, because the evidence would describe a different environment than the
  run intended.
- **Reuse an existing `:3000` only if it serves this branch**: `git rev-parse HEAD` equals the PR
  head **and** the tree is clean. Otherwise restart it.
- **Dev mode shows overlays.** Next's dev indicator, hydration warnings, and Fast Refresh toasts can
  land in a screenshot and read as UI defects. Dismiss or hide them (`browse prettyscreenshot
  --cleanup --hide`) and never report an overlay as a finding.
- **No external stubbing.** Exercise happy paths that don't fire real integrations. Skip a surface
  rather than trigger a real charge, call, or SMS, and note the skip.
- **Real data lands in published screenshots.** Prefer your own records. If another user's data is
  visible on a surface, capture a narrower element shot rather than the full page.

## `--target=e2e`: what the stack actually is (verified in the checkout, not assumed)

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
yarn workspace agents-portal e2e:build                 # ~2 min cold, and it is the long pole
```

Then poll `http://localhost:3000` for a 200 and wait for the hold spec's own log line before driving.
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
runs `node scripts/e2e-preflight.mjs --ports 4000,3000,9099,8080,9000,9199,8085 --checkout "$ROOT"`,
which fails loudly naming the squatter's pid/command/cwd. Reimplementing an `lsof` list here would
drift from `firebase.json`; it already has. **Never set `E2E_KILL_SQUATTERS=1`**: killing a process
you don't own is exactly the "provably ours" rule violation `/review-pr` forbids. Its failure is a
**neutral note**, never a finding.

For everything else (the machine-wide stack lock, post-boot identity assertion, `yarn turbo run
build --filter='./packages/*'` pre-build, Node 20 per `.nvmrc`, EXIT-trap teardown) read
`~/.claude/skills/review-pr/stack-lifecycle.md` and follow it. It's verified against a cloud boot; a
second copy would drift. **Share its lock rather than adding a second**, so a `/review-pr`
walkthrough and a standalone `/ui-walkthrough` can't both boot. The lock is pinned at the literal
path `/private/tmp/ui-walkthrough/review-pr-stack.lock`, outside `/review-pr`'s own
`SCRATCH=/private/tmp/review-pr`, so both skills agree on it regardless of either process's
`$TMPDIR`. Lock held -> defer with a neutral note.
