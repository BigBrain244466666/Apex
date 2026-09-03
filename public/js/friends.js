/* Friends – fixed queries, dropdown below input, scroll fix */

const Friends = {
  bound: false,
  friends: [],
  receivedRequests: [],
  sentRequests: [],
  friendProfiles: {},
  allUsers: [],

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    document.getElementById('add-friend-btn')?.addEventListener('click', () => this.addFriend());
    document.getElementById('friend-select')?.addEventListener('change', (e) => this.showFriendData(e.target.value));

    const emailInput = document.getElementById('friend-email');
    if (emailInput) {
      emailInput.addEventListener('input', async () => {
        const query = emailInput.value.trim();
        if (query.length < 2) {
          this.hideAutocomplete();
          return;
        }
        await this.searchUsers(query);
      });
      emailInput.addEventListener('blur', () => {
        setTimeout(() => this.hideAutocomplete(), 400);
      });
    }

    this.ensureSentSection();
  },

  ensureSentSection() {
    const pendingContainer = document.getElementById('friends-pending')?.parentNode;
    if (!pendingContainer) return;
    if (!document.getElementById('friends-sent')) {
      const sentSection = document.createElement('div');
      sentSection.id = 'friends-sent-section';
      sentSection.innerHTML = `<h3>Sent Requests</h3><div id="friends-sent"></div>`;
      pendingContainer.appendChild(sentSection);
    }
  },

  async searchUsers(query) {
    const sb = getSupabase();
    let { data, error } = await sb
      .from('profiles')
      .select('user_id, email, display_name')
      .ilike('email', `%${query}%`)
      .limit(5);

    if (error || !data || data.length === 0) {
      const { data: rpcData, error: rpcError } = await sb.rpc('search_users_by_email', { search_term: `%${query}%` });
      if (!rpcError && rpcData) data = rpcData;
    }

    this.allUsers = data || [];
    this.showAutocomplete(this.allUsers);
  },

  showAutocomplete(users) {
    let container = document.getElementById('email-autocomplete');
    if (!container) {
      const input = document.getElementById('friend-email');
      if (!input) return;
      container = document.createElement('div');
      container.id = 'email-autocomplete';
      container.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: var(--shadow);
        z-index: 99999;
        width: 100%;
        max-height: 200px;
        overflow-y: auto;
      `;
      input.parentNode.style.position = 'relative';
      input.parentNode.appendChild(container);
    }

    if (!users.length) {
      container.innerHTML = '<div class="muted" style="padding:0.5rem;">No users found</div>';
      container.style.display = 'block';
      return;
    }

    container.innerHTML = users.map(u => {
      const label = u.display_name ? `${u.display_name} (${u.email})` : u.email;
      return `<div class="autocomplete-item" data-email="${u.email}" style="padding:0.5rem; cursor:pointer; border-bottom:1px solid var(--border);">${label}</div>`;
    }).join('');
    container.style.display = 'block';

    container.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.getElementById('friend-email').value = item.dataset.email;
        this.hideAutocomplete();
      });
    });
  },

  hideAutocomplete() {
    const container = document.getElementById('email-autocomplete');
    if (container) container.style.display = 'none';
  },

  async load(userId) {
    const sb = getSupabase();
    if (!sb) return;

    // Fix: single .or() with all conditions
    const res = await sb.from('friendships')
      .select('*')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (res.error) return console.error('[Friends] Load error:', res.error);

    const rows = res.data || [];
    this.friends = rows.filter(r => r.status === 'accepted');
    this.receivedRequests = rows.filter(r => r.status === 'pending' && r.addressee_id === userId);
    this.sentRequests = rows.filter(r => r.status === 'pending' && r.requester_id === userId);

    const friendIds = this.friends.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
    this.friendProfiles = {};
    if (friendIds.length) {
      const profRes = await sb.from('profiles').select('user_id, display_name, email, weight_lbs, body_fat_current').in('user_id', friendIds);
      (profRes.data || []).forEach(p => this.friendProfiles[p.user_id] = p);
    }

    this.render();
    this.attachEvents();
  },

  getFriendName(id) {
    const p = this.friendProfiles[id];
    if (p && p.display_name) return p.display_name;
    if (p && p.email) return p.email.split('@')[0];
    return 'Friend';
  },

  getFriendInitial(id) {
    return this.getFriendName(id).charAt(0).toUpperCase();
  },

  async addFriend() {
    const input = document.getElementById('friend-email');
    const email = (input ? input.value : '').trim();
    if (!email) return alert('Please enter an email address.');

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const found = await sb.rpc('find_user_by_email', { target_email: email });
    if (found.error) return alert('Error: ' + found.error.message);
    if (!found.data) return alert('User not found. They need to sign up first.');

    const targetId = found.data;
    if (targetId === userId) return alert("You can't friend yourself.");

    const existing = await sb.from('friendships')
      .select('status')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId},requester_id.eq.${targetId},addressee_id.eq.${targetId}`);
    if (existing.data && existing.data.length) {
      const status = existing.data[0].status;
      if (status === 'accepted') return alert('Already friends.');
      if (status === 'pending') return alert('Friend request already pending.');
    }

    const insert = await sb.from('friendships').insert({
      requester_id: userId,
      addressee_id: targetId,
      status: 'pending'
    });
    if (insert.error) return alert('Failed: ' + insert.error.message);

    if (input) input.value = '';
    this.hideAutocomplete();
    this.load(userId);
  },

  async accept(id) {
    const sb = getSupabase();
    await sb.from('friendships').update({ status: 'accepted' }).eq('id', id);
    this.load(App.userId);
  },

  async reject(id) {
    const sb = getSupabase();
    await sb.from('friendships').delete().eq('id', id);
    this.load(App.userId);
  },

  async cancelRequest(id) {
    if (!confirm('Cancel this friend request?')) return;
    const sb = getSupabase();
    const { error } = await sb.from('friendships').delete().eq('id', id);
    if (error) return alert('Failed: ' + error.message);
    this.load(App.userId);
  },

  async removeFriend(friendId) {
    if (!confirm('Remove this friend?')) return;
    const sb = getSupabase();
    const userId = App.userId;

    // Use RPC that bypasses RLS
    const { data, error } = await sb.rpc('delete_friendship', {
      user1: userId,
      user2: friendId
    });
    if (error) return alert('Failed: ' + error.message);
    if (!data) return alert('Friendship not found or already removed.');
    await this.load(userId);
  },

  render() {
    const friendsEl = document.getElementById('friends-list');
    if (friendsEl) {
      if (!this.friends.length) {
        friendsEl.innerHTML = '<p class="muted">No friends yet. Add one above!</p>';
      } else {
        friendsEl.innerHTML = this.friends.map(f => {
          const otherId = f.requester_id === App.userId ? f.addressee_id : f.requester_id;
          return `
            <div class="friend-card" data-friend-id="${otherId}">
              <div class="friend-avatar">${this.getFriendInitial(otherId)}</div>
              <div class="friend-info">
                <span class="friend-name">${escapeHtml(this.getFriendName(otherId))}</span>
                <span class="friend-email muted">${escapeHtml(this.friendProfiles[otherId]?.email || '')}</span>
              </div>
              <button class="icon-btn remove-friend" data-fid="${otherId}" title="Remove friend">✕</button>
            </div>`;
        }).join('');
      }
    }

    const receivedEl = document.getElementById('friends-pending');
    if (receivedEl) {
      if (!this.receivedRequests.length) {
        receivedEl.innerHTML = '<p class="muted">No incoming requests.</p>';
      } else {
        receivedEl.innerHTML = this.receivedRequests.map(p => `
          <div class="friend-card">
            <div class="friend-avatar">${this.getFriendInitial(p.requester_id)}</div>
            <div class="friend-info"><span class="friend-name">${escapeHtml(this.getFriendName(p.requester_id))}</span></div>
            <div class="friend-actions">
              <button class="btn btn-ghost accept-request" data-id="${p.id}">Accept</button>
              <button class="btn btn-ghost reject-request" data-id="${p.id}">Decline</button>
            </div>
          </div>
        `).join('');
      }
    }

    const sentContainer = document.getElementById('friends-sent');
    if (sentContainer) {
      if (!this.sentRequests.length) {
        sentContainer.innerHTML = '<p class="muted">No pending outgoing requests.</p>';
      } else {
        sentContainer.innerHTML = this.sentRequests.map(p => `
          <div class="friend-card">
            <div class="friend-avatar">${this.getFriendInitial(p.addressee_id)}</div>
            <div class="friend-info"><span class="friend-name">${escapeHtml(this.getFriendName(p.addressee_id))}</span></div>
            <div class="friend-actions">
              <span class="muted" style="font-size:0.8rem;">Pending</span>
              <button class="icon-btn cancel-request" data-id="${p.id}" title="Cancel request">✕</button>
            </div>
          </div>
        `).join('');
      }
    }

    const select = document.getElementById('friend-select');
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">Select friend…</option>' +
        this.friends.map(f => {
          const otherId = f.requester_id === App.userId ? f.addressee_id : f.requester_id;
          return `<option value="${otherId}">${escapeHtml(this.getFriendName(otherId))}</option>`;
        }).join('');
      if (current) select.value = current;
    }
  },

  attachEvents() {
    document.querySelectorAll('.remove-friend').forEach(btn => {
      btn.removeEventListener('click', this._removeHandler);
      this._removeHandler = () => {
        this.removeFriend(btn.dataset.fid);
      };
      btn.addEventListener('click', this._removeHandler);
    });
    document.querySelectorAll('.accept-request').forEach(btn => {
      btn.removeEventListener('click', this._acceptHandler);
      this._acceptHandler = () => this.accept(btn.dataset.id);
      btn.addEventListener('click', this._acceptHandler);
    });
    document.querySelectorAll('.reject-request').forEach(btn => {
      btn.removeEventListener('click', this._rejectHandler);
      this._rejectHandler = () => this.reject(btn.dataset.id);
      btn.addEventListener('click', this._rejectHandler);
    });
    document.querySelectorAll('.cancel-request').forEach(btn => {
      btn.removeEventListener('click', this._cancelHandler);
      this._cancelHandler = () => this.cancelRequest(btn.dataset.id);
      btn.addEventListener('click', this._cancelHandler);
    });
  },

  async showFriendData(friendId) {
    const container = document.getElementById('friend-data');
    if (!container || !friendId) {
      if (container) container.innerHTML = '<p class="muted">Select a friend to view their progress.</p>';
      return;
    }

    const sb = getSupabase();
    const name = this.getFriendName(friendId);
    const prRes = await sb.from('personal_records').select('*').eq('user_id', friendId).order('weight', { ascending: false });
    const vitRes = await sb.from('vitals').select('*').eq('user_id', friendId).order('log_date', { ascending: false }).limit(1);

    const latestVitals = (vitRes.data || [])[0];
    const currentWeight = latestVitals?.morning_weight ?? '—';
    const bodyFat = latestVitals?.estimated_body_fat ?? '—';
    const prs = prRes.data || [];

    container.innerHTML = `
      <div class="friend-header">
        <div class="friend-avatar large">${this.getFriendInitial(friendId)}</div>
        <h3>${escapeHtml(name)}</h3>
      </div>
      <div class="friend-stats-row">
        <div class="friend-stat"><span>Current Weight</span><b>${currentWeight} lbs</b></div>
        <div class="friend-stat"><span>Body Fat</span><b>${bodyFat}%</b></div>
      </div>
      <h4>Personal Records</h4>
      ${prs.length
        ? prs.map(p => `<div class="pr-row"><span class="pr-exercise">${escapeHtml(p.exercise_name)}</span><span class="pr-value">${p.weight} lb × ${p.reps}</span><span class="pr-date muted">${p.achieved_at}</span></div>`).join('')
        : '<p class="muted">No PRs yet.</p>'}
    `;
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}