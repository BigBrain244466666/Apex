/**
 * Nutrition lookup proxy.
 * Primary: Open Food Facts (free, no key required)
 * Fallback: USDA FoodData Central (free API key required)
 * The frontend can always enter macros manually too.
 */

const OFF_BASE = 'https://world.openfoodfacts.org';

/**
 * Search Open Food Facts for a food name.
 * Returns normalized hits with calories + macros per 100g.
 */
async function searchOpenFoodFacts(query) {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,brands,nutriments,serving_size`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ApexRecompTracker/1.0 (personal use)' }
  });
  if (!res.ok) return [];

  const json = await res.json();
  const products = json.products || [];
  return products
    .filter((p) => p.product_name && p.nutriments)
    .map((p) => ({
      source: 'openfoodfacts',
      name: p.product_name,
      brand: p.brands || '',
      per100g: {
        calories: p.nutriments['energy-kcal_100g'] || p.nutriments.energy_100g || null,
        protein: p.nutriments.proteins_100g ?? null,
        fat: p.nutriments.fat_100g ?? null,
        carbs: p.nutriments.carbohydrates_100g ?? null
      }
    }));
}

/**
 * Search USDA FoodData Central.
 * Nutrient IDs: 1003=protein, 1004=fat, 1005=carbs, 1008=energy-kcal
 */
async function searchUSDA(query) {
  const key = process.env.USDA_API_KEY;
  if (!key) return [];

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=10&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const json = await res.json();
  return (json.foods || []).map((food) => {
    const get = (id) => {
      const n = food.foodNutrients?.find((x) => Number(x.nutrientId) === id);
      return n?.value ?? null;
    };
    return {
      source: 'usda',
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

/**
 * Combined search: OFF first, then USDA if OFF returns nothing useful.
 */
async function searchFood(query) {
  const q = (query || '').trim();
  if (!q) return [];

  let hits = await searchOpenFoodFacts(q);
  if (hits.length < 3) {
    const usdaHits = await searchUSDA(q);
    hits = hits.concat(usdaHits);
  }
  return hits.slice(0, 12);
}

module.exports = { searchFood };
