/* ChartManager — flashy charts with theme-aware colors + radar z-order fix */

function getChartTextColor() {
  return getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e6edf3';
}

function getChartMutedColor() {
  return getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#8b949e';
}

function getChartGridColor() {
  return getComputedStyle(document.body).getPropertyValue('--border').trim() || '#30363d';
}

const ChartManager = {
  charts: {},

  init() {
    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      Chart.defaults.animation.duration = 600;
      Chart.defaults.animation.easing = 'easeOutQuart';
      Chart.defaults.color = getChartTextColor();
      Chart.defaults.borderColor = getChartGridColor();
    }
  },

  updateThemeColors() {
    const textColor = getChartTextColor();
    const mutedColor = getChartMutedColor();
    const gridColor = getChartGridColor();

    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;

    Object.values(this.charts).forEach(chart => {
      chart.options.color = textColor;
      if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
        chart.options.plugins.legend.labels.color = mutedColor;
      }
      if (chart.options.scales) {
        Object.values(chart.options.scales).forEach(scale => {
          if (scale.ticks) scale.ticks.color = mutedColor;
          if (scale.grid) scale.grid.color = gridColor;
          if (scale.angleLines) scale.angleLines.color = gridColor;
          if (scale.pointLabels) scale.pointLabels.color = textColor;
        });
      }
      chart.update();
    });
  },

  render(type, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { labels: { color: getChartMutedColor(), font: { size: 12 } } },
        tooltip: {
          backgroundColor: 'rgba(13,17,23,0.95)',
          titleColor: getChartTextColor(),
          bodyColor: getChartMutedColor(),
          borderColor: getChartGridColor(),
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8
        }
      }
    };

    if (type === 'doughnut' || type === 'pie') {
      baseOptions.cutout = '65%';
    } else if (type === 'radar') {
      baseOptions.scales = {
        r: {
          suggestedMin: 0,
          suggestedMax: 100,
          beginAtZero: true,
          ticks: {
            display: true,
            color: getChartTextColor(),
            stepSize: 25,
            font: { size: 10 },
            showLabelBackdrop: false,
            z: 20 // Numbers render on top of data lines
          },
          grid: {
            color: getChartGridColor(),
            circular: false,
            z: 0
          },
          angleLines: {
            color: getChartGridColor(),
            lineWidth: 1,
            z: 0
          },
          pointLabels: {
            color: getChartTextColor(),
            font: { size: 12 },
            padding: 18
          }
        }
      };
    } else {
      baseOptions.scales = {
        x: {
          ticks: { color: getChartMutedColor(), font: { size: 11 } },
          grid: { color: getChartGridColor(), drawBorder: false }
        },
        y: {
          ticks: { color: getChartMutedColor(), font: { size: 11 } },
          grid: { color: getChartGridColor(), drawBorder: false },
          beginAtZero: true
        }
      };
    }

    const options = Object.assign({}, baseOptions, config.options || {});

    if (this.charts[canvasId]) {
      this.charts[canvasId].data = config.data;
      this.charts[canvasId].options = options;
      this.charts[canvasId].update();
      return;
    }

    this.charts[canvasId] = new Chart(ctx, {
      type: type,
      data: config.data,
      options: options
    });
  },

  line(canvasId, labels, datasets, options) {
    const enhanced = datasets.map(function (ds) {
      return Object.assign({}, ds, {
        borderWidth: ds.borderWidth || 2.5,
        pointRadius: ds.pointRadius !== undefined ? ds.pointRadius : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: ds.borderColor || '#4d6bfe',
        pointBorderColor: '#0d1117',
        pointBorderWidth: 1.5,
        fill: ds.fill !== undefined ? ds.fill : true
      });
    });
    this.render('line', canvasId, { data: { labels: labels, datasets: enhanced }, options: options });
  },

  bar(canvasId, labels, datasets, options) {
    const enhanced = datasets.map(function (ds) {
      return Object.assign({}, ds, {
        borderRadius: 6,
        maxBarThickness: 42
      });
    });
    this.render('bar', canvasId, { data: { labels: labels, datasets: enhanced }, options: options });
  },

  doughnut(canvasId, labels, values, options) {
    this.render('doughnut', canvasId, {
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: ['#4d6bfe', '#2ea043', '#d29922', '#a371f7', '#f85149'],
          borderColor: '#0d1117',
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: Object.assign({ cutout: '65%' }, options || {})
    });
  },

  radar(canvasId, labels, datasets, options) {
    const enhanced = datasets.map(function (ds) {
      return Object.assign({}, ds, {
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: ds.borderColor || '#4d6bfe',
        pointBorderColor: '#0d1117',
        pointBorderWidth: 1.5,
        fill: ds.fill !== undefined ? ds.fill : true
      });
    });
    this.render('radar', canvasId, {
      data: { labels: labels, datasets: enhanced },
      options: options
    });
  }
};
