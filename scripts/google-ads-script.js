/**
 * BuyAnyInsurance dashboard: send Google Ads spend to the marketing dashboard.
 *
 * Paste this into Google Ads: Tools > Bulk actions > Scripts > + (new script).
 * Use it in the ad account itself (not a manager/MCC account).
 * Fill in the two settings below, click Authorize, then Preview or Run once,
 * and set the frequency to Hourly.
 *
 * First run sends the last 90 days. After that each run re-sends the last 7 days,
 * because Google can adjust spend for a few days afterwards (e.g. invalid clicks).
 */

// ===== Settings =====
var DASHBOARD_URL = 'https://marketing-dashboard-phi-seven.vercel.app/api/google-ingest';
var SECRET = 'PASTE-THE-SAME-VALUE-AS-BING_INGEST_SECRET-IN-VERCEL';
var BACKFILL_DAYS = 90;
var REFRESH_DAYS = 7;
// ====================

function main() {
  var account = AdsApp.currentAccount();
  var timeZone = account.getTimeZone();
  var status = send('get');
  Logger.log('Dashboard has data from ' + status.coveredFrom + ' to ' + status.latest);

  var days = REFRESH_DAYS;
  if (!status.coveredFrom || status.coveredFrom > dayIso(-(BACKFILL_DAYS - 1), timeZone)) {
    days = BACKFILL_DAYS;
    Logger.log('Sending the last ' + BACKFILL_DAYS + ' days (first run or gap)');
  }
  var from = dayIso(-(days - 1), timeZone);
  var to = dayIso(0, timeZone);

  // One query covers every campaign type, including Performance Max
  var query =
    'SELECT segments.date, campaign.id, campaign.name, ' +
    'metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions ' +
    'FROM campaign ' +
    "WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' " +
    'AND metrics.impressions > 0';

  var rows = [];
  var it = AdsApp.search(query);
  while (it.hasNext()) {
    var r = it.next();
    rows.push({
      date: r.segments.date,
      campaignId: String(r.campaign.id),
      campaign: r.campaign.name,
      spend: Number(r.metrics.costMicros || 0) / 1000000,
      clicks: Number(r.metrics.clicks || 0),
      impressions: Number(r.metrics.impressions || 0),
      conversions: Number(r.metrics.conversions || 0)
    });
  }

  var result = send('post', {
    account: {
      id: account.getCustomerId(),
      name: account.getName(),
      currency: account.getCurrencyCode()
    },
    from: from,
    to: to,
    rows: rows
  });
  Logger.log('Sent ' + rows.length + ' campaign-days. Dashboard now has ' + result.rows + ' rows, up to ' + result.latest);
}

// Date offsetDays from today in the account's time zone, as YYYY-MM-DD
function dayIso(offsetDays, timeZone) {
  return Utilities.formatDate(new Date(Date.now() + offsetDays * 86400000), timeZone, 'yyyy-MM-dd');
}

function send(method, payload) {
  var params = {
    method: method,
    headers: { 'X-Ingest-Secret': SECRET },
    muteHttpExceptions: true
  };
  if (payload) {
    params.contentType = 'application/json';
    params.payload = JSON.stringify(payload);
  }
  var response = UrlFetchApp.fetch(DASHBOARD_URL, params);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code !== 200) throw new Error('Dashboard returned ' + code + ': ' + text);
  return JSON.parse(text);
}
