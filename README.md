# Boardroom

A tiny, AI-driven project board for a small team. You type what happened in
plain English ("new task: redesign the pricing page, assign to Sara, due
Friday", "mark the pricing page task done") and it updates the board. It
emails and push-notifies people when their deadlines are close or overdue.

**Stack:** React frontend on GitHub Pages · Supabase for the database, auth,
and backend logic · Claude for understanding your commands · Resend for
email · Web Push for phone/desktop notifications. Everything is on a free
tier for a team this size.

Budget **30–45 minutes** for first-time setup — it's mostly copy-pasting keys
into a few places, not writing code.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), create a free account and a
   new project (pick any name/region).
2. In the project dashboard, go to **SQL Editor**, paste the contents of
   `supabase/migrations/0001_init.sql`, and run it. This creates all the
   tables.
3. Go to **Project Settings → API**. Note down:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (keep this one secret — never put it in the
     frontend)
4. Go to **Authentication → Providers** and make sure **Email** is enabled
   (it is by default). Under **Authentication → URL Configuration**, add the
   URL you'll deploy to later (e.g. `https://yourname.github.io/boardroom/`)
   as a redirect URL — you can come back and do this after step 4 below.

## 2. Get a Claude API key

1. Go to [console.anthropic.com](https://console.anthropic.com), create an
   account, and generate an API key. Add a small amount of credit — this app
   uses very little (each command is a few cents at most, and for a 5-person
   team you'd need hundreds of commands to spend a dollar).

## 3. Get a Resend API key (for email)

1. Go to [resend.com](https://resend.com), create a free account.
2. Create an API key. The free tier (100 emails/day) is fine for a small
   team.
3. The functions default to sending from `onboarding@resend.dev`, which
   works immediately with no setup, but emails may land in spam. When you're
   ready, verify your own domain in Resend and change the `from` address in
   `supabase/functions/send-deadline-reminders/index.ts`.

## 4. Generate VAPID keys (for push notifications)

Push notifications need a keypair so browsers trust who's sending them.

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key. Save both.

## 5. Install the Supabase CLI and deploy the backend functions

```bash
npm install -g supabase
supabase login
cd pm-tool
supabase link --project-ref YOUR-PROJECT-REF   # find this in your project URL

# Set secrets (paste your real values)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:you@yourteam.com
supabase secrets set APP_URL=https://yourname.github.io/boardroom/

# Deploy both functions
supabase functions deploy ai-command
supabase functions deploy send-deadline-reminders --no-verify-jwt
```

### Schedule the deadline-reminder function to run hourly

In the Supabase Dashboard, go to **Edge Functions → send-deadline-reminders →
Schedules** (or **Database → Cron Jobs** depending on your dashboard
version) and add a schedule to call it every hour, e.g. cron expression
`0 * * * *`. If your dashboard doesn't have a built-in scheduler UI yet, run
this SQL instead (Database → SQL Editor):

```sql
select cron.schedule(
  'deadline-reminders-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-deadline-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```
(This needs the `pg_cron` and `pg_net` extensions, enabled by default on
most Supabase projects — turn them on under **Database → Extensions** if the
command errors.)

## 6. Configure the frontend

```bash
cd frontend
cp .env.example .env
```

Edit `.env` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_VAPID_PUBLIC_KEY` from steps 1 and 4.

Also open `vite.config.js` and set `base` to match your GitHub repo name,
e.g. `base: "/boardroom/"`.

Try it locally first:

```bash
npm install
npm run dev
```

Open the printed localhost URL, sign in with your email (you'll get a magic
link), and you should see an empty board.

## 7. Push to GitHub and deploy

1. Create a new repo on GitHub (e.g. `boardroom`) and push this whole folder
   to it.
2. In the repo, go to **Settings → Pages** and set **Source** to "GitHub
   Actions."
3. Go to **Settings → Secrets and variables → Actions** and add three
   repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_VAPID_PUBLIC_KEY` (same values as your `.env`).
4. Push to `main` — the included workflow (`.github/workflows/deploy.yml`)
   will build and publish automatically. Your site will appear at
   `https://yourname.github.io/boardroom/`.
5. Go back to Supabase → **Authentication → URL Configuration** and make
   sure that exact URL is in the allowed redirect list, or magic-link
   sign-in will fail.

## 8. Invite your team

Just send them the GitHub Pages URL. The first time each person signs in
with their email, a magic link is emailed to them (no passwords, no
separate accounts to create) and they're automatically added as a team
member.

For push notifications to work best on **iPhone**, each person should open
the site in Safari and use **Share → Add to Home Screen** once, then open it
from the home screen icon and tap "Enable push alerts." This is an Apple
requirement, not something in our control. On Android/desktop Chrome, the
"Enable push alerts" button works directly in the browser.

---

## How the AI command bar works

Typing a sentence sends it to the `ai-command` Edge Function along with the
current team members and open tasks. Claude decides which single action you
meant (create a task, move it, reassign it, change its deadline/priority, or
delete it) and returns structured JSON, which the function then applies to
the database directly. If it isn't confident what you meant, it tells you
instead of guessing.

You can also just click the quick-move buttons on any card — the AI bar is
for anything that's easier to say than to click through.

## What's deliberately left simple

- **One shared board** — no multiple projects/workspaces. For a 2–5 person
  team this keeps everything visible at a glance; say the word if you later
  want separate boards per project.
- **Three statuses** (To do / In progress / Done) rather than a fully
  customizable pipeline.
- **Everyone can edit everything** — there's no per-person permission
  system, since this is built for a small trusted team.

## Extending it later

- Add more columns/statuses: edit the `status` check constraint in the SQL
  migration and `STATUS_LABELS` in `TaskCard.jsx`.
- Add file attachments: Supabase Storage plugs in easily.
- Slack instead of/alongside email: swap the `sendEmail` call in
  `send-deadline-reminders` for a Slack webhook POST.
