# Deploying Blood Donor Connector

The app is a single Flask process that serves both the API (`/api/*`) and the
static frontend, backed by SQLite by default. That makes it deployable to any
host that can run a Python web service - no separate frontend build, no
paid add-ons required.

It **auto-seeds its own demo dataset** the first time it boots against an
empty database (`AUTO_SEED_DEMO_DATA=true`, the default), so a brand-new
deploy is immediately usable with the documented demo logins - even on hosts
whose disk resets between deploys.

---

## Option A - Render (recommended, free)

Render reads the [`render.yaml`](render.yaml) blueprint already in this repo
and provisions everything for you.

### One click

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/SobhanaAishwarya/blood-donor-connector)

Click the button, sign in to (or create) a free Render account if asked, and
click **Apply**. That's the only manual step - Render reads `render.yaml`,
generates `SECRET_KEY` itself, builds, and deploys.

### Or manually

1. Go to **https://dashboard.render.com/blueprints** → **New Blueprint Instance**.
2. Connect your GitHub account if prompted, and pick this repository.
3. Render shows the one service defined in `render.yaml`
   (`blood-donor-connector`, free plan) → click **Apply**.
4. Wait for the build/deploy to finish (a couple of minutes), then open the
   `.onrender.com` URL Render gives you.

That's it - `SECRET_KEY` is generated automatically, and the demo data seeds
itself on first request. No dashboard configuration needed.

**Free-plan notes:**
- The service spins down after ~15 minutes of inactivity and takes a few
  seconds to wake up on the next request - normal for a free demo.
- The filesystem (and therefore the SQLite file) resets on redeploy/restart.
  That's fine: the app reseeds itself automatically. If you want data to
  persist permanently, either upgrade to a paid instance and uncomment the
  `disk:` block in `render.yaml`, or switch to a real database (see below).

---

## Option B - Railway

1. Push this repo to GitHub.
2. On https://railway.app → **New Project** → **Deploy from GitHub repo** →
   pick this repository.
3. Railway auto-detects Python. Set the **Start Command** to:
   ```
   gunicorn -w 1 --threads 4 --timeout 60 -b 0.0.0.0:$PORT run:app
   ```
4. Under **Variables**, add at minimum:
   - `SECRET_KEY` - any long random string
   - `FLASK_ENV` = `production`
   (everything else has a safe default - see `.env.example`)
5. Deploy. Railway assigns a public URL under **Settings → Networking**.

---

## Option C - Any other Python host (Fly.io, PythonAnywhere, a VPS, …)

The app just needs:

```bash
pip install -r requirements.txt
gunicorn -w 1 --threads 4 --timeout 60 -b 0.0.0.0:$PORT run:app
```

with these environment variables set (see `.env.example` for the full list):

| Variable | Required | Notes |
| --- | --- | --- |
| `SECRET_KEY` | **Yes** | Any long random string. Never reuse the dev default. |
| `FLASK_ENV` | recommended | Set to `production`. |
| `PORT` | usually set by the host | Defaults to `5000`. |
| `DATABASE_URL` | no | Defaults to a local SQLite file. |
| `AUTO_SEED_DEMO_DATA` | no | `true` by default; set `false` once you have real data. |

A single gunicorn worker is intentional - SQLite doesn't handle concurrent
writers from multiple processes well. For real production traffic, move to
Postgres (below) and you can safely add more workers.

---

## Upgrading to PostgreSQL (optional)

The models are plain SQLAlchemy with no SQLite-specific types, so migrating
is just:

```bash
pip install psycopg[binary]
```

```
DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname
```

Restart the app - `db.create_all()` builds the schema on Postgres the same
way it does on SQLite. Most managed Postgres add-ons (Render Postgres,
Railway Postgres, Neon, Supabase) give you this connection string directly.

---

## After deploying

- Open `/api/health` to confirm the API is up.
- Sign in with any demo account from the [README](README.md) (password
  `Passw0rd!`) to confirm the seed ran.
- If you want a clean slate with **your own** data instead of the demo set,
  set `AUTO_SEED_DEMO_DATA=false` before the database is ever created, or
  point `DATABASE_URL` at a fresh, empty database.
