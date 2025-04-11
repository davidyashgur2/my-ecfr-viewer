import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg'; // Use pg Pool for managing connections
import { XMLParser } from 'fast-xml-parser'; // XML Parser

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
    // isArray: (name, jpath, isLeafNode, isAttribute) => {
    //     // Treat these tags as arrays even if only one exists
    //     return ['P', 'HEAD', 'DIV3', 'DIV8'].includes(name);
    // }
});


// Define the structure of the returned text item for clarity (TypeScript)
interface ExtractedText {
    tag: string; // The tag name ('P' or 'HEAD') where text was found
    text: string; // The extracted text content
}


const MAX_RECURSION_DEPTH_TEXT = 15; // Safety limit for recursion depth

/**
 * Recursively finds and extracts text content from <P> (Paragraph) and <HEAD> (Heading)
 * tags nested within a given JavaScript object representation of an XML element.
 *
 * @param element The current JavaScript object (representing parsed XML element) to search within.
 * @param depth Current recursion depth (to prevent potential infinite loops).
 * @returns An array of objects, each containing the tag ('P' or 'HEAD') and its text content.
 */
function findTextRecursive(element: any, depth = 0): ExtractedText[] {
    let extractedTexts: ExtractedText[] = [];

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

export async function POST(request: NextRequest) {
    try {
        const { agencyName, effectiveDate } = await request.json();

        if (!agencyName || !effectiveDate) {
            return NextResponse.json({ error: 'Missing agencyName or effectiveDate' }, { status: 400 });
        }

        // --- 1. Get Agency Refs ---
        const agencyRefsResult = await pool.query(
            `SELECT a.id, acr.cfr_title, acr.cfr_chapter
       FROM agencies a
       JOIN agency_cfr_references acr ON a.id = acr.agency_id
       WHERE a.name = $1`,
            [agencyName]
        );

        let agencyId = agencyRefsResult.rows[0].id;

        if (agencyRefsResult.rows.length === 0) {
            return NextResponse.json({ results: [], message: `No references found for agency: ${agencyName}` });
        }

        const refsByTitle = agencyRefsResult.rows.reduce((acc, row) => {
            acc[row.cfr_title] = acc[row.cfr_title] || [];
            acc[row.cfr_title].push(row.cfr_chapter);
            return acc;
        }, {});
        const relevantTitles = Object.keys(refsByTitle).map(Number);

        if (relevantTitles.length === 0) {
            return NextResponse.json({ results: [], message: `No titles found for agency: ${agencyName}` });
        }

        // --- 2. Get XML Docs ---
        const xmlDocsResult = await pool.query(
            `SELECT cfr_title, xml_content::text -- Cast XML to text for parsing
       FROM ecfr_documents
       WHERE cfr_title = ANY($1::int[])
       AND effective_date = $2`,
            [relevantTitles, effectiveDate]
        );

        console.log(`Fetched ${xmlDocsResult.rowCount} XML documents for titles: ${relevantTitles.join(', ')}`);
        // --- 3. Parse XML & Extract Text ---
        let extractedTexts: { title: number; chapter: string; tag: string; text: string }[] = [];
        const MAX_RESULTS = 10; // Limit results to prevent overload

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
                            if (extractedTexts.length >= MAX_RESULTS) break;
                        }
                    } else {
                        console.log(`Title <span class="math-inline">\{titleNum\}\: No matching scope elements found for chapters \[</span>{relevantChapters.join(', ')}].`);
                    }
                }

            } catch (parseError) {
                console.error(`Error parsing XML for Title ${titleNum}:`, parseError);
                // Optionally return partial results or specific error
            }
            if (extractedTexts.length >= MAX_RESULTS) break; // Stop processing titles if max reached
        }

        return NextResponse.json({ results: extractedTexts});

    } catch (error) {
        console.error("API Error:", error);
        // Avoid sending detailed errors to client in production
        return NextResponse.json({ error: 'Failed to query agency data' }, { status: 500 });
    }
}