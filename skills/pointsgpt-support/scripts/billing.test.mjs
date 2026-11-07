/**
 * Tests for billing.mjs with synthetic identities and Stripe fixtures. No network, no .env.
 *
 * Run: node --test "skills/pointsgpt-support/scripts/*.test.mjs"
 */

import assert from "node:assert/strict";
import test from "node:test";

import { collectBilling, errorKind, formatBilling, identitiesOf, isIsoDate, priceText, sqlDb } from "./billing.mjs";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = uid(1); // requested member
const G = uid(2); // guest linked into T
const H = uid(3); // guest linked into G
const S = uid(4); // sibling: another guest linked into T
const NOW = Date.UTC(2026, 10, 7, 12) / 1000;
const et = (v) => (v == null ? null : `ET(${v})`);

/** In-memory db with the sqlDb interface. Each call is logged. */
function fakeDb({ links = [], stripeTrials = [], appstoreTrials = [], payments = [], waitlist = [], billingCustomers = [], fail = {} } = {}) {
  const calls = [];
  const by = (rows, ids, limit) => rows.filter((r) => ids.includes(r.user_id)).slice(0, limit);
  const run = (name, args, fn) => {
    calls.push([name, ...args]);
    if (fail[name]) throw new Error(fail[name]);
    return fn();
  };
  return {
    calls,
    incomingLinks: async (targets, limit) =>
      run("incomingLinks", [targets, limit], () => links.filter((l) => targets.includes(l.target_user_id)).slice(0, limit)),
    outgoingLink: async (id) => run("outgoingLink", [id], () => links.find((l) => l.source_user_id === id) ?? null),
    stripeTrials: async (ids, limit) => run("stripeTrials", [ids, limit], () => by(stripeTrials, ids, limit)),
    appstoreTrials: async (ids, limit) => run("appstoreTrials", [ids, limit], () => by(appstoreTrials, ids, limit)),
    payments: async (ids, limit) => run("payments", [ids, limit], () => by(payments, ids, limit)),
    waitlistCustomers: async (ids, limit) => run("waitlistCustomers", [ids, limit], () => by(waitlist, ids, limit)),
    billingCustomers: async (ids, limit) =>
      run("billingCustomers", [ids, limit], () => billingCustomers.filter((r) => ids.includes(r.source_user_id)).slice(0, limit)),
  };
}
const link = (source, target, at = "2026-11-01T10:00:00Z") => ({ source_user_id: source, target_user_id: target, linked_at: at });

/**
 * Stripe GET router over fixtures. `override[path]` returns a body or throws an Error.
 * A customer id with no fixture reads as a customer without metadata.
 */
function fakeStripe({ subscriptions = [], customers = [], charges = [], override = {} } = {}) {
  const calls = [];
  const list = (data) => ({ object: "list", data, has_more: false });
  const fn = async (path) => {
    calls.push(path);
    if (path in override) {
      const o = override[path];
      if (o instanceof Error) throw o;
      return o;
    }
    const [route, qs = ""] = path.split("?");
    const p = new URLSearchParams(qs);
    const meta = (p.get("query") ?? "").match(/'([0-9a-f-]{36})'/)?.[1];
    if (route === "subscriptions/search") return list(subscriptions.filter((s) => s.metadata?.supabase_user_id === meta));
    if (route === "customers/search") return list(customers.filter((c) => c.metadata?.supabase_user_id === meta));
    if (route === "subscriptions") return list(subscriptions.filter((s) => s.customer === p.get("customer")));
    if (route === "charges") return list(charges.filter((c) => c.customer === p.get("customer")));
    const sub = route.match(/^subscriptions\/(sub_\w+)$/)?.[1];
    if (sub) return subscriptions.find((s) => s.id === sub) ?? { error: { type: "invalid_request_error", code: "resource_missing" } };
    const cus = route.match(/^customers\/(cus_\w+)$/)?.[1];
    if (cus) return customers.find((c) => c.id === cus) ?? { id: cus, object: "customer", metadata: {} };
    throw new Error(`unrouted ${path}`);
  };
  fn.calls = calls;
  return fn;
}
const sub = (id, customer, status, user, extra = {}) => ({
  id, object: "subscription", customer, status, cancel_at_period_end: false, canceled_at: null, trial_end: null,
  metadata: user ? { supabase_user_id: user } : {},
  items: { data: [{ price: { unit_amount: 1999, recurring: { interval: "month" } } }] },
  ...extra,
});
const charge = (id, customer, extra = {}) => ({ id, customer, amount: 1999, amount_refunded: 0, status: "succeeded", created: NOW - 3600, ...extra });

const run = async (opts) => {
  const report = await collectBilling(opts);
  return { report, text: formatBilling(report, { et, now: NOW * 1000 }).join("\n") };
};

test("no links: only the requested identity, direct live trial", async () => {
  const db = fakeDb();
  const stripe = fakeStripe({ subscriptions: [sub("sub_T1", "cus_T", "trialing", T, { trial_end: NOW + 7200 })] });
  const { report, text } = await run({ target: T, db, stripe });
  assert.deepEqual(report.identities.map((i) => i.id), [T]);
  assert.equal(report.complete, true);
  assert.equal(report.linkedInto, null);
  assert.match(text, new RegExp(`${T} \\(requested\\)`));
  assert.match(text, /LIVE TRIAL: charges \$19.99 .*\(2.0 h from now\)/);
});

test("no links and no billing: a complete, explicit no-subscription line", async () => {
  const { report, text } = await run({ target: T, db: fakeDb(), stripe: fakeStripe() });
  assert.equal(report.complete, true);
  assert.match(text, /no Stripe subscription found for 1 identity/);
  assert.doesNotMatch(text, /INCOMPLETE/);
});

test("linked guest paid, member's direct checkout incomplete: both shown and attributed", async () => {
  const db = fakeDb({
    links: [link(G, T)],
    stripeTrials: [{ user_id: G, subscription_id: "sub_paid", plan: "monthly", started_at: "2026-11-01T09:00:00Z" }],
    payments: [{ user_id: G, provider: "stripe", payment_id: "ch_paid", amount_usd: 19.99, paid_at: "2026-11-01T09:00:00Z", kind: "subscription" }],
  });
  const stripe = fakeStripe({
    subscriptions: [sub("sub_paid", "cus_G", "active", G), sub("sub_direct", "cus_T", "incomplete", T)],
    charges: [charge("ch_paid", "cus_G"), charge("ch_failed", "cus_T", { status: "failed" })],
  });
  const { report, text } = await run({ target: T, db, stripe });

  assert.deepEqual(report.identities, [
    { id: T, depth: 0, link: null },
    { id: G, depth: 1, link: { source: G, target: T, linked_at: "2026-11-01T10:00:00Z" } },
  ]);
  for (const name of ["stripeTrials", "appstoreTrials", "payments", "waitlistCustomers"]) {
    assert.deepEqual(db.calls.find((c) => c[0] === name)[1], [T, G], `${name} uses the exact linked UUIDs`);
  }
  for (const u of [T, G]) {
    const q = encodeURIComponent(`metadata['supabase_user_id']:'${u}'`);
    assert.ok(stripe.calls.includes(`subscriptions/search?query=${q}&limit=100`));
    assert.ok(stripe.calls.includes(`customers/search?query=${q}&limit=100`));
  }
  assert.deepEqual([...identitiesOf(report, "sub", "sub_paid")], [G]);
  assert.deepEqual([...identitiesOf(report, "sub", "sub_direct")], [T]);
  assert.match(text, new RegExp(`${G} \\(linked, depth 1\\) · linked into ${T} at ET\\(2026-11-01T10:00:00Z\\)`));
  assert.match(text, new RegExp(`payment_ledger \\[${G} \\(linked, depth 1\\)\\]`));
  assert.match(text, /sub_paid · active · customer cus_G/);
  assert.match(text, new RegExp(`from ${G} \\(linked, depth 1\\) via stripe_trial ${G}; subscription metadata ${G}`));
  assert.match(text, /sub_direct · incomplete · customer cus_T/);
  assert.match(text, new RegExp(`charge ch_paid · \\$19.99 · succeeded .* from ${G} \\(linked, depth 1\\)`));
  assert.match(text, new RegExp(`charge ch_failed · \\$19.99 · failed .* from ${T} \\(requested\\)`));
  assert.equal(report.complete, true);
});

test("duplicates: each subscription, customer, and charge is read and printed once", async () => {
  const db = fakeDb({
    links: [link(G, T)],
    stripeTrials: [
      { user_id: G, subscription_id: "sub_paid" },
      { user_id: T, subscription_id: "sub_paid" },
    ],
    waitlist: [{ user_id: T, stripe_customer_id: "cus_G" }, { user_id: G, stripe_customer_id: "cus_G" }],
  });
  const stripe = fakeStripe({
    subscriptions: [sub("sub_paid", "cus_G", "active", G)],
    customers: [{ id: "cus_G", metadata: { supabase_user_id: G } }, { id: "cus_G", metadata: { supabase_user_id: T } }],
    charges: [charge("ch_paid", "cus_G")],
  });
  const { report, text } = await run({ target: T, db, stripe });
  const counts = stripe.calls.reduce((m, p) => m.set(p, (m.get(p) ?? 0) + 1), new Map());
  assert.ok([...counts.values()].every((n) => n === 1), "no Stripe path is read twice");
  assert.ok(!stripe.calls.includes("subscriptions/sub_paid"), "a search result is not retrieved again");
  assert.equal(stripe.calls.filter((p) => p.startsWith("charges?customer=cus_G")).length, 1);
  assert.equal(report.subscriptions.length, 1);
  assert.equal(report.customers.length, 1);
  assert.equal(report.charges.length, 1);
  assert.equal(text.match(/^sub_paid · /gm).length, 1);
  assert.equal(text.match(/^charge ch_paid /gm).length, 1);
  assert.deepEqual([...identitiesOf(report, "sub", "sub_paid")].sort(), [T, G].sort());
});

test("outgoing link and siblings are never followed", async () => {
  const db = fakeDb({ links: [link(G, T), link(S, T), link(H, G)] });
  const stripe = fakeStripe({ subscriptions: [sub("sub_S", "cus_S", "active", S), sub("sub_T", "cus_T", "active", T)] });
  const { report, text } = await run({ target: G, db, stripe });
  assert.deepEqual(report.identities.map((i) => i.id), [G, H]);
  assert.equal(report.linkedInto.target_user_id, T);
  assert.equal(report.subscriptions.length, 0);
  assert.ok(stripe.calls.every((p) => !p.includes(T) && !p.includes(S)));
  assert.match(text, new RegExp(`note: ${G} is itself a source linked into ${T}`));
});

test("cycles are reported and every identity on them is read once", async () => {
  const A = uid(10), B = uid(11);
  const { report, text } = await run({ target: A, db: fakeDb({ links: [link(A, B), link(B, A)] }), stripe: fakeStripe() });
  assert.deepEqual(report.identities.map((i) => i.id), [A, B]);
  assert.deepEqual(report.issues.map((i) => i.kind), ["cycle"]);
  assert.equal(report.complete, true);
  assert.match(text, /evidence cycle: /);

  const self = await collectBilling({ target: T, db: fakeDb({ links: [link(T, T)] }), stripe: fakeStripe() });
  assert.deepEqual(self.identities.map((i) => i.id), [T]);
  assert.equal(self.issues[0].kind, "cycle");
});

test("depth bound: a chain past maxDepth is cut and reported as incomplete", async () => {
  const chain = [T, uid(21), uid(22), uid(23), uid(24)];
  const links = chain.slice(1).map((u, i) => link(u, chain[i]));
  const { report, text } = await run({ target: T, db: fakeDb({ links }), stripe: fakeStripe(), limits: { maxDepth: 3 } });
  assert.deepEqual(report.identities.map((i) => i.depth), [0, 1, 2, 3]);
  assert.equal(report.issues[0].kind, "depth");
  assert.equal(report.complete, false);
  assert.match(text, /INCOMPLETE EVIDENCE/);
  assert.match(text, /no Stripe subscription in the reads that succeeded/);
  assert.doesNotMatch(text, /no Stripe subscription found/);
});

test("depth bound: a chain that ends at maxDepth is complete", async () => {
  const chain = [T, uid(21), uid(22), uid(23)];
  const links = chain.slice(1).map((u, i) => link(u, chain[i]));
  const report = await collectBilling({ target: T, db: fakeDb({ links }), stripe: fakeStripe(), limits: { maxDepth: 3 } });
  assert.equal(report.identities.length, 4);
  assert.equal(report.complete, true);
});

test("identity bound: extra sources are cut and reported", async () => {
  const links = [31, 32, 33, 34, 35].map((n) => link(uid(n), T));
  const db = fakeDb({ links });
  const report = await collectBilling({ target: T, db, stripe: fakeStripe(), limits: { maxIdentities: 3 } });
  assert.equal(report.identities.length, 3);
  assert.equal(report.issues.filter((i) => i.kind === "identity_cap").length, 1);
  assert.equal(report.complete, false);
  assert.ok(db.calls.find((c) => c[0] === "incomingLinks")[2] >= 3, "the link query asks for one row past the cap");
});

test("invalid ids: rejected target, skipped link source, Stripe ids never sent", async () => {
  await assert.rejects(collectBilling({ target: "not-a-uuid", db: fakeDb(), stripe: fakeStripe() }), /lowercase user uuid/);
  await assert.rejects(collectBilling({ target: "0000000A-0000-4000-8000-00000000000B", db: fakeDb(), stripe: fakeStripe() }), /lowercase user uuid/);
  const db = fakeDb({
    links: [link("x' or '1'='1", T)],
    stripeTrials: [{ user_id: T, subscription_id: "sub_1'; drop table x" }],
    waitlist: [{ user_id: T, stripe_customer_id: "cus_../charges" }],
  });
  const stripe = fakeStripe();
  const { report, text } = await run({ target: T, db, stripe });
  assert.deepEqual(report.identities.map((i) => i.id), [T]);
  assert.equal(report.issues.filter((i) => i.kind === "invalid").length, 3);
  assert.ok(stripe.calls.every((p) => !p.includes("drop") && !p.includes("..")));
  assert.equal(report.complete, false);
  assert.match(text, /evidence invalid: link source/);
});

test("Stripe failures: error bodies and thrown errors never print credentials", async () => {
  const q = encodeURIComponent(`metadata['supabase_user_id']:'${T}'`);
  const stripe = fakeStripe({
    override: {
      [`subscriptions/search?query=${q}&limit=100`]: { error: { type: "invalid_request_error", message: "Invalid API Key provided: sk_live_SECRETabc" } },
      // An opaque credential that no mask pattern knows.
      [`customers/search?query=${q}&limit=100`]: Object.assign(new TypeError("connect failed, key=opaqueSECRET42"), { code: "ECONNRESET" }),
    },
  });
  const { report, text } = await run({ target: T, db: fakeDb(), stripe });
  assert.equal(report.complete, false);
  assert.deepEqual(report.issues.map((i) => i.kind), ["failed", "failed"]);
  assert.match(text, /evidence failed: subscription metadata search .*\(stripe invalid_request_error\)/);
  assert.match(text, /evidence failed: customer metadata search .*\(TypeError ECONNRESET\)/);
  assert.doesNotMatch(text, /SECRET/);
  assert.doesNotMatch(text, /no Stripe subscription found/);
});

test("Stripe truncation and a failed subscription read are explicit", async () => {
  const db = fakeDb({ stripeTrials: [{ user_id: T, subscription_id: "sub_gone" }], waitlist: [{ user_id: T, stripe_customer_id: "cus_T" }] });
  const stripe = fakeStripe({
    charges: [charge("ch_1", "cus_T")],
    override: { "charges?customer=cus_T&limit=100": { object: "list", data: [charge("ch_1", "cus_T")], has_more: true } },
  });
  const { report, text } = await run({ target: T, db, stripe });
  assert.match(text, /sub_gone · READ FAILED · from .*\(requested\) via stripe_trial/);
  assert.match(text, /evidence failed: subscription sub_gone \(stripe invalid_request_error\/resource_missing\)/);
  assert.match(text, /evidence truncated: charges of cus_T \(first 1 results\)/);
  assert.equal(report.complete, false);
});

test("a list response without data is a failed read", async () => {
  const q = encodeURIComponent(`metadata['supabase_user_id']:'${T}'`);
  const stripe = fakeStripe({ override: { [`subscriptions/search?query=${q}&limit=100`]: { object: "list" } } });
  const report = await collectBilling({ target: T, db: fakeDb(), stripe });
  assert.equal(report.issues[0].detail, "response has no data list");
});

test("database failures and row bounds are explicit", async () => {
  const db = fakeDb({
    payments: [1, 2, 3].map((n) => ({ user_id: T, payment_id: `ch_${n}` })),
    fail: { stripeTrials: "sql: {\"message\":\"permission denied\",\"note\":\"opaqueSECRET42\"}" },
  });
  const { report, text } = await run({ target: T, db, stripe: fakeStripe(), limits: { maxRows: 2 } });
  assert.equal(report.database.payments.length, 2);
  assert.match(text, /evidence failed: stripe_trial \(Error\)$/m);
  assert.match(text, /evidence truncated: payment_ledger \(first 2 rows\)/);
  assert.doesNotMatch(text, /SECRET/);
  assert.equal(report.complete, false);
});

test("a failed link query stops the walk and marks the evidence incomplete", async () => {
  const report = await collectBilling({ target: T, db: fakeDb({ fail: { incomingLinks: "timeout" } }), stripe: fakeStripe() });
  assert.deepEqual(report.identities.map((i) => i.id), [T]);
  assert.equal(report.complete, false);
});

test("sqlDb emits read-only selects on exact, validated ids", async () => {
  const seen = [];
  const db = sqlDb(async (q) => (seen.push(q), []));
  await db.incomingLinks([T, G], 5);
  await db.outgoingLink(T);
  await db.stripeTrials([T, G], 101);
  await db.appstoreTrials([T], 101);
  await db.payments([T], 101);
  await db.waitlistCustomers([T], 101);
  await db.billingCustomers([T, G], 101);
  assert.equal(seen.length, 7);
  for (const q of seen) {
    assert.match(q, /^select /);
    assert.doesNotMatch(q, /;|\b(insert|update|delete|drop|alter)\b/i);
  }
  assert.match(seen[0], new RegExp(`target_user_id in \\('${T}','${G}'\\).* limit 5$`, "s"));
  assert.match(seen[1], new RegExp(`source_user_id = '${T}'$`));
  assert.match(seen[6], new RegExp(`from first_flow_billing_customer\\s+where source_user_id in \\('${T}','${G}'\\)`));
  assert.throws(() => db.payments([T, "x' or 1=1 --"], 1), /lowercase uuid/);
  assert.throws(() => db.payments([], 1), /lowercase uuid/);
  assert.throws(() => db.payments([T], "1; drop"), /positive integer/);
});

test("errorKind keeps only a known name and an uppercase code, never the message", () => {
  assert.equal(errorKind(new Error("Bearer opaqueSECRET42")), "Error");
  assert.equal(errorKind(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })), "TypeError ECONNREFUSED");
  assert.equal(errorKind(Object.assign(new Error("x"), { name: "opaqueSECRET42" })), "error");
  assert.equal(errorKind(Object.assign(new Error("x"), { code: "opaqueSECRET42" })), "Error");
  assert.equal(errorKind("a thrown string"), "error");
  assert.equal(errorKind(null), "error");
});

test("first_flow_billing_customer maps a customer without metadata, with its provenance", async () => {
  const db = fakeDb({
    links: [link(G, T)],
    billingCustomers: [{ source_user_id: G, customer_id: "cus_M", created_at: "2026-11-01T09:00:00Z" }],
  });
  const stripe = fakeStripe({
    subscriptions: [sub("sub_M", "cus_M", "active", null)],
    charges: [charge("ch_M", "cus_M")],
  });
  const { report, text } = await run({ target: T, db, stripe });
  assert.deepEqual(db.calls.find((c) => c[0] === "billingCustomers")[1], [T, G]);
  assert.ok(stripe.calls.includes("customers/cus_M"), "the mapped customer is read to check its metadata");
  assert.deepEqual([...identitiesOf(report, "sub", "sub_M")], [G]);
  assert.match(text, new RegExp(`first_flow_billing_customer \\[${G} \\(linked, depth 1\\)\\]: \\{"customer_id":"cus_M"`));
  assert.match(text, /from .* via listed under cus_M · no supabase_user_id metadata: attributed only by the provenance above/);
  assert.match(text, new RegExp(`charge ch_M .* customer cus_M · from ${G} \\(linked, depth 1\\)`));
  const cus = report.customers.find((c) => c.id === "cus_M");
  assert.deepEqual(cus.via[0], { how: "first_flow_billing_customer", ref: G });
  assert.equal(report.complete, true);
});

const U = uid(99); // a user outside the resolved identities

test("shared customer: another user's subscription is excluded and its charges are withheld", async () => {
  const db = fakeDb({ waitlist: [{ user_id: T, stripe_customer_id: "cus_shared" }] });
  const stripe = fakeStripe({
    customers: [{ id: "cus_shared", object: "customer", metadata: {} }],
    subscriptions: [sub("sub_mine", "cus_shared", "active", T), sub("sub_other", "cus_shared", "active", U)],
    charges: [charge("ch_mine", "cus_shared"), charge("ch_other", "cus_shared")],
  });
  const { report, text } = await run({ target: T, db, stripe });
  assert.deepEqual(report.subscriptions.map((s) => s.id), ["sub_mine"]);
  assert.equal(report.charges.length, 0);
  assert.equal(report.withheldCharges, 2);
  assert.equal(report.complete, false);
  assert.match(text, new RegExp(`evidence conflict: subscription sub_other has supabase_user_id metadata ${U}`));
  assert.match(text, /evidence conflict: customer cus_shared also holds sub_other .*\(charges of this customer are not attributed\)/);
  assert.match(text, /2 charge\(s\) not attributed/);
  assert.doesNotMatch(text, /^sub_other · /m);
  assert.doesNotMatch(text, /^charge /m);
  assert.ok(stripe.calls.every((p) => !p.includes(U)), "the other user is never searched");
});

test("conflicting customer: an explicit mapping to another user's customer is not followed", async () => {
  const db = fakeDb({ billingCustomers: [{ source_user_id: T, customer_id: "cus_X", created_at: "2026-11-01T09:00:00Z" }] });
  const stripe = fakeStripe({
    customers: [{ id: "cus_X", object: "customer", metadata: { supabase_user_id: U } }],
    subscriptions: [sub("sub_X", "cus_X", "active", null)],
    charges: [charge("ch_X", "cus_X")],
  });
  const { report, text } = await run({ target: T, db, stripe });
  assert.ok(!stripe.calls.some((p) => p.startsWith("subscriptions?customer=cus_X") || p.startsWith("charges?customer=cus_X")));
  assert.equal(report.customers.length, 0);
  assert.equal(report.subscriptions.length, 0);
  assert.equal(report.complete, false);
  assert.match(text, new RegExp(`evidence conflict: customer cus_X has supabase_user_id metadata ${U}`));
  assert.match(text, /no Stripe subscription in the reads that succeeded/);
});

test("a charge whose own metadata names another user is withheld, even under an unowned customer", async () => {
  const db = fakeDb({ waitlist: [{ user_id: T, stripe_customer_id: "cus_T" }] });
  const stripe = fakeStripe({
    subscriptions: [sub("sub_T", "cus_T", "active", T)],
    charges: [
      charge("ch_plain", "cus_T"),
      charge("ch_other", "cus_T", { metadata: { supabase_user_id: U } }),
      charge("ch_own", "cus_T", { metadata: { supabase_user_id: T } }),
    ],
  });
  const { report, text } = await run({ target: T, db, stripe });
  assert.deepEqual(report.charges.map((c) => c.id), ["ch_plain", "ch_own"]);
  assert.equal(report.withheldCharges, 1);
  assert.deepEqual(report.subscriptions.map((s) => s.id), ["sub_T"]);
  assert.equal(report.complete, false);
  assert.match(text, new RegExp(`evidence conflict: charge ch_other under cus_T has supabase_user_id metadata ${U}.*\\(charge withheld\\)`));
  assert.match(text, /1 charge\(s\) not attributed/);
  assert.doesNotMatch(text, /^charge ch_other /m);
});

test("conflicting customer: own-metadata and stored-mapping subscriptions stay with a warning, others are never attributed", async () => {
  const db = fakeDb({ stripeTrials: [{ user_id: T, subscription_id: "sub_trial" }] });
  const stripe = fakeStripe({
    customers: [{ id: "cus_X", object: "customer", metadata: { supabase_user_id: U } }],
    subscriptions: [
      sub("sub_direct", "cus_X", "active", T),
      sub("sub_trial", "cus_X", "trialing", null, { trial_end: NOW + 3600 }),
      sub("sub_nometa", "cus_X", "active", null),
    ],
    charges: [charge("ch_X", "cus_X")],
  });
  const { report, text } = await run({ target: T, db, stripe });
  assert.deepEqual(report.subscriptions.map((s) => s.id).sort(), ["sub_direct", "sub_trial"]);
  assert.ok(report.subscriptions.every((s) => s.customerConflict === U));
  assert.equal(report.charges.length, 0);
  assert.ok(!stripe.calls.some((p) => p.includes("customer=cus_X")), "the conflicting customer is never listed");
  assert.equal(report.complete, false);
  assert.match(text, new RegExp(`evidence conflict: customer cus_X has supabase_user_id metadata ${U}`));
  assert.equal(text.match(new RegExp(`WARNING: customer cus_X has supabase_user_id metadata ${U}`, "g")).length, 2);
  assert.match(text, new RegExp(`sub_direct · active .*\\n  from ${T} \\(requested\\) via subscription metadata ${T} · metadata user ${T}`));
  assert.match(text, /sub_trial · trialing .*\n  from .* via stripe_trial .* no supabase_user_id metadata/);
  assert.doesNotMatch(text, /sub_nometa|ch_X|no Stripe subscription/);
});

// A customer with one charge that has no metadata and one that names the member.
const unresolvedCase = async ({ override = {}, limits, subscriptions = [sub("sub_a", "cus_T", "active", T)] } = {}) => {
  const db = fakeDb({ stripeTrials: [{ user_id: T, subscription_id: "sub_a" }], waitlist: [{ user_id: T, stripe_customer_id: "cus_T" }] });
  const stripe = fakeStripe({
    subscriptions,
    charges: [charge("ch_plain", "cus_T"), charge("ch_own", "cus_T", { metadata: { supabase_user_id: T } })],
    override,
  });
  return run({ target: T, db, stripe, limits });
};
const LIST_T = "subscriptions?customer=cus_T&status=all&limit=100";
const assertUnresolved = ({ report, text }) => {
  assert.deepEqual(report.charges.map((c) => c.id), ["ch_own"], "only the charge with matching metadata is attributed");
  assert.equal(report.withheldCharges, 1);
  assert.equal(report.complete, false);
  assert.match(text, /evidence unresolved: charges of cus_T \(its subscription list is incomplete/);
  assert.doesNotMatch(text, /^charge ch_plain /m);
};

test("complete subscription list: every charge of the customer is attributed", async () => {
  const { report } = await unresolvedCase();
  assert.deepEqual(report.charges.map((c) => c.id), ["ch_plain", "ch_own"]);
  assert.equal(report.complete, true);
});

test("failed subscription list: unproven charges are withheld", async () => {
  assertUnresolved(await unresolvedCase({ override: { [LIST_T]: { error: { type: "api_error" } } } }));
  assertUnresolved(await unresolvedCase({ override: { [LIST_T]: new TypeError("network") } }));
});

test("malformed subscription list: unproven charges are withheld", async () => {
  assertUnresolved(await unresolvedCase({ override: { [LIST_T]: { object: "list" } } }));
});

test("subscription list with has_more: unproven charges are withheld", async () => {
  const r = await unresolvedCase({ override: { [LIST_T]: { object: "list", data: [sub("sub_a", "cus_T", "active", T)], has_more: true } } });
  assertUnresolved(r);
  assert.match(r.text, /evidence truncated: subscriptions of cus_T \(first 1 results\)/);
});

test("subscription cap skips a listed subscription: unproven charges are withheld", async () => {
  const r = await unresolvedCase({
    limits: { maxSubscriptions: 1 },
    subscriptions: [sub("sub_a", "cus_T", "active", T), sub("sub_b", "cus_T", "active", null)],
  });
  assertUnresolved(r);
  assert.deepEqual(r.report.subscriptions.map((s) => s.id), ["sub_a"]);
  assert.match(r.text, /evidence truncated: more than 1 Stripe subscriptions/);
});

test("conflicting subscription from stripe_trial: excluded, and its customer is not followed", async () => {
  const db = fakeDb({ stripeTrials: [{ user_id: T, subscription_id: "sub_X" }] });
  const stripe = fakeStripe({ subscriptions: [sub("sub_X", "cus_X", "active", U)] });
  const { report } = await run({ target: T, db, stripe });
  assert.equal(report.subscriptions.length, 0);
  assert.ok(!stripe.calls.some((p) => p.includes("cus_X")));
  assert.equal(report.issues[0].kind, "conflict");
});

test("a customer that cannot be read is not listed", async () => {
  const db = fakeDb({ waitlist: [{ user_id: T, stripe_customer_id: "cus_gone" }] });
  const stripe = fakeStripe({ override: { "customers/cus_gone": { error: { type: "invalid_request_error", code: "resource_missing" } } } });
  const report = await collectBilling({ target: T, db, stripe });
  assert.ok(!stripe.calls.some((p) => p.includes("customer=cus_gone")));
  assert.equal(report.complete, false);
});

test("returned objects must match the requested ids", async () => {
  const q = encodeURIComponent(`metadata['supabase_user_id']:'${T}'`);
  const db = fakeDb({ stripeTrials: [{ user_id: T, subscription_id: "sub_a" }], waitlist: [{ user_id: T, stripe_customer_id: "cus_T" }] });
  const stripe = fakeStripe({
    override: {
      [`subscriptions/search?query=${q}&limit=100`]: { object: "list", data: [sub("sub_U", "cus_U", "active", U)] },
      "subscriptions/sub_a": sub("sub_b", "cus_T", "active", T),
      "subscriptions?customer=cus_T&status=all&limit=100": { object: "list", data: [sub("sub_c", "cus_other", "active", T)] },
      "charges?customer=cus_T&limit=100": { object: "list", data: [charge("ch_c", "cus_other")] },
    },
  });
  const { report, text } = await run({ target: T, db, stripe });
  assert.deepEqual(report.subscriptions.map((s) => [s.id, s.obj]), [["sub_a", null]]);
  assert.equal(report.charges.length, 0);
  assert.match(text, new RegExp(`evidence invalid: subscription metadata search for ${T} returned another user's subscription`));
  assert.match(text, /evidence invalid: subscription sub_a read returned a different object/);
  assert.match(text, /evidence invalid: subscriptions of cus_T returned another customer's subscription/);
  assert.match(text, /evidence invalid: charges of cus_T returned another customer's charge/);
  assert.ok(!stripe.calls.some((p) => p.includes("cus_U") || p.includes("cus_other")));
  assert.equal(report.complete, false);
});

test("a missing price or amount prints unknown, never $0 or undefined", async () => {
  assert.equal(priceText(undefined), "price unknown");
  assert.equal(priceText({ unit_amount: null, recurring: { interval: "month" } }), "price unknown");
  assert.equal(priceText({ unit_amount: 0, recurring: { interval: "month" } }), "$0/month");
  assert.equal(priceText({ unit_amount: 1999 }), "$19.99/unknown interval");
  const stripe = fakeStripe({
    subscriptions: [sub("sub_T", "cus_T", "trialing", T, { items: { data: [] }, trial_end: NOW + 3600 })],
    charges: [charge("ch_T", "cus_T", { amount: undefined, amount_refunded: undefined })],
  });
  const { text } = await run({ target: T, db: fakeDb(), stripe });
  assert.match(text, /sub_T · trialing · customer cus_T · price unknown/);
  assert.match(text, /LIVE TRIAL: charges unknown at/);
  assert.match(text, /charge ch_T · unknown · succeeded .* refunded unknown/);
  assert.doesNotMatch(text, /undefined|\$0\b/);
});

test("isIsoDate accepts only real YYYY-MM-DD dates", () => {
  for (const ok of ["2026-11-07", "2024-02-29", "2026-01-01"]) assert.equal(isIsoDate(ok), true, ok);
  for (const bad of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-1-01", "2026-11-07T00:00", "2026-11-07' or '1'='1", "", undefined, 20261107]) {
    assert.equal(isIsoDate(bad), false, String(bad));
  }
});
