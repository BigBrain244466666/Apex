const ExportModule = {
  bindUI() {
    document.getElementById('export-json-btn').addEventListener('click', () => this.exportData('json'));
    document.getElementById('export-csv-btn').addEventListener('click', () => this.exportData('csv'));
  },

  async exportData(format) {
    const sb = getSupabase();
    const userId = App.userId;
    const [meals, vitals, workouts, water] = await Promise.all([
      sb.from('meal_items').select('*').eq('user_id', userId),
      sb.from('vitals').select('*').eq('user_id', userId),
      sb.from('workouts').select('*').eq('user_id', userId),
      sb.from('water_logs').select('*').eq('user_id', userId)
    ]);
    const data = { meals: meals.data, vitals: vitals.data, workouts: workouts.data, water: water.data };

    if (format === 'json') {
      this.download(JSON.stringify(data, null, 2), 'apex-export.json', 'application/json');
    } else {
      const csv = this.toCSV(data.meals || []);
      this.download(csv, 'apex-meals.csv', 'text/csv');
    }
  },

  toCSV(rows) {
    if (!rows.length) return 'No data';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    rows.forEach(r => lines.push(headers.map(h => JSON.stringify(r[h] ?? '')).join(',')));
    return lines.join('\n');
  },

  download(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }
};
