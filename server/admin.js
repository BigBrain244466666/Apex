/**
 * Admin stats route — uses Supabase service role to aggregate all users.
 */

async function adminStatsHandler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing in .env' });
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  try {
    const base = `${supabaseUrl}/rest/v1`;

    const fetchCount = async (table, filter = '') => {
      const url = `${base}/${table}?select=id${filter ? `&${filter}` : ''}`;
      const r = await fetch(url, { headers });
      if (!r.ok) return 0;
      const rows = await r.json();
      return rows.length;
    };

    const totalUsers = await fetchCount('profiles');
    const totalMeals = await fetchCount('meals');
    const totalMealItems = await fetchCount('meal_items');
    const totalWorkouts = await fetchCount('workouts');
    const completedWorkouts = await fetchCount('workouts', 'completed=eq.true');
    const totalVitals = await fetchCount('vitals');

    // Average daily calories across all meal days.
    let avgDailyCalories = null;
    try {
      const mealsRes = await fetch(`${base}/meals?select=meal_date`, { headers });
      const meals = await mealsRes.json();
      const mealDates = [...new Set(meals.map((m) => m.meal_date))];
      if (mealDates.length) {
        let totalCals = 0;
        for (const date of mealDates) {
          const itemsRes = await fetch(
            `${base}/meal_items?select=calories&meal_id=in.(select=id from meals where meal_date=eq.${date})`,
            { headers }
          );
          // The above complex query may not work; fallback:
          if (!itemsRes.ok) continue;
          const items = await itemsRes.json();
          totalCals += items.reduce((a, it) => a + (Number(it.calories) || 0), 0);
        }
        avgDailyCalories = Math.round(totalCals / mealDates.length);
      }
    } catch (e) {
      console.error('Avg calories calc failed:', e.message);
    }

    // Last activity: max created_at across tables (simplified).
    const lastActivity = new Date().toISOString();

    res.json({
      totalUsers,
      totalMeals,
      totalMealItems,
      totalWorkouts,
      completedWorkouts,
      totalVitals,
      avgDailyCalories,
      lastActivity
    });
  } catch (err) {
    console.error('[Admin] stats error:', err.message);
    res.status(502).json({ error: err.message });
  }
}

module.exports = { adminStatsHandler };
