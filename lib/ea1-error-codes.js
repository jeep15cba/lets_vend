// EA1 Event Error Code Descriptions
// These are error event codes from vending machines

export const EA1_ERROR_DESCRIPTIONS = {
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

export function getEA1ErrorDescription(code) {
  return EA1_ERROR_DESCRIPTIONS[code] || 'Unknown event';
}
