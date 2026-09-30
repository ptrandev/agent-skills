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
  "ios": { "command": "scripts/capture-flows.sh --iphone", "outputDir": "admin-site/web/public/flows" }
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
