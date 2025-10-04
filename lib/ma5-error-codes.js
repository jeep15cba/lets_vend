// MA5 Error Code Descriptions
// These errors appear in MA5*ERROR records and disappear once fixed

export const MA5_ERROR_DESCRIPTIONS = {
  'dS': 'Door switch',
  'rAn': 'RAM corrupted',
  'ACLo': 'Rectified voltage under 20 VDC for more than 30 seconds',
  'SF': 'Incompatible scaling factor',
  'IS': 'Inlet sensor blocked',
  'Ib': 'Inlet chute blocked',
  'CC': 'Changer communication',
  'tS': 'Changer tube sensor',
  'IC': 'Inlet chute blocked',
  'CrCH': 'Changer ROM checksum',
  'EE': 'Excessive escrow',
  'nJ': 'Acceptor coin jam',
  'LA': 'Low acceptance rate',
  'CS': 'Chute sensor active five minutes or more',
  'SEnS': 'Temperature sensor',
  'COLd': 'Temperature 1.5°C or more below cut-out',
  'HOt': 'Temperature 1.5°C or more above cut-in',
  'CnPr': 'Not cooling 0.5°C per hour or better',
  'Htr': 'Not heating 0.5°C per hour or better'
};

// Patterns that need special handling (XX represents numbers)
export const MA5_ERROR_PATTERNS = [
  { pattern: /^SSXX$/, replacement: 'SS', description: 'Selection switch closed' },
  { pattern: /^SS\d{2}$/, replacement: 'SS', description: 'Selection switch closed' },
  { pattern: /^tJXX$/, replacement: 'tJ', description: 'Changer tube jam' },
  { pattern: /^tJ\d{2}$/, replacement: 'tJ', description: 'Changer tube jam' },
  { pattern: /^CJXX$/, replacement: 'CJ', description: 'Column jam' },
  { pattern: /^CJ\d{2}$/, replacement: 'CJ', description: 'Column jam' },
  { pattern: /^UAxx$/, replacement: 'UA', description: 'Unassigned column' },
  { pattern: /^UA\d{2}$/, replacement: 'UA', description: 'Unassigned column' }
];

export function getMA5ErrorDescription(code) {
  // First check exact match
  if (MA5_ERROR_DESCRIPTIONS[code]) {
    return MA5_ERROR_DESCRIPTIONS[code];
  }

  // Then check patterns
  for (const { pattern, description } of MA5_ERROR_PATTERNS) {
    if (pattern.test(code)) {
      return description;
    }
  }

  return 'Unknown error';
}
