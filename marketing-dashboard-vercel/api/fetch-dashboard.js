export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { API_USERNAME, API_PASSWORD } = process.env;

  if (!API_USERNAME || !API_PASSWORD) {
    return res.status(500).json({ error: 'API credentials not configured' });
  }

  try {
    const { dateFrom, dateTo } = req.body;

    const response = await fetch('https://ext.buyanyinsurance.ae/api/marketing/dashboard', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dateFrom, dateTo })
    });

    const data = await response.json();
    
    // Pass through the status code and data
    res.status(response.status).json(data);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}