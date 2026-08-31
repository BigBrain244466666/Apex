const App = {
  totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
  authBound: false,
  appBound: false,
  userId: null,

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

      // Page navigation
      document.getElementById('nav-dashboard').addEventListener('click', () => this.showPage('dashboard'));
      document.getElementById('nav-gym').addEventListener('click', () => this.showPage('gym'));

      // Bind all modules
      MealLog.bindUI();
      Vitals.bindForm();
      Gym.bindUI();
    }

    // Load data for both pages (fresh on every auth state change).
    this.loadDashboardData();
  },

  showPage(page) {
    const dashPage = document.getElementById('page-dashboard');
    const gymPage = document.getElementById('page-gym');
    const navDash = document.getElementById('nav-dashboard');
    const navGym = document.getElementById('nav-gym');

    if (page === 'dashboard') {
      dashPage.classList.remove('hidden');
      gymPage.classList.add('hidden');
      navDash.classList.add('active');
      navGym.classList.remove('active');
    } else {
      dashPage.classList.add('hidden');
      gymPage.classList.remove('hidden');
      navDash.classList.remove('active');
      navGym.classList.add('active');
    }
  },

  async loadDashboardData() {
    await Dashboard.ensureProfile(this.userId);
    await Promise.all([
      MealLog.load(this.userId),
      Vitals.load(this.userId),
      Gym.load(this.userId),
      HuaweiCard.refresh()
    ]);
    this.refreshMacros();
  },

  setTotals(totals) {
    this.totals = totals;
  },

  refreshMacros() {
    Dashboard.renderMacroBars(MealLog.getTotals());
  }
};

document.addEventListener('DOMContentLoaded', () => App.boot());
