const DEFAULT_PROFILE = {
  weight_lbs: 173,
  height_cm: 179,
  body_fat_current: 23,
  body_fat_goal: '10-12%',
  gym_frequency: '5 days/week',
  calorie_target: 2100,
  protein_target: 170,
  fat_target: 60,
  carb_target: 220
};

const SEED_BREAKFAST = {
  food_name: '5 eggs, 88g pork sausage, 78g Swiss cheese, 1 cup skim milk, soy sauce',
  calories: 1048,
  protein: 75,
  fat: 72,
  carbs: 25
};

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
    const { data } = await sb.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (data) {
      this.profile = data;
      return data;
    }

    const profileRow = { user_id: userId, ...DEFAULT_PROFILE };
    await sb.from('profiles').insert(profileRow);

    const today = new Date().toISOString().slice(0, 10);
    await sb.from('meal_logs').insert({ user_id: userId, ...SEED_BREAKFAST, meal_date: today });

    this.profile = profileRow;
    return profileRow;
  },

  renderMacroBars(totals) {
    const el = document.getElementById('macro-bars');
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('macro-date').textContent = today;

    el.innerHTML = '';
    const targets = {
      calories: this.profile?.calorie_target ?? DEFAULT_PROFILE.calorie_target,
      protein: this.profile?.protein_target ?? DEFAULT_PROFILE.protein_target,
      fat: this.profile?.fat_target ?? DEFAULT_PROFILE.fat_target,
      carbs: this.profile?.carb_target ?? DEFAULT_PROFILE.carb_target
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
        <div class="macro-remaining">${Math.round(remaining)}${m.key === 'calories' ? ' kcal' : 'g'} remaining</div>
      `;
      el.appendChild(bar);
    }
  }
};
