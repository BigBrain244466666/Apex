const ExportModule = {
  bindUI() {
    // Add export button to topbar if not already present
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      // Check if button already exists
      if (!document.getElementById('export-data-btn')) {
        const btn = document.createElement('button');
        btn.id = 'export-data-btn';
        btn.className = 'btn btn-ghost';
        btn.textContent = '📦 Export Data';
        btn.addEventListener('click', () => this.exportFullData());
        // Insert before the profile button or logout
        const profileBtn = document.getElementById('profile-btn');
        if (profileBtn) {
          topbar.insertBefore(btn, profileBtn);
        } else {
          topbar.appendChild(btn);
        }
      }
    }
  },

  async exportFullData() {
    const sb = getSupabase();
    const userId = App.userId;
    if (!sb || !userId) return alert('Not logged in.');

    // Fetch all user data from all tables
    const tables = [
      'profiles',
      'meals',
      'meal_items',
      'workouts',
      'workout_exercises',
      'exercise_sets',
      'vitals',
      'water_logs',
      'manual_watch_logs',
      'personal_records',
      'friendships',
      'workout_templates',
      'favorite_foods'
    ];

    const data = {};
    let hasError = false;

    for (const table of tables) {
      const { data: rows, error } = await sb.from(table).select('*').eq('user_id', userId);
      if (error) {
        console.warn(`Failed to fetch ${table}:`, error.message);
        hasError = true;
        data[table] = { error: error.message };
      } else {
        data[table] = rows || [];
      }
    }

    if (hasError) {
      if (!confirm('Some data could not be fetched. Continue with partial export?')) return;
    }

    // Add metadata
    const exportPackage = {
      exportedAt: new Date().toISOString(),
      userId: userId,
      userEmail: (await sb.auth.getUser()).data.user?.email || null,
      tables: data
    };

    const json = JSON.stringify(exportPackage, null, 2);
    this.download(json, `apex-export-${new Date().toISOString().slice(0,10)}.json`, 'application/json');
  },

  download(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
};

// Auto-bind when the DOM is ready (called from app.js)
document.addEventListener('DOMContentLoaded', () => {
  // The app.js will call ExportModule.bindUI() later, but we also call it early
  if (typeof ExportModule !== 'undefined' && ExportModule.bindUI) {
    // Wait for app to initialize user
    setTimeout(() => ExportModule.bindUI(), 500);
  }
});