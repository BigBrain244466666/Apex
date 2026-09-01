/**
 * Netlify Function: admin global stats.
 * Uses service role to aggregate across all users.
 */

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY missing in Netlify env vars.' })
    };
  }

  const apiHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  const base = `${supabaseUrl}/rest/v1`;

  const fetchCount = async (table, filter = '') => {
    const url = `${base}/${table}?select=user_id${filter ? `&${filter}` : ''}`;
    const r = await fetch(url, { headers: apiHeaders });
    if (!r.ok) return 0;
    const rows = await r.json();
    return rows.length;
  };

  try {
    const totalUsers = await fetchCount('profiles');
    const totalMeals = await fetchCount('meals');
    const totalMealItems = await fetchCount('meal_items');
    const totalWorkouts = await fetchCount('workouts');
    const completedWorkouts = await fetchCount('workouts', 'completed=eq.true');
    const totalVitals = await fetchCount('vitals');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalUsers,
        totalMeals,
        totalMealItems,
        totalWorkouts,
        completedWorkouts,
        totalVitals,
        avgDailyCalories: null,
        lastActivity: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
