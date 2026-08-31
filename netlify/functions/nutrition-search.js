/**
 * Netlify Function: food search proxy.
 * Keeps the USDA API key server-side (from Netlify env vars).
 * No npm dependencies — uses built-in fetch (Node 18+).
 */

const OFF_BASE = 'https://world.openfoodfacts.org';

async function searchOpenFoodFacts(query) {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ApexRecompTracker/1.0 (personal fitness app)',
        Accept: 'application/json'
      }
    });

    if (!res.ok) {
      console.error(`[OFF] HTTP ${res.status} for "${query}"`);
      return [];
    }

    const json = await res.json();
    const products = json.products || [];
    console.log(`[OFF] ${products.length} results for "${query}"`);

    return products
      .filter((p) => p.product_name && p.nutriments)
      .map((p) => ({
        source: 'openfoodfacts',
        dataType: 'Branded',
        name: p.product_name,
        brand: p.brands || '',
        per100g: {
          calories: p.nutriments['energy-kcal_100g'] || p.nutriments.energy_100g || null,
          protein: p.nutriments.proteins_100g ?? null,
          fat: p.nutriments.fat_100g ?? null,
          carbs: p.nutriments.carbohydrates_100g ?? null
        }
      }));
  } catch (err) {
    console.error('[OFF] fetch error:', err.message);
    return [];
  }
}

async function searchUSDA(query, key) {
  if (!key) {
    console.log('[USDA] No key in Netlify env — skipping. Add USDA_API_KEY.');
    return [];
  }

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=20&api_key=${key}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[USDA] HTTP ${res.status} for "${query}"`);
      return [];
    }

    const json = await res.json();
    console.log(`[USDA] ${(json.foods || []).length} results for "${query}"`);

    return (json.foods || []).map((food) => {
      const get = (id) => {
        const n = food.foodNutrients?.find((x) => Number(x.nutrientId) === id);
        return n?.value ?? null;
      };
      return {
        source: 'usda',
        dataType: food.dataType || 'Branded',
        name: food.description,
        brand: food.brandOwner || '',
        per100g: {
          calories: get(1008),
          protein: get(1003),
          fat: get(1004),
          carbs: get(1005)
        }
      };
    });
  } catch (err) {
    console.error('[USDA] fetch error:', err.message);
    return [];
  }
}

function rankAndDedupe(hits) {
  const seen = new Set();

  return hits
    .filter((h) => h.name)
    .map((h) => {
      const p = h.per100g;
      const completeness = [p.calories != null, p.protein != null, p.fat != null, p.carbs != null].filter(Boolean).length;
      let score = completeness * 10;
      if (h.dataType === 'Foundation' || h.dataType === 'SR Legacy') score += 6;
      else if (h.source === 'usda') score += 2;
      score -= Math.min(h.name.length / 40, 2);
      return { ...h, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((h) => {
      const key = String(h.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let query = '';
    if (event.httpMethod === 'GET') {
      query = event.queryStringParameters?.query || '';
    } else {
      const body = JSON.parse(event.body || '{}');
      query = body.query || '';
    }

    if (!query.trim()) {
      return { statusCode: 200, headers, body: JSON.stringify({ hits: [] }) };
    }

    const [offHits, usdaHits] = await Promise.allSettled([
      searchOpenFoodFacts(query.trim()),
      searchUSDA(query.trim(), process.env.USDA_API_KEY)
    ]);

    let hits = [];
    if (offHits.status === 'fulfilled') hits = hits.concat(offHits.value);
    if (usdaHits.status === 'fulfilled') hits = hits.concat(usdaHits.value);

    const ranked = rankAndDedupe(hits);
    return { statusCode: 200, headers, body: JSON.stringify({ hits: ranked }) };
  } catch (err) {
    console.error('[Nutrition] search error:', err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ hits: [], error: err.message })
    };
  }
};
