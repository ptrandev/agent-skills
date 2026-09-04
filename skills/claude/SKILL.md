---
name: claude
description: >
  Calls the Claude Code CLI for an independent review, adversarial challenge, or
  codebase consultation. Use when the user asks Claude for a second opinion or
  when another skill needs an independent Claude reviewer from Codex.
---

# Claude

Run Claude in a fresh, non-interactive, read-only process. Do not pass this
conversation, implementation rationale, or the author's identity unless the user
explicitly asks for that context.

## Input

Treat the text accompanying the skill invocation as the input:

| Input | Mode |
|---|---|
| `review [focus]` | Review the current diff. |
| `challenge [focus]` | Break the current diff and its assumptions. |
| Any other text | Consult Claude about that question. |

Use `review` when another skill requests an independent Claude reviewer.

## Run

1. Confirm `claude` exists with `command -v claude`.
   Stop with the install/auth error when the command is unavailable or the CLI
   reports that authentication is required.
2. Create a temporary prompt file outside the repository. Include the selected
   role, exact scope, evidence requirements, and output contract.
3. Locate this skill's directory from the path used to load this `SKILL.md`.
4. Run `scripts/run-claude` from that directory:

   ```bash
   <claude-skill-dir>/scripts/run-claude \
     --repo "$(git rev-parse --show-toplevel)" \
     --prompt-file <temporary-prompt-file> \
     [--rubric <rubric-file>] \
     [--model <model>]
   ```

5. Treat timeout, empty output, or output that misses the requested contract as
   a failed reviewer. Report the failure instead of inventing findings.
6. Remove the temporary prompt file.

The runner disables Claude customizations and permits only repository reads and
read-only Git commands. Never weaken those controls for a review or challenge.

## Review contract

Tell Claude to inspect the diff itself and verify each finding against the
surrounding code. Require exactly one finding per line:

```text
SEVERITY | file:line | one-line finding | one-line proof
```

Allow `HIGH`, `MEDIUM`, and `LOW`. Require `CLEAN` as the only output when no
finding survives verification. Claude reviews only. It does not edit, commit,
push, post, or resolve anything.

When a rubric is supplied, pass its file path with `--rubric` and tell Claude to
read it in full before reviewing.

## Challenge contract

Ask Claude to attack assumptions, boundary conditions, failure recovery,
concurrency, security, and data-shape mismatches. Require the review contract
above so callers can adjudicate the output mechanically.

## Consult contract

Ask the user's question directly. Tell Claude to cite repository files and lines
for repository claims. Keep the process read-only.
