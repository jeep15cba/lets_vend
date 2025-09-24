export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Finding missing DEX mappings by comparing devices with DEX data...');

    // Get all devices first
    const devicesResponse = await fetch(`${req.headers.origin || 'http://localhost:3300'}/api/cantaloupe/devices-raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const devicesData = await devicesResponse.json();
    if (!devicesData.success) {
      return res.status(500).json({ error: 'Failed to fetch devices data' });
    }

    // Extract all case serials from devices
    const deviceSerials = new Set();
    devicesData.data.data.forEach(device => {
      if (device.devices && device.devices.caseSerial) {
        deviceSerials.add(device.devices.caseSerial);
      }
    });

    console.log(`Found ${deviceSerials.size} device case serials`);

    // Load current DEX mappings
    const fs = require('fs');
    const path = require('path');
    const mappingPath = path.join(process.cwd(), 'data', 'case-serial-dex-mapping.json');
    let mappingData;

    try {
      const mappingJson = fs.readFileSync(mappingPath, 'utf8');
      mappingData = JSON.parse(mappingJson);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to load mapping file' });
    }

    // Find missing mappings
    const missingSerials = [];
    const nullMappings = [];
    const validMappings = [];

    for (const serial of deviceSerials) {
      const mapping = mappingData.mappings[serial];

      if (!mapping) {
        missingSerials.push(serial);
      } else if (!mapping[0] || !mapping[0].dexId) {
        nullMappings.push({
          caseSerial: serial,
          status: mapping[0]?.status,
          note: mapping[0]?.note
        });
      } else {
        validMappings.push({
          caseSerial: serial,
          dexId: mapping[0].dexId,
          timestamp: mapping[0].timestamp
        });
      }
    }

    console.log(`Analysis: ${validMappings.length} valid, ${nullMappings.length} null, ${missingSerials.length} missing`);

    // Try to find DEX data for missing serials
    const foundMappings = [];
    const stillMissing = [];

    if (missingSerials.length > 0) {
      console.log(`Searching for DEX data for ${missingSerials.length} missing case serials...`);

      // Fetch more DEX records to find missing ones
      const dexResponse = await fetch(`${req.headers.origin || 'http://localhost:3300'}/api/cantaloupe/dex-raw?length=500`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });

      const dexData = await dexResponse.json();

      if (dexData.success && dexData.data && dexData.data.data) {
        // Create lookup map of DEX data by case serial
        const dexLookup = {};
        dexData.data.data.forEach(record => {
          if (record.devices && record.devices.caseSerial) {
            const serial = record.devices.caseSerial;
            if (!dexLookup[serial] || record.dexRaw.created > dexLookup[serial].dexRaw.created) {
              dexLookup[serial] = record;
            }
          }
        });

        // Check each missing serial
        for (const serial of missingSerials) {
          const dexRecord = dexLookup[serial];
          if (dexRecord) {
            foundMappings.push({
              caseSerial: serial,
              dexId: dexRecord.dexRaw.id.toString(),
              timestamp: dexRecord.dexRaw.created,
              firmware: dexRecord.dexRaw.firmware,
              parsed: dexRecord.dexRaw.parsed === 1
            });
          } else {
            stillMissing.push(serial);
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      summary: {
        totalDevices: deviceSerials.size,
        validMappings: validMappings.length,
        nullMappings: nullMappings.length,
        missingMappings: missingSerials.length,
        foundInDex: foundMappings.length,
        stillMissing: stillMissing.length
      },
      details: {
        validMappings: validMappings,
        nullMappings: nullMappings,
        foundMappings: foundMappings,
        stillMissing: stillMissing
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Missing mappings search error:', error);
    res.status(500).json({
      error: 'Failed to find missing DEX mappings: ' + error.message
    });
  }
}