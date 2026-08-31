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
  const data = await apiPost('/api/nutrition/search', { query });
  return data.hits || [];
}
