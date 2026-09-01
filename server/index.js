require('dotenv').config();
const path = require('path');
const express = require('express');
const { getSleepSummary, getStatus } = require('./huawei');
const { searchFood } = require('./nutrition');
const { adminStatsHandler } = require('./admin');

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
    res.status(502).json({ connected: false, error: err.message });
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
    const hits = await searchFood(req.query.query || '');
    res.json({ hits });
  } catch (err) {
    res.status(502).json({ hits: [], error: err.message });
  }
});

app.post('/api/nutrition/search', async (req, res) => {
  try {
    const hits = await searchFood((req.body || {}).query || '');
    res.json({ hits });
  } catch (err) {
    res.status(502).json({ hits: [], error: err.message });
  }
});

app.get('/api/admin/stats', adminStatsHandler);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Apex Recomp & Health Tracker`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<your-computer-ip>:${PORT}\n`);
});
