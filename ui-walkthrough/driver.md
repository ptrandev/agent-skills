# Driver: getting a browser

Owns driver selection, the `browse` build probe, the headed Playwright fallback, the cloud launch
arguments, and the capacity gate. `SKILL.md` Phase 0 keeps the pointer here. Read this before
driving anything. Recording is [opencap.md](opencap.md)'s; this file only guarantees a window
exists for it to scope to.

**Driver** (in preference order, first available wins):

| | Local Mac | Headless routine |
|---|---|---|
| Browser | `browse` binary (`$ROOT/.claude/skills/gstack/browse/dist/browse`, else `~/.claude/skills/gstack/browse/dist/browse`) | headless Playwright/Chromium |
| Viewport | `browse viewport WxH` | `page.setViewportSize` |
| Screenshot | `browse prettyscreenshot`, else `browse screenshot` | `page.screenshot({fullPage:true})` |
| Video | OpenCap **scoped to the browser window**, either role, needs a HEADED browser | none (skip, never block) |
| Credentials | `dev-credentials.md` | **env vars only** (the file is gitignored, so it is absent) |

**Every `browse` call that touches the daemon carries `$B_ENV`**, the lane's
`BROWSE_STATE_FILE` + `BROWSE_PORT` prefix from [concurrency.md](concurrency.md). Without it two
concurrent runs drive one browser. `--help` is the one exception below.

**Probe the `browse` build, do not assume this table.** Some builds are **headless-only**: no
`--headed`, no `prettyscreenshot` (verified 2026-08-05: that build's `--help` advertises only
`screenshot`, and its banner reads "Fast **headless** browser for AI coding agents").

```bash
BROWSE_HELP=$("$B" --help 2>&1)      # --help needs no daemon, so it needs no $B_ENV
case "$BROWSE_HELP" in *prettyscreenshot*) SHOT=prettyscreenshot;; *) SHOT=screenshot;; esac
case "$BROWSE_HELP" in *--headed*) BROWSE_CAN_HEAD=1;; *) BROWSE_CAN_HEAD=0;; esac
```

**`BROWSE_CAN_HEAD=0` swaps the driver, it never drops the video.** One headed Playwright launch
gives what `browse` cannot: a real OS window for OpenCap to scope to, a native `.webm` even when
OpenCap is unavailable, and `storageState` auth that **does** restore the Firebase session
(Playwright replays `origins[].indexedDB`; `browse cookie-import` cannot, see [stack.md](stack.md)),
so the harness's own `e2e/.auth/*.json` replaces form login.

```js
const browser = await chromium.launch({ headless: false, args: ['--window-size=1460,1000'] })
const context = await browser.newContext({
  storageState: `${WORKDIR}/apps/agents-portal/e2e/.auth/user.json`,  // set by the harness's setup project
  viewport: { width: 1440, height: 900 },        // matches --window-size: the video frames the page
  recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },   // native .webm fallback
})
```

- **The driver script must live INSIDE the workspace.** Node resolves ESM `node_modules` from the
  *script's own path*, not cwd, so a driver written to `$SCRATCH` throws
  `ERR_MODULE_NOT_FOUND: Cannot find package '@playwright/test'`. Write it next to the app
  (`apps/agents-portal/uiw-drive.mjs`), untracked, and delete it in teardown with the hold spec.
  Phase 9's `git status --porcelain` check catches a forgotten one.
- **Cloud Chromium launch requires `args: ['--ssl-version-max=tls1.2']`.** Verified in `/review-pr`
  Phase 6: a TLS-terminating middlebox on the cloud egress path resets Chromium's TLS 1.3
  ClientHello, so every HTTPS request fails `net::ERR_CONNECTION_RESET` and the app hangs on its
  splash (`_app` can't load `js.stripe.com`, so the login form never mounts). TLS 1.2 shrinks the
  ClientHello enough to pass; cert-ignore and proxy flags do not help. Driving the repo's own
  harness, inject the arg into `use.launchOptions.args` **in the ephemeral checkout only**.
- **Cloud browser build: probe for a preinstalled Chromium before concluding "no browser".** A
  routine sandbox ships its own Playwright browsers and **forbids `playwright install`**, so the
  bundled build routinely does not match the repo's `@playwright/test` pin. A bare
  `chromium.launch()` then hard-fails on the missing revision (verified 2026-08-13: pin 1.58.2 wants
  `chromium_headless_shell-1208`, the sandbox shipped 1194). This is **not** a reason to set
  `CAN_LIVE_HEADLESS=false`. Pass the sandbox's own binary and it launches:

  ```bash
  PW_EXEC=$(ls -d /opt/pw-browsers/chromium* /root/.cache/ms-playwright/chromium* 2>/dev/null | head -1)
  ```

  ```js
  chromium.launch({ executablePath: PW_EXEC, args: ['--ssl-version-max=tls1.2'] })
  ```

  The cost is real and belongs in the report: the **repo's own E2E specs cannot execute** on a
  mismatched build, so a run there can judge "this UI PR is missing E2E specs" by reading the diff
  but can never run them. That is a neutral note, never a finding (invariant 2).
- **Capacity gate: skip if total RAM < \~8 GB** (Next.js + JVM Firebase emulators + API). Note it
  and exit: a constrained runtime produces flaky evidence, which is worse than none.

```bash
# NOTE: no `$1`/`$2` anywhere in this file. The skill loader substitutes positional
# args into the body, so an awk `$1` becomes a literal CLI flag at runtime. Use shell
# arithmetic instead of awk field refs, and inline commands instead of shell functions.
if MEM_BYTES=$(sysctl -n hw.memsize 2>/dev/null); then TOTAL_MB=$(( MEM_BYTES / 1048576 ))
else TOTAL_MB=$(( $(grep -o '[0-9]\+' /proc/meminfo | head -1) / 1024 )); fi   # MemTotal is line 1
[ "${TOTAL_MB:-0}" -ge 8000 ] || { echo "SKIP: ${TOTAL_MB}MB RAM < 8GB needed"; exit 0; }
```
