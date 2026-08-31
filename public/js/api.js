/**
 * API helper that routes to the right backend depending on where
 * the app is hosted:
 *  - localhost  → the Express server (/api/...)
 *  - Netlify    → Netlify Functions (/.netlify/functions/...)
 */

const IS_LOCAL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const API_BASE = IS_LOCAL ? '/api' : '/.netlify/functions';

// Expose for other modules (e.g., huaweiCard).
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

function nutritionSearchUrl() {
  return `${API_BASE}/nutrition-search`;
}

async function searchNutrition(query) {
  // On Netlify the function reads USDA_API_KEY from env vars (no key in browser).
  const data = await apiPost(nutritionSearchUrl(), { query });
  return data.hits || [];
}
