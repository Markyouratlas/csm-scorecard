# CSM Scorecard

Weekly scorecard dashboard with real authentication and a database. Each CSM
signs in to log their week. Data saves automatically and persists across
sessions and devices. Managers see a consolidated view across the whole team.

---

## Setup — 3 stages, ~10 minutes total

### Stage 1 — Create your Supabase project (2 min)

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **"New Project"**. Pick any name, set a database password
   (write it down — you won't need it for the app, but you may later),
   choose a region close to you, click **"Create new project"**. Wait ~60s.
3. Once ready, go to the left sidebar → **SQL Editor** → click **"New query"**.
4. Open the file `supabase-setup.sql` from this folder, copy everything,
   paste it into the SQL editor, click **"Run"**. You should see "Success."
5. Go to **Settings → API**. Copy these two values somewhere safe:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public key** (a long string starting with `eyJ...`)

### Stage 2 — Push to GitHub (3 min)

1. Create a free [GitHub](https://github.com) account if needed.
2. Click the green **"New"** button → name the repo `csm-scorecard` →
   make it **Public** → check **"Add a README file"** → **"Create repository."**
3. On the repo page: **"Add file" → "Upload files."** Open the unzipped
   `csm-scorecard` folder, select **everything inside it** (not the folder
   itself), and drag onto the upload page.
4. Scroll down → **"Commit changes."**

### Stage 3 — Deploy on Vercel (5 min)

1. Go to [vercel.com](https://vercel.com) → **"Sign Up" → "Continue with GitHub."**
2. Click **"Add New... → Project."** Find your `csm-scorecard` repo, click **"Import."**
3. Before clicking Deploy, expand **"Environment Variables"** and add:
   - Name: `VITE_SUPABASE_URL` &nbsp;&nbsp; Value: *the Project URL from Stage 1*
   - Name: `VITE_SUPABASE_ANON_KEY` &nbsp;&nbsp; Value: *the anon public key from Stage 1*
4. Click **"Deploy."** Wait ~90s.

You'll get a live URL like `https://csm-scorecard-xyz.vercel.app`. Open it.

---

## First-time use

1. Open your live URL.
2. Click **"Sign up"** and create the **first account** with your manager email.
   The first person to sign up automatically becomes the manager.
3. Have your CSMs sign up next. They'll appear automatically on your roster.
4. Each person logs their week from their own account. Data saves
   automatically as they type.

---

## Run locally (optional, for development)

```
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

---

## What's where

- `supabase-setup.sql` — Database schema (run once in Supabase)
- `src/App.jsx` — Auth + routing
- `src/AuthScreen.jsx` — Sign in / sign up screen
- `src/CsmView.jsx` — Personal weekly scorecard (per-CSM view)
- `src/ManagerView.jsx` — Consolidated dashboard + roster management
- `src/supabase.js` — Database client
