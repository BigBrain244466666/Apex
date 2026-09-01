exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Diagnostic: report exactly what's missing (without leaking secrets).
  if (!supabaseUrl || !serviceKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: 'Missing env vars: ' + missing.join(', ') })
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

  // Diagnostic fetchCount that throws instead of returning 0.
  const fetchCount = async function (table, filter) {
    const col = tableId[table] || 'id';
    let url = base + '/' + table + '?select=' + col;
    if (filter) url += '&' + filter;

    const r = await fetch(url, { headers: apiHeaders });

    if (!r.ok) {
      const body = await r.text();
      throw new Error(table + ' HTTP ' + r.status + ' — ' + body.slice(0, 400));
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
        avgDailyCalories: 0,
        lastActivity: new Date().toISOString()
      })
    };
  } catch (err) {
    // This now returns the REAL error to the browser.
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};