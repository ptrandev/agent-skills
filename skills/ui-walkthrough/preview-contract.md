# Fixture preview contract

Owns what a repo must ship so that `/ui-walkthrough` can walk it without a sealed e2e stack: the
manifest, the preview command, the health checks, and how Phases 3 to 8 read them. The repo owns
the boot. This skill owns the policy. **Never copy a repo's boot steps into this skill**, because a
copy drifts the day the repo changes its build.

Read it at Phase 0 when the repo root has a `walkthrough.json` and `$NAME` is not `codebase`.
[stack.md](stack.md) stays the boot for `Atllas-Inc/codebase`.

The manifest in the checkout is the only signal. A repo with no `walkthrough.json` and no `scripts/e2e-stack.sh` has no walkable stack. Skip it with a
neutral note that names the missing manifest.

## The manifest: `walkthrough.json` at the repo root

```json
{
  "version": 1,
  "preview": {
    "command": "npm run preview:fixtures",
    "portEnv": "PREVIEW_PORT",
    "readyPath": "/home/"
  },
  "sourceDirs": ["web/app", "web/components"],
  "appDir": "web/app",
  "trailingSlash": true,
  "entryPath": "/home/",
  "personas": {
    "premium": "auth=on&admin=0",
    "admin": "auth=on&admin=1",
    "signed-out": "auth=off"
  },
  "states": {
    "populated": { "query": "scenario=populated", "default": true },
    "empty": { "query": "scenario=empty", "when": "an empty-state branch" }
  },
  "label": "contract fixtures",
  "caveat": "Contract fixtures: these shots prove rendering and request contracts, not live authentication, RLS, or delivery.",
  "ios": { "command": "scripts/capture-flows.sh --iphone", "outputDir": "admin-site/web/public/flows" },
  "demo": { "command": "npm run preview:demo", "readyPath": "/home/", "liveDirs": ["supabase/functions"] }
}
```

| Field | Meaning |
|---|---|
| `preview.command` | Run from the repo root. Builds the working tree, then serves it in the foreground. |
| `preview.portEnv` | The variable the command reads for its port. |
| `preview.readyPath` | A path that answers 200 once the preview serves pages. |
| `sourceDirs` | The Phase 3 filter. A changed file under one of them is a UI file. |
| `appDir` | The Next.js App Router root. Phase 3 maps `page.tsx` and `layout.tsx` under it to routes. |
| `trailingSlash` | `true` when `next.config` sets `trailingSlash: true`. Keep the slash on every route that Phase 3 maps then. `readyPath` and `entryPath` stay exactly as the server serves them. |
| `entryPath` | The first frame of the video journey. |
| `personas` | Persona name to query string. `premium` is required. A persona selects identity only: its query never sets a key that a state query sets. |
| `states` | State name to query string. Exactly one entry has `default: true`. `when` says which diff adds that state. `persona` (optional) names the persona the state needs, for example an admin-only state. |
| `label`, `caveat` | Printed on the posted comment, verbatim. |
| `ios` | Optional. Captures iPhone screenshots. Absent means the repo has no native app. |
| `demo` | Optional. Boots the demo server that the behavior pass needs. See *The demo server*. Absent means no behavior claim that calls the backend can be demonstrated. |

## What the preview command must do

A repo PR that adds or changes the command must keep all of these true:

1. **Build from the working tree on every start.** Never serve an earlier build output.
2. **Bind `127.0.0.1` on the port in `portEnv`**, in the foreground, until it gets a signal.
3. **Exit non-zero when the build fails.** Never serve a partial build.
4. **Send `X-Fixture-Preview: <sha>` on every HTML response.** `<sha>` is `git rev-parse HEAD` at
   build time, with a `-dirty` suffix when `git status --porcelain` lists a tracked change.
5. **Keep every request on the machine.** Answer each backend call from fixtures in the page, and
   send `Content-Security-Policy: connect-src 'self'`. Never reach a production or staging host.
6. **Expose `window.__fixturePreview`** before the app's own scripts run, with an `escaped` array.
   Push one entry, `{method, url}`, for each request no fixture answered.
7. **Select persona and state by query string only.** No login form, no credential, no seed step.
8. **Leave `git status` unchanged**, apart from gitignored build output.

## How each phase reads it

| Phase | Rule |
|---|---|
| 0 | Set `TARGET=fixtures`. Refuse `--target=dev` with a neutral note: a dev server reaches a real backend (invariant 7). Skip the `LANE_CAPABLE` probe in [concurrency.md](concurrency.md). Set `LANE_CAPABLE=1` and `LANE_MAX=3`. |
| 3 | Filter changed files with `sourceDirs`. Map `<appDir>/**/page.tsx` to its route, and a `layout.tsx` to every route beneath it. The root `layout.tsx` is global: walk `entryPath` plus the two next top-level routes. Walk component importers up to `appDir`. Pass a state query on every first navigation to a surface, because a fixture database can carry writes across pages. Every other Phase 3 rule holds. |
| 3 | When the manifest has `ios` and the diff touches `ios/`, do not exit early for a PR with no web file. Skip Phases 4 to 5c and run the iOS capture alone. |
| 4 | Boot and health check, below. |
| 5a | Navigate as `$BASE_URL<route>?<persona query>&<state query>`. Walk the default state on every surface, at every viewport. A manifest state other than the default is an interaction state for [capture.md](capture.md): desktop and mobile only. Add a state only when its `when` matches the diff. A state with `persona` is walked with that persona only. A requested persona the manifest does not list is a neutral note, never a substitute. |
| 5a | After each surface, read `window.__fixturePreview.escaped`. A non-empty array is a **coverage gap**, reported by URL. The PR owns the missing fixture, like seed rung 1 in `full-send/evidence.md`. |
| 5c | When the demo server booted, the journey and Phase 5d run on it, with the persona query and no state query. |
| 5c | Start the journey with one `goto` to `$BASE_URL<entryPath>?<persona query>&<default state query>`. Every later beat clicks, per [opencap.md](opencap.md). The fixture state persists in the tab, so a click keeps the persona and state. After an action, wait for an element the action creates, never for text the start state already shows. |
| 7 | Add the `ios` screenshots to the evidence, when the ios row below produced any. |
| 8 | The `Stack:` line reads `Stack: <repo> fixtures (<label>, no live backend)`. Carry `caveat` under it. |

**Never raise a finding about fixture data.** A wrong name or an odd date is the fixture, not the PR.

## Boot and health check (Phase 4)

Boot in two Bash calls. A cold build can pass the 600 s ceiling of one call, so the first call runs
with `run_in_background` and holds the preview in the foreground of its own shell:

```bash
# Call 1, run_in_background. No `&`: the background call itself keeps the server alive.
PORT=$((3000 + LANE * 10)); M="$WORKDIR/walkthrough.json"
cd "$WORKDIR" && env "$(jq -r .preview.portEnv "$M")=$PORT" sh -c "$(jq -r .preview.command "$M")" \
  > "$SCRATCH/preview.log" 2>&1
```

```bash
# Call 2, foreground: wait for readiness, then record the process that holds the port.
PORT=$((3000 + LANE * 10)); READY=$(jq -r .preview.readyPath "$WORKDIR/walkthrough.json")
BASE_URL="http://localhost:$PORT"
for _ in $(seq 1 100); do curl -sf -o /dev/null "$BASE_URL$READY" && break; sleep 5; done
lsof -t -nP -iTCP:$PORT -sTCP:LISTEN > "$SCRATCH/preview.pid"
```

Teardown kills each pid in `$SCRATCH/preview.pid`. **Never kill by the pid of the call or the
`npm` wrapper**: `npm run` starts the server as a child, which keeps the port after its parent dies.

Three assertions, all required. A failure is a neutral note that quotes the last 20 lines of
`preview.log`, never a finding:

```bash
curl -sf -o /dev/null "$BASE_URL$READY"                                  # it serves
SHA=$(curl -sI "$BASE_URL$READY" | tr -d '\r' | sed -n 's/^[Xx]-[Ff]ixture-[Pp]review: //p')
[ "$SHA" = "$HEAD_SHA" ]                                                 # built from the PR head, clean
curl -sI "$BASE_URL$READY" | grep -qi "^content-security-policy:.*connect-src 'self'"
```

Then assert in the page, through the driver: `typeof window.__fixturePreview` returns `object`.

A `-dirty` SHA fails the second assertion. The walked tree must equal the PR head, or the evidence
shows code the PR does not contain.

The readiness line names the fixture target instead of the e2e persona and emulator ports:

```
ui-walkthrough:  gh ✓ (ptrandev)  driver: Playwright headed, chrome  RAM 32GB ✓  lane 0 (preview :3000)  persona: premium (account=pro)  target: pointsgpt fixtures  video: opencap ✓ window-scoped desktop journey
```

## The demo server

The fixture preview answers every backend call from fixtures, so the PR's backend code never runs
there. The demo server serves the same app and answers the calls under `liveDirs` with the working
tree's own handler code. [behavior.md](behavior.md) owns when the walkthrough uses it.

| Field | Meaning |
|---|---|
| `demo.command` | Run from the repo root. Builds the working tree, then serves it in the foreground. Reads its port from `preview.portEnv` |
| `demo.readyPath` | A path that answers 200 once the demo server serves pages |
| `demo.liveDirs` | The backend source dirs whose handlers the demo server runs |

The demo command keeps rules 1 to 4 and 6 to 8 of the preview command. Rule 5 changes, and two rules
are added:

5. **Run the working tree's handler for each backend call under `liveDirs`.** Stub every dependency
   outside the repo (model calls, the database, third-party APIs) on the machine, with deterministic
   answers. Send `Content-Security-Policy: connect-src 'self'`. Never reach a production or staging
   host.
9. **Push one entry, `{method, url}`, to `window.__fixturePreview.live`** for each request that the
   working tree's code answered.
10. **Start each page load with the persona from its query and an empty history**, so each scenario
    starts from a clean state.

**Boot it after Phase 5b, on the same port.** Kill each pid in `$SCRATCH/preview.pid`. Then run the
two boot calls from *Boot and health check* with `demo.command`, `demo.readyPath`, `demo.log`, and
`demo.pid`. Run the three assertions and the `window.__fixturePreview` check. Teardown kills each pid
in `$SCRATCH/demo.pid`. A failure is a neutral note that quotes the last 20 lines of `demo.log`.

A changed backend file outside `liveDirs`, or a dependency with no stub, leaves its claims NOT
DEMONSTRATED. The PR owns the fix, like seed rung 1 in `full-send/evidence.md`.

The `Stack:` line for a recording on the demo server reads
`Stack: <repo> demo server (the PR's handlers, stubbed externals)`.

## iOS screenshots

Run the `ios.command` only when all of these hold:

- the manifest has `ios`
- the diff touches `ios/`
- `command -v xcodebuild` succeeds

Run it from the repo root after Phase 5b. Copy the PNGs it writes under `ios.outputDir` into
`$SCRATCH/ios/`. Then restore the output directory with `git checkout -- "<outputDir>"`, because the
evidence goes to the evidence ref, not the PR branch (invariant 9). Name each shot `ios-<file>`.

No video for iOS. When `xcodebuild` is missing, add the neutral note
`iOS: not captured (no Xcode on this machine)`.
