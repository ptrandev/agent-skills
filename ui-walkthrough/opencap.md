# OpenCap recording contract

The walkthrough video. Read this before touching `opencap` anywhere in this repo's skills — this
file is the single source of truth, and the CLI has three behaviors that silently produce a useless
recording if you guess.

**The one-line rule:** record the **browser window**, never the display, and never with a human in
the loop.

---

## Why window-scoped, always

`opencap record start` with no target flag captures the **entire primary display** for the whole
run. That is wrong here on three counts, and each one is disqualifying on its own:

1. **It publishes the operator's desktop.** These recordings get posted to a PR. A display capture
   ships whatever was on screen — Slack, mail, another client's code, a password manager — to
   everyone with repo access. Screenshots in this skill are already held to "no other users' data
   in a published image"; the video must clear the same bar, and display capture cannot.
2. **It takes the machine hostage.** If the recording only means anything when nothing else is on
   screen, the run is not autonomous — it's a 10-minute freeze on the operator's computer.
3. **It records the wrong thing anyway.** The `browse` driver is **headless** by default: there is
   no on-screen browser. A display capture of a headless walkthrough is a video of a terminal
   scrolling, with the app that was actually being walked nowhere in it.

Window mode fixes all three. ScreenCaptureKit keeps the target window's offscreen surface alive, so
the recording stays clean **even when the window is buried, on another Space, or fully covered**.
Playwright drives the page over CDP, not synthetic OS input, so the browser **never needs focus** —
the keyboard and mouse stay the operator's for the whole run.

The cost is that a headless browser has no window to target. Video therefore requires
`browse --headed`, and that is the only reason this skill ever runs headed.

---

## Invariants

1. **Never fall back to display capture.** If the window id can't be resolved, if `--headed` isn't
   available, if anything at all is uncertain → **skip the video** with a neutral note. A missing
   video is a footnote. A published recording of someone's desktop is not recoverable.
2. **Never use `--pick`.** It's an interactive TTY picker. In an unattended run it either hangs or
   resolves to nothing.
3. **Never target the terminal.** ScreenCaptureKit deadlocks capturing the window that hosts the
   process that started it. Target Chromium, only ever Chromium.
4. **Never start a second recording.** The active-session lock lives at `~/.opencap/active`, and
   `opencap event` appends to *the* active recording — with two live sessions, marker routing is
   undefined. If `record status` reports an active session, it isn't yours: skip with a note.
5. **Start recording after login, never before.** The credential entry must not be in the video.
   This is free if you follow the sequence below, and unfixable afterwards.
6. **Video never blocks and never fails a run.** Every `opencap` call is best-effort. Non-zero exit,
   empty output, missing binary → note it, continue the walkthrough, post the screenshots.
7. **Never leave an orphan session.** An abandoned recording holds the lock and burns a Free-tier
   slot (25 for the lifetime of the account). Discard it in the EXIT trap.

---

## Preflight — `CAN_VIDEO`

Video is available only when **all** of these hold. Probe them in Phase 0 and carry one boolean.

| Condition | Probe | Why |
|---|---|---|
| macOS | `[ "$(uname)" = Darwin ]` | OpenCap rides ScreenCaptureKit; Linux/Windows aren't shipped |
| Binary present | `command -v opencap` | — |
| Healthy install | `opencap config doctor` | Checks binary signing, **the macOS screen-recording permission**, network, credentials. The permission is a TCC grant — it cannot be granted from a script, so a `doctor` failure here is terminal for video on this run |
| Signed in | `opencap whoami` | Exit 3 = auth error → `opencap login` once, interactively |
| No live session | `opencap record status --json` reports inactive | Invariant 4 |
| Headed browser obtainable | see below | No window, no window capture |
| Author mode, local | `ROLE=author && ENVIRONMENT=local` | Reviewer runs post to someone else's PR from the sealed stack; a video adds nothing there and doubles the surface area |
| Not `--no-video` | flag | — |

```bash
CAN_VIDEO=0
if [ "$(uname)" = Darwin ] && [ "$ROLE" = author ] && [ "$ENVIRONMENT" = local ] \
   && [ "${NO_VIDEO:-0}" = 0 ] && command -v opencap >/dev/null 2>&1 \
   && opencap config doctor >/dev/null 2>&1 \
   && ! opencap record status --json 2>/dev/null | grep -q '"active"[[:space:]]*:[[:space:]]*true'
then CAN_VIDEO=1; else echo "video: skipped (see neutral note)"; fi
```

### The headed-browser condition

`--headed` is a **daemon-startup** setting in `browse`. A daemon already running headless will not
serve a headed request; it refuses and tells you to `browse disconnect` first.

**Do not disconnect a daemon you did not start.** It may be holding the operator's logged-in
session, tabs, and cookies, and taking it out to get a nicer PR artifact is the same class of
mistake as killing a port squatter. The rule:

| Daemon state | Action |
|---|---|
| none running | start ours headed — `$B` calls carry `--headed`; we own it, we tear it down |
| running **headed** already | reuse it, record |
| running **headless** | `CAN_VIDEO=0`, neutral note: `video skipped — a headless browse daemon is already running (run 'browse disconnect' first to enable video)` |

Two consequences of headed mode, both worth stating in the report:

- **`viewport --scale N` is unsupported headed**, so the retina hero shot is unavailable on a
  recorded run. The sweep already runs at scale 1; just don't add the hero shot.
- **The Chromium window takes focus once, when it launches.** After that it can be moved, covered,
  or sent to another Space with no effect on the recording.

### Quota and duration

```bash
opencap billing usage      # Plan: free | Recordings: 3 / 25
```

| Plan | Per recording | Count |
|---|---|---|
| Free | **5 minutes** | 25 for the account's lifetime |
| Pro | 60 minutes | unlimited |
| Team | unlimited | unlimited |

A three-viewport sweep over more than a couple of surfaces **runs past 5 minutes**, so on Free the
video covers the start of the sweep and the screenshots cover the rest. That is an acceptable
degradation — say so in the report rather than pretending the video is complete. If a Free-tier run
wants a video that covers everything, narrow the run (`--viewports=desktop`) rather than dropping
markers. OpenCap warns at 80% of a limit and pauses new recordings at 100%; a paused start is just
another `CAN_VIDEO=0` path.

---

## Resolving the window id

Deterministic, no guessing. `opencap windows list` returns every capturable window, and on a real
desktop that includes several Chromium windows plus menubar items (`Battery`, `Clock`, `Dock`) —
matching on `"Chromium"` alone will eventually grab the wrong one.

Title the target tab with a nonce, then match on it:

```bash
NONCE="opencap-target-${PR}-$(git rev-parse --short HEAD)"
$B js "document.title = '$NONCE'"

WIN=""
for _ in 1 2 3 4 5 6; do                       # the OS window title lags document.title slightly
  WIN=$(opencap windows list --json 2>/dev/null \
        | jq -r --arg n "$NONCE" '.[] | select(.title | contains($n)) | .id' | head -1)
  [ -n "$WIN" ] && break
  sleep 0.5
done
[ -n "$WIN" ] || { CAN_VIDEO=0; echo "video: skipped — could not resolve the browser window id"; }
```

The id is stable for the window's lifetime, so the next `goto` resetting the title is fine — resolve
once, before recording starts.

If the installed CLI predates `--json` on `windows list`, parse the two-column `id  title` output
instead. **Do not** drop the `--window` flag to make the command succeed (invariant 1).

---

## The sequence

Order is load-bearing. Each step exists because doing it later breaks something.

```bash
# 1. Boot the stack, launch the headed browser, LOG IN.       ← credentials stay out of the video
# 2. Size the window at the LARGEST viewport in the run, first.
$B viewport 1440x900
$B goto "$BASE_URL/<first surface>"
$B wait --networkidle

# 3. Resolve the window id (above).

# 4. Start recording. Returns immediately; capture daemonizes.
SESSION=$(opencap record start \
            --task "PR #$PR — $PR_TITLE (ui-walkthrough)" \
            --window "$WIN" --json 2>/dev/null | jq -r '.session_id')
[ -n "$SESSION" ] && [ "$SESSION" != null ] || CAN_VIDEO=0

# 5. Sweep, emitting one marker per scene (below).

# 6. Stop. Blocks until the mp4 is uploaded and the short code is minted.
VIDEO_URL=$(opencap record stop --json 2>/dev/null | jq -r '.share_url')
```

**Largest viewport first is a hard requirement.** OpenCap reads the window's dimensions **once, at
capture start**, and the encoded video keeps that size for its whole length. Start at 1440 and the
later 768 and 375 passes letterbox inside the frame — fine, everything stays visible. Start at 375
and every wider pass is **cropped**: the desktop layout is simply missing from the video, and the
one artifact meant to prove the responsive work is the one that hides it.

Do **not** use `--display` or `--region`. `--region` is reserved and currently warns and falls back
to display capture, which invariant 1 forbids.

---

## Markers — what makes the recording navigable

A marker is a timestamped entry in the recording's event log. On the share page they are a clickable
index: click one, the video seeks. Without them a reviewer gets an unlabeled 6-minute screen capture
and closes the tab.

Markers are also the reason `record start` is worth doing at all rather than screenshotting alone,
so **emit them or turn the video off** — a marker-less recording is not the artifact this skill
claims to produce.

```bash
# One per scene, immediately before the capture it labels. Inline, not a shell function:
# a `$1` inside SKILL.md is rewritten by the skill loader (SKILL.md Phase 0), so the
# positional-parameter form silently breaks when this is pasted back there.
[ "$CAN_VIDEO" = 1 ] && opencap event marker "agents · desktop 1440" \
  --tag "viewport:desktop" >/dev/null 2>&1 || true
$B prettyscreenshot "$SHOTS/01-agents-desktop.png"
```

| Emit | When | Type |
|---|---|---|
| `marker "<surface> · <viewport>"` | before every screenshot in the matrix | `session.marker` |
| `marker "<surface> · <state>"` | before each interaction state (modal open, form submitted, error, empty) | `session.marker` |
| an `error` event | **whenever a Phase 6 detector fires** | `error` |

The detector case is the highest-value one — it puts the defect on the timeline where a reviewer can
jump straight to it:

```bash
opencap event "$(jq -nc --arg s "horizontal scroll: 412px overflow on /agents @375" \
  '{type:"error", summary:$s, tags:["detector","blocker"]}')" >/dev/null 2>&1 || true
```

`summary` is capped at 280 characters and is the field semantic trimming matches against, so write
it like a log line: what, where, which viewport.

---

## Teardown

```bash
# In the EXIT trap, before releasing the stack lock:
if [ "$CAN_VIDEO" = 1 ] && [ -z "${VIDEO_URL:-}" ]; then
  opencap record discard >/dev/null 2>&1 || true    # aborted run: don't upload, don't burn a slot
fi
```

`record discard` stops without uploading. Use it on **every** abort path — bail-out, stack death,
detector crash, interrupt. A completed run uses `record stop`; nothing else does.

If we started the headed daemon, `browse disconnect` it in the same trap. If we reused one, leave it.

---

## Reporting

Report the video the way the rest of this skill reports evidence — factually, including when it
didn't happen:

```
Video: https://opencap.dev/r/Bs_eYjKW  (window-scoped, 14 markers)
Video: skipped — headless browse daemon already running
Video: skipped — OpenCap screen-recording permission not granted (run `opencap config doctor`)
Video: truncated at 5:00 (Free tier) — covers desktop + tablet; mobile is screenshots only
```

Never write "video captured" without a URL, and never describe a display capture as a walkthrough.

---

## Optional: trim to the defect

When the sweep found a blocker and the recording is long, a focused clip is a better PR artifact
than the full run. The reasoning happens here, not in OpenCap — read the log, pick the timestamps,
call the deterministic cut (free on every tier, stream-copy, no re-encode):

```bash
opencap events list "$SESSION" --summary-only --json \
  | jq -r '.[] | select(.type=="error") | "\(.ts) \(.summary)"'

opencap trim "$SESSION" --start $((TS-15000)) --end $((TS+10000)) \
  --name "PR #$PR — <defect>" --save-as-copy --json | jq -r '.share_url'
```

Post the clip **in addition to** the full recording, never instead of it — the full run is the
evidence, the clip is the courtesy.

---

## Command reference

Only what these skills use. Full docs: <https://opencap.dev/docs/cli>.

| Command | Notes |
|---|---|
| `opencap config doctor` | signing · **screen-recording permission** · network · creds |
| `opencap whoami` | exit 3 → run `opencap login` |
| `opencap windows list --json` | `[{id, title}]`; includes menubar items |
| `opencap record status --json` | `{active, session_id, duration_ms, event_count}` |
| `opencap record start --task "…" --window <id> --json` | `{session_id}`; daemonizes, returns at once |
| `opencap event marker "<label>" --tag <t>` | shortcut for a `session.marker` event |
| `opencap event '<json>'` | full event; `{type, summary, tags?, data?}` |
| `opencap record stop --json` | `{share_url}`; blocks on upload |
| `opencap record discard` | stop without uploading |
| `opencap events list <id> --summary-only --json` | for trimming |
| `opencap trim <id> --start <ms> --end <ms> --save-as-copy --json` | `{share_url}` |
| `opencap billing usage` | plan + recording count |

Exit codes: `0` ok · `1` user error · `2` system · `3` auth · `4` not found.
`OPENCAP_TOKEN` overrides `~/.opencap/credentials` (useful headless); `OPENCAP_API` overrides the
server URL.
