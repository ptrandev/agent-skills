# Target selection

Owns the environment probe, the attended probe, target resolution, every `dev` refusal, and the
`Stack:` line the comment carries. Read it at Phase 0, before [concurrency.md](concurrency.md).
Carry `$ENVIRONMENT`, `$ATTENDED`, and `$TARGET` out of it.

`neema-simple-hyzl` resolves to `fixtures` here and then follows
[hyzl-stack.md](hyzl-stack.md), which owns its `Stack:` line.

**The target is `e2e`.** Every role, every environment, attended or not. Nothing derives it and
nothing falls back to it. `dev` runs only when the invocation carries `--target=dev`, or the session
exports `UIW_TARGET=dev`, or `/full-send` sets `UIW_ALLOW_DEV=1` under its own escape hatch
(`full-send/evidence.md`).

The asymmetry that used to justify a `dev` default is gone: `e2e` seeds its own personas, holds a
port lane of its own ([concurrency.md](concurrency.md)), and leaves the operator's `:3000` dev
server alone. A `dev` walkthrough occupies the machine the operator is working on.

```bash
if [ "${UIW_HOST_PLATFORM:-}" = windows ] || [ "$(uname)" = Darwin ]; then
  ENVIRONMENT=local
else
  ENVIRONMENT=routine
fi

# Attended probe. `[ -t 0 ]` is NOT usable: Claude Code's Bash tool gives every command a non-TTY
# stdin, so a TTY test marks an attended local session unattended.
# Every caller running with no operator MUST export UIW_UNATTENDED=1: /loop, /schedule,
# `claude -p`, and the /review-pr routine all set it.
ATTENDED=1
if [ "${UIW_UNATTENDED:-0}" = 1 ] || [ -n "${CI:-}" ] || [ "$ENVIRONMENT" = routine ]; then ATTENDED=0; fi

[ "$NAME" = neema-simple-hyzl ] && TARGET=fixtures   # hyzl-stack.md owns it from here
TARGET=${TARGET:-e2e}                       # the only default, in every role and environment
if [ "${UIW_TARGET:-}" = dev ]; then TARGET=dev; fi   # session-wide operator opt-in
if [ "${ARG_TARGET:-}" = dev ]; then TARGET=dev; fi   # --target=dev typed on this invocation

if [ "$ROLE" = reviewer ] && [ "$TARGET" = dev ]; then
  echo "REFUSING --target=dev in reviewer mode (invariant 7). Using e2e."; TARGET=e2e
fi

if [ "$ENVIRONMENT" = routine ] && [ "$TARGET" = dev ]; then
  echo "REFUSING --target=dev off a local Mac (invariant 7). Using e2e."; TARGET=e2e
fi

# Unattended dev is refused outright, in EITHER role, and never downgraded to e2e:
# silently swapping environments would mislabel the evidence. UIW_ALLOW_DEV=1 is the single
# exception, set only by /full-send, which owns the conditions in full-send/evidence.md.
if [ "$ATTENDED" = 0 ] && [ "$TARGET" = dev ] && [ "${UIW_ALLOW_DEV:-0}" != 1 ]; then
  echo "SKIP: --target=dev in an unattended run fires real Stripe/Vapi/Twilio calls with nobody watching."
  exit 0
fi
```

**The posted comment always names the target**, so a reader can weigh the evidence:
`Stack: e2e (emulators, stubbed, seeded)` or
`Stack: local dev (real atllas-dev data, not reproducible)`.
