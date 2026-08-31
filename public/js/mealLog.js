/**
 * Meal logging: form, food search autofill, table, delete, totals.
 */
const MealLog = {
  rows: [],
  selectedFood: null,

  bindForm() {
    const form = document.getElementById('meal-form');
    const searchBtn = document.getElementById('food-search-btn');
    const foodInput = document.getElementById('meal-food');
    const resultsEl = document.getElementById('food-results');

    searchBtn.addEventListener('click', async () => {
      const q = foodInput.value.trim();
      if (!q) return;
      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching…';
      try {
        const hits = await searchNutrition(q);
        this.renderFoodResults(hits, resultsEl);
      } catch (err) {
        console.error(err);
      } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const food_name = foodInput.value.trim();
      const calories = Number(document.getElementById('meal-cal').value);
      const protein = Number(document.getElementById('meal-protein').value);
      const fat = Number(document.getElementById('meal-fat').value);
      const carbs = Number(document.getElementById('meal-carbs').value);

      if (!food_name) return alert('Food name is required.');

      const sb = getSupabase();
      const userId = (await sb.auth.getUser()).data.user.id;
      const today = new Date().toISOString().slice(0, 10);

      const { data, error } = await sb.from('meal_logs').insert({
        user_id: userId,
        food_name,
        calories,
        protein,
        fat,
        carbs,
        meal_date: today
      }).select().single();

      if (error) return alert(error.message);

      this.rows.push(data);
      this.renderTable();
      this.updateTotals();
      this.clearForm();
      App.refreshMacros();
    });
  },

  renderFoodResults(hits, el) {
    el.innerHTML = '';
    if (!hits.length) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    for (const h of hits.slice(0, 8)) {
      const b = h.per100g || {};
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'food-result';
      btn.innerHTML = `
        <span><b>${h.name}</b><small>${h.brand || h.source} · per 100g</small></span>
        <span class="food-macros">${b.calories ? Math.round(b.calories) + ' kcal' : '—'} · P ${b.protein ?? '—'} · F ${b.fat ?? '—'} · C ${b.carbs ?? '—'}</span>
      `;
      btn.addEventListener('click', () => {
        document.getElementById('meal-food').value = h.name;
        document.getElementById('meal-cal').value = b.calories ? Math.round(b.calories) : '';
        document.getElementById('meal-protein').value = b.protein ?? '';
        document.getElementById('meal-fat').value = b.fat ?? '';
        document.getElementById('meal-carbs').value = b.carbs ?? '';
        el.classList.add('hidden');
      });
      el.appendChild(btn);
    }
  },

  clearForm() {
    document.getElementById('meal-food').value = '';
    document.getElementById('meal-cal').value = '';
    document.getElementById('meal-protein').value = '';
    document.getElementById('meal-fat').value = '';
    document.getElementById('meal-carbs').value = '';
    const resultsEl = document.getElementById('food-results');
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
  },

  async loadToday(userId) {
    const sb = getSupabase();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb.from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('meal_date', today)
      .order('created_at', { ascending: true });

    if (error) return console.error(error.message);
    this.rows = data || [];
    this.renderTable();
    this.updateTotals();
  },

  renderTable() {
    const tbody = document.getElementById('meal-tbody');
    tbody.innerHTML = '';
    if (!this.rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No meals logged yet today.</td></tr>';
      return;
    }
    for (const row of this.rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="food-name-cell">${escapeHtml(row.food_name)}</td>
        <td>${row.calories}</td>
        <td>${row.protein}</td>
        <td>${row.fat}</td>
        <td>${row.carbs}</td>
        <td><button class="icon-btn" data-id="${row.id}" title="Delete">✕</button></td>
      `;
      tr.querySelector('.icon-btn').addEventListener('click', () => this.deleteMeal(row.id));
      tbody.appendChild(tr);
    }
  },

  async deleteMeal(id) {
    const sb = getSupabase();
    await sb.from('meal_logs').delete().eq('id', id);
    this.rows = this.rows.filter((r) => r.id !== id);
    this.renderTable();
    this.updateTotals();
    App.refreshMacros();
  },

  updateTotals() {
    const totals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const r of this.rows) {
      totals.calories += Number(r.calories) || 0;
      totals.protein += Number(r.protein) || 0;
      totals.fat += Number(r.fat) || 0;
      totals.carbs += Number(r.carbs) || 0;
    }
    const el = document.getElementById('meal-total-row');
    el.innerHTML = `<b>Totals:</b> ${Math.round(totals.calories)} kcal · P ${Math.round(totals.protein)}g · F ${Math.round(totals.fat)}g · C ${Math.round(totals.carbs)}g`;
    App.setTotals(totals);
    return totals;
  },

  getTotals() {
    const totals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const r of this.rows) {
      totals.calories += Number(r.calories) || 0;
      totals.protein += Number(r.protein) || 0;
      totals.fat += Number(r.fat) || 0;
      totals.carbs += Number(r.carbs) || 0;
    }
    return totals;
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
