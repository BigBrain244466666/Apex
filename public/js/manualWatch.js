/* Manual watch entry + history charts + health score (always shows previous day) */

const ManualWatch = {
  bound: false,

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    const dateInput = document.getElementById('manual-watch-date');
    const form = document.getElementById('manual-watch-form');

    if (dateInput) {
      const today = new Date();
      dateInput.max = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      dateInput.value = dateInput.max;
    }

    if (form) form.addEventListener('submit', (e) => this.saveEntry(e));
  },

  parseSleepHours(input) {
    const s = String(input || '').trim();
    if (!s) return null;

    if (/^\d+(\.\d+)?$/.test(s)) {
      return Number(s);
    }

    const hmMatch = s.match(/(\d+)\s*h\s*(\d+)\s*m?/i);
    if (hmMatch) {
      const hours = Number(hmMatch[1]);
      const minutes = Number(hmMatch[2]);
      return hours + minutes / 60;
    }

    const colonMatch = s.match(/^(\d+):(\d+)$/);
    if (colonMatch) {
      const hours = Number(colonMatch[1]);
      const minutes = Number(colonMatch[2]);
      return hours + minutes / 60;
    }

    const hOnly = s.match(/^(\d+)\s*h$/i);
    if (hOnly) return Number(hOnly[1]);

    return null;
  },

  async saveEntry(e) {
    e.preventDefault();
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const date = document.getElementById('manual-watch-date').value;
    const sleepRaw = document.getElementById('manual-sleep').value;
    const steps = Number(document.getElementById('manual-steps').value) || null;
    const hr = Number(document.getElementById('manual-hr').value) || null;

    const sleepHours = this.parseSleepHours(sleepRaw);
    if (sleepRaw && sleepHours === null) {
      const result = document.getElementById('manual-watch-result');
      if (result) result.textContent = '⚠️ Use e.g. 7.5 or 7h 30m for sleep';
      return;
    }

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    if (date > todayStr) return alert('You cannot log future dates.');

    const res = await sb.from('manual_watch_logs')
      .upsert({
        user_id: userId,
        log_date: date,
        sleep_hours: sleepHours,
        steps: steps,
        resting_hr: hr
      }, { onConflict: 'user_id,log_date' });

    if (res.error) return alert(res.error.message);

    const result = document.getElementById('manual-watch-result');
    if (result) result.textContent = '✅ Logged for ' + date;

    form.reset();
    const dateInput = document.getElementById('manual-watch-date');
    if (dateInput) {
      dateInput.max = todayStr;
      dateInput.value = todayStr;
    }

    await this.loadHistory();
  },

  async loadHistory() {
    const sb = getSupabase();
    const userId = App.userId;
    if (!sb || !userId) return;

    // Fetch up to 8 days so we have enough to find yesterday
    const { data: logs } = await sb.from('manual_watch_logs')
      .select('log_date, sleep_hours, steps, resting_hr')
      .eq('user_id', userId)
      .order('log_date', { ascending: true })
      .limit(8);

    const rows = logs || [];
    const labels = rows.map(r => r.log_date);

    if (typeof ChartManager === 'undefined') return;

    // Steps chart
    const stepsData = rows.map(r => Number(r.steps) || 0);
    ChartManager.line('watch-steps-chart', labels, [{
      label: 'Steps',
      data: stepsData,
      borderColor: '#4d6bfe',
      backgroundColor: 'rgba(77,107,254,0.15)',
      tension: 0.3,
      fill: true
    }]);

    // Sleep chart
    const sleepData = rows.map(r => Number(r.sleep_hours) || 0);
    ChartManager.line('watch-sleep-chart', labels, [{
      label: 'Sleep (h)',
      data: sleepData,
      borderColor: '#2ea043',
      backgroundColor: 'rgba(46,160,67,0.15)',
      tension: 0.3,
      fill: true
    }]);

    // Resting HR chart
    const hrData = rows.map(r => Number(r.resting_hr) || null);
    ChartManager.line('watch-hr-chart', labels, [{
      label: 'Resting HR',
      data: hrData,
      borderColor: '#d29922',
      backgroundColor: 'rgba(210,153,34,0.15)',
      tension: 0.3,
      fill: true
    }]);

    this.renderHealthScore(rows);
  },

  renderHealthScore(rows) {
    const el = document.getElementById('previous-day-score');
    if (!el) return;

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    // Filter out today's log, then take the most recent one (which is yesterday or earlier)
    const previousRows = rows.filter(r => r.log_date < todayStr);
    if (previousRows.length === 0) {
      el.innerHTML = '<p class="muted">No data for yesterday yet. Log your metrics!</p>';
      return;
    }

    const last = previousRows[previousRows.length - 1]; // most recent day before today
    const date = last.log_date;
    const steps = Number(last.steps) || 0;
    const sleep = Number(last.sleep_hours) || 0;
    const hr = Number(last.resting_hr) || 0;

    const stepsScore = Math.min(100, Math.round((steps / 10000) * 100));
    const sleepScore = Math.min(100, Math.round((sleep / 8) * 100));

    let hrScore = 0;
    if (hr > 0) {
      if (hr <= 60) hrScore = 100;
      else if (hr >= 85) hrScore = 40;
      else hrScore = Math.max(40, Math.round(100 - (hr - 60) * 2.4));
    }

    const total = Math.round((stepsScore + sleepScore + hrScore) / 3);

    // Format the date nicely
    const d = new Date(date + 'T00:00:00');
    const dateLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    el.innerHTML = `
      <div class="health-score">
        <div class="health-score-number">${total}/100</div>
        <div class="health-score-label">Health Score for ${dateLabel}</div>
        <div class="health-score-detail">Steps ${stepsScore}% · Sleep ${sleepScore}% · HR ${hrScore}%</div>
      </div>
    `;
  }
};