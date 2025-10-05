import { useState, useEffect } from 'react';
import { getMA5ErrorDescription } from '../lib/ma5-error-codes';
import { getEA1ErrorDescription } from '../lib/ea1-error-codes';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

// Helper function to convert temperature from raw DEX format to Celsius
// Some machines report as integers (e.g., 800 = 8.0°C), others as actual values (e.g., 5 = 5°C)
const convertTemperature = (rawTemp) => {
  if (!rawTemp || rawTemp === 'N/A') return null;
  const temp = parseFloat(rawTemp);
  if (isNaN(temp)) return null;
  // Values > 50 need to be divided by 100 (e.g., 800 = 8.0°C)
  // Values <= 50 are already in correct format (e.g., 5 = 5°C)
  return temp > 50 ? (temp / 100).toFixed(1) : temp.toFixed(1);
};

// Helper function to format dates in AEST timezone
// Cantaloupe timestamps come as "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" in GMT/UTC
// We need to parse them as GMT and convert to AEST for display
const formatAESTDate = (dateString, includeTime = true) => {
  if (!dateString) return 'Never';

  // Parse the date string as UTC/GMT
  let date;

  // If it already has a Z, it's properly marked as UTC
  if (dateString.endsWith('Z')) {
    date = new Date(dateString);
  }
  // If it has a timezone offset like +10:00, use as-is
  else if (dateString.includes('+') || (dateString.includes('-') && dateString.lastIndexOf('-') > 10)) {
    date = new Date(dateString);
  }
  // Otherwise, treat as UTC by appending Z
  else {
    let isoString = dateString;
    // Convert space to T if needed
    if (isoString.includes(' ')) {
      isoString = isoString.replace(' ', 'T');
    }
    // Append Z to indicate UTC
    if (!isoString.endsWith('Z')) {
      isoString += 'Z';
    }
    date = new Date(isoString);
  }

  // Format in Australian locale with Brisbane timezone (AEST/AEDT)
  const options = {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime && {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  };

  return date.toLocaleString('en-AU', options);
};

// Helper function to find the dexId from dex_history that matches the latest_dex_data timestamp
const getDexIdFromHistory = (device) => {
  if (!device.latest_dex_data || !device.dex_history || device.dex_history.length === 0) {
    return null;
  }

  // Find the entry in dex_history that matches the latest_dex_data timestamp
  const latestEntry = device.dex_history.find(entry => entry.created === device.latest_dex_data);
  return latestEntry?.dexId || device.dex_history[0]?.dexId || null;
};

export default function Devices() {
  const { user, signOut, hasCredentials, credentialsLoading } = useAuth();
  // devicesData removed - now using savedDevices from Supabase directly
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMounted, setIsMounted] = useState(false);
  // Filter state removed - filters now handled by formatSavedDevicesData if needed
  const [savedDevices, setSavedDevices] = useState([]);
  const [dexCollectionActive, setDexCollectionActive] = useState(false);
  const [lastDexCollection, setLastDexCollection] = useState(null);
  const [editingDevice, setEditingDevice] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    location: '',
    machine_type: '',
    cash_enabled: false
  });
  const [expandedDex, setExpandedDex] = useState(null);
  const [expandedErrors, setExpandedErrors] = useState(null);
  const [dexDetails, setDexDetails] = useState({});

  // Filter and sort state
  const [filters, setFilters] = useState({
    type: 'all', // 'all', 'beverage', 'food'
    cash: 'all', // 'all', 'enabled', 'disabled'
    errors: 'all', // 'all', 'has_unactioned', 'no_errors'
    dex4hrs: 'all', // 'all', 'yes', 'no'
    search: '',
    hideNoDex: true // Hide machines with no DEX data - permanently active by default
  });
  const [sortBy, setSortBy] = useState('case'); // 'case', 'last_seen'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'

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

  // Load saved devices on page load
  useEffect(() => {
    if (!isMounted || !user) return;

    console.log('Loading saved devices on page load...');
    loadSavedDevices();
  }, [isMounted, user]);

  // Start 20-minute DEX collection timer when devices are available - runs at fixed intervals (:00, :20, :40)
  useEffect(() => {
    if (!isMounted || savedDevices.length === 0) return;

    console.log('Starting 20-minute DEX collection timer...');
    setDexCollectionActive(true);

    // Calculate time until next 20-minute mark (:00, :20, :40)
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    // Find next 20-minute interval (0, 20, 40)
    const nextInterval = Math.ceil(minutes / 20) * 20;
    const minutesToNext = nextInterval === 60 ? 60 - minutes : nextInterval - minutes;
    const secondsToNext = minutesToNext * 60 - seconds;
    const millisecondsToNext = secondsToNext * 1000 - milliseconds;

    const displayMinute = nextInterval === 60 ? 0 : nextInterval;
    console.log(`Next DEX collection in ${Math.floor(millisecondsToNext / 1000)} seconds (at :${displayMinute.toString().padStart(2, '0')})`);

    // Set timeout to align with next 20-minute mark
    let interval;
    const alignmentTimeout = setTimeout(() => {
      console.log('🕐 Running DEX collection at 20-minute mark...');
      runDexCollection();
      setLastDexCollection(new Date());

      // Now set up regular 20-minute interval
      interval = setInterval(() => {
        console.log('🕐 Running scheduled DEX collection...');
        runDexCollection();
        setLastDexCollection(new Date());
      }, 20 * 60 * 1000); // Exactly 20 minutes
    }, millisecondsToNext);

    return () => {
      console.log('Stopping DEX collection timer');
      clearTimeout(alignmentTimeout);
      if (interval) clearInterval(interval);
      setDexCollectionActive(false);
    };
  }, [isMounted, savedDevices.length]);

  const runDexCollection = async () => {
    try {
      console.log('🕐 Running scheduled DEX collection...');
      const response = await axios.post('/api/dex/scheduler');

      if (response.data.success) {
        console.log('✅ DEX collection completed:', response.data.message);
        setLastDexCollection(new Date());
        // Reload devices to show updated DEX information
        await loadSavedDevices();
      } else {
        console.error('❌ DEX collection failed:', response.data.error);
      }
    } catch (error) {
      console.error('❌ Error during DEX collection:', error);
    }
  };

  const loadSavedDevices = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/devices');
      if (response.data.success) {
        const firstCashDevice = response.data.devices.find(d => d.cash_enabled);
        if (firstCashDevice) {
          console.log('🔍 First cash-enabled device:', firstCashDevice.case_serial);
          console.log('🔍 Has latest_dex_parsed:', !!firstCashDevice.latest_dex_parsed);
          console.log('🔍 Has hybridData.keyValueGroups.sales:', !!firstCashDevice?.latest_dex_parsed?.hybridData?.keyValueGroups?.sales);
          if (firstCashDevice?.latest_dex_parsed?.hybridData?.keyValueGroups?.sales) {
            const sales = firstCashDevice.latest_dex_parsed.hybridData.keyValueGroups.sales;
            const ca17Keys = Object.keys(sales).filter(k => k.startsWith('ca17'));
            console.log('🔍 CA17 keys:', ca17Keys);
            // Show sample values
            console.log('🔍 Sample CA17 values:', {
              'ca17_tube_00_denomination': sales['ca17_tube_00_denomination'],
              'ca17_tube_00_count': sales['ca17_tube_00_count'],
              'ca17_tube_01_denomination': sales['ca17_tube_01_denomination'],
              'ca17_tube_01_count': sales['ca17_tube_01_count']
            });
          }
        }
        setSavedDevices(response.data.devices);
        setLastUpdate(new Date(response.data.lastUpdated));
        console.log(`Loaded ${response.data.devices.length} saved devices`);
      }
    } catch (error) {
      console.error('Error loading saved devices:', error);
      // If no saved devices, show empty state
      setSavedDevices([]);
    } finally {
      setLoading(false);
    }
  };

  const captureDevicesData = async () => {
    setCapturing(true);
    setError(null);

    try {
      console.log('Capturing devices from Cantaloupe and saving to Supabase...');
      const response = await axios.post('/api/devices/capture');

      if (response.data.success) {
        console.log(`Captured ${response.data.devicesCount} devices successfully`);
        setError(null);
        // Reload the saved devices to show the new data
        await loadSavedDevices();
      } else {
        throw new Error(response.data.error || 'Failed to capture devices data');
      }
    } catch (error) {
      console.error('Error capturing devices data:', error);
      setError(error.response?.data?.error || error.message || 'Failed to capture devices data');
    } finally {
      setCapturing(false);
    }
  };

  const refreshDevicesData = async () => {
    await loadSavedDevices();
  };

  const runBulkDexCollection = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔧 Starting bulk DEX collection...');

      const response = await axios.post('/api/dex/collect-bulk', {});

      if (response.data.success) {
        console.log('✅ Bulk DEX collection completed:', response.data);
        // Refresh devices to show updated DEX info
        await loadSavedDevices();
      } else {
        throw new Error(response.data.error || 'Bulk DEX collection failed');
      }
    } catch (error) {
      console.error('❌ Bulk DEX collection error:', error);
      console.error('❌ Error response data:', error.response?.data);
      const errorDetails = error.response?.data?.stack || error.response?.data?.details || error.response?.data?.error || error.message;
      setError('Failed to run bulk DEX collection: ' + errorDetails);
    } finally {
      setLoading(false);
    }
  };

  const fetchDexDetails = async (caseSerial) => {
    try {
      const response = await axios.get(`/api/dex/summary?case_serial=${encodeURIComponent(caseSerial)}`);
      if (response.data.success && response.data.hasData) {
        setDexDetails(prev => ({ ...prev, [caseSerial]: response.data }));
      } else {
        setDexDetails(prev => ({ ...prev, [caseSerial]: null }));
      }
    } catch (error) {
      console.error('Error fetching DEX details:', error);
      setDexDetails(prev => ({ ...prev, [caseSerial]: null }));
    }
  };

  const toggleDexExpanded = async (device) => {
    const caseSerial = device.case_serial;

    if (expandedDex === caseSerial) {
      setExpandedDex(null);
    } else {
      setExpandedDex(caseSerial);
      // Fetch details if not already loaded
      if (!dexDetails[caseSerial]) {
        await fetchDexDetails(caseSerial);
      }
    }
  };

  const startEditing = (device) => {
    setEditingDevice(device.id);
    setEditForm({
      location: device.location?.optional || device.location || '',
      machine_type: device.machine_type || 'unknown',
      cash_enabled: device.cash_enabled || false
    });
  };

  const cancelEditing = () => {
    setEditingDevice(null);
    setEditForm({
      location: '',
      machine_type: '',
      cash_enabled: false
    });
  };

  const collectDexForDevice = async (device) => {
    try {
      setLoading(true);
      console.log(`Collecting DEX data for device ${device.case_serial}...`);

      const response = await axios.post('/api/dex/collect', {
        machineId: device.case_serial
      });

      if (response.data.success) {
        console.log(`✅ Successfully collected ${response.data.recordsCount} DEX records for ${device.case_serial}`);
        // Reload devices to show updated DEX information
        await loadSavedDevices();
      } else {
        throw new Error(response.data.error || 'Failed to collect DEX data');
      }
    } catch (error) {
      console.error('Error collecting DEX data:', error);
      setError(`Failed to collect DEX data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveDeviceEdit = async (deviceId) => {
    try {
      setLoading(true);
      const response = await axios.put(`/api/devices/${deviceId}`, editForm);

      if (response.data.success) {
        console.log('Device updated successfully');
        setEditingDevice(null);
        setEditForm({
          location: '',
          machine_type: '',
          cash_enabled: false
        });
        // Reload devices to show updated data
        await loadSavedDevices();
      } else {
        throw new Error(response.data.error || 'Failed to update device');
      }
    } catch (error) {
      console.error('Error updating device:', error);
      setError(error.response?.data?.error || error.message || 'Failed to update device');
    } finally {
      setLoading(false);
    }
  };

  const deleteDevice = async (deviceId) => {
    if (!confirm('Are you sure you want to delete this device? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await axios.delete(`/api/devices/${deviceId}`);

      if (response.data.success) {
        console.log('Device deleted successfully');
        setEditingDevice(null);
        setEditForm({
          location: '',
          machine_type: '',
          cash_enabled: false
        });
        // Reload devices to show updated data
        await loadSavedDevices();
      } else {
        throw new Error(response.data.error || 'Failed to delete device');
      }
    } catch (error) {
      console.error('Error deleting device:', error);
      setError(error.response?.data?.error || error.message || 'Failed to delete device');
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort devices
  const getFilteredAndSortedDevices = () => {
    let filtered = [...savedDevices];

    // Apply filters
    if (filters.type !== 'all') {
      filtered = filtered.filter(d => d.machine_type === filters.type);
    }

    if (filters.cash !== 'all') {
      filtered = filtered.filter(d =>
        filters.cash === 'enabled' ? d.cash_enabled : !d.cash_enabled
      );
    }

    if (filters.errors === 'has_unactioned') {
      filtered = filtered.filter(d =>
        d.latest_errors?.some(e => !e.actioned && !e.code.startsWith('UA'))
      );
    } else if (filters.errors === 'no_errors') {
      filtered = filtered.filter(d => !d.latest_errors || d.latest_errors.length === 0);
    }

    if (filters.dex4hrs === 'yes') {
      filtered = filtered.filter(d => d.dex_last_4hrs > 0);
    } else if (filters.dex4hrs === 'no') {
      filtered = filtered.filter(d => !d.dex_last_4hrs || d.dex_last_4hrs === 0);
    }

    if (filters.search.trim()) {
      const searchLower = filters.search.toLowerCase().trim();
      filtered = filtered.filter(d =>
        d.case_serial?.toLowerCase().includes(searchLower) ||
        (typeof d.location === 'string' && d.location.toLowerCase().includes(searchLower)) ||
        d.location?.optional?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.hideNoDex) {
      filtered = filtered.filter(d =>
        d.latest_dex_data || d.dex_last_capture || (d.dex_history && d.dex_history.length > 0)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'case') {
        comparison = (a.case_serial || '').localeCompare(b.case_serial || '');
      } else if (sortBy === 'last_seen') {
        const aTime = new Date(a.latest_dex_data || 0).getTime();
        const bTime = new Date(b.latest_dex_data || 0).getTime();
        comparison = aTime - bTime;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const formatSavedDevicesData = (devices) => {
    if (!devices || devices.length === 0) return null;

    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="text-sm text-blue-800">
            Showing {devices.length} saved devices from your database
          </div>
        </div>

        {/* Table Header - Hidden on mobile */}
        <div className="hidden sm:block bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="grid gap-4 text-sm font-semibold text-gray-700" style={{gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 40px'}}>
            <button
              onClick={() => {
                if (sortBy === 'case') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortBy('case');
                  setSortOrder('asc');
                }
              }}
              className="text-left flex items-center gap-1 hover:text-gray-900"
            >
              Case Serial {sortBy === 'case' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <div>Location</div>
            <div>Status</div>
            <button
              onClick={() => {
                if (sortBy === 'last_seen') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortBy('last_seen');
                  setSortOrder('desc');
                }
              }}
              className="text-left flex items-center gap-1 hover:text-gray-900"
            >
              Last Seen<sup className="ml-0.5 text-blue-500">ⓘ</sup> {sortBy === 'last_seen' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <div>Temperature</div>
            <div>Cash Amt</div>
            <div className="text-center text-xs">Actions</div>
          </div>
        </div>

        {/* Device Rows */}
        {devices.map((device, index) => {
          return (
            <div key={device.id || index} className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
              {/* Mobile Layout */}
              <div className="sm:hidden space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-sm font-bold text-gray-900">
                      {device.case_serial}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {editingDevice === device.id ? (
                        <select
                          value={editForm.machine_type}
                          onChange={(e) => setEditForm({...editForm, machine_type: e.target.value})}
                          className="text-xs border border-gray-300 rounded px-1 py-0.5"
                        >
                          <option value="unknown">❓ UNKNOWN</option>
                          <option value="beverage">🥤 BEVERAGE</option>
                          <option value="food">🍿 FOOD</option>
                        </select>
                      ) : (
                        <span>
                          {device.machine_type === 'beverage' ? '🥤' : device.machine_type === 'food' ? '🍿' : '❓'} {device.machine_type?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                      device.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                    }`}></span>
                    {device.status}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="font-medium text-gray-700">Location:</span>
                    {editingDevice === device.id ? (
                      <input
                        type="text"
                        value={editForm.location}
                        onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs mt-1"
                        placeholder="Enter location"
                      />
                    ) : (
                      <div className="text-gray-900 break-words">
                        {device.location?.optional || device.location || 'Unknown Location'}
                      </div>
                    )}
                  </div>
                  <div className="group relative cursor-help">
                    <span className="font-medium text-gray-700">
                      Last Seen:
                      <sup className="ml-0.5 text-blue-500">ⓘ</sup>
                    </span>
                    <div className="text-gray-900">
                      {formatAESTDate(device.latest_dex_data)}
                    </div>
                    {/* Tooltip showing dexId */}
                    {getDexIdFromHistory(device) && (
                      <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none">
                        DEX ID: {getDexIdFromHistory(device)}
                        <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cash/Coin Tubes - Full Width on Mobile */}
                {device.cash_enabled && (
                  <div className="text-xs">
                    <span className="font-medium text-gray-700">💰 Cash:</span>
                    <div className="mt-1">
                      {device.latest_dex_parsed?.hybridData?.keyValueGroups?.sales ? (
                        (() => {
                          const sales = device.latest_dex_parsed.hybridData.keyValueGroups.sales;
                          const tubes = Object.keys(sales)
                            .filter(key => key.match(/^ca17_tube_\d+_denomination$/))
                            .sort((a, b) => {
                              const tubeA = parseInt(a.match(/tube_(\d+)_denomination/)[1]);
                              const tubeB = parseInt(b.match(/tube_(\d+)_denomination/)[1]);
                              return tubeA - tubeB;
                            })
                            .map(denomKey => {
                              const tubeNum = denomKey.match(/tube_(\d+)_denomination/)[1];
                              const countKey = `ca17_tube_${tubeNum}_count`;
                              const denomination = parseFloat(sales[denomKey]);
                              const count = parseInt(sales[countKey]);

                              if (count > 0) {
                                return { tubeNum, denomination, count, value: denomination * count };
                              }
                              return null;
                            })
                            .filter(Boolean);

                          const total = tubes.reduce((sum, tube) => sum + tube.value, 0);
                          const hasCoins = tubes.length > 0;

                          return (
                            <div className="flex flex-wrap gap-1">
                              {hasCoins ? (
                                <>
                                  {tubes.map(tube => (
                                    <div key={tube.tubeNum} className="text-xs bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">
                                      ${tube.denomination.toFixed(2)} × {tube.count}
                                    </div>
                                  ))}
                                  <div className="text-xs font-semibold text-gray-900 w-full mt-0.5">
                                    Total: ${total.toFixed(2)}
                                  </div>
                                </>
                              ) : (
                                <div className="text-xs text-gray-500">No coins</div>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="text-xs text-gray-500">💵 Enabled</div>
                      )}
                    </div>
                  </div>
                )}

                {/* DEX Information */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="font-medium text-gray-700">📊 DEX Records:</span>
                      <div className="text-gray-900">
                        {device.dex_history?.length || 0} total
                        {device.latest_errors?.some(e => !e.actioned && !e.code.startsWith('UA')) && <span className="text-red-500 ml-1">⚠️</span>}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">🕒 Last DEX:</span>
                      <div className="text-gray-900">
                        {device.latest_dex_data
                          ? formatAESTDate(device.latest_dex_data, false)
                          : 'Never'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Expand DEX Details Button - Hidden on Mobile */}
                  {device.latest_dex_parsed && (
                    <button
                      onClick={() => toggleDexExpanded(device)}
                      className="hidden sm:flex mt-2 text-xs text-blue-600 hover:text-blue-800 items-center"
                    >
                      {expandedDex === device.case_serial ? '🔽' : '▶️'} View DEX Details
                    </button>
                  )}

                  {/* Expanded DEX Details */}
                  {expandedDex === device.case_serial && (
                    <div className="mt-3 p-3 bg-gray-50 rounded text-xs">
                      {dexDetails[device.case_serial] ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="font-medium text-gray-700">💰 Total Sales:</span>
                              <div className="text-green-600 font-mono">
                                ${dexDetails[device.case_serial].summary?.totalSales?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">🧾 Total Vends:</span>
                              <div className="text-gray-900">
                                {dexDetails[device.case_serial].summary?.totalVends || 0}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="font-medium text-gray-700">💵 Cash Sales:</span>
                              <div className="text-green-600 font-mono">
                                ${dexDetails[device.case_serial].summary?.cashSales?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">💳 Card Sales:</span>
                              <div className="text-blue-600 font-mono">
                                ${dexDetails[device.case_serial].summary?.cardSales?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="font-medium text-gray-700">📦 Products:</span>
                              <div className="text-gray-900">
                                {dexDetails[device.case_serial].summary?.productCount || 0} selections
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">🌡️ Temperature:</span>
                              <div className="text-gray-900">
                                {convertTemperature(dexDetails[device.case_serial].summary?.temperature)
                                  ? `${convertTemperature(dexDetails[device.case_serial].summary.temperature)}°C`
                                  : 'N/A'}
                              </div>
                            </div>
                          </div>

                          {/* Coin Tubes for Cash-Enabled Machines */}
                          {device.cash_enabled && dexDetails[device.case_serial].keyValueGroups?.sales && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <span className="font-medium text-gray-700">🪙 Coin Tubes:</span>
                              <div className="grid grid-cols-3 gap-1 mt-1">
                                {Object.keys(dexDetails[device.case_serial].keyValueGroups.sales)
                                  .filter(key => key.match(/^ca17_tube_\d+_denomination$/))
                                  .sort((a, b) => {
                                    const tubeA = parseInt(a.match(/tube_(\d+)_denomination/)[1]);
                                    const tubeB = parseInt(b.match(/tube_(\d+)_denomination/)[1]);
                                    return tubeA - tubeB;
                                  })
                                  .map(denomKey => {
                                    const tubeNum = denomKey.match(/tube_(\d+)_denomination/)[1];
                                    const countKey = `ca17_tube_${tubeNum}_count`;
                                    const denomination = dexDetails[device.case_serial].keyValueGroups.sales[denomKey];
                                    const count = dexDetails[device.case_serial].keyValueGroups.sales[countKey];

                                    if (count && parseInt(count) > 0) {
                                      return (
                                        <div key={tubeNum} className="bg-white px-2 py-1 rounded border border-gray-200">
                                          <span className="font-mono text-gray-900">${denomination}</span>
                                          <span className="text-gray-500 ml-1">×{count}</span>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })
                                  .filter(Boolean)}
                              </div>
                            </div>
                          )}

                          <div className="text-xs text-gray-500 mt-2">
                            Last Updated: {formatAESTDate(dexDetails[device.case_serial].lastUpdate)}
                          </div>
                        </div>
                      ) : dexDetails[device.case_serial] === null ? (
                        <div className="text-gray-500">No DEX data available</div>
                      ) : (
                        <div className="text-gray-500">Loading DEX details...</div>
                      )}
                    </div>
                  )}
                </div>

                {editingDevice === device.id && (
                  <div className="text-xs">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editForm.cash_enabled}
                        onChange={(e) => setEditForm({...editForm, cash_enabled: e.target.checked})}
                        className="mr-2"
                      />
                      💵 Cash Enabled
                    </label>
                  </div>
                )}

                {/* Mobile Edit Actions - Hidden on Mobile */}
                <div className="hidden sm:flex justify-end space-x-2">
                  {editingDevice === device.id ? (
                    <>
                      <button
                        onClick={() => saveDeviceEdit(device.id)}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => collectDexForDevice(device)}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
                        title="Collect DEX data for this device"
                      >
                        📊 DEX
                      </button>
                      <button
                        onClick={() => startEditing(device)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:grid gap-4 items-center text-sm" style={{gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 40px'}}>
                {/* Case Serial */}
                <div>
                  <div className="font-mono text-gray-900 font-medium">
                    {device.case_serial}
                  </div>
                  <div className="text-xs text-gray-500">
                    {editingDevice === device.id ? (
                      <select
                        value={editForm.machine_type}
                        onChange={(e) => setEditForm({...editForm, machine_type: e.target.value})}
                        className="text-xs border border-gray-300 rounded px-1 py-0.5"
                      >
                        <option value="unknown">❓ UNKNOWN</option>
                        <option value="beverage">🥤 BEVERAGE</option>
                        <option value="food">🍿 FOOD</option>
                      </select>
                    ) : (
                      <span>
                        {device.machine_type === 'beverage' ? '🥤' : device.machine_type === 'food' ? '🍿' : '❓'} {device.machine_type?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Location */}
                <div>
                  {editingDevice === device.id ? (
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      placeholder="Enter location"
                    />
                  ) : (
                    <div className="text-gray-900">
                      {device.location?.optional || device.location || 'Unknown Location'}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    {device.machine_model || 'Unknown Model'}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <div className="flex items-center">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                      device.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                    }`}></span>
                    <span className="capitalize">{device.status}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    ID: {device.device_id}
                  </div>
                </div>

                {/* Last Seen */}
                <div className="group relative cursor-help">
                  <div className="text-gray-900">
                    {formatAESTDate(device.latest_dex_data, false)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {device.latest_dex_data ? formatAESTDate(device.latest_dex_data).split(', ')[1] : ''}
                  </div>
                  {/* Tooltip showing dexId */}
                  {getDexIdFromHistory(device) && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none">
                      DEX ID: {getDexIdFromHistory(device)}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  )}
                </div>

                {/* Temperature */}
                <div>
                  <div className="text-gray-900">
                    {convertTemperature(device.temperature) ? `${convertTemperature(device.temperature)}°C` : 'N/A'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {device.firmware_version || 'Unknown'}
                  </div>
                </div>

                {/* Cash Amt */}
                <div>
                  {device.cash_enabled && device.latest_dex_parsed?.hybridData?.keyValueGroups?.sales ? (
                    (() => {
                      const sales = device.latest_dex_parsed.hybridData.keyValueGroups.sales;
                      const tubes = Object.keys(sales)
                        .filter(key => key.match(/^ca17_tube_\d+_denomination$/))
                        .sort((a, b) => {
                          const tubeA = parseInt(a.match(/tube_(\d+)_denomination/)[1]);
                          const tubeB = parseInt(b.match(/tube_(\d+)_denomination/)[1]);
                          return tubeA - tubeB;
                        })
                        .map(denomKey => {
                          const tubeNum = denomKey.match(/tube_(\d+)_denomination/)[1];
                          const countKey = `ca17_tube_${tubeNum}_count`;
                          const denomination = parseFloat(sales[denomKey]);
                          const count = parseInt(sales[countKey]);

                          if (count > 0) {
                            return { tubeNum, denomination, count, value: denomination * count };
                          }
                          return null;
                        })
                        .filter(Boolean);

                      const total = tubes.reduce((sum, tube) => sum + tube.value, 0);
                      const hasCoins = tubes.length > 0;

                      return (
                        <>
                          <div className="flex flex-col gap-0.5">
                            {hasCoins ? (
                              <>
                                {tubes.map(tube => (
                                  <div key={tube.tubeNum} className="text-xs bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">
                                    ${tube.denomination.toFixed(2)} × {tube.count}
                                  </div>
                                ))}
                                <div className="text-xs font-semibold text-gray-900 mt-1 pt-1 border-t border-gray-300">
                                  Total: ${total.toFixed(2)}
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-gray-500">No coins</div>
                            )}
                          </div>
                          {!hasCoins && (
                            <div className="text-xs text-gray-500 mt-1">
                              {editingDevice === device.id ? (
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editForm.cash_enabled}
                                    onChange={(e) => setEditForm({...editForm, cash_enabled: e.target.checked})}
                                    className="mr-1"
                                  />
                                  💵 Enabled
                                </label>
                              ) : (
                                '💵 Enabled'
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <div className="text-gray-400 text-sm">—</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {editingDevice === device.id ? (
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editForm.cash_enabled}
                              onChange={(e) => setEditForm({...editForm, cash_enabled: e.target.checked})}
                              className="mr-1"
                            />
                            💵 Enabled
                          </label>
                        ) : (
                          device.cash_enabled ? '💵 Enabled' : '💵 Disabled'
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-center">
                  {editingDevice === device.id ? (
                    <div className="flex flex-col space-y-1">
                      <button
                        onClick={() => saveDeviceEdit(device.id)}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
                        title="Save changes"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                        title="Cancel editing"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteDevice(device.id)}
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
                        title="Delete device"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditing(device)}
                      className="text-gray-600 hover:text-blue-600 hover:bg-gray-100 p-1 rounded"
                      title="Edit device"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="12" cy="19" r="1.5"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* DEX Status Row - Second row for desktop, additional info for mobile */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div className="group relative cursor-help">
                    <span className="font-medium text-gray-600">
                      Last DEX Seen:
                      <sup className="ml-0.5 text-blue-500">ⓘ</sup>
                    </span>
                    <div className="text-gray-900">
                      {formatAESTDate(device.latest_dex_data)}
                    </div>
                    {/* Tooltip showing dexId */}
                    {getDexIdFromHistory(device) && (
                      <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none">
                        DEX ID: {getDexIdFromHistory(device)}
                        <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    )}
                  </div>
                  <div className="group relative cursor-help">
                    <span className="font-medium text-gray-600">
                      DEX in last 4hrs:
                      <sup className="ml-0.5 text-blue-500">ⓘ</sup>
                    </span>
                    <div>
                      {device.dex_last_4hrs > 0 ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-500 text-white rounded text-sm font-bold">
                          No
                        </span>
                      )}
                    </div>
                    {/* Tooltip showing last 4 DEX timestamps */}
                    {device.dex_history && device.dex_history.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none min-w-max">
                        <div className="font-semibold mb-1">Last 4 DEX Captures:</div>
                        {device.dex_history.slice(0, 4).map((entry, idx) => (
                          <div key={idx}>{formatAESTDate(entry.created)}</div>
                        ))}
                        <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    )}
                  </div>
                  {/* Errors column - Desktop only */}
                  <div className="hidden sm:block">
                    <span className="font-medium text-gray-600">Errors:</span>
                    <div className="text-gray-900">
                      {device.latest_errors && device.latest_errors.length > 0 ? (
                        (() => {
                          // UA errors are not important - exclude from unactioned check
                          const hasUnactioned = device.latest_errors.some(e => !e.actioned && !e.code.startsWith('UA'))
                          return (
                            <>
                              <button
                                onClick={() => setExpandedErrors(expandedErrors === device.id ? null : device.id)}
                                className={`w-full text-xs flex items-center gap-1 px-3 py-2 rounded-md transition-colors ${
                                  expandedErrors === device.id
                                    ? 'bg-gray-100 text-gray-700'
                                    : hasUnactioned
                                      ? 'bg-red-100 text-red-700 hover:bg-red-200 font-semibold border border-red-300'
                                      : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                                }`}
                              >
                                {expandedErrors === device.id ? '🔽' : '▶️'} {device.latest_errors.length} Error{device.latest_errors.length > 1 ? 's' : ''}
                              </button>
                              {expandedErrors === device.id && (
                                <div className="mt-2 py-2 bg-gray-50 rounded border border-gray-300 max-h-48 overflow-y-auto">
                                  {device.latest_errors
                                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                                    .map((error, idx) => {
                                      const isUA = error.code.startsWith('UA')
                                      return (
                                        <div key={idx} className={`py-2 mb-1 rounded border ${isUA ? 'bg-green-50 border-green-300' : (error.actioned ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300')}`}>
                                          <div className="flex items-start justify-between gap-3 px-2">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${error.type === 'MA5' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                  {error.type}
                                                </span>
                                                <div className={`font-mono font-bold ${isUA ? 'text-green-700' : (error.actioned ? 'text-green-700' : 'text-red-700')}`}>{error.code}</div>
                                              </div>
                                              {error.type === 'MA5' && (
                                                <div className="text-xs text-gray-700 mt-1">
                                                  {getMA5ErrorDescription(error.code)}
                                                </div>
                                              )}
                                              {error.type === 'EA1' && (
                                                <div className="text-xs text-gray-700 mt-1">
                                                  {getEA1ErrorDescription(error.code)}
                                                </div>
                                              )}
                                              <div className="text-xs text-gray-600 mt-1">
                                                {formatAESTDate(error.timestamp)}
                                              </div>
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                                              <span className="text-xs text-gray-600">
                                                {error.actioned ? '✓ Actioned' : 'Action'}
                                              </span>
                                              <input
                                                type="checkbox"
                                                checked={error.actioned || false}
                                                onChange={async (e) => {
                                                  const newActioned = e.target.checked
                                                  try {
                                                    const response = await fetch('/api/machines/action-error', {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({
                                                        machineId: device.id,
                                                        errorCode: error.code,
                                                        errorTimestamp: error.timestamp,
                                                        actioned: newActioned
                                                      })
                                                    })
                                                    if (response.ok) {
                                                      await loadSavedDevices()
                                                    }
                                                  } catch (err) {
                                                    console.error('Error updating error status:', err)
                                                  }
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                                              />
                                            </label>
                                          </div>
                                      </div>
                                    )
                                    })}
                                </div>
                              )}
                            </>
                          )
                        })()
                      ) : (
                        <span className="text-gray-500">None</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Errors section - Full width on mobile only */}
                <div className="sm:hidden mt-3">
                  <span className="font-medium text-gray-600 text-xs">Errors:</span>
                  <div className="text-gray-900 mt-1">
                    {device.latest_errors && device.latest_errors.length > 0 ? (
                      (() => {
                        // UA errors are not important - exclude from unactioned check
                        const hasUnactioned = device.latest_errors.some(e => !e.actioned && !e.code.startsWith('UA'))
                        return (
                          <>
                            <button
                              onClick={() => setExpandedErrors(expandedErrors === device.id ? null : device.id)}
                              className={`w-full text-xs flex items-center gap-1 px-3 py-2 rounded-md transition-colors ${
                                expandedErrors === device.id
                                  ? 'bg-gray-100 text-gray-700'
                                  : hasUnactioned
                                    ? 'bg-red-100 text-red-700 hover:bg-red-200 font-semibold border border-red-300'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                              }`}
                            >
                              {expandedErrors === device.id ? '🔽' : '▶️'} {device.latest_errors.length} Error{device.latest_errors.length > 1 ? 's' : ''}
                            </button>
                            {expandedErrors === device.id && (
                              <div className="mt-2 py-2 bg-gray-50 rounded border border-gray-300 max-h-48 overflow-y-auto">
                                {device.latest_errors
                                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                                  .map((error, idx) => {
                                    const isUA = error.code.startsWith('UA')
                                    return (
                                      <div key={`mobile-error-${idx}`} className={`py-2 mb-1 rounded border ${isUA ? 'bg-green-50 border-green-300' : (error.actioned ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300')}`}>
                                        <div className="flex items-start justify-between gap-3 px-2">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${error.type === 'MA5' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {error.type}
                                              </span>
                                              <div className={`font-mono font-bold ${isUA ? 'text-green-700' : (error.actioned ? 'text-green-700' : 'text-red-700')}`}>{error.code}</div>
                                            </div>
                                            {error.type === 'MA5' && (
                                              <div className="text-xs text-gray-700 mt-1">
                                                {getMA5ErrorDescription(error.code)}
                                              </div>
                                            )}
                                            {error.type === 'EA1' && (
                                              <div className="text-xs text-gray-700 mt-1">
                                                {getEA1ErrorDescription(error.code)}
                                              </div>
                                            )}
                                            <div className="text-xs text-gray-600 mt-1">
                                              {formatAESTDate(error.timestamp)}
                                            </div>
                                          </div>
                                          <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                                            <span className="text-xs text-gray-600">
                                              {error.actioned ? '✓ Actioned' : 'Action'}
                                            </span>
                                            <input
                                              type="checkbox"
                                              checked={error.actioned || false}
                                              onChange={async (e) => {
                                                const newActioned = e.target.checked
                                                try {
                                                  const response = await fetch('/api/machines/action-error', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                      machineId: device.id,
                                                      errorCode: error.code,
                                                      errorTimestamp: error.timestamp,
                                                      actioned: newActioned
                                                    })
                                                  })
                                                  if (response.ok) {
                                                    await loadSavedDevices()
                                                  }
                                                } catch (err) {
                                                  console.error('Error updating error status:', err)
                                                }
                                              }}
                                              className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>
                            )}
                          </>
                        )
                      })()
                    ) : (
                      <span className="text-xs text-gray-500">None</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    );
  };

  // formatDevicesData function removed - we now use formatSavedDevicesData for Supabase data

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
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col space-y-4">
            {/* Title and Menu Button Row */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2">Devices Management</h1>
                <p className="text-gray-600 text-sm sm:text-base">Monitor and manage all your vending machines</p>
              </div>

              {/* Hamburger Menu Button */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="bg-gray-700 hover:bg-gray-800 text-white p-2 rounded-md transition-colors"
                aria-label="Menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Clock and Timer Row */}
            <div className="flex gap-3">
              {/* Digital Clock - Takes 2/3 on mobile */}
              <div className="flex-grow sm:flex-grow-0 bg-slate-900 text-green-400 px-3 sm:px-4 py-2 rounded-lg font-mono text-sm shadow-lg">
                <div className="text-xs text-green-300 mb-1">AEST Time</div>
                <div className="text-sm sm:text-lg font-bold">
                  {isMounted ? formatAESTTime(currentTime) : '--:--:--'}
                </div>
              </div>

              {/* DEX Collection Status - Takes 1/3 on mobile */}
              {dexCollectionActive && (
                <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div className="flex items-center text-green-700 text-xs mb-1">
                    <div className="animate-pulse w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="font-medium">20min Timer</span>
                  </div>
                  <div className="text-sm sm:text-lg font-bold text-green-700">
                    {(() => {
                      // Get current time in AEST
                      const aestTime = new Date(currentTime.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
                      const minutes = aestTime.getMinutes();
                      // Calculate next 20-minute interval (0, 20, 40)
                      const nextInterval = Math.ceil(minutes / 20) * 20;
                      const nextTime = new Date(aestTime);

                      if (nextInterval >= 60) {
                        // Cross into next hour
                        nextTime.setHours(nextTime.getHours() + 1);
                        nextTime.setMinutes(0, 0, 0);
                      } else {
                        nextTime.setMinutes(nextInterval, 0, 0);
                      }

                      return nextTime.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* User Info - Mobile Only */}
            <div className="sm:hidden text-xs text-gray-600">
              Welcome, {user?.email}
            </div>
          </div>
        </div>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div className="mb-6 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
            <div className="flex flex-col space-y-3">
              {/* User Info - Desktop Only */}
              <div className="hidden sm:block text-sm text-gray-600 pb-3 border-b border-gray-200">
                Welcome, {user?.email}
              </div>

              {/* Navigation */}
              {hasCredentials ? (
                <a
                  href="/dashboard"
                  className="bg-white text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 transition-colors text-sm text-center"
                >
                  ← Back to Dashboard
                </a>
              ) : (
                <a
                  href="/settings"
                  className="bg-white text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 transition-colors text-sm text-center"
                >
                  ← Back to Settings
                </a>
              )}

              {/* Action Buttons */}
              <button
                onClick={() => {
                  captureDevicesData();
                  setMenuOpen(false);
                }}
                disabled={capturing || !hasCredentials}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {capturing ? 'Capturing...' : 'Capture Devices Data'}
              </button>
              <button
                onClick={() => {
                  refreshDevicesData();
                  setMenuOpen(false);
                }}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={() => {
                  runBulkDexCollection();
                  setMenuOpen(false);
                }}
                disabled={loading || !hasCredentials}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {loading ? 'Processing...' : '📊 Bulk DEX Collection'}
              </button>
              <button
                onClick={() => {
                  signOut();
                  setMenuOpen(false);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Error Alert Card */}
        {savedDevices.length > 0 && (() => {
          const machinesWithErrors = savedDevices.filter(d =>
            d.latest_errors?.some(e => !e.actioned && !e.code.startsWith('UA'))
          );

          if (machinesWithErrors.length === 0) return null;

          return (
            <div className="mb-6 bg-red-600 rounded-lg shadow-lg border-2 border-red-700 overflow-hidden">
              {/* Header Section with Icon */}
              <div className="p-4 sm:p-6 pb-2">
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center">
                      <span className="text-2xl sm:text-3xl">🚨</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white mb-2">
                          {machinesWithErrors.length} Machine{machinesWithErrors.length > 1 ? 's' : ''} Require{machinesWithErrors.length === 1 ? 's' : ''} Attention
                        </h3>
                        <p className="text-red-100">
                          The following machines have unactioned errors that need to be reviewed
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm('Mark all unactioned errors as actioned?')) return;

                          try {
                            // Get all unactioned errors from all machines
                            const errorUpdates = [];
                            machinesWithErrors.forEach(device => {
                              device.latest_errors
                                ?.filter(e => !e.actioned && !e.code.startsWith('UA'))
                                .forEach(error => {
                                  errorUpdates.push({
                                    machineId: device.id,
                                    errorCode: error.code,
                                    errorTimestamp: error.timestamp
                                  });
                                });
                            });

                            // Mark all errors as actioned
                            for (const update of errorUpdates) {
                              await fetch('/api/machines/action-error', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  ...update,
                                  actioned: true
                                })
                              });
                            }

                            // Reload devices to show updated state
                            await loadSavedDevices();
                          } catch (err) {
                            console.error('Error marking all as actioned:', err);
                            alert('Failed to mark all errors as actioned');
                          }
                        }}
                        className="bg-white text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        ✓ Mark All Actioned
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Error List Section */}
              <div className="px-2 pb-4 space-y-2">
                {machinesWithErrors.slice(0, 5).map(device => {
                  const errorCount = device.latest_errors.filter(e => !e.actioned && !e.code.startsWith('UA')).length;
                  return (
                    <div key={device.id} className="bg-red-700 bg-opacity-50 rounded-lg p-3">
                            {/* Mobile: 2x2 Grid Layout */}
                            <div className="grid grid-cols-2 gap-2">
                              {/* Row 1, Col 1: Case Serial */}
                              <div className="font-mono font-bold text-white text-sm sm:text-base">
                                {device.case_serial}
                              </div>
                              {/* Row 1, Col 2: Location */}
                              <div className="text-red-100 text-xs sm:text-sm text-right">
                                {typeof device.location === 'string' ? device.location : device.location?.optional || 'Unknown'}
                              </div>
                              {/* Row 2, Col 1: Error Count */}
                              <div>
                                <span className="bg-white text-red-700 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold inline-block">
                                  {errorCount} Error{errorCount > 1 ? 's' : ''}
                                </span>
                              </div>
                              {/* Row 2, Col 2: View Button */}
                              <div className="text-right">
                                <button
                                  onClick={() => {
                                    setFilters({...filters, errors: 'has_unactioned'});
                                    setTimeout(() => {
                                      document.querySelector('[data-devices-list]')?.scrollIntoView({ behavior: 'smooth' });
                                    }, 100);
                                  }}
                                  className="bg-white text-red-700 hover:bg-red-50 px-3 sm:px-4 py-1 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                                >
                                  View →
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                })}
                {machinesWithErrors.length > 5 && (
                  <div className="text-center pt-2">
                    <button
                      onClick={() => {
                        setFilters({...filters, errors: 'has_unactioned'});
                        setTimeout(() => {
                          document.querySelector('[data-devices-list]')?.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                      }}
                      className="text-white hover:text-red-100 font-medium text-sm underline"
                    >
                      + {machinesWithErrors.length - 5} more machines with errors
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Stats Cards */}
        {savedDevices.length > 0 && (() => {
          const withDex = savedDevices.filter(d =>
            d.latest_dex_data || d.dex_last_capture || (d.dex_history && d.dex_history.length > 0)
          ).length;
          const withoutDex = savedDevices.length - withDex;

          return (
            <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-6">
              <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
                <div className="flex items-baseline gap-2">
                  <div className="text-lg sm:text-xl font-bold text-blue-600">
                    {withDex}
                  </div>
                  {withoutDex > 0 && (
                    <div className="text-xs text-gray-400">
                      +{withoutDex} old
                    </div>
                  )}
                </div>
                <div className="text-xs sm:text-sm text-gray-600">Total Machines</div>
              </div>
            <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
              <div className="text-lg sm:text-xl font-bold text-purple-600">
                {savedDevices.filter(d => d.machine_type === 'beverage').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">🥤 Bev</div>
            </div>
            <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
              <div className="text-lg sm:text-xl font-bold text-orange-600">
                {savedDevices.filter(d => d.machine_type === 'food').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">🍿 Food</div>
            </div>
            <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
              <div className="text-lg sm:text-xl font-bold text-green-700">
                {savedDevices.filter(d => d.cash_enabled === true).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">💵 Cash</div>
            </div>
          </div>
          );
        })()}

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

        {/* Devices Data Display */}
        {savedDevices.length > 0 && (
          <div data-devices-list className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Your Devices</h2>
              <span className="text-sm text-gray-500">
                {(() => {
                  const filteredCount = getFilteredAndSortedDevices().length;
                  return filteredCount === savedDevices.length
                    ? `${savedDevices.length} devices`
                    : `${filteredCount} of ${savedDevices.length} devices`;
                })()} • Updated: {lastUpdate?.toLocaleString()}
              </span>
            </div>

            {/* Filters and Search */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                {/* Search */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
                  <input
                    type="text"
                    placeholder="Case Serial or Location..."
                    value={filters.search}
                    onChange={(e) => setFilters({...filters, search: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Type Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={filters.type}
                    onChange={(e) => setFilters({...filters, type: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="beverage">🥤 Beverage</option>
                    <option value="food">🍿 Food</option>
                  </select>
                </div>

                {/* Cash Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cash</label>
                  <select
                    value={filters.cash}
                    onChange={(e) => setFilters({...filters, cash: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>

                {/* DEX 4hrs Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">DEX 4hrs</label>
                  <select
                    value={filters.dex4hrs}
                    onChange={(e) => setFilters({...filters, dex4hrs: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="yes">✓ Yes</option>
                    <option value="no">✗ No</option>
                  </select>
                </div>

                {/* Errors Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">⚠️ Errors</label>
                  <select
                    value={filters.errors}
                    onChange={(e) => setFilters({...filters, errors: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="all">All Devices</option>
                    <option value="has_unactioned">🚨 Has Unactioned</option>
                    <option value="no_errors">No Errors</option>
                  </select>
                </div>
              </div>

              {/* Hide No DEX Checkbox */}
              <div className="mt-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hideNoDex}
                    onChange={(e) => setFilters({...filters, hideNoDex: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Hide machines with no DEX data</span>
                </label>
              </div>

              {/* Active Filters Display */}
              {(filters.type !== 'all' || filters.cash !== 'all' || filters.errors !== 'all' || filters.dex4hrs !== 'all' || filters.search || filters.hideNoDex) && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="text-gray-600">Active filters:</span>
                  {filters.search && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      Search: "{filters.search}"
                    </span>
                  )}
                  {filters.type !== 'all' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      Type: {filters.type}
                    </span>
                  )}
                  {filters.cash !== 'all' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      Cash: {filters.cash}
                    </span>
                  )}
                  {filters.dex4hrs !== 'all' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      DEX 4hrs: {filters.dex4hrs === 'yes' ? '✓ Yes' : '✗ No'}
                    </span>
                  )}
                  {filters.errors !== 'all' && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded font-semibold">
                      {filters.errors === 'has_unactioned' ? '🚨 Unactioned Errors' : 'No Errors'}
                    </span>
                  )}
                  {filters.hideNoDex && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                      Hiding No DEX
                    </span>
                  )}
                  <button
                    onClick={() => setFilters({type: 'all', cash: 'all', errors: 'all', dex4hrs: 'all', search: '', hideNoDex: true})}
                    className="ml-auto px-2 py-1 text-gray-600 hover:text-gray-900"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {formatSavedDevicesData(getFilteredAndSortedDevices())}
          </div>
        )}

        {/* Credentials Required State */}
        {!credentialsLoading && !hasCredentials && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 19c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">DEX Credentials Required</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  Please configure your DEX credentials in Settings before accessing device features.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Welcome State */}
        {hasCredentials && savedDevices.length === 0 && !loading && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="max-w-md mx-auto">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Devices Found</h3>
              <p className="text-gray-500 mb-4">
                You haven't captured any device data yet. Click "Capture Devices Data" to fetch and save your vending machines from the DEX platform.
              </p>
              <div className="text-sm text-gray-400 mb-6">
                <p>📡 <strong>How it works:</strong> The capture process will:</p>
                <ul className="list-disc list-inside text-left mt-2 space-y-1">
                  <li>Connect to your DEX platform using your saved credentials</li>
                  <li>Fetch all device information</li>
                  <li>Save devices to the database for faster access</li>
                  <li>Start automatic DEX data collection every 5 minutes</li>
                </ul>
              </div>
              <div className="space-y-3">
                <button
                  onClick={captureDevicesData}
                  disabled={capturing || !hasCredentials}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {capturing ? 'Capturing...' : 'Capture Devices Data'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Demo Devices Display (for UI demonstration) */}
        {false && (
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview: Expected Device Layout</h3>
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">Machine 22995469</h4>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">ID:</span> 22995469</div>
                      <div><span className="font-medium">Serial:</span> VM001234</div>
                      <div><span className="font-medium">Location:</span> Main Lobby</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Status</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center">
                        <span className="inline-block w-2 h-2 rounded-full mr-2 bg-green-400"></span>
                        Online
                      </div>
                      <div><span className="font-medium">Last Seen:</span> Just now</div>
                      <div><span className="font-medium">Signal:</span> Strong</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Details</h4>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">Firmware:</span> v2.1.4</div>
                      <div><span className="font-medium">Temperature:</span> 72°F</div>
                      <div><span className="font-medium">Uptime:</span> 24h 15m</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}