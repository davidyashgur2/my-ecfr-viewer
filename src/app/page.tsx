// src/app/page.tsx (example structure)
'use client'; // Required for hooks like useState, useEffect

import { useState, useEffect } from 'react';

// Define an interface for type safety (optional but good practice)
interface Agency {
  id: number;
  name: string;
}

interface TopAgency { name: string; word_count: number; }

// Define type for results (adapt based on your actual API response)
interface QueryResult {
  title: number;
  chapter: string;
  tag: string;
  text: string;
}

interface HistoryEntry {
  date: string;
  count: number;
  checksum_algorithm: string | null;
  checksum: string | null;
}

interface HistoryEntry { date: string; count: number; } // Type for history data

// Updated interface for top changing agency data from API
interface TopChangingAgency {
  name: string;
  count_latest: number;
  count_previous: number;
  change_absolute: number;
}
// Interface for the overall response from the top changing API
interface TopChangingResponse {
  latestDate: string | null;
  previousDate: string | null;
  agencies: TopChangingAgency[];
}


export default function HomePage() {

  // State for agency dropdown
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agenciesLoading, setAgenciesLoading] = useState(true);
  const [agenciesError, setAgenciesError] = useState<string | null>(null);

  // --- State for Available Dates ---
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [datesLoading, setDatesLoading] = useState(true);
  const [datesError, setDatesError] = useState<string | null>(null);

  // State for query form and results
  const [selectedAgency, setSelectedAgency] = useState(''); // Store selected agency name
  const [selectedDate, setSelectedDate] = useState('');

  const [results, setResults] = useState<QueryResult[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Loading state for query submission
  const [error, setError] = useState<string | null>(null); // Error state for query submission


  // *** 1. Add State for History ***
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [topAgencies, setTopAgencies] = useState<TopAgency[]>([]);
  const [topAgenciesLoading, setTopAgenciesLoading] = useState(true);
  const [topAgenciesError, setTopAgenciesError] = useState<string | null>(null);

  const [topChangingAgencies, setTopChangingAgencies] = useState<TopChangingAgency[]>([]);
  const [topChangingDates, setTopChangingDates] = useState<{ latestDate: string | null, previousDate: string | null }>({ latestDate: null, previousDate: null });
  const [topChangingLoading, setTopChangingLoading] = useState(true);
  const [topChangingError, setTopChangingError] = useState<string | null>(null);


  // Fetch agency list on mount (implementation details omitted for brevity)
  useEffect(() => {
    const loadInitialData = async () => {
      setAgenciesLoading(true);
      setDatesLoading(true);
      setTopChangingLoading(true);
      setHistoryLoading(true);
      setAgenciesError(null);
      setDatesError(null);
      setAgencies([]); // Clear previous data
      setAvailableDates([]); // Clear previous data
      setSelectedDate(''); // Clear selected date initially
      setTopChangingError(null);

      try {
        // Fetch agencies and dates in parallel
        const [agencyResponse, dateResponse, topAgencyResponse, topChangingResponse] = await Promise.all([
          fetch('/api/agencies'),
          fetch('/api/available-dates'),
          fetch('/api/top-agencies'), // <-- Fetch top agencies
          fetch('api/top-changing-agencies')
        ]);

        // --- Process Agency Response ---
        if (!agencyResponse.ok) {
          // Try to get specific error from response body, otherwise use status
          let errorMsg = `Agencies fetch failed! status: ${agencyResponse.status}`;
          try { const errorData = await agencyResponse.json(); errorMsg = errorData.error || errorMsg; } catch (_) { }
          throw new Error(errorMsg); // Throw error to be caught below
        }
        const agencyData: Agency[] = await agencyResponse.json();
        setAgencies(agencyData);

        // --- Process Date Response ---
        if (!dateResponse.ok) {
          // Try to get specific error from response body, otherwise use status
          let errorMsg = `Dates fetch failed! status: ${dateResponse.status}`;
          try { const errorData = await dateResponse.json(); errorMsg = errorData.error || errorMsg; } catch (_) { }
          throw new Error(errorMsg); // Throw error to be caught below
        }
        const dateData: string[] = await dateResponse.json();
        setAvailableDates(dateData);

        // Set default selected date only if dates were loaded successfully
        if (dateData.length > 0) {
          setSelectedDate(dateData[0]); // Set to the first date (most recent)
        }

        if (!topAgencyResponse.ok) { /* ... handle error ... */ throw new Error(/* ... */); }
        const topAgencyData: TopAgency[] = await topAgencyResponse.json();
        setTopAgencies(topAgencyData);

        if (!topChangingResponse.ok) { /* ... handle error ... */ throw new Error('Failed to load top changing agencies'); }
        const topChangingData: TopChangingResponse = await topChangingResponse.json();
        setTopChangingAgencies(topChangingData.agencies);
        setTopChangingDates({ // Store the comparison dates
          latestDate: topChangingData.latestDate,
          previousDate: topChangingData.previousDate
        });

      } catch (err: any) {
        // --- Catch ANY error from the try block (fetch, json parsing, or thrown errors) ---
        console.error("Error fetching initial data:", err);
        const errorMessage = err.message || 'Failed to load initial data';
        // Set both errors to indicate a general failure in loading initial data
        setAgenciesError(errorMessage);
        setDatesError(errorMessage);
        // Ensure states relying on fetched data are empty/default
        setAgencies([]);
        setAvailableDates([]);
        setSelectedDate('');
        setTopAgenciesError(err.message || 'Failed to load top agencies');
        setTopAgencies([]);
        setTopChangingError(err.message || 'Failed to load top changing agencies');
        setTopChangingAgencies([]);
        // --- End Catch Block ---
      } finally {
        // This runs regardless of success or error in try/catch
        setAgenciesLoading(false);
        setDatesLoading(false);
        setTopAgenciesLoading(false);
        setTopChangingLoading(false);
      }
    };

    loadInitialData();
  }, []); // Run once on mount

  // *** 2. Create Fetch History Function ***
  const fetchHistory = async (agencyToFetch: string) => {
    if (!agencyToFetch) return; // Don't fetch if no agency selected

    console.log(`Workspaceing history for: ${agencyToFetch}`);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryData([]); // Clear previous history
    try {
      const params = new URLSearchParams({ agencyName: agencyToFetch });
      // Optional: Add start/end date params if needed
      // params.append('startDate', 'YYYY-MM-DD');
      // params.append('endDate', 'YYYY-MM-DD');

      const response = await fetch(`/api/agency-word-counts?${params.toString()}`);
      if (!response.ok) {
        let errorMsg = `History fetch failed! status: ${response.status}`;
        try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (_) { }
        throw new Error(errorMsg);
      }
      const data: HistoryEntry[] = await response.json();
      setHistoryData(data);
      console.log(`Workspaceed ${data.length} history records.`);
    } catch (err: any) {
      setHistoryError(err.message || 'Failed to load word count history');
      console.error("Error fetching history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); // Prevent default form submission
    await performQuery(selectedAgency, selectedDate); // Call the refactored logic
  };

  // Extracted core query logic
  const performQuery = async (agency: string, date: string) => {
    if (!agency || !date) {
      setError("Please select an agency and date.");
      return; // Exit if validation fails (shouldn't happen if called correctly)
    }
    setIsLoading(true);
    setError(null);
    setResults([]);
    setHistoryData([]);
    setHistoryLoading(true);
    setHistoryError(null);

    let querySucceeded = false;
    try {
      const response = await fetch('/api/query-agency', { // Call your existing query route
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyName: agency, effectiveDate: selectedDate }),
      });

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (_) { /* Ignore if response body isn't JSON */ }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      setResults(data.results || []); // Update results state


    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
      console.error("Error submitting query:", err);
    } finally {
      setIsLoading(false);
    }

    // Fetch history regardless of main query success, if agency was provided
    if (agency) {
      await fetchHistory(agency);
    }

    // --- Fetch history AFTER main query attempt ---
    // We fetch history regardless of main query success, as long as an agency is selected
    if (selectedAgency) {
      await fetchHistory(selectedAgency);
    }
  };
  // Handler for clicking a top agency button
  const handleTopAgencyClick = (agencyName: string) => {
    console.log(`Top agency clicked: ${agencyName}`);
    console.log(`Preloading agency: ${agencyName}`);
    // Check if agencyName exists in the main list (optional, defensive)
    if (agencies.some(a => a.name === agencyName)) {
      setSelectedAgency(agencyName); // Update the dropdown selection
      // Automatically trigger the query for the selected agency and current date
      if (selectedDate) { // Ensure a date is also selected
        performQuery(agencyName, selectedDate);
      } else {
        setError("Please select an effective date."); // Should have a default date anyway
      }
    } else {
      console.warn(`Clicked agency "${agencyName}" not found in main agency list.`);
      // Optionally show an error to the user
    }
  };
  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white"> {/* Or text-[#D5A823] */}
        Regulation by Agency Inspector
      </h1>

      {/* Add this section, e.g., below the H1 title */}
      <div className="mb-10 text-center">
        <h2 className="text-lg font-medium text-gray-400 mb-4">
          Top 10 Agencies by Regulation Word Count as of {availableDates[0]}
        </h2>
        {/* Loading/Error states... */}
        {!topAgenciesLoading && !topAgenciesError && (
          <div className="flex flex-wrap gap-3 justify-center"> {/* Increased gap */}
            {topAgencies.length === 0 && <p className="text-sm text-gray-500">No data available.</p>}
            {topAgencies.map((agency) => (
              <button
                key={agency.name}
                onClick={() => handleTopAgencyClick(agency.name)}
                title={`Word Count: ${agency.word_count.toLocaleString()}`}
                // --- Updated Classes ---
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ease-in-out shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950
                                      ${selectedAgency === agency.name
                    ? 'bg-purple-600 border-purple-500 text-white ring-purple-500' // Selected style
                    : 'bg-gray-700/80 border-gray-600/80 text-gray-200 hover:bg-gray-700 hover:border-gray-600 hover:text-white focus:ring-purple-500' // Default style
                  }`}
              // --- End Updated Classes ---
              >
                {agency.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* End Top 10 Section */}

      {/* Wrap inputs and button in a form for submission handling */}
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center justify-center">
          {/* --- Agency Dropdown --- */}
          <div className="w-full md:w-1/2">
            <label htmlFor="agency-select" className="block text-sm font-medium text-gray-400 mb-1">Select Agency</label>
            <select
              id="agency-select"
              className="block w-full mt-1 rounded-md border-gray-600 bg-gray-800 text-white shadow-sm // Core styles
              focus:border-purple-500 focus:ring focus:ring-purple-500 focus:ring-opacity-50 // Focus styles
              disabled:opacity-50" // Disabled style
              value={selectedAgency}
              onChange={(e) => setSelectedAgency(e.target.value)}
              disabled={agenciesLoading || !!agenciesError} // Disable while loading/error
              required // Make selection mandatory
            >
              {/* Default option */}
              <option value="" disabled>
                {agenciesLoading ? 'Loading agencies...' : agenciesError ? 'Error loading' : '-- Select an Agency --'}
              </option>
              {/* Populate options from state */}
              {!agenciesLoading && !agenciesError && agencies.map((agency) => (
                <option key={agency.id} value={agency.name}> {/* Use name as value */}
                  {agency.name}
                </option>
              ))}
            </select>
            {/* Display error message if fetching agencies failed */}
            {agenciesError && <p className="text-red-400 text-xs mt-1">{agenciesError}</p>}
          </div>

          {/* --- Date Dropdown (Replaces Input) --- */}
          <div className="w-full md:w-1/4">
            <label htmlFor="date-select" className="block text-sm font-medium text-gray-400 mb-1">Effective Date</label>
            <select
              id="date-select"
              className="block w-full mt-1 rounded-md border-gray-600 bg-gray-800 text-white shadow-sm
              focus:border-purple-500 focus:ring focus:ring-purple-500 focus:ring-opacity-50
              disabled:opacity-50"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              // Disable if still loading, error occurred, or no dates fetched
              disabled={datesLoading || !!datesError || availableDates.length === 0}
              required
            >
              {/* Conditional default/loading/error options */}
              {datesLoading && <option value="" disabled>Loading dates...</option>}
              {datesError && <option value="" disabled>Error loading dates</option>}
              {!datesLoading && !datesError && availableDates.length === 0 && <option value="" disabled>No dates available</option>}

              {/* Populate options from fetched dates */}
              {availableDates.map((dateStr) => (
                <option key={dateStr} value={dateStr}>
                  {dateStr}
                </option>
              ))}
            </select>
            {datesError && <p className="text-red-400 text-xs mt-1">{datesError}</p>}
          </div>


          {/* --- Submit Button --- */}
          <div className="w-full md:w-auto self-end pt-5"> {/* Adjusted alignment */}
            <button
              type="submit" // Important for form submission
              className="w-full md:w-auto px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors disabled:opacity-50"
              disabled={isLoading || agenciesLoading || !selectedAgency} // Disable during loads or if no agency selected
            >
              {isLoading ? 'Querying...' : 'Query Words'}
            </button>
          </div>
        </div>
      </form> {/* End of form */}

      {/* --- Results Display Area --- */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Column 1: Current Query Results */}
        <div className="p-6 bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-xl shadow-lg min-h-[200px]">
          <h2 className="text-xl font-semibold mb-4 text-white">
            Text Snippets for <span className="text-purple-400">{selectedDate}</span>
          </h2>
          {isLoading && <p className="text-center text-gray-400">Loading results...</p>}
          {error && <p className="text-center text-red-400">Error: {error}</p>}
          {!isLoading && !error && (
            <>
              {/* Display Text Snippets */}
              {results.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {results.map((item, index) => (
                    // Apply conditional styles directly to the container div
                    <div key={index} className={`
                py-2 border-b border-gray-700/50
                ${item.tag === 'HEAD' ? 'text-base font-semibold text-white mb-1' : 'text-sm text-gray-300 mb-2'}
            `}>
                      {/* REMOVED: <span className="font-semibold text-purple-500 mr-2">&lt;{item.tag}&gt;</span> */}
                      {/* Just display the text */}
                      {item.text}
                    </div>
                  ))}
                </div>
              )}
              {/* Handle No Results */}
              {results.length === 0 && <p className="text-center text-gray-500">Perform a query to see text snippets.</p>}
              {results.length === 0 && <p className="text-center text-gray-500">Query complete. No relevant text found.</p>}
            </>
          )}
        </div>

        {/* Column 2: Historical Word Counts */}
        <div className="p-6 bg-gradient-to-br from-gray-800 via-gray-900 to-black border border-gray-700 rounded-xl shadow-lg min-h-[200px]">
          <h2 className="text-xl font-semibold mb-4 text-white">
            Word Count History
          </h2>
          {/* Only show history if an agency is selected */}
          {!selectedAgency && <p className="text-center text-gray-500">Select an agency to view history.</p>}
          {selectedAgency && (
            <>
              {historyLoading && <p className="text-center text-gray-400">Loading history...</p>}
              {historyError && <p className="text-center text-red-400">Error loading history: {historyError}</p>}
              {!historyLoading && !historyError && historyData.length === 0 && (
                <p className="text-center text-gray-500">No historical word count data found for <span className='font-medium text-gray-400'>{selectedAgency}</span>.</p>
              )}
              {!historyLoading && !historyError && historyData.length > 0 && (
                <div className="max-h-[31rem] overflow-y-auto custom-scrollbar pr-2"> {/* Adjusted max-h */}
                  <ul className="space-y-1">
                    {historyData.map((item) => (
                      // Added padding-right (pr-2) to the li itself
                      <li key={item.date} className="flex justify-between items-center text-sm py-1 border-b border-gray-700/50 pr-2">
                        <span className="text-gray-300">{item.date}:</span>
                        {/* Increased spacing to space-x-4 */}
                        <div className="flex items-center space-x-4">
                          {/* Display checksum hash */}
                          {item.checksum && (
                            <span
                              className="text-xs text-gray-500 font-mono flex-shrink-0" // Added flex-shrink-0
                              title={`${item.checksum_algorithm}: ${item.checksum}`}
                            >
                              {item.checksum.substring(0, 24)}...
                            </span>
                          )}
                          {/* Display word count */}
                          <span className="font-mono text-gray-100 whitespace-nowrap"> {/* Added whitespace-nowrap */}
                            {item.count.toLocaleString()} words
                          </span>
                        </div>
                      </li>
                    ))}

                  </ul>
                </div>
              )}
            </>
          )}


        </div>

          {/* Add some whitespace */}
          <div className="h-2"></div>

      </div>{/* --- Section for Top 5 Agencies by POSITIVE Change Table --- */}
      <div className="mb-12 text-center">
        {/* Updated Heading */}
        <h2 className="text-lg font-semibold text-gray-300 mb-1">
          Top 5 Agencies by Word Count Increase
        </h2>
        {/* Display Comparison Dates */}
        {topChangingDates.previousDate && topChangingDates.latestDate && (
          <p className="text-xs text-gray-500 mb-4">
            (Comparing {topChangingDates.previousDate} to {topChangingDates.latestDate})
          </p>
        )}

                  {/* Add some whitespace */}
                  <div className="h-2"></div>

        {topChangingLoading && <p className="text-sm text-gray-500 py-4">Loading data...</p>}
        {topChangingError && <p className="text-sm text-red-400 py-4">Error loading data: {topChangingError}</p>}

        {!topChangingLoading && !topChangingError && (
          <div className="overflow-x-auto relative border border-gray-700 rounded-lg shadow-md max-w-4xl mx-auto bg-gray-900/50">
            {topChangingAgencies.length === 0 ? (
              <p className="text-center text-gray-500 py-8 px-4">
                {topChangingDates.previousDate ? 'No agencies found with a significant word count increase between the latest two dates.' : 'Not enough historical data (need at least two dates with counts > 0) for comparison.'}
              </p>
            ) : (
              <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-xs text-gray-400 uppercase bg-gray-800/60">
                  <tr>
                    <th scope="col" className="py-3 px-6">Agency</th>
                    <th scope="col" className="py-3 px-6 text-right">Increase</th>{/* Changed Header */}
                    <th scope="col" className="py-3 px-6 text-right">Latest Count ({topChangingDates.latestDate || 'N/A'})</th>{/* Show Date */}
                    <th scope="col" className="py-3 px-6 text-right">Previous Count ({topChangingDates.previousDate || 'N/A'})</th>{/* Show Date */}
                  </tr>
                </thead>
                <tbody>{topChangingAgencies.map((agency) => (
                  <tr key={agency.name} className="border-b border-gray-700 hover:bg-gray-800/50 transition-colors duration-150 ease-in-out">
                    {/* Agency Name Cell - Make it clickable */}
                    <th scope="row" className="py-4 px-6 font-medium text-white whitespace-nowrap">
                      <button
                        onClick={() => handleTopAgencyClick(agency.name)}
                        className="text-left hover:text-purple-400 hover:underline focus:outline-none focus:underline focus:text-purple-400"
                        title={`Click to query ${agency.name}`}
                      >
                        {agency.name}
                      </button>
                    </th>
                    {/* Change Amount Cell */}
                    <td className="py-4 px-6 text-right font-semibold text-green-400"> {/* Changed Color */}
                      +{agency.change_absolute.toLocaleString()} {/* Added '+' sign */}
                    </td>
                    {/* Latest Count Cell */}
                    <td className="py-4 px-6 text-right font-mono">
                      {agency.count_latest.toLocaleString()}
                    </td>
                    {/* Previous Count Cell */}
                    <td className="py-4 px-6 text-right font-mono text-gray-400"> {/* Muted previous count slightly */}
                      {agency.count_previous.toLocaleString()}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
      {/* --- End Top 5 Changing Section --- */}

    </div>
  );
}