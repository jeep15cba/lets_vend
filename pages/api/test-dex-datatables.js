export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Testing /dex endpoint with correct DataTables format...');

    // Use environment credentials
    const siteUrl = process.env.CANTALOUPE_BASE_URL || 'https://dashboard.cantaloupe.online';

    // Step 1: Authenticate
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const authData = await authResponse.json();
    if (!authData.success) {
      throw new Error('Authentication failed');
    }

    const allCookies = authData.cookies;

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

    // Step 3: Test /dex endpoint with correct DataTables format
    // Based on the column structure we found in the DEX page analysis
    const dexResponse = await fetch(`${siteUrl}/dex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': allCookies,
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `${siteUrl}/dex`
      },
      body: new URLSearchParams({
        // Basic DataTables parameters
        'draw': '1',
        'start': '0',
        'length': '25', // Match the pageLength: 25 from the config
        'search[value]': '',
        'search[regex]': 'false',

        // Order by column 2 (dexRaw.created) descending - from order: [[2, 'desc']]
        'order[0][column]': '2',
        'order[0][dir]': 'desc',

        // Column definitions based on the analysis
        // Column 0: dt-control rawdex
        'columns[0][data]': '',
        'columns[0][name]': '',
        'columns[0][searchable]': 'false',
        'columns[0][orderable]': 'false',
        'columns[0][search][value]': '',
        'columns[0][search][regex]': 'false',

        // Column 1: dt-control parseddex
        'columns[1][data]': '',
        'columns[1][name]': '',
        'columns[1][searchable]': 'false',
        'columns[1][orderable]': 'false',
        'columns[1][search][value]': '',
        'columns[1][search][regex]': 'false',

        // Column 2: dexRaw.created (this is the main order column)
        'columns[2][data]': 'dexRaw.created',
        'columns[2][name]': '',
        'columns[2][searchable]': 'true',
        'columns[2][orderable]': 'true',
        'columns[2][search][value]': '',
        'columns[2][search][regex]': 'false',

        // Column 3: dexRaw.parsed
        'columns[3][data]': 'dexRaw.parsed',
        'columns[3][name]': '',
        'columns[3][searchable]': 'true',
        'columns[3][orderable]': 'false',
        'columns[3][search][value]': '',
        'columns[3][search][regex]': 'false',

        // Column 4: dexRaw.uploadReason
        'columns[4][data]': 'dexRaw.uploadReason',
        'columns[4][name]': '',
        'columns[4][searchable]': 'true',
        'columns[4][orderable]': 'false',
        'columns[4][search][value]': '',
        'columns[4][search][regex]': 'false',

        // Column 5: dexRaw.dexSource
        'columns[5][data]': 'dexRaw.dexSource',
        'columns[5][name]': '',
        'columns[5][searchable]': 'true',
        'columns[5][orderable]': 'false',
        'columns[5][search][value]': '',
        'columns[5][search][regex]': 'false',

        // Column 6: dexRaw.firmware
        'columns[6][data]': 'dexRaw.firmware',
        'columns[6][name]': '',
        'columns[6][searchable]': 'true',
        'columns[6][orderable]': 'false',
        'columns[6][search][value]': '',
        'columns[6][search][regex]': 'false',

        // Column 7: devices.caseSerial (KEY FIELD!)
        'columns[7][data]': 'devices.caseSerial',
        'columns[7][name]': '',
        'columns[7][searchable]': 'true',
        'columns[7][orderable]': 'false',
        'columns[7][search][value]': '',
        'columns[7][search][regex]': 'false',

        // Column 8: customers.name
        'columns[8][data]': 'customers.name',
        'columns[8][name]': '',
        'columns[8][searchable]': 'true',
        'columns[8][orderable]': 'false',
        'columns[8][search][value]': '',
        'columns[8][search][regex]': 'false'
      })
    });

    if (!dexResponse.ok) {
      throw new Error(`DEX endpoint failed: ${dexResponse.status} ${dexResponse.statusText}`);
    }

    const dexData = await dexResponse.json();
    console.log('DEX data received:', {
      recordsTotal: dexData.recordsTotal,
      recordsFiltered: dexData.recordsFiltered,
      dataLength: dexData.data?.length
    });

    if (!dexData.data || !Array.isArray(dexData.data)) {
      throw new Error('Invalid DEX data format received');
    }

    // Step 4: Build the mapping: caseSerial -> dexId
    const caseSerialToDexId = {};
    const dexRecords = [];

    for (const record of dexData.data) {
      if (record.devices?.caseSerial && record.dexRaw?.id) {
        const caseSerial = record.devices.caseSerial;
        const dexId = record.dexRaw.id;

        // Store the latest (most recent) DEX ID for each case serial
        if (!caseSerialToDexId[caseSerial] ||
            new Date(record.dexRaw.created) > new Date(caseSerialToDexId[caseSerial].created)) {
          caseSerialToDexId[caseSerial] = {
            dexId: dexId,
            created: record.dexRaw.created,
            parsed: record.dexRaw.parsed,
            firmware: record.dexRaw.firmware,
            customer: record.customers?.name
          };
        }

        dexRecords.push({
          caseSerial: caseSerial,
          dexId: dexId,
          created: record.dexRaw.created,
          parsed: record.dexRaw.parsed,
          uploadReason: record.dexRaw.uploadReason,
          dexSource: record.dexRaw.dexSource,
          firmware: record.dexRaw.firmware,
          customer: record.customers?.name
        });
      }
    }

    const uniqueMachines = Object.keys(caseSerialToDexId).length;

    return res.status(200).json({
      success: true,
      authenticationWorking: true,
      dexEndpointWorking: true,
      totalDexRecords: dexData.recordsTotal,
      returnedRecords: dexData.data.length,
      uniqueMachines: uniqueMachines,
      caseSerialToDexIdMapping: caseSerialToDexId,
      sampleDexRecords: dexRecords.slice(0, 3),
      message: `Successfully fetched ${dexData.data.length} DEX records for ${uniqueMachines} unique machines`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 Test DEX DataTables error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}