/**
 * Huawei Health Kit integration layer.
 * DEMO MODE (default): realistic sample sleep telemetry.
 * REAL MODE: exchanges tokens and calls the Huawei Health Kit REST API.
 *
 * Sleep status codes: 1=Light, 2=REM, 3=Deep, 4=Awake, 5=Nap
 */

const DEMO_SLEEP = {
  connected: true,
  source: 'demo',
  date: new Date().toISOString().slice(0, 10),
  totalMinutes: 452,
  stages: {
    deep: { minutes: 105, label: 'Deep' },
    rem: { minutes: 98, label: 'REM' },
    light: { minutes: 249, label: 'Light' },
    awake: { minutes: 14, label: 'Awake' }
  },
  restingHeartRate: 58,
  note: 'Demo data — connect a real Huawei account for live telemetry.'
};

const tokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 };

function isDemoMode() {
  return process.env.HUAWEI_DEMO_MODE !== 'false';
}

async function getSleepSummary() {
  if (isDemoMode()) return DEMO_SLEEP;

  await ensureAccessToken();
  const now = Date.now();
  const startNs = (now - 26 * 60 * 60 * 1000) * 1_000_000;
  const endNs = now * 1_000_000;

  const res = await fetch(
    `${process.env.HUAWEI_API_BASE || 'https://health-api.cloud.huawei.com'}/healthkit/v1/dataCollectors`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCache.accessToken}` },
      body: JSON.stringify({ dataType: 'DT_CONTINUOUS_SLEEP', startTime: startNs, endTime: endNs })
    }
  );

  const json = await res.json();

  if (!json || !Array.isArray(json.healthRecords) || json.healthRecords.length === 0) {
    return {
      connected: true, source: 'live', date: new Date().toISOString().slice(0, 10),
      totalMinutes: 0,
      stages: { deep: { minutes: 0 }, rem: { minutes: 0 }, light: { minutes: 0 }, awake: { minutes: 0 } },
      restingHeartRate: null,
      note: 'No sleep data returned by Huawei for this window.'
    };
  }

  const summary = aggregateSleepSegments(json.healthRecords);
  summary.connected = true;
  summary.source = 'live';
  summary.date = new Date().toISOString().slice(0, 10);
  return summary;
}

function aggregateSleepSegments(records) {
  const stageMap = { 1: 'light', 2: 'rem', 3: 'deep', 4: 'awake', 5: 'awake' };
  const minutesByStage = { deep: 0, rem: 0, light: 0, awake: 0 };
  let totalMinutes = 0;

  for (const rec of records) {
    const code = rec.field?.sleepStatus || rec.sleepStatus || rec.value;
    const start = Number(rec.startTime || rec.start_time || 0);
    const end = Number(rec.endTime || rec.end_time || 0);
    const mins = Math.max(0, (end - start) / 1_000_000_000 / 60);
    const stage = stageMap[code] || 'awake';
    minutesByStage[stage] += Math.round(mins);
    totalMinutes += Math.round(mins);
  }

  return {
    totalMinutes,
    stages: {
      deep: { minutes: minutesByStage.deep, label: 'Deep' },
      rem: { minutes: minutesByStage.rem, label: 'REM' },
      light: { minutes: minutesByStage.light, label: 'Light' },
      awake: { minutes: minutesByStage.awake, label: 'Awake' }
    },
    restingHeartRate: null
  };
}

async function ensureAccessToken() {
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.accessToken;

  const body = tokenCache.refreshToken
    ? { grant_type: 'refresh_token', refresh_token: tokenCache.refreshToken, client_id: process.env.HUAWEI_CLIENT_ID, client_secret: process.env.HUAWEI_CLIENT_SECRET }
    : { grant_type: 'authorization_code', code: tokenCache.authCode, client_id: process.env.HUAWEI_CLIENT_ID, client_secret: process.env.HUAWEI_CLIENT_SECRET, redirect_uri: process.env.HUAWEI_REDIRECT_URI };

  const res = await fetch('https://oauth-login.cloud.huawei.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });

  const json = await res.json();
  tokenCache.accessToken = json.access_token;
  tokenCache.refreshToken = json.refresh_token || tokenCache.refreshToken;
  tokenCache.expiresAt = Date.now() + (json.expires_in || 3600) * 1000;
  return tokenCache.accessToken;
}

async function getStatus() {
  if (isDemoMode()) return { connected: true, mode: 'demo', label: 'Demo Mode' };
  return { connected: Boolean(tokenCache.accessToken || process.env.HUAWEI_CLIENT_ID), mode: 'live', label: 'Live' };
}

module.exports = { getSleepSummary, getStatus, isDemoMode };
