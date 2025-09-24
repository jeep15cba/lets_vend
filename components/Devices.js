import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

export default function Devices() {
  const { user, signOut } = useAuth();
  const [devicesData, setDevicesData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMounted, setIsMounted] = useState(false);
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('all');
  const [cashMachineFilter, setCashMachineFilter] = useState('all');
  const [expandedErrors, setExpandedErrors] = useState({});

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

  // Auto-load devices data when component mounts
  useEffect(() => {
    if (isMounted && !devicesData && !loading) {
      fetchDevicesData();
    }
  }, [isMounted]);

  const fetchDevicesData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Authenticating first...');
      const authResponse = await axios.post('/api/cantaloupe/auth');

      if (!authResponse.data.success) {
        throw new Error('Authentication failed');
      }

      console.log('Authentication successful, fetching devices data...');
      const response = await axios.post('/api/cantaloupe/devices-raw', {
        cookies: authResponse.data.cookies
      });

      if (response.data.success) {
        // Load machine mapping data as well
        const machineMapping = await loadMachineData();

        setDevicesData({
          ...response.data,
          machineMapping: machineMapping
        });
        setLastUpdate(new Date(response.data.timestamp));
        console.log('Devices data loaded successfully');
      } else {
        throw new Error('Failed to fetch devices data');
      }
    } catch (error) {
      console.error('Error fetching devices data:', error);
      setError(error.response?.data?.error || error.message || 'Failed to fetch devices data');
    } finally {
      setLoading(false);
    }
  };

  // Load machine type and cash enabled data from mapping files
  const loadMachineData = async () => {
    try {
      // Load the restructured mapping file and comprehensive DEX data
      const [dexMappingResponse, comprehensiveDexResponse] = await Promise.all([
        axios.get('/data/case-serial-dex-mapping-new.json'),
        axios.get('/data/comprehensive-dex-data.json').catch(() => ({ data: { results: {} } })) // Fallback if DEX data doesn't exist
      ]);

      const mappingData = dexMappingResponse.data;
      const comprehensiveDexData = comprehensiveDexResponse.data;

      // Handle both old and new data structures
      if (mappingData.machines) {
        // New structure with separate details and dex
        return {
          machines: mappingData.machines,
          dexData: comprehensiveDexData.results || {}
        };
      } else if (mappingData.mappings) {
        // Old structure - convert to new format for compatibility
        const convertedData = {};
        Object.keys(mappingData.mappings).forEach(caseSerial => {
          const records = mappingData.mappings[caseSerial];
          const latestRecord = records[0];

          convertedData[caseSerial] = {
            details: {
              machineType: latestRecord.machineType || 'unknown',
              machineModel: latestRecord.machineModel || 'Unknown Model',
              machineLocation: latestRecord.machineLocation || 'Unknown Location',
              cashEnabled: latestRecord.cashEnabled || false,
              status: 'active',
              lastUpdated: latestRecord.timestamp || new Date().toISOString()
            },
            dex: records.map(record => ({
              dexId: record.dexId,
              timestamp: record.timestamp,
              firmware: record.firmware,
              parsed: record.parsed,
              status: record.status || null,
              note: record.note || null
            })).filter(record => record.dexId !== null)
          };
        });
        return {
          machines: convertedData,
          dexData: comprehensiveDexData.results || {}
        };
      }

      return {
        machines: {},
        dexData: {}
      };
    } catch (error) {
      console.error('Failed to load machine data:', error);
      return {};
    }
  };

  const formatDevicesData = (data) => {
    if (!data) return null;

    // Handle Cantaloupe JSON response format
    if (data.data && data.type === 'json' && data.data.data) {
      const devices = data.data.data;
      const totalRecords = data.data.recordsTotal || 0;

      // Filter devices based on current filters
      const filteredDevices = devices.filter(deviceData => {
        const device = deviceData.devices;
        const caseSerial = device.caseSerial;

        // Get machine type and cash enabled from our mapping
        const mappingData = devicesData?.machineMapping?.machines?.[caseSerial];
        const machineType = mappingData?.details?.machineType || 'unknown';
        const cashEnabled = mappingData?.details?.cashEnabled || false;

        // Apply device type filter
        if (deviceTypeFilter !== 'all' && machineType !== deviceTypeFilter) {
          return false;
        }

        // Apply cash machine filter
        if (cashMachineFilter === 'cash' && !cashEnabled) {
          return false;
        }
        if (cashMachineFilter === 'non-cash' && cashEnabled) {
          return false;
        }

        return true;
      });

      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="text-sm text-blue-800">
              Showing {filteredDevices.length} of {devices.length} devices (Total: {totalRecords} in system)
              {(deviceTypeFilter !== 'all' || cashMachineFilter !== 'all') && (
                <span className="ml-2 text-blue-600 font-medium">
                  - Filtered by: {deviceTypeFilter !== 'all' ? `${deviceTypeFilter} machines` : ''}
                  {deviceTypeFilter !== 'all' && cashMachineFilter !== 'all' ? ', ' : ''}
                  {cashMachineFilter !== 'all' ? `${cashMachineFilter === 'cash' ? 'cash-enabled' : 'non-cash'} only` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Device Type</label>
                <select
                  value={deviceTypeFilter}
                  onChange={(e) => setDeviceTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="bev">Beverage</option>
                  <option value="food">Food/Snack</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cash Machine</label>
                <select
                  value={cashMachineFilter}
                  onChange={(e) => setCashMachineFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Machines</option>
                  <option value="cash">Cash Enabled</option>
                  <option value="non-cash">Non-Cash</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setDeviceTypeFilter('all');
                    setCashMachineFilter('all');
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Table Header */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-6 gap-4 text-sm font-semibold text-gray-700">
              <div>Case Serial</div>
              <div>Location</div>
              <div>Status</div>
              <div>Last Seen</div>
              <div>Temperature</div>
              <div>Cash Amt</div>
            </div>
          </div>

          {/* Device Rows */}
          {filteredDevices.map((deviceData, index) => {
            const device = deviceData.devices;
            const customer = deviceData.customers;
            const dex = deviceData.dexRaw;
            const caseSerial = device.caseSerial;

            // Get machine data from our mapping
            const mappingData = devicesData?.machineMapping?.machines?.[caseSerial];
            const machineType = mappingData?.details?.machineType || 'unknown';
            const machineModel = mappingData?.details?.machineModel || 'Unknown Model';
            const cashEnabled = mappingData?.details?.cashEnabled || false;
            const machineLocation = mappingData?.details?.machineLocation || customer?.name || 'Unknown Location';

            // Get DEX data for cash denominations and other info
            const dexData = devicesData?.machineMapping?.dexData?.[caseSerial];
            const latestDexData = dexData?.latestDexData?.parsedData?.general;


            // Calculate if DEX data exists within last 4 hours
            const lastDexTime = dex ? new Date(dex.created) : null;
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
            const dexInLast4Hours = lastDexTime && lastDexTime > fourHoursAgo;

            return (
              <div key={device.id || index} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="grid grid-cols-6 gap-4 items-center text-sm">

                  {/* Case Serial */}
                  <div>
                    <div className="font-mono text-gray-900 font-medium">
                      {device.caseSerial}
                    </div>
                    <div className="text-xs text-gray-500">
                      {machineType === 'bev' ? '🥤' : machineType === 'food' ? '🍿' : '❓'} {machineType.toUpperCase()}
                      {cashEnabled && ' 💵'}
                    </div>
                  </div>

                  {/* Location */}
                  <div>
                    <div className="text-gray-900">
                      {machineLocation}
                    </div>
                    <div className="text-xs text-gray-500">
                      {machineModel}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <div className="flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                        device.state === 'approved' ? 'bg-green-400' :
                        device.state === 'banned' ? 'bg-red-400' :
                        'bg-yellow-400'
                      }`}></span>
                      <span className="capitalize">{device.state}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      <span dangerouslySetInnerHTML={{__html: device.signalStr}} />
                    </div>
                  </div>

                  {/* Last Seen */}
                  <div>
                    <div className="text-gray-900">
                      {new Date(device.lastSeen).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(device.lastSeen).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* Temperature */}
                  <div>
                    {latestDexData?.MA5 ? (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-gray-700 mb-1">
                          {machineType === 'food' ? 'Food Temperature:' : 'Beverage Temperature:'}
                        </div>

                        {machineType === 'food' ? (
                          // Food machines: Look for DESIRED TEMPERATURE and DETECTED TEMPERATURE records
                          latestDexData.MA5
                            .filter(record => record['1'] && record['1'].includes('TEMPERATURE'))
                            .map((tempRecord, idx) => {
                              const tempType = tempRecord['1'];
                              const tempValue = tempRecord['2'];
                              const tempUnit = tempRecord['3'];

                              // Convert temperature: 400 = 4.00°C
                              const displayTemp = tempValue ? (parseInt(tempValue.trim()) / 100).toFixed(1) : 'N/A';

                              return (
                                <div key={idx} className="text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      {tempType === 'DESIRED TEMPERATURE' ? 'Target:' : 'Current:'}
                                    </span>
                                    <span className="font-mono text-gray-900">
                                      {displayTemp}°{tempUnit}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                        ) : (
                          // Beverage machines: Look for TEMP record
                          (() => {
                            const tempRecord = latestDexData.MA5.find(record => record['1'] === 'TEMP');
                            if (tempRecord) {
                              const tempValue = tempRecord['2'];
                              const tempUnit = tempRecord['3'];
                              // Convert temperature: 40 = 4.0°C
                              const displayTemp = tempValue ? (parseInt(tempValue.trim()) / 10).toFixed(1) : 'N/A';

                              return (
                                <div className="text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Current:</span>
                                    <span className="font-mono text-gray-900">
                                      {displayTemp}°{tempUnit}
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="text-gray-900">
                          <span dangerouslySetInnerHTML={{__html: device.temp}} />
                        </div>
                        <div className="text-xs text-gray-500">
                          {device.firmwareStr}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cash Amount */}
                  <div>
                    {cashEnabled && latestDexData?.CA17 ? (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-gray-700 mb-1">Cash Denominations:</div>
                        <div className="space-y-0.5 text-xs">
                          <div className="flex justify-between">
                            <span>$0.10:</span>
                            <span className="font-mono">{latestDexData.CA17['1'] || '0'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>$0.20:</span>
                            <span className="font-mono">{latestDexData.CA17['2'] || '0'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>$0.50:</span>
                            <span className="font-mono">{latestDexData.CA17['3'] || '0'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>$1.00:</span>
                            <span className="font-mono">{latestDexData.CA17['4'] || '0'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>$2.00:</span>
                            <span className="font-mono">{latestDexData.CA17['5'] || '0'}</span>
                          </div>
                        </div>
                        <div className="text-xs text-green-600 font-medium pt-1 border-t border-gray-200">
                          Total: ${(() => {
                            const coins = latestDexData.CA17;
                            const total =
                              (parseInt(coins['1'] || '0') * 0.10) +
                              (parseInt(coins['2'] || '0') * 0.20) +
                              (parseInt(coins['3'] || '0') * 0.50) +
                              (parseInt(coins['4'] || '0') * 1.00) +
                              (parseInt(coins['5'] || '0') * 2.00);
                            return total.toFixed(2);
                          })()}
                        </div>
                      </div>
                    ) : cashEnabled ? (
                      <div>
                        <div className="text-amber-600 font-medium">Cash Enabled</div>
                        <div className="text-xs text-amber-600">No DEX data</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-gray-500">N/A</div>
                        <div className="text-xs text-gray-400">No Cash</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom status row */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="font-medium text-gray-600">Last DEX Seen:</span>{' '}
                      <span className={lastDexTime ? 'text-gray-900' : 'text-gray-500'}>
                        {lastDexTime ? lastDexTime.toLocaleString() : 'Never'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">DEX in last 4hrs:</span>{' '}
                      <span className={dexInLast4Hours ? 'text-green-600' : 'text-red-600 font-bold'}>
                        {dexInLast4Hours ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      {(() => {
                        // DEX Error accordion only
                        let hasErrors = false;
                        let errorCount = 0;
                        let errorData = [];

                        if (machineType === 'bev' && latestDexData?.MA5) {
                          const errorRecords = latestDexData.MA5.filter(record => record['1'] === 'ERROR');
                          if (errorRecords.length > 0) {
                            hasErrors = true;
                            errorCount = errorRecords.length;
                            errorData = errorRecords.map((errorRecord, idx) => ({
                              id: `bev-${idx}`,
                              code: errorRecord['2'],
                              type: 'beverage'
                            }));
                          }
                        } else if (machineType === 'food' && latestDexData) {
                          const errorFields = ['EA1', 'EA2', 'EA3', 'EA4', 'EA5', 'EA6', 'EA7', 'EA8', 'EA9'];
                          const foundErrors = [];
                          errorFields.forEach(eaField => {
                            if (latestDexData[eaField]) {
                              foundErrors.push({
                                errorCode: eaField,
                                data: latestDexData[eaField]
                              });
                            }
                          });
                          if (foundErrors.length > 0) {
                            hasErrors = true;
                            errorCount = foundErrors.length;
                            errorData = foundErrors;
                          }
                        }

                        const accordionId = `dex-error-${device.id || caseSerial}`;
                        const isExpanded = expandedErrors[accordionId];

                        return (
                          <div>
                            {/* Accordion Header */}
                            <button
                              onClick={() => setExpandedErrors(prev => ({
                                ...prev,
                                [accordionId]: !prev[accordionId]
                              }))}
                              className={`w-full text-left text-xs px-2 py-1 rounded flex items-center justify-between transition-colors ${
                                hasErrors
                                  ? 'bg-red-50 hover:bg-red-100 border border-red-200'
                                  : 'bg-green-50 hover:bg-green-100 border border-green-200'
                              }`}
                            >
                              <span className={`font-medium ${hasErrors ? 'text-red-700' : 'text-green-700'}`}>
                                {hasErrors ? `ERRORS DETECTED (${errorCount})` : 'NO ERRORS'}
                              </span>
                              <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                ▼
                              </span>
                            </button>

                            {/* Accordion Content */}
                            {isExpanded && (
                              <div className="mt-2 space-y-1 text-xs">
                                {hasErrors ? (
                                  machineType === 'bev' ? (
                                    errorData.map((error, idx) => (
                                      <div key={idx} className="bg-red-50 border border-red-200 rounded px-2 py-1">
                                        <span className="font-mono text-red-800">
                                          {error.code}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    errorData.map((error, idx) => (
                                      <div key={idx} className="bg-red-50 border border-red-200 rounded px-2 py-1">
                                        <div className="font-mono text-red-800 font-medium">
                                          {error.errorCode}
                                        </div>
                                        <div className="text-gray-500 text-xs mt-1">
                                          {Object.entries(error.data).map(([key, value]) => (
                                            <span key={key} className="mr-2">
                                              {key}:{value}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                  )
                                ) : (
                                  <div className="text-green-600 bg-green-50 border border-green-200 rounded px-2 py-1">
                                    ✓ No DEX errors detected
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      );
    }

    // Fallback for other formats
    if (data.rawResponse) {
      return (
        <div className="bg-gray-100 p-4 rounded-lg overflow-auto max-h-96">
          <div className="mb-2 text-gray-600 text-sm">
            Raw Response (Length: {data.responseLength || 'Unknown'})
          </div>
          <pre className="text-sm">{data.rawResponse}</pre>
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Devices Management</h1>
            <p className="text-gray-600">Monitor and manage all your vending machines</p>
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
              ← Back to Dashboard
            </a>
            <button
              onClick={fetchDevicesData}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh Devices'}
            </button>
          </nav>
        </div>

        {/* Stats Cards */}
        {devicesData && devicesData.data && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-blue-600">
                {devicesData.data.recordsTotal || 0}
              </div>
              <div className="text-gray-600">Total Devices</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-green-600">
                {(() => {
                  if (!devicesData.data.data) return 0;
                  const devices = devicesData.data.data;
                  const filtered = devices.filter(deviceData => {
                    const caseSerial = deviceData.devices.caseSerial;
                    const mappingData = devicesData.machineMapping?.machines?.[caseSerial];
                    const machineType = mappingData?.details?.machineType || 'unknown';
                    const cashEnabled = mappingData?.details?.cashEnabled || false;
                    if (deviceTypeFilter !== 'all' && machineType !== deviceTypeFilter) return false;
                    if (cashMachineFilter === 'cash' && !cashEnabled) return false;
                    if (cashMachineFilter === 'non-cash' && cashEnabled) return false;
                    return true;
                  });
                  return filtered.length;
                })()}
              </div>
              <div className="text-gray-600">Filtered View</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-purple-600">
                {(() => {
                  if (!devicesData.machineMapping?.machines) return 0;
                  return Object.values(devicesData.machineMapping.machines).filter(m => m.details?.machineType === 'bev').length;
                })()}
              </div>
              <div className="text-gray-600">🥤 Beverage</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-orange-600">
                {(() => {
                  if (!devicesData.machineMapping?.machines) return 0;
                  return Object.values(devicesData.machineMapping.machines).filter(m => m.details?.machineType === 'food').length;
                })()}
              </div>
              <div className="text-gray-600">🍿 Food/Snack</div>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-green-700">
                {(() => {
                  if (!devicesData.machineMapping?.machines) return 0;
                  return Object.values(devicesData.machineMapping.machines).filter(m => m.details?.cashEnabled === true).length;
                })()}
              </div>
              <div className="text-gray-600">💵 Cash Enabled</div>
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

        {/* Devices Data Display */}
        {devicesData && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Your Devices</h2>
              <span className="text-sm text-gray-500">
                Updated: {lastUpdate?.toLocaleString()}
              </span>
            </div>
            {formatDevicesData(devicesData)}
          </div>
        )}

        {/* Welcome State */}
        {!devicesData && !loading && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="max-w-md mx-auto">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Devices Management</h3>
              <p className="text-gray-500 mb-4">
                This page will display all your vending machines when the devices API is fully configured.
              </p>
              <div className="text-sm text-gray-400 mb-6">
                <p>🔧 <strong>Development Note:</strong> The devices endpoint requires additional server-side configuration.</p>
                <p>For now, use the main dashboard to access individual machine DEX data.</p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={fetchDevicesData}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Try API Connection
                </button>
                <div>
                  <a
                    href="/"
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    ← Return to Main Dashboard
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Demo Devices Display (for UI demonstration) */}
        {!devicesData && !loading && !error && (
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