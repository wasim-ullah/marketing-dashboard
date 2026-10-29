/**
 * Storage for Bing Ads data pushed by the Microsoft Ads script.
 * Uses Vercel Blob (needs BLOB_READ_WRITE_TOKEN, added automatically when a Blob
 * store is connected to the project). The file name is derived from
 * BING_INGEST_SECRET so it can't be guessed even if the store is public.
 */
const crypto = require('crypto');
const { put, get } = require('@vercel/blob');

let knownAccess = null; // 'private' or 'public', learned on first success

function storePath() {
  const hash = crypto.createHash('sha256').update(process.env.BING_INGEST_SECRET || '').digest('hex').slice(0, 32);
  return `bing-ads/${hash}.json`;
}

async function readStore() {
  const order = knownAccess ? [knownAccess] : ['private', 'public'];
  let lastError = null;
  let cleanMiss = false;
  for (const access of order) {
    try {
      const result = await get(storePath(), { access, useCache: false });
      if (!result || result.statusCode !== 200) { cleanMiss = true; continue; }
      knownAccess = access;
      return JSON.parse(await new Response(result.stream).text());
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError && !cleanMiss) console.warn('[Bing store] read failed:', lastError.message);
  return null;
}

async function writeStore(data) {
  const body = JSON.stringify(data);
  const order = knownAccess ? [knownAccess] : ['private', 'public'];
  let lastError = null;
  for (const access of order) {
    try {
      await put(storePath(), body, {
        access,
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      });
      knownAccess = access;
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

module.exports = { readStore, writeStore };
