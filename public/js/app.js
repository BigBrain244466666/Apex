var AuraQuotes = [
  'The grind doesn\'t care how you feel. Show up.',
  'You\'re one workout from a better mood.',
  'Discipline is choosing what you want most over what you want now.',
  'The only bad workout is the one that didn\'t happen.',
  'Recomp is slow. Consistency is the cheat code.',
  'Strong body. Sharp mind. Apex standard.',
  'Every rep is a vote for who you\'re becoming.',
  'Progress is invisible until it isn\'t. Keep going.',
  'You are not tired. You are becoming.',
  'Apex: the highest point. That\'s the target.'
];

var AuraLoading = {
  quoteIndex: 0,
  quoteTimer: null,
  shownAt: 0,
  hideTimer: null,

  show: function () {
    var el = document.getElementById('aura-loader');
    if (el) el.classList.remove('hidden-loader');
    this.shownAt = Date.now();
    this.startQuotes();
    var self = this;
    setTimeout(function () { self.hide(); }, 8000);
  },

  hide: function (callback) {
    var self = this;
    var elapsed = Date.now() - this.shownAt;
    var minTime = 2000;

    function doHide() {
      var el = document.getElementById('aura-loader');
      if (el) el.classList.add('hidden-loader');
      if (self.hideTimer) { clearTimeout(self.hideTimer); self.hideTimer = null; }
      if (self.quoteTimer) { clearInterval(self.quoteTimer); self.quoteTimer = null; }
      if (typeof callback === 'function') callback();
    }

    if (elapsed < minTime) {
      if (!this.hideTimer) this.hideTimer = setTimeout(doHide, minTime - elapsed);
    } else {
      doHide();
    }
  },

  startQuotes: function () {
    var self = this;
    var el = document.getElementById('aura-quote');
    if (!el) return;
    if (this.quoteTimer) clearInterval(this.quoteTimer);
    this.quoteIndex = Math.floor(Math.random() * AuraQuotes.length);
    el.textContent = AuraQuotes[this.quoteIndex];
    el.style.opacity = '1';
    this.quoteTimer = setInterval(function () {
      var quoteEl = document.getElementById('aura-quote');
      if (!quoteEl) return;
      quoteEl.style.opacity = '0';
      setTimeout(function () {
        self.quoteIndex = (self.quoteIndex + 1) % AuraQuotes.length;
        quoteEl.textContent = AuraQuotes[self.quoteIndex];
        quoteEl.style.opacity = '1';
      }, 400);
    }, 2200);
  }
};

var App = {
  totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
  authBound: false,
  appBound: false,
  userId: null,
  loadToken: 0,
  currentPage: 'dashboard',
  pollTimer: null,

  async boot() {
    AuraLoading.show();
    try {
      await loadAppConfig();
      var session = await Auth.getSession();
      this.route(session);
      Auth.onAuthChange(function (session) { App.route(session); });
    } catch (err) {
      console.error('Boot failed:', err);
      AuraLoading.hide();
    }
  },

  route(session) {
    var authView = document.getElementById('auth-view');
    var dashView = document.getElementById('dashboard-view');
    if (!authView || !dashView) return;

    if (session) {
      AuraLoading.show();
      authView.classList.add('hidden');
      dashView.classList.add('hidden');
      this.userId = session.user.id;
      this.initApp();
    } else {
      authView.classList.add('hidden');
      dashView.classList.add('hidden');
      this.initAuth();
      AuraLoading.hide(function () { authView.classList.remove('hidden'); });
    }
  },

  revealDashboard: function () {
    var dash = document.getElementById('dashboard-view');
    if (dash) dash.classList.remove('hidden');
  },

  initAuth: function () {
    if (this.authBound) return;
    this.authBound = true;

    var form = document.getElementById('auth-form');
    var loginTab = document.getElementById('tab-login');
    var signupTab = document.getElementById('tab-signup');
    var submitBtn = document.getElementById('auth-submit');
    var errEl = document.getElementById('auth-error');
    var mode = 'login';

    function setMode(m) {
      mode = m;
      loginTab.classList.toggle('active', m === 'login');
      signupTab.classList.toggle('active', m === 'signup');
      submitBtn.textContent = m === 'login' ? 'Sign In' : 'Create Account';
      errEl.classList.add('hidden');
    }
    loginTab.addEventListener('click', function () { setMode('login'); });
    signupTab.addEventListener('click', function () { setMode('signup'); });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = document.getElementById('auth-email').value.trim();
      var password = document.getElementById('auth-password').value;
      errEl.classList.add('hidden');
      submitBtn.disabled = true;
      try {
        if (mode === 'signup') {
          var result = await Auth.signUp(email, password);
          if (result.data && result.data.session) return;
          errEl.textContent = 'Check your email to confirm your account, then sign in.';
          errEl.classList.remove('hidden');
        } else {
          await Auth.signIn(email, password);
        }
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
      }
    });
  },

  initApp: function () {
    if (!this.appBound) {
      this.appBound = true;

      document.getElementById('logout-btn').addEventListener('click', function () {
        AuraLoading.show();
        setTimeout(function () { Auth.signOut(); }, 2000);
      });

      var navMap = {
        'nav-dashboard': 'dashboard',
        'nav-nutrition': 'nutrition',
        'nav-watch': 'watch',
        'nav-gym': 'gym',
        'nav-history': 'history',
        'nav-social': 'social',
        'nav-admin': 'admin'
      };
      Object.keys(navMap).forEach(function (navId) {
        var el = document.getElementById(navId);
        if (el) {
          var pageId = navMap[navId];
          el.addEventListener('click', function () { App.showPage(pageId); });
        }
      });

      var moreBtn = document.getElementById('nav-more');
      var moreDropdown = document.getElementById('more-dropdown');
      if (moreBtn && moreDropdown) {
        // --- FIX: remove the hidden class so the button can be shown on mobile ---
        moreBtn.classList.remove('hidden');

        var itemsHtml = '';
        document.querySelectorAll('[data-more="true"]').forEach(function (tab) {
          // Skip the more button itself
          if (tab.id === 'nav-more') return;
          itemsHtml += '<button class="more-item" data-page-id="' + tab.id + '">' + tab.textContent.trim() + '</button>';
        });
        moreDropdown.innerHTML = itemsHtml;
        moreBtn.addEventListener('click', function (e) { e.stopPropagation(); moreDropdown.classList.toggle('hidden'); });
        moreDropdown.addEventListener('click', function (e) {
          var item = e.target.closest('.more-item');
          if (!item) return;
          App.showPage(item.getAttribute('data-page-id').replace('nav-', ''));
          moreDropdown.classList.add('hidden');
        });
        document.addEventListener('click', function (e) {
          if (!moreDropdown.classList.contains('hidden') && !moreDropdown.contains(e.target) && e.target !== moreBtn) {
            moreDropdown.classList.add('hidden');
          }
        });
      }

      var bind = function (name, module, method) {
        try {
          if (module && typeof module[method] === 'function') module[method]();
          else console.warn('Module ' + name + ' missing');
        } catch (err) {
          console.warn('Failed to bind ' + name + ': ' + err.message);
        }
      };
      bind('ChartManager', typeof ChartManager !== 'undefined' ? ChartManager : null, 'init');
      bind('Profile', typeof Profile !== 'undefined' ? Profile : null, 'bindUI');
      bind('Water', typeof Water !== 'undefined' ? Water : null, 'bindUI');
      bind('MealLog', typeof MealLog !== 'undefined' ? MealLog : null, 'bindUI');
      bind('Vitals', typeof Vitals !== 'undefined' ? Vitals : null, 'bindForm');
      bind('Gym', typeof Gym !== 'undefined' ? Gym : null, 'bindUI');
      bind('Huawei', typeof Huawei !== 'undefined' ? Huawei : null, 'bindUI');
      bind('ManualWatch', typeof ManualWatch !== 'undefined' ? ManualWatch : null, 'bindUI');
      bind('History', typeof History !== 'undefined' ? History : null, 'bindUI');
      bind('Friends', typeof Friends !== 'undefined' ? Friends : null, 'bindUI');
      bind('Theme', typeof Theme !== 'undefined' ? Theme : null, 'bindUI');
      bind('Admin', typeof Admin !== 'undefined' ? Admin : null, 'bindUI');
    }

    this.loadDashboardData();
    this.startPolling();
  },

  startPolling: function () {
    var self = this;
    if (this.pollTimer) return;
    this.pollTimer = setInterval(function () { if (self.userId) self.realtimeRefresh(); }, 30000);
  },

  showPage: function (page) {
    this.currentPage = page;
    try { localStorage.setItem('apex-current-page', page); } catch (e) {}
    var pages = ['dashboard', 'nutrition', 'watch', 'gym', 'history', 'social', 'admin'];
    pages.forEach(function (p) {
      var el = document.getElementById('page-' + p);
      var nav = document.getElementById('nav-' + p);
      if (!el || !nav) return;
      if (p === page) { el.classList.remove('hidden'); nav.classList.add('active'); }
      else { el.classList.add('hidden'); nav.classList.remove('active'); }
    });
  },

  async loadDashboardData() {
    var token = ++this.loadToken;
    var sb = getSupabase();
    if (!sb) { AuraLoading.hide(); return; }

    try {
      var res = await sb.from('profiles').select('*').eq('user_id', this.userId).maybeSingle();
      var prof = res.data || null;
      Dashboard.profile = prof;

      var isAdmin = !!(prof && prof.is_admin === true);
      var adminNav = document.getElementById('nav-admin');
      var normalNavs = ['nav-dashboard', 'nav-nutrition', 'nav-watch', 'nav-gym', 'nav-history', 'nav-social'];
      var profileBtn = document.getElementById('profile-btn');

      if (isAdmin) {
        adminNav.classList.remove('hidden');
        normalNavs.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.classList.add('hidden');
        });
        if (profileBtn) profileBtn.classList.add('hidden');
        this.showPage('admin');
        if (typeof Admin !== 'undefined') await Admin.load(this.userId, token);
        AuraLoading.hide(this.revealDashboard.bind(this));
        return;
      }

      adminNav.classList.add('hidden');
      normalNavs.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
      });

      if (profileBtn) {
        profileBtn.classList.remove('hidden');
        var displayName = '';
        if (prof && prof.display_name) displayName = prof.display_name;
        else if (prof && prof.email) displayName = prof.email.split('@')[0];
        else displayName = 'Profile';
        profileBtn.textContent = displayName;
      }

      var p = prof || {};
      function toggle(id, condition) {
        var el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', condition);
      }
      toggle('meal-card-section', p.meals_enabled === false);
      toggle('huawei-tiles-section', p.huawei_enabled === false);

      await this.refreshModules(token);
      if (typeof Dashboard.renderOverview === 'function') await Dashboard.renderOverview();

      var lastPage = null;
      try { lastPage = localStorage.getItem('apex-current-page'); } catch (e) {}
      var allowedPages = ['dashboard', 'nutrition', 'watch', 'gym', 'history', 'social'];
      if (lastPage && allowedPages.indexOf(lastPage) !== -1) this.showPage(lastPage);
      else this.showPage('dashboard');

      if (token === this.loadToken) this.refreshMacros();
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      AuraLoading.hide(this.revealDashboard.bind(this));
    }
  },

  async refreshModules(token) {
    var tasks = [];
    function run(module, method) {
      try { if (module && typeof module[method] === 'function') tasks.push(module[method](App.userId, token)); }
      catch (e) { console.warn(e.message); }
    }
    run(typeof Water !== 'undefined' ? Water : null, 'load');
    run(typeof MealLog !== 'undefined' ? MealLog : null, 'load');
    run(typeof Vitals !== 'undefined' ? Vitals : null, 'load');
    run(typeof Gym !== 'undefined' ? Gym : null, 'load');
    run(typeof History !== 'undefined' ? History : null, 'load');
    run(typeof Friends !== 'undefined' ? Friends : null, 'load');
    run(typeof ManualWatch !== 'undefined' ? ManualWatch : null, 'loadHistory');
    await Promise.allSettled(tasks);
    if (token === App.loadToken) App.refreshMacros();
  },

  async realtimeRefresh() {
    var token = ++this.loadToken;
    var sb = getSupabase();
    if (!sb || !this.userId) return;
    try {
      var res = await sb.from('profiles').select('*').eq('user_id', this.userId).maybeSingle();
      Dashboard.profile = res.data || Dashboard.profile;
    } catch (e) {}
    await this.refreshModules(token);
    try { if (typeof Dashboard.renderOverview === 'function') await Dashboard.renderOverview(); } catch (e) {}
  },

  setTotals: function (totals) { this.totals = totals; },
  refreshMacros: function () {
    try { Dashboard.renderMacroBars(MealLog.getTotals()); } catch (e) { console.warn(e.message); }
  }
};

document.addEventListener('DOMContentLoaded', function () { App.boot(); });