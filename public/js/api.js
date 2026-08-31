/**
 * API helpers that route correctly on BOTH local and Netlify.
 *
 * Local:   Express server at /api/nutrition/search
 * Netlify: Function at /.netlify/functions/nutrition-search
 */

const IS_LOCAL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

// Expose so other modules (huawei.js) know where we are.
window.IS_LOCAL = IS_LOCAL;

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`);
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(`POST ${url} failed (${res.status})`);
  return res.json();
}

async function searchNutrition(query) {
  // Correct paths for each environment.
  const url = IS_LOCAL
    ? '/api/nutrition/search'               // Express route (slash)
    : '/.netlify/functions/nutrition-search'; // Netlify function (hyphen)

  const data = await apiPost(url, { query });
  return data.hits || [];
}
