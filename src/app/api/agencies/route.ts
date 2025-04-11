// src/app/api/agencies/route.ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Reuse pool configuration (ensure environment variables are set)
// Consider putting pool config in a shared db utility file if used elsewhere
const pool = new Pool({
  // connectionString: process.env.POSTGRES_URL, // Or individual PG... env vars
  user: process.env.NEXT_PUBLIC_PGUSER,
  host: process.env.NEXT_PUBLIC_PGHOST,
  database: process.env.NEXT_PUBLIC_PGDATABASE,
  password: process.env.NEXT_PUBLIC_PGPASSWORD,
  port: parseInt(process.env.NEXT_PUBLIC_PGPORT || "5432"),
  // ssl: { rejectUnauthorized: false } // Example - adjust as needed
});

export async function GET() {
  console.log("--- /api/agencies GET request received ---"); // Log entry
  let client; // Define client outside try block for finally
  try {

    client = await pool.connect();
    console.log("DB client acquired from pool.");

    const sqlQuery = 'SELECT id, name FROM agencies ORDER BY name;';
    console.log("Executing SQL:", sqlQuery);

    const result = await client.query(sqlQuery);
    console.log(`Query successful, fetched ${result.rows.length} agencies.`);

    return NextResponse.json(result.rows);

  } catch (error: unknown) { // Use unknown
    console.error("API Error occurred:");
    if (error instanceof Error) {
        // Safely access message if it's an Error object
        console.error("Error Name:", error.name);
        console.error("Error Message:", error.message);
        console.error("Error Stack:", error.stack);
        // Return error.message in NextResponse if desired
        return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
        // Handle cases where the thrown value isn't an Error object
        console.error("Caught non-error value:", error);
        return NextResponse.json({ error: 'An unknown server error occurred' }, { status: 500 });
    }
  } finally {
    if (client) {
      client.release(); // Ensure client is released back to the pool
      console.log("DB client released.");
    }
    console.log("--- /api/agencies GET request finished ---");
  }
}