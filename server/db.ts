import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Try to get DATABASE_URL, or construct it from individual PG* variables
let databaseUrl = process.env.DATABASE_URL;

// Strip any surrounding quotes and trim whitespace
if (databaseUrl) {
  databaseUrl = databaseUrl.replace(/^['"]|['"]$/g, '').trim();
}

// If DATABASE_URL is missing or invalid (e.g., just a UUID), construct from PG* vars
if (!databaseUrl || !databaseUrl.startsWith('postgresql://')) {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const port = PGPORT || '5432';
    databaseUrl = `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
    console.log(`Constructed DATABASE_URL from PG* environment variables (host: ${PGHOST})`);
  }
}

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
