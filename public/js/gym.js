const Gym = {
  workouts: [],
  bound: false,

  e1rm(weight, reps) {
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (!w || !r) return 0;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  },

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    document.getElementById('new-workout-btn').addEventListener('click', () => {
      this.createWorkout();
    });

    document.getElementById('trend-exercise-select').addEventListener('change', (e) => {
      this.renderTrends(e.target.value);
    });
  },

  async load(userId, token) {
    const sb = getSupabase();

    const { data: workouts, error } = await sb.from('workouts')
      .select('id, workout_date, notes')
      .eq('user_id', userId)
      .order('workout_date', { ascending: false })
      .limit(100);

    if (error) return console.error(error.message);

    // Build fresh array locally.
    const freshWorkouts = [];
    for (const w of workouts || []) {
      const { data: exercises } = await sb.from('workout_exercises')
        .select('id, exercise_name')
        .eq('workout_id', w.id)
        .order('created_at', { ascending: true });

      const exList = [];
      for (const ex of exercises || []) {
        const { data: sets } = await sb.from('exercise_sets')
          .select('*')
          .eq('exercise_id', ex.id)
          .order('set_number', { ascending: true });
        exList.push({ id: ex.id, exercise_name: ex.exercise_name, sets: sets || [] });
      }

      freshWorkouts.push({ id: w.id, workout_date: w.workout_date, notes: w.notes, exercises: exList });
    }

    if (token !== App.loadToken) return; // stale load — discard

    this.workouts = freshWorkouts;
    this.renderWorkouts();
    this.populateTrendSelector();
  },

  async createWorkout() {
    const dateInput = document.getElementById('new-workout-date');
    const date = dateInput.value || new Date().toISOString().slice(0, 10);

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const { data, error } = await sb.from('workouts').insert({
      user_id: userId,
      workout_date: date
    }).select().single();

    if (error) return alert(error.message);

    this.workouts.unshift({ id: data.id, workout_date: data.workout_date, notes: null, exercises: [] });
    this.renderWorkouts();
    this.populateTrendSelector();
  },

  async deleteWorkout(id) {
    if (!confirm('Delete this workout and all its exercises?')) return;
    const sb = getSupabase();
    await sb.from('workouts').delete().eq('id', id);
    this.workouts = this.workouts.filter((w) => w.id !== id);
    this.renderWorkouts();
    this.populateTrendSelector();
  },

  async addExercise(workoutId) {
    const input = document.getElementById(`exercise-input-${workoutId}`);
    const name = input.value.trim();
    if (!name) return alert('Enter an exercise name.');

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const { data, error } = await sb.from('workout_exercises').insert({
      workout_id: workoutId,
      user_id: userId,
      exercise_name: name
    }).select().single();

    if (error) return alert(error.message);

    const workout = this.workouts.find((w) => w.id === workoutId);
    if (workout) workout.exercises.push({ id: data.id, exercise_name: data.exercise_name, sets: [] });

    input.value = '';
    this.renderWorkouts();
    this.populateTrendSelector();
  },

  async deleteExercise(exerciseId) {
    const sb = getSupabase();
    await sb.from('workout_exercises').delete().eq('id', exerciseId);
    for (const w of this.workouts) {
      w.exercises = w.exercises.filter((ex) => ex.id !== exerciseId);
    }
    this.renderWorkouts();
    this.populateTrendSelector();
  },

  async addSet(exerciseId) {
    const weightInput = document.getElementById(`set-weight-${exerciseId}`);
    const repsInput = document.getElementById(`set-reps-${exerciseId}`);
    const weight = Number(weightInput.value) || 0;
    const reps = Number(repsInput.value) || 0;

    if (!reps) return alert('Enter reps.');

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    let nextSet = 1;
    for (const w of this.workouts) {
      const ex = w.exercises.find((e) => e.id === exerciseId);
      if (ex && ex.sets.length) {
        nextSet = Math.max(nextSet, Math.max(...ex.sets.map((s) => s.set_number)) + 1);
      }
    }

    const { data, error } = await sb.from('exercise_sets').insert({
      exercise_id: exerciseId,
      user_id: userId,
      set_number: nextSet,
      weight,
      reps
    }).select().single();

    if (error) return alert(error.message);

    for (const w of this.workouts) {
      const ex = w.exercises.find((e) => e.id === exerciseId);
      if (ex) {
        ex.sets.push(data);
        ex.sets.sort((a, b) => a.set_number - b.set_number);
      }
    }

    weightInput.value = '';
    repsInput.value = '';
    this.renderWorkouts();
  },

  async deleteSet(setId) {
    const sb = getSupabase();
    await sb.from('exercise_sets').delete().eq('id', setId);
    for (const w of this.workouts) {
      for (const ex of w.exercises) {
        ex.sets = ex.sets.filter((s) => s.id !== setId);
      }
    }
    this.renderWorkouts();
  },

  workoutVolume(workout) {
    let vol = 0;
    for (const ex of workout.exercises) {
      for (const s of ex.sets) vol += (Number(s.weight) || 0) * (Number(s.reps) || 0);
    }
    return vol;
  },

  renderWorkouts() {
    const container = document.getElementById('workouts-container');
    container.innerHTML = '';

    if (!this.workouts.length) {
      container.innerHTML = '<p class="muted">No workouts yet. Add your first workout above.</p>';
      return;
    }

    const sorted = [...this.workouts].sort((a, b) => b.workout_date.localeCompare(a.workout_date));

    for (const workout of sorted) {
      const card = document.createElement('div');
      card.className = 'workout-card';

      const dateLabel = new Date(workout.workout_date + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric'
      });

      card.innerHTML = `
        <div class="workout-header">
          <span class="workout-date">${dateLabel}</span>
          <span class="workout-volume">${this.workoutVolume(workout)} lb volume</span>
          <button class="icon-btn delete-workout" data-workout-id="${workout.id}" title="Delete workout">✕</button>
        </div>

        <div class="workout-exercises">
          ${workout.exercises.map((ex) => `
            <div class="exercise-block" data-exercise-id="${ex.id}">
              <div class="exercise-header">
                <span class="exercise-name">${escapeHtml(ex.exercise_name)}</span>
                <button class="icon-btn delete-exercise" data-exercise-id="${ex.id}" title="Delete exercise">✕</button>
              </div>

              <div class="set-table">
                <div class="set-row set-row-head">
                  <span>Set</span><span>Weight</span><span>Reps</span><span>e1RM</span><span></span>
                </div>
                ${ex.sets.map((s) => `
                  <div class="set-row" data-set-id="${s.id}">
                    <span>${s.set_number}</span>
                    <span>${Number(s.weight) || 0} lb</span>
                    <span>${s.reps}</span>
                    <span class="muted">${this.e1rm(s.weight, s.reps) || '—'}</span>
                    <button class="icon-btn delete-set" data-set-id="${s.id}" title="Delete set">✕</button>
                  </div>
                `).join('') || '<div class="muted set-empty">No sets yet.</div>'}
              </div>

              <div class="add-set-row">
                <input id="set-weight-${ex.id}" type="number" min="0" step="0.5" placeholder="Weight (lb)" />
                <input id="set-reps-${ex.id}" type="number" min="0" placeholder="Reps" />
                <button class="btn btn-ghost add-set-btn" data-exercise-id="${ex.id}">+ Set</button>
              </div>
            </div>
          `).join('') || '<p class="muted">No exercises. Add one below.</p>'}
        </div>

        <div class="add-exercise-row">
          <input id="exercise-input-${workout.id}" type="text" placeholder="Exercise name (e.g. Bench Press)" />
          <button class="btn btn-outline add-exercise-btn" data-workout-id="${workout.id}">+ Exercise</button>
        </div>
      `;

      card.querySelector('.delete-workout').addEventListener('click', () => this.deleteWorkout(workout.id));
      card.querySelector('.add-exercise-btn').addEventListener('click', () => this.addExercise(workout.id));

      card.querySelectorAll('.delete-exercise').forEach((btn) => {
        btn.addEventListener('click', () => this.deleteExercise(btn.dataset.exerciseId));
      });

      card.querySelectorAll('.delete-set').forEach((btn) => {
        btn.addEventListener('click', () => this.deleteSet(btn.dataset.setId));
      });

      card.querySelectorAll('.add-set-btn').forEach((btn) => {
        btn.addEventListener('click', () => this.addSet(btn.dataset.exerciseId));
      });

      container.appendChild(card);
    }
  },

  uniqueExerciseNames() {
    const set = new Set();
    for (const w of this.workouts) {
      for (const ex of w.exercises) set.add(ex.exercise_name);
    }
    return [...set].sort();
  },

  populateTrendSelector() {
    const select = document.getElementById('trend-exercise-select');
    const current = select.value;
    const names = this.uniqueExerciseNames();

    select.innerHTML = '<option value="">— Select exercise —</option>' +
      names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

    if (current && names.includes(current)) select.value = current;

    this.renderTrends(select.value);
  },

  renderTrends(exerciseName) {
    const container = document.getElementById('trends-container');
    container.innerHTML = '';

    if (!exerciseName) {
      container.innerHTML = '<p class="muted">Select an exercise above to see your progression.</p>';
      return;
    }

    const byDate = new Map();

    for (const w of this.workouts) {
      for (const ex of w.exercises) {
        if (ex.exercise_name !== exerciseName) continue;
        if (!ex.sets.length) continue;

        if (!byDate.has(w.workout_date)) {
          byDate.set(w.workout_date, { date: w.workout_date, sets: [], bestE1rm: 0, volume: 0 });
        }
        const entry = byDate.get(w.workout_date);
        for (const s of ex.sets) {
          entry.sets.push(s);
          const e = this.e1rm(s.weight, s.reps);
          entry.bestE1rm = Math.max(entry.bestE1rm, e);
          entry.volume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
        }
      }
    }

    const dates = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));

    if (!dates.length) {
      container.innerHTML = '<p class="muted">No sets logged for this exercise yet.</p>';
      return;
    }

    const chrono = [...dates].reverse();
    const chartData = chrono.map((d) => ({ label: d.date, value: d.bestE1rm }));

    container.innerHTML = `
      <h3 class="trend-title">${escapeHtml(exerciseName)}</h3>
      <div id="trend-chart" class="trend-chart-wrap"></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Date</th><th>Best e1RM</th><th>Volume (lb)</th><th>Sets</th></tr>
          </thead>
          <tbody>
            ${dates.map((d) => `
              <tr>
                <td>${d.date}</td>
                <td>${d.bestE1rm || '—'}</td>
                <td>${d.volume}</td>
                <td>${d.sets.map((s) => `${Number(s.weight) || 0}×${s.reps}`).join(', ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    this.renderChart(document.getElementById('trend-chart'), chartData);
  },

  renderChart(canvasEl, dataPoints) {
    if (!dataPoints || dataPoints.length < 2) {
      canvasEl.innerHTML = '<p class="muted small">Log at least 2 workouts to see a trend line.</p>';
      return;
    }

    const w = 600;
    const h = 180;
    const pad = 30;
    const vals = dataPoints.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = (max - min) || 1;

    const xFor = (i) => pad + (i / (dataPoints.length - 1)) * (w - pad * 2);
    const yFor = (v) => h - pad - ((v - min) / range) * (h - pad * 2);

    const linePoints = dataPoints.map((d, i) => `${xFor(i)},${yFor(d.value)}`).join(' ');

    canvasEl.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" class="trend-chart" preserveAspectRatio="none">
        <polyline points="${linePoints}" fill="none" stroke="#4d6bfe" stroke-width="2" vector-effect="non-scaling-stroke" />
        ${dataPoints.map((d, i) => `<circle cx="${xFor(i)}" cy="${yFor(d.value)}" r="3.5" fill="#4d6bfe" />`).join('')}
      </svg>
      <div class="trend-chart-labels">
        <span>${escapeHtml(dataPoints[0].label)}</span>
        <span>${escapeHtml(dataPoints[dataPoints.length - 1].label)}</span>
      </div>
    `;
  }
};
