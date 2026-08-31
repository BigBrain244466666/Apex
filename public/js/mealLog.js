const MealLog = {
  rows: [],
  debounceTimer: null,
  selectedFood: null,

  bindForm() {
    const form = document.getElementById('meal-form');
    const searchBtn = document.getElementById('food-search-btn');
    const foodInput = document.getElementById('meal-food');
    const servingInput = document.getElementById('meal-serving');
    const servingRow = document.getElementById('serving-row');
    const resultsEl = document.getElementById('food-results');

    foodInput.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      const q = foodInput.value.trim();
      if (q.length < 2) {
        this.hideResults(resultsEl);
        return;
      }
      this.debounceTimer = setTimeout(async () => {
        try {
          const hits = await searchNutrition(q);
          this.renderFoodResults(hits, resultsEl);
        } catch (err) {
          console.error(err);
        }
      }, 350);
    });

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

    servingInput.addEventListener('input', () => {
      const grams = Number(servingInput.value);
      if (grams > 0) this.applyServing(grams);
    });

    foodInput.addEventListener('change', () => {
      if (this.selectedFood && foodInput.value !== this.selectedFood.name) {
        this.selectedFood = null;
        servingRow.classList.add('hidden');
        this.clearServingNote();
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
      if (!calories && !protein && !fat && !carbs) return alert('Add at least one macro value.');

      const sb = getSupabase();
      const userId = (await sb.auth.getUser()).data.user.id;
      const today = new Date().toISOString().slice(0, 10);

      const { data, error } = await sb.from('meal_logs').insert({
        user_id: userId, food_name, calories, protein, fat, carbs, meal_date: today
      }).select().single();

      if (error) return alert(error.message);

      this.rows.push(data);
      this.renderTable();
      this.updateTotals();
      this.clearForm();
      App.refreshMacros();
    });
  },

  applyServing(grams) {
    if (!this.selectedFood) return;
    const p = this.selectedFood.per100g || {};
    const factor = grams / 100;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (val == null) { el.value = ''; return; }
      el.value = (id === 'meal-cal' ? Math.round(val) : Math.round(val * 10) / 10);
    };

    set('meal-cal', p.calories != null ? p.calories * factor : null);
    set('meal-protein', p.protein != null ? p.protein * factor : null);
    set('meal-fat', p.fat != null ? p.fat * factor : null);
    set('meal-carbs', p.carbs != null ? p.carbs * factor : null);

    this.setServingNote(grams);
  },

  setServingNote(grams) {
    const el = document.getElementById('serving-note');
    if (!this.selectedFood) { el.textContent = ''; return; }
    const p = this.selectedFood.per100g || {};
    const complete = p.calories != null && p.protein != null && p.fat != null && p.carbs != null;
    el.textContent = complete ? `${grams}g of ${this.selectedFood.name}` : 'Partial data — check values';
  },

  clearServingNote() {
    document.getElementById('serving-note').textContent = '';
  },

  hideResults(el) {
    el.classList.add('hidden');
    el.innerHTML = '';
  },

  renderFoodResults(hits, el) {
    el.innerHTML = '';
    if (!hits.length) {
      el.classList.remove('hidden');
      el.innerHTML = '<div class="food-empty">No results. Enter macros manually below.</div>';
      return;
    }

    el.classList.remove('hidden');
    for (const h of hits.slice(0, 8)) {
      const b = h.per100g || {};
      const isComplete = b.calories != null && b.protein != null && b.fat != null && b.carbs != null;
      const sourceLabel = h.source === 'usda'
        ? (h.dataType === 'Branded' ? 'USDA Branded' : 'USDA Generic')
        : 'Open Food Facts';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'food-result';
      btn.innerHTML = `
        <span class="food-result-name">
          <b>${escapeHtml(h.name)}</b>
          ${h.brand ? `<small>${escapeHtml(h.brand)}</small>` : ''}
          <small class="food-source ${isComplete ? 'complete' : 'partial'}">${sourceLabel}${isComplete ? '' : ' · partial'}</small>
        </span>
        <span class="food-macros">
          ${b.calories != null ? Math.round(b.calories) + ' kcal' : '— kcal'} ·
          P ${b.protein != null ? b.protein : '—'} ·
          F ${b.fat != null ? b.fat : '—'} ·
          C ${b.carbs != null ? b.carbs : '—'}
          <small>per 100g</small>
        </span>
      `;

      btn.addEventListener('click', () => this.onSelectFood(h, el));
      el.appendChild(btn);
    }
  },

  onSelectFood(h, resultsEl) {
    this.selectedFood = { name: h.name, per100g: h.per100g || {} };
    document.getElementById('meal-food').value = h.name;

    const servingRow = document.getElementById('serving-row');
    const servingInput = document.getElementById('meal-serving');
    servingRow.classList.remove('hidden');
    servingInput.value = 100;

    this.applyServing(100);
    this.hideResults(resultsEl);
  },

  clearForm() {
    document.getElementById('meal-food').value = '';
    document.getElementById('meal-cal').value = '';
    document.getElementById('meal-protein').value = '';
    document.getElementById('meal-fat').value = '';
    document.getElementById('meal-carbs').value = '';
    this.selectedFood = null;
    document.getElementById('serving-row').classList.add('hidden');
    document.getElementById('meal-serving').value = 100;
    this.clearServingNote();
    const resultsEl = document.getElementById('food-results');
    this.hideResults(resultsEl);
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
    const totals = this.getTotals();
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
