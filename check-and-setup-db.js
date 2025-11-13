// Check if database tables exist and create them if needed
// Run: node check-and-setup-db.js

import { Pool } from "@neondatabase/serverless";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set!");
  process.exit(1);
}

console.log("🔍 Checking database tables...\n");

const pool = new Pool({ connectionString: databaseUrl });

try {
  // Check if tables exist
  const tablesQuery = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const result = await pool.query(tablesQuery);
  const existingTables = result.rows.map((row) => row.table_name);

  console.log("📊 Existing tables:", existingTables.length);
  if (existingTables.length > 0) {
    console.log("   Tables:", existingTables.join(", "));
  }

  const requiredTables = [
    "users",
    "sessions",
    "conversations",
    "documents",
    "chat_sessions",
    "jobs",
  ];

  const missingTables = requiredTables.filter(
    (table) => !existingTables.includes(table),
  );

  if (missingTables.length === 0) {
    console.log("\n✅ All required tables exist!");
    console.log("   Database is ready to use.");
  } else {
    console.log("\n⚠️  Missing tables:", missingTables.join(", "));
    console.log("\n🔧 You need to run: npm run db:push");
    console.log("   This will create all missing tables.");
  }

  await pool.end();
} catch (error) {
  console.error("❌ Error checking tables:", error.message);
  console.error("\n💡 Try running: npm run db:push");
  await pool.end();
  process.exit(1);
}
