/* Gym — workout tracker. PRs are entered MANUALLY (Squat/Bench/Deadlift only). */

const Gym = {
  workouts: [],
  bound: false,
  restTimerInterval: null,

  e1rm(weight, reps) {
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (!w || !r) return 0;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  },

  bindUI() {
    if (this.bound) return;
    this.bound = true;
    const self = this;

    const dateInput = document.getElementById('new-workout-date');
    const timeInput = document.getElementById('new-workout-time');
    if (dateInput) {
      const nowInit = new Date();
      dateInput.value = nowInit.getFullYear() + '-' + String(nowInit.getMonth() + 1).padStart(2, '0') + '-' + String(nowInit.getDate()).padStart(2, '0');
    }
    if (timeInput) {
      const t = new Date();
      timeInput.value = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    }

    document.getElementById('new-workout-btn')?.addEventListener('click', () => this.createWorkout());
    document.getElementById('rest-timer-btn')?.addEventListener('click', () => this.startRestTimer());
    document.getElementById('save-template-btn')?.addEventListener('click', () => this.saveTemplate());
    document.getElementById('load-template-select')?.addEventListener('change', (e) => this.loadTemplate(e.target.value));
    document.getElementById('pr-form')?.addEventListener('submit', (e) => this.saveManualPR(e));
  },

  async load(userId, token) {
    const sb = getSupabase();
    const res = await sb.from('workouts').select('*').eq('user_id', userId).eq('completed', false).order('workout_date', { ascending: false }).limit(20);
    if (res.error) return console.error(res.error.message);

    const fresh = [];
    for (const w of (res.data || [])) {
      const exRes = await sb.from('workout_exercises').select('*').eq('workout_id', w.id).order('created_at', { ascending: true });
      const exList = [];
      for (const ex of (exRes.data || [])) {
        const setRes = await sb.from('exercise_sets').select('*').eq('exercise_id', ex.id).order('set_number', { ascending: true });
        exList.push({ id: ex.id, exercise_name: ex.exercise_name, sets: setRes.data || [] });
      }
      fresh.push({ id: w.id, workout_date: w.workout_date, start_time: w.start_time, exercises: exList });
    }

    if (token !== App.loadToken) return;
    this.workouts = fresh;
    this.renderWorkouts();
    this.loadTemplates();
    this.loadManualPRs();
  },

  async createWorkout() {
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const date = document.getElementById('new-workout-date').value || today;
    const time = document.getElementById('new-workout-time').value || null;

    const res = await sb.from('workouts').insert({ user_id: userId, workout_date: date, start_time: time, completed: false }).select().single();
    if (res.error) return alert(res.error.message);

    this.workouts.unshift({ id: res.data.id, workout_date: res.data.workout_date, start_time: res.data.start_time, exercises: [] });
    this.renderWorkouts();
  },

  async completeWorkout(id) {
    if (!confirm('Complete this workout? It moves to History.')) return;
    const sb = getSupabase();
    await sb.from('workouts').update({ completed: true }).eq('id', id);
    this.workouts = this.workouts.filter(w => w.id !== id);
    this.renderWorkouts();
  },

  async deleteWorkout(id) {
    if (!confirm('Delete this workout and all its exercises? This cannot be undone.')) return;
    const sb = getSupabase();
    const exRes = await sb.from('workout_exercises').select('id').eq('workout_id', id);
    const exerciseIds = (exRes.data || []).map(e => e.id);
    if (exerciseIds.length) {
      await sb.from('exercise_sets').delete().in('exercise_id', exerciseIds);
      await sb.from('workout_exercises').delete().in('id', exerciseIds);
    }
    await sb.from('workouts').delete().eq('id', id);
    this.workouts = this.workouts.filter(w => w.id !== id);
    this.renderWorkouts();
  },

  async addExercise(workoutId) {
    const input = document.getElementById('exercise-input-' + workoutId);
    const name = input?.value.trim();
    if (!name) return alert('Enter an exercise name.');
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    const res = await sb.from('workout_exercises').insert({ workout_id: workoutId, user_id: userId, exercise_name: name }).select().single();
    if (res.error) return alert(res.error.message);
    const workout = this.workouts.find(w => w.id === workoutId);
    if (workout) workout.exercises.push({ id: res.data.id, exercise_name: res.data.exercise_name, sets: [] });
    input.value = '';
    this.renderWorkouts();
  },

  async deleteExercise(exerciseId) {
    if (!confirm('Delete this exercise and all its sets?')) return;
    const sb = getSupabase();
    await sb.from('exercise_sets').delete().eq('exercise_id', exerciseId);
    await sb.from('workout_exercises').delete().eq('id', exerciseId);
    this.workouts.forEach(w => w.exercises = w.exercises.filter(ex => ex.id !== exerciseId));
    this.renderWorkouts();
  },

  async addSet(exerciseId) {
    const weightInput = document.getElementById('set-weight-' + exerciseId);
    const repsInput = document.getElementById('set-reps-' + exerciseId);
    const weight = Number(weightInput?.value) || 0;
    const reps = Number(repsInput?.value) || 0;
    if (!reps) return alert('Enter reps.');

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    let nextSet = 1;
    this.workouts.forEach(w => {
      const ex = w.exercises.find(e => e.id === exerciseId);
      if (ex && ex.sets.length) nextSet = Math.max(nextSet, Math.max(...ex.sets.map(s => s.set_number)) + 1);
    });

    const res = await sb.from('exercise_sets').insert({ exercise_id: exerciseId, user_id: userId, set_number: nextSet, weight, reps }).select().single();
    if (res.error) return alert(res.error.message);

    this.workouts.forEach(w => {
      const ex = w.exercises.find(e => e.id === exerciseId);
      if (ex) { ex.sets.push(res.data); ex.sets.sort((a, b) => a.set_number - b.set_number); }
    });

    if (weightInput) weightInput.value = '';
    if (repsInput) repsInput.value = '';
    this.renderWorkouts();
  },

  async deleteSet(setId) {
    const sb = getSupabase();
    await sb.from('exercise_sets').delete().eq('id', setId);
    this.workouts.forEach(w => w.exercises.forEach(ex => ex.sets = ex.sets.filter(s => s.id !== setId)));
    this.renderWorkouts();
  },

  /* ===== MANUAL PR ENTRY ===== */

  async saveManualPR(e) {
    e.preventDefault();
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const lift = document.getElementById('pr-lift').value;
    const weight = Number(document.getElementById('pr-weight').value);
    const date = document.getElementById('pr-date').value || new Date().toISOString().slice(0, 10);

    if (!lift) return alert('Select a lift.');
    if (!weight || weight <= 0) return alert('Enter a valid weight.');

    const res = await sb.from('personal_records').insert({
      user_id: userId,
      exercise_name: lift,
      weight: weight,
      reps: 1,
      achieved_at: date
    });

    if (res.error) return alert(res.error.message);

    document.getElementById('pr-weight').value = '';
    this.loadManualPRs();
    if (typeof Dashboard !== 'undefined' && Dashboard.renderPRs) Dashboard.renderPRs();
  },

  async loadManualPRs() {
    const sb = getSupabase();
    const { data: prs } = await sb.from('personal_records').select('*').eq('user_id', App.userId).order('weight', { ascending: false });

    const gymList = document.getElementById('pr-list-manual');
    if (gymList) {
      gymList.innerHTML = (prs || []).length
        ? prs.map(p => `
          <div class="pr-row">
            <span class="pr-exercise">${escapeHtml(p.exercise_name)}</span>
            <span class="pr-value">${p.weight} lb × 1</span>
            <span class="pr-date muted">${p.achieved_at}</span>
            <button class="icon-btn delete-pr" data-prid="${p.id}" title="Delete PR">🗑️</button>
          </div>`).join('')
        : '<p class="muted">No PRs yet. Enter your Squat, Bench, and Deadlift 1-rep maxes above.</p>';
    }

    const badgeEl = document.getElementById('pr-badges');
    if (badgeEl) {
      badgeEl.innerHTML = (prs || []).length
        ? prs.map(p => `<span class="badge">🏆 ${escapeHtml(p.exercise_name)}: ${p.weight} lb</span>`).join('')
        : '<span class="muted">No PRs yet.</span>';
    }

    document.querySelectorAll('.delete-pr').forEach(btn => {
      btn.addEventListener('click', () => this.deleteManualPR(btn.dataset.prid));
    });
  },

  async deleteManualPR(prId) {
    if (!confirm('Delete this PR?')) return;
    const sb = getSupabase();
    await sb.from('personal_records').delete().eq('id', prId);
    this.loadManualPRs();
    if (typeof Dashboard !== 'undefined' && Dashboard.renderPRs) Dashboard.renderPRs();
  },

  startRestTimer() {
    const seconds = Number(document.getElementById('rest-time')?.value) || 90;
    const display = document.getElementById('rest-timer-display');
    if (!display) return;
    if (this.restTimerInterval) clearInterval(this.restTimerInterval);

    display.classList.remove('hidden');
    let remaining = seconds;
    display.textContent = remaining + 's';
    this.restTimerInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(this.restTimerInterval);
        display.textContent = '🔥 Go!';
        setTimeout(() => display.classList.add('hidden'), 2000);
      } else {
        display.textContent = remaining + 's';
      }
    }, 1000);
  },

  async saveTemplate() {
    const name = document.getElementById('template-name')?.value.trim();
    if (!name) return alert('Enter template name.');
    const exercises = this.workouts.flatMap(w => w.exercises.map(ex => ex.exercise_name));
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    await sb.from('workout_templates').insert({ user_id: userId, name, exercises: JSON.stringify([...new Set(exercises)]) });
    this.loadTemplates();
  },

  async loadTemplates() {
    const sb = getSupabase();
    const { data } = await sb.from('workout_templates').select('*').eq('user_id', App.userId);
    const select = document.getElementById('load-template-select');
    if (select) select.innerHTML = '<option value="">Load template…</option>' + (data || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  },

  async loadTemplate(id) {
    if (!id) return;
    const sb = getSupabase();
    const { data } = await sb.from('workout_templates').select('*').eq('id', id).single();
    const exercises = JSON.parse(data.exercises || '[]');
    const workoutId = this.workouts[0]?.id;
    if (!workoutId) return alert('Create a workout first.');
    for (const exName of exercises) {
      await sb.from('workout_exercises').insert({ workout_id: workoutId, user_id: App.userId, exercise_name: exName }).select().single();
    }
    this.load(App.userId, ++App.loadToken);
  },

  workoutVolume(workout) {
    let vol = 0;
    workout.exercises.forEach(ex => ex.sets.forEach(s => vol += (Number(s.weight) || 0) * (Number(s.reps) || 0)));
    return vol;
  },

  renderWorkouts() {
    const container = document.getElementById('workouts-container');
    if (!container) return;
    container.innerHTML = '';
    if (!this.workouts.length) {
      container.innerHTML = '<p class="muted">No active workouts. Click "+ New Workout" to start.</p>';
      return;
    }

    this.workouts.slice().sort((a, b) => b.workout_date.localeCompare(a.workout_date)).forEach(workout => {
      const vol = this.workoutVolume(workout);
      const card = document.createElement('div');
      card.className = 'workout-card slide-in';
      card.innerHTML = `
        <div class="workout-header">
          <div class="workout-header-info">
            <span class="workout-date">${formatDateLabel(workout.workout_date)}</span>
            <span class="workout-time muted">${formatTime12(workout.start_time)}</span>
          </div>
          <span class="workout-volume">${vol} lb volume</span>
          <button class="btn btn-ghost complete-workout-btn" data-wid="${workout.id}">✓ Complete</button>
          <button class="icon-btn delete-workout" data-wid="${workout.id}" title="Delete workout">🗑️</button>
        </div>
        <div class="workout-exercises">
          ${workout.exercises.map(ex => `
            <div class="exercise-block" data-exid="${ex.id}">
              <div class="exercise-header">
                <span class="exercise-name">${escapeHtml(ex.exercise_name)}</span>
                <button class="icon-btn delete-exercise" data-exid="${ex.id}" title="Delete exercise">🗑️</button>
              </div>
              <div class="set-table">
                <div class="set-row set-row-head"><span>Set</span><span>Weight</span><span>Reps</span><span>e1RM</span><span></span></div>
                ${ex.sets.map(s => `
                  <div class="set-row">
                    <span>${s.set_number}</span>
                    <span>${Number(s.weight) || 0} lb</span>
                    <span>${s.reps}</span>
                    <span class="muted">${this.e1rm(s.weight, s.reps) || '—'}</span>
                    <button class="icon-btn delete-set" data-sid="${s.id}" title="Delete set">🗑️</button>
                  </div>`).join('') || '<div class="muted set-empty">No sets yet.</div>'}
              </div>
              <div class="add-set-row">
                <input id="set-weight-${ex.id}" type="number" placeholder="Weight" />
                <input id="set-reps-${ex.id}" type="number" placeholder="Reps" />
                <button class="btn btn-ghost add-set-btn" data-exid="${ex.id}">+ Set</button>
              </div>
            </div>`).join('') || '<p class="muted">No exercises yet.</p>'}
        </div>
        <div class="add-exercise-row">
          <input id="exercise-input-${workout.id}" type="text" placeholder="Exercise name" />
          <button class="btn btn-outline add-exercise-btn" data-wid="${workout.id}">+ Exercise</button>
        </div>`;
      container.appendChild(card);

      card.querySelector('.complete-workout-btn').addEventListener('click', () => this.completeWorkout(workout.id));
      card.querySelector('.delete-workout').addEventListener('click', () => this.deleteWorkout(workout.id));
      card.querySelector('.add-exercise-btn').addEventListener('click', () => this.addExercise(workout.id));
      card.querySelectorAll('.delete-exercise').forEach(b => b.addEventListener('click', () => this.deleteExercise(b.dataset.exid)));
      card.querySelectorAll('.delete-set').forEach(b => b.addEventListener('click', () => this.deleteSet(b.dataset.sid)));
      card.querySelectorAll('.add-set-btn').forEach(b => b.addEventListener('click', () => this.addSet(b.dataset.exid)));
    });
  }
};

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime12(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
