// src/app/api/top-changing-agencies/route.ts
import { NextResponse } from 'next/server';
import { Pool, PoolClient } from 'pg'; // Added PoolClient for typing

// Reuse pool configuration (ensure environment variables POSTGRES_URL or others are set)
// Make sure SSL configuration is correct for your cloud provider if needed
const pool = new Pool({
    // connectionString: process.env.POSTGRES_URL, // Or individual PG... env vars
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || "5432"),
    // ssl: { rejectUnauthorized: false } // Example - adjust as needed
});



// Updated interface for the response objects within the 'agencies' array
interface TopChangingAgency {
    name: string;
    count_latest: number;
    count_previous: number;
    change_absolute: number; // Represents positive change now
}

// Updated interface for the overall API response
interface TopChangingResponse {
    latestDate: string | null;
    previousDate: string | null;
    agencies: TopChangingAgency[];
}

// Helper to format date consistently
function formatDate(date: Date | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); // Adjust for potential TZ issues if needed
    return d.toISOString().split('T')[0];
}

export async function GET() {
    console.log("--- /api/top-changing-agencies GET request received ---");
    let client: PoolClient | null = null; // Use PoolClient type
    try {
        client = await pool.connect();
        console.log("DB client acquired.");

        let latestDateObj: Date | null = null;
        let previousDateObj: Date | null = null;
        let topAgencies: TopChangingAgency[] = [];

        try {
            // --- 1. Get the two most recent dates ---
            const dateQuery = `
                SELECT effective_date
                FROM agency_word_counts
                GROUP BY effective_date
                ORDER BY effective_date DESC
                LIMIT 2;
            `;
            const dateResult = await client.query(dateQuery);

            if (dateResult.rows.length > 0) {
                latestDateObj = dateResult.rows[0].effective_date;
            }
            if (dateResult.rows.length > 1) {
                previousDateObj = dateResult.rows[1].effective_date;
            }

            // --- 2. Proceed only if we have two dates to compare ---
            if (latestDateObj && previousDateObj) {
                const latestDateStr = formatDate(latestDateObj);
                const previousDateStr = formatDate(previousDateObj);
                console.log(`Comparing dates: ${previousDateStr} and ${latestDateStr}`);

                // --- 3. Build and execute the main query ---
                const sqlQuery = `
                    WITH CountsLatest AS (
                        SELECT agency_id, word_count
                        FROM agency_word_counts
                        WHERE effective_date = $1 -- Param 1: latestDate
                        AND word_count > 0
                    ),
                    CountsPrevious AS (
                        SELECT agency_id, word_count
                        FROM agency_word_counts
                        WHERE effective_date = $2 -- Param 2: previousDate
                        AND word_count > 0
                    )
                    SELECT
                        a.name,
                        cl.word_count AS count_latest,
                        cp.word_count AS count_previous,
                        -- Calculate positive change (no ABS needed due to WHERE clause)
                        (cl.word_count - cp.word_count) AS change_absolute
                    FROM
                        CountsLatest cl
                    INNER JOIN -- Only agencies present on both dates (with count > 0)
                        CountsPrevious cp ON cl.agency_id = cp.agency_id
                    JOIN -- Get agency names
                        agencies a ON cl.agency_id = a.id
                    WHERE
                        cl.word_count > cp.word_count -- *** Filter for POSITIVE change only ***
                    ORDER BY
                        change_absolute DESC -- Order by largest positive change
                    LIMIT 5;
                `;
                const result = await client.query(sqlQuery, [latestDateStr, previousDateStr]);
                topAgencies = result.rows; // Result rows match TopChangingAgency interface
                console.log(`Workspaceed ${topAgencies.length} top changing agencies (positive change only).`);

            } else {
                console.log("Not enough dates found in agency_word_counts for comparison.");
            }

            // --- 4. Prepare and return the structured response ---
            const responsePayload: TopChangingResponse = {
                latestDate: formatDate(latestDateObj),
                previousDate: formatDate(previousDateObj),
                agencies: topAgencies
            };
            return NextResponse.json(responsePayload);

        } finally {
            if (client) {
                client.release(); // Release client back to pool
                console.log("DB client released.");
            }
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