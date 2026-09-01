/* Admin — user management, global stats, and diagnostic charts */

const Admin = {
  bound: false,
  users: [],
  stats: null,
  chartsRendered: false,

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    const refreshBtn = document.getElementById('admin-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.load(App.userId));
  },

  async load(userId, token) {
    const sb = getSupabase();
    if (!sb) return;

    const usersRes = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (usersRes.error) return console.error(usersRes.error.message);
    if (token && token !== App.loadToken) return;

    this.users = (usersRes.data || []).filter(u => !u.is_admin);
    this.renderUserTable();
    await this.loadStats();
    await this.loadDiagnostics();
  },

  async loadStats() {
    const el = document.getElementById('admin-stats');
    if (!el) return;
    el.innerHTML = '<p class="muted">Loading stats…</p>';

    const sb = getSupabase();
    try {
      const res = await sb.rpc('get_admin_stats');
      if (res.error) throw new Error(res.error.message);
      this.stats = res.data || {};
      this.renderStats();
    } catch (err) {
      el.innerHTML = '<p class="muted">Stats unavailable: ' + escapeHtml(err.message) + '</p>';
    }
  },

  renderStats() {
    const el = document.getElementById('admin-stats');
    if (!el) return;

    const s = this.stats || {};
    const cards = [
      { label: 'Total Users', value: this.users.length },
      { label: 'Meals', value: s.totalMeals || 0 },
      { label: 'Food Items', value: s.totalMealItems || 0 },
      { label: 'Workouts', value: s.totalWorkouts || 0 },
      { label: 'Completed Workouts', value: s.completedWorkouts || 0 },
      { label: 'Vital Entries', value: s.totalVitals || 0 }
    ];

    el.innerHTML = '<div class="admin-stats-grid">' + cards.map(c =>
      '<div class="admin-stat"><span class="admin-stat-value">' + c.value + '</span><span class="admin-stat-label">' + c.label + '</span></div>'
    ).join('') + '</div>';
  },

  renderUserTable() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!this.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No users found.</td></tr>';
      return;
    }

    const self = this;
    this.users.forEach(u => {
      // Get display name: use display_name if present, else email, else fallback
      const displayName = u.display_name || u.email || '—';

      const makeToggle = function (key) {
        const checked = u[key] !== false ? 'checked' : '';
        return '<label class="mini-switch"><input type="checkbox" data-user="' + escapeHtml(u.user_id) + '" data-key="' + key + '" ' + checked + ' /><span></span></label>';
      };

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(displayName) + '</td>' +
        '<td>' + (u.weight_lbs || '—') + ' lbs</td>' +
        '<td>' + makeToggle('meals_enabled') + '</td>' +
        '<td>' + makeToggle('gym_enabled') + '</td>' +
        '<td>' + makeToggle('history_enabled') + '</td>' +
        '<td>' + makeToggle('huawei_enabled') + '</td>' +
        '<td><button class="btn btn-ghost" data-del="' + u.user_id + '">Delete</button></td>';
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async () => {
        await self.toggleBlock(cb.dataset.user, cb.dataset.key, cb.checked);
      });
    });

    tbody.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', () => self.deleteUser(btn.dataset.del));
    });
  },

  async toggleBlock(userId, key, value) {
    const sb = getSupabase();
    const update = {};
    update[key] = value;
    const res = await sb.from('profiles').update(update).eq('user_id', userId);
    if (res.error) alert('Failed: ' + res.error.message);
  },

  async deleteUser(userId) {
    if (!confirm('Delete this user and ALL their data? This cannot be undone.')) return;
    const sb = getSupabase();
    const { error } = await sb.rpc('admin_delete_user', { target: userId });
    if (error) return alert(error.message);
    this.load(App.userId);
  },

  async loadDiagnostics() {
    if (this.chartsRendered) return;
    this.chartsRendered = true;

    const sb = getSupabase();
    if (!sb || typeof ChartManager === 'undefined') return;

    // Fetch all meals and workouts with user_id
    const mealsRes = await sb.from('meals').select('user_id');
    const workoutsRes = await sb.from('workouts').select('user_id');

    const mealCounts = {};
    (mealsRes.data || []).forEach(m => {
      mealCounts[m.user_id] = (mealCounts[m.user_id] || 0) + 1;
    });

    const workoutCounts = {};
    (workoutsRes.data || []).forEach(w => {
      workoutCounts[w.user_id] = (workoutCounts[w.user_id] || 0) + 1;
    });

    // Build name map: use display_name, fallback to email, then user_id
    const nameMap = {};
    this.users.forEach(u => {
      nameMap[u.user_id] = u.display_name || u.email || u.user_id.slice(0, 8) + '…';
    });

    const userIds = Array.from(new Set([...Object.keys(mealCounts), ...Object.keys(workoutCounts)]));
    const labels = userIds.map(id => {
      const name = nameMap[id] || id.slice(0, 8) + '…';
      // If it's an email, keep the whole thing, but for short names, we can keep as is.
      return name;
    });

    const mealData = userIds.map(id => mealCounts[id] || 0);
    const workoutData = userIds.map(id => workoutCounts[id] || 0);

    if (labels.length > 0) {
      ChartManager.bar('admin-meals-chart', labels, [{
        label: 'Meals',
        data: mealData,
        backgroundColor: '#4d6bfe',
        borderRadius: 6
      }]);

      ChartManager.bar('admin-workouts-chart', labels, [{
        label: 'Workouts',
        data: workoutData,
        backgroundColor: '#2ea043',
        borderRadius: 6
      }]);
    } else {
      const mealsCanvas = document.getElementById('admin-meals-chart');
      const workoutsCanvas = document.getElementById('admin-workouts-chart');
      if (mealsCanvas) mealsCanvas.parentElement.innerHTML = '<p class="muted">No data yet.</p>';
      if (workoutsCanvas) workoutsCanvas.parentElement.innerHTML = '<p class="muted">No data yet.</p>';
    }

    const totalWorkouts = this.stats ? (this.stats.totalWorkouts || 0) : 0;
    const completed = this.stats ? (this.stats.completedWorkouts || 0) : 0;
    const incomplete = Math.max(0, totalWorkouts - completed);

    if (totalWorkouts > 0) {
      ChartManager.doughnut('admin-activity-donut',
        ['Completed', 'Incomplete'],
        [completed, incomplete]
      );
    } else {
      const donutCanvas = document.getElementById('admin-activity-donut');
      if (donutCanvas) donutCanvas.parentElement.innerHTML = '<p class="muted">No workouts yet.</p>';
    }
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}