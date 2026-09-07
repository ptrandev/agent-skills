# The /phillip review standard

This rubric is the shareable core of what `/phillip` catches. It holds the generic rules, the
severity taxonomy, and the verification discipline.

`RUBRIC.private.md`, next to this file, holds every row tied to a private repo. Git never
tracks it. `phillip-sync` appends new rows there, never here. **Read both files.** This file
alone is an incomplete rubric.

## How to read the tables

- REPO: `any` applies everywhere. Every row in this file is `any`. A row tagged to a repo slug
  lives in `RUBRIC.private.md` and applies only to that repo.
- CATEGORY: one value from the closed set below.
- ADDED: the date the row was written.
- The `auto` and `donotflag` tables are "what to catch" and "what NOT to catch" respectively.
  Do not read a `donotflag` row as a finding.

Category values (closed set, `phillip-sync` picks from this list): Security, Races, Silent
failures, Correctness, Performance, Data loss, Comments, Encoding, Docs, Tests, UI,
Permissions, Firestore.

This file carries no `<!-- phillip-sync:... -->` markers. `phillip-sync` writes against the
markers in `RUBRIC.private.md`. Hand-edit this file freely.

## Auto-synced rules (what to catch)

| Repo | Category | Trigger -> failure | Rule | Added |
| --- | --- | --- | --- | --- |
| any | Silent failures | Fire-and-forget async chain (`void fn().then(...)`, an un-awaited write, or `Promise.all([...])` with no `.catch`) -> the rejection throws into the void on failure (RN redbox / a screen stuck on its skeleton), not a handled error. | Attach `.catch` or await inside try/catch. | 2026-06-19 |
| any | Correctness | Two related figures derived from different sources (a usage bar on plan-cap math vs an "X left" line that also counts purchased credits), or a count/total that excludes a category another view includes (a rollup summing only the stuck subset) -> the numbers visibly contradict. | Drive both from one source of truth. | 2026-06-19 |
| any | Silent failures | Persisted/validated field != the field the user edits: a setup/save path drops an override the form collected, or validation gates on the shared DEFAULT while the user edited a per-record OVERRIDE -> the change appears to save but silently never takes effect, or a feature enabled with its required field left blank saves then never fires. | Drive validation AND persistence off the exact field bound to the input. | 2026-06-25 |
| any | Correctness | Nullish/falsy coalescing eats a legitimate `0` or `null`: a truthy check (`tokensAvailable ? ...`) hides the UI at exactly 0, or `input.x ?? existing.x` / `?? default` blocks the user clearing a field to null -> the edit looks saved but the zero/cleared state is silently dropped. | Use explicit `!= null` / `!== undefined`. | 2026-06-30 |
| any | Correctness | An id (`userId`, `owner`, `appUserId`, `projectId`) used as a Firestore doc-path segment or REST URL segment without a non-empty/non-whitespace guard -> Firestore throws on empty path, URLs get `//` and 404. | Guard at entry and fail closed (return null/[]/skip+count). | 2026-08-07 |
| any | Correctness | `value <= 0` guard bypassed by undefined: `undefined <= 0` is false, so a missing numeric field in an API/SWR payload slips past and renders `NaN%`. | Use `!(value > 0)` for fail-closed numeric guards. | 2026-07-27 |
| any | Races | Async cache stores the resolved value, not the promise: concurrent callers for the same key all miss before the first resolve -> N duplicate expensive reads (cache stampede). | Cache the promise itself. | 2026-07-27 |
| any | Performance | `new Intl.DateTimeFormat(...)` (or a compiled regex/formatter) constructed inside a helper, view, method, or row loop that runs once per table/feed row or per render -> rebuilt on every call. | Hoist to a module/static cache keyed by its args. | 2026-08-07 |
| any | Races | Stale state survives a re-open/discard: a dialog or panel that fetches on open keeps the PREVIOUS session's value until the new request resolves (so a fail-closed gate briefly renders open), or a discard resets to `undefined` instead of the last SAVED value. | Clear/restore at the START of the open, not on resolve. | 2026-07-29 |
| any | Correctness | Vacuous guard: a condition meant to exclude a case is satisfied *by construction* on the writer paths that actually produce the shape it guards (`collectedValue === planAmount x quantity` where one backfill stamps both from one value) -> the gate carries no information and the excluded case ships. | Trace every writer of each field a predicate reads before trusting the gate. | 2026-08-04 |
| any | Correctness | `a === '' \|\| a === b` passes when `b` also normalizes to `''` -> the guard carries no information and the excluded case ships. | Trace every writer of each field a predicate reads before trusting the gate. | 2026-08-04 |
| any | Docs | Docs drift: a user-facing doc states a navigation path, policy, or number that no longer matches the product or a sibling doc (a nav path naming a page that moved; a billing unit the billing docs contradict). | When a change moves a surface or alters a policy, grep the docs for the old path/claim in the same PR. | 2026-08-07 |
| any | Tests | Playwright `page.goto()` with no following `page.waitForURL()` races client-side redirects against the next assertion -> flaky spec. | Pair every `goto` with a `waitForURL` on the expected path. | 2026-08-07 |
| any | Performance | Sequential `await` in a `for...of` over independent lookups: slow, and one rejection throws into the *outer* scope and kills the whole batch. | Fan out with **bounded** concurrency (chunks, not unbounded `Promise.all`, to respect external rate limits) and a per-item `.catch` so one failure degrades to null instead of aborting. Independent reads on the same account must also be issued together rather than round-trip-per-call. | 2026-08-04 |
| any | Silent failures | `.catch(() => fallback)` maps a thrown error onto a semantically meaningful outcome (`false` = "lost the race", `true` = "suppressed", `[]` = "none") -> an infra blip is reported downstream as a real business outcome (customer told "already sent" for a link that never went out; a failed opt-out write logged as a clean opt-out). | Return a distinct error outcome from the catch; only a real result can set business state. | 2026-08-07 |
| any | Performance | Accumulator rebuilt by spreading inside a loop (`holder = [...holder, x]`, `reduce((acc, k) => ({ ...acc, [k]: v }), {})`) -> O(N^2) allocation on every iteration. | Mutate one accumulator, or `push`, then return it. | 2026-08-12 |
| any | Correctness | A consumer reads a field that an intermediate explicit-field mapper never projects (a \~50-field copy with no spread), or that no writer ever persists -> the branch, timeline tone, or `switch` case that depends on it is unreachable and silently never renders. | Trace the field end to end, writer -> every mapper -> consumer, before shipping a branch that reads it. | 2026-08-13 |
| any | Correctness | `createdAt` reused as the proxy for a LATER per-cycle event on a doc that is reused across cycles (`createdAt: existing?.createdAt ?? now`) -> the proxy is stale on exactly the rows it targets, so work is metered into the wrong month. | Add a dedicated stamp for the event you actually mean. | 2026-08-13 |
| any | Silent failures | Deploy/build shell script `cd`s with relative paths and no error check inside a per-app loop -> one failed `cd` runs the next build in the wrong directory and corrupts every later iteration, with nothing surfaced. | Capture a root from `$(dirname "${BASH_SOURCE[0]}")`, anchor every path to it, and append `\|\| exit 1` to every `cd`. | 2026-08-26 |
| any | Silent failures | Vendor config (`dependabot.yml`, a CI yaml) gated only by a syntax parse in pre-commit -> the file parses, fails the consuming tool's own schema, and the config silently never takes effect. | Validate against the vendor's schema, not just YAML/JSON syntax. | 2026-08-26 |
| any | Tests | A test starts a worker with a cancellable context but does not defer the cancel function -> an early failure leaves the worker running and can leak goroutines or make the suite flaky. | Defer cancellation immediately after context creation and treat context cancellation as normal shutdown. | 2026-09-04 |

## Do NOT flag (the inverse: raising these is the finding)

Rows here are declined review-comment classes. Raising one costs credibility, so check this
table before writing a finding.

| Repo | Category | Pattern | Why it is not a finding | Added |
| --- | --- | --- | --- | --- |
| any | Correctness | Redundant nullish guard on a required, type-checked parameter (`if (!cohort)` on a non-optional param, `req.query?.` where Express guarantees the object). | It creates unreachable code and implies the type system is untrustworthy. Verify the declared type before proposing a defensive guard. This is the single most-declined class of review comment. | 2026-08-27 |
| any | Correctness | A defect in code the diff only MOVED or re-indented, raised as if the diff introduced it (a refactor PR blamed for a pre-existing `\|\|`, an un-awaited `window.open`, a stale-snapshot write, an unguarded `navigator.clipboard`, `setState` inside a `queryFn`). | The diff is the unit of review. Check the line against the base branch first. If it is byte-identical, it is a follow-up ticket, not a finding on this PR. This is the highest-volume declined class. | 2026-08-13 |
| any | Correctness | Asserting a compile error, `ReferenceError`, or a missing definition from reading the diff hunk alone (`FieldValue is not defined`, `finite` "is not defined or imported" when it is declared 200 lines up, `req.method` cannot index under strict null checks). | The import or local declaration commonly exists outside the hunk, and the app's own tsconfig can set `strict: false`. Open the whole file and read the nearest tsconfig before claiming the build breaks. | 2026-08-13 |
| any | Correctness | An idempotency import or guard proposed for a failure mode that needs a second call site the repo does not have (`getApps()` before `initializeApp` where the whole suite initializes once). | Count the call sites first. With one, the guard is unreachable and the added import is unused. | 2026-08-13 |
| any | Correctness | A finding anchored to a file that is not in this PR's diff. | It gets closed as wrong-PR and costs a round. Check the path against `git diff --name-only` before posting, and re-anchor or move it to the PR that owns the file. | 2026-08-13 |
| any | Correctness | Proposing a user-defined type guard (`result is {dispatched: false}`) to "simplify" checks where the predicate matches only a subset of the negative branch. | The guard over-narrows the else-arm and misleads readers. Declined three times. | 2026-08-20 |
| any | Correctness | Proposing a Firestore doc-id sanitization guard (empty / whitespace / contains `/`) on a required, typed id that has already keyed reads and writes on the same doc upstream. | It is a redundant guard on a type-checked param. The path-segment rule targets user-derived or possibly-empty ids. Declined three times. | 2026-08-26 |
| any | Correctness | Claiming `cross-env NODE_OPTIONS='$NODE_OPTIONS ...'` passes the literal `$NODE_OPTIONS` to Node because cross-env has no variable expansion. | cross-env 7.0.3, the pinned version, does expand it in JS, shell-independent. Verified and declined twice. Check the pinned version's behavior first. | 2026-08-26 |
| any | Performance | Claiming `defer res.Body.Close()` leaks connections because the enclosing worker is long-running, when the `defer` sits inside a per-message callback that returns on every message. | The defer runs when the closure returns, so the body closes per message. Read which function encloses the line before claiming a leak. | 2026-08-26 |

## Categories Phillip reliably catches (language-agnostic core)

- Security: cross-account data leaks, missing token de-registration on logout,
  auth/permission gaps. Check that every access path enforces the right permission.
- Races: in-flight request repopulating a cache after a session switch, multi-write
  races, cold vs warm start ordering, and login/logout sequencing.
- Silent failures: `fetch` not checking `response.ok`, swallowed errors, and a failed
  write treated as success.
- Comments: inaccurate code comments (the comment lies about what the code does).
- Encoding: regex edge cases, UTF-16 / emoji / grapheme slicing.

## Things Phillip does NOT do (so do not do them either)

- Does not bikeshed style the formatter owns.
- Does not force changes on deliberate tradeoffs. If a choice is intentional, mark it
  `[note - accepted tradeoff]` and request no change.
- Does not invent work. If something real is deferred, file a Linear ticket for
  it (see report section) rather than dropping it silently.
- Does not review-theater. Stop when the diff is clean (see stopping rule).

## Severity taxonomy (use these exact markers)

- HIGH (red) -> must-fix before merge. Correctness bugs, security holes, data loss,
  cross-account data leaks, cold-start navigation bugs, anything a real user hits.
  Real example: "bridging has no logout counterpart -> cross-account leak; the <!-- lint-style: ignore -->
  previous user's push notifications are delivered to the new user's device."
- MEDIUM (yellow) -> should-fix. Silent failures (fetch not checking `response.ok`),
  inaccurate code comments, reachable races, latent footguns reachable in practice.
  Real example: "silent registration failure. fetch does not reject on HTTP 401/500,
  so a failed PATCH is treated as success."
- low / nit (green) -> display-only, style, theoretical-but-not-reachable, polish.
  Real example: "`substring(0,140)` slices by UTF-16 code units, so the cut can split
  an emoji/grapheme."

(`[P1]/[P2]/[P3]` map to HIGH/MEDIUM/LOW if a reviewer uses them.)

Only HIGH and MEDIUM get implemented. LOW/nits are listed but optional.

## Verification discipline (non-negotiable)

NEVER assert a finding without checking it against reality:
- Verify against the actual code path -> open the file, read the function, trace the flow.
- Verify against production data when the claim is about data ("of N records, only M
  match...").
- Verify against live third-party API/SDK behavior when the claim is about an external
  contract ("Verified against the live OpenAI API: `reasoning_effort: 'none'` is
  accepted by gpt-5.4...").
- Distinguish TYPE-level problems from RUNTIME problems ("won't actually throw today, <!-- lint-style: ignore -->
  but the SDK type was the real issue").
- Cite exact `file:line` for every finding, and the fix commit SHA once fixed.

HONESTY RULE: a "Verified against the live API" or "Confirmed against production" line is
a claim of PROOF. Only write it if you actually ran that check THIS session. To hit a
live API/SDK contract, use WebFetch or
WebSearch. To check production data, use the project's CLI via Bash (e.g. the Firebase
CLI for Firestore/RTDB) when it is available and you have access. If you CANNOT verify
a claim -> no tool, no access, no time -> say so explicitly, downgrade your confidence,
and route the finding as "needs human verification." Never fabricate a verification you
did not perform. A claimed-but-fake verification is worse than an honest "unverified."
