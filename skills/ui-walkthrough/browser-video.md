# Browser page video (Windows)

This file owns the Windows video driver: the capability probe, the recorded context, the WebM to
H.264 MP4 conversion, validation, file rules, publication, and the `Video:` line. Apply it when
`HOST_PLATFORM=windows`. [scripts/browser-video.mjs](scripts/browser-video.mjs) does the probe,
conversion, and validation. Each of its modes prints one JSON object on stdout. It exits 1 on a
failed gate or a failed run, and 2 on an unknown mode.

## Scope

The recording is the **browser page only**: Playwright's `recordVideo` output of one context.

- **Never capture the desktop, another window, audio, or a microphone.**
- Call it a browser page recording in every report. **Never call it a screen recording.**
- There is no OpenCap session. A browser video has no share page, no marker index, and no trim.

## Two hosts, two requirement lists

| Work | Host | Requirements |
|---|---|---|
| E2E stack, and the Playwright driver that walks the journey | WSL2 | `windows.md` *Preflight* |
| `browser-video.mjs` probe, transcode, and validate | native Windows | Node 24, a native `playwright` or `playwright-core`, a Playwright Chromium, MediaRecorder MP4 support |

**Run `browser-video.mjs` with native Windows `node`, never inside WSL.** Its `route` mode reports no
driver on Linux, and the MP4 encoder was verified only in native Windows Chromium. Do not add the
native requirements to the WSL preflight, and do not add WSL requirements to this probe.

## Phase 0: probe

Set `$UiWalkthroughDir` to the directory of the loaded `ui-walkthrough` skill, the one that holds
this file. Set `$PlaywrightFrom` to `$CloneWin`. The script then tries `UIW_PLAYWRIGHT_FROM`, the
current directory, and the home directory, in that order.

```powershell
$BrowserVideo = Join-Path $UiWalkthroughDir 'scripts/browser-video.mjs'
$Probe = node $BrowserVideo probe --playwright-from $PlaywrightFrom | Out-String | ConvertFrom-Json
$ProbeExit = $LASTEXITCODE
```

**Do not install Playwright or a browser.** If Playwright cannot find its browser, set
`PLAYWRIGHT_BROWSERS_PATH` in this process only, to the existing Playwright browser cache.

| Probe result | `CAN_VIDEO` | Readiness line |
|---|---|---|
| exit 0, `mp4Supported: true` | 1 | `video: browser page ✓ (Chromium <chromiumVersion>, <mp4Mime>)` |
| `reason` starts `Playwright is not resolvable` | 0 | `video: ✗ (Playwright not resolvable from native Windows)` |
| `reason` starts `Chromium did not launch` | 0 | `video: ✗ (Chromium did not launch)` |
| exit 1, `mp4Supported: false` | 0 | `video: ✗ (no MP4 encoder in this Chromium)` |
| `--no-video` | 0 | `video: ✗ (--no-video)` |

Quote the script's `reason` in the neutral note. **Never swallow it.** Set `VIDEO_DRIVER=browser`
when `CAN_VIDEO=1`.

## Phase 5c and 5d: record the journey

[opencap.md](opencap.md) *What the recording is*, *Authoring the journey*, and *Markers* own the
route, the dwell, the cursor, and the beat names for both drivers. Skip every `opencap` command in
them. Translate each `$B` call into the matching Playwright call.

Create one new directory per take in PowerShell, and pass its WSL path to the driver:

```powershell
$Stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$VideoWin = Join-Path $ScratchWin "video-$PR-$ShortHead-$Stamp"
New-Item -ItemType Directory -Path $VideoWin -ErrorAction Stop | Out-Null
$VideoWsl = (wsl.exe -e wslpath -a $VideoWin).Trim()
```

Run `uiw-drive.mjs` with `Invoke-UiwWsl -Env ($UiwEnv + @{ UIW_VIDEO_DIR = $VideoWsl })`
([windows.md](windows.md)). Then run these steps in that driver:

1. Finish Phase 5a and 5b. Close their context.
2. Log in through an unrecorded context. Keep its state in memory:
   `const state = await context.storageState({ indexedDB: true })`. The Firebase session lives in
   IndexedDB, so a state without it opens logged out.
3. Open the recorded context from that state, at 1440×900, and never resize it:

   ```js
   const recorded = await browser.newContext({
     storageState: state,                                  // object from step 2, never a file
     viewport: { width: 1440, height: 900 },
     recordVideo: { dir: process.env.UIW_VIDEO_DIR, size: { width: 1440, height: 900 } },
   })
   ```

4. Load the entry page and make sure that it shows the logged-in app. If it shows a login form,
   close the recorded context and set `CAN_VIDEO=0`. **Never log in on camera.**
5. Walk the journey and the Phase 5d claims.
6. Replace each OpenCap marker with one JSON line in `$UIW_VIDEO_DIR/beats.jsonl`. Count `ms` from
   the context open. Record the element the beat waited for and any Phase 5d assertion result:
   `{"beat": 3, "label": "3. Save the new retry window", "ms": 8120, "waitedFor": "[data-testid=retry-saved]", "assert": null}`.
7. Replace each OpenCap `error` event with a line that adds `"type": "error"` and the summary.
8. Close the page, then the recorded context. Playwright finishes the WebM only on context close.

**Never record the login, the matrix, or the detectors.** A failed take can be recorded again once,
in a new take directory, under the paid-action rule in [capture.md](capture.md) 5c. Keep the
failed take's files.

## Convert and validate (native Windows)

`transcode` and `validate` play the clip in real time, and each stops at `--max-ms` (default
600000). If the journey runs longer than 9 minutes, pass `--max-ms` above its length to both.

```powershell
$VideoOk = $false
$VideoNote = ''
$Webm = @(Get-ChildItem -LiteralPath $VideoWin -Filter '*.webm')
$Mp4 = Join-Path $VideoWin 'journey.mp4'
if ($Webm.Count -ne 1) {
  $VideoNote = "expected one WebM in the take directory, found $($Webm.Count)"
} else {
  node $BrowserVideo transcode --in $Webm[0].FullName --out $Mp4 --playwright-from $PlaywrightFrom |
    Out-File -NoClobber -Encoding utf8 -ErrorAction Stop -LiteralPath (Join-Path $VideoWin 'transcode.json')
  if ($LASTEXITCODE -ne 0) { $VideoNote = 'MP4 conversion failed (read transcode.json reason)' }
}
$BeatsLog = Join-Path $VideoWin 'beats.jsonl'
if (-not $VideoNote -and -not (Test-Path -LiteralPath $BeatsLog)) { $VideoNote = 'beats.jsonl is missing' }
if (-not $VideoNote) {
  $Beats = @(Get-Content -LiteralPath $BeatsLog | Where-Object { $_ -notmatch '"type"\s*:\s*"error"' }).Count
  if ($Beats -lt 1) { $VideoNote = 'beats.jsonl has no beat' }
}
if (-not $VideoNote) {
  $Gates = @('--expect-width', 1440, '--expect-height', 900, '--min-moving-pairs', $Beats,
    '--playwright-from', $PlaywrightFrom)
  $WebmJson = "$($Webm[0].FullName).validation.json"
  node $BrowserVideo validate --file $Webm[0].FullName --frame "$($Webm[0].FullName).frame.png" @Gates |
    Out-File -NoClobber -Encoding utf8 -ErrorAction Stop -LiteralPath $WebmJson
  if ($LASTEXITCODE -ne 0) { $VideoNote = 'WebM validation failed' }
}
if (-not $VideoNote) {
  # The MP4 must match the WebM's measured duration within 1 second.
  $WebmSeconds = (Get-Content -Raw -LiteralPath $WebmJson | ConvertFrom-Json).validation.durationSeconds
  node $BrowserVideo validate --file $Mp4 --frame "$Mp4.frame.png" --expect-duration $WebmSeconds @Gates |
    Out-File -NoClobber -Encoding utf8 -ErrorAction Stop -LiteralPath "$Mp4.validation.json"
  if ($LASTEXITCODE -ne 0) { $VideoNote = 'MP4 validation failed' } else { $VideoOk = $true }
}
```

A video step never stops the walkthrough. When `$VideoOk` is false, post the screenshots without
the video, and put `$VideoNote` and the failed `reasons` in the neutral note.

The video is valid only when every row holds:

| Check | Pass condition | Field |
|---|---|---|
| Container | an MP4 with an H.264 sample entry | `transcode.json`: `output.isMp4` is true, `output.videoCodec` is `h264` |
| Full length | the encode reached the end of the WebM | `transcode.json`: `sourceReachedEnd` is true |
| Gates | dimensions, duration, playback to the end, black frames, and motion pass for both clips | `*.validation.json`: `checks.pass` is true |
| Duration match | the MP4 is within 1 second of the WebM | the MP4 run's `--expect-duration` gate |
| Motion | in total, at least as many changed frame pairs as beats | `validation.frames.movingFramePairs`, gated by `--min-moving-pairs` |
| Interaction | every beat line has its `waitedFor`, and no Phase 5d `assert` is false without an `error` line | `beats.jsonl` |
| Readable text | text in the frame is legible at the recorded size | read each `.frame.png` image |

## File rules

- **Never delete, rename, or overwrite the WebM.** It is the original recording.
- Write each take into its own new take directory. The script refuses an existing output path.
  **Never delete an old file to make room.**
- A complete but rejected MP4 stays beside the WebM for diagnosis. **Never publish it.** The script
  removes one file only: its own reserved output, while that output holds no complete encoder output.
- Keep the WebM, the MP4, the frames, `beats.jsonl`, and the JSON files together with the head SHA.

## Publication

Phase 7 still owns the screenshots. Pick the video destination from this table:

| Destination | Rule |
|---|---|
| `Atllas-Inc/pointsgpt` | The checkout's `AGENTS.md` Evidence section owns the destinations. Upload the MP4 only where it allows video. **Never create an evidence Git ref.** |
| Private Library | Only after the user approves the transfer. Follow the installed Library skill or tool for the full flow. |
| Any other case | Keep the MP4 local. **Do not add it to a GitHub evidence ref**: that route in [evidence-hosting.md](evidence-hosting.md) publishes screenshots only. |

For a Library transfer, inspect every upload result before you claim success. Read the bytes back,
and compare their SHA-256 with the local file. **Never write credentials, and never construct an
upload or share URL.** Keep the local files until the readback passes.

## Report

The `Video:` line never says "captured" without a file or a URL. Post the file name only. Keep the
absolute path in the local report.

```
Video: browser page MP4, local (journey.mp4, sha256 <first 12 hex>, 1440x900, 94.2 s, all 8 surfaces, 9 beats, 1 jump)
Video: <approved destination URL> (browser page MP4, desktop journey, all 8 surfaces, 9 beats, 1 jump)
Video: skipped (no MP4 encoder in this Chromium)
Video: invalid (Motion: only 2 frame pairs changed, expected at least 9), WebM and MP4 kept locally
```

In embedded mode, set `video.driver` to `browser`, `video.file` to the MP4 path, and `video.sha256`.
Set `video.url` only when an approved destination returned one. A browser video has no `sessionId`.

## Teardown

Close the recorded context on every abort path, so that Playwright finishes the WebM. Keep the
partial WebM and name it in the report. Nothing remote needs a discard.

## Capability smoke

Run the smoke only when a person asks for a capability check. It records a synthetic local page,
converts it, and validates both clips. **Never post it as walkthrough evidence.**

```powershell
node $BrowserVideo smoke --out-dir $NewDir --playwright-from $PlaywrightFrom
```

The smoke claims `$NewDir` atomically and refuses a directory that exists, empty or not.

Exit 0 means that this host can record, convert to H.264 MP4, and play both clips to their end.
