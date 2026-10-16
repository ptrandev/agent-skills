// Usage: node stripe.mjs "<path>"   e.g. "subscriptions/sub_123?expand[]=customer"   (GET only, live)
import { stripe } from "./env.mjs";
console.log(JSON.stringify(await stripe(process.argv[2]), null, 1));
