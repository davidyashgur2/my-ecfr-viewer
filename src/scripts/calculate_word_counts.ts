// src/scripts/calculate_word_counts.ts
import { Pool, PoolClient } from 'pg';
import { XMLParser } from 'fast-xml-parser';
import { config } from 'dotenv'; // Use dotenv to load .env.local for the script
import path from 'path';

// Load environment variables from .env.local relative to project root
config({ path: path.resolve(process.cwd(), '.env.local') });

// --- Assume these are defined or imported ---
// (Make sure these helpers are accessible, e.g., import from a utils file)

interface SimpleTextResult {
    tag: string;
    text: string;
}
interface FullExtractedText {
    title: number;
    chapter: string; // We decided to store as string after getting scope ID
    tag: string;
    text: string;
}/**
 * Recursively finds and extracts text content from <P> (Paragraph) and <HEAD> (Heading)
 * tags nested within a given JavaScript object representation of an XML element.
 *
 * @param element The current JavaScript object (representing parsed XML element) to search within.
 * @param depth Current recursion depth (to prevent potential infinite loops).
 * @returns An array of objects, each containing the tag ('P' or 'HEAD') and its text content.
 */
function findTextRecursive(element: any, depth = 0): SimpleTextResult[] {
    let extractedTexts: SimpleTextResult[] = [];

    // --- Input Validation and Recursion Guard ---
    if (!element || typeof element !== 'object' || depth > MAX_RECURSION_DEPTH_TEXT) {
        // Stop if element is invalid, not an object, or too deep
        return extractedTexts;
    }

    // --- Base Cases: Extract Text from <P> and <HEAD> at the Current Level ---
    const tagsToExtract: string[] = ['P', 'HEAD'];
    for (const tagName of tagsToExtract) {
        // Use ensureArray to handle both single objects and arrays for P/HEAD tags
        ensureArray(element[tagName]).forEach(node => {
            // Extract text: handles node being a simple string OR an object
            // with the text under the '#text' key (from fast-xml-parser options).
            // NOTE: This approach primarily gets text directly within P/HEAD.
            // If XML has <P>Text <i>italic</i> more text.</P>, this might only get "Text "
            // depending on parser options for mixed content. Handling true mixed
            // content robustly often requires more complex parsing or post-processing.
            const text = (typeof node === 'object' && node !== null ? node["#text"] : node) || '';
            const trimmedText = text.trim();

            if (trimmedText) {
                extractedTexts.push({ tag: tagName, text: trimmedText });
            }
        });
    }

    // --- Recursive Step: Traverse Child Elements ---
    // Iterate through all keys in the current element object
    for (const key in element) {
        // Skip keys that are definitely NOT elements we should recurse into:
        // 1. fast-xml-parser attributes (e.g., '@N')
        // 2. fast-xml-parser text node key ('#text')
        // 3. The specific tags we extracted in the base case ('P', 'HEAD')
        if (key.startsWith('@') || key === '#text' || tagsToExtract.includes(key)) {
            continue;
        }

        const potentialChildren = element[key];

        // Check if the property value looks like a child element or array of elements
        if (typeof potentialChildren === 'object' && potentialChildren !== null) {
            // Normalize to an array and recurse into each child object
            ensureArray(potentialChildren).forEach(child => {
                // Call recursively, passing results up
                extractedTexts.push(...findTextRecursive(child, depth + 1));
            });
        }
    }

    return extractedTexts;
}

// Helper function to always get children as an array
function ensureArray(item: any): any[] {
    if (!item) {
        return []; // Return empty array if item is null or undefined
    }
    return Array.isArray(item) ? item : [item]; // If not array, wrap in array
}

// Helper to safely access potentially nested children as an array
function getChildrenArray(element: any, key: string): any[] {
    if (!element || typeof element !== 'object') {
        return [];
    }
    return ensureArray(element[key]);
}

// Function to find starting scope elements based on chapter identifiers
function findScopeElements(titleElement: any, targetChapters: string[]): any[] {
    const foundScopes: any[] = [];
    if (!titleElement || typeof titleElement !== 'object' || !targetChapters || targetChapters.length === 0) {
        return foundScopes;
    }

    // Define the types of DIVs that might represent a "Chapter" scope
    const potentialScopeDivTypes = ['DIV3', 'DIV5']; // Add DIV2, DIV6? Depends on mapping. Start with DIV3/DIV5.

    // Recursive helper function to search within an element
    const searchInChildren = (element: any) => {
        if (!element || typeof element !== 'object') return;

        // Check direct children for potential scope types
        for (const divType of potentialScopeDivTypes) {
            ensureArray(element[divType]).forEach(scopeCandidate => {
                const nValue = scopeCandidate?.['@N'];
                // Check if this element's N value matches a target chapter
                if (nValue && targetChapters.includes(String(nValue))) {
                    console.log(`Found matching scope: <span class="math-inline">\{divType\} N\=</span>{nValue}`);
                    foundScopes.push(scopeCandidate);
                    // Option: Should we stop searching under this scope once found?
                    // For now, let's not, to allow finding multiple matches if needed.
                }
            });
        }

        // Now, recurse into common container children (DIV1, DIV2, DIV3, DIV4, DIV5, DIV6 etc.)
        // Avoid infinite loops - don't recurse into the types we just checked as scopes.
        for (const key in element) {
            if (key.startsWith('DIV') && !potentialScopeDivTypes.includes(key) && typeof element[key] === 'object') {
                ensureArray(element[key]).forEach(child => {
                    searchInChildren(child); // Recurse
                });
            }
        }
    };

    // Start the search from the title element
    searchInChildren(titleElement);

    return foundScopes;
}
// ------------------------------------------
const MAX_RECURSION_DEPTH_TEXT = 15; // Safety limit for recursion depth

// Configure the connection pool using environment variables
const pool = new Pool({
    //   connectionString: process.env.POSTGRES_URL, // Example using a single URL variable
    // Or use individual variables:
    user: process.env.NEXT_PUBLIC_PGUSER,
    host: process.env.NEXT_PUBLIC_PGHOST,
    database: process.env.NEXT_PUBLIC_PGDATABASE,
    password: process.env.NEXT_PUBLIC_PGPASSWORD,
    port: parseInt(process.env.NEXT_PUBLIC_PGPORT || "5432"),
    // ssl: { rejectUnauthorized: false } // Adjust SSL based on your provider's requirements
});

// Configure XML Parser (optional settings might be needed)
const xmlParser = new XMLParser({
    ignoreAttributes: false, // Keep attributes like @N
    attributeNamePrefix: "@", // Convention for attributes
    textNodeName: "#text",    // Convention for text nodes
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    trimValues: true,
});

/**
 * Calculates and stores word count for a specific agency and date.
 * (This combines pieces of the old API route logic)
 */
async function processAgencyDate(client: PoolClient, agencyId: number, agencyName: string, effectiveDate: string) {
    console.log(`\nProcessing Agency ID: <span class="math-inline">\{agencyId\} \(</span>{agencyName}) for Date: ${effectiveDate}`);
    let relevantTitles: number[] = [];
    let extractedTexts: FullExtractedText[] = [];
    let totalWordCount = 0;

    try {
        // 1. Get Agency Refs
        const agencyRefsResult = await client.query(
            `SELECT cfr_title, cfr_chapter FROM agency_cfr_references WHERE agency_id = $1`,
            [agencyId]
        );
        const refsByTitle = agencyRefsResult.rows.reduce((acc, row) => {
            if (row.cfr_title !== null) {
                acc[row.cfr_title] = acc[row.cfr_title] || [];
                if (row.cfr_chapter) acc[row.cfr_title].push(row.cfr_chapter);
            } return acc;
        }, {});
        relevantTitles = Object.keys(refsByTitle).map(Number);
        if (relevantTitles.length === 0) {
            console.log(`  No relevant titles found for agency ID ${agencyId}.`);
            // Store 0 count if no refs? Or only if refs exist but no text?
            totalWordCount = 0; // Set explicitly to 0 if no titles referenced
        } else {
            // 2. Get XML Docs
            const xmlDocsResult = await client.query(
                `SELECT cfr_title, xml_content::text FROM ecfr_documents WHERE cfr_title = ANY($1::int[]) AND effective_date = $2`,
                [relevantTitles, effectiveDate]
            );
            console.log(`  Fetched ${xmlDocsResult.rows.length} XML documents.`);
            const MAX_RESULTS = 500; // Limit results to prevent overload

            // 3. Parse, Find Scope, Extract Text
            for (const docRow of xmlDocsResult.rows) {
                const titleNum = docRow.cfr_title;
                const xmlString = docRow.xml_content;
                const relevantChapters = refsByTitle[titleNum] || [];

                console.log(`Processing Title ${titleNum} with ${relevantChapters.length} chapters...`);

                try {
                    const jsonObj = xmlParser.parse(xmlString);
                    const titleDivArr = ensureArray(jsonObj?.ECFR?.DIV1); // Get DIV1 as array
                    const relevantChapters = refsByTitle[titleNum] || []; // Chapters for *this* title

                    // log jspn structure
                    // console.log("Parsed JSON structure:", JSON.stringify(jsonObj, null, 2));
                    // console.dir(jsonObj, { depth: 6, colors: true }); // Log with depth and colors for better readability
                    // Navigate the parsed JSON structure (adjust paths based on actual XML/JSON output)
                    const titleDiv = jsonObj?.ECFR?.DIV1; // Assuming root ECFR, Title DIV1
                    if (!titleDiv) continue;

                    const chapters = titleDiv.DIV3 ? (Array.isArray(titleDiv.DIV3) ? titleDiv.DIV3 : [titleDiv.DIV3]) : [];

                    // logging
                    console.log(`Found ${chapters.length} chapters in Title ${titleNum}.`);

                    if (titleDivArr.length > 0 && relevantChapters.length > 0) {
                        const titleElement = titleDivArr[0]; // Assuming only one DIV1 per file

                        // Find the actual scope elements (e.g., specific DIV3 or DIV5 objects)
                        const scopeElements = findScopeElements(titleElement, relevantChapters);

                        if (scopeElements.length > 0) {
                            console.log(`Title ${titleNum}: Found <span class="math-inline">\{scopeElements\.length\} relevant scope\(s\) for chapters \[</span>{relevantChapters.join(', ')}].`);
                            // Now, iterate through the found scopes and extract text
                            for (const scopeElement of scopeElements) {
                                const chapterNum = scopeElement?.['@N'] || 'Unknown'; // Get N from the found scope
                                const textsWithinScope = findTextRecursive(scopeElement); // Use the robust text finder
                                extractedTexts.push(
                                    ...textsWithinScope.map((el: { tag: any; text: any; }) => ({
                                        title: titleNum,
                                        chapter: String(chapterNum), // Use the actual N value found
                                        tag: el.tag,
                                        text: el.text
                                    }))
                                );
                                // Optional: Limit total results extracted
                                // if (extractedTexts.length >= MAX_RESULTS) break;
                            }
                        } else {
                            console.log(`Title <span class="math-inline">\{titleNum\}\: No matching scope elements found for chapters \[</span>{relevantChapters.join(', ')}].`);
                        }
                    }

                } catch (parseError) {
                    console.error(`Error parsing XML for Title ${titleNum}:`, parseError);
                    // Optionally return partial results or specific error
                }
                // if (extractedTexts.length >= MAX_RESULTS) break; // Stop processing titles if max reached
            }


            // --- Add Checksum Calculation and Storage ---
            if (extractedTexts.length > 0) { // Only calculate if there's text
                try {
                    console.log(`  Calculating checksum for ${extractedTexts.length} text snippets...`);

                    // 1. CRITICAL: Sort text snippets for deterministic order
                    // Sort by title, then chapter (ensure consistent string comparison), then tag, then text
                    extractedTexts.sort((a, b) => {
                        if (a.title !== b.title) return a.title - b.title;
                        const chapterA = String(a.chapter); // Ensure chapters are strings for localeCompare
                        const chapterB = String(b.chapter);
                        if (chapterA !== chapterB) return chapterA.localeCompare(chapterB);
                        if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
                        return a.text.localeCompare(b.text);
                    });

                    // 2. Combine all text snippets into ONE string with a clear separator
                    const combinedText = extractedTexts.map(item => item.text).join("\n<--SNIP-->\n"); // Use a separator unlikely to be in the text

                    // 3. Calculate SHA-256 Checksum using Node.js crypto
                    const crypto = await import('crypto'); // Use dynamic import for crypto module
                    const hash = crypto.createHash('sha256');
                    hash.update(combinedText);
                    const checksumValue = hash.digest('hex');
                    const checksumAlgo = 'SHA-256';

                    console.log(`  Calculated Checksum (${checksumAlgo}): ${checksumValue.substring(0, 10)}...`); // Log abbreviation

                    // 4. Store Checksum in the database
                    const insertChecksumSql = `
            INSERT INTO agency_checksums (agency_id, effective_date, checksum_algo, checksum_value)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (agency_id, effective_date, checksum_algo)
            DO UPDATE SET
                checksum_value = EXCLUDED.checksum_value,
                calculation_timestamp = NOW();
        `;
                    await client.query(insertChecksumSql, [agencyId, effectiveDate, checksumAlgo, checksumValue]);
                    console.log(`  Stored/Updated checksum for Agency ID ${agencyId} on ${effectiveDate}.`);

                } catch (checksumError: any) {
                    console.error(`  Error calculating or storing checksum for Agency ID ${agencyId} on ${effectiveDate}:`, checksumError);
                    // Decide how to handle this - log and continue?
                }
            } else {
                // Optional: Store a default checksum or null if no text was found?
                // Or simply don't store anything if there's no text. Let's do nothing for now.
                console.log(`  Skipping checksum calculation as no text was extracted.`);
            }

            // 4. Calculate Word Count
            extractedTexts.forEach(item => {
                if (item.text) totalWordCount += item.text.trim().split(/\s+/).length;
            });
        }

        // 5. Store Word Count
        const insertSql = `
            INSERT INTO agency_word_counts (agency_id, effective_date, word_count)
            VALUES ($1, $2, $3)
            ON CONFLICT (agency_id, effective_date) DO UPDATE SET
                word_count = EXCLUDED.word_count,
                calculation_timestamp = NOW();
        `;
        await client.query(insertSql, [agencyId, effectiveDate, totalWordCount]);
        console.log(`  Stored/Updated word count: ${totalWordCount}`);

    } catch (error: any) {
        console.error(`  Error processing Agency ID ${agencyId} on ${effectiveDate}:`, error);
        // Decide how to handle errors - skip agency? Log and continue?
    }
}
/**
 * Main function to run the background job for a SPECIFIED LIST of dates
 */
async function runWordCountJob() { // Function name kept as original
    console.log("Starting word count background job for specified dates...");
    const client = await pool.connect(); // Assume pool is defined outside
    console.log("DB client acquired for job.");

    try {
        // --- Define the list of dates (YYYY-MM-DD) to process ---
        // ***** EDIT THIS LIST with the dates you want *****
        const datesToProcess: string[] = [
            "2015-12-31",
            "2020-01-01",
            // Add more date strings here
        ];
        // --- End of dates list ---

        if (datesToProcess.length === 0) {
            console.log("No dates specified in datesToProcess array. Exiting.");
            // Release client before returning if acquired
            await client.release();
            await pool.end(); // Close pool if exiting early
            return;
        }
        console.log("Processing for dates:", datesToProcess.join(', '));

        // --- Get Agencies (fetch once outside the date loop) ---
        console.log("Fetching all agencies...");
        const agenciesResult = await client.query('SELECT id, name FROM agencies ORDER BY id;'); // Order for consistency
        const allAgencies = agenciesResult.rows;
        console.log(`Found ${allAgencies.length} agencies to process.`);

        // --- Loop through EACH DATE in the list ---
        for (const effectiveDateStr of datesToProcess) {
            console.log(`\n===== Starting processing for Date: ${effectiveDateStr} =====`);

            // --- Loop through EACH AGENCY for the current date ---
            for (const agency of allAgencies) {
                // Call the function to process this specific agency and date
                // Assumes processAgencyDate(client, agencyId, agencyName, effectiveDate) exists
                await processAgencyDate(client, agency.id, agency.name, effectiveDateStr);
                // Optional: Add delay
                // await new Promise(resolve => setTimeout(resolve, 50));
            } // End agency loop for this date

            console.log(`===== Finished processing for Date: ${effectiveDateStr} =====`);
        } // End date loop

        console.log("\nWord count job finished processing all agencies for all specified dates.");

    } catch (error) {
        console.error("Fatal error during word count job:", error);
    } finally {
        // Ensure client is always released and pool potentially closed
        if (client) {
            await client.release();
        }
        // Closing the pool might be better done outside this function
        // depending on whether the script does other things, but for a
        // standalone run, closing it here is okay.
        await pool.end();
        console.log("DB client released, pool closed.");
    }
}

// --- To run it (assuming pool and processAgencyDate are defined elsewhere) ---
// runWordCountJob();

// --- Execute the main function ---
runWordCountJob();