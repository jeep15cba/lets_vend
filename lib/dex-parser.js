/**
 * DEX Data Parser - Converts raw DEX content into structured readable data
 *
 * DEX format follows NAMA standard for vending machine data exchange
 * Each line contains segments separated by '*' characters
 */

export function parseDexContent(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return null;
  }

  const lines = rawContent.split('\r\n').filter(line => line.trim());
  const parsedData = {
    header: {},
    sales: {},
    cash: {},
    products: [],
    events: [],
    diagnostics: {},
    summary: {}
  };

  for (const line of lines) {
    const segments = line.split('*');
    const segmentType = segments[0];

    try {
      switch (segmentType) {
        case 'DXS':
          // Header: DXS*9259630007*VA*V1/1*1**
          parsedData.header = {
            machineId: segments[1],
            state: segments[2],
            version: segments[3],
            transmissionNumber: segments[4]
          };
          break;

        case 'ID1':
          // Machine ID: ID1*CAI0211300014*KO_DDV 67276-3*0100**EVS3.0*
          parsedData.machineInfo = {
            serialNumber: segments[1],
            model: segments[2],
            assetNumber: segments[3],
            version: segments[5]
          };
          break;

        case 'CA3':
          // Cash Sales: CA3*5307880*2183900*1933980*11900*...
          parsedData.cash = {
            totalCashSales: parseInt(segments[1]) / 100, // Convert cents to dollars
            cashVends: parseInt(segments[2]),
            cashValue: parseInt(segments[3]) / 100,
            billsInStacker: parseInt(segments[4]),
            totalCashInTubes: parseInt(segments[5]) / 100,
            totalCashInCassette: parseInt(segments[6]) / 100
          };
          break;

        case 'CA4':
          // Card Sales: CA4*1897740*125370*1897740*125370*0*0*0*0*0*0
          parsedData.sales = {
            totalCardSales: parseInt(segments[1]) / 100,
            cardVends: parseInt(segments[2]),
            totalCardValue: parseInt(segments[3]) / 100,
            cardReaderVends: parseInt(segments[4])
          };
          break;

        case 'PA1':
        case 'PA2':
          // Product Data: PA1*1*400* followed by PA2*2554*728340*2554*728340*0*0
          if (segmentType === 'PA1') {
            const productSelection = segments[1];
            const price = parseInt(segments[2]) / 100;

            // Find or create product entry
            let product = parsedData.products.find(p => p.selection === productSelection);
            if (!product) {
              product = { selection: productSelection, price };
              parsedData.products.push(product);
            } else {
              product.price = price;
            }
          } else if (segmentType === 'PA2') {
            // Find the last product that doesn't have sales data yet
            const product = parsedData.products.find(p => !p.sales);
            if (product) {
              product.sales = {
                totalSales: parseInt(segments[1]) / 100,
                vendCount: parseInt(segments[2]),
                totalValue: parseInt(segments[3]) / 100,
                vendsSinceReset: parseInt(segments[4])
              };
            }
          }
          break;

        case 'VA1':
          // Total values: VA1*7147820*25922*7147820*25922*0*0
          parsedData.summary = {
            totalSales: parseInt(segments[1]) / 100,
            totalVends: parseInt(segments[2]),
            totalValue: parseInt(segments[3]) / 100,
            totalTransactions: parseInt(segments[4])
          };
          break;

        case 'EA2':
          // Events: EA2*DO*1946*1946
          parsedData.events.push({
            type: segments[1], // DO = Door Open, CR = Cash Reset, etc.
            count: parseInt(segments[2]),
            value: parseInt(segments[3])
          });
          break;

        case 'MA5':
          // Machine settings/diagnostics
          if (segments[1] === 'TIME') {
            parsedData.diagnostics.lastUpdate = segments[3];
          } else if (segments[1] === 'TEMP') {
            parsedData.diagnostics.temperature = {
              value: parseInt(segments[2]),
              unit: segments[3]
            };
          }
          break;
      }
    } catch (error) {
      console.warn(`Error parsing DEX line: ${line}`, error);
    }
  }

  return parsedData;
}

export function formatDexSummary(parsedData) {
  if (!parsedData) return null;

  return {
    totalSales: parsedData.summary?.totalSales || 0,
    totalVends: parsedData.summary?.totalVends || 0,
    cashSales: parsedData.cash?.totalCashSales || 0,
    cardSales: parsedData.sales?.totalCardSales || 0,
    productCount: parsedData.products?.length || 0,
    lastUpdate: parsedData.diagnostics?.lastUpdate || null,
    temperature: parsedData.diagnostics?.temperature || null
  };
}

export function getTopProducts(parsedData, limit = 5) {
  if (!parsedData?.products) return [];

  return parsedData.products
    .filter(product => product.sales && product.sales.totalSales > 0)
    .sort((a, b) => b.sales.totalSales - a.sales.totalSales)
    .slice(0, limit)
    .map(product => ({
      selection: product.selection,
      price: product.price,
      totalSales: product.sales.totalSales,
      vendCount: product.sales.vendCount
    }));
}