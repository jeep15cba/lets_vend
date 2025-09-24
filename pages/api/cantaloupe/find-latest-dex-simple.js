
export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { caseSerial } = req.body;

  if (!caseSerial) {
    return res.status(400).json({ error: 'caseSerial is required' });
  }

  try {
    console.log(`Finding latest DEX for case serial: ${caseSerial} using simple approach`);

    // Instead of searching DEX records directly, we'll use the existing working dex-list endpoint
    // and filter the results client-side
    const dexListResponse = await fetch(`${req.headers.origin || 'http://localhost:3300'}/api/cantaloupe/dex-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const dexListData = await dexListResponse.json();

    if (!dexListData.success) {
      return res.status(500).json({
        error: 'Failed to fetch DEX list',
        details: dexListData.error
      });
    }

    // Filter DEX records for this specific case serial and find the most recent
    let latestDexRecord = null;
    let latestDexId = null;

    if (dexListData.data && dexListData.data.data) {
      const matchingRecords = dexListData.data.data.filter(record => {
        return record.devices && record.devices.caseSerial === caseSerial;
      });

      if (matchingRecords.length > 0) {
        // Sort by creation date descending to get the most recent first
        matchingRecords.sort((a, b) => {
          const dateA = new Date(a.dexRaw.created);
          const dateB = new Date(b.dexRaw.created);
          return dateB - dateA; // Descending order
        });

        latestDexRecord = matchingRecords[0];

        // Extract DEX ID from DT_RowId
        if (latestDexRecord.DT_RowId) {
          latestDexId = latestDexRecord.DT_RowId.replace('row_', '');
        } else if (latestDexRecord.dexRaw && latestDexRecord.dexRaw.id) {
          latestDexId = latestDexRecord.dexRaw.id.toString();
        }
      }
    }

    if (!latestDexRecord) {
      return res.status(404).json({
        error: `No DEX records found for case serial: ${caseSerial}`,
        caseSerial: caseSerial,
        totalRecords: dexListData.data?.recordsTotal || 0
      });
    }

    console.log(`Found latest DEX ID ${latestDexId} for case serial ${caseSerial}`);

    res.status(200).json({
      success: true,
      caseSerial: caseSerial,
      latestDexId: latestDexId,
      dexRecord: latestDexRecord,
      totalMatches: dexListData.data?.data?.filter(r => r.devices?.caseSerial === caseSerial).length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('DEX search error:', error);
    res.status(500).json({
      error: 'Failed to find latest DEX: ' + error.message
    });
  }
}