/**
 * Gym module: active workout logger.
 * Only shows INCOMPLETE workouts. Completed ones go to History.
 * Each workout has a start time + can be marked complete.
 */

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
    const dateInput = document.getElementById('new-workout-date');
    const timeInput = document.getElementById('new-workout-time');

    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    if (timeInput && !timeInput.value) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      timeInput.value = hh + ':' + mm;
    }
    
    if (this.bound) return;
    this.bound = true;

    document.getElementById('new-workout-btn').addEventListener('click', () => {
      this.createWorkout();
    });
  },

  async load(userId, token) {
    const sb = getSupabase();

    // Only active (incomplete) workouts.
    const { data: workouts, error } = await sb.from('workouts')
      .select('id, workout_date, start_time, notes, completed')
      .eq('user_id', userId)
      .eq('completed', false)
      .order('workout_date', { ascending: false })
      .limit(20);

    if (error) return console.error(error.message);

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

      freshWorkouts.push({
        id: w.id,
        workout_date: w.workout_date,
        start_time: w.start_time,
        notes: w.notes,
        exercises: exList
      });
    }

    if (token !== App.loadToken) return;

    this.workouts = freshWorkouts;
    this.renderWorkouts();
  },

  async createWorkout() {
    const dateInput = document.getElementById('new-workout-date');
    const timeInput = document.getElementById('new-workout-time');
    const date = dateInput.value || new Date().toISOString().slice(0, 10);
    const startTime = timeInput.value || null;

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const { data, error } = await sb.from('workouts').insert({
      user_id: userId,
      workout_date: date,
      start_time: startTime,
      completed: false
    }).select().single();

    if (error) return alert(error.message);

    this.workouts.unshift({
      id: data.id,
      workout_date: data.workout_date,
      start_time: data.start_time,
      exercises: []
    });

    this.renderWorkouts();
  },

  async completeWorkout(id) {
    if (!confirm('Complete this workout? It will move to History.')) return;

    const sb = getSupabase();
    const { error } = await sb.from('workouts')
      .update({ completed: true })
      .eq('id', id);

    if (error) return alert(error.message);

    this.workouts = this.workouts.filter((w) => w.id !== id);
    this.renderWorkouts();
  },

  async deleteWorkout(id) {
    if (!confirm('Delete this workout and all its exercises?')) return;
    const sb = getSupabase();
    await sb.from('workouts').delete().eq('id', id);
    this.workouts = this.workouts.filter((w) => w.id !== id);
    this.renderWorkouts();
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
  },

  async deleteExercise(exerciseId) {
    const sb = getSupabase();
    await sb.from('workout_exercises').delete().eq('id', exerciseId);
    for (const w of this.workouts) {
      w.exercises = w.exercises.filter((ex) => ex.id !== exerciseId);
    }
    this.renderWorkouts();
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
      container.innerHTML = '<p class="muted">No active workouts. Add one above, or check History for past ones.</p>';
      return;
    }

    const sorted = [...this.workouts].sort((a, b) => b.workout_date.localeCompare(a.workout_date));

    for (const workout of sorted) {
      const card = document.createElement('div');
      card.className = 'workout-card';

      const dateLabel = new Date(workout.workout_date + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric'
      });

      const timeLabel = workout.start_time
        ? formatTime12(workout.start_time)
        : '—';

      card.innerHTML = `
        <div class="workout-header">
          <div class="workout-header-info">
            <span class="workout-date">${dateLabel}</span>
            <span class="workout-time muted">${timeLabel}</span>
          </div>
          <span class="workout-volume">${this.workoutVolume(workout)} lb volume</span>
          <button class="btn btn-ghost complete-workout-btn" data-workout-id="${workout.id}">✓ Complete</button>
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

      card.querySelector('.complete-workout-btn').addEventListener('click', () => this.completeWorkout(workout.id));
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
  }
};

function formatTime12(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
