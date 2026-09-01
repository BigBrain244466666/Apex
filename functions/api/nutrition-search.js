export async function onRequest(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  // Handle CORS preflight.
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  let query = '';

  if (context.request.method === 'POST') {
    try {
      const body = await context.request.json();
      query = body.query || '';
    } catch (e) {
      query = '';
    }
  } else {
    const url = new URL(context.request.url);
    query = url.searchParams.get('query') || '';
  }

  if (!query.trim()) {
    return new Response(JSON.stringify({ hits: [] }), { headers });
  }

  async function searchUSDA(q, key) {
    if (!key) return [];
    const res = await fetch(
      'https://api.nal.usda.gov/fdc/v1/foods/search?query=' +
        encodeURIComponent(q) +
        '&pageSize=20&api_key=' +
        key
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.foods || []).map(function (food) {
      const get = function (id) {
        const n = food.foodNutrients && food.foodNutrients.find(function (x) {
          return Number(x.nutrientId) === id;
        });
        return n ? n.value : null;
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
  }

  async function searchOFF(q) {
    const urlOff =
      'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' +
      encodeURIComponent(q) +
      '&search_simple=1&action=process&json=1&page_size=15';
    try {
      const res = await fetch(urlOff, {
        headers: {
          'User-Agent': 'ApexRecompTracker/1.0 (personal fitness app)',
          Accept: 'application/json'
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.products || [])
        .filter(function (p) { return p.product_name && p.nutriments; })
        .map(function (p) {
          return {
            source: 'openfoodfacts',
            dataType: 'Branded',
            name: p.product_name,
            brand: p.brands || '',
            per100g: {
              calories: p.nutriments['energy-kcal_100g'] || p.nutriments.energy_100g || null,
              protein: p.nutriments.proteins_100g != null ? p.nutriments.proteins_100g : null,
              fat: p.nutriments.fat_100g != null ? p.nutriments.fat_100g : null,
              carbs: p.nutriments.carbohydrates_100g != null ? p.nutriments.carbohydrates_100g : null
            }
          };
        });
    } catch (err) {
      return [];
    }
  }

  const [usdaHits, offHits] = await Promise.allSettled([
    searchUSDA(query.trim(), context.env.USDA_API_KEY),
    searchOFF(query.trim())
  ]);

  let hits = [];
  if (usdaHits.status === 'fulfilled') hits = hits.concat(usdaHits.value);
  if (offHits.status === 'fulfilled') hits = hits.concat(offHits.value);

  // Dedupe and rank by macro completeness.
  const seen = new Set();
  hits = hits
    .filter(function (h) { return h.name; })
    .map(function (h) {
      const p = h.per100g;
      let completeness = 0;
      if (p.calories != null) completeness++;
      if (p.protein != null) completeness++;
      if (p.fat != null) completeness++;
      if (p.carbs != null) completeness++;
      let score = completeness * 10;
      if (h.dataType === 'Foundation' || h.dataType === 'SR Legacy') score += 6;
      else if (h.source === 'usda') score += 2;
      score -= Math.min(h.name.length / 40, 2);
      return { ...h, score: score };
    })
    .sort(function (a, b) { return b.score - a.score; })
    .filter(function (h) {
      const key = h.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);

  return new Response(JSON.stringify({ hits: hits }), { headers });
}