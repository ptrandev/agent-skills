# Windows adapter

This file owns the Windows shell boundary, WSL2 checkout, lane, stack and preview processes, browser,
evidence publication, and teardown. Apply it when `HOST_PLATFORM=windows`.

## Contract

Use PowerShell for GitHub calls and evidence publication. Use WSL2 for the stack or preview and for
Playwright. Keep the WSL worktree on the Linux filesystem. Keep screenshots in the Windows scratch
directory.

| Repo | Target | Boot inside WSL |
|---|---|---|
| `Atllas-Inc/codebase` | `e2e` | *Codebase stack* below, per [stack.md](stack.md) |
| a repo with `walkthrough.json` | `fixtures` | *Fixture preview* below, per [preview-contract.md](preview-contract.md) |
| any other repo | none | post a neutral skip note |

If `TARGET=dev`, post a neutral skip note.

**Never run a repo's POSIX boot through Git Bash, MSYS2, Cygwin, or native PowerShell.** Their
process groups do not match Linux process groups. Windows Git can also convert shell files to CRLF.
A preview command can also assume POSIX `npm` and `file://` path handling.

Set `UIW_HOST_PLATFORM=windows` inside WSL. This keeps Phase 0 on the local environment path.

## PowerShell to WSL2 boundary

Run each WSL script through this PowerShell helper. Each call starts a new Bash, so the helper
exports the run variables in `-Env` first. Base64 carries the script to Bash unchanged.

```powershell
function Invoke-UiwWsl {
  param([Parameter(Mandatory)][string]$Script, [hashtable]$Env = @{})

  $header = ($Env.GetEnumerator() | ForEach-Object {
    "export $($_.Key)='$(([string]$_.Value) -replace "'", "'\''")'"
  }) -join "`n"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$header`n$Script"))
  wsl.exe -- bash -lc "echo $encoded | base64 -d | bash"
  if ($LASTEXITCODE -ne 0) {
    throw "The WSL command failed with exit code $LASTEXITCODE."
  }
}
```

**Run each `bash` block in this file as `Invoke-UiwWsl -Env $UiwEnv @'<block>'@`.** Use the literal
`@'…'@` form. An expandable `@"…"@` string lets PowerShell expand `$` and `$(…)` before Bash sees
them. *Linux worktree* sets `$UiwEnv`.

Run the stack boot and the preview boot as background host calls, because each block ends in
`wait`. That call holds the process open, so WSL2 keeps the distribution running. Use later calls
for polls and teardown.

## Preflight

Resolve the source checkout and PR head through host Git before WSL starts.

```powershell
$CloneWin = (git rev-parse --show-toplevel).Trim()
git fetch origin "pull/$PR/head"
if ($LASTEXITCODE -ne 0) { throw "The PR head fetch failed." }
git cat-file -e "$HEAD_SHA^{commit}"
if ($LASTEXITCODE -ne 0) { throw "The PR head is absent from the source checkout." }

$CloneWsl = (wsl.exe -e wslpath -a $CloneWin).Trim()
$UiWRoot = Join-Path $env:LOCALAPPDATA 'ui-walkthrough'
$ScratchWin = Join-Path $UiWRoot 'lane-0'
$LockWin = Join-Path $UiWRoot 'review-pr-stack.lock'
New-Item -ItemType Directory -Force -Path $UiWRoot, $ScratchWin | Out-Null
```

Require the default distribution to use WSL2, 8 GB of RAM, and the commands for the repo's row:

| Repo | Commands |
|---|---|
| every repo | `bash git node lsof file base64 curl setsid` |
| `Atllas-Inc/codebase` | add `corepack yarn java`, and Node 24 |
| a repo with `walkthrough.json` | add `npm jq` |

```powershell
$RepoCommands = if ($NAME -eq 'codebase') { 'corepack yarn java' } else { 'npm jq' }
Invoke-UiwWsl @"
set -euo pipefail
grep -qi 'microsoft-standard-WSL2' /proc/sys/kernel/osrelease
for command_name in bash git node lsof file base64 curl setsid $RepoCommands; do
  command -v "`$command_name" >/dev/null
done
if [ '$NAME' = codebase ]; then node -e 'process.exit(process.versions.node.split(".")[0] === "24" ? 0 : 1)'; fi
total_mb=`$((`$(grep '^MemTotal:' /proc/meminfo | tr -cd '0-9') / 1024))
[ "`$total_mb" -ge 8000 ]
"@
```

Treat a failed preflight as an infrastructure skip. Name the failed requirement in the neutral
note.

## Lane 0, host lock, and the run directory

Windows uses lane 0. Do not run the lane allocation blocks in `concurrency.md`.

Claim the host lock with an atomic directory create, and write a token into it. Each tool call can
be a new PowerShell process, so a process ID cannot prove that a lock is stale.

```powershell
$ShortHead = $HEAD_SHA.Substring(0, 12)
$RunStamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$RunId = "pr-$PR-$ShortHead-$RunStamp"
try { New-Item -ItemType Directory -Path $LockWin -ErrorAction Stop | Out-Null }
catch { throw "SKIP: lane 0 is busy (lock $LockWin holds run $(Get-Content -Raw -LiteralPath (Join-Path $LockWin 'run') -ErrorAction SilentlyContinue))." }
Set-Content -LiteralPath (Join-Path $LockWin 'run') -Value $RunId -NoNewline

$LANE = 0
$BASE_URL = 'http://localhost:3000'
$ShotsWin = Join-Path $ScratchWin "shots-$RunId"
New-Item -ItemType Directory -Path $ShotsWin -ErrorAction Stop | Out-Null
$ShotsWsl = (wsl.exe -e wslpath -a $ShotsWin).Trim()
```

**Never reclaim a lock automatically.** A lock left by a crashed run blocks lane 0 until a person
removes it. Name the lock path and its run ID in the neutral note.

`New-Item` without `-Force` fails on an existing directory. **Never reuse, empty, or delete an
earlier shots directory**, because Phase 7 publishes every PNG in `$ShotsWin`.

For `codebase`, let `scripts/e2e-preflight.mjs` make the authoritative port decision. Treat its
refusal as a neutral skip. Do not run the `lsof` lane probe from `concurrency.md`.

## Linux worktree

Create a detached worktree on the WSL2 filesystem. The command override prevents the source
checkout's Windows `core.autocrlf=true` value from writing CRLF files.

```powershell
$WORKDIR = (Invoke-UiwWsl -Env @{ CLONE_WSL = $CloneWsl; HEAD_SHA = $HEAD_SHA; RUN_ID = $RunId } @'
set -euo pipefail
root="$HOME/.cache/ui-walkthrough"
workdir="$root/worktrees/$RUN_ID"
mkdir -p "$root/worktrees"
if [ -e "$workdir" ]; then
  echo "SKIP: stale Windows walkthrough worktree at $workdir" >&2
  exit 1
fi
git -C "$CLONE_WSL" -c core.autocrlf=false worktree add --detach "$workdir" "$HEAD_SHA" >/dev/null
printf '%s' "$workdir"
'@ | Out-String).Trim()

$UiwEnv = @{
  UIW_HOST_PLATFORM = 'windows'; WORKDIR = $WORKDIR; PR = $PR; HEAD_SHA = $HEAD_SHA
  TARGET = $TARGET; SHOTS = $ShotsWsl; RUN_ID = $RunId
}
```

The run directory is `$HOME/.cache/ui-walkthrough/runs/$RUN_ID`, new for every run, so a rerun never
reads an earlier run's process group or log.

For `codebase`, make sure that all harness scripts use LF before package installation:

```bash
set -euo pipefail
cd "$WORKDIR"
if file scripts/e2e-stack.sh scripts/e2e-ci.sh scripts/e2e-procgroup.sh | grep -q CRLF; then
  echo 'The WSL worktree contains CRLF shell files.' >&2
  exit 1
fi
bash -n scripts/e2e-stack.sh scripts/e2e-ci.sh scripts/e2e-procgroup.sh
corepack enable
yarn install --immutable
yarn workspace agents-portal exec playwright install chromium
npx turbo build --filter=api^... --filter=agents-portal^...
yarn firebase --version >/dev/null
```

Use the fresh-worktree setup from the repository instructions. Run every build, stack, and preview
command inside this WSL worktree.

## Codebase stack

Follow `stack.md` inside WSL after the Linux worktree is ready. Export these variables before the
pre-warm and stack commands:

```bash
export E2E_LANE=0
export UIW_HOLD_SECONDS=900
```

Shadow any machine-local `firebase` wrapper before the stack starts. The shim keeps the current
WSL worktree as Firebase's working directory.

```bash
UIW_BIN="$HOME/.cache/ui-walkthrough/bin"
mkdir -p "$UIW_BIN"
printf '%s\n' '#!/usr/bin/env bash' 'exec yarn firebase "$@"' > "$UIW_BIN/firebase"
chmod +x "$UIW_BIN/firebase"
export PATH="$UIW_BIN:$PATH"
[ "$(pwd)" = "$WORKDIR" ]
[ "$(command -v firebase)" = "$UIW_BIN/firebase" ]
```

Start the stack in a WSL2 session with its own process group, in a background host call. Record
that group ID for teardown.

```bash
UIW_RUN="$HOME/.cache/ui-walkthrough/runs/$RUN_ID"
mkdir "$UIW_RUN"
cd "$WORKDIR"
setsid bash scripts/e2e-stack.sh uiw-hold.spec.ts --project="$PROJ" \
  >"$UIW_RUN/stack.log" 2>&1 </dev/null &
STACK_PGID=$!
printf '%s\n' "$STACK_PGID" > "$UIW_RUN/stack.pgid"
wait "$STACK_PGID"
```

Poll `$UIW_RUN/stack.log` and `$BASE_URL` from later WSL calls. Continue after the hold test
starts and the frontend returns HTTP 200.

Write `uiw-drive.mjs` inside `apps/agents-portal`. Use the seeded E2E form login from `stack.md`.

## Fixture preview

The manifest's `preview.command` owns the build and the serve. Start it inside WSL in its own
process group, on lane 0's port, in a background host call. **Never boot onto a port that another
process holds** (invariant 6):

```bash
M="$WORKDIR/walkthrough.json"
UIW_RUN="$HOME/.cache/ui-walkthrough/runs/$RUN_ID"
if lsof -t -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo 'SKIP: port 3000 is busy' >&2
  exit 1
fi
mkdir "$UIW_RUN"
cd "$WORKDIR"
setsid env "$(jq -r .preview.portEnv "$M")=3000" sh -c "$(jq -r .preview.command "$M")" \
  >"$UIW_RUN/preview.log" 2>&1 </dev/null &
PREVIEW_PGID=$!
printf '%s\n' "$PREVIEW_PGID" > "$UIW_RUN/stack.pgid"
wait "$PREVIEW_PGID"
```

From later WSL calls, wait for `http://127.0.0.1:3000<readyPath>` to answer 200. Allow 500 seconds
for a cold build. A cold build runs `npm ci` inside the preview command. Then install the driver's
browser into the WSL Playwright cache, from the package directory above `appDir`:

```bash
APP_PKG="$WORKDIR/$(dirname "$(jq -r .appDir "$WORKDIR/walkthrough.json")")"
(cd "$APP_PKG" && npx --no-install playwright install chromium)
```

If `playwright` is absent from that package, post a neutral skip note. **Never add it to the
checkout.** Write `uiw-drive.mjs` in that package directory. The persona and state come from the
query string, so the driver has no login step.

Then run the three assertions and the `window.__fixturePreview` check from
[preview-contract.md](preview-contract.md) *Boot and health check*, with that base URL. A failure is
a neutral note that quotes the last 20 lines of `$UIW_RUN/preview.log`.

Skip the manifest's `ios` command on Windows, with the neutral note
`iOS: not captured (no Xcode on this machine)`.

## Browser

Use headless Playwright from the WSL worktree for Phase 5. Pass `SHOTS="$ShotsWsl"` to
`uiw-drive.mjs` and write every screenshot there. Set each viewport with `page.setViewportSize`.
Capture with `page.screenshot({ fullPage: true })`. Run the Phase 5b detectors in the same page.

OpenCap does not run on Windows. **Read [browser-video.md](browser-video.md) before Phase 5c.** It
owns the recorded context in this WSL driver and the native Windows conversion and validation.

## Evidence publication

Run Phase 7 through host Git and PowerShell from `$CloneWin`. Do not push through WSL because its Git
credential store can differ from Windows Git.

**For `Atllas-Inc/pointsgpt`, skip the block below.** Follow [evidence-hosting.md](evidence-hosting.md)
*PointsGPT* with the files in `$ShotsWin`. **Never create a Git ref for PointsGPT evidence.**

For the GitHub evidence ref, translate the Bash operations in `evidence-hosting.md` to these
PowerShell commands:

```powershell
$AssetRef = "refs/ui-walkthrough/pr-$PR-$HEAD_SHA"
$IndexPath = Join-Path $ScratchWin "index-$PR-$ShortHead-$RunStamp"
$env:GIT_INDEX_FILE = $IndexPath

git -C $CloneWin read-tree --empty
Get-ChildItem -LiteralPath $ShotsWin -Filter '*.png' | ForEach-Object {
  $Blob = (git -C $CloneWin hash-object -w -- $_.FullName).Trim()
  git -C $CloneWin update-index --add --cacheinfo "100644,$Blob,$($_.Name)"
}
$Tree = (git -C $CloneWin write-tree).Trim()
$Commit = ("ui-walkthrough evidence: PR #$PR @ $HEAD_SHA" |
  git -C $CloneWin commit-tree $Tree).Trim()
Remove-Item Env:GIT_INDEX_FILE

git -C $CloneWin push origin "${Commit}:$AssetRef"
if ($LASTEXITCODE -ne 0) { throw 'Evidence publication failed.' }
```

Outside PointsGPT, keep the fallback ladder from `evidence-hosting.md`. Use host Git for every
fallback push.

## Teardown

Send `TERM` to the recorded WSL2 process group first. Let the stack's traps, or the preview command,
stop every child process. The test `kill -0 -- -<pgid>` checks the whole group, not only its leader.

```bash
UIW_RUN="$HOME/.cache/ui-walkthrough/runs/$RUN_ID"
cd "$WORKDIR"
STACK_PGID=$(cat "$UIW_RUN/stack.pgid")
kill -TERM -- "-$STACK_PGID" 2>/dev/null || true
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  kill -0 -- "-$STACK_PGID" 2>/dev/null || break
  sleep 1
done
if kill -0 -- "-$STACK_PGID" 2>/dev/null; then
  kill -KILL -- "-$STACK_PGID" 2>/dev/null || true
fi

if [ "$TARGET" = fixtures ]; then ports=(3000); else ports=(3000 4000 4400 4500 8080 8085 9000 9099 9199); fi
remaining_pids=$(
  for port in "${ports[@]}"; do
    lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  done | sort -u
)
for listener_pid in $remaining_pids; do
  listener_cwd=$(readlink -f "/proc/$listener_pid/cwd" 2>/dev/null || true)
  [ -z "$listener_cwd" ] && continue
  case "$listener_cwd/" in
    "$WORKDIR/"*) ;;
    *) echo "Refusing to stop foreign pid $listener_pid at $listener_cwd" >&2; exit 1;;
  esac
done
if [ -n "$remaining_pids" ] && [ -f scripts/e2e-preflight.mjs ]; then
  node scripts/e2e-preflight.mjs \
    --ports "$(IFS=,; echo "${ports[*]}")" \
    --checkout "$WORKDIR" \
    --kill-squatters
elif [ -n "$remaining_pids" ]; then
  kill -TERM $remaining_pids
fi
```

The ownership check permits one teardown-only exception to the squatter rule. Stop only listeners
whose `/proc/<pid>/cwd` stays inside `$WORKDIR`.

Remove the WSL worktree through WSL Git. Remove the host lock only when it holds this run's ID. Keep
`$ScratchWin` and every shots directory for the local report.

```powershell
Invoke-UiwWsl -Env @{ CLONE_WSL = $CloneWsl; WORKDIR = $WORKDIR } @'
set -euo pipefail
git -C "$CLONE_WSL" worktree remove --force "$WORKDIR"
git -C "$CLONE_WSL" worktree prune
'@

$ResolvedRoot = [IO.Path]::GetFullPath($UiWRoot)
$ResolvedLock = [IO.Path]::GetFullPath($LockWin)
if (-not $ResolvedLock.StartsWith($ResolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to remove a lock outside the UI walkthrough root.'
}
$LockRun = Get-Content -Raw -LiteralPath (Join-Path $ResolvedLock 'run') -ErrorAction SilentlyContinue
if ($LockRun -ne $RunId) { throw "Refusing to remove a lock held by run $LockRun." }
Remove-Item -LiteralPath $ResolvedLock -Recurse -Force
```

Finish only after these checks pass:

1. The stack or preview process exited.
2. Every port in `ports` is free.
3. The source checkout stayed on its original branch with a clean index.
4. `git worktree list` contains no Windows adapter worktree.
5. The evidence destination links every published screenshot.
