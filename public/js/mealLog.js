const MealLog = {
  meals: [],
  bound: false,
  currentMealId: null,
  selectedFood: null,
  debounceTimer: null,
  scannerActive: false,

  bindUI() {
    if (this.bound) return;
    this.bound = true;

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

    // ---- Ensure UI elements ----
    this.ensureGramsInput();
    this.ensureDecimalInputs();
    this.ensureTimePicker();

    const gramsInput = document.getElementById('food-grams');
    if (gramsInput) {
      gramsInput.addEventListener('input', () => this.scaleFromGrams());
    }

    // ---- Barcode scanner button ----
    const scanBtn = document.getElementById('scan-barcode-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.scanBarcode());
    }
  },

  // ---------- HELPER: GRAMS INPUT ----------
  ensureGramsInput() {
    const form = document.getElementById('food-form');
    if (!form) return;
    if (document.getElementById('food-grams')) return;
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
  },

  // ---------- HELPER: DECIMAL INPUTS ----------
  ensureDecimalInputs() {
    ['food-cal', 'food-protein', 'food-fat', 'food-carbs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.setAttribute('step', '0.01');
        el.setAttribute('min', '0');
      }
    });
  },

  // ---------- HELPER: MEAL TIME PICKER ----------
  ensureTimePicker() {
    const modal = document.getElementById('meal-type-modal');
    if (!modal) return;
    if (document.getElementById('meal-time-input')) return;
    const grid = modal.querySelector('.meal-type-grid');
    if (!grid) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'meal-time-wrapper';
    wrapper.style.marginTop = '1rem';
    wrapper.style.textAlign = 'center';
    const now = new Date();
    const defaultTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    wrapper.innerHTML = `
      <label class="field-label" style="text-align:center;">Meal Time
        <input id="meal-time-input" type="time" value="${defaultTime}" />
      </label>
    `;
    grid.parentNode.insertBefore(wrapper, grid.nextSibling);
  },

  getMealTime() {
    const input = document.getElementById('meal-time-input');
    return input ? input.value : new Date().toTimeString().slice(0, 5);
  },

  // ---------- MODAL HELPERS ----------
  openModal(id) { document.getElementById(id)?.classList.remove('hidden'); },
  closeModal(id) { document.getElementById(id)?.classList.add('hidden'); },
  hideResults(el) { if (el) { el.classList.add('hidden'); el.innerHTML = ''; } },

  // ---------- CREATE MEAL ----------
  async createMeal(mealType) {
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const mealTime = this.getMealTime();

    const res = await sb.from('meals').insert({
      user_id: userId,
      meal_type: mealType,
      meal_date: today,
      meal_time: mealTime
    }).select().single();

    if (res.error) return alert(res.error.message);
    this.meals.push({ id: res.data.id, meal_type: res.data.meal_type, meal_time: res.data.meal_time, items: [] });
    this.renderMeals();
    this.closeModal('meal-type-modal');
  },

  // ---------- SAVE FOOD FROM FORM ----------
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

    // Clear search and reset
    document.getElementById('food-search').value = '';
    const gramsInput = document.getElementById('food-grams');
    if (gramsInput) gramsInput.value = 100;
    this.hideResults(document.getElementById('food-results'));
    this.selectedFood = null;

    this.closeModal('food-modal');
    this.renderMeals();
    this.updateTotals();
  },

  // ---------- OPEN FOOD MODAL ----------
  openFoodModal(mealId) {
    this.currentMealId = mealId;
    this.openModal('food-modal');
    document.getElementById('food-search').value = '';
    document.getElementById('food-search').focus();
    const grams = document.getElementById('food-grams');
    if (grams) grams.value = 100;
    this.selectedFood = null;
    ['food-cal', 'food-protein', 'food-fat', 'food-carbs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this.hideResults(document.getElementById('food-results'));
  },

  // ---------- COPY YESTERDAY ----------
  async copyYesterday() {
    const sb = getSupabase();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const d = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    const { data: meals } = await sb.from('meals').select('id, meal_type, meal_time').eq('user_id', App.userId).eq('meal_date', d);
    for (const m of (meals || [])) {
      const { data: items } = await sb.from('meal_items').select('*').eq('meal_id', m.id);
      const now = new Date();
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const newMeal = await sb.from('meals').insert({
        user_id: App.userId,
        meal_type: m.meal_type || 'snack',
        meal_date: today,
        meal_time: m.meal_time || null
      }).select().single();
      for (const it of (items || [])) {
        await sb.from('meal_items').insert({
          meal_id: newMeal.data.id, user_id: App.userId,
          food_name: it.food_name, calories: it.calories, protein: it.protein, fat: it.fat, carbs: it.carbs
        });
      }
    }
    this.load(App.userId, ++App.loadToken);
  },

  // ---------- FAVORITES ----------
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

  // ---------- LOAD MEALS ----------
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

      this.meals.push({ id: m.id, meal_type: m.meal_type, meal_time: m.meal_time, items: uniqueItems });
    }

    this.renderMeals();
    this.updateTotals();
  },

  // ---------- RENDER MEALS ----------
  renderMeals() {
    const container = document.getElementById('meals-container');
    if (!container) return;
    container.innerHTML = '';

    this.meals.forEach(meal => {
      const totals = this.mealTotals(meal);
      const group = document.createElement('div');
      group.className = 'meal-group';
      const timeDisplay = meal.meal_time ? ` · ${meal.meal_time}` : '';
      group.innerHTML = `
        <div class="meal-group-header">
          <span class="meal-type-badge">${capitalize(meal.meal_type)}${timeDisplay}</span>
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

  // ---------- DELETE ----------
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

  // ---------- TOTALS ----------
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

  // ---------- FOOD SEARCH & SELECT ----------
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
      btn.type = 'button';
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
    this.selectedFood = { per100g: b };
    document.getElementById('food-search').value = h.name;
    const gramsInput = document.getElementById('food-grams');
    if (gramsInput) gramsInput.value = 100;
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
  },

  // ---------- BARCODE SCANNER ----------
  async scanBarcode() {
    if (this.scannerActive) return;
    this.scannerActive = true;

    // Check for camera permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      alert('Camera access denied or not available. Please allow camera in your browser settings.');
      this.scannerActive = false;
      return;
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'scanner-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: #000; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 1rem;
    `;
    overlay.innerHTML = `
      <div id="scanner-container" style="width:100%; max-width:500px; height:400px; background:#000; position:relative; border-radius:12px; overflow:hidden;">
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; opacity:0.3; pointer-events:none; font-size:1.2rem; text-align:center; padding:1rem;">
          Point camera at barcode
        </div>
      </div>
      <button id="scanner-close" class="btn btn-ghost" style="margin-top:1.5rem; color:#fff; background:rgba(255,255,255,0.1); padding:0.6rem 2rem; border-radius:8px;">Cancel</button>
    `;
    document.body.appendChild(overlay);

    // Quagga config
    const config = {
      inputStream: {
        type: 'LiveStream',
        target: document.querySelector('#scanner-container'),
        constraints: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      },
      locator: {
        patchSize: 'medium',
        halfSample: true
      },
      numOfWorkers: 1,
      decoder: {
        readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'code_39_reader', 'upc_reader']
      },
      locate: true
    };

    Quagga.init(config, (err) => {
      if (err) {
        console.error('Quagga init error:', err);
        alert('Could not start scanner. Please use a mobile device or a browser with camera support.');
        this.scannerActive = false;
        overlay.remove();
        return;
      }
      Quagga.start();
    });

    // Handle detection
    Quagga.onDetected(async (result) => {
      const code = result.codeResult.code;
      Quagga.stop();
      this.scannerActive = false;
      overlay.remove();
      await this.lookupBarcode(code);
    });

    // Close button
    overlay.querySelector('#scanner-close').addEventListener('click', () => {
      Quagga.stop();
      this.scannerActive = false;
      overlay.remove();
    });

    // Cleanup on overlay click (background)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        Quagga.stop();
        this.scannerActive = false;
        overlay.remove();
      }
    });
  },

  async lookupBarcode(code) {
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        alert('Product not found in Open Food Facts.');
        return;
      }

      const product = data.product;
      const name = product.product_name || product.generic_name || 'Unknown product';
      const nutriments = product.nutriments || {};

      const per100g = {
        calories: nutriments['energy-kcal_100g'] || nutriments.energy_100g || null,
        protein: nutriments.proteins_100g ?? null,
        fat: nutriments.fat_100g ?? null,
        carbs: nutriments.carbohydrates_100g ?? null
      };

      document.getElementById('food-search').value = name;
      this.selectedFood = { per100g };
      const gramsInput = document.getElementById('food-grams');
      if (gramsInput) gramsInput.value = 100;
      this.updateMacroFields(per100g, 100);
    } catch (err) {
      alert('Failed to look up barcode: ' + err.message);
    }
  }
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}