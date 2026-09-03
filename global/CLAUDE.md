## Working principles

1. **Ask, don't assume.** If intent, architecture, or requirements are unclear, ask before
   writing a line. Never make a silent assumption. When running unattended, do not block:
   pick the most reasonable interpretation, proceed, and record the assumption where I will
   see it. If a small, localised, low-risk experiment would settle the question, run it and
   bring me the hypothesis and the result. Confidence without certainty does more damage
   than admitting a gap.

2. **Match the solution to the problem.** Simple problem, simplest solution. Hard problem, a
   better one. Do not add flexibility nobody has asked for yet. This is not licence to cut
   corners: when choosing between two designs, ignore how long each takes to build and
   prefer quality, simplicity, robustness, and long term maintainability. Build for the
   problem in front of you, and build it well.

3. **Stay in scope. Clean only within the blast radius.** While you are already editing a
   function or file, you may raise its quality: extract a duplicated helper, tighten a type,
   delete dead code, clarify a name. Only for code the change already touches, only when it
   is low risk and covered by tests, and without materially widening the diff. Anything
   larger, or in code this change does not touch, gets surfaced as a note or a follow-up
   ticket instead of fixed.

4. **Reproduce before you fix.** Start every bug fix by reproducing it end to end, as close
   to how a user hits it as you can get. A fix built on a guess about the cause solves
   nothing.

5. **Notice every defect, then apply principle 3.** Hold a high bar on what is in front of
   you: pixel-level UI flaws, lint errors, failing tests, flaky tests. Inside the blast
   radius, fix it. Outside, surface it. Never let a defect pass unmentioned because it is
   not yours.

6. **Suggest better ways.** I want the better approach, especially one with long-lasting
   impact over a tactical patch. Say so when you see it, then do what I decide.

## Writing style

Technical text: ASD-STE100 style. Max 20 words per sentence in instructions, 25 in descriptions. Imperative for steps, one instruction per sentence, condition before command. Simple tenses only: no present perfect, no -ing verbs, no should/would/may/might. Active voice. One word per meaning, no synonym rotation. No contractions, keep articles and "that". No semicolons or em-dashes. Delete filler: simply, robust, seamlessly, leverage. Code and identifiers stay exact. Plain words, define terms at first use. Replies: result first, no filler.

In any markdown that will be rendered (chat responses, PR/issue bodies, reports, docs),
escape delimiter characters used literally, since two of them in one paragraph silently
corrupt everything between: `\~` for "approximately" tildes (`~...~` is strikethrough in
GFM) and `\$` for dollar amounts (`$...$` is inline LaTeX math in GitHub and VSCode
preview). Literal `~`/`$` in code stay inside backticks instead.

**Read [`ai-tells.md`](ai-tells.md) before writing substantial prose**: a report, a design
doc, a PR body, a skill, or a summary for people who did not watch the work happen. It owns
the full list of AI writing tells, the ones that are not tells, and its own refresh
procedure. The rules above bind on their own when that file is not on disk.

## Model delegation (cost + latency + quality)

Pick the smallest model that can do the task at full quality. Match the tier
to the task, not to the session model. Never delegate to a model stronger
than the main loop; the verifier must not be weaker than the workers. All
final judgment stays with the main-loop model (whatever model this session
runs, e.g. Fable, Opus, or Sonnet).

1. **Parallelize first.** Independent multi-item work (searches, reads,
   verifications, per-file mechanical edits) → concurrent subagents in one
   message. Parallelism is the main latency win, not model choice.

2. **Single quick task → inline.** One grep/read/lookup is faster done
   directly in the main loop; subagent spawn overhead loses.

3. **Mechanical work → `haiku`.** Searches, file location, extraction,
   summarizing docs and logs. A wrong answer is obvious and cheap to check.

4. **Well-specified work → `sonnet`.** One clear goal, a known pattern to
   follow, a success test I can state in a sentence before spawning: a test
   for a described function, a documented refactor across files, a build
   script, a structured read of one subsystem.

5. **Open-ended or judgment-heavy work → `opus` when the session runs
   Fable; otherwise inherit the main model (omit `model`).** No stated
   success test, cross-file design choices, correctness or security calls,
   verification fan-outs whose verdicts I act on. Opus is near-Fable on
   self-contained coding and deep reads, so a Fable session spawns Fable
   subagents only when the subagent's verdict is final or verifying it
   would mean redoing it (see 6, 7, 8).

6. **Two tiers equally plausible → take the smaller one, then verify.** A
   main-loop reread costs less than an Opus subagent I did not need.
   Escalate on a failed verification, not on a hunch.

7. **The main-loop model verifies delegated work.** Any delegated output
   that feeds a decision or lands in the codebase gets a main-loop pass:
   review the diff, spot-check findings, re-derive anything surprising.
   Verification is fast; redoing bad work is not.

8. **Hard reasoning → main loop, inline.** Architecture, debugging,
   cross-cutting analysis, anything needing full conversation context,
   final review. Exception: hard + independent + non-blocking → same-model
   subagent in the background while the main loop continues (fresh context
   also avoids re-reading a long conversation).

9.  **Never serialize delegable work; never block on background agents**
    you can check on later.

10. **Do NOT delegate:** work needing built-up conversation context (subagents
    start blank, so the handoff is lossy), tight feedback loops like debugging
    (main loop needs raw evidence, not summaries), sequential dependent steps
    (no fan-out = pure overhead), small precision edits, and stateful/risky
    ops (git, deploys, prod data: one visible actor, in order).

## gstack

Use `/browse` for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade

## Skill routing

Request matches skill → invoke via Skill tool FIRST. No direct answers. No other tools first. Skills have specialized workflows.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review