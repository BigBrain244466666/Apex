/* ============ Apex app — final with 1s loader-first reveal ============ */

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
  },

  hide: function () {
    var self = this;
    var elapsed = Date.now() - this.shownAt;
    var minTime = 2000;

    function doHide() {
      var el = document.getElementById('aura-loader');
      if (el) el.classList.add('hidden-loader');
      if (self.hideTimer) { clearTimeout(self.hideTimer); self.hideTimer = null; }
      if (self.quoteTimer) { clearInterval(self.quoteTimer); self.quoteTimer = null; }
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
    }, 2000);
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
  revealTimer: null,

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
      dashView.classList.add('hidden');   // keep hidden until loader is visible for 1s
      this.userId = session.user.id;
      this.initApp();
      // do NOT reveal here — completeLoad() will after 1s
    } else {
      authView.classList.remove('hidden');
      dashView.classList.add('hidden');
      this.initAuth();
      AuraLoading.hide();
    }
  },

  completeLoad() {
    var self = this;
    var dash = document.getElementById('dashboard-view');
    if (!dash) return;

    var elapsed = AuraLoading.shownAt ? Date.now() - AuraLoading.shownAt : 0;
    var wait = Math.max(0, 1000 - elapsed); // reveal dashboard after 1s

    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(function () {
      dash.classList.remove('hidden');
      AuraLoading.hide();
      self.revealTimer = null;
    }, wait);
  },

  initAuth() {
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
          const signupResult = await Auth.signUp(email, password);

          // If email confirmation is OFF, Supabase returns a session immediately.
          if (signupResult.data && signupResult.data.session) {
            // Already signed in — the auth state change will route to dashboard.
            return;
          }

          // Confirmation is still ON — tell the user to check email.
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

  initApp() {
    if (!this.appBound) {
      this.appBound = true;

      var logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
          AuraLoading.show();
          setTimeout(function () { Auth.signOut(); }, 2000);
        });
      }

      var navMap = {
        'nav-dashboard': 'dashboard',
        'nav-nutrition': 'nutrition',
        'nav-watch': 'watch',
        'nav-gym': 'gym',
        'nav-history': 'history',
        'nav-admin': 'admin'
      };

      Object.keys(navMap).forEach(function (navId) {
        var el = document.getElementById(navId);
        if (el) {
          var pageId = navMap[navId];
          el.addEventListener('click', function () { App.showPage(pageId); });
        }
      });

      var bind = function (name, module, method) {
        try {
          if (module && typeof module[method] === 'function') module[method]();
          else console.warn('Module ' + name + ' missing');
        } catch (err) {
          console.warn('Failed to bind ' + name + ': ' + err.message);
        }
      };

      bind('Profile', typeof Profile !== 'undefined' ? Profile : null, 'bindUI');
      bind('MealLog', typeof MealLog !== 'undefined' ? MealLog : null, 'bindUI');
      bind('Vitals', typeof Vitals !== 'undefined' ? Vitals : null, 'bindForm');
      bind('Gym', typeof Gym !== 'undefined' ? Gym : null, 'bindUI');
      bind('Huawei', typeof Huawei !== 'undefined' ? Huawei : null, 'bindUI');
      bind('History', typeof History !== 'undefined' ? History : null, 'bindUI');
      bind('Admin', typeof Admin !== 'undefined' ? Admin : null, 'bindUI');
    }

    this.loadDashboardData();
    this.startPolling();
  },

  startPolling() {
    var self = this;
    if (this.pollTimer) return;
    this.pollTimer = setInterval(function () {
      if (self.userId) self.realtimeRefresh();
    }, 30000);
  },

  showPage(page) {
    this.currentPage = page;
    try { localStorage.setItem('apex-current-page', page); } catch (e) {}

    var pages = ['dashboard', 'nutrition', 'watch', 'gym', 'history', 'admin'];
    pages.forEach(function (p) {
      var el = document.getElementById('page-' + p);
      var nav = document.getElementById('nav-' + p);
      if (!el || !nav) return;
      if (p === page) {
        el.classList.remove('hidden');
        nav.classList.add('active');
      } else {
        el.classList.add('hidden');
        nav.classList.remove('active');
      }
    });
  },

  async loadDashboardData() {
    var token = ++this.loadToken;
    var sb = getSupabase();
    if (!sb) {
      this.completeLoad();
      return;
    }

    var prof = null;
    try {
      var res = await sb.from('profiles').select('*').eq('user_id', this.userId).maybeSingle();
      prof = res.data || null;
    } catch (err) {
      console.error('Profile fetch failed:', err.message);
      this.completeLoad();
      return;
    }

    Dashboard.profile = prof;

    var isAdmin = !!(prof && prof.is_admin === true);
    var adminNav = document.getElementById('nav-admin');
    var normalNavs = ['nav-dashboard', 'nav-nutrition', 'nav-watch', 'nav-gym', 'nav-history'];
    var profileBtn = document.getElementById('profile-btn');

    if (isAdmin) {
      adminNav.classList.remove('hidden');
      normalNavs.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
      if (profileBtn) profileBtn.classList.add('hidden');
      this.showPage('admin');
      try {
        if (typeof Admin !== 'undefined') await Admin.load(this.userId, token);
      } catch (e) {
        console.error('Admin load failed:', e.message);
      }
      this.completeLoad();
      return;
    }

    adminNav.classList.add('hidden');
    normalNavs.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    if (profileBtn) profileBtn.classList.remove('hidden');

    var p = prof || {};
    function toggle(id, condition) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', condition);
    }

    toggle('meal-card-section', p.meals_enabled === false);
    toggle('huawei-tiles-section', p.huawei_enabled === false);
    toggle('settings-card-section', p.huawei_enabled === false);

    try {
      if (typeof Huawei !== 'undefined') await Huawei.init(this.userId);
    } catch (e) {
      console.warn('Huawei init failed: ' + e.message);
    }

    await this.refreshModules(token);

    try {
      await Dashboard.renderOverview();
    } catch (e) {
      console.warn('Overview failed: ' + e.message);
    }

    var lastPage = null;
    try { lastPage = localStorage.getItem('apex-current-page'); } catch (e) {}
    var allowedPages = ['dashboard', 'nutrition', 'watch', 'gym', 'history'];
    if (lastPage && allowedPages.indexOf(lastPage) !== -1) this.showPage(lastPage);
    else this.showPage('dashboard');

    if (token === this.loadToken) this.refreshMacros();

    this.completeLoad();
  },

  async refreshModules(token) {
    var tasks = [];
    function run(module, method) {
      try {
        if (module && typeof module[method] === 'function') {
          tasks.push(module[method](App.userId, token));
        }
      } catch (e) {
        console.warn(e.message);
      }
    }

    run(typeof MealLog !== 'undefined' ? MealLog : null, 'load');
    run(typeof Vitals !== 'undefined' ? Vitals : null, 'load');
    run(typeof Gym !== 'undefined' ? Gym : null, 'load');
    run(typeof History !== 'undefined' ? History : null, 'load');

    await Promise.allSettled(tasks);

    if (token === App.loadToken) App.refreshMacros();
  },

  async realtimeRefresh() {
    var token = ++this.loadToken;
    var sb = getSupabase();
    if (!sb || !this.userId) return;

    try {
      var res = await sb.from('profiles').select('*').eq('user_id', this.userId).maybeSingle();
      Dashboard.profile = res.data || null;
    } catch (e) {}

    await this.refreshModules(token);

    try {
      await Dashboard.renderOverview();
    } catch (e) {}
  },

  setTotals(totals) { this.totals = totals; },

  refreshMacros() {
    try { Dashboard.renderMacroBars(MealLog.getTotals()); } catch (e) { console.warn(e.message); }
  }
};

document.addEventListener('DOMContentLoaded', function () { App.boot(); });