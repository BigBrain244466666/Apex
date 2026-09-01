/* Dashboard — macros, overview stats, 6-axis radar (no sleep/workout), charts */

const DEFAULT_PROFILE = {
  weight_lbs: null, height_cm: 179, body_fat_current: null, body_fat_goal: null,
  gym_frequency: '5 days/week', calorie_target: 2100, protein_target: 170,
  fat_target: 60, carb_target: 220, step_goal: 10000, is_admin: false,
  meals_enabled: true, gym_enabled: true, history_enabled: true,
  vitals_enabled: true, huawei_enabled: true
};

const SEED_BREAKFAST_ITEMS = [
  { food_name: '5 large eggs', calories: 360, protein: 31, fat: 25, carbs: 1 },
  { food_name: '88g pork sausage', calories: 310, protein: 15, fat: 27, carbs: 1 },
  { food_name: '78g Swiss cheese', calories: 280, protein: 20, fat: 21, carbs: 1 },
  { food_name: '1 cup skim milk', calories: 83, protein: 8, fat: 0, carbs: 12 },
  { food_name: 'Soy sauce', calories: 15, protein: 1, fat: 0, carbs: 3 }
];

const MACRO_STYLES = [
  { key: 'calories', label: 'Calories', color: '#4d6bfe' },
  { key: 'protein', label: 'Protein', color: '#2ea043' },
  { key: 'fat', label: 'Fat', color: '#d29922' },
  { key: 'carbs', label: 'Carbs', color: '#a371f7' }
];

const Dashboard = {
  profile: null,

  async ensureProfile(userId) {
    const sb = getSupabase();
    const res = await sb.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (res.data) { this.profile = res.data; return res.data; }
    const userRes = await sb.auth.getUser();
    const email = userRes.data && userRes.data.user ? userRes.data.user.email : null;
    const isAdminEmail = email === 'admin@apex.local';
    const row = {
      user_id: userId, email: email, is_admin: isAdminEmail,
      meals_enabled: true, gym_enabled: true, history_enabled: true,
      vitals_enabled: true, huawei_enabled: true, step_goal: 10000
    };
    await sb.from('profiles').insert(row);
    if (!isAdminEmail) {
      const now = new Date();
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const mealRes = await sb.from('meals').insert({ user_id: userId, meal_type: 'breakfast', meal_date: today }).select().single();
      if (mealRes.data) {
        const items = SEED_BREAKFAST_ITEMS.map(function (it) {
          return { meal_id: mealRes.data.id, user_id: userId, food_name: it.food_name, calories: it.calories, protein: it.protein, fat: it.fat, carbs: it.carbs };
        });
        await sb.from('meal_items').insert(items);
      }
    }
    this.profile = row;
    return row;
  },

  renderMacroBars(totals) {
    const el = document.getElementById('macro-bars');
    if (!el) return;
    document.getElementById('macro-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const targets = {
      calories: this.profile && this.profile.calorie_target ? this.profile.calorie_target : DEFAULT_PROFILE.calorie_target,
      protein: this.profile && this.profile.protein_target ? this.profile.protein_target : DEFAULT_PROFILE.protein_target,
      fat: this.profile && this.profile.fat_target ? this.profile.fat_target : DEFAULT_PROFILE.fat_target,
      carbs: this.profile && this.profile.carb_target ? this.profile.carb_target : DEFAULT_PROFILE.carb_target
    };
    el.innerHTML = '';
    MACRO_STYLES.forEach(function (m) {
      const target = targets[m.key];
      const consumed = totals && totals[m.key] ? totals[m.key] : 0;
      const remaining = Math.max(0, target - consumed);
      const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
      const unit = m.key === 'calories' ? ' kcal' : 'g';
      const bar = document.createElement('div');
      bar.className = 'macro-item';
      bar.innerHTML = '<div class="macro-head"><span class="macro-label">' + m.label + '</span><span class="macro-nums"><b>' + Math.round(consumed) + '</b> / ' + target + unit + '</span></div><div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;background:' + m.color + '"></div></div><div class="macro-remaining">' + Math.round(remaining) + unit + ' left</div>';
      el.appendChild(bar);
    });
  },

  async renderOverview() {
    const sb = getSupabase();
    const userId = App.userId;
    const statsEl = document.getElementById('overview-stats');
    if (!statsEl || !sb || !userId) return;

    const vitals = await sb.from('vitals').select('*').eq('user_id', userId).order('log_date', { ascending: false }).limit(30);
    const meals = await sb.from('meals').select('id, meal_date').eq('user_id', userId);
    const workouts = await sb.from('workouts').select('id, workout_date').eq('user_id', userId);

    const v = vitals.data || [];
    const currentWeight = v.length && v[0].morning_weight ? v[0].morning_weight : (this.profile && this.profile.weight_lbs ? this.profile.weight_lbs : '—');
    const avgWeight = this.avgOfRecent(v, 7, 'morning_weight');
    const workoutsThisWeek = workouts.data ? workouts.data.length : 0;
    const mealsThisWeek = meals.data ? meals.data.length : 0;
    const streak = await this.computeStreak();

    const cards = [
      { label: 'Weight', value: currentWeight + ' lbs', icon: '⚖️' },
      { label: '7d Avg', value: avgWeight ? avgWeight.toFixed(1) + ' lbs' : 'N/A', icon: '📊' },
      { label: 'Workouts', value: workoutsThisWeek, icon: '🏋️' },
      { label: 'Meals', value: mealsThisWeek, icon: '🍽️' },
      { label: 'Streak', value: streak + ' days', icon: '🔥' },
      { label: 'Body Fat', value: this.profile && this.profile.body_fat_current ? this.profile.body_fat_current + '%' : 'N/A', icon: '📐' }
    ];
    statsEl.innerHTML = cards.map(function (c) {
      return '<div class="overview-stat fade-in"><span class="overview-stat-icon">' + c.icon + '</span><span class="overview-stat-value">' + c.value + '</span><span class="overview-stat-label">' + c.label + '</span></div>';
    }).join('');

    await this.renderPRs();
    await this.renderCharts(v);
  },

  async renderPRs() {
    const sb = getSupabase();
    const userId = App.userId;
    if (!sb || !userId) return;
    const prsRes = await sb.from('personal_records').select('*').eq('user_id', userId).order('weight', { ascending: false });
    let el = document.getElementById('pr-dashboard-card');
    if (!el) {
      const dashboard = document.getElementById('page-dashboard');
      if (!dashboard) return;
      el = document.createElement('section');
      el.className = 'card pr-card';
      el.id = 'pr-dashboard-card';
      el.innerHTML = '<h2 class="card-title">🏆 Personal Records</h2><div class="pr-list"></div>';
      dashboard.appendChild(el);
    }
    const listEl = el.querySelector('.pr-list');
    if (!listEl) return;
    const prs = prsRes.data || [];
    if (!prs.length) {
      listEl.innerHTML = '<p class="muted">No PRs yet. Enter them in the Gym tab.</p>';
      return;
    }
    listEl.innerHTML = prs.map(function (p) {
      return '<div class="pr-row"><span class="pr-exercise">' + escapeHtml(p.exercise_name) + '</span><span class="pr-value">' + p.weight + ' lb × 1</span><span class="pr-date muted">' + p.achieved_at + '</span></div>';
    }).join('');
  },

  avgOfRecent(rows, days, field) {
    const vals = rows.slice(-days).filter(function (r) { return r[field] != null; }).map(function (r) { return Number(r[field]); });
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
  },

  async computeStreak() {
    const sb = getSupabase();
    const userId = App.userId;
    const vitalsRes = await sb.from('vitals').select('log_date').eq('user_id', userId);
    const dates = new Set((vitalsRes.data || []).map(function (r) { return r.log_date; }));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (dates.has(key)) streak++;
      else if (i > 0) break;
    }
    return streak;
  },

  async renderCharts(vitals) {
    if (typeof ChartManager === 'undefined') return;
    const sb = getSupabase();
    const userId = App.userId;

    const weightRows = vitals.filter(function (r) { return r.morning_weight != null; }).map(function (r) {
      return { date: r.log_date, weight: Number(r.morning_weight) };
    });
    weightRows.sort(function (a, b) { return a.date.localeCompare(b.date); });

    if (weightRows.length >= 2) {
      const rawLabels = weightRows.map(function (r) { return r.date; });
      const rawData = weightRows.map(function (r) { return r.weight; });
      const rolling = [];
      for (let i = 0; i < weightRows.length; i++) {
        const start = Math.max(0, i - 6);
        const slice = weightRows.slice(start, i + 1);
        rolling.push(Math.round((slice.reduce(function (a, r) { return a + r.weight; }, 0) / slice.length) * 10) / 10);
      }
      ChartManager.line('weight-chart', rawLabels, [
        { label: 'Daily Weight', data: rawData, borderColor: 'rgba(139,148,158,0.5)', backgroundColor: 'transparent', tension: 0.35, pointRadius: 2.5, fill: false },
        { label: '7-Day Average', data: rolling, borderColor: '#4d6bfe', backgroundColor: 'rgba(77,107,254,0.15)', tension: 0.4, pointRadius: 0, borderWidth: 3, fill: true }
      ]);
    }

    const totals = MealLog.getTotals();
    const targets = {
      Calories: this.profile && this.profile.calorie_target ? this.profile.calorie_target : DEFAULT_PROFILE.calorie_target,
      Protein: this.profile && this.profile.protein_target ? this.profile.protein_target : DEFAULT_PROFILE.protein_target,
      Fat: this.profile && this.profile.fat_target ? this.profile.fat_target : DEFAULT_PROFILE.fat_target,
      Carbs: this.profile && this.profile.carb_target ? this.profile.carb_target : DEFAULT_PROFILE.carb_target
    };
    const consumed = { Calories: totals.calories, Protein: totals.protein, Fat: totals.fat, Carbs: totals.carbs };
    const nowDate = new Date();
    const todayStr = nowDate.getFullYear() + '-' + String(nowDate.getMonth() + 1).padStart(2, '0') + '-' + String(nowDate.getDate()).padStart(2, '0');

    const waterRes = await sb.from('water_logs').select('amount_ml').eq('user_id', userId).eq('log_date', todayStr);
    const waterTotal = (waterRes.data || []).reduce(function (a, r) { return a + Number(r.amount_ml); }, 0);

    const stepRes = await sb.from('manual_watch_logs').select('steps').eq('user_id', userId).eq('log_date', todayStr).maybeSingle();
    const todaySteps = (stepRes.data && stepRes.data.steps) ? stepRes.data.steps : 0;
    const stepGoal = this.profile && this.profile.step_goal ? this.profile.step_goal : 10000;

    // 6 metrics — no Sleep, no Workouts
    const radarLabels = ['Calories', 'Protein', 'Fat', 'Carbs', 'Water', 'Steps'];
    const radarData = [
      Math.min(100, Math.max(0, Math.round(consumed.Calories / targets.Calories * 100))),
      Math.min(100, Math.max(0, Math.round(consumed.Protein / targets.Protein * 100))),
      Math.min(100, Math.max(0, Math.round(consumed.Fat / targets.Fat * 100))),
      Math.min(100, Math.max(0, Math.round(consumed.Carbs / targets.Carbs * 100))),
      Math.min(100, Math.round(waterTotal / 3000 * 100)),
      Math.min(100, Math.round(todaySteps / stepGoal * 100))
    ];

    ChartManager.radar('macro-radar', radarLabels, [{
      label: 'Target Adherence',
      data: radarData,
      borderColor: '#4d6bfe',
      backgroundColor: 'rgba(77,107,254,0.15)',
      fill: true
    }]);

    const currentWeight = weightRows.length ? weightRows[weightRows.length - 1].weight : (this.profile && this.profile.weight_lbs ? this.profile.weight_lbs : 173);
    const bfRows = vitals.filter(function (r) { return r.estimated_body_fat != null; });
    const bodyFatPct = bfRows.length ? Number(bfRows[bfRows.length - 1].estimated_body_fat) : (this.profile && this.profile.body_fat_current ? this.profile.body_fat_current : 23);
    const fatMass = Math.round((currentWeight * bodyFatPct / 100) * 10) / 10;
    const leanMass = currentWeight - fatMass;
    const boneMass = Math.round(leanMass * 0.15 * 10) / 10;
    const muscleMass = Math.round((leanMass - boneMass) * 10) / 10;
    ChartManager.doughnut('macro-donut',
      ['Muscle (' + muscleMass + ' lbs)', 'Bone (' + boneMass + ' lbs)', 'Fat (' + fatMass + ' lbs)'],
      [muscleMass, boneMass, fatMass]
    );

    const workoutsRes = await sb.from('workouts').select('id, workout_date').eq('user_id', userId);
    const exercisesRes = await sb.from('workout_exercises').select('id, workout_id').eq('user_id', userId);
    const setsRes = await sb.from('exercise_sets').select('exercise_id, weight, reps').eq('user_id', userId);

    const workoutDateById = {};
    (workoutsRes.data || []).forEach(function (w) { workoutDateById[w.id] = w.workout_date; });
    const exerciseWorkoutDate = {};
    (exercisesRes.data || []).forEach(function (ex) { exerciseWorkoutDate[ex.id] = workoutDateById[ex.workout_id] || null; });

    const volumeByDate = {};
    (setsRes.data || []).forEach(function (s) {
      const date = exerciseWorkoutDate[s.exercise_id];
      if (!date) return;
      const vol = (Number(s.weight) || 0) * (Number(s.reps) || 0);
      volumeByDate[date] = (volumeByDate[date] || 0) + vol;
    });

    const now = new Date();
    const weekLabels = [];
    const weekVolumes = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - i * 7);
      let vol = 0;
      Object.entries(volumeByDate).forEach(function (entry) {
        const date = entry[0];
        const v = entry[1];
        const d = new Date(date);
        if (d >= weekStart && d < new Date(weekStart.getTime() + 7 * 86400000)) vol += v;
      });
      weekLabels.push(weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      weekVolumes.push(vol);
    }

    ChartManager.bar('calorie-chart', weekLabels, [{
      label: 'Weekly Volume (lb)',
      data: weekVolumes,
      backgroundColor: '#2ea043',
      borderRadius: 6
    }]);
  }
};

function startOfWeekStr() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
