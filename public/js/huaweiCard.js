const HuaweiCard = {
  async refresh() {
    const body = document.getElementById('huawei-body');
    const badge = document.getElementById('huawei-status-badge');
    body.innerHTML = '<p class="muted">Loading sleep data…</p>';

    try {
      const sleep = await apiGet('/api/huawei/sleep');
      badge.textContent = sleep.connected ? (sleep.source === 'demo' ? 'Demo' : 'Connected') : 'Disconnected';
      badge.className = 'status-badge ' + (sleep.connected ? 'ok' : 'err');
      this.render(sleep, body);
    } catch (err) {
      badge.textContent = 'Error';
      badge.className = 'status-badge err';
      body.innerHTML = '<p class="muted">Could not load sleep data.</p>';
    }
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
