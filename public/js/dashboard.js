/* ============ Dashboard module — complete ============ */

function localTodayString() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function dashEscape(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    var map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[c];
  });
}

var DEFAULT_PROFILE = {
  weight_lbs: null,
  height_cm: 179,
  body_fat_current: null,
  body_fat_goal: null,
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

var SEED_BREAKFAST_ITEMS = [
  { food_name: '5 large eggs', calories: 360, protein: 31, fat: 25, carbs: 1 },
  { food_name: '88g pork sausage', calories: 310, protein: 15, fat: 27, carbs: 1 },
  { food_name: '78g Swiss cheese', calories: 280, protein: 20, fat: 21, carbs: 1 },
  { food_name: '1 cup skim milk', calories: 83, protein: 8, fat: 0, carbs: 12 },
  { food_name: 'Soy sauce', calories: 15, protein: 1, fat: 0, carbs: 3 }
];

var MACRO_STYLES = [
  { key: 'calories', label: 'Calories', color: '#4d6bfe' },
  { key: 'protein', label: 'Protein', color: '#2ea043' },
  { key: 'fat', label: 'Fat', color: '#d29922' },
  { key: 'carbs', label: 'Carbs', color: '#a371f7' }
];

var Dashboard = {
  profile: null,
  profilePromise: null,

  ensureProfile: function (userId) {
    if (this.profile) return Promise.resolve(this.profile);
    if (this.profilePromise) return this.profilePromise;

    this.profilePromise = this._doEnsureProfile(userId);
    return this.profilePromise;
  },

  _doEnsureProfile: async function (userId) {
    var sb = getSupabase();
    if (!sb) return null;

    var existingRes = await sb.from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingRes.data) {
      this.profile = existingRes.data;
      return existingRes.data;
    }

    var userRes = await sb.auth.getUser();
    var user = userRes.data ? userRes.data.user : null;
    var isAdminEmail = user && user.email === 'admin@apex.local';

    var profileRow = {
      user_id: userId,
      email: user ? user.email : null,
      is_admin: isAdminEmail,
      meals_enabled: true,
      gym_enabled: true,
      history_enabled: true,
      vitals_enabled: true,
      huawei_enabled: true
    };

    await sb.from('profiles').insert(profileRow);

    if (!isAdminEmail) {
      var today = localTodayString();
      var mealRes = await sb.from('meals').insert({
        user_id: userId,
        meal_type: 'breakfast',
        meal_date: today
      }).select().single();

      if (mealRes.data) {
        var items = SEED_BREAKFAST_ITEMS.map(function (it) {
          return {
            meal_id: mealRes.data.id,
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

  renderMacroBars: function (totals) {
    var el = document.getElementById('macro-bars');
    if (!el) return;

    var today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    var dateEl = document.getElementById('macro-date');
    if (dateEl) dateEl.textContent = today;

    var targets = {
      calories: this.profile && this.profile.calorie_target ? this.profile.calorie_target : DEFAULT_PROFILE.calorie_target,
      protein: this.profile && this.profile.protein_target ? this.profile.protein_target : DEFAULT_PROFILE.protein_target,
      fat: this.profile && this.profile.fat_target ? this.profile.fat_target : DEFAULT_PROFILE.fat_target,
      carbs: this.profile && this.profile.carb_target ? this.profile.carb_target : DEFAULT_PROFILE.carb_target
    };

    el.innerHTML = '';

    for (var i = 0; i < MACRO_STYLES.length; i++) {
      var m = MACRO_STYLES[i];
      var target = targets[m.key];
      var consumed = totals && totals[m.key] ? totals[m.key] : 0;
      var remaining = Math.max(0, target - consumed);
      var pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
      var unit = m.key === 'calories' ? ' kcal' : 'g';

      var bar = document.createElement('div');
      bar.className = 'macro-item';
      bar.innerHTML =
        '<div class="macro-head">' +
        '<span class="macro-label">' + m.label + '</span>' +
        '<span class="macro-nums"><b>' + Math.round(consumed) + '</b> / ' + target + unit + '</span>' +
        '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;background:' + m.color + '"></div></div>' +
        '<div class="macro-remaining">' + Math.round(remaining) + unit + ' left</div>';
      el.appendChild(bar);
    }
  },

  renderOverview: async function () {
    var sb = getSupabase();
    var userId = App.userId;
    var statsEl = document.getElementById('overview-stats');

    if (!statsEl || !sb || !userId) return;

    var now = new Date();
    var day = now.getDay();
    var diff = now.getDate() - day + (day === 0 ? -6 : 1);
    var monday = new Date(now);
    monday.setDate(diff);

    var startStr =
      monday.getFullYear() + '-' +
      String(monday.getMonth() + 1).padStart(2, '0') + '-' +
      String(monday.getDate()).padStart(2, '0');

    var todayStr = localTodayString();

    var vitalsRes = await sb.from('vitals')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(30);

    var mealsRes = await sb.from('meals')
      .select('id, meal_date')
      .eq('user_id', userId)
      .gte('meal_date', startStr)
      .lte('meal_date', todayStr);

    var workoutsRes = await sb.from('workouts')
      .select('id, workout_date')
      .eq('user_id', userId)
      .gte('workout_date', startStr)
      .lte('workout_date', todayStr);

    var vitalsRows = (vitalsRes.data || []).sort(function (a, b) {
      return a.log_date.localeCompare(b.log_date);
    });

    var todayVital = vitalsRows.length ? vitalsRows[vitalsRows.length - 1] : null;

    var currentWeight = todayVital && todayVital.morning_weight
      ? todayVital.morning_weight
      : (this.profile && this.profile.weight_lbs ? this.profile.weight_lbs : '—');

    var avgWeight = this.avgOfRecent(vitalsRows, 7, 'morning_weight');
    var waist = todayVital && todayVital.waist_circumference
      ? todayVital.waist_circumference
      : '—';

    var workoutsThisWeek = workoutsRes.data ? workoutsRes.data.length : 0;
    var mealsThisWeek = mealsRes.data ? mealsRes.data.length : 0;

    var statCards = [
      { label: 'Current Weight', value: currentWeight + ' lbs' },
      { label: '7-Day Avg Weight', value: avgWeight ? avgWeight.toFixed(1) + ' lbs' : 'N/A' },
      { label: 'Waist', value: waist + ' cm' },
      { label: 'Workouts This Week', value: workoutsThisWeek },
      { label: 'Meals This Week', value: mealsThisWeek },
      { label: 'Body Fat Goal', value: this.profile && this.profile.body_fat_goal ? this.profile.body_fat_goal : 'N/A' }
    ];

    var html = '';
    for (var i = 0; i < statCards.length; i++) {
      var c = statCards[i];
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

  avgOfRecent: function (rows, days, field) {
    var values = rows.slice(-days).filter(function (r) {
      return r[field] != null;
    }).map(function (r) {
      return Number(r[field]);
    });

    if (!values.length) return null;

    var sum = values.reduce(function (a, b) { return a + b; }, 0);
    return sum / values.length;
  },

  renderWeightChart: function (rows) {
    var el = document.getElementById('overview-weight-chart');
    if (!el) return;

    var points = rows
      .filter(function (r) { return r.morning_weight != null; })
      .map(function (r) {
        return { label: r.log_date, value: Number(r.morning_weight) };
      });

    if (points.length < 2) {
      el.innerHTML = '<p class="muted small">Log more weigh-ins to see a weight trend.</p>';
      return;
    }

    el.innerHTML = this.buildChartSVG(points);
  },

  renderCalorieChart: async function () {
    var el = document.getElementById('overview-calorie-chart');
    if (!el) return;

    var sb = getSupabase();
    var userId = App.userId;
    if (!sb || !userId) return;

    var start = new Date();
    start.setDate(start.getDate() - 13);
    var startStr =
      start.getFullYear() + '-' +
      String(start.getMonth() + 1).padStart(2, '0') + '-' +
      String(start.getDate()).padStart(2, '0');

    var mealsRes = await sb.from('meals')
      .select('id, meal_date')
      .eq('user_id', userId)
      .gte('meal_date', startStr);

    var itemsRes = await sb.from('meal_items')
      .select('meal_id, calories')
      .eq('user_id', userId);

    var calByMeal = {};
    var items = itemsRes.data || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      calByMeal[it.meal_id] = (calByMeal[it.meal_id] || 0) + (Number(it.calories) || 0);
    }

    var byDate = {};
    var meals = mealsRes.data || [];
    for (var j = 0; j < meals.length; j++) {
      var m = meals[j];
      byDate[m.meal_date] = (byDate[m.meal_date] || 0) + (calByMeal[m.id] || 0);
    }

    var dates = Object.keys(byDate).sort();
    var points = dates.map(function (d) {
      return { label: d, value: Math.round(byDate[d]) };
    });

    if (points.length < 2) {
      el.innerHTML = '<p class="muted small">Log a few days to see a calorie trend.</p>';
      return;
    }

    el.innerHTML = this.buildChartSVG(points);
  },

  buildChartSVG: function (dataPoints) {
    var w = 600;
    var h = 160;
    var pad = 30;

    var vals = dataPoints.map(function (d) { return d.value; });
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var range = (max - min) || 1;

    function xFor(i) {
      return pad + (i / (dataPoints.length - 1)) * (w - pad * 2);
    }

    function yFor(v) {
      return h - pad - ((v - min) / range) * (h - pad * 2);
    }

    var line = '';
    var dots = '';
    for (var i = 0; i < dataPoints.length; i++) {
      var x = xFor(i);
      var y = yFor(dataPoints[i].value);
      line += (i === 0 ? '' : ' ') + x + ',' + y;
      dots += '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="#4d6bfe" />';
    }

    return (
      '<svg viewBox="0 0 ' + w + ' ' + h + '" class="trend-chart" preserveAspectRatio="none">' +
      '<polyline points="' + line + '" fill="none" stroke="#4d6bfe" stroke-width="2" vector-effect="non-scaling-stroke" />' +
      dots +
      '</svg>' +
      '<div class="trend-chart-labels">' +
      '<span>' + dashEscape(dataPoints[0].label) + '</span>' +
      '<span>' + dashEscape(dataPoints[dataPoints.length - 1].label) + '</span>' +
      '</div>'
    );
  }
};