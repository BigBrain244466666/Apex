/* History — intake + workout history with delete + PR recalc */

const History = {
  bound: false,
  mealDates: [],
  workoutDates: [],

  bindUI() {
    if (this.bound) return;
    this.bound = true;
    document.getElementById('history-meal-date')?.addEventListener('change', (e) => this.renderMealDay(e.target.value));
    document.getElementById('history-workout-date')?.addEventListener('change', (e) => this.renderWorkoutDay(e.target.value));
  },

  async load(userId, token) {
    const sb = getSupabase();
    const mealsRes = await sb.from('meals').select('meal_date').eq('user_id', userId).order('meal_date', { ascending: false });
    const uniqueMealDates = [...new Set((mealsRes.data || []).map(m => m.meal_date))].sort((a, b) => b.localeCompare(a));
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    this.mealDates = uniqueMealDates.filter(d => d !== today);

    const workoutsRes = await sb.from('workouts').select('workout_date').eq('user_id', userId).eq('completed', true).order('workout_date', { ascending: false });
    this.workoutDates = [...new Set((workoutsRes.data || []).map(w => w.workout_date))].sort((a, b) => b.localeCompare(a));

    const mealSelect = document.getElementById('history-meal-date');
    const workoutSelect = document.getElementById('history-workout-date');
    if (mealSelect) mealSelect.innerHTML = '<option value="">— Select day —</option>' + this.mealDates.map(d => `<option value="${d}">${formatDateLabel(d)}</option>`).join('');
    if (workoutSelect) workoutSelect.innerHTML = '<option value="">— Select day —</option>' + this.workoutDates.map(d => `<option value="${d}">${formatDateLabel(d)}</option>`).join('');
  },

  async renderMealDay(date) {
    const container = document.getElementById('history-meal-day');
    if (!container) return;
    container.innerHTML = '';
    if (!date) { container.innerHTML = '<p class="muted">Select a day to see meals.</p>'; return; }

    const sb = getSupabase();
    const userId = App.userId;
    const mealsRes = await sb.from('meals').select('id, meal_type').eq('user_id', userId).eq('meal_date', date).order('created_at', { ascending: true });
    if (!(mealsRes.data || []).length) { container.innerHTML = '<p class="muted">No meals logged on this day.</p>'; return; }

    let html = '<div class="table-wrap"><table class="data-table history-table"><thead><tr><th>Meal</th><th>Food</th><th>Cal</th><th>Protein</th><th>Fat</th><th>Carbs</th></tr></thead><tbody>';
    let grand = { calories: 0, protein: 0, fat: 0, carbs: 0 };

    for (const meal of mealsRes.data) {
      const itemsRes = await sb.from('meal_items').select('*').eq('meal_id', meal.id).order('created_at', { ascending: true });
      const items = itemsRes.data || [];
      const mt = { calories: 0, protein: 0, fat: 0, carbs: 0 };
      items.forEach(it => {
        mt.calories += Number(it.calories) || 0;
        mt.protein += Number(it.protein) || 0;
        mt.fat += Number(it.fat) || 0;
        mt.carbs += Number(it.carbs) || 0;
      });
      grand.calories += mt.calories;
      grand.protein += mt.protein;
      grand.fat += mt.fat;
      grand.carbs += mt.carbs;

      if (!items.length) {
        html += `<tr><td>${capitalize(meal.meal_type)}</td><td class="muted">No foods</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>`;
        continue;
      }

      items.forEach((it, idx) => {
        const mealCell = idx === 0 ? `<td rowspan="${items.length}" class="meal-type-cell">${capitalize(meal.meal_type)}</td>` : '';
        html += `<tr>${mealCell}<td class="food-name-cell">${escapeHtml(it.food_name)}</td><td>${it.calories}</td><td>${it.protein}</td><td>${it.fat}</td><td>${it.carbs}</td></tr>`;
      });

      html += `<tr class="meal-subtotal-row"><td class="muted">Subtotal</td><td></td><td><b>${Math.round(mt.calories)}</b></td><td><b>${Math.round(mt.protein)}</b></td><td><b>${Math.round(mt.fat)}</b></td><td><b>${Math.round(mt.carbs)}</b></td></tr>`;
    }

    html += `<tr class="meal-grand-total-row"><td colspan="2"><b>Day Total</b></td><td><b>${Math.round(grand.calories)}</b></td><td><b>${Math.round(grand.protein)}</b></td><td><b>${Math.round(grand.fat)}</b></td><td><b>${Math.round(grand.carbs)}</b></td></tr></tbody></table></div>`;
    container.innerHTML = html;
  },

  async renderWorkoutDay(date) {
    const container = document.getElementById('history-workout-day');
    if (!container) return;
    container.innerHTML = '';
    if (!date) { container.innerHTML = '<p class="muted">Select a day to see completed workouts.</p>'; return; }

    const sb = getSupabase();
    const userId = App.userId;
    const workoutsRes = await sb.from('workouts').select('id, start_time').eq('user_id', userId).eq('completed', true).eq('workout_date', date).order('created_at', { ascending: true });
    if (!(workoutsRes.data || []).length) { container.innerHTML = '<p class="muted">No completed workouts on this day.</p>'; return; }

    let html = '';

    for (const w of workoutsRes.data) {
      const exRes = await sb.from('workout_exercises').select('id, exercise_name').eq('workout_id', w.id).order('created_at', { ascending: true });
      let workoutVolume = 0;

      html += `<div class="hist-workout-block"><div class="hist-workout-head"><span>${formatDateLabel(date)}</span><span class="muted">${formatTime12(w.start_time)}</span><button class="icon-btn delete-completed-workout" data-wid="${w.id}" title="Delete workout">🗑️</button></div><div class="table-wrap"><table class="data-table history-table"><thead><tr><th>Exercise</th><th>Set</th><th>Weight (lb)</th><th>Reps</th><th>e1RM</th></tr></thead><tbody>`;

      for (const ex of (exRes.data || [])) {
        const setRes = await sb.from('exercise_sets').select('*').eq('exercise_id', ex.id).order('set_number', { ascending: true });
        const sets = setRes.data || [];
        let exVolume = 0;
        let bestE1rm = 0;

        sets.forEach(s => {
          exVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
          bestE1rm = Math.max(bestE1rm, e1rm(s.weight, s.reps));
        });
        workoutVolume += exVolume;

        if (!sets.length) {
          html += `<tr><td>${escapeHtml(ex.exercise_name)}</td><td colspan="4" class="muted">No sets</td></tr>`;
          continue;
        }

        sets.forEach((s, idx) => {
          const exCell = idx === 0 ? `<td rowspan="${sets.length}" class="exercise-cell">${escapeHtml(ex.exercise_name)}</td>` : '';
          html += `<tr>${exCell}<td>${s.set_number}</td><td>${Number(s.weight) || 0}</td><td>${s.reps}</td><td>${e1rm(s.weight, s.reps) || '—'}</td></tr>`;
        });

        html += `<tr class="exercise-subtotal-row"><td class="muted">Subtotal</td><td></td><td></td><td></td><td><b>Best ${bestE1rm || '—'}</b></td></tr>`;
      }

      html += `</tbody></table></div><div class="hist-workout-footer">Total volume: <b>${workoutVolume} lb</b></div></div>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.delete-completed-workout').forEach(btn => {
      btn.addEventListener('click', () => this.deleteCompletedWorkout(btn.dataset.wid));
    });
  },

  async deleteCompletedWorkout(workoutId) {
    if (!confirm('Delete this completed workout and all its exercises? This cannot be undone.')) return;
    const sb = getSupabase();

    // Explicit cascade delete: sets → exercises → workout
    const exRes = await sb.from('workout_exercises').select('id').eq('workout_id', workoutId);
    const exerciseIds = (exRes.data || []).map(e => e.id);
    if (exerciseIds.length) {
      await sb.from('exercise_sets').delete().in('exercise_id', exerciseIds);
      await sb.from('workout_exercises').delete().in('id', exerciseIds);
    }
    await sb.from('workouts').delete().eq('id', workoutId);

    // Recalculate PRs so deleted workout's PRs are removed
    if (typeof Gym !== 'undefined' && Gym.recalculatePRs) {
      await Gym.recalculatePRs();
      Gym.loadPRs();
    }

    const select = document.getElementById('history-workout-date');
    if (select && select.value) this.renderWorkoutDay(select.value);
  }
};

function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (!w || !r) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime12(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}