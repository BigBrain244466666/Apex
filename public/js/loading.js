/* Apex Aura loading screen controller + motivational quote rotator. */

const AuraQuotes = [
  'The grind doesn\u2019t care how you feel. Show up.',
  'You\u2019re one workout from a better mood.',
  'Discipline is choosing what you want most over what you want now.',
  'The only bad workout is the one that didn\u2019t happen.',
  'Recomp is slow. Consistency is the cheat code.',
  'Strong body. Sharp mind. Apex standard.',
  'Every rep is a vote for who you\u2019re becoming.',
  'Progress is invisible until it isn\u2019t. Keep going.',
  'You are not tired. You are becoming.',
  'Apex: the highest point. That\u2019s the target.'
];

const AuraLoading = {
  started: false,
  quoteIndex: 0,
  quoteTimer: null,

  show() {
    const el = document.getElementById('aura-loader');
    if (el) el.classList.remove('hidden-loader');
    if (!this.started) this.startQuotes();
  },

  hide() {
    const el = document.getElementById('aura-loader');
    if (el) el.classList.add('hidden-loader');
  },

  startQuotes() {
    this.started = true;
    const el = document.getElementById('aura-quote');
    if (!el) return;

    el.textContent = AuraQuotes[0];
    this.quoteIndex = 0;

    this.quoteTimer = setInterval(function () {
      const quoteEl = document.getElementById('aura-quote');
      if (!quoteEl) return;

      quoteEl.classList.add('fade-out');

      setTimeout(function () {
        AuraLoading.quoteIndex = (AuraLoading.quoteIndex + 1) % AuraQuotes.length;
        quoteEl.textContent = AuraQuotes[AuraLoading.quoteIndex];
        quoteEl.classList.remove('fade-out');
      }, 500);
    }, 3200);
  }
};