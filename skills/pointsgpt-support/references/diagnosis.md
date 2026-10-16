# Diagnosis reference

This file owns the extra queries and the known causes for a support alert. Run the queries with
`node $S/q.mjs "<sql>"`, one statement per call.

## Gaps in the `user.mjs` dump

| Gap | What to do |
|---|---|
| `DELETED: no auth.users row` | The chat is gone. Rebuild the questions from `ask_flag.question` and `search_event` (both survive). A live Stripe subscription on a deleted account is a billing bug: see the deleted-account row below |
| No `chat_thread` rows, account exists | A web guest, or the thread was merged. Check `first_flow_billing_identity` (`source_user_id` is the guest, `target_user_id` the member) |
| Payment in Slack but not in `payment_ledger` | Search Stripe by subscription metadata: `node $S/stripe.mjs "subscriptions/search?query=metadata['supabase_user_id']:'<uuid>'"`. Some customers carry no metadata, so a customer search misses them |
| App Store purchase | `entitlement.store = 'APP_STORE'`, `granted_by = 'revenuecat'`. `last_event = 'CANCELLATION'` means they cancelled. No `payment_ledger` row means Apple never charged |
| Turn with `searches = 0` and a REFUSED line | The agent refused its own search call. Read the reason: a misread origin or destination is a bug |

A thread turn has no timestamp. Match a turn to an `agent_turn` row by `user_id` and
`question_len = length(q)`.

Is a fare really missing? Check stored availability for the route and dates:

```sql
select origin, destination, program_code, airlines, is_direct, min(mileage_cost) pts,
       max(remaining_seats) seats, max(crawled_at)::date seen
from award_row
where cabin = 'J' and origin = 'HKG' and destination in ('LAX','SFO')
  and flight_date between '2027-04-05' and '2027-04-25'
  and crawled_at > now() - interval '5 days'
group by 1,2,3,4,5 order by pts limit 15
```

Cabin codes are `Y`, `W`, `J`, `F`.

## Known causes

| Cause | Signs in the dump | Resolution |
|---|---|---|
| Trip not available on points | Empty boards, or fares far above what they asked; `award_row` agrees | No bug. Say the fare does not exist in our data. Cancel the trial if live |
| Answer ignored a constraint | Board cabin, origin, dates, or passengers differ from the question, and the answer does not say so | Bug. Quote the question and the board. Ticket if none exists |
| Refused search | REFUSED line, then "this search failed" or a needless confirm question | Bug (POI-947 fixed the empty-origin case on 13 Oct 2026). A new reason needs a ticket |
| Slow turns | `flag slow` over 30 s, or a turn the member stopped | Speed. Report the seconds |
| Stored paywall or blurred board after paying | Upgrade tapped, then a complaint within minutes | POI-780 fixed it on 3 Oct 2026. Confirm Pro in Stripe and say the board predates the payment |
| Trial cancel to avoid the charge | Cancel request minutes after the trial started, with good results | No bug. Make sure that the trial is cancelled before `trial_end` |
| Asked how to cancel | "How do I cancel" with no complaint. The chat answers that a person will be in touch | Cancel for them, or point to Settings, Manage subscription |
| Deleted account, live subscription | `DELETED` and a `trialing`, `active`, or `past_due` subscription | POI-976: the account function cancels only `status=active` subscriptions found by customer metadata. Cancel the subscription. Refund any charge after the deletion |
| Bot advised against paying | The answer comments on whether Pro is worth it | Fixed 13 Oct 2026 by a prompt rule and an answer check. A new case needs a ticket |
| Marketing texts after a cancel request | `sms_campaign_recipient` rows after the request | POI-948 |

## Texts after a cancel request

```sql
select c.slug, r.delivered, c.sent_at
from sms_campaign_recipient r join sms_campaign c on c.id = r.campaign_id
where r.user_id = '<uuid>' order by c.sent_at
```
