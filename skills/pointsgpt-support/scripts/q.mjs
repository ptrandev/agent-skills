// Usage: node q.mjs "<one SQL statement>"   (read-only, production)
import { sql } from "./env.mjs";
console.log(JSON.stringify(await sql(process.argv[2]), null, 1));
