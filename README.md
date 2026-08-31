# Apex Recomp & Health Tracker

Full-stack, mobile-responsive web app for body recomposition tracking:
daily macros, Huawei smartwatch sleep telemetry, meal logging (with serving-size
scaling), and weekly vitals.

**Stack:** Vanilla JS frontend (no build step) · Node.js/Express backend ·
Supabase (auth + database) · Huawei Health Kit REST API · USDA FoodData Central
+ Open Food Facts nutrition search.

---

## Quick Start

```bash
cd apex-recomp-tracker
npm install
cp .env.example .env
```

Then fill in `.env` (see below), run the schema, and start:

```
npm start
```

Open [http://localhost:3000](http://localhost:3000)

---

## Setup Steps

### 1. Supabase (required)

1. Create a free project at [https://supabase.com](https://supabase.com)
2. Project Settings → API → copy:

- Project URL → `SUPABASE_URL`
- anon public key → `SUPABASE_ANON_KEY`
3. Dashboard → SQL Editor → New query → paste everything in
`supabase/schema.sql` → Run

### 2. USDA FoodData Central (recommended)

1. Get a free key: [https://fdc.nal.usda.gov/api-key-signup.html](https://fdc.nal.usda.gov/api-key-signup.html)
2. Add it to `.env` as `USDA_API_KEY`

Without a USDA key, food search falls back to Open Food Facts only,
which is weaker for generic foods like eggs and cheese.

### 3. Huawei Health Kit (optional — demo mode works out of the box)

Leave `HUAWEI_DEMO_MODE=true` for realistic sample sleep data.
Live mode requires a Huawei developer account (see below).

---

## Environment Keys

| Key ↕▾ | Required ↕▾ | Purpose ↕▾ |
|---|---|---|
| −`SUPABASE_URL` | ✅ | Supabase project URL |
| −`SUPABASE_ANON_KEY` | ✅ | Supabase anon public key |
| `PORT` | optional | Server port (default 3000) |
| `HUAWEI_DEMO_MODE` | default `true` | `true` = sample sleep data; `false` = live |
| `HUAWEI_CLIENT_ID` | live only | Huawei app client ID |
| `HUAWEI_CLIENT_SECRET` | live only | Huawei app client secret |
| `HUAWEI_REDIRECT_URI` | live only | OAuth callback URL |
| `USDA_API_KEY` | recommended | USDA FoodData Central key |
⚙

**Never commit `.env` — it's already in `.gitignore`.**

---

## Connecting a Real Huawei Watch

⚠️ Huawei Health Kit OAuth is **Android-centric** — a pure web app
typically needs an Android app entry in the Huawei console as an OAuth bridge.

1. Create a Huawei developer account: [https://developer.huawei.com](https://developer.huawei.com)
2. Create a project and add an Android app (placeholder package name is fine
for initial testing).
3. Enable Health Kit and Account Kit.
4. Copy Client ID + Client Secret into `.env`, set `HUAWEI_DEMO_MODE=false`.
5. Configure the redirect URI to match `HUAWEI_REDIRECT_URI`.

### Data flow

```
Huawei watch → Huawei Health phone app → Huawei cloud
                ↑
Apex backend  ──┘  (pulls DT_CONTINUOUS_SLEEP + heart rate)
                ↓
Supabase / dashboard (same on desktop & phone — fully synced)
```

### Huawei API notes

- Timestamps are nanoseconds (`Date.now() * 1_000_000`).
- Sleep status codes: 1=Light, 2=REM, 3=Deep, 4=Awake, 5=Nap.
- Huawei returns instantaneous HR, not resting HR — derive resting HR from
the minimum overnight reading for live mode.

---

## Project Structure

```
apex-recomp-tracker/
├── .env                  # secrets (gitignored)
├── .env.example          # template (safe to commit)
├── .gitignore
├── package.json
├── README.md
├── server/
│   ├── index.js          # Express app + routes
│   ├── huawei.js         # Huawei Health Kit (demo + live)
│   └── nutrition.js      # USDA + OFF search proxy
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/styles.css
│   └── js/               # config, api, auth, dashboard, mealLog, vitals, huaweiCard, app
└── supabase/
    └── schema.sql        # Tables + RLS + trigger fix
```

## License

MIT — free to use, modify, and self-host.

