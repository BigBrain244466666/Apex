/**
 * Huawei sleep card.
 *  - Local (Express): fetch /api/huawei/sleep (demo or live via server).
 *  - Netlify: render built-in demo data (live Huawei needs a backend function,
 *    which can be added later).
 */

const DEMO_SLEEP = {
  connected: true,
  source: 'demo',
  date: new Date().toISOString().slice(0, 10),
  totalMinutes: 452,
  stages: {
    deep: { minutes: 105, label: 'Deep' },
    rem: { minutes: 98, label: 'REM' },
    light: { minutes: 249, label: 'Light' },
    awake: { minutes: 14, label: 'Awake' }
  },
  restingHeartRate: 58,
  note: 'Demo data — live Huawei telemetry can be enabled later.'
};

const HuaweiCard = {
  async refresh() {
    const body = document.getElementById('huawei-body');
    const badge = document.getElementById('huawei-status-badge');

    // On Netlify, there's no live backend — show demo directly.
    if (!window.IS_LOCAL) {
      this.renderDemo(body, badge);
      return;
    }

    body.innerHTML = '<p class="muted">Loading sleep data…</p>';

    try {
      const sleep = await apiGet('/api/huawei/sleep');
      badge.textContent = sleep.connected ? (sleep.source === 'demo' ? 'Demo' : 'Connected') : 'Disconnected';
      badge.className = 'status-badge ' + (sleep.connected ? 'ok' : 'err');
      this.render(sleep, body);
    } catch (err) {
      this.renderDemo(body, badge);
    }
  },

  renderDemo(body, badge) {
    badge.textContent = 'Demo';
    badge.className = 'status-badge ok';
    this.render(DEMO_SLEEP, body);
  },

  render(sleep, el) {
    const stages = sleep.stages || {};
    const fmtHrMin = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${String(m).padStart(2, '0')}m`;
    };

    const total = sleep.totalMinutes || 0;
    const stageList = [stages.deep, stages.rem, stages.light, stages.awake]
      .filter(Boolean)
      .map((s) => ({ ...s, pct: total > 0 ? Math.round((s.minutes / total) * 100) : 0 }));

    el.innerHTML = `
      <div class="sleep-total">${fmtHrMin(total)}</div>
      <div class="sleep-stage-list">
        ${stageList.map((s) => `
          <div class="sleep-stage">
            <div class="sleep-stage-head"><span>${s.label}</span><b>${fmtHrMin(s.minutes)}</b></div>
            <div class="progress-track"><div class="progress-fill" style="width:${s.pct}%;background:#4d6bfe"></div></div>
          </div>
        `).join('')}
      </div>
      <div class="huawei-footer">
        <span>Resting HR: <b>${sleep.restingHeartRate ?? '—'} bpm</b></span>
        ${sleep.note ? `<span class="muted small">${escapeHtml(sleep.note)}</span>` : ''}
      </div>
    `;
  }
};
