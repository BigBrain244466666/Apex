const Profile = {
  bound: false,

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    document.getElementById('profile-btn').addEventListener('click', function () {
      Profile.open();
    });

    document.getElementById('profile-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      await Profile.save();
    });

    document.getElementById('auto-calc-btn').addEventListener('click', function () {
      Profile.autoCalculate();
    });

    document.querySelectorAll('[data-close-modal="profile-modal"]').forEach(function (el) {
      el.addEventListener('click', function () {
        Profile.close();
      });
    });
  },

  open() {
    const p = Dashboard.profile || {};
    const set = function (id, val) {
      document.getElementById(id).value = val || '';
    };

    set('profile-name', p.display_name || '');
    set('profile-weight', p.weight_lbs);
    set('profile-height', p.height_cm);
    set('profile-bodyfat', p.body_fat_current);
    set('profile-goal', p.body_fat_goal);
    set('profile-gym', p.gym_frequency);
    set('profile-activity', p.activity_level || 'moderate');
    set('profile-cal', p.calorie_target);
    set('profile-protein', p.protein_target);
    set('profile-fat', p.fat_target);
    set('profile-carbs', p.carb_target);

    document.getElementById('profile-modal').classList.remove('hidden');
  },

  close() {
    document.getElementById('profile-modal').classList.add('hidden');
  },

  autoCalculate() {
    const weightLbs = Number(document.getElementById('profile-weight').value);
    const heightCm = Number(document.getElementById('profile-height').value);
    const bodyFat = Number(document.getElementById('profile-bodyfat').value);
    const activity = document.getElementById('profile-activity').value;

    if (!weightLbs || !heightCm || !bodyFat) {
      alert('Please enter weight, height, and body fat % first.');
      return;
    }

    const weightKg = weightLbs / 2.20462;
    const leanMassKg = weightKg * (1 - bodyFat / 100);
    const bmr = 370 + 21.6 * leanMassKg;

    const activityFactors = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const factor = activityFactors[activity] || 1.55;

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

    const get = function (id) { return document.getElementById(id).value; };

    const updates = {
      display_name: get('profile-name') || null,
      weight_lbs: Number(get('profile-weight')) || null,
      height_cm: Number(get('profile-height')) || null,
      body_fat_current: Number(get('profile-bodyfat')) || null,
      body_fat_goal: get('profile-goal') || null,
      gym_frequency: get('profile-gym') || null,
      activity_level: get('profile-activity') || 'moderate',
      calorie_target: Number(get('profile-cal')) || null,
      protein_target: Number(get('profile-protein')) || null,
      fat_target: Number(get('profile-fat')) || null,
      carb_target: Number(get('profile-carbs')) || null
    };

    const { error } = await sb.from('profiles')
      .update(updates)
      .eq('user_id', userId);

    if (error) return alert('Save failed: ' + error.message);

    if (Dashboard.profile) {
      Object.assign(Dashboard.profile, updates);
    }

    this.close();
    App.refreshMacros();
  }
};