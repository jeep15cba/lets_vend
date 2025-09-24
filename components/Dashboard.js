import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [dexData, setDexData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const [isMounted, setIsMounted] = useState(false);

  // Client-side mounting check
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update clock every second
  useEffect(() => {
    if (!isMounted) return;

    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, [isMounted]);

  // Calculate next 5-minute interval and sync countdown
  const calculateNextRefresh = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    // Find next 5-minute interval (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)
    const nextInterval = Math.ceil(minutes / 5) * 5;
    const nextRefreshMinutes = nextInterval === 60 ? 0 : nextInterval;

    // Create next refresh time
    const nextRefresh = new Date(now);
    if (nextRefreshMinutes === 0) {
      nextRefresh.setHours(nextRefresh.getHours() + 1);
      nextRefresh.setMinutes(0);
    } else {
      nextRefresh.setMinutes(nextRefreshMinutes);
    }
    nextRefresh.setSeconds(0);
    nextRefresh.setMilliseconds(0);

    // Calculate seconds until next refresh
    const secondsUntilRefresh = Math.floor((nextRefresh.getTime() - now.getTime()) / 1000);
    return Math.max(1, secondsUntilRefresh);
  };

  // Initialize countdown to next 5-minute interval
  useEffect(() => {
    if (!isMounted) return;

    // Set initial countdown to sync with 5-minute intervals
    const initialCountdown = calculateNextRefresh();
    setCountdown(initialCountdown);
  }, [isMounted]);

  // Synchronized countdown timer and auto-refresh
  useEffect(() => {
    if (!isMounted) return;

    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Timer reached 0, fetch new data and calculate next interval
          fetchDexData();
          return calculateNextRefresh();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [isMounted]);

  const fetchDexData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Authenticating first...');
      const authResponse = await axios.post('/api/cantaloupe/auth');

      if (!authResponse.data.success) {
        throw new Error('Authentication failed');
      }

      console.log('Authentication successful, fetching DEX data...');
      const response = await axios.post('/api/cantaloupe/dex-data', {
        cookies: authResponse.data.cookies
      });

      if (response.data.success) {
        setDexData(response.data);
        setLastUpdate(new Date(response.data.timestamp));
        console.log('DEX data loaded successfully');
      } else {
        throw new Error('Failed to fetch DEX data');
      }
    } catch (error) {
      console.error('Error fetching DEX data:', error);
      setError(error.response?.data?.error || error.message || 'Failed to fetch DEX data');
    } finally {
      setLoading(false);
    }
  };

  const formatDexData = (data) => {
    if (!data) return null;

    // If it's raw text data (DEX format), display it formatted
    if (data.rawData && data.type === 'text') {
      return (
        <div className="terminal">
          <div className="mb-2 text-green-300 text-xs">
            Machine ID: {data.machineId} | Updated: {new Date(data.timestamp).toLocaleString()}
          </div>
          <pre className="whitespace-pre-wrap">{data.rawData}</pre>
        </div>
      );
    }

    // If it's JSON data, display it formatted
    if (data.data && data.type === 'json') {
      return (
        <div className="bg-gray-100 p-4 rounded-lg overflow-auto max-h-96">
          <div className="mb-2 text-gray-600 text-sm">
            Machine ID: {data.machineId} | Updated: {new Date(data.timestamp).toLocaleString()}
          </div>
          <pre className="text-sm">{JSON.stringify(data.data, null, 2)}</pre>
        </div>
      );
    }

    return null;
  };

  // Format AEST time
  const formatAESTTime = (date) => {
    return date.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      hour12: true,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Format countdown timer
  const formatCountdown = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const machineId = '23036647';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Cantaloupe DEX Dashboard</h1>
            <p className="text-gray-600">Real-time vending machine data exchange monitoring</p>
          </div>
          <div className="flex flex-col items-end space-y-3">
            {/* Digital Clock */}
            <div className="bg-slate-900 text-green-400 px-4 py-2 rounded-lg font-mono text-sm shadow-lg">
              <div className="text-xs text-green-300 mb-1">AEST Time</div>
              <div className="text-lg font-bold">
                {isMounted ? formatAESTTime(currentTime) : '--:--:--'}
              </div>
            </div>

            {/* Countdown Timer */}
            <div className="bg-blue-900 text-blue-100 px-4 py-2 rounded-lg font-mono text-sm shadow-lg">
              <div className="text-xs text-blue-300 mb-1">Next Auto-Refresh</div>
              <div className="text-lg font-bold text-center">
                {isMounted ? formatCountdown(countdown) : '--:--'}
              </div>
              <div className="text-xs text-blue-300 mt-1">Every 5 minutes</div>
            </div>

            {/* User Info */}
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Welcome, {user?.email}
              </div>
              <button
                onClick={signOut}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Machine Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Machine ID:</span>
                <span className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">{machineId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Status:</span>
                <span className={`px-2 py-1 rounded text-sm ${
                  dexData ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {dexData ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Last Update:</span>
                <span className="text-sm text-gray-500">
                  {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Actions</h2>
            <div className="space-y-3">
              <button
                onClick={fetchDexData}
                disabled={loading}
                className="w-full btn-primary"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Fetching...
                  </span>
                ) : (
                  'Fetch DEX Data'
                )}
              </button>

              <button
                onClick={() => window.open(`https://dashboard.cantaloupe.online/dex/getRawDex/${machineId}`, '_blank')}
                className="w-full btn-secondary"
              >
                View Raw in Browser
              </button>

              <a
                href="/devices"
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors text-center block"
              >
                📱 Manage Devices
              </a>

              <a
                href="/dex"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors text-center block"
              >
                📊 DEX Records
              </a>
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Data Info</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Format:</span>
                <span className="text-sm">
                  {dexData?.type ? dexData.type.toUpperCase() : 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Size:</span>
                <span className="text-sm">
                  {dexData?.rawData ? `${Math.round(dexData.rawData.length / 1024)}KB` : '0KB'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Endpoint:</span>
                <span className="text-xs text-gray-500 font-mono">
                  /dex/getRawDex/{machineId}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Display */}
        {dexData && (
          <div className="card">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">DEX Data</h2>
              <span className="text-sm text-gray-500">
                Updated: {lastUpdate?.toLocaleString()}
              </span>
            </div>
            {formatDexData(dexData)}
          </div>
        )}

        {/* Welcome State */}
        {!dexData && !loading && !error && (
          <div className="card text-center py-12">
            <div className="max-w-md mx-auto">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Connect</h3>
              <p className="text-gray-500 mb-6">
                Click "Fetch DEX Data" to retrieve information from your vending machine.
              </p>
              <button
                onClick={fetchDexData}
                className="btn-primary"
              >
                Get Started
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>Cantaloupe DEX Dashboard v1.0 | Machine ID: {machineId}</p>
        </div>
      </div>
    </div>
  );
}