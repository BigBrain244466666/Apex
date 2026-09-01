const Admin = {
  bound: false,
  users: [],
  stats: null,

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    const refreshBtn = document.getElementById('admin-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        Admin.load();
      });
    }
  },

  async load(userId, token) {
    const sb = getSupabase();
    if (!sb) return;

    const { data: users, error } = await sb.from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Admin users load failed:', error.message);
      return;
    }

    if (token && token !== App.loadToken) return;

    this.users = (users || []).filter(function (u) {
      return !u.is_admin;
    });

    this.renderUserTable();
    await this.loadStats();
  },

  async loadStats() {
    const statsEl = document.getElementById('admin-stats');
    if (!statsEl) return;

    statsEl.innerHTML = '<p class="muted">Loading stats…</p>';

    try {
      const sb = getSupabase();
      const { data, error } = await sb.rpc('get_admin_stats');

      if (error) {
        throw new Error(error.message);
      }

      this.stats = data || {};
      this.renderStats();
    } catch (err) {
      statsEl.innerHTML = '<p class="muted">Stats unavailable: ' + escapeHtml(err.message) + '</p>';
    }
  },

  renderStats() {
    const el = document.getElementById('admin-stats');
    if (!el) return;

    const s = this.stats || {};
    const totalUsers = this.users.length;

    const cards = [
      { label: 'Total Users', value: totalUsers },
      { label: 'Meals', value: s.totalMeals || 0 },
      { label: 'Food Items', value: s.totalMealItems || 0 },
      { label: 'Workouts', value: s.totalWorkouts || 0 },
      { label: 'Completed', value: s.completedWorkouts || 0 },
      { label: 'Vital Entries', value: s.totalVitals || 0 }
    ];

    let cardHtml = '';
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      cardHtml +=
        '<div class="admin-stat">' +
        '<span class="admin-stat-value">' + c.value + '</span>' +
        '<span class="admin-stat-label">' + c.label + '</span>' +
        '</div>';
    }

    const avg = (s.avgDailyCalories && s.avgDailyCalories > 0)
      ? s.avgDailyCalories + ' kcal'
      : 'N/A';

    const lastActivity = s.lastActivity
      ? new Date(s.lastActivity).toLocaleString()
      : 'N/A';

    el.innerHTML =
      '<div class="admin-stats-grid">' + cardHtml + '</div>' +
      '<div class="admin-stats-extra">' +
      '<p>Avg calories per logged day: <b>' + avg + '</b></p>' +
      '<p>Last activity: <b>' + lastActivity + '</b></p>' +
      '</div>';
  },

  renderUserTable() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!this.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No users found.</td></tr>';
      return;
    }

    for (let i = 0; i < this.users.length; i++) {
      const u = this.users[i];

      const email = u.email || '—';
      const role = 'User';
      const weight = u.weight_lbs ? u.weight_lbs + ' lbs' : '—';

      const makeToggle = function (key) {
        const checked = u[key] !== false ? 'checked' : '';
        return (
          '<label class="mini-switch">' +
          '<input type="checkbox" data-user="' + escapeHtml(u.user_id) + '" data-key="' + key + '" ' + checked + ' />' +
          '<span></span>' +
          '</label>'
        );
      };

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(email) + '</td>' +
        '<td>' + role + '</td>' +
        '<td>' + weight + '</td>' +
        '<td>' + makeToggle('meals_enabled') + '</td>' +
        '<td>' + makeToggle('gym_enabled') + '</td>' +
        '<td>' + makeToggle('history_enabled') + '</td>' +
        '<td>' + makeToggle('huawei_enabled') + '</td>';

      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', async function () {
        const userId = cb.dataset.user;
        const key = cb.dataset.key;
        await Admin.toggleBlock(userId, key, cb.checked);
      });
    });
  },

  async toggleBlock(userId, key, value) {
    const sb = getSupabase();
    const update = {};
    update[key] = value;

    const { error } = await sb.from('profiles')
      .update(update)
      .eq('user_id', userId);

    if (error) {
      alert('Failed to update: ' + error.message);
    }
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}