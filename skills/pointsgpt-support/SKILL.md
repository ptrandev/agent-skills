---
name: pointsgpt-support
description: >
  Triages the PointsGPT #pointsgpt-support Slack alerts. For each member who asked for a person,
  finds out whether a product problem made them want to cancel, says how to resolve it, and
  replies in the alert thread. Also re-checks open threads and marks resolved ones. Use for
  "check the support channel", "triage support alerts", or "diagnose the cancel requests".
---

# pointsgpt-support

The channel is `#pointsgpt-support` (`C0C4PLFUP1P`). The bot `B0C4UCECPA8` posts one alert per
money or cancel message a member types in chat. An alert reads:

```
:raising_hand: *Needs a person within 24 hours* · <name> (<tier>) · <phone>
> <what they typed>
Earlier: _<q1>_ / _<q2>_ / _<q3>_
user <uuid>
```

## Input

- **Empty**: triage every alert with no reply in its thread, then run the sweep (Phase 5).
- **A Slack permalink or message ts**: triage that alert only. Skip the sweep.
- `--no-post`: write the replies in the final message. Post nothing.

## Hard rules

- **Never** cancel a subscription, refund a charge, or change an entitlement. A person decides
  each one. Write the exact Stripe id and deadline so that the person can act in one step.
- **Never** contact a member (text, email, or chat). The team replies to members.
- **Never** write to production. SQL runs with `read_only: true`, and Stripe calls are GET only.
- **Never** store or print the Stripe key. The scripts fetch it from Vault for each process.
- **Stripe is the authority** for trial and subscription state. The database misses cancels made
  in the Stripe dashboard. Read every deadline from Stripe `trial_end`, never from
  `entitlement.expires_at`, which runs a day late.

## Setup

Run from a pointsgpt checkout whose `.env` has `SUPABASE_ACCESS_TOKEN`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, and `LINEAR_API_KEY`. The scripts fall back to `~/Git/pointsgpt/.env`.
Set `S=<this skill dir>/scripts`.

| Script | Does |
|---|---|
| `node $S/user.mjs <uuid> [--since YYYY-MM-DD]` | One member: account, billing in the database, every Stripe subscription and charge, a timeline of turns, refusals, slow flags, searches and app events, and the full chat: every question, every answer, and every board row with stops, taxes, and seats |
| `node $S/q.mjs "<sql>"` | One read-only statement. Only the last statement's rows come back |
| `node $S/stripe.mjs "<path>"` | One Stripe GET, for example `subscriptions/sub_123` |

## Phase 1: Collect the alerts

1. Read the channel with `slack_read_channel(channel_id=C0C4PLFUP1P, limit=100)`.
2. Keep bot alerts whose thread has no reply. Skip people's messages and join notices.
3. Group the alerts by `user <uuid>`. One member gets one diagnosis.
4. Read any thread that a teammate replied to before you diagnose its member. Do not repeat a
   diagnosis that is already posted.

With more than 3 members, spawn one `sonnet` subagent per member for Phase 2. Give it this
skill's path and the uuid. Ask for the complete raw `user.mjs` output plus the facts it picked.
Read the output yourself before you write a verdict.

## Phase 2: Gather the facts

1. Run `node $S/user.mjs <uuid> --since <7 days before the alert>`.
2. Read the timeline in order: trial start, each question, each answer, the cancel request.
3. Note what the member asked for (route, dates, cabin, passengers, points) and what they got.
4. Read every board row before you describe a board. Count the rows by cabin, stops, and leg. A
   claim such as "the board showed only 1-stop fares" must hold for every row.
5. Do not shorten the dump with `head`, `cut`, or a subagent summary. A shortened answer or board
   leads to a wrong diagnosis.

**Read [references/diagnosis.md](references/diagnosis.md) when the dump shows a deleted account,
an empty chat, a refusal, an empty board, or a payment the database does not show.** It owns the
extra queries and the known causes.

## Phase 3: Decide

Answer two questions for each member:

1. **Did a problem with the product make them want to cancel?** Pick one cause from the table in
   [references/diagnosis.md](references/diagnosis.md). Name a bug only when the data shows it.
   If the product worked and the trip did not exist, say so.
2. **What resolves it?** Name the customer action and the product fix separately.

| Billing state in Stripe | Customer action |
|---|---|
| Trial live (`trialing`, not cancelled) | Cancel `<sub id>` before `<trial_end ET>`. Under 24 hours: urgent |
| Trial or subscription cancelled | None. Say who cancelled and when, and that they paid nothing |
| Paid and active, and our bug caused the complaint | A refund decision. State the amount and the charge id |
| Paid and active, and no bug | Cancel at period end. Refund is the team's call |
| No Stripe or App Store record | Nothing to cancel. Ask for a receipt if they say they paid |

When the cause is a new bug, search Linear for a ticket first. File one in Backlog when none
exists, and link it in the reply. Linear is the GraphQL API at `https://api.linear.app/graphql`
with `LINEAR_API_KEY` in the `Authorization` header and no `Bearer` prefix. The team key is `POI`.

## Phase 4: Reply

Post urgent replies first: a live trial that converts within 24 hours. Do not mention anyone in
a reply. Post the evidence, and leave pinging to the person who runs the skill.

Post with `slack_send_message(channel_id=C0C4PLFUP1P, thread_ts=<alert ts>, message=...)`. The
connector adds the "Sent using Claude" footer. Keep the reply under 120 words:

```
*Diagnosis: <the cause in one line>.*

<2 to 4 sentences of facts with ET times: what they asked, what they got, when they asked to cancel.>

*Action:* <one step with the Stripe id and the deadline>.   or   *No action needed.*
```

- Write plain English for a reader outside engineering. Name the member by first name.
- Use the exact Stripe ids and ET times.
- For a second alert from the same member, post one line with the permalink of the first reply.

## Phase 5: Sweep the open threads

For every alert thread whose last reply names an open action (a trial to cancel, a refund):

1. Check the Stripe state with `user.mjs` or `stripe.mjs`.
2. If the action is done, post `_Resolved._` and the fact that closes it.
3. If the action is open and a deadline falls within 48 hours, post `_Still open, due <day>._`
   with the id and the time.
4. Do not repost an open item without a deadline that was restated in the last 24 hours.

When a bug fix from an earlier diagnosis is live in production, post `_Resolved._` with the PR
and the production check, or `_Bug fixed. The customer action is still open._`.

## Final message

List each member in one line: the cause, the action, and the reply link. Put urgent deadlines
first. List new Linear tickets.
