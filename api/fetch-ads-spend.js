/**
 * Vercel Serverless Function: Fetch ads spend from Facebook Ads, Google Ads & Microsoft Bing Ads
 * Environment variables needed:
 * - FACEBOOK_ACCESS_TOKEN
 * - FACEBOOK_AD_ACCOUNT_ID
 * - BING_CLIENT_ID, BING_CLIENT_SECRET, BING_REFRESH_TOKEN (get it from /api/bing-auth)
 * - BING_DEVELOPER_TOKEN, BING_CUSTOMER_ID, BING_ACCOUNT_ID
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
  const USD_TO_AED = 3.67; // Fixed exchange rate

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

    // Look up the account's own name and billing currency
    const accountRes = await fetch(
      `https://graph.facebook.com/v18.0/${formattedAccountId}?fields=name,currency&access_token=${accessToken}`
    );
    const account = await accountRes.json();
    if (account.error) throw new Error(`Facebook API error: ${account.error.message}`);
    const currency = account.currency || 'USD';
    // Only convert when the account is billed in USD; AED accounts are used as-is
    const rate = currency === 'AED' ? 1 : currency === 'USD' ? USD_TO_AED : null;
    if (rate === null) throw new Error(`Ad account currency ${currency} is not supported (expected AED or USD)`);

    const timeRange = encodeURIComponent(JSON.stringify({ since: startDate, until: endDate }));
    let url =
      `https://graph.facebook.com/v18.0/${formattedAccountId}/insights?` +
      `level=campaign&limit=500&` +
      `fields=campaign_name,campaign_id,spend,clicks,impressions,actions&` +
      `time_range=${timeRange}&` +
      `access_token=${accessToken}`;

    console.log(`[Facebook] ${account.name} (${formattedAccountId}), currency ${currency}, ${startDate} to ${endDate}`);

    // Follow pagination so no campaigns are missed
    const data = { data: [] };
    while (url) {
      const response = await fetch(url);
      const page = await response.json();
      if (!response.ok || page.error) {
        const errorMsg = page.error?.message || `HTTP ${response.status}`;
        console.error(`[Facebook] API error: ${errorMsg}`);
        throw new Error(`Facebook API error: ${errorMsg}`);
      }
      data.data.push(...(page.data || []));
      url = page.paging?.next || null;
    }

    let totalSpend = 0;
    const bySource = {};

    // Parse response data
    if (data.data && Array.isArray(data.data)) {
      console.log(`[Facebook] Found ${data.data.length} records`);

      data.data.forEach((row) => {
        // Convert to AED only if the account is billed in USD
        const spendAED = parseFloat(row.spend || 0) * rate;
        totalSpend += spendAED;

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

        bySource[campaign].spend += spendAED;
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
      account: { id: formattedAccountId, name: account.name, currency },
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
  // Preferred route: data pushed hourly by the Microsoft Ads script (no Azure needed)
  if (process.env.BING_INGEST_SECRET) return fetchBingViaScript(startDate, endDate);
  // Alternative route: Microsoft Advertising API (needs an Azure app + refresh token)
  return fetchBingViaApi(startDate, endDate);
}

async function fetchBingViaScript(startDate, endDate) {
  const USD_TO_AED = 3.67;
  try {
    const { readStore } = require('../lib/bing-store');
    const store = await readStore();
    if (!store || !store.rows || store.rows.length === 0) {
      return { source: 'bing_ads', totalSpend: 0, bySource: {}, error: 'Waiting for the first data from the Microsoft Ads script. Run the script once in Microsoft Ads.' };
    }

    const currency = store.account?.currency || 'AED';
    if (currency !== 'AED' && currency !== 'USD') {
      throw new Error(`Bing account currency ${currency} is not supported (expected AED or USD)`);
    }
    const rate = currency === 'USD' ? USD_TO_AED : 1;

    let totalSpend = 0;
    const bySource = {};
    for (const r of store.rows) {
      if (r.date < startDate || r.date > endDate) continue;
      const name = r.campaign || `Campaign ${r.campaignId}`;
      bySource[name] = bySource[name] || { spend: 0, clicks: 0, impressions: 0, conversions: 0, campaignId: r.campaignId };
      const spend = r.spend * rate;
      bySource[name].spend += spend;
      bySource[name].clicks += r.clicks;
      bySource[name].impressions += r.impressions;
      bySource[name].conversions += r.conversions;
      totalSpend += spend;
    }

    const dates = store.rows.map((r) => r.date).sort();
    let note = null;
    if (startDate < dates[0]) note = `Bing data only goes back to ${dates[0]}`;

    return {
      source: 'bing_ads',
      totalSpend,
      bySource,
      account: { ...(store.account || {}), currency, updatedAt: store.updatedAt, note },
    };
  } catch (error) {
    console.error('[Bing] Script data error:', error.message);
    return { source: 'bing_ads', totalSpend: 0, bySource: {}, error: error.message };
  }
}

async function fetchBingViaApi(startDate, endDate) {
  const {
    BING_CLIENT_ID, BING_CLIENT_SECRET, BING_REFRESH_TOKEN,
    BING_DEVELOPER_TOKEN, BING_CUSTOMER_ID, BING_ACCOUNT_ID,
  } = process.env;
  const USD_TO_AED = 3.67;

  if (!BING_CLIENT_ID || !BING_REFRESH_TOKEN || !BING_DEVELOPER_TOKEN || !BING_CUSTOMER_ID || !BING_ACCOUNT_ID) {
    return { source: 'bing_ads', totalSpend: 0, bySource: {}, error: 'Bing Ads not connected yet (missing BING_* environment variables)' };
  }

  try {
    // 1. Swap the long-lived refresh token for a short-lived access token
    const tokenBody = new URLSearchParams({
      client_id: BING_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: BING_REFRESH_TOKEN,
      scope: 'https://ads.microsoft.com/msads.manage offline_access',
    });
    if (BING_CLIENT_SECRET) tokenBody.set('client_secret', BING_CLIENT_SECRET);
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    const token = await tokenRes.json();
    if (!token.access_token) {
      throw new Error(`Microsoft sign-in failed: ${token.error_description || token.error || tokenRes.status}. Re-run /api/bing-auth to get a new refresh token.`);
    }

    const headers = {
      'Authorization': `Bearer ${token.access_token}`,
      'DeveloperToken': BING_DEVELOPER_TOKEN,
      'CustomerId': String(BING_CUSTOMER_ID),
      'CustomerAccountId': String(BING_ACCOUNT_ID),
      'Content-Type': 'application/json',
    };
    const base = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport';
    const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return { Year: y, Month: m, Day: d }; };

    // 2. Ask Microsoft to build a campaign performance report for the date range
    const submitRes = await fetch(`${base}/Submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ReportRequest: {
          Type: 'CampaignPerformanceReportRequest',
          ReportName: 'Dashboard campaign spend',
          Format: 'Csv',
          FormatVersion: '2.0',
          ReturnOnlyCompleteData: false,
          ExcludeReportHeader: true,
          ExcludeReportFooter: true,
          ExcludeColumnHeaders: false,
          Aggregation: 'Summary',
          Columns: ['AccountName', 'CampaignId', 'CampaignName', 'CurrencyCode', 'Spend', 'Clicks', 'Impressions', 'Conversions'],
          Scope: { AccountIds: [Number(BING_ACCOUNT_ID)] },
          Time: {
            CustomDateRangeStart: toDate(startDate),
            CustomDateRangeEnd: toDate(endDate),
            ReportTimeZone: 'AbuDhabiMuscat',
          },
        },
      }),
    });
    const submit = await submitRes.json();
    if (!submitRes.ok || !submit.ReportRequestId) {
      throw new Error(`Bing report request failed: ${bingErrorText(submit) || submitRes.status}`);
    }

    // 3. Wait for the report to be ready (usually a few seconds)
    let downloadUrl = null;
    const deadline = Date.now() + 45000;
    while (true) {
      const pollRes = await fetch(`${base}/Poll`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ReportRequestId: submit.ReportRequestId }),
      });
      const poll = await pollRes.json();
      const status = poll.ReportRequestStatus?.Status;
      if (!pollRes.ok || status === 'Error') throw new Error(`Bing report failed: ${bingErrorText(poll) || status}`);
      if (status === 'Success') { downloadUrl = poll.ReportRequestStatus.ReportDownloadUrl; break; }
      if (Date.now() > deadline) throw new Error('Bing report took too long to generate, try again');
      await new Promise((r) => setTimeout(r, 1500));
    }

    // No URL means no activity in this date range
    if (!downloadUrl) {
      console.log('[Bing] No data for this date range');
      return { source: 'bing_ads', totalSpend: 0, bySource: {} };
    }

    // 4. Download the zipped CSV and add up spend per campaign
    const zipBuf = Buffer.from(await (await fetch(downloadUrl)).arrayBuffer());
    const rows = parseCsv(unzipFirstFile(zipBuf).replace(/^﻿/, ''));
    const [header, ...records] = rows;
    const col = (name) => header.indexOf(name);

    let totalSpend = 0;
    let accountName = null;
    let currency = null;
    const bySource = {};
    for (const r of records) {
      if (r.length < header.length) continue;
      currency = r[col('CurrencyCode')] || currency;
      accountName = r[col('AccountName')] || accountName;
      const rate = currency === 'USD' ? USD_TO_AED : 1;
      const num = (v) => parseFloat(String(v || '0').replace(/,/g, '')) || 0;
      const spend = num(r[col('Spend')]) * rate;
      const name = r[col('CampaignName')] || `Campaign ${r[col('CampaignId')]}`;
      bySource[name] = bySource[name] || { spend: 0, clicks: 0, impressions: 0, conversions: 0, campaignId: r[col('CampaignId')] };
      bySource[name].spend += spend;
      bySource[name].clicks += num(r[col('Clicks')]);
      bySource[name].impressions += num(r[col('Impressions')]);
      bySource[name].conversions += num(r[col('Conversions')]);
      totalSpend += spend;
    }
    if (currency && currency !== 'AED' && currency !== 'USD') {
      throw new Error(`Bing account currency ${currency} is not supported (expected AED or USD)`);
    }

    console.log(`[Bing] ${accountName} (${BING_ACCOUNT_ID}), ${currency}, total AED ${totalSpend.toFixed(2)}, campaigns ${Object.keys(bySource).length}`);
    return {
      source: 'bing_ads',
      totalSpend,
      bySource,
      account: { id: String(BING_ACCOUNT_ID), name: accountName, currency },
    };
  } catch (error) {
    console.error('[Bing] Ads API error:', error.message);
    return { source: 'bing_ads', totalSpend: 0, bySource: {}, error: error.message };
  }
}

function bingErrorText(body) {
  if (!body) return '';
  const errs = body.OperationErrors || body.Errors || body.BatchErrors;
  if (Array.isArray(errs) && errs.length) return errs.map((e) => e.Message || e.ErrorCode).join('; ');
  return body.Message || body.message || '';
}

// Extract the first file from a zip buffer (Microsoft reports are a single zipped CSV)
function unzipFirstFile(buf) {
  const zlib = require('zlib');
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return buf.toString('utf8'); // not zipped
  const cd = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const local = buf.readUInt32LE(cd + 42);
  const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(dataStart, dataStart + compSize);
  return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
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
    facebookAccount: facebookData.account || null,
    bingAccount: bingData.account || null,
    errors: {
      facebook: facebookData.error || null,
      google: googleData.error || null,
      bing: bingData.error || null,
    },
  };
}
