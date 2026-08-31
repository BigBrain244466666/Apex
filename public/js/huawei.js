/**
 * Huawei module: master toggle + health tiles (sleep, steps, calories, HR, SpO2).
 *
 * The toggle is stored in Supabase `profiles.huawei_enabled`.
 * When OFF, all Huawei tiles are hidden and no data is fetched.
 *
 * On Netlify, data comes from /.netlify/functions/huawei-data.
 * Locally, demo data is rendered directly (no local Huawei backend).
 */

const Huawei = {
  enabled: true,
  connected: false,
  bound: false,
  data: null,

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    const toggle = document.getElementById('huawei-toggle');
    const connectBtn = document.getElementById('huawei-connect-btn');

    toggle.addEventListener('change', async () => {
      this.enabled = toggle.checked;
      this.applyVisibility();

      const sb = getSupabase();
      const userId = (await sb.auth.getUser()).data.user.id;
      await sb.from('profiles').update({ huawei_enabled: this.enabled }).eq('user_id', userId);

      if (this.enabled) this.refresh();
    });

    connectBtn.addEventListener('click', () => this.connect());
  },

  async init(userId) {
    const sb = getSupabase();
    const { data } = await sb.from('profiles')
      .select('huawei_enabled, huawei_connected')
      .eq('user_id', userId)
      .maybeSingle();

    this.enabled = data?.huawei_enabled ?? true;
    this.connected = data?.huawei_connected ?? false;

    const toggle = document.getElementById('huawei-toggle');
    toggle.checked = this.enabled;
    this.applyVisibility();

    this.updateStatusBadge();
    if (this.enabled) this.refresh();
  },

  applyVisibility() {
    const section = document.getElementById('huawei-tiles-section');
    if (!section) return;
    section.classList.toggle('hidden', !this.enabled);
  },

  updateStatusBadge() {
    const badge = document.getElementById('huawei-status-badge');
    if (!badge) return;
    if (!this.enabled) {
      badge.textContent = 'Off';
      badge.className = 'status-badge';
    } else if (this.data?.connected) {
      badge.textContent = this.data.source === 'demo' ? 'Demo' : 'Connected';
      badge.className = 'status-badge ok';
    } else if (this.connected) {
      badge.textContent = 'Connected';
      badge.className = 'status-badge ok';
    } else {
      badge.textContent = 'Not linked';
      badge.className = 'status-badge';
    }
  },

  connect() {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => {
      const userId = data.user.id;
      const isLocal = window.IS_LOCAL;
      if (isLocal) {
        alert('Huawei OAuth needs the deployed Netlify version. Open your Netlify URL to connect.');
        return;
      }
      window.location.href = `/.netlify/functions/huawei-auth?mode=authorize&state=${encodeURIComponent(userId)}`;
    });
  },

  async refresh() {
    if (!this.enabled) return;

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    const isLocal = window.IS_LOCAL;

    if (isLocal) {
      // Local: no backend function — render demo inline.
      this.data = {
        connected: true,
        source: 'demo',
        sleep: { totalMinutes: 452, stages: { deep: { minutes: 105, label: 'Deep' }, rem: { minutes: 98, label: 'REM' }, light: { minutes: 249, label: 'Light' }, awake: { minutes: 14, label: 'Awake' } }, restingHeartRate: 58 },
        steps: 8942,
        calories: 2387,
        heartRate: { avg: 62, min: 48, max: 118 },
        spo2: { avg: 97 },
        note: 'Demo data — connect on the deployed app for live telemetry.'
      };
      this.render();
      this.updateStatusBadge();
      return;
    }

    try {
      const data = await apiGet(`/.netlify/functions/huawei-data?userId=${encodeURIComponent(userId)}`);
      this.data = data;
      this.render();
      this.updateStatusBadge();
    } catch (err) {
      console.error('[Huawei] refresh failed:', err);
      this.updateStatusBadge();
    }
  },

  render() {
    const d = this.data;
    if (!d) return;

    // --- Sleep ---
    const sleepEl = document.getElementById('tile-sleep');
    if (sleepEl && d.sleep) {
      const fmt = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${String(m).padStart(2, '0')}m`;
      };
      const total = d.sleep.totalMinutes || 0;
      const stages = [d.sleep.stages.deep, d.sleep.stages.rem, d.sleep.stages.light, d.sleep.stages.awake]
        .filter(Boolean)
        .map((s) => ({ ...s, pct: total > 0 ? Math.round((s.minutes / total) * 100) : 0 }));

      sleepEl.innerHTML = `
        <div class="tile-value">${fmt(total)}</div>
        <div class="tile-sub">Resting HR ${d.sleep.restingHeartRate ?? '—'} bpm</div>
        ${stages.map((s) => `
          <div class="mini-stage">
            <div class="mini-stage-head"><span>${s.label}</span><b>${fmt(s.minutes)}</b></div>
            <div class="progress-track"><div class="progress-fill" style="width:${s.pct}%;background:#4d6bfe"></div></div>
          </div>
        `).join('')}
      `;
    }

    // --- Steps ---
    const stepsEl = document.getElementById('tile-steps');
    if (stepsEl) {
      stepsEl.innerHTML = `<div class="tile-value">${d.steps != null ? d.steps.toLocaleString() : '—'}</div><div class="tile-sub">steps today</div>`;
    }

    // --- Calories ---
    const calEl = document.getElementById('tile-calories');
    if (calEl) {
      calEl.innerHTML = `<div class="tile-value">${d.calories != null ? d.calories.toLocaleString() : '—'}</div><div class="tile-sub">active kcal</div>`;
    }

    // --- Heart rate ---
    const hrEl = document.getElementById('tile-heart');
    if (hrEl && d.heartRate) {
      hrEl.innerHTML = `
        <div class="tile-value">${d.heartRate.avg ?? '—'}</div>
        <div class="tile-sub">${d.heartRate.min ?? '—'} / ${d.heartRate.max ?? '—'} bpm range</div>
      `;
    } else if (hrEl) {
      hrEl.innerHTML = `<div class="tile-value">—</div><div class="tile-sub">bpm</div>`;
    }

    // --- SpO2 ---
    const spo2El = document.getElementById('tile-spo2');
    if (spo2El && d.spo2) {
      spo2El.innerHTML = `<div class="tile-value">${d.spo2.avg ?? '—'}<span class="tile-unit">%</span></div><div class="tile-sub">blood oxygen</div>`;
    } else if (spo2El) {
      spo2El.innerHTML = `<div class="tile-value">—</div><div class="tile-sub">SpO₂</div>`;
    }

    // --- Note ---
    const noteEl = document.getElementById('huawei-note');
    if (noteEl && d.note) noteEl.textContent = d.note;
  }
};
