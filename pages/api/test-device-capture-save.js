export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Testing device capture and save process with environment credentials...');

    // Use environment credentials directly (no user authentication needed for test)
    const username = process.env.CANTALOUPE_USERNAME;
    const password = process.env.CANTALOUPE_PASSWORD;
    const siteUrl = process.env.CANTALOUPE_BASE_URL || 'https://dashboard.cantaloupe.online';

    if (!username || !password) {
      return res.status(400).json({
        error: 'Environment credentials not configured',
        missing: {
          username: !username,
          password: !password
        }
      });
    }

    // Step 1: Authenticate using working auth approach (same as devices-test.js)
    console.log('Authenticating with DEX platform...');

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const authData = await authResponse.json();

    if (!authData.success) {
      throw new Error('Authentication failed via auth endpoint');
    }

    const allCookies = authData.cookies;
    console.log('Authentication successful!');

    // Step 2: Get CSRF token
    let csrfToken = null;
    try {
      const dashResponse = await fetch(siteUrl, {
        method: 'GET',
        headers: {
          'Cookie': allCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const dashHtml = await dashResponse.text();
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]\s*:\s*['"]([^'"]+)['"]/i,
        /_token['"]\s*:\s*['"]([^'"]+)['"]/
      ];

      for (const pattern of patterns) {
        const match = dashHtml.match(pattern);
        if (match) {
          csrfToken = match[1];
          break;
        }
      }
    } catch (e) {
      console.error('Error fetching CSRF token:', e);
    }

    console.log('CSRF token extracted:', !!csrfToken);

    // Step 3: Fetch devices data using working approach from capture.js
    console.log('Fetching devices from DEX platform...');

    const devicesResponse = await fetch(`${siteUrl}/devices/getData`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': allCookies,
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `${siteUrl}/devices`
      },
      body: new URLSearchParams({
        'draw': '1',
        'columns[0][data]': 'devices.caseSerial',
        'columns[0][name]': 'caseSerial',
        'columns[0][searchable]': 'true',
        'columns[0][orderable]': 'true',
        'columns[0][search][value]': '',
        'columns[0][search][regex]': 'false',
        'columns[1][data]': 'customers.name',
        'columns[1][name]': 'customer',
        'columns[1][searchable]': 'true',
        'columns[1][orderable]': 'true',
        'columns[1][search][value]': '',
        'columns[1][search][regex]': 'false',
        'columns[2][data]': 'devices_location',
        'columns[2][name]': 'location',
        'columns[2][searchable]': 'true',
        'columns[2][orderable]': 'false',
        'columns[2][search][value]': '',
        'columns[2][search][regex]': 'false',
        'columns[3][data]': 'devices.lastSeen',
        'columns[3][name]': '',
        'columns[3][searchable]': 'true',
        'columns[3][orderable]': 'true',
        'columns[3][search][value]': '',
        'columns[3][search][regex]': 'false',
        'columns[4][data]': 'devices.firmwareStr',
        'columns[4][name]': 'firmwareStr',
        'columns[4][searchable]': 'true',
        'columns[4][orderable]': 'true',
        'columns[4][search][value]': '',
        'columns[4][search][regex]': 'false',
        'columns[5][data]': '',
        'columns[5][name]': 'stateRender',
        'columns[5][searchable]': 'false',
        'columns[5][orderable]': 'false',
        'columns[5][search][value]': '',
        'columns[5][search][regex]': 'false',
        'columns[6][data]': 'devices.signalStr',
        'columns[6][name]': 'signalStr',
        'columns[6][searchable]': 'true',
        'columns[6][orderable]': 'true',
        'columns[6][search][value]': '',
        'columns[6][search][regex]': 'false',
        'columns[7][data]': 'devices.temp',
        'columns[7][name]': 'temp',
        'columns[7][searchable]': 'true',
        'columns[7][orderable]': 'true',
        'columns[7][search][value]': '',
        'columns[7][search][regex]': 'false',
        'columns[8][data]': 'devices.error_bits',
        'columns[8][name]': 'errorBits',
        'columns[8][searchable]': 'true',
        'columns[8][orderable]': 'true',
        'columns[8][search][value]': '',
        'columns[8][search][regex]': 'false',
        'columns[9][data]': 'devices.uptime',
        'columns[9][name]': 'uptime',
        'columns[9][searchable]': 'true',
        'columns[9][orderable]': 'true',
        'columns[9][search][value]': '',
        'columns[9][search][regex]': 'false',
        'columns[10][data]': 'dexRaw.created',
        'columns[10][name]': 'lastDEX',
        'columns[10][searchable]': 'true',
        'columns[10][orderable]': 'true',
        'columns[10][search][value]': '',
        'columns[10][search][regex]': 'false',
        'columns[11][data]': 'devices.vmName',
        'columns[11][name]': 'vmName',
        'columns[11][searchable]': 'true',
        'columns[11][orderable]': 'false',
        'columns[11][search][value]': '',
        'columns[11][search][regex]': 'false',
        'columns[12][data]': '',
        'columns[12][name]': 'config',
        'columns[12][searchable]': 'false',
        'columns[12][orderable]': 'false',
        'columns[12][search][value]': '',
        'columns[12][search][regex]': 'false',
        'order[0][column]': '3',
        'order[0][dir]': 'desc',
        'start': '0',
        'length': '100',
        'search[value]': '',
        'search[regex]': 'false',
        'show_banned': 'false',
        'show_inv': 'false',
        'show_online': 'false',
        'device_type_select': ''
      })
    });

    if (!devicesResponse.ok) {
      throw new Error('Failed to fetch devices data from DEX platform');
    }

    const devicesData = await devicesResponse.json();
    console.log('Raw devices data received:', {
      recordsTotal: devicesData.recordsTotal,
      recordsFiltered: devicesData.recordsFiltered,
      dataLength: devicesData.data?.length
    });

    if (!devicesData.data || !Array.isArray(devicesData.data)) {
      throw new Error('Invalid devices data format received');
    }

    // Step 4: Process devices for database (same as capture.js but with test company ID)
    const processedDevices = [];
    const testCompanyId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID format for test

    for (const deviceData of devicesData.data) {
      const device = deviceData.devices;
      const customer = deviceData.customers;
      const location = deviceData.devices_location;

      if (!device || !device.caseSerial) {
        console.warn('Skipping invalid device data:', deviceData);
        continue;
      }

      const processedDevice = {
        case_serial: device.caseSerial,
        company_id: testCompanyId,
        machine_type: 'snack', // Use valid enum value - 'food', 'beverage', 'snack', 'combo'
        machine_model: device.vmName ? device.vmName.replace(/<[^>]*>/g, '') : 'Unknown Model',
        status: device.state === 'approved' ? 'active' : 'inactive',
        firmware_version: device.firmwareStr || null,
        // Only include fields that exist in the machines table schema
        // Removed: user_id, location, last_seen, temperature, signal_strength, etc.
        updated_at: new Date().toISOString()
      };

      processedDevices.push(processedDevice);
    }

    console.log(`Processed ${processedDevices.length} devices for database save`);

    // Step 5: Test saving to Supabase (using service client for test)
    const { createServiceClient } = require('../../lib/supabase/server');
    const { supabase } = createServiceClient();

    const { data, error } = await supabase
      .from('machines')
      .upsert(processedDevices, {
        onConflict: 'case_serial'
      });

    if (error) {
      console.error('Failed to save devices to Supabase:', error);
      throw new Error('Failed to save devices to database: ' + error.message);
    }

    console.log('✅ Devices saved to Supabase successfully');

    return res.status(200).json({
      success: true,
      authenticationWorking: true,
      devicesCount: processedDevices.length,
      message: `Successfully captured and saved ${processedDevices.length} devices to database`,
      sampleDevices: processedDevices.slice(0, 3),
      databaseResult: data ? data.length : 'success',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 Test device capture save error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}