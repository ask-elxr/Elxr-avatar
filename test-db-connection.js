// Quick database connection test
// Run this in Replit terminal: node test-db-connection.js

import { Pool } from "@neondatabase/serverless";
import ws from "ws";

// Set WebSocket for Neon
const { neonConfig } = await import("@neondatabase/serverless");
neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;

console.log("🔍 Testing Database Connection...\n");

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set!");
  console.log("\nPlease set DATABASE_URL in Replit Secrets.");
  process.exit(1);
}

console.log("✅ DATABASE_URL is set");
console.log(
  "📋 Connection string (first 50 chars):",
  databaseUrl.substring(0, 50) + "...",
);
console.log(
  "📋 Connection string (last 30 chars):",
  "..." + databaseUrl.substring(databaseUrl.length - 30),
);
console.log("");

// Check for common issues
if (databaseUrl.includes("requirez")) {
  console.error('❌ Found typo: "requirez" should be "require"');
}

if (
  !databaseUrl.startsWith("postgresql://") &&
  !databaseUrl.startsWith("postgres://")
) {
  console.error(
    "❌ Invalid format: Should start with postgresql:// or postgres://",
  );
}

console.log("🔌 Attempting to connect...\n");

try {
  const pool = new Pool({ connectionString: databaseUrl });

  const result = await pool.query(
    "SELECT NOW() as current_time, version() as pg_version",
  );

  console.log("✅ Connection successful!");
  console.log("⏰ Database time:", result.rows[0].current_time);
  console.log(
    "📊 PostgreSQL version:",
    result.rows[0].pg_version.split(" ")[0] +
      " " +
      result.rows[0].pg_version.split(" ")[1],
  );
  console.log("\n🎉 Database is working correctly!");

  await pool.end();
  process.exit(0);
} catch (error) {
  console.error("❌ Connection failed!");
  console.error("\nError details:");
  console.error("Message:", error.message);
  console.error("Code:", error.code);

  if (error.message.includes("password authentication failed")) {
    console.error("\n💡 Possible causes:");
    console.error("1. Password is incorrect");
    console.error("2. Connection string has a typo");
    console.error("3. Database password was reset in Neon");
    console.error("\n🔧 Solution:");
    console.error("1. Go to Neon dashboard");
    console.error("2. Get a fresh connection string");
    console.error("3. Update DATABASE_URL in Replit Secrets");
  } else if (
    error.message.includes("ENOTFOUND") ||
    error.message.includes("getaddrinfo")
  ) {
    console.error("\n💡 Possible causes:");
    console.error("1. Network connectivity issue");
    console.error("2. Database hostname is incorrect");
    console.error("3. Database is paused (free tier)");
    console.error("\n🔧 Solution:");
    console.error("1. Check Neon dashboard - is database active?");
    console.error("2. Try getting a fresh connection string");
  } else if (
    error.message.includes("database") &&
    error.message.includes("does not exist")
  ) {
    console.error("\n💡 Possible causes:");
    console.error("1. Database name is incorrect");
    console.error("2. Database was deleted");
    console.error("\n🔧 Solution:");
    console.error("1. Check database name in Neon dashboard");
    console.error("2. Verify connection string matches your database");
  }

  process.exit(1);
}
