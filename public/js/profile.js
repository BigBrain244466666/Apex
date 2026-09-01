/* Profile editor — name, stats, goals, step goal, auto-calc */

const Profile = {
  bound: false,

  bindUI() {
    if (this.bound) return;
    this.bound = true;
    const self = this;

    document.getElementById('profile-btn')?.addEventListener('click', () => this.open());
    document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.save();
    });
    document.getElementById('auto-calc-btn')?.addEventListener('click', () => this.autoCalculate());
    document.querySelectorAll('[data-close-modal="profile-modal"]').forEach(el =>
      el.addEventListener('click', () => this.close())
    );
  },

  open() {
    const p = Dashboard.profile || {};
    function set(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }

    set('profile-name', p.display_name || '');
    set('profile-weight', p.weight_lbs);
    set('profile-height', p.height_cm);
    set('profile-bodyfat', p.body_fat_current);
    set('profile-goal', p.body_fat_goal);
    set('profile-gym', p.gym_frequency);
    set('profile-activity', p.activity_level || 'moderate');
    set('profile-step-goal', p.step_goal || 10000);
    set('profile-cal', p.calorie_target);
    set('profile-protein', p.protein_target);
    set('profile-fat', p.fat_target);
    set('profile-carbs', p.carb_target);

    document.getElementById('profile-modal')?.classList.remove('hidden');
  },

  close() {
    document.getElementById('profile-modal')?.classList.add('hidden');
  },

  autoCalculate() {
    const weightLbs = Number(document.getElementById('profile-weight').value);
    const heightCm = Number(document.getElementById('profile-height').value);
    const activity = document.getElementById('profile-activity').value;
    if (!weightLbs || !heightCm) return alert('Please enter weight and height first.');

    let bodyFat = Number(document.getElementById('profile-bodyfat').value);
    if (!bodyFat && typeof Vitals !== 'undefined') {
      const latest = Vitals.rows.filter(r => r.estimated_body_fat != null);
      if (latest.length) bodyFat = Number(latest[latest.length - 1].estimated_body_fat);
    }
    if (!bodyFat) return alert('Enter body fat % or log waist + neck in Body Metrics first.');

    const weightKg = weightLbs / 2.20462;
    const leanMassKg = weightKg * (1 - bodyFat / 100);
    const bmr = 370 + 21.6 * leanMassKg;
    const factors = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
    const factor = factors[activity] || 1.55;

    const calories = Math.round(bmr * factor - 500);
    const protein = Math.round(weightLbs * 1.0);
    const fat = Math.round(weightLbs * 0.4);
    const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);

    document.getElementById('profile-cal').value = calories > 0 ? calories : 0;
    document.getElementById('profile-protein').value = protein > 0 ? protein : 0;
    document.getElementById('profile-fat').value = fat > 0 ? fat : 0;
    document.getElementById('profile-carbs').value = carbs > 0 ? carbs : 0;
  },

  async save() {
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    function get(id) { return document.getElementById(id).value; }

    const updates = {
      display_name: get('profile-name') || null,
      weight_lbs: Number(get('profile-weight')) || null,
      height_cm: Number(get('profile-height')) || null,
      body_fat_current: Number(get('profile-bodyfat')) || null,
      body_fat_goal: get('profile-goal') || null,
      gym_frequency: get('profile-gym') || null,
      activity_level: get('profile-activity') || 'moderate',
      step_goal: Number(get('profile-step-goal')) || 10000,
      calorie_target: Number(get('profile-cal')) || null,
      protein_target: Number(get('profile-protein')) || null,
      fat_target: Number(get('profile-fat')) || null,
      carb_target: Number(get('profile-carbs')) || null
    };

    const res = await sb.from('profiles').update(updates).eq('user_id', userId);
    if (res.error) return alert(res.error.message);
    if (Dashboard.profile) Object.assign(Dashboard.profile, updates);
    this.close();
    App.refreshMacros();
  }
};
