import { createClient } from '@supabase/supabase-js'
export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Starting DEX data capture and save process...');

    // Step 1: Fetch DEX data using our working endpoint
    const baseUrl = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000';
    const dexResponse = await fetch(`${baseUrl}/api/cantaloupe/dex-raw`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const dexData = await dexResponse.json();
    if (!dexData.success) {
      throw new Error('Failed to fetch DEX data from Cantaloupe');
    }

    // The dex-raw endpoint returns: { success: true, data: { data: [...], recordsTotal: ... } }
    const rawDexData = dexData.data?.data || [];
    if (!Array.isArray(rawDexData)) {
      throw new Error('Invalid DEX data format - expected array');
    }

    // Build caseSerial → dexId mapping and process records
    const caseSerialToDexId = {};
    const dexRecords = [];

    for (const record of rawDexData) {
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
    console.log(`Fetched ${dexRecords.length} DEX records for ${Object.keys(caseSerialToDexId).length} unique machines`);

    // Step 2: Initialize Supabase client
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 3: Get test company ID (for now, we'll use the same one as devices)
    const testCompanyId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    // Step 4: Process and save DEX records
    const processedDexRecords = [];
    const saveResults = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const record of dexRecords) {
      try {
        // Find the machine_id based on case_serial
        const { data: machineData, error: machineError } = await supabase
          .from('machines')
          .select('id')
          .eq('case_serial', record.caseSerial)
          .eq('company_id', testCompanyId)
          .single();

        if (machineError || !machineData) {
          console.log(`Machine not found for case serial: ${record.caseSerial}`);
          continue; // Skip DEX records for machines not in our database
        }

        const processedRecord = {
          machine_id: machineData.id,
          case_serial: record.caseSerial,
          dex_id: record.dexId,
          raw_content: null, // Will be populated later when we fetch individual DEX content
          structured_data: {
            parsed: record.parsed === 'true' || record.parsed === true,
            uploadReason: record.uploadReason,
            dexSource: record.dexSource,
            customer: record.customer,
            created: record.created
          },
          firmware: record.firmware,
          capture_source: 'cantaloupe-api',
          processing_status: 'pending'
        };

        processedDexRecords.push(processedRecord);

        // Save to dex_captures table
        const { error: insertError } = await supabase
          .from('dex_captures')
          .upsert(processedRecord, {
            onConflict: 'dex_id',
            ignoreDuplicates: false
          });

        if (insertError) {
          console.error(`Error saving DEX record ${record.dexId}:`, insertError);
          saveResults.errors.push({
            dexId: record.dexId,
            caseSerial: record.caseSerial,
            error: insertError.message
          });
          saveResults.failed++;
        } else {
          saveResults.successful++;
        }

      } catch (recordError) {
        console.error(`Error processing DEX record ${record.dexId}:`, recordError);
        saveResults.errors.push({
          dexId: record.dexId,
          caseSerial: record.caseSerial,
          error: recordError.message
        });
        saveResults.failed++;
      }
    }

    console.log(`DEX capture complete: ${saveResults.successful} successful, ${saveResults.failed} failed`);

    return res.status(200).json({
      success: true,
      message: `DEX data capture completed`,
      summary: {
        totalDexRecords: dexRecords.length,
        processedRecords: processedDexRecords.length,
        saveResults: saveResults,
        uniqueMachines: Object.keys(caseSerialToDexId).length
      },
      caseSerialToDexIdMapping: caseSerialToDexId,
      sampleProcessedRecords: processedDexRecords.slice(0, 3),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 DEX capture error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}