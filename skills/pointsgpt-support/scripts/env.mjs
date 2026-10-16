// Reads the PointsGPT .env from the current directory, then from ~/Git/pointsgpt.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const file = [".env", `${homedir()}/Git/pointsgpt/.env`].find(existsSync);
if (!file) throw new Error("No .env: run from a pointsgpt checkout");

export const env = Object.fromEntries(
  readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);

const PROJECT = "osukdnnxwwzmvrfdylpz";

/** One read-only statement against production. Only the last statement's rows come back. */
export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: true }),
  });
  const body = await r.json();
  if (!Array.isArray(body)) throw new Error(`sql: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

let stripeKey;
/** GET only. The key comes from production Vault and stays in memory. */
export async function stripe(path) {
  stripeKey ??= await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/api_vault_get`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_name: "Stripe" }),
  }).then((r) => r.json());
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${stripeKey}` } });
  return r.json();
}

export const et = (epochOrIso) => {
  if (!epochOrIso) return null;
  const d = typeof epochOrIso === "number" ? new Date(epochOrIso * 1000) : new Date(epochOrIso);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }) + " ET";
};
