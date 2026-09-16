# Routine setup: the per-repo toolchain preflight

Owns the block every Routine setup script uses to install each repo's toolchain and prove it runs.
A Routine setup script is pasted into a web form as one self-contained blob, so it cannot read a
file at run time. **Copy this block into the script** and keep this file the one place it is edited.

Set `DEGRADE` once, above the block, to the sentence that skill uses when a repo is unusable:

| Skill | `DEGRADE` |
|---|---|
| `review-pr` | `review degrades to diff-only` |
| `babysit-prs` | `fixes degrade to triage-only` |
| `sync-prs` | `verification degrades` |

`review-pr` adds its own `re2` rebuild and workspace pre-build after the `codebase` branch, because
only its dynamic walkthrough needs them. Nothing else here differs per skill.

## The block

```bash
DEGRADE="${DEGRADE:-the run degrades}"

CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"
HYZL_DIR="${HYZL_DIR:-./neema-simple-hyzl}"
PGPT_DIR="${PGPT_DIR:-./pointsgpt}"

if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) ||
    echo "WARN: codebase install failed; $DEGRADE"
else
  echo "WARN: codebase clone not found; $DEGRADE"
fi

if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) ||
    echo "WARN: aicc-queues compile failed; $DEGRADE"
else
  echo "WARN: aicc-queues clone not found; $DEGRADE"
fi

if [ -f "$HYZL_DIR/deno.json" ]; then
  if ! command -v deno >/dev/null; then
    curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y --no-modify-path ||
      echo "WARN: deno install failed"
  fi
  ( cd "$HYZL_DIR/web" && npm ci ) ||
    echo "WARN: neema-simple-hyzl web install failed; web/ checks unavailable"
  ( cd "$HYZL_DIR/voice-control" && npm ci ) ||
    echo "WARN: neema-simple-hyzl voice-control install failed; its checks unavailable"
  ( cd "$HYZL_DIR" && deno task check && deno task lint && deno task test ) ||
    echo "WARN: neema-simple-hyzl checks failed; $DEGRADE"
else
  echo "WARN: neema-simple-hyzl clone not found; $DEGRADE"
fi

if [ -f "$PGPT_DIR/admin-site/check.js" ]; then
  # No package.json and no install step: deno and node are the whole toolchain.
  ( cd "$PGPT_DIR" && deno check supabase/functions ) ||
    echo "WARN: pointsgpt deno check failed; $DEGRADE"
  ( cd "$PGPT_DIR/admin-site" && node check.js ) ||
    echo "WARN: pointsgpt admin-site check failed; $DEGRADE"
else
  echo "WARN: pointsgpt clone not found; $DEGRADE"
fi
```

The runner stops on an unhandled non-zero command, so **every step above stays guarded**. Replace
the four clone paths when a Routine checks out into different directory names.

The `deno` install is only in the `neema-simple-hyzl` branch because that branch runs first. A
Routine that checks out `pointsgpt` but not `neema-simple-hyzl` must move the install ahead of both.
