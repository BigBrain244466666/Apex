/* Real-time sync: subscribes to Supabase changes and auto-refreshes the UI. */

let realtimeTimer = null;
let realtimeChannel = null;

function initRealtime(userId) {
  if (!userId || realtimeChannel) return;

  const sb = getSupabase();
  if (!sb) return;

  const tables = [
    'meals',
    'meal_items',
    'workouts',
    'workout_exercises',
    'exercise_sets',
    'vitals',
    'profiles'
  ];

  const channel = sb.channel('apex-realtime-' + userId);

  tables.forEach(function (table) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: table,
        filter: 'user_id=eq.' + userId
      },
      function () {
        clearTimeout(realtimeTimer);
        realtimeTimer = setTimeout(function () {
          if (typeof App !== 'undefined' && App.loadDashboardData) {
            App.loadDashboardData();
          }
        }, 500);
      }
    );
  });

  channel.subscribe();
  realtimeChannel = channel;
}