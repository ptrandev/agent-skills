# full-send Phase 3B: Ralph loop (large change)

Loaded from `SKILL.md` Phase 3.0 only when the size gate picks 3B, or when `/full-send loop` forces
it. The Standing rules in `SKILL.md` Phase 3 bind every task here.

**Never** hold the whole feature in one context. Decompose it into an ordered task list on disk,
then work **one task per fresh sub-context**, committing each unit as you go.

**Bounded, not free-reign.** Keep every task within the ticket's scope. Opportunistic cleanup is
welcome *within the blast radius* (standing rules). **Never** make a repo-wide or out-of-scope
rewrite. **Never** run `git reset --hard` on the branch. Recovery is a bounded repair-or-bail, per
step 4 below.

**Run state: on disk, not in context.** Under the run dir `/tmp/full-send-$TICKET_ID/`:

- `fix_plan.md`: the ordered, checkboxed task list, the single source of truth for what is left.
- `notes.md`: learnings carried across iterations: build/test commands discovered, gotchas,
  decisions, and any follow-on work surfaced mid-build.
- `spec.md`: the ticket title, description, and acceptance criteria, which a fresh sub-context
  re-hydrates from.
- `path.md`: written in Phase 3.0, records that this run took 3B.

```bash
mkdir -p /tmp/full-send-$TICKET_ID
```

**Decompose (`fix_plan.md`).** Turn the Phase 2 plan into discrete, independently committable,
independently verifiable tasks ordered by dependency (types → sdk → api → frontend state → ui →
tests). Each task is *one thing*: a cohesive unit a blank context can finish, verify, and commit
without needing the others in-context. Aim for \~30-minute chunks. A unit's tests live in the same
task as the unit, or in the immediately following task.

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
2. Dispatch it to a **fresh subagent** using the host's subagent mechanism. Inherit the main model,
   because this is substantive coding work. Give it the one task, the paths to `fix_plan.md` / `notes.md` / `spec.md`, and the
   standing rules from `SKILL.md`. The subagent starts blank and reads state from disk.
3. The subagent does **exactly that one task**, following the standing rules (including
   blast-radius cleanup and the `git add` rule), plus these loop-specific steps:
   - **Backpressure:** typecheck + lint the touched workspace and run the tests this task
     added/touched. Must be green before committing.
   - Commit just this unit: `git commit -m "<type>(<scope>): <task description>"`. Commit any
     opportunistic cleanup separately as `refactor(<scope>): ...`.
   - Append anything learned to `notes.md`. Check off the task in `fix_plan.md`.
   - Return a **short structured summary**: task, files touched, verify result, commit SHA, and
     anything discovered (new tasks to append, a surfaced smell, or a blocker). Not the full diff.
4. **Verify the summary** in the main loop: confirm the task is checked off and
   committed, fold any newly-discovered tasks into `fix_plan.md`, and continue. When the subagent
   reports a blocker, or its task cannot be made green, retry **once** with the failure recorded
   in `notes.md` (Ralph "tuning"). When it still fails, **bail out** (see Bail-out in `SKILL.md`)
   and leave the branch intact.

Continue to Phase 4 for the final full-suite verification sweep when every task in `fix_plan.md` is
checked.
