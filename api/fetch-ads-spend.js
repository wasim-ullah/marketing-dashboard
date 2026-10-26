/**
 * Vercel Serverless Function: Fetch ads spend from Facebook Ads, Google Ads & Microsoft Bing Ads
 * Environment variables needed:
 * - FACEBOOK_ACCESS_TOKEN
 * - FACEBOOK_AD_ACCOUNT_ID
 */

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    // Fetch from all three sources in parallel
    const [facebookData, googleData, bingData] = await Promise.all([
      fetchFacebookAdsData(startDate, endDate),
      fetchGoogleAdsData(startDate, endDate),
      fetchBingAdsData(startDate, endDate),
    ]);

    // Combine and structure the data
    const combinedData = combineAdsData(facebookData, googleData, bingData);

    return res.status(200).json({
      status: 'success',
      data: combinedData,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Ads data fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch ads data',
      message: error.message,
    });
  }
}

/**
 * Fetch Facebook Ads data using Facebook Marketing API v18.0
 * Requires: FACEBOOK_ACCESS_TOKEN and FACEBOOK_AD_ACCOUNT_ID
 */
async function fetchFacebookAdsData(startDate, endDate) {
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!adAccountId || !accessToken) {
    console.warn('Missing Facebook API credentials (FACEBOOK_ACCESS_TOKEN or FACEBOOK_AD_ACCOUNT_ID)');
    return {
      source: 'facebook_ads',
      totalSpend: 0,
      bySource: {},
      error: 'Missing Facebook API credentials',
    };
  }

  try {
    // Ensure account ID has 'act_' prefix
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    // Format dates for Facebook API (YYYY-MM-DD)
    const url =
      `https://graph.facebook.com/v18.0/${formattedAccountId}/insights?` +
      `fields=campaign_name,campaign_id,spend,clicks,impressions,actions&` +
      `time_range={"since":"${startDate}","until":"${endDate}"}&` +
      `access_token=${accessToken}`;

    console.log(`[Facebook] Fetching ads data from ${startDate} to ${endDate}`);
    console.log(`[Facebook] Account ID: ${formattedAccountId}`);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMsg = data.error?.message || `HTTP ${response.status}`;
      console.error(`[Facebook] API error: ${errorMsg}`);
      throw new Error(`Facebook API error: ${errorMsg}`);
    }

    let totalSpend = 0;
    const bySource = {};

    // Parse response data
    if (data.data && Array.isArray(data.data)) {
      console.log(`[Facebook] Found ${data.data.length} records`);

      data.data.forEach((row) => {
        const spend = parseFloat(row.spend || 0);
        totalSpend += spend;

        const campaign = row.campaign_name || `Campaign ${row.campaign_id || 'Unknown'}`;
        if (!bySource[campaign]) {
          bySource[campaign] = {
            spend: 0,
            clicks: 0,
            impressions: 0,
            conversions: 0,
            campaignId: row.campaign_id,
          };
        }

        bySource[campaign].spend += spend;
        bySource[campaign].clicks += parseInt(row.clicks || 0);
        bySource[campaign].impressions += parseInt(row.impressions || 0);

        // Parse actions for conversions
        if (row.actions && Array.isArray(row.actions)) {
          const conversions = row.actions.find(
            (a) => a.action_type === 'omni_conversion' || a.action_type === 'purchase'
          );
          if (conversions) {
            bySource[campaign].conversions += parseInt(conversions.value || 0);
          }
        }
      });
    } else if (data.data && data.data.length === 0) {
      console.log('[Facebook] No data returned for this date range');
    }

    console.log(`[Facebook] Total spend: AED ${totalSpend.toFixed(2)}, Campaigns: ${Object.keys(bySource).length}`);

    return {
      source: 'facebook_ads',
      totalSpend: totalSpend,
      bySource: bySource,
    };
  } catch (error) {
    console.error('[Facebook] Ads API error:', error.message);
    return {
      source: 'facebook_ads',
      totalSpend: 0,
      bySource: {},
      error: error.message,
    };
  }
}

/**
 * Fetch Google Ads data
 * Placeholder for future implementation
 */
async function fetchGoogleAdsData(startDate, endDate) {
  try {
    console.log('[Google] Google Ads integration pending');
    // TODO: Implement Google Ads API integration
    // Requires: google-ads-api library and proper credentials

    return {
      source: 'google_ads',
      totalSpend: 0,
      bySource: {},
      error: 'Google Ads integration pending',
    };
  } catch (error) {
    console.error('[Google] Ads API error:', error);
    return {
      source: 'google_ads',
      totalSpend: 0,
      bySource: {},
      error: error.message,
    };
  }
}

/**
 * Fetch Microsoft Bing Ads data
 * Placeholder for future implementation
 */
async function fetchBingAdsData(startDate, endDate) {
  try {
    console.log('[Bing] Bing Ads integration pending');
    // TODO: Implement Bing Ads API integration
    // Requires: bingads-api library and proper credentials

    return {
      source: 'bing_ads',
      totalSpend: 0,
      bySource: {},
      error: 'Bing Ads integration pending',
    };
  } catch (error) {
    console.error('[Bing] Ads API error:', error);
    return {
      source: 'bing_ads',
      totalSpend: 0,
      bySource: {},
      error: error.message,
    };
  }
}

/**
 * Combine data from all three platforms
 */
function combineAdsData(facebookData, googleData, bingData) {
  const combinedSpend = {
    facebook: facebookData.totalSpend || 0,
    google: googleData.totalSpend || 0,
    bing: bingData.totalSpend || 0,
    total:
      (facebookData.totalSpend || 0) +
      (googleData.totalSpend || 0) +
      (bingData.totalSpend || 0),
  };

  const combinedBySource = {
    facebook_campaigns: facebookData.bySource || {},
    google_campaigns: googleData.bySource || {},
    bing_campaigns: bingData.bySource || {},
  };

  return {
    spend: combinedSpend,
    campaigns: combinedBySource,
    summary: {
      totalAdSpend: combinedSpend.total,
      facebookSpend: combinedSpend.facebook,
      googleSpend: combinedSpend.google,
      bingSpend: combinedSpend.bing,
      facebookPercentage:
        combinedSpend.total > 0
          ? ((combinedSpend.facebook / combinedSpend.total) * 100).toFixed(2)
          : 0,
      googlePercentage:
        combinedSpend.total > 0
          ? ((combinedSpend.google / combinedSpend.total) * 100).toFixed(2)
          : 0,
      bingPercentage:
        combinedSpend.total > 0
          ? ((combinedSpend.bing / combinedSpend.total) * 100).toFixed(2)
          : 0,
    },
    errors: {
      facebook: facebookData.error || null,
      google: googleData.error || null,
      bing: bingData.error || null,
    },
  };
}
