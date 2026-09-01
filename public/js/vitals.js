const Vitals = {
  rows: [],
  bound: false,

  bindForm() {
    if (this.bound) return;
    this.bound = true;

    const form = document.getElementById('vitals-form');
    const dateInput = document.getElementById('vitals-date');
    dateInput.value = localToday();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const sb = getSupabase();
      const userId = (await sb.auth.getUser()).data.user.id;

      const log_date = dateInput.value;
      const morning_weight = document.getElementById('vitals-weight').value || null;
      const waist_circumference = document.getElementById('vitals-waist').value || null;
      const neck_circumference = document.getElementById('vitals-neck').value || null;
      const strength_notes = document.getElementById('vitals-notes').value.trim() || null;

      // Estimate body fat if waist + neck are provided.
      const heightCm = (Dashboard.profile && Dashboard.profile.height_cm)
        ? Number(Dashboard.profile.height_cm)
        : 179;

      let estimated_body_fat = null;
      if (waist_circumference && neck_circumference && heightCm) {
        estimated_body_fat = Vitals.estimateBodyFat(
          Number(waist_circumference),
          Number(neck_circumference),
          heightCm
        );
      }

      const { data, error } = await sb.from('vitals')
        .upsert({
          user_id: userId,
          log_date: log_date,
          morning_weight: morning_weight ? Number(morning_weight) : null,
          waist_circumference: waist_circumference ? Number(waist_circumference) : null,
          neck_circumference: neck_circumference ? Number(neck_circumference) : null,
          estimated_body_fat: estimated_body_fat,
          strength_notes: strength_notes
        }, { onConflict: 'user_id,log_date' })
        .select()
        .single();

      if (error) return alert(error.message);

      Vitals.rows = Vitals.rows.filter(function (r) { return r.log_date !== log_date; });
      Vitals.rows.push(data);
      Vitals.rows.sort(function (a, b) { return a.log_date.localeCompare(b.log_date); });

      Vitals.renderTable();
      form.reset();
      dateInput.value = localToday();
    });
  },

  estimateBodyFat(waistCm, neckCm, heightCm) {
    if (!waistCm || !neckCm || !heightCm) return null;
    const waistMinusNeck = waistCm - neckCm;
    if (waistMinusNeck <= 0) return null;

    const logVal = Math.log10(waistMinusNeck);
    const logHeight = Math.log10(heightCm);

    const density = 1.0324 - 0.19077 * logVal + 0.15456 * logHeight;
    if (density <= 0) return null;

    const bf = 495 / density - 450;
    return Math.round(bf * 10) / 10;
  },

  async load(userId, token) {
    const sb = getSupabase();

    const { data, error } = await sb.from('vitals')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(60);

    if (error) return console.error(error.message);

    if (token !== App.loadToken) return;

    Vitals.rows = (data || []).sort(function (a, b) {
      return a.log_date.localeCompare(b.log_date);
    });

    Vitals.renderTable();
  },

  sevenDayAvg(index) {
    const start = Math.max(0, index - 6);
    const slice = Vitals.rows.slice(start, index + 1).filter(function (r) {
      return r.morning_weight != null;
    });
    if (!slice.length) return null;
    const sum = slice.reduce(function (acc, r) {
      return acc + Number(r.morning_weight);
    }, 0);
    return sum / slice.length;
  },

  latestBodyFat() {
    const rowsWithBf = Vitals.rows.filter(function (r) {
      return r.estimated_body_fat != null;
    });
    if (!rowsWithBf.length) return null;
    return Number(rowsWithBf[rowsWithBf.length - 1].estimated_body_fat);
  },

  renderTable() {
    const tbody = document.getElementById('vitals-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!Vitals.rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No vitals logged yet.</td></tr>';
      return;
    }

    const desc = Vitals.rows.slice().reverse();

    for (const row of desc) {
      const idx = Vitals.rows.findIndex(function (r) { return r.id === row.id; });
      const avg = Vitals.sevenDayAvg(idx);

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + row.log_date + '</td>' +
        '<td>' + (row.morning_weight != null ? row.morning_weight : '—') + '</td>' +
        '<td>' + (avg ? avg.toFixed(1) : '—') + '</td>' +
        '<td>' + (row.waist_circumference != null ? row.waist_circumference : '—') + '</td>' +
        '<td>' + (row.estimated_body_fat != null ? row.estimated_body_fat + '%' : '—') + '</td>' +
        '<td class="notes-cell">' + (row.strength_notes ? escapeHtml(row.strength_notes) : '') + '</td>' +
        '<td><button class="icon-btn" data-id="' + row.id + '" title="Delete">✕</button></td>';

      tr.querySelector('.icon-btn').addEventListener('click', function () {
        Vitals.deleteVital(row.id);
      });

      tbody.appendChild(tr);
    }
  },

  async deleteVital(id) {
    const sb = getSupabase();
    await sb.from('vitals').delete().eq('id', id);
    Vitals.rows = Vitals.rows.filter(function (r) { return r.id !== id; });
    Vitals.renderTable();
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}