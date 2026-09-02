# babysit-prs: Routine (cloud) setup

A Claude Code **Routine** runs `/babysit-prs` unattended in an Anthropic-managed cloud environment.
It **clones your repo and runs a setup step**, so it has the *actual code* and a real toolchain,
enough to make fixes and verify them (typecheck/lint/test).

> Source of truth: <https://code.claude.com/docs/en/routines> (research preview, limits/labels may
> change). Configure at **claude.ai/code/routines** (web), the Desktop app (**Routines → New
> routine → Remote**), or `/schedule` in the CLI. **Do not create a Routine from inside this
> skill.**

Capability tiers in a Routine:
- ✅ **Tier 1** triage/reply/resolve and ✅ **Tier 2** fix + verify, fully in-cloud.
- ❌ **Tier 3** visual evidence (screenshots/video), no display/OpenCap in the cloud session.
  Leave a thread needing visual proof open, tagged *"needs local visual run,"* for a local pass.

Routines support these three trigger types and combine them. Configure them in §5.

| Trigger | Cadence and limits |
|---|---|
| **Schedule** | 1 hour minimum cadence, or a one-off time. |
| **GitHub event** | `pull_request.*` and `release.*` actions only. No review-comment or issue-comment event. |
| **API** | An HTTP POST to a per-routine `/fire` endpoint with a bearer token. |

---

## Two things to get right

1. **Unrestricted branch pushes, required.** By default a Routine may push only to
   `claude/`-prefixed branches. This skill commits to the *PR's own head branch* (e.g.
   `ptrandev/AP-1810-…`). In the routine form's **Permissions** tab, enable **"Allow unrestricted
   branch pushes"** for **each** repo. Without it, fixes can't be pushed and every fix-needed thread
   degrades to triage-only.
2. **The session starts on the default branch.** Each run clones `master`. The prompt/skill must
   `git fetch` and `gh pr checkout <PR>` onto the PR head before editing. The skill's Phase 4 does
   this, so the Routine runs the *skill*. **Never run a hand-rolled one-liner instead.**

---

## 1. Connect GitHub (no PAT)

Routines use your **connected GitHub identity**, not a pasted token (that's the separate Managed
Agents API). Two paths:

- **`/web-setup`** in the CLI: grants repo access for **cloning**. Sufficient for a
  **schedule-only** routine.
- **Claude GitHub App**: required additionally for **GitHub event triggers** (webhook delivery).
  The trigger setup prompts you to install it on the repo if it isn't already.

Commits, PR replies, and thread resolutions appear as **your** GitHub user.

## 2. Create the routine (web form)

At **claude.ai/code/routines → New routine**:

1. **Name + prompt:** name it `babysit-prs`; prompt in §4 below. (The prompt box has a model
   selector, pick your model; it's used every run.)
2. **Select repositories:** add `Atllas-Inc/codebase` and `Atllas-Inc/aicc-queues`. Each is cloned
   fresh from its default branch every run.
3. **Select an environment:** §3 (setup script).
4. **Select a trigger:** §5.
5. **Connectors / Permissions tabs** (bottom of the form):
   - **Permissions → enable "Allow unrestricted branch pushes"** for both repos (gotcha #1).
   - **Connectors:** all your connected MCP connectors are included by default. Strip every one,
     because this routine needs none beyond git/gh.
6. **Create**, then use **Run now** on the detail page for the validation run (§6).

## 3. Environment + setup script

The **Default** environment uses **Trusted** network access (package registries + common dev
domains like github.com reachable; arbitrary hosts blocked). Add a **setup script** (runs once,
cached). **The two repos have different stacks. `codebase` is Yarn 3 (Berry), `aicc-queues` is
Gradle/JVM, so the script must handle each correctly:**

```bash
# (a) Make the babysit-prs skill discoverable (public repo, no auth).
git clone --depth 1 https://github.com/ptrandev/agent-skills.git /tmp/agent-skills
mkdir -p "$HOME/.claude/skills"
cp -R /tmp/agent-skills/babysit-prs "$HOME/.claude/skills/babysit-prs"

# Replace these with each repo's actual clone path in the session.
CODEBASE_DIR="${CODEBASE_DIR:-./codebase}"
AICC_DIR="${AICC_DIR:-./aicc-queues}"

# (b) codebase: Yarn 3.8.7 Berry monorepo (Node >=20). Berry uses --immutable,
#     NOT --frozen-lockfile (a Yarn 1 flag that Berry rejects with an error).
if [ -f "$CODEBASE_DIR/package.json" ]; then
  ( cd "$CODEBASE_DIR" && corepack enable && yarn install --immutable ) \
    || echo "codebase: yarn install failed, its fixes degrade to triage-only"
else
  echo "codebase: clone not found at $CODEBASE_DIR, fixes degrade to triage-only"
fi

# (c) aicc-queues: Gradle 8.10 / JVM (JDK 21 is present in the sandbox).
#     Warm deps + compile only: full tests need Redis+Postgres, absent here.
if [ -f "$AICC_DIR/build.gradle" ]; then
  ( cd "$AICC_DIR" && ./gradlew --no-daemon compileJava ) \
    || echo "aicc-queues: gradle compile failed, its fixes degrade to triage-only"
else
  echo "aicc-queues: clone not found at $AICC_DIR, fixes degrade to triage-only"
fi
```

Notes:
- **Skill discovery:** `$HOME/.claude/skills` matches how Claude Code normally loads user skills and
  works regardless of cwd. The docs also guarantee "skills **committed to the cloned repository**".
  When `$HOME` discovery does not take, commit `babysit-prs` into a repo's `.claude/skills/`, or
  **inline** SKILL.md into the prompt (the docs stress a self-contained one).
- **Per-repo verification depth sets the auto-resolve bar.** The rule lives in Phase 4 of
  [SKILL.md](SKILL.md) because the agent applies it every run. It is why (c) compiles rather than
  tests.
- **Network:** Gradle pulls its distribution from `services.gradle.org` and deps from Maven Central
  / Google's Maven. When those are not in the Default Trusted allowlist, add them under **Network
  access → Custom** (keep the default package-manager list checked), or `aicc-queues` setup fails
  and that repo drops to triage-only. The npm registry `codebase` needs is in the default list.
- First run is slow (cold install / Gradle distribution download); cached afterward.

## 4. The prompt

Make the prompt **self-contained**: invoke the skill and state the guardrails, so a fresh session
has full context.

```
Run the /babysit-prs skill across my open PRs on Atllas-Inc/codebase and Atllas-Inc/aicc-queues.

For every open PR I authored, address unresolved review threads (bot AND teammate): fix the safe,
mechanical, test-covered ones; reply to all; and resolve ONLY threads you actually fixed and
verified (typecheck/lint/test green). Leave questions, judgment calls, and anything needing
visual proof OPEN, tagged for me. You start on the default branch, so `git fetch` and
`gh pr checkout <PR>` onto each PR's head branch before editing. Be idempotent: skip threads whose
last reply is already mine. End with the report table and an explicit "Needs you" list.
```

Keep the prompt pointing at the skill, so cloud and local runs stay identical and SKILL.md
improvements apply everywhere.

## 5. Triggers

- **Schedule (primary):** pick the **Hourly** preset. For a gentler off-minute cadence, create it,
  then `/schedule update` in the CLI to set cron `17 * * * *` (1-hour minimum is enforced).
- **GitHub event (optional):** **Add another trigger → GitHub event →** repo → **Pull request**,
  filtered to **Labels include `babysit`** (a manual "do this PR now" nudge) and/or
  **action `opened`**. This installs/uses the Claude GitHub App. It can **not** fire on comments,
  which is why the schedule is primary.
- **API (optional):** add this trigger when an external system must POST-trigger a run.

## 6. First-run validation (before trusting it)

`green` in the run list only means the session didn't crash. **Open the run transcript** to confirm
what actually happened. Verify two things:

1. **Setup succeeded:** confirm `yarn install` + a typecheck ran in-session. If not → triage-only
   until the env is fixed. Also confirm the skill was discovered (the prompt invoked `/babysit-prs`
   and it ran, rather than the agent improvising).
2. **Branch push works:** point it at one PR with a trivial nit and confirm a **commit lands on the
   PR head** + the thread gets a reply and resolve. Proves the unrestricted-push toggle took.

Until both are green, treat the Routine as **triage + reply + notify** and keep doing fixes locally.

## 7. Limits to know (research preview)

- **1-hour minimum** schedule cadence; runs may start a few minutes late (consistent stagger).
- Per-account **daily routine-run cap** + preview-phase **hourly webhook caps** on GitHub triggers.
  See current limits at claude.ai/code/routines. One-off runs don't count against the daily cap.
- Requires a **Pro/Max/Team/Enterprise** plan with **Claude Code on the web** enabled. Team/Ent
  Owners can disable Routines org-wide.
- Routines are **personal** to your account (not shared with teammates).
