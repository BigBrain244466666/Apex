/* Theme — dark/light toggle with chart re-render */

const Theme = {
  bindUI() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const body = document.body;
      const isLight = body.classList.toggle('light');
      localStorage.setItem('apex-theme', isLight ? 'light' : 'dark');

      // Re-render charts with new colors
      if (typeof ChartManager !== 'undefined' && ChartManager.updateThemeColors) {
        ChartManager.updateThemeColors();
      }
    });
  },

  init() {
    const saved = localStorage.getItem('apex-theme');
    if (saved === 'light') {
      document.body.classList.add('light');
    }
  }
};
