
export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Finding missing DEX mappings by comparing devices with DEX data...');

    // Get all devices first
    const devicesResponse = await fetch(`${req.headers.origin || 'http://localhost:3300'}/api/cantaloupe/devices-raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const devicesData = await devicesResponse.json();
    if (!devicesData.success) {
      return res.status(500).json({ error: 'Failed to fetch devices data' });
    }

    // Extract all case serials from devices
    const deviceSerials = new Set();
    devicesData.data.data.forEach(device => {
      if (device.devices && device.devices.caseSerial) {
        deviceSerials.add(device.devices.caseSerial);
      }
    });

    console.log(`Found ${deviceSerials.size} device case serials`);

    // Edge Runtime doesn't support fs module, return error
    return res.status(501).json({
      error: 'DEX mapping search is not available in Edge Runtime (Cloudflare Pages)',
      note: 'This endpoint requires file system access which is not supported in serverless Edge Runtime',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Missing mappings search error:', error);
    res.status(500).json({
      error: 'Failed to find missing DEX mappings: ' + error.message
    });
  }
}