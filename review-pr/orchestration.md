# review-pr: orchestration (multi-PR runs)

How one `/review-pr` run drives several PRs. **Read this only when more than one PR is in scope.**
`SKILL.md` Phases 0 through 9 describe one PR.

Review each (repo, PR) in its own sub-agent (Agent tool), because a review must stand on one PR's
evidence alone. One agent across several PRs carries prior diffs and findings forward, so PR A's
pattern biases PR B's verdict. The orchestrator (this session) stays thin: preflight -> discover ->
gate -> dispatch -> aggregate.

**Orchestrator rules:**

- **Run Phase 0 once** (identity, capability probes, `/phillip-sync`) and **run the Phase 2
  idempotency gate yourself** before dispatching: two cheap API calls per PR that avoid spawning
  agents for already-reviewed heads. Do **not** read diffs or repo files yourself.
- **Each dispatch prompt is self-contained:** repo, PR#, head SHA, clone path, the capability
  booleans (`CAN_VERIFY_<repo>`, externals present, `CAN_LIVE_*`), any opt-down flags from `$ARGS`
  (`--draft`, `--no-approve`, `--no-live`, `--no-resolve-bots`), the incremental range if Phase 2
  found a prior review, and the rubric path `~/.claude/skills/phillip/RUBRIC.md`. Tell the agent to
  execute Phases 3 through 9 of `~/.claude/skills/review-pr/SKILL.md` for **exactly that one PR**,
  reading the rubric itself.
- **Nesting is expected:** the per-PR agent runs its *own* blind Claude reviewer and its own
  Codex/Gemini background jobs (Phase 4). **Never give the blind reviewer the PR description or the
  author's login**, whatever the per-PR agent knows. A per-PR agent has **no Agent tool**, so its
  blind reviewer is a `claude -p` subprocess (Phase 4).
- **Concurrency:** agents for **different repos run in parallel** (separate clones). Agents for PRs
  in the **same repo run sequentially** (shared clone, serial checkouts). Do **not** split same-repo
  PRs across `git worktree`s to parallelize them: a fresh worktree's `node_modules` is empty, so
  "verification deps present" there means a full `yarn install` per worktree (minutes and gigabytes
  each). Without that install Tier 2 drops to reduced confidence and the run posts nothing
  (invariant 2).
- **Tier-3 dynamic walkthroughs are globally serialized** regardless of repo parallelism: one live
  stack machine-wide via the stack lock (pinned ports, singleton `browse` daemon). An agent that
  finds the lock held defers with a NEEDS-DYNAMIC-RUN note. The lock is owned by
  [stack-lifecycle.md](stack-lifecycle.md).
- **Return contract:** each agent returns only the verdict line (event, head SHA, posted review id,
  inline-comment count), its report path, and its NEEDS-YOUR-EYES / NEEDS-DYNAMIC-RUN items, not its
  transcript.
- **Failure isolation:** a dead sub-agent marks its PR `skipped (agent failed)`; the others proceed.
- **Single-PR exception:** exactly one target PR -> run Phases 3 through 9 inline, no dispatch.

### Batch execution model (multi-PR runs): static parallel, then dynamic serial

More than one PR in scope -> run the batch in **two staged passes** so the cheap work parallelizes
and the expensive serial work (stack boots) never blocks it. (Single-PR runs skip staging, per the
exception above. `--no-live` collapses this to Pass A only, and every PR posts after static.)

**Pass A, static (parallel, all PRs).** Dispatch one sub-agent per PR (context isolation as above),
each running the **static** phases only: Phase 3 (checkout/worktree), Phase 4 (three-reviewer),
Phase 5 + 5b (bot adjudication), Phase 7 (assemble payload + verdict). It does **not** run Phase 6
(dynamic) or Phase 8 (post). Each returns its assembled-static payload, its verdict, and whether the
PR is **UI-touching** (the Phase 6 prefix test).
- **Non-UI PRs are complete after Pass A** -> the orchestrator posts them immediately (Phase 8, with
  the invariant-5 draft re-check and `--draft` honored).
- **UI PRs park** their static payload and enter the Pass-B queue.

**Pass B, dynamic (serial, UI PRs only).** Drain the UI queue **one PR at a time** (the stack lock
enforces one live stack machine-wide anyway), **ordered by UI-diff size, largest first** (most
surface = most walkthrough value, and a broken stack fails fast). For each PR: Phase 6 (pre-build
packages -> boot -> drive -> capture) -> merge live findings into the parked static payload (a
live-confirmed defect can raise the verdict to `REQUEST_CHANGES`; a clean walkthrough supports
`APPROVE`) -> **post the full review immediately** (Phase 8). Reviews land progressively, not in one
end-of-run batch.

**Time budget and degradation: never drop a PR.** Pass B is bounded by the session runtime. Any UI PR
**not reached** before the budget runs out **posts its Pass-A static review** with a
`NEEDS-DYNAMIC-RUN` note ("static review posted; dynamic walkthrough deferred. Re-run
`/review-pr <n>` for the dynamic pass"). **Every in-scope PR gets a posted review.** Only the
*walkthrough* is deferrable. The aggregate lists which PRs got dynamic vs static-only.

### Nested dispatch: a per-PR agent may spawn its own helpers, bounded

A per-PR agent already runs the blind reviewer. Extend the pattern to other **read-only** work when
one PR is itself too big for one context: chunked review of a large diff (one reader agent per chunk,
findings merged before Phase 5), parallel verification of independent findings, or adjudicating a
pile of bot threads. Two hard rules:

- **Single writer per PR.** Only the per-PR agent posts the review, replies to threads, resolves bot
  threads, or touches the checkout. Helpers return findings and verdicts; invariant 2
  (only-verified-posts) is enforced in exactly one place.
- **Depth cap:** orchestrator -> per-PR agent -> helpers. No deeper, and no speculative spawning: a
  normal-sized PR runs Phases 4 and 5 inline (plus the blind reviewer it always runs).
