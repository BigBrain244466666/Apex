/**
 * Static app config.
 * Supabase URL + anon key are PUBLIC by design — safe in the browser.
 * The USDA key is NOT here; it lives in Netlify env vars (server-side).
 *
 * These are YOUR Supabase values, pre-filled for convenience.
 * If they ever change, edit this file and redeploy.
 */

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

window.APP_CONFIG = {
  supabaseUrl: 'https://canvqtesqdzxhareiwka.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbnZxdGVzcWR6eGhhcmVpd2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODM3NzUsImV4cCI6MjEwMzc1OTc3NX0.6SEAgHqd6FTqrVJmM0F_y-qlGddNYN-twhYuFFlCpEU',
  huaweiDemo: true
};

async function loadAppConfig() {
  // Config is static in this version — nothing to fetch.
  // Kept as an async function so app.js doesn't need changes.
  return Promise.resolve();
}

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase config missing. Edit public/js/config.js.');
    return null;
  }
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}
