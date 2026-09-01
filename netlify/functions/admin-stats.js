exports.handler = async function () {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY in Netlify env vars.' })
    };
  }

  const apiHeaders = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json'
  };

  const base = supabaseUrl + '/rest/v1';

  const tableId = {
    profiles: 'user_id',
    meals: 'id',
    meal_items: 'id',
    workouts: 'id',
    vitals: 'id'
  };

  const fetchCount = async function (table, filter) {
    const col = tableId[table] || 'id';
    let url = base + '/' + table + '?select=' + col;
    if (filter) url += '&' + filter;

    const r = await fetch(url, { headers: apiHeaders });

    if (!r.ok) {
      const body = await r.text();
      console.error('[Admin] ' + table + ' HTTP ' + r.status + ': ' + body.slice(0, 300));
      return 0;
    }

    const rows = await r.json();
    return rows.length;
  };

  try {
    const totalUsers = await fetchCount('profiles', '');
    const totalMeals = await fetchCount('meals', '');
    const totalMealItems = await fetchCount('meal_items', '');
    const totalWorkouts = await fetchCount('workouts', '');
    const completedWorkouts = await fetchCount('workouts', 'completed=eq.true');
    const totalVitals = await fetchCount('vitals', '');

    // Average daily calories.
    let avgDailyCalories = 0;
    try {
      const mealsRes = await fetch(base + '/meals?select=id,meal_date', { headers: apiHeaders });
      const itemsRes = await fetch(base + '/meal_items?select=meal_id,calories', { headers: apiHeaders });

      const meals = mealsRes.ok ? await mealsRes.json() : [];
      const items = itemsRes.ok ? await itemsRes.json() : [];

      const calByMeal = {};
      for (const it of items) {
        const key = it.meal_id;
        calByMeal[key] = (calByMeal[key] || 0) + (Number(it.calories) || 0);
      }

      const calByDate = {};
      for (const meal of meals) {
        const date = meal.meal_date;
        const cals = calByMeal[meal.id] || 0;
        calByDate[date] = (calByDate[date] || 0) + cals;
      }

      const dates = Object.keys(calByDate);
      if (dates.length > 0) {
        let total = 0;
        for (const d of dates) total += calByDate[d];
        avgDailyCalories = Math.round(total / dates.length);
      }
    } catch (e) {
      console.error('[Admin] avg calories error:', e.message);
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        totalUsers: totalUsers,
        totalMeals: totalMeals,
        totalMealItems: totalMealItems,
        totalWorkouts: totalWorkouts,
        completedWorkouts: completedWorkouts,
        totalVitals: totalVitals,
        avgDailyCalories: avgDailyCalories,
        lastActivity: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};