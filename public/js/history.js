/**
 * History module: past daily intakes + completed workouts + trends.
 * Two dropdowns: meal date, workout date.
 * Shows macros per day and full workout detail.
 */

const History = {
  bound: false,
  mealDates: [],
  workoutDates: [],

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    document.getElementById('history-meal-date').addEventListener('change', (e) => {
      this.renderMealDay(e.target.value);
    });

    document.getElementById('history-workout-date').addEventListener('change', (e) => {
      this.renderWorkoutDay(e.target.value);
    });
  },

  async load(userId, token) {
    const sb = getSupabase();

    // ---- Meal history dates ----
    const { data: mealDays, error: mealErr } = await sb.from('meal_items')
      .select('meal_id')
      .eq('user_id', userId);

    if (mealErr) return console.error(mealErr.message);

    // Get unique meal dates from meals table.
    const { data: meals } = await sb.from('meals')
      .select('meal_date')
      .eq('user_id', userId)
      .order('meal_date', { ascending: false });

    const uniqueDates = [...new Set((meals || []).map((m) => m.meal_date))].sort((a, b) => b.localeCompare(a));

    // Exclude today from history (today is on Dashboard).
    const today = new Date().toISOString().slice(0, 10);
    this.mealDates = uniqueDates.filter((d) => d !== today);

    if (token !== App.loadToken) return;

    this.populateMealDropdown();
    this.renderMealTrendChart();
    await this.loadWorkoutHistory(userId, token);
  },

  async loadWorkoutHistory(userId, token) {
    const sb = getSupabase();

    const { data: completed, error } = await sb.from('workouts')
      .select('id, workout_date, start_time')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('workout_date', { ascending: false });

    if (error) return console.error(error.message);

    this.workoutDates = [...new Set((completed || []).map((w) => w.workout_date))].sort((a, b) => b.localeCompare(a));

    if (token !== App.loadToken) return;

    this.populateWorkoutDropdown();
    this.renderWorkoutTrendChart();
  },

  populateMealDropdown() {
    const select = document.getElementById('history-meal-date');
    select.innerHTML = '<option value="">— Select day —</option>' +
      this.mealDates.map((d) => `<option value="${d}">${formatDate(d)}</option>`).join('');
  },

  populateWorkoutDropdown() {
    const select = document.getElementById('history-workout-date');
    select.innerHTML = '<option value="">— Select day —</option>' +
      this.workoutDates.map((d) => `<option value="${d}">${formatDate(d)}</option>`).join('');
  },

  async renderMealDay(date) {
    const container = document.getElementById('history-meal-day');
    container.innerHTML = '';

    if (!date) {
      container.innerHTML = '<p class="muted">Select a day to see meals.</p>';
      return;
    }

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const { data: meals } = await sb.from('meals')
      .select('id, meal_type')
      .eq('user_id', userId)
      .eq('meal_date', date);

    if (!meals || !meals.length) {
      container.innerHTML = '<p class="muted">No meals logged on this day.</p>';
      return;
    }

    let dayTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    const groups = [];

    for (const meal of meals) {
      const { data: items } = await sb.from('meal_items')
        .select('*')
        .eq('meal_id', meal.id)
        .order('created_at', { ascending: true });

      const mt = mealTotalsFromItems(items || []);
      dayTotals.calories += mt.calories;
      dayTotals.protein += mt.protein;
      dayTotals.fat += mt.fat;
      dayTotals.carbs += mt.carbs;

      groups.push({ meal_type: meal.meal_type, items: items || [], totals: mt });
    }

    container.innerHTML = `
      <div class="history-day-totals">
        <div class="hist-stat"><b>${Math.round(dayTotals.calories)}</b> kcal</div>
        <div class="hist-stat"><b>${Math.round(dayTotals.protein)}</b>g protein</div>
        <div class="hist-stat"><b>${Math.round(dayTotals.fat)}</b>g fat</div>
        <div class="hist-stat"><b>${Math.round(dayTotals.carbs)}</b>g carbs</div>
      </div>
      ${groups.map((g) => `
        <div class="hist-meal-group">
          <div class="hist-meal-head">
            <span>${capitalize(g.meal_type)}</span>
            <span class="muted">${Math.round(g.totals.calories)} kcal · P ${Math.round(g.totals.protein)} · F ${Math.round(g.totals.fat)} · C ${Math.round(g.totals.carbs)}</span>
          </div>
          ${g.items.map((it) => `
            <div class="hist-meal-item">${escapeHtml(it.food_name)} — ${it.calories} kcal · P ${it.protein} · F ${it.fat} · C ${it.carbs}</div>
          `).join('')}
        </div>
      `).join('')}
    `;
  },

  async renderWorkoutDay(date) {
    const container = document.getElementById('history-workout-day');
    container.innerHTML = '';

    if (!date) {
      container.innerHTML = '<p class="muted">Select a day to see completed workouts.</p>';
      return;
    }

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const { data: workouts } = await sb.from('workouts')
      .select('id, workout_date, start_time')
      .eq('user_id', userId)
      .eq('completed', true)
      .eq('workout_date', date);

    if (!workouts || !workouts.length) {
      container.innerHTML = '<p class="muted">No completed workouts on this day.</p>';
      return;
    }

    let html = '';

    for (const w of workouts) {
      const { data: exercises } = await sb.from('workout_exercises')
        .select('id, exercise_name')
        .eq('workout_id', w.id)
        .order('created_at', { ascending: true });

      let volume = 0;

      html += `<div class="hist-workout-card">
        <div class="hist-workout-head">
          <span>${formatDate(w.workout_date)}</span>
          <span class="muted">${formatTime12(w.start_time)}</span>
        </div>`;

      for (const ex of exercises || []) {
        const { data: sets } = await sb.from('exercise_sets')
          .select('*')
          .eq('exercise_id', ex.id)
          .order('set_number', { ascending: true });

        let exVolume = 0;
        let bestE1rm = 0;
        for (const s of sets || []) {
          exVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
          bestE1rm = Math.max(bestE1rm, e1rm(s.weight, s.reps));
        }
        volume += exVolume;

        html += `
          <div class="hist-exercise">
            <div class="hist-exercise-head">
              <span>${escapeHtml(ex.exercise_name)}</span>
              <span class="muted">${(sets || []).length} sets · ${exVolume} lb · est 1RM ${bestE1rm || '—'}</span>
            </div>
            <div class="hist-sets">
              ${(sets || []).map((s) => `<span class="hist-set-chip">${Number(s.weight) || 0}×${s.reps}</span>`).join('')}
            </div>
          </div>`;
      }

      html += `<div class="hist-workout-footer">Total volume: <b>${volume} lb</b></div></div>`;
    }

    container.innerHTML = html;
  },

  async renderMealTrendChart() {
    const container = document.getElementById('history-meal-trend');
    container.innerHTML = '';

    if (this.mealDates.length < 2) {
      container.innerHTML = '<p class="muted small">Log a few more days to see calorie trends.</p>';
      return;
    }

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    // Last 14 dates, chronological.
    const dates = [...this.mealDates].reverse().slice(-14);
    const perDay = [];

    for (const date of dates) {
      const { data: meals } = await sb.from('meals')
        .select('id')
        .eq('user_id', userId)
        .eq('meal_date', date);

      let cals = 0;
      for (const m of meals || []) {
        const { data: items } = await sb.from('meal_items')
          .select('calories')
          .eq('meal_id', m.id);
        cals += (items || []).reduce((a, it) => a + (Number(it.calories) || 0), 0);
      }
      perDay.push({ label: date, value: Math.round(cals) });
    }

    container.innerHTML = buildChartSVG(perDay, 'Calories');
  },

  async renderWorkoutTrendChart() {
    const container = document.getElementById('history-workout-trend');
    container.innerHTML = '';

    if (this.workoutDates.length < 2) {
      container.innerHTML = '<p class="muted small">Complete a few more workouts to see volume trends.</p>';
      return;
    }

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const dates = [...this.workoutDates].reverse().slice(-14);
    const perDay = [];

    for (const date of dates) {
      const { data: workouts } = await sb.from('workouts')
        .select('id')
        .eq('user_id', userId)
        .eq('completed', true)
        .eq('workout_date', date);

      let vol = 0;
      for (const w of workouts || []) {
        const { data: exercises } = await sb.from('workout_exercises')
          .select('id')
          .eq('workout_id', w.id);
        for (const ex of exercises || []) {
          const { data: sets } = await sb.from('exercise_sets')
            .select('weight, reps')
            .eq('exercise_id', ex.id);
          vol += (sets || []).reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
        }
      }
      perDay.push({ label: date, value: Math.round(vol) });
    }

    container.innerHTML = buildChartSVG(perDay, 'Volume (lb)');
  }
};

// ============ Helpers ============

function mealTotalsFromItems(items) {
  const t = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  for (const it of items) {
    t.calories += Number(it.calories) || 0;
    t.protein += Number(it.protein) || 0;
    t.fat += Number(it.fat) || 0;
    t.carbs += Number(it.carbs) || 0;
  }
  return t;
}

function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (!w || !r) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric'
  });
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
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function buildChartSVG(dataPoints, label) {
  if (!dataPoints || dataPoints.length < 2) return '';
  const w = 600;
  const h = 160;
  const pad = 30;
  const vals = dataPoints.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = (max - min) || 1;

  const xFor = (i) => pad + (i / (dataPoints.length - 1)) * (w - pad * 2);
  const yFor = (v) => h - pad - ((v - min) / range) * (h - pad * 2);

  const linePoints = dataPoints.map((d, i) => `${xFor(i)},${yFor(d.value)}`).join(' ');

  return `
    <div class="trend-chart-title muted small">${label} trend</div>
    <svg viewBox="0 0 ${w} ${h}" class="trend-chart" preserveAspectRatio="none">
      <polyline points="${linePoints}" fill="none" stroke="#4d6bfe" stroke-width="2" vector-effect="non-scaling-stroke" />
      ${dataPoints.map((d, i) => `<circle cx="${xFor(i)}" cy="${yFor(d.value)}" r="3.5" fill="#4d6bfe" />`).join('')}
    </svg>
    <div class="trend-chart-labels">
      <span>${escapeHtml(dataPoints[0].label)}</span>
      <span>${escapeHtml(dataPoints[dataPoints.length - 1].label)}</span>
    </div>
  `;
}
