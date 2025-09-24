import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

export default function DexList() {
  const { user, signOut } = useAuth();
  const [deviceSerials, setDeviceSerials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [dexRawData, setDexRawData] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [searchingDex, setSearchingDex] = useState(false);

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

  const loadDeviceSerials = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Loading device serials...');
      const response = await axios.post('/api/cantaloupe/capture-serials');

      if (response.data.success) {
        setDeviceSerials(response.data.deviceDetails);
        setLastUpdate(new Date(response.data.timestamp));
        console.log(`Loaded ${response.data.serialCount} device serials`);
      } else {
        throw new Error('Failed to load device serials');
      }
    } catch (error) {
      console.error('Error loading device serials:', error);
      setError(error.response?.data?.error || error.message || 'Failed to load device serials');
    } finally {
      setLoading(false);
    }
  };

  const findAndViewLatestDex = async (caseSerial, deviceInfo) => {
    setSearchingDex(true);
    try {
      console.log(`Finding latest DEX for case serial: ${caseSerial}`);

      // First find the latest DEX ID for this case serial using mock data for now
      const findResponse = await axios.post('/api/cantaloupe/find-latest-dex-mock', {
        caseSerial: caseSerial
      });

      if (!findResponse.data.success) {
        throw new Error(`No DEX records found for ${caseSerial}`);
      }

      const latestDexId = findResponse.data.latestDexId;
      console.log(`Found latest DEX ID: ${latestDexId} for ${caseSerial}`);

      // Now fetch the raw DEX data for this ID
      const authResponse = await axios.post('/api/cantaloupe/auth');
      if (!authResponse.data.success) {
        throw new Error('Authentication failed');
      }

      const response = await axios.post('/api/cantaloupe/dex-data', {
        cookies: authResponse.data.cookies,
        machineId: latestDexId
      });

      if (response.data.success) {
        setDexRawData(response.data);
        setSelectedDevice({
          caseSerial: caseSerial,
          dexId: latestDexId,
          deviceInfo: deviceInfo,
          dexRecord: findResponse.data.dexRecord
        });
      } else {
        throw new Error('Failed to fetch raw DEX data');
      }
    } catch (error) {
      console.error('Error finding and fetching DEX data:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSearchingDex(false);
    }
  };

  const formatDeviceList = () => {
    if (!deviceSerials || deviceSerials.length === 0) return null;

    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="text-sm text-blue-800">
            Showing {deviceSerials.length} devices. Click on any Case Serial to find and view its latest DEX record.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Case Serial</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deviceSerials.map((device, index) => (
                <tr key={device.caseSerial || index} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm font-mono text-blue-600 cursor-pointer hover:underline"
                      onClick={() => findAndViewLatestDex(device.caseSerial, device)}>
                    {device.caseSerial}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {device.deviceId}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {device.customerName}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {new Date(device.lastSeen).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      device.state === 'approved' ? 'bg-green-100 text-green-800' :
                      device.state === 'banned' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {device.state}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <button
                      onClick={() => findAndViewLatestDex(device.caseSerial, device)}
                      disabled={searchingDex}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {searchingDex ? 'Finding DEX...' : 'View Latest DEX'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Device DEX Browser</h1>
            <p className="text-gray-600">Browse all devices and click to view their latest DEX data</p>
          </div>
          <div className="flex flex-col items-end space-y-3">
            {/* Digital Clock */}
            <div className="bg-slate-900 text-green-400 px-4 py-2 rounded-lg font-mono text-sm shadow-lg">
              <div className="text-xs text-green-300 mb-1">AEST Time</div>
              <div className="text-lg font-bold">
                {isMounted ? formatAESTTime(currentTime) : '--:--:--'}
              </div>
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

        {/* Navigation */}
        <div className="mb-6">
          <nav className="flex space-x-4">
            <a
              href="/"
              className="bg-white text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 transition-colors"
            >
              ← Dashboard
            </a>
            <a
              href="/devices"
              className="bg-white text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 transition-colors"
            >
              📱 Devices
            </a>
            <button
              onClick={loadDeviceSerials}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load All Devices'}
            </button>
          </nav>
        </div>

        {/* Stats Cards */}
        {deviceSerials && deviceSerials.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-blue-600">
                {deviceSerials.length}
              </div>
              <div className="text-gray-600">Total Devices</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-green-600">
                {deviceSerials.filter(d => d.state === 'approved').length}
              </div>
              <div className="text-gray-600">Approved</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-yellow-600">
                {deviceSerials.filter(d => new Date(d.lastSeen) > new Date(Date.now() - 24*60*60*1000)).length}
              </div>
              <div className="text-gray-600">Active (24h)</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">
                {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
              </div>
              <div className="text-gray-600">Last Updated</div>
            </div>
          </div>
        )}

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

        {/* Device List Display */}
        {deviceSerials && deviceSerials.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">All Devices</h2>
              <span className="text-sm text-gray-500">
                Updated: {lastUpdate?.toLocaleString()}
              </span>
            </div>
            {formatDeviceList()}
          </div>
        )}

        {/* Raw DEX Data Display */}
        {dexRawData && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">
                Latest DEX Data - {selectedDevice.caseSerial} (DEX ID: {selectedDevice.dexId})
              </h2>
              <button
                onClick={() => {setDexRawData(null); setSelectedDevice(null);}}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕ Close
              </button>
            </div>
            <div className="mb-4 bg-gray-50 p-4 rounded">
              <div className="text-sm text-gray-600">
                <strong>Device:</strong> {selectedDevice.deviceInfo.customerName} •
                <strong> Device ID:</strong> {selectedDevice.deviceInfo.deviceId} •
                <strong> Last Seen:</strong> {new Date(selectedDevice.deviceInfo.lastSeen).toLocaleString()}
              </div>
              {selectedDevice.dexRecord && selectedDevice.dexRecord.dexRaw && (
                <div className="text-sm text-gray-600 mt-2">
                  <strong>DEX Created:</strong> {new Date(selectedDevice.dexRecord.dexRaw.created).toLocaleString()} •
                  <strong> Firmware:</strong> {selectedDevice.dexRecord.dexRaw.firmware} •
                  <strong> Status:</strong> {selectedDevice.dexRecord.dexRaw.parsed ? 'Parsed' : 'Unparsed'}
                  {selectedDevice.dexRecord.dexRaw.VDIUploaded && ' • VDI Uploaded'}
                </div>
              )}
            </div>
            <div className="terminal">
              <div className="mb-2 text-green-300 text-xs">
                Machine: {selectedDevice.caseSerial} | DEX ID: {selectedDevice.dexId} | Updated: {new Date(dexRawData.timestamp).toLocaleString()}
              </div>
              <pre className="whitespace-pre-wrap text-sm">{dexRawData.rawData || JSON.stringify(dexRawData.data, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* Welcome State */}
        {deviceSerials.length === 0 && !loading && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="max-w-md mx-auto">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Device DEX Browser</h3>
              <p className="text-gray-500 mb-6">
                Load all devices to browse and find the latest DEX data for each device.
              </p>
              <button
                onClick={loadDeviceSerials}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Load All Devices
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}