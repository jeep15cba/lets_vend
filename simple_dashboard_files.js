// pages/api/cantaloupe/auth.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const username = process.env.CANTALOUPE_USERNAME;
  const password = process.env.CANTALOUPE_PASSWORD;

  if (!username || !password) {
    return res.status(500).json({ error: 'Missing credentials in environment variables' });
  }

  try {
    console.log('Starting authentication process...');

    // First, get the login page to extract CSRF token
    const loginPageResponse = await fetch('https://dashboard.cantaloupe.online/login', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const loginPageHtml = await loginPageResponse.text();
    const cookies = loginPageResponse.headers.get('set-cookie');
    
    console.log('Login page loaded, extracting CSRF token...');

    // Extract CSRF token from the HTML
    const csrfMatch = loginPageHtml.match(/name="_token"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

    if (!csrfToken) {
      console.error('Could not extract CSRF token from login page');
      return res.status(500).json({ error: 'Could not extract CSRF token' });
    }

    console.log('CSRF token extracted, performing login...');

    // Perform login
    const formData = new URLSearchParams();
    formData.append('_token', csrfToken);
    formData.append('email', username);
    formData.append('password', password);

    const loginResponse = await fetch('https://dashboard.cantaloupe.online/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://dashboard.cantaloupe.online/login',
        'Origin': 'https://dashboard.cantaloupe.online',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData,
      redirect: 'manual'
    });

    const authCookies = loginResponse.headers.get('set-cookie');
    console.log('Login response status:', loginResponse.status);
    
    if (loginResponse.status === 302 && authCookies) {
      console.log('Authentication successful');
      res.status(200).json({ 
        success: true, 
        cookies: authCookies,
        message: 'Authentication successful' 
      });
    } else {
      console.error('Authentication failed, status:', loginResponse.status);
      const responseText = await loginResponse.text();
      console.error('Response body:', responseText.substring(0, 200));
      res.status(401).json({ error: 'Authentication failed' });
    }

  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication error: ' + error.message });
  }
}

// pages/api/cantaloupe/dex-data.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const machineId = req.query.machineId || process.env.CANTALOUPE_MACHINE_ID;

  if (!machineId) {
    return res.status(400).json({ error: 'Machine ID is required' });
  }

  try {
    // First authenticate to get cookies
    console.log('Authenticating for DEX data access...');
    const authResponse = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const authData = await authResponse.json();

    if (!authData.success) {
      return res.status(401).json({ error: 'Authentication failed' });
    }

    console.log('Authentication successful, fetching DEX data...');

    // Now fetch DEX data with authenticated cookies
    const response = await fetch(`https://dashboard.cantaloupe.online/dex/getRawDex/${machineId}`, {
      method: 'GET',
      headers: {
        'Cookie': authData.cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://dashboard.cantaloupe.online/dex',
        'Connection': 'keep-alive'
      }
    });

    console.log('DEX data response status:', response.status);

    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ error: 'Authentication required - please check credentials' });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DEX data fetch error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Failed to fetch data: ${response.statusText}`,
        details: errorText.substring(0, 200)
      });
    }

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('DEX data retrieved successfully (JSON format)');
      res.status(200).json({
        success: true,
        data: data,
        type: 'json',
        machineId: machineId,
        timestamp: new Date().toISOString()
      });
    } else {
      const data = await response.text();
      console.log('DEX data retrieved successfully (text format), length:', data.length);
      res.status(200).json({
        success: true,
        rawData: data,
        type: 'text',
        machineId: machineId,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('DEX data fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch DEX data: ' + error.message,
      machineId: machineId
    });
  }
}

// components/Dashboard.js
import { useState } from 'react';
import axios from 'axios';

export default function Dashboard() {
  const [dexData, setDexData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchDexData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Fetching DEX data...');
      const response = await axios.get('/api/cantaloupe/dex-data');
      
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

  const machineId = process.env.NEXT_PUBLIC_CANTALOUPE_MACHINE_ID || '22995469';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Cantaloupe DEX Dashboard</h1>
          <p className="text-gray-600">Real-time vending machine data exchange monitoring</p>
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

// pages/index.js
import Dashboard from '../components/Dashboard';
import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>Cantaloupe DEX Dashboard</title>
        <meta name="description" content="Vending machine DEX data dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Dashboard />
    </>
  );
}