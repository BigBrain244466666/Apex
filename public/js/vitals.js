const Vitals = {
  rows: [],
  bound: false,

  bindForm() {
    if (this.bound) return;
    this.bound = true;

    const form = document.getElementById('vitals-form');
    const dateInput = document.getElementById('vitals-date');
    dateInput.value = new Date().toISOString().slice(0, 10);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sb = getSupabase();
      const userId = (await sb.auth.getUser()).data.user.id;
      const log_date = dateInput.value;
      const morning_weight = document.getElementById('vitals-weight').value || null;
      const waist_circumference = document.getElementById('vitals-waist').value || null;
      const strength_notes = document.getElementById('vitals-notes').value.trim() || null;

      const { data, error } = await sb.from('vitals')
        .upsert({
          user_id: userId,
          log_date,
          morning_weight: morning_weight ? Number(morning_weight) : null,
          waist_circumference: waist_circumference ? Number(waist_circumference) : null,
          strength_notes
        }, { onConflict: 'user_id,log_date' })
        .select().single();

      if (error) return alert(error.message);

      // Only update local state if this row isn't already present (upsert).
      this.rows = this.rows.filter((r) => r.log_date !== log_date);
      this.rows.push(data);
      this.rows.sort((a, b) => a.log_date.localeCompare(b.log_date));
      this.renderTable();
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
    });
  },

  async load(userId, token) {
    const sb = getSupabase();
    const { data, error } = await sb.from('vitals')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(60);

    if (error) return console.error(error.message);

    if (token !== App.loadToken) return; // stale load — discard

    this.rows = (data || []).sort((a, b) => a.log_date.localeCompare(b.log_date));
    this.renderTable();
  },

  sevenDayAvg(index) {
    const start = Math.max(0, index - 6);
    const slice = this.rows.slice(start, index + 1).filter((r) => r.morning_weight != null);
    if (!slice.length) return null;
    const sum = slice.reduce((acc, r) => acc + Number(r.morning_weight), 0);
    return sum / slice.length;
  },

  renderTable() {
    const tbody = document.getElementById('vitals-tbody');
    tbody.innerHTML = '';
    if (!this.rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No vitals logged yet.</td></tr>';
      return;
    }

    const desc = [...this.rows].reverse();
    for (const row of desc) {
      const idx = this.rows.findIndex((r) => r.id === row.id);
      const avg = this.sevenDayAvg(idx);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.log_date}</td>
        <td>${row.morning_weight ?? '—'}</td>
        <td>${avg ? avg.toFixed(1) : '—'}</td>
        <td>${row.waist_circumference ?? '—'}</td>
        <td class="notes-cell">${row.strength_notes ? escapeHtml(row.strength_notes) : ''}</td>
        <td><button class="icon-btn" data-id="${row.id}" title="Delete">✕</button></td>
      `;
      tr.querySelector('.icon-btn').addEventListener('click', () => this.deleteVital(row.id));
      tbody.appendChild(tr);
    }
  },

  async deleteVital(id) {
    const sb = getSupabase();
    await sb.from('vitals').delete().eq('id', id);
    this.rows = this.rows.filter((r) => r.id !== id);
    this.renderTable();
  }
};
