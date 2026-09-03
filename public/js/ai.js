// public/js/ai.js – resize handle at TOP-LEFT
const AI = {
  chatOpen: false,
  messagesEl: null,
  inputEl: null,
  sendBtn: null,
  resizeData: null,

  init() {
    this.messagesEl = document.getElementById('ai-messages');
    this.inputEl = document.getElementById('ai-input');
    this.sendBtn = document.getElementById('ai-send');
    const toggle = document.getElementById('ai-chat-toggle');
    const panel = document.getElementById('ai-chat-panel');
    const close = document.getElementById('ai-chat-close');

    if (!toggle || !panel) return;

    // Position panel at bottom-right
    panel.style.position = 'fixed';
    panel.style.right = '1.5rem';
    panel.style.bottom = '5rem';
    panel.style.width = '380px';
    panel.style.maxWidth = '90vw';
    panel.style.maxHeight = '80vh';
    panel.style.minWidth = '280px';
    panel.style.minHeight = '200px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.overflow = 'hidden';
    panel.style.resize = 'none';

    // Create resize handle at TOP-LEFT
    let handle = document.getElementById('ai-resize-handle');
    if (!handle) {
      handle = document.createElement('div');
      handle.id = 'ai-resize-handle';
      handle.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 20px;
        height: 20px;
        cursor: nwse-resize;
        z-index: 10;
        background: transparent;
      `;
      // Visual indicator (small corner triangle at top-left)
      const indicator = document.createElement('div');
      indicator.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        border-top: 12px solid var(--border);
        border-left: 12px solid var(--border);
        border-right: 12px solid transparent;
        border-bottom: 12px solid transparent;
        pointer-events: none;
      `;
      handle.appendChild(indicator);
      panel.appendChild(handle);
    }

    // Resize logic – dragging from top-left
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = panel.offsetWidth;
      const startHeight = panel.offsetHeight;
      const startRight = panel.offsetRight || parseInt(panel.style.right) || 24;
      const startBottom = panel.offsetBottom || parseInt(panel.style.bottom) || 80;

      const onMouseMove = (ev) => {
        // Moving left = increase width, moving up = increase height
        const dx = startX - ev.clientX;
        const dy = startY - ev.clientY;
        let newWidth = Math.max(280, startWidth + dx);
        let newHeight = Math.max(200, startHeight + dy);
        // Clamp to max
        const maxW = window.innerWidth * 0.9;
        const maxH = window.innerHeight * 0.8;
        newWidth = Math.min(newWidth, maxW);
        newHeight = Math.min(newHeight, maxH);
        panel.style.width = newWidth + 'px';
        panel.style.height = newHeight + 'px';
        // Adjust messages area
        this.messagesEl.style.maxHeight = 'calc(100% - 110px)';
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    toggle.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      this.chatOpen = !panel.classList.contains('hidden');
      if (this.chatOpen) this.inputEl?.focus();
    });

    close?.addEventListener('click', () => {
      panel.classList.add('hidden');
      this.chatOpen = false;
    });

    this.sendBtn?.addEventListener('click', () => this.sendQuestion());
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendQuestion();
    });
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
      this.replaceMessage(thinkingId, 'Coach', this.formatMarkdown(reply));
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
    div.style.overflowWrap = 'break-word';
    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    if (isTemp) div.dataset.temp = 'true';
    this.messagesEl?.appendChild(div);
    this.scrollToBottom();
    return div;
  },

  replaceMessage(element, sender, text) {
    element.innerHTML = `<strong>${sender}:</strong> ${text}`;
    element.dataset.temp = 'false';
    this.scrollToBottom();
  },

  scrollToBottom() {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  },

  formatMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
      return `<pre style="background:var(--surface-2); padding:0.5rem; border-radius:6px; overflow-x:auto;"><code>${code.trim()}</code></pre>`;
    });
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--surface-2); padding:0.1rem 0.3rem; border-radius:4px;">$1</code>');
    html = html.replace(/^[\-\*] (.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\s*)+/g, (match) => {
      return `<ul style="margin:0.5rem 0; padding-left:1.5rem;">${match}</ul>`;
    });
    html = html.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\s*)+/g, (match) => {
      return `<ol style="margin:0.5rem 0; padding-left:1.5rem;">${match}</ol>`;
    });
    html = html.replace(/\n/g, '<br>');
    return html;
  },

  async getFullUserData() {
    const sb = getSupabase();
    const userId = App.userId;
    const tables = [
      'profiles', 'meals', 'meal_items', 'workouts', 'workout_exercises',
      'exercise_sets', 'vitals', 'water_logs', 'manual_watch_logs',
      'personal_records', 'friendships', 'workout_templates', 'favorite_foods'
    ];
    const data = {};
    for (const table of tables) {
      try {
        if (table === 'friendships') {
          const { data: rows } = await sb.from(table).select('*').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
          data[table] = rows || [];
        } else {
          const { data: rows } = await sb.from(table).select('*').eq('user_id', userId);
          data[table] = rows || [];
        }
      } catch (e) {
        data[table] = [];
      }
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

// Auto‑init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof AI !== 'undefined' && AI.init) AI.init();
  });
} else {
  if (typeof AI !== 'undefined' && AI.init) AI.init();
}