/**
 * One-time helper to connect Microsoft Advertising (Bing Ads).
 * Visit /api/bing-auth, sign in with the Microsoft account that has access to the
 * Bing Ads account, and copy the refresh token shown into the BING_REFRESH_TOKEN
 * environment variable in Vercel.
 *
 * Needs BING_CLIENT_ID and BING_CLIENT_SECRET set first, and the Azure app must list
 * https://<your-domain>/api/bing-auth as a Web redirect URI.
 */
module.exports = async function handler(req, res) {
  const { BING_CLIENT_ID, BING_CLIENT_SECRET } = process.env;
  const scope = 'https://ads.microsoft.com/msads.manage offline_access';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${req.headers.host}/api/bing-auth`;

  const page = (title, body) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#333;line-height:1.5}
textarea{width:100%;height:140px;font-family:monospace;font-size:12px}code{background:#f2f2f2;padding:2px 5px;border-radius:3px}
.err{background:#f8d7da;color:#721c24;padding:12px;border-radius:6px}</style></head><body><h1>${title}</h1>${body}</body></html>`);
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  if (!BING_CLIENT_ID || !BING_CLIENT_SECRET) {
    return page('Connect Microsoft Ads', `<p class="err">Set <code>BING_CLIENT_ID</code> and <code>BING_CLIENT_SECRET</code> in Vercel, redeploy, then open this page again.</p>
<p>Redirect URI to add to your Azure app (platform: Web):<br><code>${esc(redirectUri)}</code></p>`);
  }

  const { code, error, error_description } = req.query || {};

  if (error) {
    return page('Microsoft sign-in failed', `<p class="err">${esc(error)}: ${esc(error_description || '')}</p><p><a href="/api/bing-auth">Try again</a></p>`);
  }

  // Step 1: send the user to Microsoft to sign in and approve access
  if (!code) {
    const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + new URLSearchParams({
      client_id: BING_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope,
      prompt: 'select_account',
    });
    res.statusCode = 302;
    res.setHeader('Location', url);
    return res.end();
  }

  // Step 2: exchange the code for tokens and show the refresh token
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: BING_CLIENT_ID,
      client_secret: BING_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope,
    }),
  });
  const token = await tokenRes.json();

  if (!token.refresh_token) {
    return page('Could not get a token', `<p class="err">${esc(token.error_description || token.error || 'Unknown error')}</p><p><a href="/api/bing-auth">Try again</a></p>`);
  }

  return page('Microsoft Ads connected', `<p>Copy this value into a Vercel environment variable named <code>BING_REFRESH_TOKEN</code>, then redeploy. Treat it like a password and don't share it.</p>
<textarea readonly onclick="this.select()">${esc(token.refresh_token)}</textarea>
<p>After that you can close this page. If Bing data ever stops loading with a sign-in error, open this page again to get a fresh token.</p>`);
};
