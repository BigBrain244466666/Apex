var Admin = {
  bound: false,
  users: [],
  stats: null,

  bindUI: function () {
    if (this.bound) return;
    this.bound = true;
    var self = this;
    var refreshBtn = document.getElementById('admin-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { self.load(App.userId); });
  },

  async load(userId, token) {
    var sb = getSupabase();
    if (!sb) return;
    var usersRes = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (usersRes.error) return console.error(usersRes.error.message);
    if (token && token !== App.loadToken) return;
    this.users = (usersRes.data || []).filter(function (u) { return !u.is_admin; });
    this.renderUserTable();
    await this.loadStats();
  },

  async loadStats() {
    var statsEl = document.getElementById('admin-stats');
    if (!statsEl) return;
    statsEl.innerHTML = '<p class="muted">Loading stats…</p>';
    var sb = getSupabase();
    try {
      var statsRes = await sb.rpc('get_admin_stats');
      if (statsRes.error) throw new Error(statsRes.error.message);
      this.stats = statsRes.data || {};
      this.renderStats();
    } catch (err) {
      statsEl.innerHTML = '<p class="muted">Stats unavailable: ' + escapeHtml(err.message) + '</p>';
    }
  },

  renderStats() {
    var el = document.getElementById('admin-stats');
    if (!el) return;
    var s = this.stats || {};
    var totalUsers = this.users.length;
    var cards = [
      { label: 'Total Users', value: totalUsers },
      { label: 'Meals', value: s.totalMeals || 0 },
      { label: 'Food Items', value: s.totalMealItems || 0 },
      { label: 'Workouts', value: s.totalWorkouts || 0 },
      { label: 'Completed', value: s.completedWorkouts || 0 },
      { label: 'Vital Entries', value: s.totalVitals || 0 }
    ];
    var cardHtml = '';
    cards.forEach(function (c) {
      cardHtml += '<div class="admin-stat"><span class="admin-stat-value">' + c.value + '</span><span class="admin-stat-label">' + c.label + '</span></div>';
    });
    var avg = (s.avgDailyCalories && s.avgDailyCalories > 0) ? s.avgDailyCalories + ' kcal' : 'N/A';
    el.innerHTML =
      '<div class="admin-stats-grid">' + cardHtml + '</div>' +
      '<div class="admin-stats-extra"><p>Avg calories per logged day: <b>' + avg + '</b></p><p>Last activity: <b>' + (s.lastActivity ? new Date(s.lastActivity).toLocaleString() : 'N/A') + '</b></p></div>';
  },

  renderUserTable() {
    var tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!this.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No users found.</td></tr>';
      return;
    }
    var self = this;
    this.users.forEach(function (u) {
      var makeToggle = function (key) {
        var checked = u[key] !== false ? 'checked' : '';
        return '<label class="mini-switch"><input type="checkbox" data-user="' + escapeHtml(u.user_id) + '" data-key="' + key + '" ' + checked + ' /><span></span></label>';
      };
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(u.email || '—') + '</td>' +
        '<td>User</td>' +
        '<td>' + (u.weight_lbs || '—') + ' lbs</td>' +
        '<td>' + makeToggle('meals_enabled') + '</td>' +
        '<td>' + makeToggle('gym_enabled') + '</td>' +
        '<td>' + makeToggle('history_enabled') + '</td>' +
        '<td>' + makeToggle('huawei_enabled') + '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        self.toggleBlock(cb.dataset.user, cb.dataset.key, cb.checked);
      });
    });
  },

  async toggleBlock(userId, key, value) {
    var sb = getSupabase();
    var update = {};
    update[key] = value;
    var res = await sb.from('profiles').update(update).eq('user_id', userId);
    if (res.error) alert('Failed: ' + res.error.message);
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}