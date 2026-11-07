// Billing evidence for one PointsGPT member, across the guest identities linked into that member.
// A guest checkout can stay on the guest UUID after public.first_flow_billing_identity links that
// guest (source_user_id) into the member (target_user_id). Only incoming links count: never
// outgoing links, siblings, or name and contact matches.
// Pure: the caller injects a read-only `db` (see sqlDb) and a GET-only `stripe(path)`.

export const LIMITS = { maxDepth: 3, maxIdentities: 10, maxSubscriptions: 25, maxCustomers: 10, maxRows: 100 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUB = /^sub_[A-Za-z0-9]{1,250}$/;
const CUS = /^cus_[A-Za-z0-9]{1,250}$/;
const CHARGE = /^(?:ch|py)_[A-Za-z0-9]{1,250}$/;
export const isUuid = (s) => typeof s === "string" && UUID.test(s);

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Issue kinds that mean evidence can be missing or wrongly attributed. A cycle is reported, but
// every identity on it is read.
const GAPS = new Set(["failed", "truncated", "depth", "identity_cap", "invalid", "conflict", "unresolved"]);

// Never print untrusted text: error messages and bad values can carry credentials or customer data.
const shown = (v) => (typeof v === "string" ? `<${v.length}-char value>` : `<${v === null ? "null" : typeof v}>`);
const ERROR_NAMES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError"]);
const ERROR_CODE = /^[A-Z][A-Z_]{1,40}$/;
/** A thrown error as its structured name and code only. The message is never read. */
export function errorKind(e) {
  const name = ERROR_NAMES.has(e?.name) ? e.name : "error";
  const code = [e?.code, e?.cause?.code].find((c) => typeof c === "string" && ERROR_CODE.test(c));
  return code ? `${name} ${code}` : name;
}
const token = (v) => (typeof v === "string" && /^[a-z_]{1,60}$/.test(v) ? v : null);
// Stripe echoes part of the key in some error messages. Print only the structured type and code.
const stripeReason = (e) => `stripe ${[token(e?.type), token(e?.code)].filter(Boolean).join("/") || "error"}`;
const customerOf = (o) => (typeof o?.customer === "string" ? o.customer : o?.customer?.id);

/** Read-only SQL for collectBilling. Every statement is one select on exact, validated UUIDs. */
export function sqlDb(sql) {
  const ids = (list) => {
    if (!list.length || !list.every(isUuid)) throw new Error("sqlDb: every id must be a lowercase uuid");
    return list.map((i) => `'${i}'`).join(",");
  };
  const n = (limit) => {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("sqlDb: limit must be a positive integer");
    return limit;
  };
  return {
    incomingLinks: (targets, limit) =>
      sql(`select source_user_id, target_user_id, linked_at from first_flow_billing_identity
           where target_user_id in (${ids(targets)}) order by linked_at, source_user_id limit ${n(limit)}`),
    outgoingLink: async (id) =>
      (await sql(`select source_user_id, target_user_id, linked_at from first_flow_billing_identity
                  where source_user_id = ${ids([id])}`))[0] ?? null,
    stripeTrials: (list, limit) =>
      sql(`select user_id, subscription_id, sold_on, plan, started_at, canceled_at, converted_at, converted_usd
           from stripe_trial where user_id in (${ids(list)}) order by started_at limit ${n(limit)}`),
    appstoreTrials: (list, limit) => sql(`select * from appstore_trial where user_id in (${ids(list)}) limit ${n(limit)}`),
    payments: (list, limit) =>
      sql(`select user_id, provider, payment_id, amount_usd, paid_at, kind from payment_ledger
           where user_id in (${ids(list)}) order by paid_at limit ${n(limit)}`),
    waitlistCustomers: (list, limit) =>
      sql(`select user_id, stripe_customer_id from waitlist
           where user_id in (${ids(list)}) and stripe_customer_id is not null limit ${n(limit)}`),
    billingCustomers: (list, limit) =>
      sql(`select source_user_id, customer_id, created_at from first_flow_billing_customer
           where source_user_id in (${ids(list)}) order by created_at, customer_id limit ${n(limit)}`),
  };
}

/**
 * Collects billing evidence for `target` and every identity linked into it.
 * Returns a report. Failed, truncated, bounded, and conflicting reads are issues, never silent.
 */
export async function collectBilling({ target, db, stripe, limits = {} }) {
  const L = { ...LIMITS, ...limits };
  if (!isUuid(target)) throw new Error("billing: target must be a lowercase user uuid");
  const issues = [];
  const note = (kind, what, detail) => {
    if (!issues.some((i) => i.kind === kind && i.what === what)) issues.push(detail ? { kind, what, detail } : { kind, what });
  };
  const guard = async (what, fn) => {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      note("failed", what, errorKind(e));
      return { ok: false };
    }
  };

  // Identities: breadth first over incoming links. source_user_id is the primary key, so a query
  // returns at most one row per visited source. The limit leaves room for those, plus one row to
  // detect the identity cap.
  const identities = [{ id: target, depth: 0, link: null }];
  const seen = new Set([target]);
  let frontier = [target];
  for (let depth = 1; frontier.length; depth++) {
    const room = L.maxIdentities - identities.length;
    const what = `links into ${frontier.join(", ")}`;
    const r = await guard(what, () => db.incomingLinks(frontier, Math.max(room, 0) + seen.size + 1));
    if (!r.ok) break;
    const next = [];
    for (const row of r.value) {
      const src = row.source_user_id;
      if (!isUuid(src)) { note("invalid", `link source ${shown(src)} into ${shown(row.target_user_id)}`); continue; }
      if (seen.has(src)) { note("cycle", `${src} links into ${row.target_user_id}, which already leads to ${target}`); continue; }
      if (depth > L.maxDepth) { note("depth", `links deeper than ${L.maxDepth} into ${frontier.join(", ")}`); break; }
      if (identities.length >= L.maxIdentities) { note("identity_cap", `more than ${L.maxIdentities} identities`); break; }
      seen.add(src);
      identities.push({ id: src, depth, link: { source: src, target: row.target_user_id, linked_at: row.linked_at } });
      next.push(src);
    }
    frontier = next;
  }

  // An outgoing link is shown for orientation only. Its target's billing is not read.
  const out = await guard(`outgoing link of ${target}`, () => db.outgoingLink(target));
  const linkedInto = out.ok && out.value && isUuid(out.value.target_user_id) ? out.value : null;

  const ids = identities.map((i) => i.id);
  const resolved = new Set(ids);
  const rowsOf = async (what, read) => {
    const r = await guard(what, () => read(ids, L.maxRows + 1));
    if (!r.ok) return [];
    if (r.value.length <= L.maxRows) return r.value;
    note("truncated", what, `first ${L.maxRows} rows`);
    return r.value.slice(0, L.maxRows);
  };
  const database = {
    stripeTrials: await rowsOf("stripe_trial", db.stripeTrials),
    appstoreTrials: await rowsOf("appstore_trial", db.appstoreTrials),
    payments: await rowsOf("payment_ledger", db.payments),
    waitlist: await rowsOf("waitlist.stripe_customer_id", db.waitlistCustomers),
    billingCustomers: await rowsOf("first_flow_billing_customer", db.billingCustomers),
  };

  // Stripe. Each subscription, customer, and charge is read and shown once, with every way we found it.
  // An object whose supabase_user_id metadata names a user outside `resolved` is a conflict: its
  // billing is excluded, and nothing is followed through it.
  const subs = new Map(); // id -> entry
  const customers = new Map(); // id -> entry
  const charges = new Map(); // id -> { obj, customer }
  const addVia = (entry, via) => {
    if (!entry.via.some((v) => v.how === via.how && v.ref === via.ref)) entry.via.push(via);
  };
  // Returns false when the id is invalid or the cap skipped it.
  const add = (map, pattern, max, kind, id, via, obj) => {
    if (!pattern.test(id ?? "")) { note("invalid", `${kind} id ${shown(id)} from ${via.how} ${via.ref}`); return false; }
    let entry = map.get(id);
    if (!entry) {
      if (map.size >= max) { note("truncated", `more than ${max} Stripe ${kind}s`, "later ones skipped"); return false; }
      entry = { via: [], obj: null, fetched: false, checked: false, listed: false, conflict: null };
      map.set(id, entry);
    }
    addVia(entry, via);
    if (obj) entry.obj ??= obj;
    return true;
  };
  const addSub = (id, via, obj) => add(subs, SUB, L.maxSubscriptions, "subscription", id, via, obj);
  const addCustomer = (id, via, obj) => add(customers, CUS, L.maxCustomers, "customer", id, via, obj);
  const get = async (what, path, list) => {
    let body;
    try {
      body = await stripe(path);
    } catch (e) {
      note("failed", what, errorKind(e));
      return null;
    }
    if (!body || typeof body !== "object") { note("failed", what, "no JSON body"); return null; }
    if (body.error) { note("failed", what, stripeReason(body.error)); return null; }
    if (list) {
      if (!Array.isArray(body.data)) { note("failed", what, "response has no data list"); return null; }
      if (body.has_more) note("truncated", what, `first ${body.data.length} results`);
    }
    return body;
  };
  // Reads one object by id and checks that Stripe returned that object.
  const retrieve = async (kind, object, id) => {
    const body = await get(`${kind} ${id}`, `${kind === "subscription" ? "subscriptions" : "customers"}/${id}`, false);
    if (body && (body.id !== id || body.object !== object)) {
      note("invalid", `${kind} ${id} read returned a different object`);
      return null;
    }
    return body;
  };
  // The metadata owner when it names a user outside the resolved identities, else null.
  const outsider = (obj) => {
    const meta = obj?.metadata?.supabase_user_id;
    if (meta == null || meta === "" || resolved.has(meta)) return null;
    return isUuid(meta) ? meta : shown(meta);
  };
  // Marks a conflict when the object's metadata names a user outside the resolved identities.
  const check = (kind, id, entry) => {
    entry.checked = true;
    entry.conflict = outsider(entry.obj);
    if (!entry.conflict) return false;
    note("conflict", `${kind} ${id} has supabase_user_id metadata ${entry.conflict}, outside the resolved identities`,
      "its billing is excluded");
    return true;
  };

  for (const t of database.stripeTrials) addSub(t.subscription_id, { how: "stripe_trial", ref: t.user_id });
  for (const w of database.waitlist) addCustomer(w.stripe_customer_id, { how: "waitlist.stripe_customer_id", ref: w.user_id });
  for (const m of database.billingCustomers) addCustomer(m.customer_id, { how: "first_flow_billing_customer", ref: m.source_user_id });
  for (const id of ids) {
    const q = encodeURIComponent(`metadata['supabase_user_id']:'${id}'`);
    for (const [kind, path, addOne, how] of [
      ["subscription", "subscriptions", addSub, "subscription metadata"],
      ["customer", "customers", addCustomer, "customer metadata"],
    ]) {
      const found = await get(`${kind} metadata search for ${id}`, `${path}/search?query=${q}&limit=100`, true);
      for (const o of found?.data ?? []) {
        if (o?.metadata?.supabase_user_id !== id) { note("invalid", `${kind} metadata search for ${id} returned another user's ${kind}`); continue; }
        addOne(o.id, { how, ref: id }, o);
      }
    }
  }

  // Worklist: a subscription names its customer, and a customer lists its subscriptions and charges.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, s] of subs) {
      if (s.obj || s.fetched) continue;
      s.fetched = changed = true;
      s.obj = await retrieve("subscription", "subscription", id);
    }
    for (const [id, s] of subs) {
      if (!s.obj || s.checked) continue;
      if (!check("subscription", id, s)) addCustomer(customerOf(s.obj), { how: "customer of", ref: id });
    }
    for (const [id, c] of customers) {
      if (c.obj || c.fetched) continue;
      c.fetched = changed = true;
      c.obj = await retrieve("customer", "customer", id);
    }
    for (const [id, c] of customers) {
      // A customer that could not be read cannot be checked for a conflict, so it is not listed.
      if (c.listed || !c.obj) continue;
      c.listed = changed = true;
      if (check("customer", id, c)) continue;
      const list = await get(`subscriptions of ${id}`, `subscriptions?customer=${id}&status=all&limit=100`, true);
      // A conflicting subscription can hide in a failed, cut, or capped list, so the charges'
      // owner is then unproven.
      c.unresolved = !list || Boolean(list.has_more);
      for (const s of list?.data ?? []) {
        if (customerOf(s) !== id) { note("invalid", `subscriptions of ${id} returned another customer's subscription`); c.unresolved = true; continue; }
        if (!addSub(s.id, { how: "listed under", ref: id }, s)) c.unresolved = true;
      }
      if (c.unresolved) {
        note("unresolved", `charges of ${id}`, "its subscription list is incomplete. Only charges with matching metadata are attributed");
      }
      const ch = await get(`charges of ${id}`, `charges?customer=${id}&limit=100`, true);
      for (const x of ch?.data ?? []) {
        if (customerOf(x) !== id) { note("invalid", `charges of ${id} returned another customer's charge`); continue; }
        if (!CHARGE.test(x?.id ?? "")) { note("invalid", `charge id ${shown(x?.id)} under ${id}`); continue; }
        if (charges.has(x.id)) continue;
        // A charge's own metadata outranks its customer's: a charge for another user is withheld.
        const other = outsider(x);
        if (other) note("conflict", `charge ${x.id} under ${id} has supabase_user_id metadata ${other}, outside the resolved identities`, "charge withheld");
        charges.set(x.id, { obj: x, customer: id, conflict: other });
      }
    }
  }

  // A resolved customer that also holds a conflicting subscription is shared. Its charges cannot be
  // tied to one user, so none are attributed.
  const shared = new Set();
  for (const [id, s] of subs) {
    const cus = customerOf(s.obj);
    if (s.conflict && customers.has(cus) && !customers.get(cus).conflict) {
      shared.add(cus);
      note("conflict", `customer ${cus} also holds ${id} for user ${s.conflict}`, "charges of this customer are not attributed");
    }
  }
  const proven = (c) => !customers.get(c.customer)?.unresolved || resolved.has(c.obj.metadata?.supabase_user_id);
  const kept = [...charges.values()]
    .filter((c) => !c.conflict && !shared.has(c.customer) && !customers.get(c.customer)?.conflict && proven(c));

  // A conflicting customer is never listed, so a subscription reaches this point only through its
  // own metadata or a stored mapping. It is kept, with the customer's contradicting owner beside it.
  const customerConflict = (s) => customers.get(customerOf(s.obj))?.conflict ?? null;
  return {
    target,
    identities,
    linkedInto,
    database,
    subscriptions: [...subs].filter(([, s]) => !s.conflict)
      .map(([id, s]) => ({ id, via: s.via, obj: s.obj, customerConflict: customerConflict(s) })),
    customers: [...customers].filter(([, c]) => !c.conflict).map(([id, c]) => ({ id, via: c.via, shared: shared.has(id) })),
    charges: kept.map((c) => ({ ...c.obj, customer: c.customer })),
    withheldCharges: charges.size - kept.length,
    issues,
    complete: !issues.some((i) => GAPS.has(i.kind)),
  };
}

/** The member identities behind a subscription or customer, following the provenance chain. */
export function identitiesOf(report, kind, id, seen = new Set()) {
  const key = `${kind}:${id}`;
  if (seen.has(key)) return new Set();
  seen.add(key);
  const entry = (kind === "sub" ? report.subscriptions : report.customers).find((e) => e.id === id);
  const found = new Set();
  for (const v of entry?.via ?? []) {
    if (isUuid(v.ref)) found.add(v.ref);
    else for (const u of identitiesOf(report, v.how === "customer of" ? "sub" : "cus", v.ref, seen)) found.add(u);
  }
  return found;
}

/** Cents as dollars, or "unknown" when Stripe gave no amount. */
const dollars = (cents) => (Number.isFinite(cents) ? `$${cents / 100}` : "unknown");
export function priceText(price) {
  if (!Number.isFinite(price?.unit_amount)) return "price unknown";
  return `${dollars(price.unit_amount)}/${price.recurring?.interval ?? "unknown interval"}`;
}

/** Output lines for the billing sections of user.mjs. */
export function formatBilling(report, { et, now = Date.now(), entitlement = null }) {
  const out = [];
  const line = (s = "") => out.push(s);
  const label = new Map(report.identities.map((i) => [i.id, i.depth ? `${i.id} (linked, depth ${i.depth})` : `${i.id} (requested)`]));
  const who = (u) => label.get(u) ?? `${u} (NOT a resolved identity)`;
  const whoAll = (set) => (set.size ? [...set].map(who).join(", ") : "unknown identity");
  const via = (v) => `${v.how} ${v.ref}`;

  line("== Billing identities (incoming first_flow_billing_identity links only)");
  for (const i of report.identities) {
    line(i.link ? `${who(i.id)} · linked into ${i.link.target} at ${et(i.link.linked_at)}` : who(i.id));
  }
  if (report.linkedInto) {
    line(`note: ${report.target} is itself a source linked into ${report.linkedInto.target_user_id} at ${et(report.linkedInto.linked_at)}.` +
      " That target's billing is not shown here. Run user.mjs on it.");
  }

  line("\n== Billing (database)");
  line(`entitlement (requested user only): ${entitlement ? JSON.stringify(entitlement) : "none"}`);
  const rows = (name, list, key = "user_id") => {
    for (const r of list) {
      const { [key]: owner, ...rest } = r;
      line(`${name} [${who(owner)}]: ${JSON.stringify(rest)}`);
    }
  };
  rows("stripe_trial", report.database.stripeTrials);
  rows("appstore_trial", report.database.appstoreTrials);
  rows("payment_ledger", report.database.payments);
  rows("waitlist.stripe_customer_id", report.database.waitlist);
  rows("first_flow_billing_customer", report.database.billingCustomers, "source_user_id");

  line("\n== Stripe (authority)");
  if (!report.complete) {
    line("INCOMPLETE EVIDENCE: some reads failed, were cut short, hit a bound, or conflict with another user. Billing records can be missing.");
  }
  for (const i of report.issues) line(`evidence ${i.kind}: ${i.what}${i.detail ? ` (${i.detail})` : ""}`);
  for (const { id, via: vias, obj: s, customerConflict } of report.subscriptions) {
    const from = `from ${whoAll(identitiesOf(report, "sub", id))} via ${vias.map(via).join("; ")}`;
    if (!s) { line(`${id} · READ FAILED · ${from}`); continue; }
    const price = s.items?.data?.[0]?.price;
    const meta = s.metadata?.supabase_user_id;
    line(
      `${s.id} · ${s.status} · customer ${customerOf(s)} · ${priceText(price)}` +
        ` · trial_end ${et(s.trial_end)} · cancel_at_period_end ${s.cancel_at_period_end} · canceled_at ${et(s.canceled_at)}`,
    );
    line(`  ${from}${meta ? ` · metadata user ${who(meta)}` : " · no supabase_user_id metadata: attributed only by the provenance above"}`);
    if (customerConflict) {
      line(`  WARNING: customer ${customerOf(s)} has supabase_user_id metadata ${customerConflict}, outside the resolved identities.` +
        " Ownership is contradictory. A person decides.");
    }
    if (s.status === "trialing" && !s.cancel_at_period_end) {
      const hours = (s.trial_end * 1000 - now) / 36e5;
      line(`  LIVE TRIAL: charges ${dollars(price?.unit_amount)} at ${et(s.trial_end)} (${hours.toFixed(1)} h from now)`);
    }
  }
  for (const x of report.charges) {
    line(
      `charge ${x.id} · ${dollars(x.amount)} · ${x.status} · ${et(x.created)} · refunded ${dollars(x.amount_refunded)}` +
        ` · customer ${x.customer} · from ${whoAll(identitiesOf(report, "cus", x.customer))}`,
    );
  }
  if (report.withheldCharges) line(`${report.withheldCharges} charge(s) not attributed: the charge or its customer names another user, the customer is shared, or its subscription list is incomplete`);
  if (!report.subscriptions.length) {
    const n = report.identities.length;
    line(report.complete
      ? `no Stripe subscription found for ${n} identit${n === 1 ? "y" : "ies"} (check App Store: entitlement.store = APP_STORE)`
      : "no Stripe subscription in the reads that succeeded. Do not report that the member has none until the gaps above are read.");
  }
  return out;
}
