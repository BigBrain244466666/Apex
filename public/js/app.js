const App = {
  totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
  authBound: false,
  appBound: false,
  userId: null,
  loadToken: 0,

  async boot() {
    await loadAppConfig();
    const session = await Auth.getSession();
    this.route(session);
    Auth.onAuthChange((session) => this.route(session));
  },

  route(session) {
    const authView = document.getElementById('auth-view');
    const dashView = document.getElementById('dashboard-view');

    if (session) {
      authView.classList.add('hidden');
      dashView.classList.remove('hidden');
      this.userId = session.user.id;
      this.initApp();
    } else {
      authView.classList.remove('hidden');
      dashView.classList.add('hidden');
      this.initAuth();
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

    const setMode = (m) => {
      mode = m;
      loginTab.classList.toggle('active', m === 'login');
      signupTab.classList.toggle('active', m === 'signup');
      submitBtn.textContent = m === 'login' ? 'Sign In' : 'Create Account';
      errEl.classList.add('hidden');
    };

    loginTab.addEventListener('click', () => setMode('login'));
    signupTab.addEventListener('click', () => setMode('signup'));

    form.addEventListener('submit', async (e) => {
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

      document.getElementById('logout-btn').addEventListener('click', async () => {
        await Auth.signOut();
      });

      document.getElementById('nav-dashboard').addEventListener('click', () => this.showPage('dashboard'));
      document.getElementById('nav-gym').addEventListener('click', () => this.showPage('gym'));
      document.getElementById('nav-history').addEventListener('click', () => this.showPage('history'));

      MealLog.bindUI();
      Vitals.bindForm();
      Gym.bindUI();
      Huawei.bindUI();
      History.bindUI();
    }

    this.loadDashboardData();
  },

  showPage(page) {
    const pages = ['dashboard', 'gym', 'history'];
    for (const p of pages) {
      const el = document.getElementById(`page-${p}`);
      const nav = document.getElementById(`nav-${p}`);
      if (p === page) {
        el.classList.remove('hidden');
        nav.classList.add('active');
      } else {
        el.classList.add('hidden');
        nav.classList.remove('active');
      }
    }
  },

  async loadDashboardData() {
    const token = ++this.loadToken;

    await Dashboard.ensureProfile(this.userId);
    await Huawei.init(this.userId);

    await Promise.all([
      MealLog.load(this.userId, token),
      Vitals.load(this.userId, token),
      Gym.load(this.userId, token),
      History.load(this.userId, token)
    ]);

    if (token === this.loadToken) {
      this.refreshMacros();
    }
  },

  setTotals(totals) {
    this.totals = totals;
  },

  refreshMacros() {
    Dashboard.renderMacroBars(MealLog.getTotals());
  }
};

// PWA service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => App.boot());
