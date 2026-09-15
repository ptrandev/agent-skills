# full-send Phase 3B / 3C: Decomposed implementation

Loaded from `SKILL.md` Phase 3.0 when the size gate picks 3B or 3C, or when `/full-send loop` or
`/full-send fan` forces one. The Standing rules in `SKILL.md` Phase 3 bind every task here.

This file owns the decomposition, the on-disk run state, both execution modes, and recovery.

| Mode | Phase | Runs | Trades |
|---|---|---|---|
| Serial | 3B | One task per wave, in order | Slowest, highest correctness |
| Fan | 3C | Every task in a wave at once | Fastest, integration risk |

**Never** hold the whole feature in one context. Decompose it into a task list on disk, then work
**one task per fresh sub-context**, committing each unit as you go.

**Bounded, not free-reign.** Keep every task within the ticket's scope. Opportunistic cleanup is
welcome *within the blast radius* (standing rules). **Never** make a repo-wide or out-of-scope
rewrite. **Never** run `git reset --hard` on the branch.

## Run state: on disk, not in context

Under the run dir `/tmp/full-send-$TICKET_ID/`:

- `fix_plan.md`: the checkboxed task list with its path manifest, the single source of truth for
  what is left.
- `notes.md`: learnings carried across tasks: build/test commands discovered, gotchas, decisions,
  and any follow-on work surfaced mid-build.
- `spec.md`: the ticket title, description, and acceptance criteria, which a fresh sub-context
  re-hydrates from.
- `path.md`: written in Phase 3.0, records that this run took 3B or 3C.

```bash
mkdir -p /tmp/full-send-$TICKET_ID
```

## Decompose (`fix_plan.md`)

Turn the Phase 2 plan into discrete, independently committable, independently verifiable tasks
ordered by dependency (types → sdk → api → frontend state → ui → docs). Each task is *one thing*: a
cohesive unit a blank context can finish, verify, and commit without needing the others
in-context. Aim for \~30-minute chunks. A unit's tests live in the same task as the unit, or in the
immediately following task.

Give every task two extra fields. Both modes need them, because the gate in Phase 3.0 reads them
to choose the mode.

- **Owns:** every file path the task creates or modifies. Glob a directory only when the task owns
  the whole directory. A path appears under exactly one task.
- **Needs:** the task numbers whose code this task calls, imports, or renders.

```markdown
# AP-1234: <title>

- [ ] 1. Add `Foo` types to packages/sdk (types only)
  - Owns: packages/types/foo/v1.ts, packages/sdk/src/index.ts
  - Needs: none
- [ ] 2. API: POST /foo endpoint + service + test
  - Owns: apps/api/src/routes/foo.ts, apps/api/src/__tests__/foo.test.ts
  - Needs: 1
- [ ] 3. Frontend state: useFoo hook + SDK wiring
  - Owns: apps/agents-portal/src/hooks/useFoo.ts
  - Needs: 1
- [ ] 4. UI: FooModal component (+ data-testid) + test
  - Owns: apps/agents-portal/src/components/FooModal.tsx
  - Needs: 1
- [ ] 5. Docs: explain Foo
  - Owns: apps/docs/atllasx/docs/foo.mdx
  - Needs: none
```

**A path collision is a decomposition bug, not a conflict to resolve.** If two tasks own the same
file, merge them into one task or move the shared edit into an earlier task. **Never** dispatch two
tasks that own the same path.

## Build the waves

Group the tasks into waves. A task enters the first wave whose predecessors all landed in an
earlier wave. Every task in one wave owns a path set disjoint from every sibling.

For the example above: wave 1 = [1, 5], wave 2 = [2, 3, 4].

Write the waves into `fix_plan.md` above the task list. Serial mode ignores them and walks the
tasks in order. Fan mode dispatches one wave at a time.

## Serial mode (3B)

Until every task is checked:

1. Pick the **single** top unchecked task in `fix_plan.md`.
2. Dispatch it to a **fresh subagent** using the host's subagent mechanism. Inherit the main model,
   because this is substantive coding work. Give it the one task, the paths to `fix_plan.md` /
   `notes.md` / `spec.md`, and the standing rules from `SKILL.md`. The subagent starts blank and
   reads state from disk.
3. The subagent does **exactly that one task**, following the standing rules (including
   blast-radius cleanup and the `git add` rule), plus these steps:
   - **Backpressure:** typecheck + lint the touched workspace and run the tests this task
     added/touched. Must be green before committing.
   - Commit just this unit: `git commit -m "<type>(<scope>): <task description>"`. Commit any
     opportunistic cleanup separately as `refactor(<scope>): ...`.
   - Append anything learned to `notes.md`. Check off the task in `fix_plan.md`.
   - Return a **short structured summary**: task, files touched, verify result, commit SHA, and
     anything discovered (new tasks to append, a surfaced smell, or a blocker). Not the full diff.
4. **Verify the summary** in the main loop: confirm the task is checked off and committed, fold any
   newly-discovered tasks into `fix_plan.md`, and continue. When the subagent reports a blocker, or
   its task cannot be made green, retry **once** with the failure recorded in `notes.md`. When it
   still fails, **bail out** (see Bail-out in `SKILL.md`) and leave the branch intact.

Go to the Finish section when every task is checked.

## Fan mode (3C)

Fan mode trades correctness for wall-clock. A parallel task never reads a sibling's code, only the
contract an earlier wave landed. Two rules follow from that, and both are load-bearing.

- **The first wave lands the contracts.** Put every shared type, interface, and signature in wave
  1, alone. A sibling that guesses a signature costs more than the wave it saved.
- **Agents never commit and never verify.** The git index is one lock. Parallel commits race, and a
  scoped typecheck sees a sibling's half-written file. The orchestrator owns both.

Run each wave in order:

1. Dispatch **every** task in the wave in one message, one fresh subagent each, inheriting the main
   model. There is no cap on wave width. Give each agent its one task, its **Owns** list, the paths
   to `fix_plan.md` / `notes.md` / `spec.md`, and the standing rules from `SKILL.md`.
2. Each agent edits **only the paths its task owns**, follows the standing rules, appends to
   `notes.md`, and returns the short structured summary. Tell it explicitly: **do not run `git
   add`, `git commit`, or any typecheck, lint, or test command.** State that siblings are editing
   the same checkout right now.
3. When the whole wave returns, verify once in the main loop. Typecheck and lint every workspace
   the wave touched, then run the tests the wave added or touched.
4. Green: commit each task separately, in wave order, staging only that task's owned paths. Check
   each task off in `fix_plan.md`. Go to the next wave.

```bash
git add <task 2's owned paths> && git commit -m "feat(<scope>): <task 2 description>"
git add <task 3's owned paths> && git commit -m "feat(<scope>): <task 3 description>"
```

### Attribute and recover a failed wave

Red: map every error to an owning task through the **Owns** manifest. An error in a path a task
owns belongs to that task. An error in a path no task in this wave owns belongs to the task whose
code the failing file calls.

Then drop that wave to serial:

1. Revert only the failing tasks' owned paths: `git checkout -- <those paths>`, or `rm` the files
   the task created.
2. Commit the tasks that passed, as in step 4 above. Check them off.
3. Re-run each failed task as a **serial mode** iteration, one at a time, against the tree the
   passing tasks already landed. The agent sees the real sibling code and verifies its own work.
4. A serial retry that still cannot go green follows the serial mode rule: one retry, then
   **bail out**.

**Never** re-dispatch a failed wave in parallel. The second attempt is as blind as the first.

### Final integration wave

After the last wave, dispatch **one** fresh subagent, inheriting the main model, before the Finish
section. Parallel work creates seam defects that typecheck cannot see, so this agent hunts for them
specifically.

Give it `spec.md`, `fix_plan.md`, and the branch diff (`git diff "origin/$BASE"...HEAD`). Tell it
to report, and to fix, these four:

- A caller whose behavior does not match its callee, where the types still line up.
- A contract honored differently on two sides, for example a default applied in the API and again
  in the hook.
- The same logic written twice by two tasks that never saw each other.
- An acceptance criterion in `spec.md` that no task actually covers.

It commits its fixes as `fix(<scope>): close integration gaps from parallel waves`. A clean report
commits nothing.

## Finish

Continue to Phase 4 for the final full-suite verification sweep when every task in `fix_plan.md` is
checked.
