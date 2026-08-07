# full-send Phase 3B: Ralph loop (large change)

Loaded from `SKILL.md` Phase 3.0 only when the size gate picks 3B, or when `/full-send loop` forces
it. The Standing rules in `SKILL.md` Phase 3 bind every task here.

Don't hold the whole feature in one context. Decompose it into an ordered task list on disk, then
work **one task per fresh sub-context**, committing each unit as you go.

**Bounded, not free-reign.** This is a large existing codebase, so every task stays within the
ticket's scope: opportunistic cleanup is welcome *within the blast radius* (standing rules), but no
repo-wide or out-of-scope rewrites, and never `git reset --hard` the branch. The Ralph technique
assumes it can rewrite anything to recover. That is a greenfield assumption which does not hold
here. Recovery is a bounded repair-or-bail, per step 4 below.

**Run state: on disk, not in context.** Under the run dir `/tmp/full-send-$TICKET_ID/`:

- `fix_plan.md`: the ordered, checkboxed task list; the single source of truth for what's left.
- `notes.md`: learnings carried across iterations: build/test commands discovered, gotchas,
  decisions, and any follow-on work surfaced mid-build.
- `spec.md`: the ticket title, description, and acceptance criteria, so a fresh sub-context
  re-hydrates from disk instead of from the transcript.
- `path.md`: written in Phase 3.0, records that this run took 3B.

```bash
mkdir -p /tmp/full-send-$TICKET_ID
```

**Decompose (`fix_plan.md`).** Turn the Phase 2 plan into discrete, independently committable,
independently verifiable tasks ordered by dependency (types → sdk → api → frontend state → ui →
tests). Each task is *one thing*: a cohesive unit a blank context can finish, verify, and commit
without needing the others in-context. Aim for \~30-minute chunks. A unit's tests live in the same
task as the unit (or the immediately following task), so nothing merges unexercised.

```markdown
# AP-1234: <title>

- [ ] 1. Add `Foo` types to packages/sdk (types only)
- [ ] 2. API: POST /foo endpoint + service + test
- [ ] 3. Frontend state: useFoo hook + SDK wiring
- [ ] 4. UI: FooModal component (+ data-testid) + test
- [ ] 5. Wire FooModal into FooPage
```

**The loop.** The orchestrator (this session) holds only `fix_plan.md` plus progress, never the
accumulated implementation detail. Until every task is checked:

1. Pick the **single** top unchecked task in `fix_plan.md`.
2. Dispatch it to a **fresh subagent** (Agent tool, inherit the main model, this is substantive
   coding work) with: the one task, the paths to `fix_plan.md` / `notes.md` / `spec.md`, and the
   standing rules from `SKILL.md`. The subagent starts blank on purpose; it reads state from disk,
   not from a rotting transcript.
3. The subagent does **exactly that one task**, following the standing rules (including
   blast-radius cleanup and the `git add` rule), plus these loop-specific steps:
   - **Backpressure:** typecheck + lint the touched workspace and run the tests this task
     added/touched. Must be green before committing.
   - Commit just this unit: `git commit -m "<type>(<scope>): <task description>"`. If the task did
     opportunistic cleanup alongside the feature work, a separate `refactor(<scope>): ...` commit
     keeps the unit readable.
   - Append anything learned to `notes.md`; check off the task in `fix_plan.md`.
   - Return a **short structured summary**: task, files touched, verify result, commit SHA, and
     anything discovered (new tasks to append, a surfaced smell, or a blocker). Not the full diff.
4. **Verify the summary** (main-loop pass, per CLAUDE.md): confirm the task is actually checked off
   and committed, fold any newly-discovered tasks into `fix_plan.md`, and continue. If the subagent
   reported a blocker or its task couldn't be made green, retry **once** with the failure recorded
   in `notes.md` (Ralph "tuning"); if it still fails, **bail out** (see Bail-out in `SKILL.md`).
   Leave the branch intact, don't reset it.

Per-task commits are intentional: the history stays revertible unit-by-unit and human-reviewable,
and a crash mid-loop resumes cleanly from the first unchecked task in `fix_plan.md` (see Resume).

When `fix_plan.md` is fully checked, the feature is implemented across a series of commits.
Continue to Phase 4 for the final full-suite verification sweep.
