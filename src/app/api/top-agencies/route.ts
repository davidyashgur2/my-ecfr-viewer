import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
    user: process.env.NEXT_PUBLIC_PGUSER,
    host: process.env.NEXT_PUBLIC_PGHOST,
    database: process.env.NEXT_PUBLIC_PGDATABASE,
    password: process.env.NEXT_PUBLIC_PGPASSWORD,
    port: parseInt(process.env.NEXT_PUBLIC_PGPORT || "5432"),
});

interface TopAgency {
    name: string;
    word_count: number;
}

export async function GET() {
    console.log("--- /api/top-agencies GET request received ---");
    let client;
    try {
        client = await pool.connect();
        try {
            // Find the most recent date with data
            const maxDateResult = await client.query('SELECT MAX(effective_date) as latest_date FROM agency_word_counts;');
            const latestDate = maxDateResult.rows[0]?.latest_date;

            if (!latestDate) {
                console.log("No dates found in agency_word_counts.");
                return NextResponse.json([]); // Return empty array if no data
            }
             console.log(`Latest date found: ${latestDate.toISOString().split('T')[0]}`);

            // Query top 10 agencies for that date
            const sqlQuery = `
                SELECT a.name, wc.word_count
                FROM agency_word_counts wc
                JOIN agencies a ON wc.agency_id = a.id
                WHERE wc.effective_date = $1 -- Use the found latest date
                ORDER BY wc.word_count DESC
                LIMIT 10;
            `;
            const result = await client.query(sqlQuery, [latestDate]);
            console.log(`Workspaceed ${result.rows.length} top agencies.`);

            const topAgencies: TopAgency[] = result.rows;
            return NextResponse.json(topAgencies);

        } finally {
            if(client) client.release();
        }
    } catch (error: any) {
        console.error("API Error fetching top agencies:", error);
        return NextResponse.json({ error: 'Failed to fetch top agencies' }, { status: 500 });
    }
}