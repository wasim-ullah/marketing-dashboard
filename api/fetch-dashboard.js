module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { API_USERNAME, API_PASSWORD } = process.env;

  if (!API_USERNAME || !API_PASSWORD) {
    return res.status(500).json({ 
      success: false, 
      message: 'API credentials not configured in backend' 
    });
  }

  try {
    const { dateFrom, dateTo } = req.body;

    // Validate inputs
    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: dateFrom, dateTo'
      });
    }

    console.log('[KPI] Fetching data from', dateFrom, 'to', dateTo);
    console.log('[KPI] API Username:', API_USERNAME ? 'Set' : 'Missing');
    console.log('[KPI] API Password:', API_PASSWORD ? 'Set' : 'Missing');

    // Call BuyAnyInsurance API with stored credentials
    const response = await fetch('https://ext.buyanyinsurance.ae/api/marketing/dashboard', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_date: dateFrom,
        end_date: dateTo
      })
    });

    console.log('[KPI] API Response Status:', response.status);

    const data = await response.json();

    console.log('[KPI] API Response:', JSON.stringify(data).substring(0, 200));

    // Pass through the status code and data from BuyAnyInsurance API
    res.status(response.status).json(data);

  } catch (error) {
    console.error('[KPI] API Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
