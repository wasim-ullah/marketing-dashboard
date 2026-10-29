/**
 * BuyAnyInsurance dashboard: send Bing (Microsoft Ads) spend to the marketing dashboard.
 *
 * Paste this into Microsoft Ads: Tools > Bulk actions > Scripts > Create script.
 * Fill in the two settings below, click Preview once to authorize, then Run,
 * and schedule it to run Hourly (or Daily if Hourly isn't offered).
 *
 * First run sends the last 90 days. After that each run re-sends the last 7 days,
 * because Microsoft can adjust spend for a few days afterwards (e.g. invalid clicks).
 */

// ===== Settings =====
var DASHBOARD_URL = 'https://YOUR-DASHBOARD-DOMAIN/api/bing-ingest';
var SECRET = 'PASTE-THE-SAME-VALUE-AS-BING_INGEST_SECRET-IN-VERCEL';
var TIMEZONE_OFFSET_HOURS = 4; // UAE time, used to work out "today"
var BACKFILL_DAYS = 90;
var REFRESH_DAYS = 7;
// ====================

function main() {
  var account = AdsApp.currentAccount();
  var status = send('GET');
  Logger.log('Dashboard has data from ' + status.coveredFrom + ' to ' + status.latest);

  var days = REFRESH_DAYS;
  if (!status.coveredFrom || status.coveredFrom > day(-(BACKFILL_DAYS - 1)).iso) {
    days = BACKFILL_DAYS;
    Logger.log('Sending the last ' + BACKFILL_DAYS + ' days (first run or gap)');
  }

  var rows = [];
  for (var i = days - 1; i >= 0; i--) {
    var d = day(-i);
    var seen = {};
    collect('campaigns', d, rows, seen);
    collect('performanceMaxCampaigns', d, rows, seen);
    collect('shoppingCampaigns', d, rows, seen);
  }

  var result = send('POST', {
    account: {
      id: account.getAccountId(),
      name: account.getName(),
      currency: account.getCurrencyCode()
    },
    from: day(-(days - 1)).iso,
    to: day(0).iso,
    rows: rows
  });
  Logger.log('Sent ' + rows.length + ' campaign-days. Dashboard now has ' + result.rows + ' rows, up to ' + result.latest);
}

var skipped = {};

function collect(type, d, rows, seen) {
  try {
    if (typeof AdsApp[type] !== 'function') return;
    var it = AdsApp[type]().forDateRange(d.compact, d.compact).withCondition('Impressions > 0').get();
    while (it.hasNext()) {
      var c = it.next();
      var id = String(c.getId());
      if (seen[id]) continue;
      seen[id] = true;
      var s = c.getStats();
      rows.push({
        date: d.iso,
        campaignId: id,
        campaign: c.getName(),
        spend: s.getCost(),
        clicks: s.getClicks(),
        impressions: s.getImpressions(),
        conversions: s.getConversions()
      });
    }
  } catch (e) {
    if (!skipped[type]) Logger.log('Skipped ' + type + ' (not used in this account?): ' + e);
    skipped[type] = true;
  }
}

// Date offsetDays from today (account time zone), as YYYYMMDD and YYYY-MM-DD
function day(offsetDays) {
  var t = new Date(Date.now() + TIMEZONE_OFFSET_HOURS * 3600000 + offsetDays * 86400000);
  var y = t.getUTCFullYear();
  var m = ('0' + (t.getUTCMonth() + 1)).slice(-2);
  var dd = ('0' + t.getUTCDate()).slice(-2);
  return { compact: '' + y + m + dd, iso: y + '-' + m + '-' + dd };
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
