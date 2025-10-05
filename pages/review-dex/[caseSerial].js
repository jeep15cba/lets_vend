import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../../components/Navigation';

export default function ReviewDexPage() {
  const { user, loading, timezone } = useAuth();
  const router = useRouter();
  const { caseSerial } = router.query;
  const [dexRecords, setDexRecords] = useState([]);
  const [machineDetails, setMachineDetails] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!caseSerial || !user) return;

    const fetchDexRecords = async () => {
      try {
        setLoadingData(true);
        const response = await fetch(`/api/dex/review/${encodeURIComponent(caseSerial)}`);

        if (!response.ok) {
          throw new Error('Failed to fetch DEX records');
        }

        const data = await response.json();
        setDexRecords(data.records || []);
        setMachineDetails(data.machine || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingData(false);
      }
    };

    fetchDexRecords();
  }, [caseSerial, user]);

  // Format date with user's timezone
  // Cantaloupe timestamps come as "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" in GMT/UTC
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';

    let date;

    // If already has 'Z' suffix, it's explicitly UTC
    if (dateString.endsWith('Z')) {
      date = new Date(dateString);
    }
    // If it has a timezone offset like +10:00, use as-is
    else if (dateString.includes('+') || (dateString.includes('-') && dateString.lastIndexOf('-') > 10)) {
      date = new Date(dateString);
    }
    // Otherwise, treat as UTC by adding 'Z' suffix
    else {
      // Convert "YYYY-MM-DD HH:MM:SS" to ISO format with Z
      let isoString = dateString;
      if (dateString.includes(' ')) {
        isoString = dateString.replace(' ', 'T') + 'Z';
      } else if (!dateString.endsWith('Z')) {
        isoString = dateString + 'Z';
      }
      date = new Date(isoString);
    }

    return date.toLocaleString('en-AU', {
      timeZone: timezone || 'Australia/Brisbane',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Review DEX - {caseSerial} - VendTrack</title>
        <meta name="description" content={`Review DEX data for ${caseSerial}`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Navigation />

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="text-indigo-600 hover:text-indigo-900 flex items-center gap-2 mb-4"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Devices
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Review DEX Data</h1>
            <div className="mt-3 space-y-1">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Case Serial:</span> <span className="font-mono font-semibold">{caseSerial}</span>
              </p>
              {machineDetails && (
                <>
                  {machineDetails.location && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Location:</span> {machineDetails.location}
                    </p>
                  )}
                  {machineDetails.model && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Model:</span> {machineDetails.model}
                    </p>
                  )}
                  {machineDetails.type && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Type:</span> {machineDetails.type}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Loading State */}
          {loadingData && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading DEX records...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* DEX Records - 2 Column Layout */}
          {!loadingData && !error && (
            <>
              {dexRecords.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <p className="text-gray-600">No DEX records found for this device.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {dexRecords.map((record) => (
                    <div key={record.id} className="bg-white rounded-lg shadow border border-gray-200">
                      {/* Header */}
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-500">DEX ID</p>
                            <p className="font-mono text-sm font-semibold text-gray-900">{record.dex_id}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Captured</p>
                            <p className="text-sm font-medium text-gray-900">{formatDate(record.created_at)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Raw DEX Data */}
                      <div className="p-4">
                        <p className="text-xs font-medium text-gray-700 mb-2">Raw DEX Data:</p>
                        <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded overflow-x-auto font-mono whitespace-pre-wrap break-all">
                          {record.raw_content || 'No data'}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
