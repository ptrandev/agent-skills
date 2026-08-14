# OpenCap recording contract

The walkthrough video. Read this before touching `opencap` anywhere in this repo's skills. This
file is the single source of truth, and the CLI has three behaviors that silently produce a useless
recording if you guess.

**The one-line rule:** record the **browser window**, never the display, and record **one desktop
user journey**, never the capture matrix.

---

## What the recording is

A reviewer watching this should see the feature being used, not a test suite running.

The video is a **threaded journey**: one continuous route that starts at the app's normal entry
point, navigates to each changed surface **by clicking**, performs the action the PR changes, and
shows the result. Desktop width, start to finish. Markers are the beats of that route.

It is **not** the screenshot sweep. The sweep visits the same surface three times at three widths,
reloading between each, which is correct for evidence and unwatchable as a video. The two passes are
therefore separated in time: `SKILL.md` Phase 5a captures the matrix silently, Phase 5b runs the
detectors silently, and only Phase 5c records.

That ordering buys three things, and each is a reason not to re-merge the passes:

- The journey is authored **knowing where the defects are**, so it can route through them and drop an
  `error` marker at the exact moment one reproduces.
- The screenshots never contain the synthetic cursor or the dwell pauses that make the video
  watchable.
- Nothing that only exists to satisfy a video ever lands in the evidence.

### Desktop only, deliberately

**One recording, at 1440×900. Never tablet, never mobile, never a second recording.**

Responsive correctness is already proved better elsewhere. The matrix captures every surface at all
three widths (Phase 5a), and the detectors measure horizontal scroll, sub-44px touch targets, clipped
text, and zoom-blocking viewport meta at each of them (Phase 5b). A number beats a frame for that
question, and a screenshot beats a video.

What video adds is motion and sequencing, and three widths actively damage both:

- **The frame size is fixed at capture start.** A mobile leg inside a desktop recording renders as a
  375px column filling 26% of the frame. That is not what a phone user sees.
- **Viewport changes require a full reload** (`SKILL.md` Phase 5a), not a resize, so the transition
  between widths is a blank flash.
- **A user is on one device.** Cutting between widths mid-route is the capture matrix reappearing
  inside the artifact meant to replace it.

So the video answers "what is it like to use this", and the screenshots answer "is it built right at
every width". Do not merge the two questions back together.

---

## Why window-scoped, always

`opencap record start` with no target flag captures the **entire primary display**. These recordings
get posted to a PR, **including PRs you do not own**, so a display capture ships whatever else was on
screen (Slack, mail, another client's code, a password manager) to everyone with repo access. It also records the wrong thing:
`browse` is **headless** by default, so there is no on-screen browser in the frame at all. A headless
browser has no window to target either, which is the only reason this skill ever runs headed.

---

## Invariants

1. **Never fall back to display capture.** If the window id can't be resolved, if `--headed` isn't
   available, if anything at all is uncertain → **skip the video** with a neutral note. A missing
   video is a footnote. A published recording of someone's desktop is not recoverable.
2. **Never use `--pick`.** It's an interactive TTY picker. In an unattended run it either hangs or
   resolves to nothing.
3. **Never target the terminal.** ScreenCaptureKit deadlocks capturing the window that hosts the
   process that started it. Target Chromium, only ever Chromium.
4. **Never start a second recording.** One run produces one video. The active-session lock lives at
   `~/.opencap/active`, and `opencap event` appends to *the* active recording, so with two live
   sessions marker routing is undefined. If `record status` reports an active session, it isn't
   yours: skip with a note.
5. **Never record the matrix or the detectors.** They are Phase 5a and 5b, both silent. A recording
   that contains the sweep is the artifact this contract exists to stop producing.
6. **Start recording after login, never before.** The credential entry must not be in the video.
   This is free if you follow the sequence below, and unfixable afterwards.
7. **Never change viewport during a recording.** OpenCap fixes the frame size at capture start, so a
   mid-recording resize either letterboxes or crops. The journey is recorded at 1440×900, at that
   size from the first frame.
8. **Video never blocks and never fails a run.** Every `opencap` call is best-effort. Non-zero exit,
   empty output, missing binary → note it, continue the walkthrough, post the screenshots.
9. **Never leave an orphan session.** An abandoned recording holds the lock and burns a Free-tier
   slot (25 for the lifetime of the account). Discard it in the EXIT trap.

---

## Preflight: `CAN_VIDEO`

Video is available only when **all** of these hold. Probe them in Phase 0 and carry one boolean.

| Condition | Probe | Why |
|---|---|---|
| macOS | `[ "$(uname)" = Darwin ]` | OpenCap rides ScreenCaptureKit; Linux/Windows aren't shipped |
| Binary present | `command -v opencap` | n/a |
| Healthy install | `opencap config doctor` | Checks binary signing, **the macOS screen-recording permission**, network, credentials. The permission is a TCC grant. It cannot be granted from a script, so a `doctor` failure here is terminal for video on this run |
| Signed in | `opencap whoami` | Exit 3 = auth error → `opencap login` once, interactively |
| No live session | `opencap record status --json` reports inactive | Invariant 4 |
| Headed browser obtainable | see below | No window, no window capture |
| Local machine | `ENVIRONMENT=local` | A headless runtime has no window server, so there is nothing to capture. This is the only environment condition |
| Not `--no-video` | flag | n/a |

```bash
CAN_VIDEO=0
if [ "$(uname)" = Darwin ] && [ "$ENVIRONMENT" = local ] \
   && [ "${NO_VIDEO:-0}" = 0 ] && command -v opencap >/dev/null 2>&1 \
   && opencap config doctor >/dev/null 2>&1 \
   && ! opencap record status --json 2>/dev/null | grep -q '"active"[[:space:]]*:[[:space:]]*true'
then CAN_VIDEO=1; else echo "video: skipped (see neutral note)"; fi
```

### The role does not gate the video, and attendance does not either

**Both roles record on a local Mac.** A reviewer-mode video is the more useful of the two: it shows a
colleague's change being used, by someone who did not write it, which is the artifact a PR discussion
usually lacks. `/review-pr` Phase 6 calls this skill in reviewer mode, so its posted review carries
the link whenever the run is local.

**Attendance does not gate it.** Recording does not occupy the machine (see the focus note below), so
an unattended local `/loop` run records exactly like an attended one. `UIW_UNATTENDED=1` still
refuses `--target=dev` (`SKILL.md` Phase 0); it has no effect on video.

Two consequences of recording in reviewer mode, both already covered by rules above, both worth
naming because the target is someone else's PR:

- **The route runs against the sealed e2e stack** (invariant 7), so the journey walks seeded personas
  and stubbed externals. That is a weaker story than author-mode `dev` data, and it is still a real
  user walking the feature. The Coverage block names the stack, so a reader can weigh it.
- **Window scoping is now the only thing between the operator's desktop and a colleague's PR.**
  Invariant 1 and the gutter check are hard failures, never warnings. Uncertain window id, gutter over
  40px, no `--headed`: `CAN_VIDEO=0`, and the run posts screenshots.

### The headed-browser condition

`--headed` is a **daemon-startup** setting in `browse`. A daemon already running headless will not
serve a headed request; it refuses and tells you to `browse disconnect` first.

**Do not disconnect a daemon you did not start.** It may be holding the operator's logged-in
session, tabs, and cookies, and taking it out to get a nicer PR artifact is the same class of
mistake as killing a port squatter. The rule:

| Daemon state | Action |
|---|---|
| none running | start ours headed: `$B` calls carry `--headed`; we own it, we tear it down |
| running **headed** already | reuse it, record |
| running **headless** | `CAN_VIDEO=0`, neutral note: `video skipped: a headless browse daemon is already running (run 'browse disconnect' first to enable video)` |
| this `browse` build has **no `--headed` flag at all** | NOT `CAN_VIDEO=0`. Switch to the headed Playwright driver (`SKILL.md` Phase 0) and keep the video |

Two consequences of headed mode, both worth stating in the report:

- **`viewport --scale N` is unsupported headed**, so the retina hero shot is unavailable on a
  recorded run. The matrix already runs at scale 1; just don't add the hero shot.
- **The Chromium window takes focus once, when it launches.** After that it can be moved, covered,
  or sent to another Space with no effect on the recording. ScreenCaptureKit holds the window's
  offscreen surface, and Playwright drives over CDP rather than synthetic OS input, so the browser
  never needs focus again. A recorded run therefore **does not occupy the machine**: the operator
  keeps working, and a `/loop` recording at 2 AM produces the same video as an attended one.

The same CDP property is why the journey needs a **synthetic cursor**: no OS pointer ever moves, so
un-augmented clicks land as jump cuts. See *Authoring the journey*.

### The window is what gets captured, not the viewport

`viewport 1440x900` sets the **page** size. OpenCap captures the **window**. They must agree, or the
recording frames the page inside empty browser chrome.

The headed Playwright driver sets both at launch, and they already match: `--window-size=1460,1000`
against a 1440×900 viewport is a \~20px chrome allowance (`SKILL.md` Phase 0). A reused `browse`
daemon is whatever size the operator left it. Measure the gutter once, after the viewport is set and
before `record start`:

```bash
GUTTER=$($B js 'window.outerWidth - window.innerWidth')
[ "${GUTTER:-999}" -le 40 ] || { CAN_VIDEO=0
  echo "video: skipped: window is ${GUTTER}px wider than the page, frame would be mostly chrome"; }
```

A gutter within 40px is browser chrome and is fine. Never resize a window this run did not open.

### Quota and duration

```bash
opencap billing usage      # Plan: free | Recordings: 3 / 25
```

| Plan | Per recording | Count |
|---|---|---|
| Free | **5 minutes** | 25 for the account's lifetime |
| Pro | 60 minutes | unlimited |
| Team | unlimited | unlimited |

A journey is **much** shorter than the old three-viewport sweep. Eight surfaces at the dwell budget
below runs roughly 90 to 150 seconds, so a normal run fits inside the Free tier's 5 minutes with room
to spare. Truncation stops being the routine case. If it happens, it means the dwell budget was
exceeded or the 8-surface cap was not applied, and both are bugs in the run rather than facts about
the tier.

The binding Free-tier constraint is now the **lifetime count**, not the per-recording length: one
recording per run is 25 runs for the account. That is the reason invariant 4 is absolute. OpenCap
warns at 80% of a limit and pauses new recordings at 100%; a paused start is just another
`CAN_VIDEO=0` path.

---

## Resolving the window id

Deterministic, no guessing. `opencap windows list` returns every capturable window, and on a real
desktop that includes several Chromium windows plus menubar items (`Battery`, `Clock`, `Dock`), so
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
[ -n "$WIN" ] || { CAN_VIDEO=0; echo "video: skipped: could not resolve the browser window id"; }
```

The id is stable for the window's lifetime, so the next navigation resetting the title is fine.
Resolve once, before recording starts.

If the installed CLI predates `--json` on `windows list`, parse the two-column `id  title` output
instead. **Do not** drop the `--window` flag to make the command succeed (invariant 1).

---

## The sequence

Order is load-bearing. Each step exists because doing it later breaks something.

```bash
# 0. Phase 5a and 5b have already run, silently: the screenshot matrix is captured and the
#    detectors have fired. You now know which surfaces have defects and which states show them.

# 1. The browser is logged in.                            ← credentials stay out of the video
# 2. Desktop, and it does not change again until the recording stops (invariant 7).
$B viewport 1440x900

# 3. Navigate to the journey's ENTRY point and let it settle. This frame is the video's first.
$B goto "$BASE_URL/"
$B wait --networkidle

# 4. Check the gutter, resolve the window id (both above), then inject the cursor.

# 5. Start recording. Returns immediately; capture daemonizes.
#    ⚠ `record start` takes NO --json (verified against opencap 0.1.3; it is the ONLY subcommand
#    in the reference table below that lacks it). Passing --json makes the CLI exit 1 with
#    "error: unexpected argument '--json' found" and print NOTHING to stdout, so a best-effort
#    wrapper reads it as "capture unavailable" and silently skips the video. Parse the plain-text
#    output, which looks like:  recording started / session: <ULID> / pid: … / log: …
START_OUT=$(opencap record start \
              --task "PR #$PR: $PR_TITLE (walkthrough)" \
              --window "$WIN" 2>&1) || CAN_VIDEO=0
SESSION=$(printf '%s' "$START_OUT" | sed -n 's/^[[:space:]]*session:[[:space:]]*//p' | head -1)
[ -n "$SESSION" ] || CAN_VIDEO=0

# 6. Walk the journey, one marker per beat (below).

# 7. Stop. Blocks until the mp4 is uploaded and the short code is minted.
VIDEO_URL=$(opencap record stop --json 2>/dev/null | jq -r '.share_url')
```

Do **not** use `--display` or `--region`. `--region` is reserved and currently warns and falls back
to display capture, which invariant 1 forbids.

---

## Authoring the journey

The route is the deliverable. Three rules make it read as usage rather than automation.

### 1. Click, don't `goto`

`goto` teleports. A user clicks. Navigate between surfaces through the app's own nav and links, in
the order Phase 3 discovered them:

```bash
$B click 'nav a[href="/agents"]'
$B wait --networkidle
```

`goto` is allowed **only** for the entry point (step 3 above) and for a surface with no reachable
in-app link. Every `goto` after the first is a jump cut, so **count them and name them in the
report**: `journey: 6 beats, 1 jump (no nav link to /billing/invoices)`. A journey that is mostly
jumps is the old sweep wearing a costume, and it should say so rather than imply a route that
doesn't exist.

Dynamic routes keep Phase 3's rule: navigate to the parent list and click the first row. Never
construct an id.

### 2. Dwell, so a human can follow

Playwright at machine speed is unreadable. Two fixed budgets, applied by every beat:

| Pause | Value | After |
|---|---|---|
| `SETTLE_MS` | 800 | a navigation reaches `networkidle` |
| `BEAT_MS` | 500 | an interaction's result renders |

Eight surfaces with two interactions each is roughly 90 to 150 seconds at these numbers. If a run
would exceed 4 minutes, drop beats from the end rather than shortening the dwell. A fast video nobody
can follow is worth less than a short one they can.

### 3. Show a cursor

Playwright drives over CDP, not synthetic OS input, so the OS pointer never moves and clicks appear
as instant state changes. Inject a synthetic pointer after every navigation settles, and drive it to
each target before clicking:

```bash
# after every `wait --networkidle`, before any click on that page
$B js '(() => {
  if (window.__uiwCursor) return
  const d = document.createElement("div")
  d.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;"
    + "border-radius:50%;background:rgba(0,0,0,.55);border:2px solid #fff;pointer-events:none;"
    + "left:50%;top:50%;transition:left .35s cubic-bezier(.4,0,.2,1),top .35s cubic-bezier(.4,0,.2,1)"
  document.body.appendChild(d); window.__uiwCursor = d
  window.__uiwMoveTo = (x, y) => { d.style.left = x + "px"; d.style.top = y + "px" }
  window.__uiwTap = () => d.animate(
    [{transform:"scale(1)"},{transform:"scale(.6)"},{transform:"scale(1)"}], 200)
})()'

# then, per click
$B js "(() => { const r = document.querySelector('$SEL').getBoundingClientRect()
  window.__uiwMoveTo(r.left + r.width / 2, r.top + r.height / 2) })()"
sleep 0.4                                    # let the dot travel its 350ms transition
$B js 'window.__uiwTap()'
$B click "$SEL"
```

**This is a simulation, and it is confined to the video.** The overlay is injected in Phase 5c only,
after every screenshot in the matrix is already on disk, so no published still ever contains it. It
is a `pointer-events:none` div, so it cannot intercept a click or change what the page does. It does
not survive a navigation, which is why it is re-injected per page.

If injection fails on a surface (a strict CSP, a page that replaces `document.body`), continue
without it on that surface. A cursorless beat is a cosmetic loss, not a failure. Never retry into a
loop, and never let it delay the journey.

---

## Markers: the beats of the route

A marker is a timestamped entry in the recording's event log. On the share page they are a clickable
index: click one, the video seeks. Without them a reviewer gets an unlabeled screen capture and
closes the tab.

Markers are also the reason `record start` is worth doing at all rather than screenshotting alone,
so **emit them or turn the video off**. A marker-less recording is not the artifact this skill
claims to produce.

**Name them in user language, not matrix coordinates.** `"3. Save the new retry window"` is a beat.
`"agents · desktop 1440"` is a cell in a table, and it belongs to the pass that no longer records.

```bash
BEAT=$((BEAT + 1))
[ "$CAN_VIDEO" = 1 ] && opencap event marker "$BEAT. Open the agent's retry settings" \
  --tag "surface:/agents" >/dev/null 2>&1 || true
```

Emit inline, never from a shell function: see the `$1` note in `SKILL.md` Phase 0.

| Emit | When | Type |
|---|---|---|
| `marker "<n>. <what the user just did>"` | at each navigation and each interaction | `session.marker` |
| an `error` event | at the moment a Phase 5b defect **reproduces on screen** | `error` |

The error case is the highest-value one, and the new ordering is what makes it reliable. Phase 5b has
already fired, so the journey knows which surface and which state to route through, and the marker
lands on the frame that actually shows the defect:

```bash
opencap event "$(jq -nc --arg s "modal footer clips the Save button on /agents" \
  '{type:"error", summary:$s, tags:["detector","blocker"]}')" >/dev/null 2>&1 || true
```

`summary` is capped at 280 characters and is the field semantic trimming matches against, so write
it like a log line: what, where, which state.

**Route the journey through every Phase 5b blocker the desktop pass can reach.** Two kinds cannot be
reached and must not be faked: a blocker that only reproduces at 375 or 768 (the journey never leaves
desktop, invariant 7), and one on a surface outside the route. Both stay screenshot findings, which
is fine, because the screenshots are the evidence. Say in the report which blockers made it onto the
timeline and which did not.

---

## Teardown

```bash
# In the EXIT trap, before releasing the stack lock:
if [ "$CAN_VIDEO" = 1 ] && [ -z "${VIDEO_URL:-}" ]; then
  opencap record discard >/dev/null 2>&1 || true    # aborted run: don't upload, don't burn a slot
fi
```

`record discard` stops without uploading. Use it on **every** abort path: bail-out, stack death,
detector crash, interrupt. A completed run uses `record stop`; nothing else does.

If we started the headed daemon, `browse disconnect` it in the same trap. If we reused one, leave it.

---

## Reporting

Report the video the way the rest of this skill reports evidence, factually, including when it
didn't happen:

```
Video: https://opencap.dev/r/Bs_eYjKW  (desktop journey, 9 beats, 1 jump)
Video: skipped: headless browse daemon already running
Video: skipped: OpenCap screen-recording permission not granted (run `opencap config doctor`)
Video: truncated at 5:00 (Free tier), covers beats 1 to 6 of 9
```

Never write "video captured" without a URL, and never describe a display capture as a walkthrough.

**Never let the video's desktop scope imply desktop-only coverage.** The same report carries the
matrix, which walked every viewport. Where the video line sits next to a coverage block, that block
names the viewports (`SKILL.md` Phase 8), so a reader can see the video is one slice of a wider pass.

---

## Optional: trim to the defect

When the run found a blocker and the recording is long, a focused clip is a better PR artifact
than the full run. The reasoning happens here, not in OpenCap. Read the log, pick the timestamps,
call the deterministic cut (free on every tier, stream-copy, no re-encode):

```bash
opencap events list "$SESSION" --summary-only --json \
  | jq -r '.[] | select(.type=="error") | "\(.ts) \(.summary)"'

opencap trim "$SESSION" --start $((TS-15000)) --end $((TS+10000)) \
  --name "PR #$PR: <defect>" --save-as-copy --json | jq -r '.share_url'
```

Post the clip **in addition to** the full recording, never instead of it. The full run is the
evidence, the clip is the courtesy.

A journey is short enough that this is rarely needed. Reach for it when one defect matters much more
than the rest of the route, not by default.

---

## Command reference

Only what these skills use. Full docs: <https://opencap.dev/docs/cli>. Flags below re-verified
against **opencap 0.1.3** (2026-08-05) by running each `--help`; treat them as version-pinned facts,
not guesses, and re-verify after an upgrade.

**Never swallow the CLI's stderr.** Every call here is best-effort, so the natural wrapper is
`try { execFileSync(...) } catch { return null }`, which turns a one-word flag error into an
indistinguishable "video unavailable". Capture `e.stderr` into the neutral note. A whole capture pass
was lost to this: `config doctor` reported every subsystem healthy while the only actual problem was
an `--unexpected argument` on `record start`.

| Command | Notes |
|---|---|
| `opencap config doctor` | signing · **screen-recording permission** · network · creds |
| `opencap whoami` | exit 3 → run `opencap login` |
| `opencap windows list --json` | `[{id, title}]`; includes menubar items |
| `opencap record status --json` | `{active, session_id, duration_ms, event_count}` |
| `opencap record start --task "…" --window <id>` | **NO `--json`, the one exception in this table.** Daemonizes, returns at once; prints plain text (`session: <ULID>`). Passing `--json` exits 1 with "unexpected argument". |
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
