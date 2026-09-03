// functions/api/ai.js
export async function onRequest(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const { query, userData } = await context.request.json();
    if (!query) throw new Error('Missing query');

    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set in Cloudflare env');

    // Filter to last 30 days
    const DAYS = 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAYS);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const filterByDate = (items, dateField = 'log_date') => {
      return (items || []).filter(item => item[dateField] && item[dateField] >= cutoffStr);
    };

    const summary = {
      profile: userData.profiles?.[0] || {},
      meals: filterByDate(userData.meals, 'meal_date'),
      mealItems: filterByDate(userData.meal_items, 'created_at'),
      workouts: filterByDate(userData.workouts, 'workout_date'),
      vitals: filterByDate(userData.vitals, 'log_date'),
      water: filterByDate(userData.water_logs, 'log_date'),
      personalRecords: filterByDate(userData.personal_records, 'achieved_at'),
    };

    // Keep relationships intact
    const mealIds = new Set(summary.meals.map(m => m.id));
    summary.mealItems = (userData.meal_items || []).filter(item => mealIds.has(item.meal_id));

    if (userData.workout_exercises) {
      const workoutIds = new Set(summary.workouts.map(w => w.id));
      summary.workoutExercises = (userData.workout_exercises || []).filter(ex => workoutIds.has(ex.workout_id));
      const exerciseIds = new Set(summary.workoutExercises.map(ex => ex.id));
      summary.exerciseSets = (userData.exercise_sets || []).filter(set => exerciseIds.has(set.exercise_id));
    }

    const prompt = `
You are an expert fitness and nutrition coach. You have access to the user's personal data for the last ${DAYS} days.
Answer questions clearly, concisely, and with actionable advice. If data is insufficient, say so and suggest what to log.

User Data (JSON):
${JSON.stringify(summary, null, 2)}

User Question: ${query}
`;

    // --- Using Gemini 3.5 Flash Lite ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply from AI.';

    return new Response(JSON.stringify({ reply }), { headers, status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers,
      status: 500,
    });
  }
}