# Phase 6: dynamic walkthrough

Owned by this file, read from Phase 6 of [SKILL.md](SKILL.md): the run condition, the UI-touching
test, the delegation contract with `/ui-walkthrough --embedded`, and the one rule this skill keeps.

Run when `CAN_LIVE_HEADLESS` **AND** the PR is UI-touching **AND** not `--no-live`.

**UI-touching** is a prefix test against the PR's file list in
`/tmp/review-pr-$NAME-$PR-files.json`, not a shell glob. The prefixes differ per repo:

| Repo | UI-touching prefixes |
|---|---|
| `codebase` | `apps/agents-portal/src/pages/`, `apps/agents-portal/src/components/` |
| `neema-simple-hyzl` | `web/app/`, `web/components/` |
| `aicc-queues` | none. It has no frontend, so its PRs never reach this phase. |

A `neema-simple-hyzl` walkthrough runs on that repo's fixture stack, and its evidence carries the
`contract fixtures` label. `/ui-walkthrough` owns both in `hyzl-stack.md`.

Otherwise **skip, and if it is a UI PR add a NEEDS-DYNAMIC-RUN note** to the report ("UI PR: run
/review-pr <n> on a ≥8 GB runtime (cloud Routine or local) for the dynamic walkthrough"). `--no-live`
lands in the same place: the static review still posts, only the walkthrough is deferred.

**Delegate the walkthrough itself to `/ui-walkthrough --embedded`** rather than hand-rolling it here.
It walks every affected surface at **desktop + tablet + mobile**, runs deterministic detectors
(horizontal scroll, sub-44px touch targets, clipped text, console errors), publishes the
screenshots to GitHub via a verified mechanism (its Phase 7), and returns
`{blockers, mediums, nits, images, neutralNotes, coverage, markdown}`, posting nothing itself.
**This skill keeps the verdict**: merge its `blockers` into your findings, paste its `markdown` into
the review body, and treat its `neutralNotes` as infra notes, never findings.

**Read [stack-lifecycle.md](stack-lifecycle.md) before booting.** It owns the stack lock, the pinned
ports, the pre-build, the post-boot identity assertion, the boot budget, and teardown.
`/ui-walkthrough` Phase 4 reads it from there. **Do not duplicate it here.**

**Boot mechanics are not this skill's to carry.** The driver, the stack boot, the seeded personas,
and the capture matrix all belong to `/ui-walkthrough` and are documented in its `stack.md` and
Phase 0. **Do not re-add them here.** Fix them where they live.

**One rule stays this skill's own: never fire real Stripe/Vapi/Twilio.** The walkthrough runs
against the deterministic, externally-stubbed stack. A surface the stubbed stack cannot exercise is
a NEEDS-DYNAMIC-RUN note, never a reason to relax stubbing ([stack-lifecycle.md](stack-lifecycle.md),
*State isolation*).

- Also flag UI features shipping **without** the Playwright E2E specs the agents-portal behavioral
  contract requires. This criterion is **this** skill's: `/ui-walkthrough` puts it out of scope.

A **live-confirmed** defect ("modal throws on submit", screenshot) is the **highest-confidence**
finding tier, so it is a strong basis for `REQUEST_CHANGES`. A clean walkthrough supports `APPROVE`.
