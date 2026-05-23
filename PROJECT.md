# mlcrm.online — Project Handoff Document

> **Purpose of this file:** This is the canonical project description for mlcrm.online. Any AI assistant or developer should be able to read this file and continue the project without re-asking architecture questions. Update it as the project evolves.

**Last updated:** May 2026 — end of Step 2

---

## 1. What this product is

**mlcrm.online** is a personal lead-intelligence tool that turns Clay's LinkedIn job-search exports into a deduplicated, persistent database of companies hiring for roles that signal they need martech/CRM/CDP consultancy services.

**The user:** sells SaaS and marketing-automation consulting services. The buying signal is *"this company is hiring someone to work with Bloomreach / Klaviyo / Segment / CRM / lifecycle / retention / loyalty / etc."* — meaning they have the problem the user solves.

**Single user.** This is a personal tool, not a multi-tenant SaaS. Auth restricted to one email via magic link + whitelist.

---

## 2. Core workflow

1. User runs a search in **Clay** (e.g., "Bloomreach" jobs on LinkedIn)
2. Clay exports a CSV of matched jobs with columns: `(title, company, location, domain, linkedin_url)`
3. User uploads the CSV to mlcrm.online
4. The app:
   - Deduplicates companies across imports (by domain)
   - Deduplicates jobs (by LinkedIn URL)
   - Tags each job with matched keywords
   - Tracks how often a company shows up over time (signal strength)
5. User browses **Companies** and **Jobs** dashboards to find leads
6. (Future) Telegram digest notifies of new matches

**Key insight:** Clay does the LinkedIn scraping (which is the hardest, most fragile part). mlcrm is the **persistence + intelligence layer on top of Clay's output**. We do NOT scrape LinkedIn ourselves.

---

## 3. What this is NOT

- Not scraping LinkedIn (Clay does that)
- Not scraping ATS boards (Greenhouse/Lever/Ashby — earlier plan, dropped because Clay covers it)
- Not doing outreach yet (later phase)
- Not multi-tenant
- Not handling people/contact enrichment yet

---

## 4. Tech stack (locked in)

| Layer | Tool |
|---|---|
| Domain | `mlcrm.online` (registered at Namecheap) |
| Frontend | Next.js 15+ App Router, TypeScript, Tailwind CSS |
| Hosting | Vercel (auto-deploy from GitHub `main` branch) |
| Database | Supabase Postgres (EU region) |
| Auth | Supabase Auth — magic link, single-email whitelist |
| Storage | Supabase Storage (bucket: `csv-uploads`) |
| Editor | Cursor (local development) |
| Repo | GitHub: `pashamaster/mlcrm.online` |
| Future automation | n8n (self-hosted, Railway) — not in MVP |
| Future notifications | Telegram bot — not in MVP |

---

## 5. Authentication

- Magic link only (no passwords)
- Whitelist enforced server-side: only `ALLOWED_EMAIL` (env var) can log in
- Even if someone discovers the URL and requests a magic link, `app/auth/callback/route.ts` rejects non-whitelisted emails
- Supabase Site URL: `https://mlcrm.online`
- Redirect URLs: `https://mlcrm.online/auth/callback`, `http://localhost:3000/auth/callback`

---

## 6. Database schema

Live in Supabase. Schema is in plain SQL — re-runnable. Key tables:

### `csv_imports`
Audit trail of every CSV uploaded.
- `id`, `filename`, `source_label` (e.g., "Clay - Bloomreach search"), `storage_path`
- `status` (uploaded/processing/completed/failed)
- Counts: `rows_total`, `rows_new_jobs`, `rows_duplicate`, `rows_failed`, `new_companies`
- `uploaded_by` (FK to auth.users), `uploaded_at`, `processed_at`, `error_message`

### `companies`
Deduplicated by domain across all imports.
- `id`, `name`, `name_normalized` (lowercase, generated column), `domain` (unique, nullable)
- `country`, `linkedin_url`, `is_recruiter`, `is_archived`, `notes`
- `first_seen_at`, `last_seen_at`, `signal_count` (denormalized count of jobs)
- `created_at`, `updated_at`

### `keywords`
Watchlist terms used to tag jobs.
- `id`, `term` (unique), `category`, `is_active`
- Pre-seeded with: bloomreach, exponea, klaviyo, braze, iterable, customer.io, segment, mparticle, hubspot, marketo, crm, lifecycle, martech, retention, loyalty, cdp

### `jobs`
Deduplicated by LinkedIn URL.
- `id`, `company_id` (FK), `title`, `location`, `linkedin_url` (unique)
- `source` (default 'linkedin')
- `first_seen_import`, `last_seen_import` (FKs to csv_imports)
- `seen_count` (how many imports it appeared in)
- `is_active`, `status` ('new' | 'reviewed' | 'contacted' | 'dismissed'), `notes`
- `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`

### `job_keywords`
Many-to-many: which keywords each job matched, in which field.
- `job_id`, `keyword_id`, `matched_in` ('title' | 'location' | 'import_label')

### Views

**`recent_jobs`** — flattened view for the Jobs dashboard. Joins jobs + companies + matched keywords.

**`company_signal_strength`** — companies ranked by total jobs and jobs in last 30 days.

### Extensions enabled
`pg_trgm` (fuzzy matching), `pgcrypto` (UUID generation)

### RLS
All tables have RLS enabled. Single policy per table: any authenticated user has full access (since this is single-user). When adding multi-tenancy later, add `workspace_id` column and tighten policies.

### Note on the schema
The earlier plan had a different schema (ATS-board oriented: `ats_provider`, `ats_slug`, `scrape_runs`). That was abandoned when the user revealed the actual input is Clay CSV exports, not direct scraping. The current schema is "Clay-CSV-first" — much simpler.

---

## 7. Project structure

```
mlcrm/
├── app/
│   ├── (auth)/login/page.tsx       # magic-link login form
│   ├── (dashboard)/
│   │   ├── layout.tsx              # nav bar + auth gate
│   │   ├── imports/page.tsx        # CSV upload (Step 3, currently placeholder)
│   │   ├── jobs/page.tsx           # jobs dashboard (Step 4, placeholder)
│   │   ├── companies/page.tsx      # companies dashboard (Step 5, placeholder)
│   │   └── keywords/page.tsx       # keyword management (Step 6, placeholder)
│   ├── auth/callback/route.ts      # magic-link exchange + email whitelist
│   ├── layout.tsx                  # root layout (Next.js default)
│   ├── page.tsx                    # root — redirects based on auth state
│   └── globals.css                 # Tailwind base
├── lib/
│   └── supabase/
│       ├── client.ts               # browser client
│       ├── server.ts               # server client (Server Components, Route Handlers)
│       └── middleware.ts           # session refresh + route gating logic
├── middleware.ts                   # Next.js middleware entrypoint
├── .env.local                      # NOT committed; see env vars below
├── package.json
├── tsconfig.json
└── PROJECT.md                      # this file
```

### Route groups
- `(auth)` and `(dashboard)` are Next.js route groups — folders with parens don't affect URLs
- `(dashboard)` lets all 4 pages share `layout.tsx` (nav bar, auth check) without putting `/dashboard` in URLs

---

## 8. Environment variables

Local: `.env.local` (gitignored). Production: Vercel project settings.

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-jwt>
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
ALLOWED_EMAIL=masterov.lp172@gmail.com
```

- `NEXT_PUBLIC_*` are exposed to the browser
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — bypasses RLS, never expose
- `ALLOWED_EMAIL` controls who can log in

---

## 9. Local development

```bash
cd ~/Projects/mlcrm
npm run dev
```

Then open `http://localhost:3000`. The localhost redirect URL is whitelisted in Supabase, so magic links work locally too.

To stop: `Ctrl+C` in the terminal.

---

## 10. Deployment

Auto-deploy: any push to `main` on GitHub triggers a Vercel build and deploy. No manual step.

```bash
git add .
git commit -m "your message"
git push
```

Vercel URL: assigned at deploy (e.g., `mlcrm-online-<hash>-pashamaster.vercel.app`)
Production URL: `https://mlcrm.online`

### DNS (Namecheap)
- A record: `@` → `76.76.21.21`
- CNAME: `www` → `cname.vercel-dns.com`

---

## 11. Build roadmap

| Step | Status | Description |
|---|---|---|
| 1. Supabase schema | ✅ Done | All tables, views, RLS, seed keywords |
| 2. Next.js scaffold + auth + deploy | ✅ Done | Live at mlcrm.online with magic-link login |
| 3. CSV upload + parse + dedupe | ⏳ Next | Imports page actually works; data lands in DB |
| 4. Jobs dashboard | ⏳ | Filterable table with status, keywords, links |
| 5. Companies dashboard | ⏳ | Ranked by signal strength, notes per company |
| 6. Keywords management | ⏳ | CRUD + per-keyword job counts |
| 7. Telegram digest | ⏳ | Daily/weekly summary of new matches |

Beyond Step 7 (people enrichment, outreach automation, scoring) — separate conversation.

---

## 12. Step 3 spec (next up)

**Goal:** User uploads a Clay CSV at `/imports` → the system parses, dedupes, and stores it → user sees a summary.

### CSV format (from Clay)
No header row (Clay exports headerless). Columns in order:
1. Job title
2. Company name
3. Location (free-form)
4. Company domain (sometimes literal "undefined")
5. LinkedIn job URL

### Processing logic
1. Upload CSV to Supabase Storage bucket `csv-uploads`
2. Create `csv_imports` row with status='uploaded'
3. Parse rows (using `papaparse` or similar)
4. For each row:
   - Normalize domain (lowercase, strip "www.", handle "undefined" as NULL)
   - Look up company by domain → if not found, create new
   - Look up job by linkedin_url → if not found, create new; if found, update `last_seen_at`, increment `seen_count`
   - Run keyword matching: for each active keyword, check if it appears (case-insensitive) in title. Insert into `job_keywords`.
5. Update `csv_imports` counts and set status='completed'
6. Return summary to UI

### UI
- Upload component (drag-drop or file picker)
- Optional "source label" input ("Clay - Bloomreach search")
- After upload: summary card (X new jobs, Y new companies, Z duplicates, W keyword matches)
- List of past imports with their stats

### Implementation notes
- Use Next.js Server Actions or a Route Handler for the upload endpoint
- Use Supabase service role key for the bulk inserts (bypasses RLS)
- Use `papaparse` for CSV parsing (`npm install papaparse @types/papaparse`)
- Recruiter detection: flag company as `is_recruiter=true` if name matches patterns like "Search", "Recruitment", "Talent", "Staffing" (manual override possible). Initial recruiters to flag: 3Search, RHR, Forward Role, Erin Associates, Jobster, McFadyen Digital, Michael Page.

---

## 13. Important decisions already made

1. **CSV duplicates kept:** If Clay returns the same role under multiple locations (different LinkedIn URLs), both are stored as separate jobs. No soft-dedupe in MVP. Can add "merge similar" feature later.

2. **Company dedup by domain.** Name-based dedup is too unreliable. If a row has no domain (Clay "undefined"), it becomes a new company with `domain=NULL`. User can manually merge later.

3. **Recruiters are not filtered out — just flagged.** Recruiter jobs (3Search, RHR, etc.) are real signals about which clients are hiring, just less direct. `is_recruiter` flag lets the UI filter/sort them.

4. **Single-user MVP.** No workspaces, no team support. Adding later requires adding `workspace_id` column to all tables and updating RLS.

5. **`name_normalized` uses `lower()` only**, not `unaccent()` — `unaccent` is STABLE and can't be used in generated columns. For accent-sensitive fuzzy matching, use `unaccent()` at query time.

---

## 14. How to ask AI to continue this project

When starting a new conversation with any AI assistant, paste this file or share the GitHub repo link. The AI should:

1. Read this file first
2. Confirm the current step (currently: Step 2 done, Step 3 next)
3. Ask before making schema changes
4. Ask before adding dependencies
5. Update this file when shipping a new step

If you want a specific feature, frame the request as: *"I want to add [feature]. Here's the PROJECT.md. Where does this fit in the roadmap and what's the smallest implementation?"*

---

## 15. Known gotchas / things that bit us

- **Don't auto-initialize GitHub repos with a README** — causes merge conflicts on first push. Either create empty repos or use `git push --force` on first push.
- **TextEdit smart quotes** break TypeScript. Always set Format → Make Plain Text, and disable Smart Quotes in TextEdit preferences.
- **Generated columns must use IMMUTABLE functions.** `unaccent()` is STABLE, so it fails. Use `lower()` only in generated columns, or wrap unaccent in a custom IMMUTABLE function.
- **Magic link rate limits** — Supabase free tier limits ~3-4 per hour per email. If testing repeatedly, expect delays.
- **Vercel "Invalid Configuration"** on domain add is normal until DNS propagates. Wait 5-30 min.
- **The CSV from Clay has no header row.** Don't expect column names; parse positionally.

---

## 16. Useful commands

```bash
# Local dev
cd ~/Projects/mlcrm
npm run dev

# Deploy (auto via push)
git add .
git commit -m "message"
git push

# Reset local DB connection (rare)
npm run dev -- --turbo

# Check what files differ from GitHub
git status

# View recent commits
git log --oneline -10

# Check env vars are loaded
cat .env.local

# Connect to Supabase directly (need psql installed)
# Get connection string from Supabase → Project Settings → Database
```

---

## 17. Sample Clay CSV (for testing Step 3)

Stored at: `(user has a file like `brjobs_-_Sheet1.csv` — ~100 rows of LinkedIn job results matching martech keywords)`

Example rows (no header in the file):
```
Senior AI/ML Engineer,Bloomreach,Czechia,bloomreach.com,https://www.linkedin.com/jobs/view/...
CRM Specialist,B2Spin Limited,Malta,b2spin.com,https://www.linkedin.com/jobs/view/...
Medior CRM Lifecycle Consultant,DEPT,"Rotterdam, South Holland, Netherlands",deptagency.com,https://www.linkedin.com/jobs/view/...
CDP / CRM Automation Specialist,Data Club,"Prague 3, Prague, Czechia",undefined,https://www.linkedin.com/jobs/view/...
```

Note: row 4 above has `"undefined"` as the domain (literal string from Clay) — Step 3 parser must handle this as NULL.

---

*End of PROJECT.md. Keep this file updated as the project evolves.*
