window.APP_CONFIG = {};

async function loadAppConfig() {
  try {
    const res = await fetch('/api/config');
    window.APP_CONFIG = await res.json();
  } catch (err) {
    console.error('Failed to load app config:', err);
  }
}

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase config missing. Check your .env file.');
    return null;
  }
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}
