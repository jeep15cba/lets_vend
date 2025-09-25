
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json();
  const { caseSerial } = body;

  if (!caseSerial) {
    return new Response(JSON.stringify({ error: 'caseSerial is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log(`Mock DEX ID lookup for case serial: ${caseSerial}`);

    // Edge Runtime doesn't support fs module, use hardcoded fallback mapping
    const mappingData = {
      mappings: {
        'CSA200202689': [{ dexId: '23036647', timestamp: '2025-09-24T00:00:00.000Z', firmware: '1.0.119', parsed: true }],
        '552234133189': [{ dexId: '22995469', timestamp: '2025-09-23T00:00:00.000Z', firmware: 'unknown', parsed: true }]
      }
    };

    // Look up latest DEX ID for this case serial from array format
    const dexRecords = mappingData.mappings[caseSerial];
    const latestRecord = dexRecords && dexRecords[0] ? dexRecords[0] : null;
    const dexId = latestRecord && latestRecord.dexId ? latestRecord.dexId : null;

    if (!dexId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No valid DEX ID found for this case serial',
        caseSerial: caseSerial,
        status: latestRecord?.status || 'not_found',
        note: latestRecord?.note || 'Case serial not found in mapping file',
        timestamp: new Date().toISOString()
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
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

    return new Response(JSON.stringify({
      success: true,
      caseSerial: caseSerial,
      latestDexId: dexId,
      dexRecord: mockRecord,
      totalMatches: 1,
      timestamp: new Date().toISOString(),
      note: "Mock data for testing - replace with real search when available"
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Mock DEX search error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to find latest DEX: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}