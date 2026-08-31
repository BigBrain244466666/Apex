const App = {
  totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },

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
      this.initDashboard(session.user.id);
    } else {
      authView.classList.remove('hidden');
      dashView.classList.add('hidden');
      this.initAuth();
    }
  },

  initAuth() {
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

  async initDashboard(userId) {
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await Auth.signOut();
    });

    await Dashboard.ensureProfile(userId);
    MealLog.bindForm();
    Vitals.bindForm();

    await Promise.all([
      MealLog.loadToday(userId),
      Vitals.load(userId),
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
