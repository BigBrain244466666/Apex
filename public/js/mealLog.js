/**
 * Meal manager: create meals (breakfast/lunch/dinner/snack), add foods to
 * each meal, food search with serving-size scaling, delete, and daily totals.
 */
const MealLog = {
  meals: [],            // [{ id, meal_type, items: [{...}] }]
  bound: false,
  currentMealId: null,  // which meal the food modal is adding to
  selectedFood: null,
  debounceTimer: null,
  MEAL_TYPES: ['breakfast', 'lunch', 'dinner', 'snack'],
  TYPE_ORDER: { breakfast: 0, lunch: 1, dinner: 2, snack: 3 },

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    // ---- Add Meal button → open meal type modal ----
    document.getElementById('add-meal-btn').addEventListener('click', () => {
      this.openModal('meal-type-modal');
    });

    // ---- Meal type buttons → create meal ----
    document.querySelectorAll('.meal-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.createMeal(btn.dataset.type));
    });

    // ---- Modal close (backdrop + ✕ buttons) ----
    document.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', () => this.closeModal(el.dataset.closeModal));
    });

    // ---- Food modal: live search ----
    const searchInput = document.getElementById('food-search');
    const resultsEl = document.getElementById('food-results');
    const servingInput = document.getElementById('food-serving');

    searchInput.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      const q = searchInput.value.trim();
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

    servingInput.addEventListener('input', () => {
      const grams = Number(servingInput.value);
      if (grams > 0) this.applyServing(grams);
    });

    // If user edits the food name manually, detach the selected food link.
    searchInput.addEventListener('change', () => {
      if (this.selectedFood && searchInput.value !== this.selectedFood.name) {
        this.selectedFood = null;
        document.getElementById('serving-row').classList.add('hidden');
        this.clearServingNote();
      }
    });

    // ---- Food form submit → add to current meal ----
    document.getElementById('food-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const food_name = searchInput.value.trim();
      const calories = Number(document.getElementById('food-cal').value);
      const protein = Number(document.getElementById('food-protein').value);
      const fat = Number(document.getElementById('food-fat').value);
      const carbs = Number(document.getElementById('food-carbs').value);

      if (!food_name) return alert('Food name is required.');
      if (!calories && !protein && !fat && !carbs) return alert('Add at least one macro value.');
      if (!this.currentMealId) return alert('No meal selected.');

      const sb = getSupabase();
      const userId = (await sb.auth.getUser()).data.user.id;

      const { data, error } = await sb.from('meal_items').insert({
        meal_id: this.currentMealId,
        user_id: userId,
        food_name,
        calories,
        protein,
        fat,
        carbs
      }).select().single();

      if (error) return alert(error.message);

      // Push into the in-memory meal's items.
      const meal = this.meals.find((m) => m.id === this.currentMealId);
      if (meal) meal.items.push(data);

      this.closeModal('food-modal');
      this.resetFoodModal();
      this.renderMeals();
      this.updateTotals();
      App.refreshMacros();
    });
  },

  // ================= MEALS =================

  openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  },

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  async createMeal(mealType) {
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await sb.from('meals').insert({
      user_id: userId,
      meal_type: mealType,
      meal_date: today
    }).select().single();

    if (error) return alert(error.message);

    this.meals.push({ id: data.id, meal_type: data.meal_type, items: [] });
    this.sortMeals();
    this.closeModal('meal-type-modal');
    this.renderMeals();
  },

  async deleteMeal(mealId) {
    const sb = getSupabase();
    await sb.from('meals').delete().eq('id', mealId); // cascades to items
    this.meals = this.meals.filter((m) => m.id !== mealId);
    this.renderMeals();
    this.updateTotals();
    App.refreshMacros();
  },

  sortMeals() {
    this.meals.sort((a, b) => {
      const diff = (this.TYPE_ORDER[a.meal_type] ?? 9) - (this.TYPE_ORDER[b.meal_type] ?? 9);
      return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
    });
  },

  // ================= FOOD MODAL =================

  openFoodModal(mealId) {
    this.currentMealId = mealId;
    const meal = this.meals.find((m) => m.id === mealId);
    document.getElementById('food-modal-title').textContent = meal
      ? `Add Food to ${capitalize(meal.meal_type)}`
      : 'Add Food';
    this.resetFoodModal();
    this.openModal('food-modal');
    document.getElementById('food-search').focus();
  },

  resetFoodModal() {
    document.getElementById('food-search').value = '';
    document.getElementById('food-cal').value = '';
    document.getElementById('food-protein').value = '';
    document.getElementById('food-fat').value = '';
    document.getElementById('food-carbs').value = '';
    this.selectedFood = null;
    document.getElementById('serving-row').classList.add('hidden');
    document.getElementById('food-serving').value = 100;
    this.clearServingNote();
    const resultsEl = document.getElementById('food-results');
    this.hideResults(resultsEl);
  },

  applyServing(grams) {
    if (!this.selectedFood) return;
    const p = this.selectedFood.per100g || {};
    const factor = grams / 100;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (val == null) { el.value = ''; return; }
      el.value = (id === 'food-cal' ? Math.round(val) : Math.round(val * 10) / 10);
    };

    set('food-cal', p.calories != null ? p.calories * factor : null);
    set('food-protein', p.protein != null ? p.protein * factor : null);
    set('food-fat', p.fat != null ? p.fat * factor : null);
    set('food-carbs', p.carbs != null ? p.carbs * factor : null);

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

      btn.addEventListener('click', () => {
        this.selectedFood = { name: h.name, per100g: h.per100g || {} };
        document.getElementById('food-search').value = h.name;
        const servingRow = document.getElementById('serving-row');
        const servingInput = document.getElementById('food-serving');
        servingRow.classList.remove('hidden');
        servingInput.value = 100;
        this.applyServing(100);
        this.hideResults(el);
      });
      el.appendChild(btn);
    }
  },

  // ================= RENDER =================

  async load(userId) {
    const sb = getSupabase();
    const today = new Date().toISOString().slice(0, 10);

    const { data: meals, error } = await sb.from('meals')
      .select('id, meal_type')
      .eq('user_id', userId)
      .eq('meal_date', today);

    if (error) return console.error(error.message);

    this.meals = [];
    for (const m of meals || []) {
      const { data: items } = await sb.from('meal_items')
        .select('*')
        .eq('meal_id', m.id)
        .order('created_at', { ascending: true });
      this.meals.push({ id: m.id, meal_type: m.meal_type, items: items || [] });
    }

    this.sortMeals();
    this.renderMeals();
    this.updateTotals();
  },

  renderMeals() {
    const container = document.getElementById('meals-container');
    container.innerHTML = '';

    if (!this.meals.length) {
      container.innerHTML = '<p class="muted">No meals yet today. Click "+ Add Meal" to get started.</p>';
      return;
    }

    for (const meal of this.meals) {
      const totals = this.mealTotals(meal);
      const group = document.createElement('div');
      group.className = 'meal-group';

      const typeEmoji = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snack: '🍎' }[meal.meal_type] || '🍽️';

      group.innerHTML = `
        <div class="meal-group-header">
          <span class="meal-type-badge">${typeEmoji} ${capitalize(meal.meal_type)}</span>
          <span class="meal-group-totals">
            ${Math.round(totals.calories)} kcal · P ${Math.round(totals.protein)} · F ${Math.round(totals.fat)} · C ${Math.round(totals.carbs)}
          </span>
          <button class="icon-btn delete-meal" data-meal-id="${meal.id}" title="Delete meal">✕</button>
        </div>

        <div class="meal-items">
          ${meal.items.length ? meal.items.map((it) => `
            <div class="meal-item-row" data-item-id="${it.id}">
              <span class="meal-item-name">${escapeHtml(it.food_name)}</span>
              <span class="meal-item-macros">${it.calories} kcal · P ${it.protein} · F ${it.fat} · C ${it.carbs}</span>
              <button class="icon-btn delete-item" data-item-id="${it.id}" title="Delete food">✕</button>
            </div>
          `).join('') : '<div class="meal-item-empty muted">No foods yet.</div>'}
        </div>

        <button class="btn btn-ghost add-food-btn" data-meal-id="${meal.id}">+ Add Food</button>
      `;

      group.querySelector('.delete-meal').addEventListener('click', () => {
        if (confirm(`Delete this ${meal.meal_type} meal and all its foods?`)) this.deleteMeal(meal.id);
      });

      group.querySelector('.add-food-btn').addEventListener('click', () => this.openFoodModal(meal.id));

      group.querySelectorAll('.delete-item').forEach((btn) => {
        btn.addEventListener('click', () => this.deleteItem(btn.dataset.itemId));
      });

      container.appendChild(group);
    }
  },

  mealTotals(meal) {
    const t = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const it of meal.items) {
      t.calories += Number(it.calories) || 0;
      t.protein += Number(it.protein) || 0;
      t.fat += Number(it.fat) || 0;
      t.carbs += Number(it.carbs) || 0;
    }
    return t;
  },

  async deleteItem(itemId) {
    const sb = getSupabase();
    await sb.from('meal_items').delete().eq('id', itemId);

    for (const meal of this.meals) {
      meal.items = meal.items.filter((it) => it.id !== itemId);
    }

    this.renderMeals();
    this.updateTotals();
    App.refreshMacros();
  },

  updateTotals() {
    const totals = this.getTotals();
    const el = document.getElementById('meal-total-row');
    el.innerHTML = `<b>Daily Totals:</b> ${Math.round(totals.calories)} kcal · P ${Math.round(totals.protein)}g · F ${Math.round(totals.fat)}g · C ${Math.round(totals.carbs)}g`;
    App.setTotals(totals);
    return totals;
  },

  getTotals() {
    const t = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const meal of this.meals) {
      const m = this.mealTotals(meal);
      t.calories += m.calories;
      t.protein += m.protein;
      t.fat += m.fat;
      t.carbs += m.carbs;
    }
    return t;
  }
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
