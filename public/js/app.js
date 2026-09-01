const App = {
  totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
  authBound: false,
  appBound: false,
  userId: null,
  loadToken: 0,

  async boot() {
    try {
      await loadAppConfig();
      const session = await Auth.getSession();
      this.route(session);
      Auth.onAuthChange(function (session) {
        App.route(session);
      });
    } catch (err) {
      console.error('Boot failed:', err);
    }
  },

  route(session) {
    const authView = document.getElementById('auth-view');
    const dashView = document.getElementById('dashboard-view');

    if (!authView || !dashView) return;

    if (session) {
      authView.classList.add('hidden');
      dashView.classList.remove('hidden');
      this.userId = session.user.id;
      if (typeof initRealtime === 'function') initRealtime(this.userId);
      this.initApp();
    }
  },

  initAuth() {
    if (this.authBound) return;
    this.authBound = true;

    const form = document.getElementById('auth-form');
    const loginTab = document.getElementById('tab-login');
    const signupTab = document.getElementById('tab-signup');
    const submitBtn = document.getElementById('auth-submit');
    const errEl = document.getElementById('auth-error');
    let mode = 'login';

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
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      errEl.classList.add('hidden');
      submitBtn.disabled = true;

      try {
        if (mode === 'signup') {
          await Auth.signUp(email, password);
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

      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
          Auth.signOut();
        });
      }

      const navMap = {
        'nav-dashboard': 'dashboard',
        'nav-nutrition': 'nutrition',
        'nav-watch': 'watch',
        'nav-gym': 'gym',
        'nav-history': 'history',
        'nav-admin': 'admin'
      };

      Object.keys(navMap).forEach(function (navId) {
        const el = document.getElementById(navId);
        if (el) {
          const pageId = navMap[navId];
          el.addEventListener('click', function () {
            App.showPage(pageId);
          });
        }
      });

      const bind = function (name, module, method) {
        try {
          if (module && typeof module[method] === 'function') {
            module[method]();
          } else {
            console.warn('Module ' + name + ' missing');
          }
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
  },

  showPage(page) {
    const pages = ['dashboard', 'nutrition', 'watch', 'gym', 'history', 'admin'];
    pages.forEach(function (p) {
      const el = document.getElementById('page-' + p);
      const nav = document.getElementById('nav-' + p);
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
    const token = ++this.loadToken;
    const sb = getSupabase();
    if (!sb) return;

    let prof = null;
    try {
      const { data } = await sb.from('profiles')
        .select('*')
        .eq('user_id', this.userId)
        .maybeSingle();
      prof = data || null;
    } catch (err) {
      console.error('Profile fetch failed:', err.message);
      return;
    }

    Dashboard.profile = prof;

    const isAdmin = !!(prof && prof.is_admin === true);
    const adminNav = document.getElementById('nav-admin');
    const normalNavs = ['nav-dashboard', 'nav-nutrition', 'nav-watch', 'nav-gym', 'nav-history'];
    const profileBtn = document.getElementById('profile-btn');

    if (isAdmin) {
      adminNav.classList.remove('hidden');
      normalNavs.forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });

      if (profileBtn) profileBtn.classList.add('hidden');

      this.showPage('admin');
      try {
        if (typeof Admin !== 'undefined') await Admin.load(this.userId, token);
      } catch (err) {
        console.error('Admin load failed:', err);
      }
      return;
    }

    adminNav.classList.add('hidden');
    normalNavs.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });

    if (profileBtn) profileBtn.classList.remove('hidden');

    this.showPage('dashboard');

    const p = prof || {};

    const toggle = function (id, condition) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', condition);
    };

    toggle('meal-card-section', p.meals_enabled === false);
    toggle('huawei-tiles-section', p.huawei_enabled === false);
    toggle('settings-card-section', p.huawei_enabled === false);

    try {
      if (typeof Huawei !== 'undefined') await Huawei.init(this.userId);
    } catch (err) {
      console.warn('Huawei init failed: ' + err.message);
    }

    const tasks = [];

    const run = function (module, method) {
      try {
        if (module && typeof module[method] === 'function') {
          tasks.push(module[method](App.userId, token));
        }
      } catch (err) {
        console.warn(method + ' failed: ' + err.message);
      }
    };

    run(typeof MealLog !== 'undefined' ? MealLog : null, 'load');
    run(typeof Vitals !== 'undefined' ? Vitals : null, 'load');
    run(typeof Gym !== 'undefined' ? Gym : null, 'load');
    run(typeof History !== 'undefined' ? History : null, 'load');

    await Promise.allSettled(tasks);

    try {
      await Dashboard.renderOverview();
    } catch (err) {
      console.warn('Overview failed: ' + err.message);
    }

    if (token === this.loadToken) {
      this.refreshMacros();
    }
  },

  setTotals(totals) {
    this.totals = totals;
  },

  refreshMacros() {
    try {
      Dashboard.renderMacroBars(MealLog.getTotals());
    } catch (err) {
      console.warn('Macro refresh failed: ' + err.message);
    }
  }
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

document.addEventListener('DOMContentLoaded', function () {
  App.boot();
});