const IS_LOCAL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

window.IS_LOCAL = IS_LOCAL;

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('GET ' + url + ' failed (' + res.status + ')');
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error('POST ' + url + ' failed (' + res.status + ')');
  return res.json();
}

async function searchNutrition(query) {
  const url = IS_LOCAL
    ? '/api/nutrition/search'                // Express local path
    : '/api/nutrition-search';               // Cloudflare Pages Function

  const data = await apiPost(url, { query });
  return data.hits || [];
}