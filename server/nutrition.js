/**
 * Nutrition lookup proxy.
 * Searches Open Food Facts AND USDA FoodData Central in parallel,
 * then merges, dedupes, and ranks by macro completeness + source quality.
 */

const OFF_BASE = 'https://world.openfoodfacts.org';

async function searchOpenFoodFacts(query) {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ApexRecompTracker/1.0 (personal fitness app)', 'Accept': 'application/json' }
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
        serving: p.serving_size || null,
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

async function searchUSDA(query) {
  const key = process.env.USDA_API_KEY;
  if (!key) {
    console.log('[USDA] No API key set — skipping (add USDA_API_KEY to .env for best results)');
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
        serving: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : null,
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
      const key = normalizeName(h.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function searchFood(query) {
  const q = (query || '').trim();
  if (!q) return [];

  const [offHits, usdaHits] = await Promise.allSettled([searchOpenFoodFacts(q), searchUSDA(q)]);

  let hits = [];
  if (offHits.status === 'fulfilled') hits = hits.concat(offHits.value);
  if (usdaHits.status === 'fulfilled') hits = hits.concat(usdaHits.value);

  const ranked = rankAndDedupe(hits);
  console.log(`[Nutrition] "${q}" → ${ranked.length} total merged hits`);
  return ranked;
}

module.exports = { searchFood };
