/**
 * Netlify Function: fetch Huawei health data for a user.
 *
 * DEMO MODE (default): returns realistic sample data for every tile.
 * LIVE MODE (HUAWEI_DEMO_MODE=false): reads tokens from Supabase and
 * calls the Huawei Health Kit REST API.
 *
 * Query params: ?userId=<supabase-user-id>
 */

const HEALTH_API = 'https://health-api.cloud.huawei.com';

// ============ DEMO DATA ============
const DEMO = {
  connected: true,
  source: 'demo',
  date: new Date().toISOString().slice(0, 10),
  sleep: {
    totalMinutes: 452,
    stages: {
      deep: { minutes: 105, label: 'Deep' },
      rem: { minutes: 98, label: 'REM' },
      light: { minutes: 249, label: 'Light' },
      awake: { minutes: 14, label: 'Awake' }
    },
    restingHeartRate: 58
  },
  steps: 8942,
  calories: 2387,
  heartRate: { avg: 62, min: 48, max: 118 },
  spo2: { avg: 97 },
  note: 'Demo data — connect a real Huawei account for live telemetry.'
};

// ============ HELPERS ============

async function supabaseGetTokens(userId) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/huawei_tokens?user_id=eq.${userId}&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

async function refreshToken(row) {
  const res = await fetch('https://oauth-login.cloud.huawei.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      client_id: process.env.HUAWEI_CLIENT_ID,
      client_secret: process.env.HUAWEI_CLIENT_SECRET || ''
    })
  });

  const json = await res.json();
  if (!json.access_token) throw new Error('Refresh token failed');

  // Persist refreshed tokens (keep it simple — PATCH the row).
  const url = `${process.env.SUPABASE_URL}/rest/v1/huawei_tokens?user_id=eq.${row.user_id}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      access_token: json.access_token,
      refresh_token: json.refresh_token || row.refresh_token,
      expires_at: Date.now() + (json.expires_in || 3600) * 1000
    })
  });

  return json.access_token;
}

/**
 * Query one Huawei data type for today (nanosecond timestamps).
 */
async function fetchDataType(accessToken, dataType, startNs, endNs) {
  const res = await fetch(`${HEALTH_API}/healthkit/v1/dataCollectors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ dataType, startTime: startNs, endTime: endNs })
  });

  if (!res.ok) return [];
  const json = await res.json();
  return json.healthRecords || [];
}

// ============ AGGREGATORS ============

function aggregateSleep(records) {
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
    }
  };
}

function sumRecords(records) {
  return Math.round(records.reduce((acc, r) => {
    const v = Number(r.value ?? r.field?.value ?? 0);
    return acc + (isNaN(v) ? 0 : v);
  }, 0));
}

function avgRecords(records) {
  const vals = records
    .map((r) => Number(r.value ?? r.field?.value ?? r.field?.heartRate ?? r.field?.spo2))
    .filter((v) => !isNaN(v) && v > 0);

  if (!vals.length) return { avg: null, min: null, max: null };
  return {
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min: Math.min(...vals),
    max: Math.max(...vals)
  };
}

// ============ LIVE FETCH ============

async function getLiveData(userId) {
  const row = await supabaseGetTokens(userId);
  if (!row || !row.refresh_token && !row.access_token) {
    return { connected: false, note: 'No Huawei account linked yet.' };
  }

  let accessToken = row.access_token;
  if (!accessToken || (row.expires_at && row.expires_at < Date.now() + 60_000)) {
    try {
      accessToken = await refreshToken(row);
    } catch {
      return { connected: false, note: 'Huawei token expired — reconnect.' };
    }
  }

  const now = Date.now();
  const startNs = (now - 26 * 60 * 60 * 1000) * 1_000_000;
  const endNs = now * 1_000_000;

  const [sleepRecs, stepsRecs, calRecs, hrRecs, spo2Recs] = await Promise.all([
    fetchDataType(accessToken, 'DT_CONTINUOUS_SLEEP', startNs, endNs),
    fetchDataType(accessToken, 'DT_CONTINUOUS_STEPS_DELTA', startNs, endNs),
    fetchDataType(accessToken, 'DT_CONTINUOUS_CALORIES_BURNT', startNs, endNs),
    fetchDataType(accessToken, 'DT_INSTANTANEOUS_HEART_RATE', startNs, endNs),
    fetchDataType(accessToken, 'DT_INSTANTANEOUS_SPO2', startNs, endNs)
  ]);

  const sleep = aggregateSleep(sleepRecs);
  const hr = avgRecords(hrRecs);
  const spo2 = avgRecords(spo2Recs);

  return {
    connected: true,
    source: 'live',
    date: new Date().toISOString().slice(0, 10),
    sleep: { ...sleep, restingHeartRate: hr.avg || null },
    steps: sumRecords(stepsRecs) || null,
    calories: sumRecords(calRecs) || null,
    heartRate: hr,
    spo2: { avg: spo2.avg },
    note: hr.avg ? null : 'Partial data — some metrics returned empty.'
  };
}

// ============ HANDLER ============

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const userId = event.queryStringParameters?.userId || '';

  if (process.env.HUAWEI_DEMO_MODE !== 'false') {
    return { statusCode: 200, headers, body: JSON.stringify(DEMO) };
  }

  if (!userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ connected: false, note: 'Missing user id.' }) };
  }

  try {
    const data = await getLiveData(userId);
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('[Huawei] data fetch error:', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ connected: false, note: err.message }) };
  }
};
