const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/comprehensive-dex-data.json', 'utf8'));

console.log('🔍 Examining all cash-related DEX fields...\n');

// Look at one machine with comprehensive data
const comprehensive = Object.entries(data.results).find(([_, result]) =>
  result.latestDexData?.parsedData?.general?.CA17 &&
  result.latestDexData?.parsedData?.general?.CA1 &&
  result.latestDexData?.parsedData?.general?.CA2
);

if (comprehensive) {
  const [caseSerial, result] = comprehensive;
  const general = result.latestDexData.parsedData.general;

  console.log(`Sample Machine: ${caseSerial} - ${result.machineDetails.machineLocation}`);
  console.log('\nCA1 (Cash Box):');
  console.log(JSON.stringify(general.CA1, null, 2));

  console.log('\nCA2 (Cash Sales):');
  console.log(JSON.stringify(general.CA2, null, 2));

  console.log('\nCA17 (Cash Handling):');
  console.log(JSON.stringify(general.CA17, null, 2));
}

console.log('\n📊 Cash Data Summary:');
const cashSummary = {};

Object.entries(data.results).forEach(([caseSerial, result]) => {
  if (result.latestDexData?.parsedData?.general) {
    const general = result.latestDexData.parsedData.general;
    cashSummary[caseSerial] = {
      location: result.machineDetails.machineLocation,
      hasCA1: !!general.CA1,
      hasCA2: !!general.CA2,
      hasCA17: !!general.CA17,
      ca1: general.CA1,
      ca2: general.CA2
    };
  }
});

console.log('Machines with cash data:');
Object.entries(cashSummary).forEach(([serial, data]) => {
  if (data.hasCA1 || data.hasCA2 || data.hasCA17) {
    console.log(`  ${serial}: ${data.location}`);
    console.log(`    CA1: ${data.hasCA1 ? 'Yes' : 'No'} | CA2: ${data.hasCA2 ? 'Yes' : 'No'} | CA17: ${data.hasCA17 ? 'Yes' : 'No'}`);
    if (data.ca1) console.log(`    CA1 Data: ${JSON.stringify(data.ca1)}`);
    if (data.ca2) console.log(`    CA2 Data: ${JSON.stringify(data.ca2)}`);
  }
});