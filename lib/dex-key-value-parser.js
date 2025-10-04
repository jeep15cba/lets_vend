/**
 * DEX Key-Value Parser - Converts raw DEX data into detailed key-value pairs
 * Following NAMA standard for vending machine data exchange
 */

export function parseDexToKeyValue(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return {};
  }

  const lines = rawContent.split('\r\n').filter(line => line.trim());
  const keyValuePairs = {};

  for (const line of lines) {
    const segments = line.split('*');
    const segmentType = segments[0];

    try {
      switch (segmentType) {
        case 'DXS':
          // Header: DXS*RST7654321*VA*V0/6*1
          keyValuePairs['dxs_machine_id'] = segments[1];
          keyValuePairs['dxs_state'] = segments[2];
          keyValuePairs['dxs_version'] = segments[3];
          keyValuePairs['dxs_transmission_number'] = segments[4];
          break;

        case 'ST':
          // Start: ST*001*0001
          keyValuePairs['st_start_code'] = segments[1];
          keyValuePairs['st_sequence'] = segments[2];
          break;

        case 'ID1':
          // Machine ID: ID1*6025050003*65000*****60*6100
          keyValuePairs['id1_serial_number'] = segments[1]?.trim();
          keyValuePairs['id1_model'] = segments[2]?.trim();
          keyValuePairs['id1_asset_number'] = segments[3];
          keyValuePairs['id1_location'] = segments[4];
          keyValuePairs['id1_software_revision'] = segments[5];
          keyValuePairs['id1_control_board'] = segments[6];
          keyValuePairs['id1_communications_board'] = segments[7];
          break;

        case 'ID4':
          // ID4*2*0036*N/A
          keyValuePairs['id4_decimal_point_position'] = segments[1];
          keyValuePairs['id4_currency_code'] = segments[2];
          keyValuePairs['id4_language'] = segments[3];
          break;

        case 'ID5':
          // Date/Time: ID5*251002*1723
          keyValuePairs['id5_date'] = segments[1];
          keyValuePairs['id5_time'] = segments[2];
          break;

        case 'CA2':
          // Cash Sales Reset: CA2*0*0*0*0
          keyValuePairs['ca2_cash_sales_reset'] = segments[1];
          keyValuePairs['ca2_cash_in_tube_reset'] = segments[2];
          keyValuePairs['ca2_cash_in_bills_reset'] = segments[3];
          keyValuePairs['ca2_cash_to_cassette_reset'] = segments[4];
          break;

        case 'CA3':
          // Cash Sales: CA3*0*0*0*0*0*0*0*0
          keyValuePairs['ca3_cash_sales_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca3_cash_sales_count'] = segments[2];
          keyValuePairs['ca3_cash_in_tube'] = (parseInt(segments[3]) / 100).toFixed(2);
          keyValuePairs['ca3_cash_in_bills'] = (parseInt(segments[4]) / 100).toFixed(2);
          keyValuePairs['ca3_cash_sales_since_init'] = (parseInt(segments[5]) / 100).toFixed(2);
          keyValuePairs['ca3_cash_count_since_init'] = segments[6];
          keyValuePairs['ca3_cash_tube_since_init'] = (parseInt(segments[7]) / 100).toFixed(2);
          keyValuePairs['ca3_cash_bills_since_init'] = (parseInt(segments[8]) / 100).toFixed(2);
          break;

        case 'CA4':
          // Cashless Sales: CA4*0*0*0*0
          keyValuePairs['ca4_cashless_sales_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca4_cashless_sales_count'] = segments[2];
          keyValuePairs['ca4_cashless_value_since_init'] = (parseInt(segments[3]) / 100).toFixed(2);
          keyValuePairs['ca4_cashless_count_since_init'] = segments[4];
          break;

        case 'CA7':
          // Discount Sales: CA7*0*0*0*0
          keyValuePairs['ca7_discount_sales_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca7_discount_sales_count'] = segments[2];
          keyValuePairs['ca7_discount_value_since_init'] = (parseInt(segments[3]) / 100).toFixed(2);
          keyValuePairs['ca7_discount_count_since_init'] = segments[4];
          break;

        case 'CA8':
          // Surcharge Sales: CA8*0*0
          keyValuePairs['ca8_surcharge_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca8_surcharge_count'] = segments[2];
          break;

        case 'CA10':
          // Pay Vend Sales: CA10*0*0
          keyValuePairs['ca10_pay_vend_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca10_pay_vend_count'] = segments[2];
          break;

        case 'CA14':
          // Value Sales: CA14*0**0
          keyValuePairs['ca14_value_sales'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca14_value_medium'] = segments[2];
          keyValuePairs['ca14_value_count'] = segments[3];
          break;

        case 'CA15':
          // Cash Overpay: CA15*0
          keyValuePairs['ca15_cash_overpay'] = (parseInt(segments[1]) / 100).toFixed(2);
          break;

        case 'CA17':
          // Coin Tube Data: CA17*{row}*{denomination_cents}*{count}
          const tubeRow = segments[1];
          const denominationCents = segments[2];
          const coinCount = segments[3];
          const denominationDollars = (parseInt(denominationCents) / 100).toFixed(2);
          const totalValue = (parseInt(denominationCents) * parseInt(coinCount) / 100).toFixed(2);

          keyValuePairs[`ca17_tube_${tubeRow}_denomination`] = denominationDollars;
          keyValuePairs[`ca17_tube_${tubeRow}_count`] = coinCount;
          keyValuePairs[`ca17_tube_${tubeRow}_total_value`] = totalValue;
          keyValuePairs[`ca17_tube_${tubeRow}_raw`] = `${denominationCents}*${coinCount}`;
          break;

        case 'CA1':
          // Cash Sales Summary: CA1*value*count
          keyValuePairs['ca1_cash_sales_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca1_cash_sales_count'] = segments[2];
          break;

        case 'CA9':
          // Test Vend Sales: CA9*value*count
          keyValuePairs['ca9_test_vend_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ca9_test_vend_count'] = segments[2];
          break;

        case 'CB1':
          // Machine Build/Software: CB1***NZZE2.240617
          keyValuePairs['cb1_software_version'] = segments[3];
          break;

        case 'BA1':
          // Bill Acceptor: BA1*serial*model*software
          keyValuePairs['ba1_serial'] = segments[1];
          keyValuePairs['ba1_model'] = segments[2];
          keyValuePairs['ba1_software'] = segments[3];
          break;

        case 'DA1':
          // Cash in Change Tubes: DA1*value
          keyValuePairs['da1_cash_in_tubes'] = (parseInt(segments[1]) / 100).toFixed(2);
          break;

        case 'DA4':
          // Cash Dispensed: DA4*value*count
          keyValuePairs['da4_cash_dispensed_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['da4_cash_dispensed_count'] = segments[2];
          break;

        case 'TA2':
          // Token Sales: TA2*value*count
          keyValuePairs['ta2_token_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['ta2_token_count'] = segments[2];
          break;

        case 'PA4':
          // Product Price List: PA4*selection*price
          const pa4Selection = segments[1];
          const pa4Price = parseInt(segments[2]) / 100;
          keyValuePairs[`pa4_selection_${pa4Selection}_price`] = pa4Price.toFixed(2);
          break;

        case 'PA5':
          // Product Sales Extended: PA5*selection*data
          const pa5Selection = segments[1];
          keyValuePairs[`pa5_selection_${pa5Selection}_data`] = segments.slice(2).join('*');
          break;

        case 'LS':
          // Line Start: LS*sequence
          keyValuePairs['ls_sequence'] = segments[1];
          break;

        case 'LE':
          // Line End: LE*sequence
          keyValuePairs['le_sequence'] = segments[1];
          break;

        case 'SD1':
          // Serial Data: SD1*data
          keyValuePairs['sd1_serial_data'] = segments[1];
          break;

        case 'DA2':
          // Cash in Cash Box: DA2*166110*377*0*0
          keyValuePairs['da2_cash_in_cashbox'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['da2_cash_bills_in_cashbox'] = segments[2];
          keyValuePairs['da2_cash_to_cashbox_value'] = (parseInt(segments[3]) / 100).toFixed(2);
          keyValuePairs['da2_cash_to_cashbox_count'] = segments[4];
          break;

        case 'VA1':
          // Value of all sales: VA1*166110*377*0*0*0*0*0*0
          keyValuePairs['va1_total_sales_value'] = (parseInt(segments[1]) / 100).toFixed(2);
          keyValuePairs['va1_total_sales_count'] = segments[2];
          keyValuePairs['va1_total_value_since_init'] = (parseInt(segments[3]) / 100).toFixed(2);
          keyValuePairs['va1_total_count_since_init'] = segments[4];
          break;

        case 'VA2':
          // Number of Resets: VA2*50*7*0*0*0*0
          keyValuePairs['va2_resets_total'] = segments[1];
          keyValuePairs['va2_resets_service'] = segments[2];
          keyValuePairs['va2_resets_since_power_up'] = segments[3];
          keyValuePairs['va2_resets_since_cash_sale'] = segments[4];
          break;

        case 'VA3':
          // Sales Since: VA3*0*6*0*0
          keyValuePairs['va3_sales_since_cash'] = segments[1];
          keyValuePairs['va3_sales_since_maintenance'] = segments[2];
          keyValuePairs['va3_sales_since_reset'] = segments[3];
          keyValuePairs['va3_sales_since_power_up'] = segments[4];
          break;

        case 'PA1':
          // Product Price: PA1*10*360
          const selection = segments[1];
          const price = parseInt(segments[2]) / 100;
          keyValuePairs[`pa1_selection_${selection}_price`] = price.toFixed(2);
          break;

        case 'PA2':
          // Product Sales: PA2*20*7200*0*0*0*0*0*0
          // Find corresponding PA1 by looking back through processed data
          const pa2Lines = lines.filter(l => l.startsWith('PA1*') || l.startsWith('PA2*'));
          const currentIndex = pa2Lines.findIndex(l => l === line);
          if (currentIndex > 0) {
            const prevPA1 = pa2Lines[currentIndex - 1];
            if (prevPA1 && prevPA1.startsWith('PA1*')) {
              const prevSelection = prevPA1.split('*')[1];
              keyValuePairs[`pa2_selection_${prevSelection}_sales_count`] = segments[1];
              keyValuePairs[`pa2_selection_${prevSelection}_sales_value`] = (parseInt(segments[2]) / 100).toFixed(2);
              keyValuePairs[`pa2_selection_${prevSelection}_sales_since_list`] = segments[3];
              keyValuePairs[`pa2_selection_${prevSelection}_value_since_list`] = (parseInt(segments[4]) / 100).toFixed(2);
            }
          }
          break;

        case 'EA1':
          // Event Activity: EA1*EGS*251002*1233
          keyValuePairs[`ea1_event_${segments[1]}_date`] = segments[2];
          keyValuePairs[`ea1_event_${segments[1]}_time`] = segments[3];
          break;

        case 'EA2':
          // Event Activity Count: EA2*EAR*0*14**1
          keyValuePairs[`ea2_event_${segments[1]}_count`] = segments[2];
          keyValuePairs[`ea2_event_${segments[1]}_value`] = segments[3];
          break;

        case 'EA3':
          // Event Activity Detail: EA3*595*251002*1723**251002*1623
          keyValuePairs['ea3_machine_runtime'] = segments[1];
          keyValuePairs['ea3_runtime_date'] = segments[2];
          keyValuePairs['ea3_runtime_time'] = segments[3];
          break;

        case 'EA4':
          // Event Activity Date: EA4*251002*1232
          keyValuePairs['ea4_event_date'] = segments[1];
          keyValuePairs['ea4_event_time'] = segments[2];
          break;

        case 'EA5':
          // Event Activity Date: EA5*251002*1239
          keyValuePairs['ea5_completion_date'] = segments[1];
          keyValuePairs['ea5_completion_time'] = segments[2];
          break;

        case 'EA7':
          // Event Summary: EA7*0*16
          keyValuePairs['ea7_significant_events'] = segments[1];
          keyValuePairs['ea7_total_events'] = segments[2];
          break;

        case 'MA5':
          // Machine Settings/Diagnostics: MA5*DESIRED TEMPERATURE*500*C
          const settingName = segments[1];
          if (settingName === 'DESIRED TEMPERATURE') {
            keyValuePairs['ma5_desired_temperature'] = segments[2]?.trim();
            keyValuePairs['ma5_desired_temperature_unit'] = segments[3];
          } else if (settingName === 'DETECTED TEMPERATURE') {
            keyValuePairs['ma5_detected_temperature'] = segments[2]?.trim();
            keyValuePairs['ma5_detected_temperature_unit'] = segments[3];
          } else if (settingName === 'ERROR') {
            // MA5*ERROR can have multiple error codes: MA5*ERROR*UA09*UA10 or MA5*ERROR*HOT
            const errorCodes = segments.slice(2).filter(Boolean);
            keyValuePairs['ma5_error_codes'] = errorCodes.join(',');
            // Store each error code separately for easier access
            errorCodes.forEach((code, idx) => {
              keyValuePairs[`ma5_error_${idx + 1}`] = code;
            });
          } else {
            keyValuePairs[`ma5_${settingName.toLowerCase().replace(/\s+/g, '_')}`] = segments[2];
          }
          break;

        case 'G85':
          // Audit Number: G85*2321
          keyValuePairs['g85_audit_number'] = segments[1];
          break;

        case 'SE':
          // Segment End: SE*199*0001
          keyValuePairs['se_segment_count'] = segments[1];
          keyValuePairs['se_control_number'] = segments[2];
          break;

        case 'DXE':
          // DEX End: DXE*1*1
          keyValuePairs['dxe_transmission_control'] = segments[1];
          keyValuePairs['dxe_audit_control'] = segments[2];
          break;

        default:
          // Store ALL unknown segments with their full data for comprehensive coverage
          const segmentKey = `${segmentType.toLowerCase()}_raw`;

          // If it's a segment we haven't specifically handled, store it generically
          if (!keyValuePairs[segmentKey]) {
            keyValuePairs[segmentKey] = [];
          }

          // Store the full segment data
          if (Array.isArray(keyValuePairs[segmentKey])) {
            keyValuePairs[segmentKey].push(segments.slice(1));
          } else {
            keyValuePairs[segmentKey] = [keyValuePairs[segmentKey], segments.slice(1)];
          }

          // Also store in a simple format for easy access
          keyValuePairs[`${segmentType.toLowerCase()}_data`] = segments.slice(1).join('*');
          break;
      }
    } catch (error) {
      console.warn(`Error parsing DEX line: ${line}`, error);
      keyValuePairs[`error_${segmentType.toLowerCase()}`] = line;
    }
  }

  return keyValuePairs;
}

export function formatKeyValuePairs(keyValuePairs) {
  const formatted = {};

  // Group related keys
  const groups = {
    header: {},
    machine_info: {},
    sales: {},
    cash: {},
    products: {},
    events: {},
    diagnostics: {},
    totals: {},
    other: {}
  };

  for (const [key, value] of Object.entries(keyValuePairs)) {
    if (key.startsWith('dxs_') || key.startsWith('st_')) {
      groups.header[key] = value;
    } else if (key.startsWith('id1_') || key.startsWith('id4_') || key.startsWith('id5_')) {
      groups.machine_info[key] = value;
    } else if (key.startsWith('ca1_') || key.startsWith('ca3_') || key.startsWith('ca4_') || key.startsWith('ca7_') || key.startsWith('ca8_') || key.startsWith('ca9_') || key.startsWith('ca10_') || key.startsWith('ca14_') || key.startsWith('ca15_') || key.startsWith('ca17_') || key.startsWith('ta2_')) {
      groups.sales[key] = value;
    } else if (key.startsWith('da1_') || key.startsWith('da2_') || key.startsWith('da4_') || key.startsWith('ba1_')) {
      groups.cash[key] = value;
    } else if (key.startsWith('pa1_') || key.startsWith('pa2_')) {
      groups.products[key] = value;
    } else if (key.startsWith('ea1_') || key.startsWith('ea2_') || key.startsWith('ea3_') || key.startsWith('ea4_') || key.startsWith('ea5_') || key.startsWith('ea7_')) {
      groups.events[key] = value;
    } else if (key.startsWith('ma5_') || key.startsWith('cb1_')) {
      groups.diagnostics[key] = value;
    } else if (key.startsWith('va1_') || key.startsWith('va2_') || key.startsWith('va3_')) {
      groups.totals[key] = value;
    } else {
      groups.other[key] = value;
    }
  }

  return groups;
}