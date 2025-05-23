// src/app/api/agency-word-counts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

interface WordCountHistoryEntry {
  date: string;                   // Date formatted as YYYY-MM-DD
  count: number;                  // The word count
  checksum_algorithm: string | null; // Algorithm name (e.g., 'SHA-256') or null
  checksum: string | null;          // The checksum hex value or null
}

// Reuse pool configuration (ensure environment variables are set)
const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || "5432"),
});

export async function GET(request: NextRequest) {
  console.log("--- /api/agency-word-counts GET request received ---");
  const { searchParams } = request.nextUrl;
  const agencyName = searchParams.get('agencyName');

  // Agency name is required
  if (!agencyName) {
    return NextResponse.json({ error: 'Missing agencyName query parameter' }, { status: 400 });
  }
  console.log(`Workspaceing ALL word counts and checksums for Agency: ${agencyName}`);

  let client;
  try {
    client = await pool.connect();
    console.log("DB client acquired.");
    try {
      // --- Updated SQL Query ---
      // Selects date, count, and optionally checksum info using a LEFT JOIN
      const sqlQuery = `
          SELECT
              to_char(wc.effective_date, 'YYYY-MM-DD') as date,
              wc.word_count as count,
              cs.checksum_algo as checksum_algorithm,
              cs.checksum_value as checksum
          FROM
              agency_word_counts wc
          JOIN -- Find the agency ID based on name
              agencies a ON wc.agency_id = a.id
          LEFT JOIN -- Join with checksums, keep count row even if checksum missing
              agency_checksums cs ON wc.agency_id = cs.agency_id        -- Match agency
                                 AND wc.effective_date = cs.effective_date -- Match date
                                 -- Optional: Filter specific algo if you store multiple types
                                 -- AND cs.checksum_algo = 'SHA-256'
          WHERE
              a.name = $1 -- Filter by agency name (parameter)
          ORDER BY
              wc.effective_date DESC; -- Order by date, most recent first
      `;
      const queryParams: string[] = [agencyName];

      console.log("Executing SQL for counts & checksums:", queryParams);
      const result = await client.query(sqlQuery, queryParams);
      console.log(`Workspaceed ${result.rows.length} historical records.`);

      // Map results directly to the interface type
      // The row structure from SQL matches the interface keys
      const results: WordCountHistoryEntry[] = result.rows;

      return NextResponse.json(results); // Return array of history entries

    } finally {
      if (client) client.release(); // Ensure client is released
      console.log("DB client released.");
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

  } finally {
       console.log("--- /api/agency-word-counts GET request finished ---");
  }
}