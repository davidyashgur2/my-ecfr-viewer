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

// export async function GET() {
//   // This function handles GET requests to /api/agencies
//   try {
//     const client = await pool.connect();
//     try {
//       // Query to get agency ID and Name, ordered alphabetically
//       const result = await client.query(
//         'SELECT id, name FROM agencies ORDER BY name;'
//       );
//       // Return the list of agencies as JSON
//       return NextResponse.json(result.rows);
//     } finally {
//       // IMPORTANT: Release the client back to the pool
//       client.release();
//     }
//   } catch (error) {
//     console.error("API Error fetching agencies:", error);
//     // Return a standard error response
//     return NextResponse.json({ error: 'Failed to fetch agencies' }, { status: 500 });
//   }
// }

export async function GET() {
  console.log("--- /api/agencies GET request received ---"); // Log entry
  let client; // Define client outside try block for finally
  try {
    console.log("Attempting to connect to DB pool...");
    // Log connection details (BE CAREFUL NOT TO LOG PASSWORDS in production logs)
    console.log("DB Host (from env):", process.env.NEXT_PUBLIC_PGHOST); // Example
    console.log("DB Name (from env):", process.env.NEXT_PUBLIC_PGDATABASE); // Example

    client = await pool.connect();
    console.log("DB client acquired from pool.");

    const sqlQuery = 'SELECT id, name FROM agencies ORDER BY name;';
    console.log("Executing SQL:", sqlQuery);

    const result = await client.query(sqlQuery);
    console.log(`Query successful, fetched ${result.rows.length} agencies.`);

    return NextResponse.json(result.rows);

  } catch (error: any) { // Catch any potential error
    // --- THIS IS THE MOST IMPORTANT LOG ---
    console.error("!!! API Error fetching agencies:", error); // Log the full error object
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    // --- END OF IMPORTANT LOG ---

    // Return a generic error response, but the details are in the server logs
    return NextResponse.json({ error: 'Failed to fetch agencies due to server error' }, { status: 500 });

  } finally {
    if (client) {
      client.release(); // Ensure client is released back to the pool
      console.log("DB client released.");
    }
    console.log("--- /api/agencies GET request finished ---");
  }
}