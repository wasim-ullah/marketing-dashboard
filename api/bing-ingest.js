/**
 * Receives daily campaign stats from the Microsoft Ads script (scripts/microsoft-ads-script.js).
 *   GET  -> what's already stored, so the script knows whether to backfill
 *   POST -> { account: {id, name, currency}, from, to, rows: [{date, campaignId, campaign, spend, clicks, impressions, conversions}] }
 * Requires header X-Ingest-Secret matching the BING_INGEST_SECRET environment variable.
 */
const crypto = require('crypto');
const { readStore, writeStore } = require('../lib/bing-store');

const KEEP_DAYS = 400;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function secretOk(given) {
  const expected = process.env.BING_INGEST_SECRET || '';
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function summary(store) {
  const dates = (store?.rows || []).map((r) => r.date).sort();
  return {
    earliest: dates[0] || null,
    latest: dates[dates.length - 1] || null,
    rows: dates.length,
    coveredFrom: store?.coveredFrom || null,
    updatedAt: store?.updatedAt || null,
  };
}

module.exports = async function handler(req, res) {
  if (!process.env.BING_INGEST_SECRET) {
    return res.status(500).json({ error: 'BING_INGEST_SECRET is not set in Vercel' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return res.status(500).json({ error: 'No Vercel Blob store connected to this project' });
  }
  if (!secretOk(req.headers['x-ingest-secret'])) {
    return res.status(401).json({ error: 'Wrong or missing secret' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(summary(await readStore()));
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { account, from, to, rows } = body;
    if (!isDate(from) || !isDate(to) || from > to || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Expected from, to (YYYY-MM-DD) and rows[]' });
    }

    const clean = [];
    for (const r of rows) {
      if (!isDate(r.date) || r.date < from || r.date > to) continue;
      clean.push({
        date: r.date,
        campaignId: String(r.campaignId || ''),
        campaign: String(r.campaign || `Campaign ${r.campaignId}`),
        spend: Number(r.spend) || 0,
        clicks: Number(r.clicks) || 0,
        impressions: Number(r.impressions) || 0,
        conversions: Number(r.conversions) || 0,
      });
    }

    // Replace everything in [from, to] with the fresh numbers, keep older days
    const existing = (await readStore()) || { rows: [] };
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    const kept = (existing.rows || []).filter((r) => (r.date < from || r.date > to) && r.date >= cutoff);

    const store = {
      account: account ? { id: String(account.id || ''), name: account.name || null, currency: account.currency || null } : existing.account || null,
      updatedAt: new Date().toISOString(),
      coveredFrom: existing.coveredFrom && existing.coveredFrom < from ? (existing.coveredFrom < cutoff ? cutoff : existing.coveredFrom) : from,
      rows: kept.concat(clean).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    };
    await writeStore(store);

    console.log(`[Bing ingest] ${store.account?.name} ${from}..${to}: ${clean.length} rows, ${store.rows.length} stored`);
    return res.status(200).json({ ok: true, received: clean.length, ...summary(store) });
  } catch (error) {
    console.error('[Bing ingest] error:', error);
    return res.status(500).json({ error: error.message });
  }
};
