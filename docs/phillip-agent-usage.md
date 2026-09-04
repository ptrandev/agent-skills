# Using `/phillip`

`phillip` reviews and fixes your current diff before you open a PR. Claude Code invokes it as
`/phillip`. Codex invokes it as `$phillip`.

## Set up once

Give Claude Code the complete
[`phillip-agent-setup.md`](phillip-agent-setup.md) task. It installs the required tools, clones
this repository, links the skills, and verifies the result.

The setup task pauses only for actions that require you, such as browser authentication or adding
API keys locally. **Never paste an API key into chat.**

## Run it

Invoke the skill before you push:

```text
/phillip
```

It reviews committed, staged, and unstaged changes against the repository's default branch.

| Mode | Use it for |
|---|---|
| `/phillip` | Substantive changes. Runs the full multi-reviewer loop. |
| `/phillip quick` | Small, low-risk changes. Runs one review round. |

Tiny or documentation-only diffs can scale down automatically.

## Read the result

The report lists each finding, its severity, location, reviewer, and resolution.

| Verdict | What to do |
|---|---|
| **Ready for PR** | The final review round was clean. Push the change. |
| **Needs human review** | The round limit was reached before the latest fixes were confirmed. Review those fixes yourself. |
| Any unresolved-item verdict | Read the listed items before shipping. |

The active host also saves the report in its plans directory.

## Rubric updates

`phillip-sync` refreshes the shared rubric from recurring patterns in resolved PR feedback. It
runs automatically before `phillip`, observes a per-repository cooldown, and never blocks a
review when GitHub is unavailable.

Run `/phillip-sync` directly to request an immediate refresh. Curate the result in
`~/Git/agent-skills/phillip/RUBRIC.md`.

## Update

The skills are symlinked from this repository:

```bash
cd ~/Git/agent-skills
git pull
```
