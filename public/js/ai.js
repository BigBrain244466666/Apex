// public/js/ai.js – self‑binding, no dependency on app.js
(function() {
  const AI = {
    chatOpen: false,
    messagesEl: null,
    inputEl: null,
    sendBtn: null,
    toggleBtn: null,
    panel: null,

    init() {
      console.log('AI.init() called');
      this.toggleBtn = document.getElementById('ai-chat-toggle');
      this.panel = document.getElementById('ai-chat-panel');
      const close = document.getElementById('ai-chat-close');
      this.messagesEl = document.getElementById('ai-messages');
      this.inputEl = document.getElementById('ai-input');
      this.sendBtn = document.getElementById('ai-send');

      if (!this.toggleBtn || !this.panel) {
        console.warn('AI: toggle or panel not found – retrying in 1s');
        setTimeout(() => this.init(), 1000);
        return;
      }

      console.log('AI: elements found, binding events');

      this.toggleBtn.addEventListener('click', () => {
        console.log('AI toggle clicked');
        this.panel.classList.toggle('hidden');
        this.chatOpen = !this.panel.classList.contains('hidden');
        if (this.chatOpen) this.inputEl?.focus();
      });

      close?.addEventListener('click', () => {
        console.log('AI close clicked');
        this.panel.classList.add('hidden');
        this.chatOpen = false;
      });

      this.sendBtn?.addEventListener('click', () => this.sendQuestion());
      this.inputEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.sendQuestion();
      });

      console.log('AI: ready');
    },

    async sendQuestion() {
      const query = this.inputEl?.value.trim();
      if (!query) return;
      this.inputEl.value = '';
      this.addMessage('You', query);

      const thinkingId = this.addMessage('Coach', '⏳ Thinking...', true);

      try {
        const data = await this.getFullUserData();
        const reply = await this.callAI(query, data);
        this.replaceMessage(thinkingId, 'Coach', reply);
      } catch (err) {
        let errorMsg = '❌ ' + err.message;
        if (err.message.includes('fetch') || err.message.includes('NetworkError')) {
          errorMsg = '❌ Cannot connect to AI server. Make sure you are online and the backend is deployed.';
        } else if (err.message.includes('404')) {
          errorMsg = '❌ AI service not available locally. Please deploy to Cloudflare Pages to use this feature.';
        }
        this.replaceMessage(thinkingId, 'Coach', errorMsg);
      }
    },

    addMessage(sender, text, isTemp = false) {
      const div = document.createElement('div');
      div.style.marginBottom = '0.6rem';
      div.innerHTML = `<strong>${sender}:</strong> ${text}`;
      if (isTemp) div.dataset.temp = 'true';
      this.messagesEl?.appendChild(div);
      this.messagesEl?.scrollTo(0, this.messagesEl.scrollHeight);
      return div;
    },

    replaceMessage(element, sender, text) {
      element.innerHTML = `<strong>${sender}:</strong> ${text}`;
      element.dataset.temp = 'false';
      this.messagesEl?.scrollTo(0, this.messagesEl.scrollHeight);
    },

    async getFullUserData() {
      const sb = getSupabase();
      const userId = App?.userId;
      if (!userId) {
        console.warn('AI: No userId found, using empty data');
        return {};
      }
      const tables = [
        'profiles', 'meals', 'meal_items', 'workouts', 'workout_exercises',
        'exercise_sets', 'vitals', 'water_logs', 'manual_watch_logs',
        'personal_records', 'friendships', 'workout_templates', 'favorite_foods'
      ];
      const data = {};
      for (const table of tables) {
        const { data: rows } = await sb.from(table).select('*').eq('user_id', userId);
        data[table] = rows || [];
      }
      return data;
    },

    async callAI(query, userData) {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userData }),
      });

      if (!response.ok) {
        let errorMsg = `Server error (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.error) errorMsg = errJson.error;
        } catch (e) {
          errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const json = await response.json();
      if (json.error) throw new Error(json.error);
      return json.reply;
    }
  };

  // Expose globally so app.js can still call it if needed
  window.AI = AI;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AI.init());
  } else {
    AI.init();
  }

  console.log('AI script loaded and auto-init scheduled');
})();