import { useState, useEffect } from 'react';
import { getMA5ErrorDescription } from '../lib/ma5-error-codes';
import { getEA1ErrorDescription } from '../lib/ea1-error-codes';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase/client';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// Helper function to format dates in user's timezone
// Cantaloupe timestamps come as "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" in GMT/UTC
// We need to parse them as GMT and convert to user's timezone for display
const formatAESTDate = (dateString, includeTime = true, userTimezone = 'Australia/Brisbane') => {
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

  // Format in Australian locale with user's selected timezone
  const options = {
    timeZone: userTimezone,
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

// Helper function to format error timestamps (already in local time, not GMT)
// EA1 error timestamps are stored in local time, so no timezone conversion needed
const formatLocalDate = (dateString, includeTime = true) => {
  if (!dateString) return 'Never';

  // Parse as-is without timezone conversion (error timestamps are already local time)
  const date = new Date(dateString);

  const options = {
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

// Sortable Device Row Component
function SortableDeviceRow({ device, children, isEditing }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: device.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className={`bg-white border border-gray-200 rounded-lg p-2 sm:p-3 shadow-sm hover:shadow-md transition-shadow ${isEditing ? 'device-row-editing' : ''}`}>
        {children({ dragHandleProps: listeners })}
      </div>
    </div>
  );
}

export default function Devices() {
  const { user, signOut, hasCredentials, credentialsLoading, timezone } = useAuth();

  // Format dates with user's timezone
  const formatDate = (dateString, includeTime = true) => {
    return formatAESTDate(dateString, includeTime, timezone || 'Australia/Brisbane');
  };

  // Format error timestamps (already local time - no timezone conversion)
  const formatErrorDate = (dateString, includeTime = true) => {
    return formatLocalDate(dateString, includeTime);
  };

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
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [deletingDevice, setDeletingDevice] = useState(null);
  const [editForm, setEditForm] = useState({
    location_type: 'optional', // 'streetAddress', 'optional', or 'other'
    location_other: '',
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
  const [sortBy, setSortBy] = useState('order'); // 'order', 'case', 'last_seen'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResults, setImportResults] = useState({
    updated: [],
    unchanged: [],
    total: 0
  });

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

  // Close editing mode and dropdowns on escape key or click outside
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (editingDevice) {
          cancelEditing();
        }
        if (openDropdownId) {
          setOpenDropdownId(null);
        }
      }
    };

    const handleClickOutside = (e) => {
      // Don't process clicks immediately - wait for React to update state first
      setTimeout(() => {
        // Close dropdown if clicking outside
        if (openDropdownId && !e.target.closest('.device-actions-dropdown')) {
          setOpenDropdownId(null);
        }
        // Close editing mode if clicking outside the device row
        if (editingDevice && !e.target.closest('.device-row-editing')) {
          cancelEditing();
        }
      }, 0);
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingDevice, openDropdownId]);

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
      console.log('🔧 Starting bulk DEX collection for current company...');

      // Get user's JWT token and company_id from Supabase client
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session found');
      }

      const userCompanyId = session.user?.user_metadata?.company_id;
      if (!userCompanyId) {
        throw new Error('No company_id found for user');
      }

      console.log(`🎯 Collecting DEX for company: ${userCompanyId}`);

      // Call the standalone DEX collection Edge Function with company_id
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      const response = await axios.post(
        `${supabaseUrl}/functions/v1/collect-dex-standalone`,
        {
          company_id: userCompanyId,
          records_limit: 500  // Pull more records for manual collection
        },
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Bulk DEX collection completed:', response.data);

      // Refresh devices to show updated DEX info
      await loadSavedDevices();

    } catch (error) {
      console.error('❌ Bulk DEX collection error:', error);
      console.error('❌ Error response data:', error.response?.data);
      const errorDetails = error.response?.data?.message || error.response?.data?.error || error.message;
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

  // Helper function to get display value for location
  const getLocationDisplay = (device) => {
    if (typeof device.location === 'object' && device.location !== null) {
      if (device.location.other) {
        return device.location.other;
      }
      return device.location.optional || device.location.streetAddress || 'Unknown Location';
    } else if (typeof device.location === 'string') {
      return device.location;
    }
    return 'Unknown Location';
  };

  const startEditing = (device) => {
    setEditingDevice(device.id);

    // Determine location type and value
    let locationType = 'optional';
    let locationOther = '';

    if (typeof device.location === 'object' && device.location !== null) {
      // Check if location.other exists (custom location)
      if (device.location.other) {
        locationType = 'other';
        locationOther = device.location.other;
      }
      // Otherwise default to optional (even if empty, user can select)
    } else if (typeof device.location === 'string') {
      // Legacy string location - treat as 'other'
      locationType = 'other';
      locationOther = device.location;
    }

    setEditForm({
      location_type: locationType,
      location_other: locationOther,
      machine_type: device.machine_type || 'unknown',
      cash_enabled: device.cash_enabled || false
    });
  };

  const cancelEditing = () => {
    setEditingDevice(null);
    setEditForm({
      location_type: 'optional',
      location_other: '',
      machine_type: '',
      cash_enabled: false
    });
  };

  const collectDexForDevice = async (device) => {
    try {
      setLoading(true);
      setOpenDropdownId(null); // Close dropdown
      console.log(`🔧 Collecting DEX data for device ${device.case_serial}...`);

      // Get user's JWT token and company_id from Supabase client
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session found');
      }

      const userCompanyId = session.user?.user_metadata?.company_id;
      if (!userCompanyId) {
        throw new Error('No company_id found for user');
      }

      console.log(`🎯 Collecting DEX for machine: ${device.case_serial}`);

      // Call the standalone DEX collection Edge Function with specific machine
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      const response = await axios.post(
        `${supabaseUrl}/functions/v1/collect-dex-standalone`,
        {
          company_id: userCompanyId,
          case_serial: device.case_serial,
          records_limit: 5  // Only get last 5 records for single device
        },
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ DEX collection completed:', response.data);

      // Reload devices to show updated DEX info
      await loadSavedDevices();

    } catch (error) {
      console.error('❌ DEX collection error:', error);
      console.error('❌ Error response data:', error.response?.data);
      const errorDetails = error.response?.data?.message || error.response?.data?.error || error.message;
      setError('Failed to collect DEX data: ' + errorDetails);
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

  const confirmDelete = (device) => {
    setDeletingDevice(device);
    setOpenDropdownId(null); // Close dropdown
  };

  const cancelDelete = () => {
    setDeletingDevice(null);
  };

  const deleteDevice = async (deviceId) => {
    try {
      setLoading(true);
      const response = await axios.delete(`/api/devices/${deviceId}`);

      if (response.data.success) {
        console.log('Device deleted successfully');
        setDeletingDevice(null);
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

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end - reorder devices
  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // Get the current filtered and sorted devices
    const currentDevices = getFilteredAndSortedDevices();

    const oldIndex = currentDevices.findIndex(d => d.id === active.id);
    const newIndex = currentDevices.findIndex(d => d.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Reorder devices array
    const reorderedDevices = arrayMove(currentDevices, oldIndex, newIndex);

    // Update display_order for all affected devices
    const machineOrders = reorderedDevices.map((device, index) => ({
      id: device.id,
      display_order: index + 1
    }));

    // Optimistically update UI
    setSavedDevices(reorderedDevices.map((device, index) => ({
      ...device,
      display_order: index + 1
    })));

    // Save to API
    try {
      const response = await axios.post('/api/machines/update-order', {
        machineOrders
      });

      if (!response.data.success) {
        throw new Error('Failed to update order');
      }

      console.log('Order updated successfully');
    } catch (error) {
      console.error('Error updating order:', error);
      setError('Failed to save new order');
      // Reload devices to revert optimistic update
      await loadSavedDevices();
    }
  };

  // Export devices to CSV
  const handleExport = () => {
    const devices = getFilteredAndSortedDevices();

    // Create CSV content
    const headers = ['Order', 'Case Serial', 'Machine Type', 'Machine Model', 'Cash Enabled'];
    const rows = devices.map(device => [
      device.display_order || '',
      device.case_serial || '',
      device.machine_type || '',
      device.machine_model || '',
      device.cash_enabled ? 'True' : 'False'
    ]);

    // Format CSV with special handling for Case Serial to prevent Excel from treating as number
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map((cell, index) => {
        // Force Case Serial (index 1) to be treated as text in Excel by prefixing with tab character
        if (index === 1 && cell) {
          return `"\t${cell}"`;
        }
        return `"${cell}"`;
      }).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `devices-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import devices from CSV
  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          setError('CSV file is empty or invalid');
          return;
        }

        // Fetch valid machine types from company settings (only active ones)
        let validMachineTypes = ['unknown', 'beverage', 'food']; // Default fallback
        try {
          const settingsResponse = await fetch('/api/settings/company', {
            credentials: 'include'
          });
          if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            if (settingsData.settings?.machineTypes) {
              // Filter to only active types
              validMachineTypes = settingsData.settings.machineTypes
                .filter(type => typeof type === 'string' || type.active)
                .map(type => typeof type === 'string' ? type : type.name);
            }
          }
        } catch (err) {
          console.warn('Failed to fetch machine types, using defaults:', err);
        }

        // Parse CSV (skip header)
        const updates = [];
        const notFound = [];
        const changeTracker = [];
        const invalidMachineTypes = new Set();

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // Split CSV by commas, but respect quoted fields
          const fields = [];
          let current = '';
          let inQuotes = false;

          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              fields.push(current.replace(/^"|"$/g, '').trim());
              current = '';
            } else {
              current += char;
            }
          }
          fields.push(current.replace(/^"|"$/g, '').trim());

          if (fields.length < 5) continue; // Need at least 5 columns

          // Format: Order, Case Serial, Machine Type, Machine Model, Cash Enabled
          const [order, caseSerial, machineType, machineModel, cashEnabled] = fields;

          // Clean case serial: remove tab character, trim whitespace, and ensure it's not empty
          const cleanCaseSerial = caseSerial.replace(/^\t/, '').trim();

          if (!cleanCaseSerial) {
            console.warn(`Row ${i + 1}: Empty case serial, skipping`);
            continue;
          }

          // Find matching device by case serial (exact match)
          const device = savedDevices.find(d => d.case_serial === cleanCaseSerial);

          // Debug: log first few comparisons
          if (i <= 3) {
            console.log(`Row ${i}: CSV serial="${cleanCaseSerial}" Found=${!!device}`);
            if (!device && savedDevices.length > 0) {
              console.log(`  First DB serial="${savedDevices[0].case_serial}"`);
            }
          }

          if (device) {
            const update = {
              id: device.id
            };

            // Only include fields that have values in the CSV
            if (order && order.trim()) {
              update.display_order = parseInt(order);
            }

            if (machineType && machineType.trim()) {
              const trimmedType = machineType.trim().toLowerCase();
              // Check if machine type is valid
              if (validMachineTypes.includes(trimmedType)) {
                update.machine_type = trimmedType;
              } else {
                // Track invalid machine type
                invalidMachineTypes.add(trimmedType);
              }
            }

            if (machineModel && machineModel.trim()) {
              update.machine_model = machineModel.trim();
            }

            // Parse cash_enabled (case-insensitive true/false)
            if (cashEnabled && cashEnabled.trim()) {
              const cashLower = cashEnabled.toLowerCase();
              update.cash_enabled = cashLower === 'true';
            }

            // Track changes for this device
            const changes = [];
            if (update.display_order !== undefined && update.display_order !== device.display_order) {
              changes.push(`Order: ${device.display_order || 'none'} → ${update.display_order || 'none'}`);
            }
            if (update.machine_type !== undefined && update.machine_type !== device.machine_type) {
              changes.push(`Type: ${device.machine_type || 'none'} → ${update.machine_type || 'none'}`);
            }
            if (update.machine_model !== undefined && update.machine_model !== device.machine_model) {
              changes.push(`Model: ${device.machine_model || 'none'} → ${update.machine_model || 'none'}`);
            }
            if (update.cash_enabled !== undefined && update.cash_enabled !== device.cash_enabled) {
              changes.push(`Cash: ${device.cash_enabled ? 'Yes' : 'No'} → ${update.cash_enabled ? 'Yes' : 'No'}`);
            }

            changeTracker.push({
              caseSerial: cleanCaseSerial,
              changes: changes
            });

            updates.push(update);
          } else {
            // Track case serials that don't match any device
            notFound.push(cleanCaseSerial);
          }
        }

        // Show warning if some case serials weren't found
        if (notFound.length > 0) {
          console.warn('Case serials not found in database:', notFound);
          const shouldContinue = confirm(
            `Warning: ${notFound.length} case serial(s) not found in database:\n${notFound.slice(0, 5).join(', ')}${notFound.length > 5 ? '...' : ''}\n\n` +
            `Found ${updates.length} matching devices. Continue with import?`
          );
          if (!shouldContinue) {
            return;
          }
        }

        // Show warning if invalid machine types were found
        if (invalidMachineTypes.size > 0) {
          const invalidTypes = Array.from(invalidMachineTypes);
          console.warn('Invalid machine types found:', invalidTypes);
          const shouldContinue = confirm(
            `Warning: ${invalidTypes.length} invalid machine type(s) found in CSV:\n${invalidTypes.join(', ')}\n\n` +
            `Valid types: ${validMachineTypes.join(', ')}\n\n` +
            `Rows with invalid machine types will be skipped. You can add missing types in Settings > Configuration.\n\n` +
            `Continue with import?`
          );
          if (!shouldContinue) {
            return;
          }
        }

        if (updates.length === 0) {
          setError('No matching devices found in CSV. Please check your case serials match the database.');
          return;
        }

        // Update devices via API
        const response = await axios.post('/api/machines/import-update', {
          updates
        });

        if (response.data.success) {
          setError(null);
          // Reload devices to show updates
          await loadSavedDevices();

          // Show import results modal
          const updated = changeTracker.filter(item => item.changes.length > 0);
          const unchanged = changeTracker.filter(item => item.changes.length === 0);

          setImportResults({
            updated: updated,
            unchanged: unchanged,
            total: changeTracker.length
          });
          setShowImportModal(true);
        } else {
          throw new Error('Failed to import');
        }
      } catch (error) {
        console.error('Import error:', error);
        setError('Failed to import CSV file: ' + error.message);
      }
    };

    reader.readAsText(file);
    // Reset input so same file can be selected again
    event.target.value = '';
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
        d.location?.optional?.toLowerCase().includes(searchLower) ||
        d.location?.streetAddress?.toLowerCase().includes(searchLower) ||
        d.location?.other?.toLowerCase().includes(searchLower)
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

      if (sortBy === 'order') {
        // Sort by display_order (nulls go to end)
        const aOrder = a.display_order !== null && a.display_order !== undefined ? a.display_order : 999999;
        const bOrder = b.display_order !== null && b.display_order !== undefined ? b.display_order : 999999;
        comparison = aOrder - bOrder;
      } else if (sortBy === 'case') {
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
          <div className="grid gap-4 text-sm font-semibold text-gray-700" style={{gridTemplateColumns: '60px 1fr 1.5fr 1fr 1fr 0.75fr 0.75fr 40px'}}>
            <button
              onClick={() => {
                if (sortBy === 'order') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortBy('order');
                  setSortOrder('asc');
                }
              }}
              className="text-left flex items-center gap-1 hover:text-gray-900"
              title="Drag and drop to reorder"
            >
              Order {sortBy === 'order' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
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
            <div>Temp</div>
            <div>Cash Amt</div>
            <div className="text-center text-xs">Actions</div>
          </div>
        </div>

        {/* Device Rows */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={devices.map(d => d.id)}
            strategy={verticalListSortingStrategy}
            disabled={sortBy !== 'order'}
          >
            {devices.map((device, index) => (
              <SortableDeviceRow key={device.id} device={device} isEditing={editingDevice === device.id}>
                {({ dragHandleProps }) => (
                  <>
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
                      <div className="space-y-1 mt-1">
                        <select
                          value={editForm.location_type}
                          onChange={(e) => setEditForm({...editForm, location_type: e.target.value})}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          {device.location?.streetAddress && (
                            <option value="streetAddress">{device.location.streetAddress}</option>
                          )}
                          {device.location?.optional && (
                            <option value="optional">{device.location.optional}</option>
                          )}
                          <option value="other">Other (Custom)</option>
                        </select>
                        {editForm.location_type === 'other' && (
                          <input
                            type="text"
                            value={editForm.location_other}
                            onChange={(e) => setEditForm({...editForm, location_other: e.target.value})}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                            placeholder="Enter custom location"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-900 break-words">
                        {getLocationDisplay(device)}
                      </div>
                    )}
                  </div>
                  <div className="group relative cursor-help">
                    <span className="font-medium text-gray-700">
                      Last Seen:
                      <sup className="ml-0.5 text-blue-500">ⓘ</sup>
                    </span>
                    <div className="text-gray-900">
                      {formatDate(device.latest_dex_data)}
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

                {/* DEX Information - Desktop Only */}
                <div className="hidden sm:block mt-3 pt-3 border-t border-gray-200">
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
                          ? formatDate(device.latest_dex_data, false)
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
                                {dexDetails[device.case_serial].summary?.temperature?.current ? (
                                  <>
                                    {dexDetails[device.case_serial].summary.temperature.current}°{dexDetails[device.case_serial].summary.temperature.unit || 'C'}
                                    {dexDetails[device.case_serial].summary.temperature.target && (
                                      <span className="text-gray-400 ml-1">({dexDetails[device.case_serial].summary.temperature.target}°{dexDetails[device.case_serial].summary.temperature.unit || 'C'})</span>
                                    )}
                                  </>
                                ) : (
                                  convertTemperature(dexDetails[device.case_serial].summary?.temperature)
                                    ? `${convertTemperature(dexDetails[device.case_serial].summary.temperature)}°C`
                                    : 'N/A'
                                )}
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
                            Last Updated: {formatDate(dexDetails[device.case_serial].lastUpdate)}
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

                {/* Mobile Edit Actions */}
                <div className="hidden sm:flex justify-end">
                  {editingDevice === device.id ? (
                    <div className="flex space-x-2">
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
                    </div>
                  ) : (
                    <div className="relative device-actions-dropdown">
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === device.id ? null : device.id)}
                        className="text-gray-600 hover:text-blue-600 hover:bg-gray-100 p-1 rounded"
                        title="Actions"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1.5"/>
                          <circle cx="12" cy="12" r="1.5"/>
                          <circle cx="12" cy="19" r="1.5"/>
                        </svg>
                      </button>

                      {openDropdownId === device.id && (
                        <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-10">
                          <button
                            onClick={() => {
                              startEditing(device);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => collectDexForDevice(device)}
                            disabled={loading}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
                          >
                            Get DEX
                          </button>
                          <button
                            onClick={() => confirmDelete(device)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:grid gap-4 items-center text-sm" style={{gridTemplateColumns: '60px 1fr 1.5fr 1fr 1fr 0.75fr 0.75fr 40px'}}>
                {/* Order / Drag Handle */}
                <div className="flex items-center justify-center" title="Drag to reorder">
                  <button
                    {...(sortBy === 'order' ? dragHandleProps : {})}
                    className={`flex items-center gap-1 ${sortBy === 'order' ? 'cursor-move hover:bg-gray-100 p-1 rounded' : 'cursor-default'}`}
                    disabled={sortBy !== 'order'}
                  >
                    <svg className="w-5 h-5 text-gray-400 hover:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 3h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm0 4h2v2H9v-2zM13 3h2v2h-2V3zm0 4h2v2h-2V7zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
                    </svg>
                    <span className="text-xs text-gray-500">{device.display_order || '-'}</span>
                  </button>
                </div>

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
                    <div className="space-y-1">
                      <select
                        value={editForm.location_type}
                        onChange={(e) => setEditForm({...editForm, location_type: e.target.value})}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {device.location?.streetAddress && (
                          <option value="streetAddress">{device.location.streetAddress}</option>
                        )}
                        {device.location?.optional && (
                          <option value="optional">{device.location.optional}</option>
                        )}
                        <option value="other">Other (Custom)</option>
                      </select>
                      {editForm.location_type === 'other' && (
                        <input
                          type="text"
                          value={editForm.location_other}
                          onChange={(e) => setEditForm({...editForm, location_other: e.target.value})}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          placeholder="Enter custom location"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-900">
                      {getLocationDisplay(device)}
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
                    {formatDate(device.latest_dex_data, false)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {device.latest_dex_data ? formatDate(device.latest_dex_data).split(', ')[1] : ''}
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
                    {device.temperature?.current ? (
                      <>
                        {device.temperature.current}°{device.temperature.unit || 'C'}
                        {device.temperature.target && (
                          <span className="text-gray-400 ml-1 text-sm">({device.temperature.target}°{device.temperature.unit || 'C'})</span>
                        )}
                      </>
                    ) : (
                      convertTemperature(device.temperature) ? `${convertTemperature(device.temperature)}°C` : 'N/A'
                    )}
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
                    </div>
                  ) : (
                    <div className="relative device-actions-dropdown">
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === device.id ? null : device.id)}
                        className="text-gray-600 hover:text-blue-600 hover:bg-gray-100 p-1 rounded"
                        title="Actions"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1.5"/>
                          <circle cx="12" cy="12" r="1.5"/>
                          <circle cx="12" cy="19" r="1.5"/>
                        </svg>
                      </button>

                      {openDropdownId === device.id && (
                        <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-10">
                          <button
                            onClick={() => {
                              startEditing(device);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => collectDexForDevice(device)}
                            disabled={loading}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
                          >
                            Get DEX
                          </button>
                          <button
                            onClick={() => confirmDelete(device)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
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
                      {formatDate(device.latest_dex_data)}
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
                    <div className="flex items-center gap-2">
                      {device.dex_last_4hrs > 0 ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-500 text-white rounded text-sm font-bold">
                          No
                        </span>
                      )}
                      {device.dex_history && device.dex_history.length > 0 && (
                        <a
                          href={`/review-dex/${encodeURIComponent(device.case_serial)}`}
                          className="text-indigo-600 hover:text-indigo-900 text-sm font-medium underline"
                        >
                          Review DEX
                        </a>
                      )}
                    </div>
                    {/* Tooltip showing last 4 DEX timestamps */}
                    {device.dex_history && device.dex_history.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none min-w-max">
                        <div className="font-semibold mb-1">Last 4 DEX Captures:</div>
                        {device.dex_history.slice(0, 4).map((entry, idx) => (
                          <div key={idx}>{formatDate(entry.created)}</div>
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
                                                {formatErrorDate(error.timestamp)}
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
                                              {formatErrorDate(error.timestamp)}
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
              </>
                )}
              </SortableDeviceRow>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    );
  };

  // formatDevicesData function removed - we now use formatSavedDevicesData for Supabase data

  // Format AEST time
  const formatAESTTime = (date) => {
    return date.toLocaleString('en-AU', {
      timeZone: timezone || 'Australia/Brisbane',
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
                      // Get current time in user's timezone
                      const aestTime = new Date(currentTime.toLocaleString('en-US', { timeZone: timezone || 'Australia/Brisbane' }));
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

              {/* Navigation - Mobile Only */}
              <a
                href="/settings"
                className="sm:hidden bg-white text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 transition-colors text-sm text-center"
              >
                ← Settings
              </a>

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
                                {getLocationDisplay(device)}
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

            {/* Export/Import Actions */}
            <div className="mb-4 flex gap-2 justify-end">
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
              <label className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
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
                  Please configure your DEX credentials in{' '}
                  <a href="/settings?tab=dex" className="font-medium text-yellow-800 underline hover:text-yellow-900">
                    Settings → DEX Integration
                  </a>
                  {' '}before accessing device features.
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
                  <li>Start automatic DEX data collection every 20 minutes</li>
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

        {/* Import Results Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold text-gray-900">Import Results</h3>
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  Processed {importResults.total} device{importResults.total !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
                {/* Updated Devices */}
                {importResults.updated.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-medium text-green-700 mb-3 flex items-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Updated ({importResults.updated.length})
                    </h4>
                    <div className="space-y-3">
                      {importResults.updated.map((item, index) => (
                        <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="font-medium text-gray-900 mb-1">{item.caseSerial}</div>
                          <ul className="text-sm text-gray-700 space-y-1">
                            {item.changes.map((change, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className="text-green-600 mr-2">•</span>
                                <span>{change}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unchanged Devices */}
                {importResults.unchanged.length > 0 && (
                  <div>
                    <h4 className="text-lg font-medium text-gray-700 mb-3 flex items-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      No Changes ({importResults.unchanged.length})
                    </h4>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-sm text-gray-700">
                        {importResults.unchanged.map((item, index) => (
                          <span key={index}>
                            {item.caseSerial}
                            {index < importResults.unchanged.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* No devices processed */}
                {importResults.total === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No devices were processed
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingDevice && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Delete</h3>
                <p className="text-gray-600 mb-4">
                  Are you sure you want to delete device <strong>{deletingDevice.case_serial}</strong>?
                  This action cannot be undone.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={cancelDelete}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteDevice(deletingDevice.id)}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}