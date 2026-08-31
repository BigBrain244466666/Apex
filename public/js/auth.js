/**
 * Authentication: sign up, sign in, sign out, session restore.
 * Supabase persists tokens in localStorage automatically.
 */
const Auth = {
  async getSession() {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) console.error(error.message);
    return data?.session || null;
  },

  async signIn(email, password) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signUp(email, password) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signOut() {
    const sb = getSupabase();
    await sb.auth.signOut();
  },

  onAuthChange(callback) {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.onAuthStateChange((_event, session) => callback(session));
  }
};
