/* Friends manager — add by email, remove, view friends' PRs + progress */

const Friends = {
  bound: false,
  friends: [],
  pending: [],
  friendProfiles: {},

  bindUI() {
    if (this.bound) return;
    this.bound = true;

    document.getElementById('add-friend-btn')?.addEventListener('click', () => this.addFriend());
    document.getElementById('friend-select')?.addEventListener('change', (e) => this.showFriendData(e.target.value));
  },

  async load(userId) {
    const sb = getSupabase();
    if (!sb) return;

    const res = await sb.from('friendships')
      .select('*')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId);
    if (res.error) return console.error(res.error.message);

    const rows = res.data || [];
    this.friends = rows.filter(r => r.status === 'accepted');
    this.pending = rows.filter(r => r.status === 'pending' && r.addressee_id === userId);

    const friendIds = this.friends.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
    this.friendProfiles = {};
    if (friendIds.length) {
      const profRes = await sb.from('profiles').select('user_id, display_name, email, weight_lbs, body_fat_current').in('user_id', friendIds);
      (profRes.data || []).forEach(p => this.friendProfiles[p.user_id] = p);
    }

    this.render();
  },

  getFriendName(id) {
    const p = this.friendProfiles[id];
    if (p && p.display_name) return p.display_name;
    if (p && p.email) return p.email.split('@')[0];
    return 'Friend';
  },

  getFriendInitial(id) {
    const name = this.getFriendName(id);
    return name.charAt(0).toUpperCase();
  },

  async addFriend() {
    const input = document.getElementById('friend-email');
    const email = (input ? input.value : '').trim();
    if (!email) return alert('Enter an email.');

    const sb = getSupabase();
    const userId = (await sb.auth.getUser()).data.user.id;

    const found = await sb.rpc('find_user_by_email', { target_email: email });
    if (found.error) return alert('Could not look up user.');
    if (!found.data) return alert('User not found. They need to sign up first.');

    const targetId = found.data;
    if (targetId === userId) return alert("You can't friend yourself.");

    const insert = await sb.from('friendships').insert({
      requester_id: userId,
      addressee_id: targetId,
      status: 'pending'
    });
    if (insert.error) return alert(insert.error.message);

    if (input) input.value = '';
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

  async removeFriend(friendId) {
    if (!confirm('Remove this friend?')) return;
    const sb = getSupabase();
    const userId = App.userId;
    const { data: rel } = await sb.from('friendships')
      .select('id')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)
      .or('requester_id.eq.' + friendId + ',addressee_id.eq.' + friendId);
    for (const row of (rel || [])) {
      if ((row.requester_id === userId && row.addressee_id === friendId) ||
          (row.requester_id === friendId && row.addressee_id === userId)) {
        await sb.from('friendships').delete().eq('id', row.id);
      }
    }
    this.load(userId);
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
            <div class="friend-card">
              <div class="friend-avatar">${this.getFriendInitial(otherId)}</div>
              <div class="friend-info">
                <span class="friend-name">${escapeHtml(this.getFriendName(otherId))}</span>
                <span class="friend-email muted">${escapeHtml((this.friendProfiles[otherId]?.email) || '')}</span>
              </div>
              <button class="icon-btn remove-friend" data-fid="${otherId}" title="Remove friend">✕</button>
            </div>`;
        }).join('');
      }
    }

    const pendingEl = document.getElementById('friends-pending');
    if (pendingEl) {
      pendingEl.innerHTML = this.pending.length
        ? this.pending.map(p =>
            `<div class="friend-card">
              <div class="friend-avatar">${this.getFriendInitial(p.requester_id)}</div>
              <div class="friend-info"><span class="friend-name">${escapeHtml(this.getFriendName(p.requester_id))}</span></div>
              <div class="friend-actions">
                <button class="btn btn-ghost" data-accept="${p.id}">Accept</button>
                <button class="btn btn-ghost" data-reject="${p.id}">Decline</button>
              </div>
            </div>`
          ).join('')
        : '<p class="muted">No pending requests.</p>';
    }

    friendsEl?.querySelectorAll('.remove-friend').forEach(b =>
      b.addEventListener('click', () => this.removeFriend(b.dataset.fid))
    );
    pendingEl?.querySelectorAll('[data-accept]').forEach(b =>
      b.addEventListener('click', () => this.accept(b.dataset.accept))
    );
    pendingEl?.querySelectorAll('[data-reject]').forEach(b =>
      b.addEventListener('click', () => this.reject(b.dataset.reject))
    );

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
