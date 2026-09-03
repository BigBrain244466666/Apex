// public/js/ai.js – with message separators
const AI = {
  chatOpen: false,
  messagesEl: null,
  inputEl: null,
  sendBtn: null,

  init() {
    this.messagesEl = document.getElementById('ai-messages');
    this.inputEl = document.getElementById('ai-input');
    this.sendBtn = document.getElementById('ai-send');
    const toggle = document.getElementById('ai-chat-toggle');
    const panel = document.getElementById('ai-chat-panel');
    const close = document.getElementById('ai-chat-close');

    if (!toggle || !panel) return;

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

    // Top-left resize handle
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

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = panel.offsetWidth;
      const startHeight = panel.offsetHeight;

      const onMouseMove = (ev) => {
        const dx = startX - ev.clientX;
        const dy = startY - ev.clientY;
        let newWidth = Math.max(280, startWidth + dx);
        let newHeight = Math.max(200, startHeight + dy);
        const maxW = window.innerWidth * 0.9;
        const maxH = window.innerHeight * 0.8;
        newWidth = Math.min(newWidth, maxW);
        newHeight = Math.min(newHeight, maxH);
        panel.style.width = newWidth + 'px';
        panel.style.height = newHeight + 'px';
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

    // Add separator before the new exchange (except for the first message)
    if (this.messagesEl && this.messagesEl.children.length > 1) {
      const separator = document.createElement('hr');
      separator.style.cssText = `
        border: none;
        border-top: 1px solid var(--border);
        margin: 0.8rem 0;
        opacity: 0.4;
      `;
      this.messagesEl.appendChild(separator);
    }

    // Add user message and scroll to it
    const userMsg = this.addMessage('You', query, false, 'user');
    this.scrollToElement(userMsg);

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

  addMessage(sender, text, isTemp = false, type = '') {
    const div = document.createElement('div');
    div.style.marginBottom = '0.6rem';
    div.style.overflowWrap = 'break-word';
    div.style.lineHeight = '1.5';

    // Style user messages differently
    if (type === 'user') {
      div.style.background = 'var(--surface-2)';
      div.style.padding = '0.4rem 0.8rem';
      div.style.borderRadius = '8px';
      div.style.border = '1px solid var(--border)';
      div.style.alignSelf = 'flex-end';
      div.style.maxWidth = '85%';
    } else {
      div.style.padding = '0.2rem 0';
    }

    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    if (isTemp) div.dataset.temp = 'true';

    // Set flex container to align messages properly
    if (!this.messagesEl) return div;
    this.messagesEl.appendChild(div);
    return div;
  },

  replaceMessage(element, sender, text) {
    element.innerHTML = `<strong>${sender}:</strong> ${text}`;
    element.dataset.temp = 'false';
    // Remove any special styling for coach messages
    element.style.background = 'transparent';
    element.style.padding = '0.2rem 0';
    element.style.border = 'none';
    element.style.alignSelf = 'auto';
    element.style.maxWidth = '100%';
    this.scrollToElement(element);
  },

  scrollToElement(element) {
    if (element && this.messagesEl) {
      const top = element.offsetTop - this.messagesEl.offsetTop - 20;
      this.messagesEl.scrollTop = top;
    }
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

    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3 style="margin:0.5rem 0 0.3rem; font-size:1.05rem;">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 style="margin:0.6rem 0 0.4rem; font-size:1.2rem;">$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1 style="margin:0.7rem 0 0.4rem; font-size:1.35rem;">$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
      const lines = code.trim().split('\n');
      const lang = lines.length > 1 && lines[0].match(/^[a-zA-Z]+$/)?.[0] || '';
      const body = lang ? lines.slice(1).join('\n') : code.trim();
      return `<pre style="background:var(--surface-2); padding:0.6rem; border-radius:6px; overflow-x:auto; margin:0.4rem 0; border-left:3px solid var(--accent);"><code style="font-family:monospace; font-size:0.85rem; white-space:pre-wrap;">${body}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--surface-2); padding:0.1rem 0.3rem; border-radius:4px; font-family:monospace;">$1</code>');

    // Unordered lists
    html = html.replace(/^[\-\*] (.*)$/gm, '<li style="margin:0.2rem 0;">$1</li>');
    html = html.replace(/(<li.*<\/li>\s*)+/g, (match) => {
      return `<ul style="margin:0.4rem 0; padding-left:1.5rem; list-style-type:disc;">${match}</ul>`;
    });

    // Ordered lists
    html = html.replace(/^\d+\. (.*)$/gm, '<li style="margin:0.2rem 0;">$1</li>');
    html = html.replace(/(<li.*<\/li>\s*)+/g, (match) => {
      return `<ol style="margin:0.4rem 0; padding-left:1.5rem; list-style-type:decimal;">${match}</ol>`;
    });

    // Tables
    html = html.replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      const isHeader = cells.some(c => c.includes('---'));
      if (isHeader) return '';
      const row = cells.map(c => `<td style="padding:0.3rem 0.6rem; border:1px solid var(--border);">${c.trim()}</td>`).join('');
      return `<tr>${row}</tr>`;
    });
    html = html.replace(/(<tr>.*<\/tr>\s*)+/g, (match) => {
      return `<table style="width:100%; border-collapse:collapse; margin:0.5rem 0; font-size:0.9rem;">${match}</table>`;
    });

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr style="border:1px solid var(--border); margin:0.6rem 0;" />');

    // Blockquotes
    html = html.replace(/^&gt; (.*$)/gm, '<blockquote style="border-left:3px solid var(--accent); padding:0.3rem 0 0.3rem 0.8rem; margin:0.4rem 0; background:var(--surface-2); border-radius:0 4px 4px 0;">$1</blockquote>');

    // Paragraph handling
    html = html.replace(/\n{2,}/g, '</p><p style="margin:0.4rem 0;">');
    html = html.replace(/\n/g, '<br>');

    if (!html.startsWith('<')) {
      html = `<p style="margin:0.4rem 0;">${html}</p>`;
    }

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