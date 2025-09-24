
export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const fs = require('fs');
    const path = require('path');

    // Load the mapping file
    const mappingPath = path.join(process.cwd(), 'data', 'case-serial-dex-mapping.json');
    const mappingJson = fs.readFileSync(mappingPath, 'utf8');
    const mappingData = JSON.parse(mappingJson);

    const validationResults = {
      totalCaseSerials: 0,
      validMappings: 0,
      nullMappings: 0,
      duplicates: {},
      issues: []
    };

    // Track all DEX IDs to find duplicates
    const dexIdTracker = {};

    // Analyze each case serial mapping
    for (const [caseSerial, records] of Object.entries(mappingData.mappings)) {
      validationResults.totalCaseSerials++;

      if (!Array.isArray(records) || records.length === 0) {
        validationResults.issues.push({
          type: 'invalid_format',
          caseSerial: caseSerial,
          message: 'Mapping is not an array or is empty'
        });
        continue;
      }

      const latestRecord = records[0];

      if (!latestRecord.dexId || latestRecord.dexId === null) {
        validationResults.nullMappings++;
        validationResults.issues.push({
          type: 'null_dex_id',
          caseSerial: caseSerial,
          status: latestRecord.status,
          note: latestRecord.note
        });
      } else {
        validationResults.validMappings++;

        // Track DEX ID usage
        const dexId = latestRecord.dexId;
        if (!dexIdTracker[dexId]) {
          dexIdTracker[dexId] = [];
        }
        dexIdTracker[dexId].push(caseSerial);
      }
    }

    // Find duplicates
    for (const [dexId, caseSerials] of Object.entries(dexIdTracker)) {
      if (caseSerials.length > 1) {
        validationResults.duplicates[dexId] = caseSerials;
        validationResults.issues.push({
          type: 'duplicate_dex_id',
          dexId: dexId,
          caseSerials: caseSerials,
          message: `DEX ID ${dexId} is assigned to ${caseSerials.length} case serials`
        });
      }
    }

    // Summary stats
    const duplicateCount = Object.keys(validationResults.duplicates).length;
    const duplicateSerialCount = Object.values(validationResults.duplicates).flat().length;

    res.status(200).json({
      success: true,
      summary: {
        totalCaseSerials: validationResults.totalCaseSerials,
        validMappings: validationResults.validMappings,
        nullMappings: validationResults.nullMappings,
        duplicateDexIds: duplicateCount,
        caseSerialswithDuplicates: duplicateSerialCount,
        totalIssues: validationResults.issues.length
      },
      duplicates: validationResults.duplicates,
      issues: validationResults.issues,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Mapping validation error:', error);
    res.status(500).json({
      error: 'Failed to validate mappings: ' + error.message
    });
  }
}