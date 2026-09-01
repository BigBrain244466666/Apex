/* Dashboard module: ensure profile, macro bars, and overview stats + charts. */

const DEFAULT_PROFILE = {
  weight_lbs: 173,
  height_cm: 179,
  body_fat_current: 23,
  body_fat_goal: '10-12%',
  gym_frequency: '5 days/week',
  calorie_target: 2100,
  protein_target: 170,
  fat_target: 60,
  carb_target: 220,
  is_admin: false,
  meals_enabled: true,
  gym_enabled: true,
  history_enabled: true,
  vitals_enabled: true,
  huawei_enabled: true
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
  profilePromise: null,

  ensureProfile(userId) {
    if (this.profile) return Promise.resolve(this.profile);
    if (this.profilePromise) return this.profilePromise;
    this.profilePromise = this._doEnsureProfile(userId);
    return this.profilePromise;
  },

  async _doEnsureProfile(userId) {
    const sb = getSupabase();
    const { data: existing } = await sb.from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      this.profile = existing;
      return existing;
    }

    const user = (await sb.auth.getUser()).data.user;
    const isAdminEmail = user && user.email === 'admin@apex.local';

    const profileRow = {
      user_id: userId,
      email: user ? user.email : null,
      is_admin: isAdminEmail,
      ...DEFAULT_PROFILE
    };

    await sb.from('profiles').insert(profileRow);

    if (!isAdminEmail) {
      const today = localToday();
      const { data: meal } = await sb.from('meals').insert({
        user_id: userId,
        meal_type: 'breakfast',
        meal_date: today
      }).select().single();

      if (meal) {
        const items = SEED_BREAKFAST_ITEMS.map(function (it) {
          return {
            meal_id: meal.id,
            user_id: userId,
            food_name: it.food_name,
            calories: it.calories,
            protein: it.protein,
            fat: it.fat,
            carbs: it.carbs
          };
        });
        await sb.from('meal_items').insert(items);
      }
    }

    this.profile = profileRow;
    return profileRow;
  },

  renderMacroBars(totals) {
    const el = document.getElementById('macro-bars');
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('macro-date').textContent = today;

    el.innerHTML = '';
    const targets = {
      calories: this.profile && this.profile.calorie_target ? this.profile.calorie_target : DEFAULT_PROFILE.calorie_target,
      protein: this.profile && this.profile.protein_target ? this.profile.protein_target : DEFAULT_PROFILE.protein_target,
      fat: this.profile && this.profile.fat_target ? this.profile.fat_target : DEFAULT_PROFILE.fat_target,
      carbs: this.profile && this.profile.carb_target ? this.profile.carb_target : DEFAULT_PROFILE.carb_target
    };

    for (let i = 0; i < MACRO_STYLES.length; i++) {
      const m = MACRO_STYLES[i];
      const target = targets[m.key];
      const consumed = totals[m.key] || 0;
      const remaining = Math.max(0, target - consumed);
      const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;

      const bar = document.createElement('div');
      bar.className = 'macro-item';
      bar.innerHTML =
        '<div class="macro-head">' +
        '<span class="macro-label">' + m.label + '</span>' +
        '<span class="macro-nums"><b>' + Math.round(consumed) + '</b> / ' + target + (m.key === 'calories' ? ' kcal' : 'g') + '</span>' +
        '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;background:' + m.color + '"></div></div>' +
        '<div class="macro-remaining">' + Math.round(remaining) + (m.key === 'calories' ? ' kcal' : 'g') + ' left</div>';
      el.appendChild(bar);
    }
  },

  async renderOverview() {
    const sb = getSupabase();
    const userId = App.userId;
    const statsEl = document.getElementById('overview-stats');

    if (!statsEl || !sb) return;

    // Collect recent vitals, meals, workouts for overview.
    const today = localToday();

    const { data: vitals } = await sb.from('vitals')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(30);

    const todayStr = localToday();

    const { data: meals } = await sb.from('meals')
      .select('id, meal_date')
      .eq('user_id', userId)
      .gte('meal_date', todayStr);

    const { data: workouts } = await sb.from('workouts')
      .select('id, workout_date')
      .eq('user_id', userId)
      .gte('workout_date', todayStr);

    const vitalsRows = (vitals || []).sort((a, b) => a.log_date.localeCompare(b.log_date));
    const todayVital = vitalsRows[vitalsRows.length - 1];

    const currentWeight = todayVital && todayVital.morning_weight ? todayVital.morning_weight : (this.profile ? this.profile.weight_lbs : '—');
    const avgWeight = this.avgOfRecent(vitalsRows, 7, 'morning_weight');
    const waist = todayVital && todayVital.waist_circumference ? todayVital.waist_circumference : '—';
    const workoutsThisWeek = workouts ? workouts.length : 0;
    const totalMealsThisWeek = meals ? meals.length : 0;

    const statCards = [
      { label: 'Current Weight', value: currentWeight + ' lbs' },
      { label: '7-Day Avg Weight', value: avgWeight ? avgWeight.toFixed(1) + ' lbs' : 'N/A' },
      { label: 'Waist', value: waist + ' cm' },
      { label: 'Workouts This Week', value: workoutsThisWeek },
      { label: 'Meals This Week', value: totalMealsThisWeek },
      { label: 'Body Fat Goal', value: this.profile && this.profile.body_fat_goal ? this.profile.body_fat_goal : 'N/A' }
    ];

    let html = '';
    for (let i = 0; i < statCards.length; i++) {
      const c = statCards[i];
      html +=
        '<div class="overview-stat">' +
        '<span class="overview-stat-value">' + c.value + '</span>' +
        '<span class="overview-stat-label">' + c.label + '</span>' +
        '</div>';
    }
    statsEl.innerHTML = html;

    this.renderWeightChart(vitalsRows);
    await this.renderCalorieChart();
  },

  avgOfRecent(rows, days, field) {
    const values = rows.slice(-days).filter(function (r) { return r[field] != null; }).map(function (r) { return Number(r[field]); });
    if (!values.length) return null;
    return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  },

  renderWeightChart(rows) {
    const el = document.getElementById('overview-weight-chart');
    if (!el) return;
    const points = rows
      .filter(function (r) { return r.morning_weight != null; })
      .map(function (r) { return { label: r.log_date, value: Number(r.morning_weight) }; });

    if (points.length < 2) {
      el.innerHTML = '<p class="muted small">Log more weigh-ins to see a weight trend.</p>';
      return;
    }
    el.innerHTML = this.buildChartSVG(points);
  },

  async renderCalorieChart() {
    const el = document.getElementById('overview-calorie-chart');
    if (!el) return;
    const sb = getSupabase();
    const userId = App.userId;

    const start = new Date();
    start.setDate(start.getDate() - 13);
    const startStr = start.toISOString().slice(0, 10);

    const { data: meals } = await sb.from('meals')
      .select('id, meal_date')
      .eq('user_id', userId)
      .gte('meal_date', startStr);

    const { data: items } = await sb.from('meal_items')
      .select('meal_id, calories')
      .eq('user_id', userId);

    const calByMeal = {};
    for (const it of items || []) {
      calByMeal[it.meal_id] = (calByMeal[it.meal_id] || 0) + (Number(it.calories) || 0);
    }

    const byDate = {};
    for (const m of meals || []) {
      byDate[m.meal_date] = (byDate[m.meal_date] || 0) + (calByMeal[m.id] || 0);
    }

    const dates = Object.keys(byDate).sort();
    const points = dates.map(function (d) { return { label: d, value: Math.round(byDate[d]) }; });

    if (points.length < 2) {
      el.innerHTML = '<p class="muted small">Log a few days to see a calorie trend.</p>';
      return;
    }
    el.innerHTML = this.buildChartSVG(points);
  },

  buildChartSVG(dataPoints) {
    const w = 600;
    const h = 160;
    const pad = 30;
    const vals = dataPoints.map(function (d) { return d.value; });
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const range = (max - min) || 1;

    const xFor = function (i) { return pad + (i / (dataPoints.length - 1)) * (w - pad * 2); };
    const yFor = function (v) { return h - pad - ((v - min) / range) * (h - pad * 2); };

    let line = '';
    let dots = '';
    for (let i = 0; i < dataPoints.length; i++) {
      const x = xFor(i);
      const y = yFor(dataPoints[i].value);
      line += (i === 0 ? '' : ' ') + x + ',' + y;
      dots += '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="#4d6bfe" />';
    }

    return (
      '<svg viewBox="0 0 ' + w + ' ' + h + '" class="trend-chart" preserveAspectRatio="none">' +
      '<polyline points="' + line + '" fill="none" stroke="#4d6bfe" stroke-width="2" vector-effect="non-scaling-stroke" />' +
      dots +
      '</svg>' +
      '<div class="trend-chart-labels"><span>' + escapeHtml(dataPoints[0].label) + '</span><span>' + escapeHtml(dataPoints[dataPoints.length - 1].label) + '</span></div>'
    );
  }
};
