// src/app/api/available-dates/route.ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Reuse pool configuration (ensure environment variables are set)
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT || "5432"),
});

export async function GET() {
  console.log("--- /api/available-dates GET request received ---");
  let client;
  try {
    client = await pool.connect();
    console.log("DB client acquired.");
    try {
      // Query distinct dates, format as YYYY-MM-DD, order most recent first
      const result = await client.query(`
        SELECT DISTINCT effective_date
        FROM ecfr_documents
        ORDER BY effective_date DESC;
      `);

      // Extract just the date part and format as YYYY-MM-DD string
      // The node-postgres driver might return Date objects or strings depending
      // on type parsers, so ensure consistent string formatting.
      const dates = result.rows.map(row => {
        const dt = new Date(row.effective_date);
        // Adjust for potential timezone offset issues if dates seem off by one day
        dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
        return dt.toISOString().split('T')[0];
      });

      console.log(`Found ${dates.length} available dates.`);
      return NextResponse.json(dates); // Return an array of date strings: ["2025-04-10", "2025-04-09", ...]

    } finally {
      if (client) client.release(); // Ensure client is released
    }
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
  }
}