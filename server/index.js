/**
 * Apex Recomp & Health Tracker — Express server.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const { getSleepSummary, getStatus } = require('./huawei');
const { searchFood } = require('./nutrition');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    huaweiDemo: process.env.HUAWEI_DEMO_MODE !== 'false'
  });
});

app.get('/api/huawei/sleep', async (req, res) => {
  try {
    const summary = await getSleepSummary();
    res.json(summary);
  } catch (err) {
    console.error('Huawei sleep fetch failed:', err.message);
    res.status(502).json({ connected: false, error: 'Huawei API error', note: err.message });
  }
});

app.get('/api/huawei/status', async (req, res) => {
  try {
    res.json(await getStatus());
  } catch (err) {
    res.json({ connected: false, mode: 'live', label: 'Error' });
  }
});

app.get('/api/nutrition/search', async (req, res) => {
  try {
    const query = req.query.query || '';
    const hits = await searchFood(query);
    res.json({ hits });
  } catch (err) {
    console.error('[Nutrition] search error:', err.message);
    res.status(502).json({ hits: [], error: err.message });
  }
});

app.post('/api/nutrition/search', async (req, res) => {
  try {
    const query = (req.body || {}).query || '';
    const hits = await searchFood(query);
    res.json({ hits });
  } catch (err) {
    console.error('[Nutrition] search error:', err.message);
    res.status(502).json({ hits: [], error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Apex Recomp & Health Tracker`);
  console.log(`  → http://localhost:${PORT}\n`);
});
