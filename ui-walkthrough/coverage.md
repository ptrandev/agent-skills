# Coverage and fixtures

Owned by this file, read from Phase 3 of [SKILL.md](SKILL.md): the component ledger, the ladder
that reaches an unmounted component, the `--surfaces` semantics, and fixture derivation. Phase 3
turns changed files into routes. This file proves the change is on screen, with data behind it.

## Coverage is proven per changed component

The route list says where to point the browser. It does not say what the PR changed. A page renders
perfectly, returns 200, and screenshots cleanly while showing **none** of the diff, because the
changed component sits behind a tab, a state, or a document shape the fixture never created. That
shot then counts as a walked surface and the change is never seen (invariant 11).

Build a **component ledger** beside the route list and carry it to Phase 9. One row per changed file
under `apps/agents-portal/src/{pages,components}/`:

| Column | How to fill it |
|---|---|
| `file` | the changed path |
| `probe` | a selector that is true ONLY when this component is on screen |
| `routes` | the routes the rules above reach it from |
| `precondition` | what must be true to mount it: a tab, a state, a document shape, a plan |
| `mountedIn` | filled in Phase 5a with the shots where the probe passed. Empty until proven |

**Take the `probe` from the diff.** Read the changed hunks and use a `data-testid` the PR adds or
keeps, or a literal string it renders. A probe that also matches the parent page proves nothing.

```bash
$B js '!!document.querySelector("[data-testid=rr-sms-card-offerAnswered]")'
```

A changed file whose `mountedIn` is empty at the end of Phase 5 **was not walked**, whatever its
routes captured.

## Reaching a component the default walk does not mount

Work the ladder in order. Stop at the first rung that mounts it. Record the rung that worked, so
the report says how the surface was reached.

1. **A state on a route already walked.** Open the tab, press the control, submit the form. A state
   that mounts an otherwise-unmounted changed component is exempt from the 3-state cap
   ([capture.md](capture.md), 5a).
2. **A richer fixture.** A default seed makes the SHALLOWEST valid document, and a shallow document
   routes to a different UI. A campaign seeded as a bare draft renders the create/chat-flow builder,
   so the settings step and every panel under it never mount. Read the PR's own specs for the
   document shape that reaches the panel, then seed that shape from the hold spec (*Fixtures*,
   below).
3. **A precondition route.** Some panels exist only after a prior step completes. Walk the prior
   step, then arrive.
4. **`--surfaces` on a re-run**, when the route was never in the discovered set at all.

Exhaust the ladder before calling anything uncovered. A component still unmounted after rung 4 is a
**MEDIUM**, named by file, reason, and last rung tried, in the Coverage block and the report:
*"changed component never mounted in this walkthrough, so no screenshot covers it."* It is never a
prose footnote and never omitted.

## `--surfaces=/a,/b`

Explicit routes replace discovery. Four consequences, all deliberate:

- **The not-a-UI-PR early exit does not apply.** Walk the listed routes even when the diff touches no
  `pages/`/`components/` file. Say `explicit --surfaces, discovery skipped` in the Coverage block.
- **The 8-surface cap still applies.** More than 8 -> walk the first 8 in the order given, list the
  rest as dropped. The cap bounds run time and comment size, which explicit routes do not change.
- **Fixture derivation still runs**, keyed off the PR's changed specs (`e2e/tests/**`), not off
  discovered routes. With no changed spec covering a listed route, an unpopulated surface is a
  **neutral note** ("no fixture, route not in this PR's diff"), not the MEDIUM below. That MEDIUM is
  reserved for a surface this PR actually changes.
- **The component ledger still applies.** Build it from the diff as usual, and report any changed
  file the listed routes never mount. Explicit routes narrow where you look. They do not narrow what
  the PR changed.

## Fixtures: the surface must have DATA, or you screenshot the wrong thing

On the e2e stack the only data is what something seeds, and there is no `--import`, so nothing
carries over. A surface with no data renders its **fallback or empty state**. That screenshots
perfectly and shows **none of the PR's changes**. Fixtures live in **two** places, and the global
one is rarely the relevant one:

| Source | Scope | How to tell |
|---|---|---|
| `e2e/seed/seed.mjs` | global, every run | personas, teams, baseline docs |
| `e2e/seed/*` helpers (e.g. `seedClient` -> `setDoc`/`PERSONAS`, `stripeRecoverySeed`) | **per-spec**, seeded in `beforeEach`, deleted in `afterEach` | feature data for a specific surface |

*Worked example:* the revenue-recovery analytics surface has **zero** `seed.mjs` hits. Its data comes
from `recovery-attribution-snapshots` / `revenuecat-connections` docs that its own spec seeds. Walk
it without that and you get the books-based hero: the fallback, not the feature.

**Derive the fixture from the PR's own specs.** A UI PR that touches `e2e/tests/**` hands you the
exact setup its surface needs.

1. For each changed spec, read its imports from `e2e/seed/*` and its `beforeEach`.
2. **Call the same helpers from the hold spec** ([stack.md](stack.md)) before it holds, so the
   surface is populated when your browser arrives. Reuse the repo's helpers, never hand-write
   fixture docs, and never `page.route`-mock. The specs deliberately do not mock, and mocked
   evidence is not evidence.
3. Mirror their invariants. That spec keeps `computedAt` **fresh**, because a stale snapshot
   triggers a background refresh that overwrites the seed mid-run. Copy those, or your data
   evaporates mid-walkthrough.

**Assert the surface is populated before capturing**, using a marker element from the spec's own
assertions. Not populated -> say so, capture the empty state **labelled as such**, and never report
the fallback as a defect. Personas see different data **by design** (`e2e-agent` premium vs
`e2e-free`), so attribute an empty surface to the persona before calling it missing.

Only when *no* fixture path exists anywhere: capture the empty state, label it `no seeded fixture`,
and raise a **MEDIUM**: *"no fixture exists, so neither this walkthrough nor the E2E suite can
exercise this UI."*
