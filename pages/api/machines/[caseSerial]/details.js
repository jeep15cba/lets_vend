export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'GET' } });
  }

  try {
    const url = new URL(req.url)
    const caseSerial = url.pathname.split('/').filter(Boolean).pop()

    if (!caseSerial) {
      return new Response(JSON.stringify({ error: 'Case serial required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch the static file via HTTP for Edge Runtime compatibility
    const baseUrl = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const fileUrl = `${baseUrl}/data/comprehensive-raw-dex-data.json`
    const response = await fetch(fileUrl)

    if (!response.ok) {
      throw new Error('Failed to fetch comprehensive data')
    }

    const comprehensiveData = await response.json()

    const machine = comprehensiveData.data?.machines?.[caseSerial];
    if (!machine) {
      return new Response(JSON.stringify({ error: 'Machine not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const rawDex = machine.rawDexContent;

    // Extract detailed product data
    let products = [];
    if (rawDex?.structured?.PA1 && rawDex?.structured?.PA2) {
      const pa1Records = rawDex.structured.PA1;
      const pa2Records = rawDex.structured.PA2;

      pa1Records.forEach((pa1, index) => {
        const pa2 = pa2Records[index];
        if (pa1.data && pa2?.data) {
          const slotNumber = pa1.data[0];
          const price = parseInt(pa1.data[1] || '0');
          const sales = parseInt(pa2.data[0] || '0');
          const revenue = parseInt(pa2.data[1] || '0');

          if (sales > 0 || price > 0) { // Only include active slots
            products.push({
              slot: slotNumber,
              price: price / 100, // Convert cents to dollars
              sales,
              revenue: revenue / 100, // Convert cents to dollars
              isActive: price > 0
            });
          }
        }
      });
    }

    // Extract detailed cash data
    let cashDetails = null;
    if (rawDex?.structured?.CA17) {
      const denominations = [];
      let totalCash = 0;

      rawDex.structured.CA17.forEach(record => {
        if (record.data && record.data.length >= 3) {
          const coinType = record.data[0];
          const coinValue = parseInt(record.data[1] || '0');
          const coinCount = parseInt(record.data[2] || '0');
          const coinTotal = (coinValue / 100) * coinCount;

          let denomination;
          switch (coinType) {
            case '00': denomination = '0.10'; break;
            case '01': denomination = '0.20'; break;
            case '02': denomination = '0.50'; break;
            case '03': denomination = '1.00'; break;
            case '04': denomination = '2.00'; break;
            default: denomination = `${coinValue / 100}`;
          }

          denominations.push({
            type: denomination,
            count: coinCount,
            value: coinValue / 100,
            total: parseFloat(coinTotal.toFixed(2))
          });

          totalCash += coinTotal;
        }
      });

      cashDetails = {
        totalCash: parseFloat(totalCash.toFixed(2)),
        denominations: denominations.sort((a, b) => a.value - b.value)
      };
    }

    // Extract temperature history/details
    let temperatureDetails = null;
    if (rawDex?.structured?.MA5) {
      const tempRecords = rawDex.structured.MA5.filter(record =>
        record.data && (record.data[0].includes('TEMPERATURE') || record.data[0] === 'TEMP')
      );

      if (tempRecords.length > 0) {
        temperatureDetails = tempRecords.map(record => ({
          type: record.data[0],
          value: record.data[1],
          unit: record.data[2],
          rawRecord: record.raw
        }));
      }
    }

    // Extract all error details
    let errorDetails = [];
    if (rawDex?.structured) {
      // MA5 errors
      if (rawDex.structured.MA5) {
        const errorRecords = rawDex.structured.MA5.filter(record =>
          record.data && record.data[0] === 'ERROR'
        );
        errorDetails = errorDetails.concat(errorRecords.map(record => ({
          category: 'machine',
          type: record.data[0],
          code: record.data[1],
          rawRecord: record.raw,
          timestamp: null
        })));
      }

      // EA errors
      const errorFields = ['EA1', 'EA2', 'EA3', 'EA4', 'EA5', 'EA6', 'EA7', 'EA8', 'EA9'];
      errorFields.forEach(eaField => {
        if (rawDex.structured[eaField]) {
          rawDex.structured[eaField].forEach(record => {
            errorDetails.push({
              category: 'event',
              type: eaField,
              data: record.data,
              rawRecord: record.raw,
              timestamp: null
            });
          });
        }
      });
    }

    const detailedMachine = {
      // Basic info
      caseSerial: machine.caseSerial,
      customerName: machine.customerName,
      lastDexUpdate: machine.latestDexCreated,
      lastDataFetch: machine.fetchedAt,
      firmware: machine.latestDexMetadata?.firmware,
      dexId: machine.latestDexId,

      // Detailed data
      products,
      cashDetails,
      temperatureDetails,
      errorDetails,

      // Summary stats
      totalProducts: products.length,
      activeProducts: products.filter(p => p.isActive).length,
      totalSales: products.reduce((sum, p) => sum + p.sales, 0),
      totalRevenue: products.reduce((sum, p) => sum + p.revenue, 0),
      hasErrors: errorDetails.length > 0,

      // Raw DEX access (for debugging)
      rawDexAvailable: !!rawDex,
      dexFieldTypes: rawDex?.summary?.fieldTypes || []
    };

    return new Response(JSON.stringify({
      success: true,
      data: detailedMachine
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    });

  } catch (error) {
    console.error('Machine details API error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to load machine details: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}