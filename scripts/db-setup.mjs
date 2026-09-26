/** Applique lib/db/schema.sql sur la base pointée par DATABASE_URL. */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL n'est pas défini. Renseignez-le dans .env.local.");
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
const client = new Client({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(readFileSync(new URL("../lib/db/schema.sql", import.meta.url), "utf8"));
  console.log("Schéma appliqué.");
} catch (error) {
  console.error("Échec :", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
