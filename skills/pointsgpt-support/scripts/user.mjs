// Usage: node user.mjs <user uuid> [--since 2026-10-01]
// Prints one PointsGPT member's account, billing (database and Stripe, including linked guest
// identities), activity, and chat. Account, activity, and chat use the requested UUID only.
// Read-only: SQL runs with read_only, and Stripe calls are GET.
import { collectBilling, formatBilling, isIsoDate, isUuid, sqlDb } from "./billing.mjs";
import { et, sql, stripe } from "./env.mjs";

const id = process.argv[2];
if (!isUuid(id)) throw new Error("usage: node user.mjs <user uuid>");
const sinceAt = process.argv.indexOf("--since");
const since = sinceAt > 0 ? process.argv[sinceAt + 1] : "2026-01-01";
if (!isIsoDate(since)) throw new Error("usage: --since takes a real date as YYYY-MM-DD");

const one = async (q) => (await sql(q))[0] ?? null;
const rows = (q) => sql(q);
const line = (s = "") => console.log(s);
const indent = (s) => (s ?? "").trim().replace(/\n+/g, "\n   ");
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

// Account
const auth = await one(`select created_at, last_sign_in_at from auth.users where id='${id}'`);
const wl = await one(
  `select name, phone, email, source, home_origin, joined_at, sms_opted_out_at, stripe_customer_id
   from waitlist where user_id='${id}'`,
);
line(`== Account ${id}`);
line(auth ? `exists, created ${et(auth.created_at)}, last sign-in ${et(auth.last_sign_in_at)}` : "DELETED: no auth.users row (waitlist, entitlement, chat_thread cascade away)");
if (wl) line(`waitlist: ${wl.name} · ${wl.phone} · ${wl.email ?? "no email"} · ${wl.source} · home ${wl.home_origin} · joined ${et(wl.joined_at)} · sms opt-out ${et(wl.sms_opted_out_at) ?? "no"}`);

// Billing covers the requested user plus the guest identities linked into it (billing.mjs).
// Stripe is the authority: the database misses cancels made in the dashboard.
line();
const ent = await one(`select tier, is_active, expires_at, store, product_id, last_event, granted_by, updated_at from entitlement where user_id='${id}'`);
const report = await collectBilling({ target: id, db: sqlDb(sql), stripe });
for (const l of formatBilling(report, { et, entitlement: ent })) line(l);

// Activity, oldest first
line(`\n== Activity since ${since} (ET)`);
const events = [
  ...(await rows(`select at, ms, searches, faults, refusals, fell_back, model from agent_turn where user_id='${id}' and at>='${since}'`)).map((t) => ({
    at: t.at,
    text: `turn ${Math.round(t.ms / 1000)} s · ${t.searches} searches${t.fell_back ? " · fell back" : ""}` +
      `${t.faults?.length ? ` · faults ${JSON.stringify(t.faults)}` : ""}` +
      `${t.refusals?.length ? ` · REFUSED: ${t.refusals.map((r) => r.reason).join(" | ")}` : ""}`,
  })),
  ...(await rows(`select at, kind, elapsed_ms, question from ask_flag where user_id='${id}' and at>='${since}'`)).map((f) => ({
    at: f.at,
    text: `flag ${f.kind} ${Math.round((f.elapsed_ms ?? 0) / 1000)} s · "${f.question ?? ""}"`,
  })),
  ...(await rows(`select at, origin, destinations, cabin, rows_returned, live from search_event where user_id='${id}' and kind='search' and at>='${since}'`)).map((e) => ({
    at: e.at,
    text: `search ${e.origin}→${(e.destinations ?? []).join(",")} ${e.cabin ?? ""} · ${e.rows_returned ?? "?"} rows${e.live ? " · live" : ""}`,
  })),
  ...(await rows(`select at, kind, meta from client_event where user_id='${id}' and at>='${since}'`)).map((e) => ({
    at: e.at,
    text: `client ${e.kind} ${JSON.stringify(e.meta)}`,
  })),
].sort((a, b) => new Date(a.at) - new Date(b.at));
for (const e of events) line(`${et(e.at)} · ${e.text}`);

// Conversation, in full: a cut answer or a board trimmed to its first rows misstates what the member saw.
// chat_thread turns carry no timestamps; updated_at is the latest turn.
line("\n== Chat");
const threads = await rows(`select id, title, updated_at, turns from chat_thread where user_id='${id}' order by updated_at`);
if (!threads.length) line("no chat_thread rows (account deleted, or web guest). Use the ask_flag questions above.");
const fare = (r) =>
  [
    `${r.leg ? `[${r.leg}] ` : ""}${r.origin}→${r.destination} ${r.flight_date ?? ""} ${r.cabin ?? ""}`,
    `${r.mileage_cost ?? r.card?.price?.big ?? "?"} pts`,
    r.program_code,
    r.is_direct ? "nonstop" : "1+ stop",
    r.total_taxes != null ? `${usd(r.total_taxes)} tax` : null,
    r.remaining_seats ? `${r.remaining_seats} seats` : null,
    r.card?.sub ? `(${r.card.sub})` : null,
  ].filter(Boolean).join(" · ");
for (const th of threads) {
  line(`-- ${th.title} (last ${et(th.updated_at)})`);
  for (const t of th.turns ?? []) {
    const a = t.a ?? {};
    line(`Q: ${indent(t.q) || "(server-sent message)"}`);
    line(`A: ${indent(a.answer)}`);
    const board = a.rows ?? [];
    if (board.length) line(`   board, ${board.length} rows:\n${board.map((r) => `     ${fare(r)}`).join("\n")}`);
  }
}
