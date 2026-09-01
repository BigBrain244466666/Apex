require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('SUPABASE_URL:', url);
console.log('Service key starts with:', key ? key.slice(0, 20) + '...' : 'MISSING');
console.log('Service key length:', key ? key.length : 0);
console.log('Service key === anon key?', key === process.env.SUPABASE_ANON_KEY);
console.log('---');

async function test() {
  const res = await fetch(url + '/rest/v1/profiles?select=id', {
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key
    }
  });

  console.log('HTTP status:', res.status);
  const text = await res.text();
  console.log('Response body (first 300 chars):', text.slice(0, 300));

  try {
    const json = JSON.parse(text);
    console.log('Profile count from response:', Array.isArray(json) ? json.length : 'NOT ARRAY');
  } catch (e) {
    console.log('Not JSON:', e.message);
  }
}

test();