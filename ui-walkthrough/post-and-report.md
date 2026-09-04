# Phases 8 and 9: post, report, teardown

Owns the post payloads, both body templates, the local report, and the teardown checklist.
`SKILL.md` keeps the phase order and the pointer here. Read this at the start of Phase 8.

## Phase 8: post

**Re-check before posting** (invariant 10): re-read `draft` and `author`, and re-run the Phase 2
marker query. A concurrent routine can have posted since discovery, or the PR can have flipped to
draft. Either -> skip with a note. Every body posted here, both modes, is held to **Writing style**.

**Post through `GH_TRANSPORT`** ([../shared/github-transport.md](../shared/github-transport.md)).
Under `mcp` the payload below becomes a pending review, one add-comment call per entry, then a
submit carrying the `event`.

**Reviewer mode**: one review, inline-anchored:

```bash
gh api "repos/$OWNER/$NAME/pulls/$PR/reviews" --method POST --input "$SCRATCH/payload-$NAME-$PR.json"
# { commit_id, event: REQUEST_CHANGES|COMMENT, body, comments:[{path,line,side,body}] }
```

- `event`: `REQUEST_CHANGES` iff >= 1 BLOCKER. Otherwise `COMMENT`. **Never `APPROVE`** (invariant 5).
- Inline anchors: `side:"RIGHT"` + the new-file line, and the line **must be inside a diff hunk**
  or GitHub 422s. Pre-validate against `gh api .../pulls/$PR/files`. A finding outside the diff
  folds into the summary `body` as a `file:line` reference. On a residual 422 for one comment,
  retry it folded into the body rather than losing the whole review.
- Build the JSON with `jq -n`, never hand-quote bodies containing image markdown.
- **Clean run -> still post.** A `COMMENT` review whose body is the proof gallery. That is the
  "walkthrough was done" artifact, and it is the whole reason this runs on clean PRs.
- **The review `body` ends with the same `### Coverage` block as the author template below**,
  video line included. A local reviewer run records too, so a review that shows the link without
  the viewport line reads as desktop-only coverage on a colleague's PR.

**Author mode**: one comment (`gh pr comment`). The image row below is for **notable surfaces
only**, the ones Phase 7's priority list kept. Every other surface gets a linked line:

```markdown
## UI walkthrough: <n> surfaces × <viewports>

<!-- ui-walkthrough head=<sha> viewports=... personas=... -->

**What changed visually:** <2-3 lines>

### /<surface>   (notable surfaces only)
| desktop | tablet | mobile |
|---|---|---|
| ![](…/raw/<c>/01-agents-desktop.png) | ![](…) | ![](…) |

<states, if any>

### Other surfaces walked
- `/x` [desktop](…) [mobile](…) · no findings

### Self-caught issues
- **BLOCKER** `/agents` mobile: horizontal scroll, 41px overflow (detector output attached)

### Coverage
Personas: premium. Viewports: desktop, tablet, mobile.
Surfaces walked: 8 of 11, dropped `/x`, `/y`, `/z` (cap).
Components covered: 7 of 7 changed UI files proven on screen.
Images: 11 embedded, 13 linked (budget).
Stack: locally booted at <sha>, externally stubbed.
Video: <link> (desktop journey, all <n> surfaces, <b> beats). Screenshots cover all three viewports.
```

**The Coverage block always names the viewports, and always next to the video line.** The video is
desktop-only by design ([opencap.md](opencap.md)), so a reader who sees only the link otherwise
reads desktop-only coverage into a run that walked three widths.

**The Coverage block counts changed components, not only routes** (invariant 11). Name every
changed file whose mount probe never passed, with the reason and the last ladder rung tried:

```
Components covered: 6 of 7. NOT covered: `SmsConfigPanel.tsx` (the settings step needs a configured
campaign, the seeded draft renders the chat-flow builder; ladder rung 2 tried).
```

A reader must never have to infer component coverage from a route list. An uncovered changed
component is a MEDIUM in the findings, not a line the Coverage block carries alone.

State coverage honestly, including what was dropped and which personas ran.

---

## Phase 9: report + teardown

Write `${UI_WALKTHROUGH_PLANS_DIR:-${CODEX_HOME:-$HOME/.claude}/plans}/ui-walkthrough-<owner>-<repo>-<PR>-<date>.md`.

> **Headless note.** Claude Code guards the whole `~/.claude/` tree as sensitive, so writing there
> prompts for permission **even under `bypassPermissions`**, which stalls an unattended routine
> with nobody to approve. In a routine, set `UI_WALKTHROUGH_PLANS_DIR` to a path outside
> `~/.claude/` (e.g. `/root/ui-walkthrough-reports`). Local runs keep the default.

```
### /ui-walkthrough -> Atllas-Inc/codebase#1773, <date>
Role: reviewer   Head: <sha>   Viewports: desktop,tablet,mobile   Personas: premium
Target: e2e (emulators, stubbed, seeded)   Driver: browse   Video: skipped (headless routine)
Stack: booted ✓ identity-asserted ✓

| # | Class | Surface | Viewport | Finding | Evidence | Posted |
|---|-------|---------|----------|---------|----------|--------|

NEUTRAL NOTES (infra, never findings):
- <e.g. tablet pass skipped: stack died mid-matrix>

COVERAGE: 8/11 surfaces (dropped: …). Assets: refs/ui-walkthrough/pr-1773-<head-sha> @ <commit>
COMPONENTS: 7/7 changed UI files proven on screen (uncovered: <file>, <reason>, rung <n> tried)
Posted: <review id|comment url>, event=<…>, <k> inline, <m> images embedded.
```

The `Video:` field is never bare. Either a URL with its surface, beat, and jump counts
(`https://opencap.dev/r/Bs_eYjKW (desktop journey, all 8 surfaces, 9 beats, 1 jump)`), or the reason
it is absent: `skipped (headless browse daemon running)`, `skipped (screen-recording permission)`,
`skipped (headless routine)`, `truncated at 5:00 (Free tier)`. "Video: ✓" without a URL is not a
report. Say in the report when a journey is mostly jumps: it means the app had no in-app route
between those surfaces.

**The journey covers every walked surface, so the count reads `all <n>` and matches
`Surfaces walked`.** A surface the route fails to reach at all is named with its reason. That is a
run defect to report, never a length trade the skill is allowed to make.

Teardown is the EXIT trap from Phase 4 (stack down, lock released). It must not depend on the
walkthrough having succeeded. It must leave the machine exactly as it was found:

- [ ] the injected `uiw-hold.spec.ts` **and any in-workspace driver/probe `.mjs`** (Phase 0, they
      cannot live in `$SCRATCH`) **deleted** from the checkout
- [ ] the user's original branch restored (recorded before checkout)
- [ ] the local branch `gh pr checkout` created **deleted** (`git branch -D <branch>`): it is fully
      pushed, and leaving one per reviewed PR silts up their branch list
- [ ] any worktree removed (`git worktree remove --force`)
- [ ] the lane's lock released, and the lane's ports free (`concurrency.md` *Teardown*)
- [ ] **no orphaned recording**: if a session was started and no `share_url` came back,
      `opencap record discard` (it holds the active lock and burns a Free-tier slot otherwise)
- [ ] **this lane's** `browse` daemon stopped, and no other lane's touched. A daemon this run did
      not start is left exactly as found
- [ ] `git status --porcelain` **identical** to the pre-run capture: diff them and say so in the
      report. A walkthrough that leaves residue in someone's clone will not be run twice
