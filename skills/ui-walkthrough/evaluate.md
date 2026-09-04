# Phase 6: evaluate

Owned by this file, read from Phase 6 of [SKILL.md](SKILL.md): both passes, the attribution
procedure, the numeric thresholds, the console-error ladder, and the judged pass.

Two passes.

## 6a: attribute and class the detector output (can block)

Phase 5b already measured. This pass decides whose defect each firing is, and only this pass can
produce a BLOCKER. Re-measuring live is expected here: the browser is still up, and attribution
needs the page.

**Navigate back before re-measuring.** The 5a+5b walk ends on whatever surface and viewport it
finished with, and it runs in a sub-agent, so this session never saw it move. Go to the firing's
own `surface` + `viewport` first, and reload after the viewport change. Measuring the wrong page
silently produces a confident, wrong attribution.

### Attribution: a detector number says a defect exists, not whose it is

**Attribute by MEASURING, not by reading the diff.**

- **Name the outermost offender, not every descendant.** An overflowing ancestor makes its children
  report overflow too. Keep only elements whose `right > innerWidth` that no already-kept element
  `contains`. The culprit is one node in almost every case.
- **Delete this PR's own elements in the live page and re-measure:**

  ```js
  const before = measure()
  document.querySelectorAll('[data-testid="thing-the-pr-added"]').forEach(e => e.remove())
  const after = measure()   // before - after is the PR's contribution
  ```

**The threshold is numeric, not a feeling.** With `delta = before - after`:

| Measurement | Class | What to say |
|---|---|---|
| `delta >= 8px` **and** `delta >= 10%` of `before` | **BLOCKER** | "PR contributes `<delta>`px of `<before>`px overflow" |
| `delta < 8px` **or** `delta < 10%` of `before` | **MEDIUM** | "pre-existing, PR contributes `<delta>`px" |
| the offending element is not in the diff at all | **MEDIUM** | "pre-existing, element `<sel>` is outside this PR" |
| the element **is** the PR's, but an existing sibling (same component, same size prop) measures **identically** | **MEDIUM** | shared-styling issue whose fix moves both, not a regression. Quote the sibling's measurement as proof. |

The same 8px / 10% rule applies to clipped text (`scrollWidth - clientWidth`). A touch target is
attributed by identity, not size: the element must be one the diff adds or restyles, else MEDIUM.

### Console errors need the same attribution, and they do not get it for free

`console --clear` scopes the read to the surface, not to the PR, and a pre-existing Stripe or
analytics 404 must never post `REQUEST_CHANGES` on an unrelated PR. Attribute before classing:

1. Resolve the error's source file from its stack frame or `location.url`, mapped through the
   sourcemap to a repo path.
2. Source path is in `gh pr diff --name-only` -> **BLOCKER**. Quote the message and the resolved
   `file:line`.
3. Source path resolves **outside** the diff (vendor chunk, third-party script, an untouched
   module) -> **MEDIUM**, labelled "may be pre-existing, source outside the diff".
4. Source unresolvable (cross-origin script, no sourcemap) -> cross-check against the base branch:
   load the same surface from a base-branch build and re-read `console --errors`. Same message
   present -> **MEDIUM**, "present on `<base>` too". Absent -> **BLOCKER**.
5. Base-branch build not affordable this run -> **MEDIUM** plus a neutral note saying the
   cross-check was skipped. An unattributed console error is never a BLOCKER.

## 6b: judged pass (designer's eye, never blocks)

**Read the rubric. Never reinvent it.** `$DESIGN_REVIEW_DIR/SKILL.md` §*Design Audit
Checklist* (grep `### Design Audit Checklist`) carries \~80 items across 10 categories. The ones
judgeable from a screenshot are **4. Spacing & Layout**, **5. Interaction States**, **6. Responsive
Design**, and the contrast items in **3**. Read those at runtime so `/design-review`'s rubric stays
the single source of truth, including its mobile rule: *"A stacked desktop layout on mobile is not
responsive design, it's lazy. Evaluate whether the mobile layout makes design sense."* <!-- lint-style: ignore -->

Use the Read tool on each PNG, so the judgment is made **against the image**, not against the DOM.

**A screenshot is not a style measurement.** A frame can catch a MUI ripple or transition
mid-animation and look like a contrast failure. Before reporting one, read the *resting*
`getComputedStyle` in each state (idle / hover / selected / selected+hover) and compute the real
WCAG ratio. A "low contrast" finding that measures 5.24:1 is a false positive published under the
skill's own evidence-bound invariant.

**Out of scope**, because `/review-pr` owns it: missing Playwright E2E specs, code-level findings,
anything not visible on screen.
