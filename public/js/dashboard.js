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
      const today = new Date().toISOString().slice(0, 10);
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

    for (const m of MACRO_STYLES) {
      const target = targets[m.key];
      const consumed = totals[m.key] || 0;
      const remaining = Math.max(0, target - consumed);
      const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;

      const bar = document.createElement('div');
      bar.className = 'macro-item';
      bar.innerHTML = `
        <div class="macro-head">
          <span class="macro-label">${m.label}</span>
          <span class="macro-nums"><b>${Math.round(consumed)}</b> / ${target}${m.key === 'calories' ? ' kcal' : 'g'}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${m.color}"></div>
        </div>
        <div class="macro-remaining">${Math.round(remaining)}${m.key === 'calories' ? ' kcal' : 'g'} left</div>
      `;
      el.appendChild(bar);
    }
  }
};