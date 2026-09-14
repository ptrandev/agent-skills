# Windows adapter

This file owns the Windows shell boundary, WSL2 checkout, lane, stack process, browser, evidence
publication, and teardown. Apply it when `HOST_PLATFORM=windows`.

## Contract

Use PowerShell for GitHub calls and evidence publication. Use WSL2 for the E2E stack and Playwright.
Keep the WSL worktree on the Linux filesystem. Keep screenshots in the Windows scratch directory.

**Never run the E2E Bash harness through Git Bash, MSYS2, Cygwin, or native PowerShell.** Their
process groups do not match Linux process groups. Windows Git can also convert shell files to CRLF.

Set `UIW_HOST_PLATFORM=windows` inside WSL. This keeps Phase 0 on the local environment path.

The Windows adapter supports `--target=e2e` only. If `TARGET=dev`, post a neutral skip note.

## PowerShell to WSL2 boundary

Run each WSL script through this PowerShell helper. Base64 keeps PowerShell from expanding Bash
variables or command substitutions.

```powershell
function Invoke-UiwWsl {
  param([Parameter(Mandatory)][string]$Script)

  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script))
  wsl.exe -- bash -lc "echo $encoded | base64 -d | bash"
  if ($LASTEXITCODE -ne 0) {
    throw "The WSL command failed with exit code $LASTEXITCODE."
  }
}
```

For the stack boot, run the encoded WSL script as a foreground process. Keep the host tool session
open. Use its session ID for polls and teardown.

## Preflight

Resolve the source checkout and PR head through host Git before WSL starts.

```powershell
$CloneWin = (git rev-parse --show-toplevel).Trim()
git fetch origin "pull/$PR/head"
if ($LASTEXITCODE -ne 0) { throw "The PR head fetch failed." }
git cat-file -e "$HEAD_SHA^{commit}"
if ($LASTEXITCODE -ne 0) { throw "The PR head is absent from the source checkout." }

$CloneWsl = (wsl.exe wslpath -a $CloneWin).Trim()
$UiWRoot = Join-Path $env:LOCALAPPDATA 'ui-walkthrough'
$ScratchWin = Join-Path $UiWRoot 'lane-0'
$LockWin = Join-Path $UiWRoot 'review-pr-stack.lock'
New-Item -ItemType Directory -Force -Path $UiWRoot, $ScratchWin | Out-Null
```

Require the default distribution to use WSL2. Require Node 24, Bash, Git, Java, `lsof`, `file`, and
8 GB of RAM.

```powershell
Invoke-UiwWsl @'
set -euo pipefail
grep -qi 'microsoft-standard-WSL2' /proc/sys/kernel/osrelease
for command_name in bash git node corepack yarn java lsof file base64 curl setsid; do
  command -v "$command_name" >/dev/null
done
[ "$(node -p 'process.versions.node.split(`.`)[0]')" = 24 ]
total_mb=$(($(grep '^MemTotal:' /proc/meminfo | tr -cd '0-9') / 1024))
[ "$total_mb" -ge 8000 ]
'@
```

Treat a failed preflight as an infrastructure skip. Name the failed requirement in the neutral
note.

## Lane 0 and host lock

Windows uses lane 0. Do not run the lane allocation blocks in `concurrency.md`.

Claim the host lock with an atomic directory create. Reclaim it only when its recorded PowerShell
process is absent.

```powershell
if (Test-Path -LiteralPath $LockWin) {
  $OwnerPid = Get-Content -LiteralPath (Join-Path $LockWin 'pid') -ErrorAction SilentlyContinue
  $Owner = if ($OwnerPid) { Get-Process -Id $OwnerPid -ErrorAction SilentlyContinue }
  if ($Owner) { throw 'SKIP: lane 0 is busy.' }

  $ResolvedRoot = [IO.Path]::GetFullPath($UiWRoot)
  $ResolvedLock = [IO.Path]::GetFullPath($LockWin)
  if (-not $ResolvedLock.StartsWith($ResolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to remove a lock outside the UI walkthrough root.'
  }
  Remove-Item -LiteralPath $ResolvedLock -Recurse -Force
}
New-Item -ItemType Directory -Path $LockWin -ErrorAction Stop | Out-Null
Set-Content -LiteralPath (Join-Path $LockWin 'pid') -Value $PID

$LANE = 0
$BASE_URL = 'http://localhost:3000'
$ScratchWsl = (wsl.exe wslpath -a $ScratchWin).Trim()
```

Let `scripts/e2e-preflight.mjs` make the authoritative port decision. Treat its refusal as a neutral
skip. Do not run the `lsof` lane probe from `concurrency.md`.

## Linux worktree

Create a detached worktree on the WSL2 filesystem. The command override prevents the source
checkout's Windows `core.autocrlf=true` value from writing CRLF shell files.

```powershell
$ShortHead = $HEAD_SHA.Substring(0, 12)
$WORKDIR = (Invoke-UiwWsl @"
set -euo pipefail
export UIW_HOST_PLATFORM=windows
root=\"`$HOME/.cache/ui-walkthrough\"
workdir=\"`$root/worktrees/pr-$PR-$ShortHead\"
mkdir -p \"`$root/worktrees\"
if [ -e \"`$workdir\" ]; then
  echo \"SKIP: stale Windows walkthrough worktree at `$workdir\" >&2
  exit 1
fi
git -C '$CloneWsl' -c core.autocrlf=false worktree add --detach \"`$workdir\" '$HEAD_SHA' >/dev/null
printf '%s' \"`$workdir\"
"@ | Out-String).Trim()
```

Make sure that all harness scripts use LF before package installation.

```powershell
Invoke-UiwWsl @"
set -euo pipefail
cd '$WORKDIR'
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
"@
```

Use the fresh-worktree setup from the repository instructions. Run every build and stack command
inside this WSL worktree.

## Stack and browser

Follow `stack.md` inside WSL after the Linux worktree is ready. Export these variables before the
pre-warm and stack commands:

```bash
export UIW_HOST_PLATFORM=windows
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

Start the stack in a WSL2 session with its own process group. Record that group ID for teardown.

```bash
UIW_RUN="$HOME/.cache/ui-walkthrough/runs/pr-$PR-$HEAD_SHA"
mkdir -p "$UIW_RUN"
setsid bash scripts/e2e-stack.sh uiw-hold.spec.ts --project="$PROJ" \
  >"$UIW_RUN/stack.log" 2>&1 </dev/null &
STACK_PGID=$!
printf '%s\n' "$STACK_PGID" > "$UIW_RUN/stack.pgid"
```

The `setsid` process survives the PowerShell call. Poll `$UIW_RUN/stack.log` and `$BASE_URL` from
later WSL calls. Continue after the hold test starts and the frontend returns HTTP 200.

Use headless Playwright from the WSL worktree for Phase 5. Write `uiw-drive.mjs` inside
`apps/agents-portal`. Set its screenshot directory to `$ScratchWsl/shots`.

Use the seeded E2E form login from `stack.md`. Set each viewport with `page.setViewportSize`.
Capture with `page.screenshot({ fullPage: true })`. Run the Phase 5b detectors in the same page.

Set `CAN_VIDEO=0`. Record `video: skipped (OpenCap is unavailable on Windows)` in the report.

## Evidence publication

Run Phase 7 through host Git from `$CloneWin`. Do not push through WSL because its Git credential
store can differ from Windows Git.

Use `$ScratchWin` for the isolated index and screenshot paths. Translate the Bash operations in
`evidence-hosting.md` to these PowerShell commands:

```powershell
$ShotsWin = Join-Path $ScratchWin 'shots'
$AssetRef = "refs/ui-walkthrough/pr-$PR-$HEAD_SHA"
$IndexPath = Join-Path $ScratchWin "index-$PR"
$env:GIT_INDEX_FILE = $IndexPath
Remove-Item -LiteralPath $IndexPath -Force -ErrorAction SilentlyContinue

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

Keep the fallback ladder from `evidence-hosting.md`. Use host Git for every fallback push.

## Teardown

Send `TERM` to the recorded WSL2 process group first. Let `firebase emulators:exec` and the E2E
traps stop every child process.

```bash
STACK_PGID=$(cat "$UIW_RUN/stack.pgid")
kill -TERM -- "-$STACK_PGID" 2>/dev/null || true
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  kill -0 "$STACK_PGID" 2>/dev/null || break
  sleep 1
done
if kill -0 "$STACK_PGID" 2>/dev/null; then
  kill -KILL -- "-$STACK_PGID" 2>/dev/null || true
fi

ports=(3000 4000 4400 4500 8080 8085 9000 9099 9199)
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
if [ -n "$remaining_pids" ]; then
  node scripts/e2e-preflight.mjs \
    --ports "$(IFS=,; echo "${ports[*]}")" \
    --checkout "$WORKDIR" \
    --kill-squatters
fi
```

The ownership check permits one teardown-only exception to the squatter rule. Stop only listeners
whose `/proc/<pid>/cwd` stays inside `$WORKDIR`.

Remove the WSL worktree through WSL Git. Remove only the validated host lock. Keep `$ScratchWin` for
the local report.

```powershell
Invoke-UiwWsl @"
set -euo pipefail
git -C '$CloneWsl' worktree remove --force '$WORKDIR'
git -C '$CloneWsl' worktree prune
"@

$ResolvedRoot = [IO.Path]::GetFullPath($UiWRoot)
$ResolvedLock = [IO.Path]::GetFullPath($LockWin)
if (-not $ResolvedLock.StartsWith($ResolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to remove a lock outside the UI walkthrough root.'
}
Remove-Item -LiteralPath $ResolvedLock -Recurse -Force
```

Finish only after these checks pass:

1. The stack process exited.
2. Ports 3000, 4000, 4400, 4500, 8080, 8085, 9000, 9099, and 9199 are free.
3. The source checkout stayed on its original branch with a clean index.
4. `git worktree list` contains no Windows adapter worktree.
5. The PR comment links every published screenshot.
