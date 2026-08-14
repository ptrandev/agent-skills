# AskUserQuestion Format

Load this file only when `/gemini` needs to ask the user a question (the
no-arguments auto-detect branch in Step 1).

## Tool resolution (read first)

"AskUserQuestion" can resolve to two tools at runtime: the **host MCP variant**
(e.g. `mcp__conductor__AskUserQuestion`, which appears in your tool list when the
host registers it) or the **native** Claude Code tool.

**Rule:** Use the `mcp__*__AskUserQuestion` variant when one is in your tool
list. A host can disable the native AskUserQuestion via
`--disallowedTools AskUserQuestion` (Conductor does, by default) and route
through its MCP variant. Calling native there silently fails.

**Fallback when neither variant is callable:** output the brief as prose and
stop. **Never silently auto-decide.**

## Format

Send every AskUserQuestion as a decision brief in a tool_use call, not as prose.

```
D<N>: <one-line question title>
Project/branch/task: <1 short grounding sentence>
ELI10: <plain English a 16-year-old could follow, 2-4 sentences, name the stakes>
Stakes if we pick wrong: <one sentence on what breaks, what user sees, what's lost>
Recommendation: <choice> because <one-line reason>
Completeness: A=X/10, B=Y/10   (or: Note: options differ in kind, not coverage, so no completeness score)
Pros / cons:
A) <option label> (recommended)
  ✅ <pro: concrete, observable, ≥40 chars>
  ❌ <con: honest, ≥40 chars>
B) <option label>
  ✅ <pro>
  ❌ <con>
Net: <one-line synthesis of what you're actually trading off>
```

Number the first question `D1`, then increment for each next question.

- Completeness: use `N/10` when options differ in coverage; otherwise "differ in kind" note.
- Min 2 ✅ and 1 ❌ per option, each ≥40 chars. Hard-stop escape: `✅ No cons. This is a hard-stop choice`.
- Add an effort label when the options differ in time cost: `(human: ~X days / CC: ~Y min)`.

## Self-check before emitting

- [ ] D<N> header present
- [ ] ELI10 + stakes line present
- [ ] Recommendation line with concrete reason
- [ ] Completeness scored OR kind-note present
- [ ] Every option ≥2 ✅ and ≥1 ❌, each ≥40 chars
- [ ] `(recommended)` on one option
- [ ] Net line closes the decision
- [ ] Calling the tool, not writing prose
