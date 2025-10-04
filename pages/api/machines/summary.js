// Using Node.js runtime for filesystem access
// export const runtime = 'edge';

import fs from 'fs';
import path from 'path';
import { getUserCompanyContext } from '../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user context from middleware headers (if authenticated)
    // For now, we'll allow public access but filter based on company if authenticated
    const userId = req.headers['x-user-id'];
    const userEmail = req.headers['x-user-email'];
    const companyId = req.headers['x-company-id'];
    const userRole = req.headers['x-user-role'];

    console.log('API Auth Context:', { userId, userEmail, companyId, userRole });

    // DEV MODE: Skip auth if Supabase not configured
    const isDevMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (isDevMode) {
      console.log('🔧 DEV MODE: Public access to machine summary');
    }
    // Read the file directly from filesystem
    const filePath = path.join(process.cwd(), 'public/data/comprehensive-raw-dex-data.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const comprehensiveData = JSON.parse(fileContent);

    if (!comprehensiveData.data?.machines) {
      return res.status(404).json({ error: 'No machine data found' });
    }

    // Transform to lightweight summary format
    const machineSummaries = {};

    Object.entries(comprehensiveData.data.machines).forEach(([caseSerial, machine]) => {
      const rawDex = machine.rawDexContent;

      // Extract temperature data
      let temperature = null;
      if (rawDex?.structured?.MA5) {
        const tempRecords = rawDex.structured.MA5.filter(record =>
          record.data && (record.data[0].includes('TEMPERATURE') || record.data[0] === 'TEMP')
        );

        if (tempRecords.length > 0) {
          const currentTemp = tempRecords.find(r => r.data[0] === 'DETECTED TEMPERATURE' || r.data[0] === 'TEMP');
          const targetTemp = tempRecords.find(r => r.data[0] === 'DESIRED TEMPERATURE');

          if (currentTemp) {
            const tempValue = currentTemp.data[1];
            const tempUnit = currentTemp.data[2];
            const isFood = tempRecords.some(r => r.data[0] === 'DESIRED TEMPERATURE');
            const divisor = isFood ? 100 : 10; // Food machines use /100, beverage /10

            temperature = {
              current: tempValue ? (parseInt(tempValue.trim()) / divisor).toFixed(1) : null,
              target: targetTemp ? (parseInt(targetTemp.data[1].trim()) / divisor).toFixed(1) : null,
              unit: tempUnit || 'C'
            };
          }
        }
      }

      // Extract cash data
      let cash = null;
      if (rawDex?.structured?.CA17) {
        const denominations = {
          '0.10': 0, '0.20': 0, '0.50': 0, '1.00': 0, '2.00': 0
        };

        rawDex.structured.CA17.forEach(record => {
          if (record.data && record.data.length >= 3) {
            const coinType = record.data[0];
            const coinValue = record.data[1];
            const coinCount = parseInt(record.data[2] || '0');

            switch (coinType) {
              case '00': denominations['0.10'] = coinCount; break;
              case '01': denominations['0.20'] = coinCount; break;
              case '02': denominations['0.50'] = coinCount; break;
              case '03': denominations['1.00'] = coinCount; break;
              case '04': denominations['2.00'] = coinCount; break;
            }
          }
        });

        const total =
          (denominations['0.10'] * 0.10) +
          (denominations['0.20'] * 0.20) +
          (denominations['0.50'] * 0.50) +
          (denominations['1.00'] * 1.00) +
          (denominations['2.00'] * 2.00);

        cash = {
          total: parseFloat(total.toFixed(2)),
          denominations
        };
      }

      // Extract error data
      let errors = [];
      if (rawDex?.structured) {
        // Beverage machine errors (MA5 ERROR records)
        if (rawDex.structured.MA5) {
          const errorRecords = rawDex.structured.MA5.filter(record =>
            record.data && record.data[0] === 'ERROR'
          );
          errors = errors.concat(errorRecords.map(record => ({
            type: 'beverage',
            code: record.data[1],
            description: `Machine Error: ${record.data[1]}`
          })));
        }

        // Food machine errors (EA1-EA9 fields)
        const errorFields = ['EA1', 'EA2', 'EA3', 'EA4', 'EA5', 'EA6', 'EA7', 'EA8', 'EA9'];
        errorFields.forEach(eaField => {
          if (rawDex.structured[eaField] && rawDex.structured[eaField].length > 0) {
            errors.push({
              type: 'food',
              code: eaField,
              description: `${eaField} Error`,
              data: rawDex.structured[eaField][0].data
            });
          }
        });
      }

      // Product count
      const productCount = rawDex?.summary?.hasProducts || 0;

      machineSummaries[caseSerial] = {
        caseSerial: machine.caseSerial,
        customerName: machine.customerName,
        lastDexUpdate: machine.latestDexCreated,
        firmware: machine.latestDexMetadata?.firmware,
        temperature,
        cash,
        errors,
        productCount,
        hasRecentData: rawDex?.fetchedAt ?
          (new Date() - new Date(rawDex.fetchedAt)) < (4 * 60 * 60 * 1000) : false
      };
    });

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes

    return res.status(200).json({
      success: true,
      data: machineSummaries,
      totalMachines: Object.keys(machineSummaries).length,
      lastUpdated: comprehensiveData.data.timestamp
    });

  } catch (error) {
    console.error('Machine summary API error:', error);
    return res.status(500).json({
      error: 'Failed to load machine summaries: ' + error.message
    });
  }
}