/**
 * Netlify Function: Huawei Health Kit OAuth.
 *
 * Two roles in one function (distinguished by the `mode` query param):
 *   ?mode=authorize  → redirect to Huawei consent screen
 *   ?mode=callback   → receive the code, exchange for tokens, store in Supabase
 *
 * Uses the Supabase service_role key (server-side only) to store tokens.
 */

const AUTH_BASE = 'https://oauth-login.cloud.huawei.com/oauth2/v3';

// Default health scopes. Override via HUAWEI_SCOPES env (space-separated).
const DEFAULT_SCOPES = [
  'https://www.huawei.com/auth/healthkit.sleep.read',
  'https://www.huawei.com/auth/healthkit.step.read',
  'https://www.huawei.com/auth/healthkit.heartrate.read',
  'https://www.huawei.com/auth/healthkit.calorie.read',
  'https://www.huawei.com/auth/healthkit.spo2.read'
].join(' ');

const getScopes = () => process.env.HUAWEI_SCOPES || DEFAULT_SCOPES;

async function supabaseFetch(path, options) {
  const url = `${process.env.SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    }
  });
  return res;
}

async function storeTokens(userId, json) {
  const body = {
    user_id: userId,
    access_token: json.access_token,
    refresh_token: json.refresh_token || null,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    updated_at: new Date().toISOString()
  };

  await supabaseFetch(`/huawei_tokens?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });

  // Mark the profile as connected so the frontend can show the right state.
  await supabaseFetch(`/profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ huawei_connected: true })
  });
}

exports.handler = async (event) => {
  const { mode, state, code } = event.queryStringParameters || {};
  const clientId = process.env.HUAWEI_CLIENT_ID;
  const redirectUri = process.env.HUAWEI_REDIRECT_URI;

  // ---------- AUTHORIZE ----------
  if (mode === 'authorize') {
    if (!clientId || !redirectUri) {
      return {
        statusCode: 500,
        body: 'HUAWEI_CLIENT_ID or HUAWEI_REDIRECT_URI missing in Netlify env vars.'
      };
    }

    const userId = state || ''; // we pass the Supabase user id in `state`
    const authorizeUrl =
      `${AUTH_BASE}/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(getScopes())}` +
      `&state=${encodeURIComponent(userId)}`;

    return {
      statusCode: 302,
      headers: { Location: authorizeUrl },
      body: ''
    };
  }

  // ---------- CALLBACK ----------
  if (mode === 'callback') {
    const userId = state; // our Supabase user id carried through the round trip

    if (!userId) {
      return {
        statusCode: 400,
        body: 'Missing state (Supabase user id) in OAuth callback.'
      };
    }

    if (!code) {
      // User declined or errored — redirect back without connecting.
      return {
        statusCode: 302,
        headers: { Location: '/?huawei=denied' },
        body: ''
      };
    }

    try {
      const tokenRes = await fetch(`${AUTH_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: process.env.HUAWEI_CLIENT_SECRET || '',
          redirect_uri: redirectUri
        })
      });

      const json = await tokenRes.json();
      if (!json.access_token) {
        console.error('[Huawei] token exchange failed:', json);
        return {
          statusCode: 302,
          headers: { Location: '/?huawei=error' },
          body: ''
        };
      }

      await storeTokens(userId, json);

      return {
        statusCode: 302,
        headers: { Location: '/?huawei=connected' },
        body: ''
      };
    } catch (err) {
      console.error('[Huawei] callback error:', err.message);
      return {
        statusCode: 302,
        headers: { Location: '/?huawei=error' },
        body: ''
      };
    }
  }

  return { statusCode: 400, body: 'Unknown mode. Use ?mode=authorize or ?mode=callback' };
};
