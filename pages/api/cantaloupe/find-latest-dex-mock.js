export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { caseSerial } = req.body;

  if (!caseSerial) {
    return res.status(400).json({ error: 'caseSerial is required' });
  }

  try {
    console.log(`Mock DEX ID lookup for case serial: ${caseSerial}`);

    // Load case serial to DEX ID mapping from file
    let mappingData;
    try {
      const fs = require('fs');
      const path = require('path');
      const mappingPath = path.join(process.cwd(), 'data', 'case-serial-dex-mapping.json');
      const mappingJson = fs.readFileSync(mappingPath, 'utf8');
      mappingData = JSON.parse(mappingJson);
    } catch (error) {
      console.error('Error loading DEX mapping file:', error);
      // Fallback mapping in new array format
      mappingData = {
        mappings: {
          'CSA200202689': [{ dexId: '23036647', timestamp: '2025-09-24T00:00:00.000Z', firmware: '1.0.119', parsed: true }],
          '552234133189': [{ dexId: '22995469', timestamp: '2025-09-23T00:00:00.000Z', firmware: 'unknown', parsed: true }]
        }
      };
    }

    // Look up latest DEX ID for this case serial from array format
    const dexRecords = mappingData.mappings[caseSerial];
    const latestRecord = dexRecords && dexRecords[0] ? dexRecords[0] : null;
    const dexId = latestRecord && latestRecord.dexId ? latestRecord.dexId : null;

    if (!dexId) {
      return res.status(404).json({
        success: false,
        error: 'No valid DEX ID found for this case serial',
        caseSerial: caseSerial,
        status: latestRecord?.status || 'not_found',
        note: latestRecord?.note || 'Case serial not found in mapping file',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Mapped case serial ${caseSerial} to DEX ID ${dexId}`);

    const mockRecord = {
      dexRaw: {
        id: parseInt(dexId),
        created: new Date().toISOString(),
        uploadReason: 0,
        parsed: 1,
        preprocessed: 1,
        firmware: "1.0.119",
        VDIUploaded: 1,
        vdiProviderID: null,
        dexSource: "Device"
      },
      devices: {
        caseSerial: caseSerial
      },
      customers: {
        name: "Isavend"
      }
    };

    console.log(`Mock: Found DEX ID ${dexId} for case serial ${caseSerial}`);

    res.status(200).json({
      success: true,
      caseSerial: caseSerial,
      latestDexId: dexId,
      dexRecord: mockRecord,
      totalMatches: 1,
      timestamp: new Date().toISOString(),
      note: "Mock data for testing - replace with real search when available"
    });

  } catch (error) {
    console.error('Mock DEX search error:', error);
    res.status(500).json({
      error: 'Failed to find latest DEX: ' + error.message
    });
  }
}