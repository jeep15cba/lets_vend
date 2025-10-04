/**
 * Hybrid DEX Parser - Best of both approaches
 * 1. Preserves original DEX structure (like comprehensive-dex-data.json)
 * 2. Adds self-documenting key-value pairs for easy access
 * 3. Optimized for database storage and UI display
 * 4. Includes event code mapping for machine diagnostics
 */

// Event code mapping for machine diagnostics
const EVENT_CODES = {
  'EGS': 'Door Open',
  'EJB': 'Motor Jam',
  'EJH': 'Health Rules Violated',
  'EJL': 'Delivery Sensor Error',
  'ENA': 'Bill Validator Path Blocked',
  'ENE': 'Cash Box Full',
  'ENF': 'Cash Box not seated correctly',
  'EAR': 'Coin Mech Error',
  'OCM': 'Operating System Failure',
  'OFA': 'Coin box emptied'
};

// MA5 error code mapping for machine diagnostics
const MA5_ERROR_CODES = {
  'UA06': 'Column 6 Error',
  'UA08': 'Column 8 Error',
  'UA09': 'Column 9 Error',
  'UA10': 'Column 10 Error'
};

export function parseHybridDex(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { structured: {}, keyValue: {}, summary: {} };
  }

  const lines = rawContent.split('\r\n').filter(line => line.trim());
  const structured = { general: {}, products: [] };
  const keyValue = {};

  let currentProduct = null;

  for (const line of lines) {
    const segments = line.split('*');
    const segmentType = segments[0];

    try {
      // Store in structured format (your approach)
      if (segmentType === 'PA1') {
        currentProduct = { PA1: {}, PA2: {} };
        structured.products.push(currentProduct);
      }

      if (currentProduct && (segmentType === 'PA1' || segmentType === 'PA2')) {
        currentProduct[segmentType] = {};
        segments.slice(1).forEach((value, index) => {
          if (value !== '') {
            currentProduct[segmentType][index + 1] = value;
          }
        });
      } else {
        // Store in general section
        structured.general[segmentType] = {};
        segments.slice(1).forEach((value, index) => {
          if (value !== '') {
            structured.general[segmentType][index + 1] = value;
          }
        });
      }

      // Store in key-value format (my approach) for easy access
      switch (segmentType) {
        case 'CA17':
          // Coin tube data: CA17*{row}*{denomination_cents}*{count}
          const tubeRow = segments[1];
          const denominationCents = segments[2];
          const coinCount = segments[3];

          if (tubeRow && denominationCents && coinCount) {
            const denominationDollars = (parseInt(denominationCents) / 100).toFixed(2);
            const totalValue = (parseInt(denominationCents) * parseInt(coinCount) / 100).toFixed(2);

            keyValue[`tube_${tubeRow}_denomination`] = denominationDollars;
            keyValue[`tube_${tubeRow}_count`] = coinCount;
            keyValue[`tube_${tubeRow}_total_value`] = totalValue;
          }
          break;

        case 'VA1':
          keyValue['total_sales_value'] = (parseInt(segments[1] || 0) / 100).toFixed(2);
          keyValue['total_sales_count'] = segments[2] || '0';
          keyValue['total_value_since_init'] = (parseInt(segments[3] || 0) / 100).toFixed(2);
          keyValue['total_count_since_init'] = segments[4] || '0';
          break;

        case 'DA2':
          keyValue['cash_in_cashbox'] = (parseInt(segments[1] || 0) / 100).toFixed(2);
          keyValue['cash_bills_count'] = segments[2] || '0';
          break;

        case 'MA5':
          if (segments[1] === 'DESIRED TEMPERATURE') {
            keyValue['desired_temperature'] = segments[2]?.trim();
            keyValue['desired_temperature_unit'] = segments[3];
          } else if (segments[1] === 'DETECTED TEMPERATURE') {
            keyValue['detected_temperature'] = segments[2]?.trim();
            keyValue['detected_temperature_unit'] = segments[3];
          } else if (segments[1] === 'ERROR') {
            // Handle MA5*ERROR*{error_code}*{additional_code} format
            const errorCode1 = segments[2];
            const errorCode2 = segments[3]; // Some lines have multiple error codes

            if (errorCode1) {
              const errorDescription1 = MA5_ERROR_CODES[errorCode1] || `Unknown MA5 Error (${errorCode1})`;
              keyValue[`ma5_error_${errorCode1.toLowerCase()}_description`] = errorDescription1;
              keyValue[`ma5_error_${errorCode1.toLowerCase()}_active`] = 'true';

              // Track latest MA5 error
              keyValue['latest_ma5_error_code'] = errorCode1;
              keyValue['latest_ma5_error_description'] = errorDescription1;
            }

            if (errorCode2) {
              const errorDescription2 = MA5_ERROR_CODES[errorCode2] || `Unknown MA5 Error (${errorCode2})`;
              keyValue[`ma5_error_${errorCode2.toLowerCase()}_description`] = errorDescription2;
              keyValue[`ma5_error_${errorCode2.toLowerCase()}_active`] = 'true';

              // If there's a second error code, it becomes the latest
              keyValue['latest_ma5_error_code'] = errorCode2;
              keyValue['latest_ma5_error_description'] = errorDescription2;
            }
          }
          break;

        case 'ID1':
          keyValue['machine_serial'] = segments[1]?.trim();
          keyValue['machine_model'] = segments[2]?.trim();
          break;

        case 'CB1':
          keyValue['software_version'] = segments[3];
          break;

        case 'EA1':
          // Event audit data: EA1*{event_code}*{date}*{time}
          const eventCode = segments[1];
          const eventDate = segments[2];
          const eventTime = segments[3];

          if (eventCode) {
            const eventDescription = EVENT_CODES[eventCode] || `Unknown Event (${eventCode})`;
            const eventKey = `event_${eventCode.toLowerCase()}`;

            keyValue[`${eventKey}_description`] = eventDescription;
            keyValue[`${eventKey}_date`] = eventDate;
            keyValue[`${eventKey}_time`] = eventTime;
            keyValue[`${eventKey}_datetime`] = `${eventDate} ${eventTime}`;

            // Track latest event
            if (!keyValue['latest_event'] || (eventDate && eventTime)) {
              keyValue['latest_event_code'] = eventCode;
              keyValue['latest_event_description'] = eventDescription;
              keyValue['latest_event_datetime'] = `${eventDate} ${eventTime}`;
            }
          }
          break;

        case 'EA2':
          // Event audit extended data: EA2*{activity_data}*{duration}
          const activityData = segments[1];
          const duration = segments[2];

          if (activityData) {
            keyValue['event_activity_data'] = activityData;
            keyValue['event_duration'] = duration;
          }
          break;
      }

      // Store product data in key-value format
      if (segmentType === 'PA1' && currentProduct) {
        const selection = segments[1];
        const price = (parseInt(segments[2] || 0) / 100).toFixed(2);
        keyValue[`product_${selection}_price`] = price;
      } else if (segmentType === 'PA2' && currentProduct) {
        const products = structured.products;
        const lastProduct = products[products.length - 1];
        if (lastProduct && lastProduct.PA1) {
          const selection = Object.values(lastProduct.PA1)[0];
          if (selection) {
            keyValue[`product_${selection}_sales_count`] = segments[1] || '0';
            keyValue[`product_${selection}_sales_value`] = (parseInt(segments[2] || 0) / 100).toFixed(2);
          }
        }
      }

    } catch (error) {
      console.warn(`Error parsing DEX line: ${line}`, error);
    }
  }

  // Generate summary for device cards
  const summary = {
    totalSales: keyValue['total_sales_value'] || '0.00',
    totalVends: keyValue['total_sales_count'] || '0',
    cashInBox: keyValue['cash_in_cashbox'] || '0.00',
    temperature: keyValue['detected_temperature'] || null,
    productCount: structured.products.length || 0,
    coinTubes: Object.keys(keyValue).filter(k => k.startsWith('tube_')).length || 0,
    machineModel: keyValue['machine_model'] || 'Unknown',
    softwareVersion: keyValue['software_version'] || 'Unknown',
    latestEvent: keyValue['latest_event_description'] || null,
    latestEventCode: keyValue['latest_event_code'] || null,
    latestEventTime: keyValue['latest_event_datetime'] || null,
    hasEvents: Object.keys(keyValue).some(k => k.startsWith('event_')),
    latestMa5Error: keyValue['latest_ma5_error_description'] || null,
    latestMa5ErrorCode: keyValue['latest_ma5_error_code'] || null,
    hasMa5Errors: Object.keys(keyValue).some(k => k.startsWith('ma5_error_'))
  };

  return { structured, keyValue, summary };
}

// Helper function to get specific data for device cards
export function getDeviceCardData(hybridData) {
  const { keyValue, summary } = hybridData;

  return {
    // For main display
    totalSales: summary.totalSales,
    totalVends: summary.totalVends,

    // For expanded view
    cashInBox: summary.cashInBox,
    temperature: summary.temperature,
    machineModel: summary.machineModel,

    // Coin tube summary
    coinData: Object.keys(keyValue)
      .filter(k => k.startsWith('tube_'))
      .reduce((acc, key) => {
        acc[key] = keyValue[key];
        return acc;
      }, {}),

    // Event data
    eventData: Object.keys(keyValue)
      .filter(k => k.startsWith('event_'))
      .reduce((acc, key) => {
        acc[key] = keyValue[key];
        return acc;
      }, {}),

    latestEvent: summary.latestEvent,

    // MA5 Error data
    ma5ErrorData: Object.keys(keyValue)
      .filter(k => k.startsWith('ma5_error_'))
      .reduce((acc, key) => {
        acc[key] = keyValue[key];
        return acc;
      }, {}),

    latestMa5Error: summary.latestMa5Error,

    // Top products
    topProducts: Object.keys(keyValue)
      .filter(k => k.includes('_sales_value'))
      .map(k => {
        const selection = k.split('_')[1];
        return {
          selection,
          price: keyValue[`product_${selection}_price`] || '0.00',
          sales: keyValue[`product_${selection}_sales_value`] || '0.00',
          count: keyValue[`product_${selection}_sales_count`] || '0'
        };
      })
      .filter(p => parseFloat(p.sales) > 0)
      .sort((a, b) => parseFloat(b.sales) - parseFloat(a.sales))
      .slice(0, 5)
  };
}