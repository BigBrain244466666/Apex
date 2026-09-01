const Water = {
  bound: false,
  totalToday: 0,

  bindUI() {
    if (this.bound) return;
    this.bound = true;
    document.getElementById('add-water-btn').addEventListener('click', () => this.addWater());
  },

  async load(userId) {
    const sb = getSupabase();
    const today = localToday();
    const { data, error } = await sb.from('water_logs')
      .select('amount_ml')
      .eq('user_id', userId)
      .eq('log_date', today);
    if (error) return console.error(error.message);
    this.totalToday = (data || []).reduce((a, r) => a + Number(r.amount_ml), 0);
    this.render();
  },

  async addWater() {
    const input = document.getElementById('water-amount');
    const amount = Number(input.value) || 250;
    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;
    await sb.from('water_logs').insert({ user_id: userId, log_date: localToday(), amount_ml: amount });
    this.totalToday += amount;
    input.value = 250;
    this.render();
  },

  render() {
    const el = document.getElementById('water-total');
    if (el) el.textContent = (this.totalToday / 1000).toFixed(2) + ' L';
  }
};
