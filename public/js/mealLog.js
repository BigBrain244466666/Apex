const MealLog = {
  meals: [],
  bound: false,
  currentMealId: null,
  selectedFood: null, // stores the per100g data of the last selected food
  debounceTimer: null,

  bindUI() {
    if (this.bound) return;
    this.bound = true;
    const self = this;

    document.getElementById('add-meal-btn')?.addEventListener('click', () => this.openModal('meal-type-modal'));
    document.querySelectorAll('.meal-type-btn').forEach(btn => btn.addEventListener('click', () => this.createMeal(btn.dataset.type)));
    document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', () => this.closeModal(el.dataset.closeModal)));

    const searchInput = document.getElementById('food-search');
    const resultsEl = document.getElementById('food-results');
    searchInput?.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      const q = searchInput.value.trim();
      if (q.length < 2) return this.hideResults(resultsEl);
      this.debounceTimer = setTimeout(async () => {
        try { this.renderFoodResults(await searchNutrition(q), resultsEl); } catch (e) { console.error(e); }
      }, 350);
    });

    document.getElementById('food-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveFoodFromForm();
    });

    document.getElementById('copy-meals-btn')?.addEventListener('click', () => this.copyYesterday());
    this.loadFavorites();

    // ---- Add grams input if missing ----
    this.ensureGramsInput();

    // ---- Live scaling when grams changes ----
    const gramsInput = document.getElementById('food-grams');
    if (gramsInput) {
      gramsInput.addEventListener('input', () => this.scaleFromGrams());
    }
  },

  ensureGramsInput() {
    const form = document.getElementById('food-form');
    if (!form) return;
    let gramsInput = document.getElementById('food-grams');
    if (!gramsInput) {
      // Insert a grams field before the macro grid
      const macroGrid = form.querySelector('.meal-macro-grid');
      const wrapper = document.createElement('div');
      wrapper.className = 'field-label';
      wrapper.innerHTML = `
        <label class="field-label">Serving (grams)
          <input id="food-grams" type="number" step="1" min="1" value="100" />
        </label>
      `;
      if (macroGrid) {
        form.insertBefore(wrapper, macroGrid);
      } else {
        form.prepend(wrapper);
      }
      gramsInput = document.getElementById('food-grams');
      if (gramsInput) {
        gramsInput.addEventListener('input', () => this.scaleFromGrams());
      }
    }
  },

  openModal(id) { document.getElementById(id)?.classList.remove('hidden'); },
  closeModal(id) { document.getElementById(id)?.classList.add('hidden'); },
  hideResults(el) { if (el) { el.classList.add('hidden'); el.innerHTML = ''; } },

  async createMeal(mealType) {
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const res = await sb.from('meals').insert({ user_id: userId, meal_type: mealType, meal_date: today }).select().single();
    if (res.error) return alert(res.error.message);
    this.meals.push({ id: res.data.id, meal_type: res.data.meal_type, items: [] });
    this.renderMeals();
    this.closeModal('meal-type-modal');
  },

  async saveFoodFromForm() {
    const food_name = document.getElementById('food-search').value.trim();
    const calories = Number(document.getElementById('food-cal').value) || 0;
    const protein = Number(document.getElementById('food-protein').value) || 0;
    const fat = Number(document.getElementById('food-fat').value) || 0;
    const carbs = Number(document.getElementById('food-carbs').value) || 0;
    if (!food_name) return alert('Food name required.');
    if (!this.currentMealId) return alert('Select a meal first.');

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    const res = await sb.from('meal_items').insert({
      meal_id: this.currentMealId, user_id: userId,
      food_name, calories, protein, fat, carbs
    }).select().single();
    if (res.error) return alert(res.error.message);

    const meal = this.meals.find(m => m.id === this.currentMealId);
    if (meal) meal.items.push(res.data);

    this.closeModal('food-modal');
    this.renderMeals();
    this.updateTotals();
  },

  openFoodModal(mealId) {
    this.currentMealId = mealId;
    this.openModal('food-modal');
    document.getElementById('food-search')?.focus();
    // Reset grams to 100 and clear any stored selection
    const grams = document.getElementById('food-grams');
    if (grams) grams.value = 100;
    this.selectedFood = null;
    // Clear macro fields
    ['food-cal', 'food-protein', 'food-fat', 'food-carbs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  },

  async copyYesterday() {
    const sb = getSupabase();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const d = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    const { data: meals } = await sb.from('meals').select('id').eq('user_id', App.userId).eq('meal_date', d);
    for (const m of (meals || [])) {
      const { data: items } = await sb.from('meal_items').select('*').eq('meal_id', m.id);
      const now = new Date();
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const newMeal = await sb.from('meals').insert({ user_id: App.userId, meal_type: 'snack', meal_date: today }).select().single();
      for (const it of (items || [])) {
        await sb.from('meal_items').insert({
          meal_id: newMeal.data.id, user_id: App.userId,
          food_name: it.food_name, calories: it.calories, protein: it.protein, fat: it.fat, carbs: it.carbs
        });
      }
    }
    this.load(App.userId, ++App.loadToken);
  },

  async loadFavorites() {
    const sb = getSupabase();
    const { data } = await sb.from('favorite_foods').select('*').eq('user_id', App.userId);
    const el = document.getElementById('favorites-container');
    if (el) el.innerHTML = (data || []).map(f => `<button class="favorite-item" onclick="MealLog.quickAddFavorite('${f.id}')">⭐ ${escapeHtml(f.food_name)}</button>`).join('');
  },

  async quickAddFavorite(id) {
    const sb = getSupabase();
    const { data } = await sb.from('favorite_foods').select('*').eq('id', id).single();
    if (data) {
      document.getElementById('food-search').value = data.food_name;
      document.getElementById('food-cal').value = data.calories;
      document.getElementById('food-protein').value = data.protein;
      document.getElementById('food-fat').value = data.fat;
      document.getElementById('food-carbs').value = data.carbs;
    }
  },

  async load(userId, token) {
    const sb = getSupabase();
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const { data: meals } = await sb.from('meals').select('*').eq('user_id', userId).eq('meal_date', today);

    if (token !== App.loadToken) return;

    this.meals = [];
    const seenMealIds = new Set();

    for (const m of (meals || [])) {
      if (seenMealIds.has(m.id)) continue;
      seenMealIds.add(m.id);

      const { data: items } = await sb.from('meal_items')
        .select('*')
        .eq('meal_id', m.id)
        .order('created_at', { ascending: true });

      const seenSignatures = new Set();
      const uniqueItems = [];
      for (const it of (items || [])) {
        const sig = [it.food_name, it.calories, it.protein, it.fat, it.carbs].join('|');
        if (seenSignatures.has(sig)) continue;
        seenSignatures.add(sig);
        uniqueItems.push(it);
      }

      this.meals.push({ id: m.id, meal_type: m.meal_type, items: uniqueItems });
    }

    this.renderMeals();
    this.updateTotals();
  },

  renderMeals() {
    const container = document.getElementById('meals-container');
    if (!container) return;
    container.innerHTML = '';

    this.meals.forEach(meal => {
      const totals = this.mealTotals(meal);
      const group = document.createElement('div');
      group.className = 'meal-group';
      group.innerHTML = `
        <div class="meal-group-header">
          <span class="meal-type-badge">${capitalize(meal.meal_type)}</span>
          <span class="meal-group-totals">${Math.round(totals.calories)} kcal · P ${Math.round(totals.protein)} · F ${Math.round(totals.fat)} · C ${Math.round(totals.carbs)}</span>
          <button class="icon-btn delete-meal" data-mid="${meal.id}" title="Delete meal">✕</button>
        </div>
        <div class="meal-items">
          ${meal.items.map(it => `
            <div class="meal-item-row">
              <span class="meal-item-name">${escapeHtml(it.food_name)}</span>
              <span class="meal-item-macros">${it.calories} kcal · P ${it.protein} · F ${it.fat} · C ${it.carbs}</span>
              <button class="icon-btn delete-item" data-iid="${it.id}" title="Delete food">✕</button>
            </div>`).join('') || '<div class="meal-item-empty muted">No foods.</div>'}
        </div>
        <button class="btn btn-ghost add-food-btn" data-mid="${meal.id}">+ Add Food</button>`;
      container.appendChild(group);

      group.querySelector('.delete-meal').addEventListener('click', () => this.deleteMeal(meal.id));
      group.querySelector('.add-food-btn').addEventListener('click', () => this.openFoodModal(meal.id));
      group.querySelectorAll('.delete-item').forEach(b => b.addEventListener('click', () => this.deleteItem(b.dataset.iid)));
    });
  },

  async deleteMeal(id) {
    const sb = getSupabase();
    await sb.from('meals').delete().eq('id', id);
    this.meals = this.meals.filter(m => m.id !== id);
    this.renderMeals();
    this.updateTotals();
  },

  async deleteItem(id) {
    const sb = getSupabase();
    await sb.from('meal_items').delete().eq('id', id);
    this.meals.forEach(m => m.items = m.items.filter(i => i.id !== id));
    this.renderMeals();
    this.updateTotals();
  },

  mealTotals(meal) {
    const t = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    meal.items.forEach(it => {
      t.calories += Number(it.calories) || 0;
      t.protein += Number(it.protein) || 0;
      t.fat += Number(it.fat) || 0;
      t.carbs += Number(it.carbs) || 0;
    });
    return t;
  },

  getTotals() {
    const t = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    this.meals.forEach(m => {
      const mt = this.mealTotals(m);
      t.calories += mt.calories;
      t.protein += mt.protein;
      t.fat += mt.fat;
      t.carbs += mt.carbs;
    });
    return t;
  },

  updateTotals() {
    const totals = this.getTotals();
    const el = document.getElementById('meal-total-row');
    if (el) el.innerHTML = `<b>Totals:</b> ${Math.round(totals.calories)} kcal · P ${Math.round(totals.protein)}g · F ${Math.round(totals.fat)}g · C ${Math.round(totals.carbs)}g`;
    App.setTotals(totals);
    App.refreshMacros();
  },

  renderFoodResults(hits, el) {
    if (!el) return;
    el.innerHTML = '';
    if (!hits || !hits.length) {
      el.classList.remove('hidden');
      el.innerHTML = '<div class="food-empty">No results.</div>';
      return;
    }
    el.classList.remove('hidden');
    hits.slice(0, 8).forEach(h => {
      const b = h.per100g || {};
      const btn = document.createElement('button');
      btn.className = 'food-result';
      btn.innerHTML = `
        <b>${escapeHtml(h.name)}</b>
        <span class="food-macros">
          ${Math.round(b.calories || 0)} kcal · P ${b.protein || 0} · F ${b.fat || 0} · C ${b.carbs || 0} <small>(per 100g)</small>
        </span>
      `;
      btn.addEventListener('click', () => this.selectFood(h, b));
      el.appendChild(btn);
    });
  },

  selectFood(h, b) {
    // Store the per-100g data for scaling
    this.selectedFood = { per100g: b };
    document.getElementById('food-search').value = h.name;
    // Set grams to 100 by default
    const gramsInput = document.getElementById('food-grams');
    if (gramsInput) gramsInput.value = 100;
    // Fill macros with per-100g values (will be scaled by grams)
    this.updateMacroFields(b, 100);
  },

  updateMacroFields(per100g, grams) {
    const factor = grams / 100;
    const calories = Math.round((per100g.calories || 0) * factor);
    const protein = Math.round((per100g.protein || 0) * factor * 10) / 10;
    const fat = Math.round((per100g.fat || 0) * factor * 10) / 10;
    const carbs = Math.round((per100g.carbs || 0) * factor * 10) / 10;
    document.getElementById('food-cal').value = calories;
    document.getElementById('food-protein').value = protein;
    document.getElementById('food-fat').value = fat;
    document.getElementById('food-carbs').value = carbs;
  },

  scaleFromGrams() {
    if (!this.selectedFood) return;
    const gramsInput = document.getElementById('food-grams');
    if (!gramsInput) return;
    const grams = Number(gramsInput.value) || 0;
    if (grams <= 0) return;
    this.updateMacroFields(this.selectedFood.per100g, grams);
  }
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}