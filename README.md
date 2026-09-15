# KOBBY — Graphic Designer & Multimedia Creative Portfolio

A premium, minimal, editorial portfolio website built with **HTML5, CSS3 and vanilla JavaScript** — no frameworks, no build step. Projects are managed through a private **admin dashboard** and stored in **Supabase** (PostgreSQL database + image storage + authentication).

```
/
├── index.html            ← Homepage (hero, featured project, selected work)
├── portfolio.html        ← Work grid with category filters
├── project.html          ← Case-study page (?slug=project-name)
├── about.html            ← Bio, philosophy, skills, software, services
├── services.html         ← Services list
├── contact.html          ← Contact details + socials
├── admin/
│   ├── index.html        ← Admin login (Supabase Auth)
│   ├── dashboard.html    ← Admin dashboard (create/edit/delete/publish)
│   └── admin.js          ← All admin logic
├── css/
│   ├── style.css         ← Public site styles
│   ├── responsive.css    ← Tablet + mobile styles
│   └── admin.css         ← Admin dashboard styles
├── js/
│   ├── config.js         ← ⭐ YOUR Supabase credentials go here
│   ├── demo-data.js      ← Sample projects shown until Supabase is set up
│   ├── main.js           ← Navigation, mobile menu, page transitions
│   ├── portfolio.js      ← Loads projects from Supabase + renders pages
│   └── animations.js     ← Reveal animations + custom cursor
├── assets/
│   ├── images/           ← Demo placeholder art (replace with real work via admin)
│   ├── icons/            ← Favicon
│   └── fonts/            ← (Fonts load from Google Fonts — you can self-host here)
├── sql/
│   └── setup.sql         ← Database + storage setup script (run once in Supabase)
└── README.md
```

> **The site works right now in DEMO MODE** with sample projects so you can see the design. Follow the setup below to connect your own Supabase project — then everything is managed from the admin dashboard, no code needed.

---

## 1. Download the project

1. Download the project folder (or `git clone` your repository).
2. Open `index.html` in a browser to preview it locally. That's it — no install, no build.

## 2. Create a Supabase project (free)

1. Go to [https://supabase.com](https://supabase.com) and sign up / log in.
2. Click **New project**. Choose any name (e.g. `kobby-portfolio`), a strong database password, and a region near you.
3. Wait ~1 minute for the project to finish creating.

## 3. Create the database tables

1. In your Supabase dashboard, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `sql/setup.sql` from this project, copy **all** of its contents, paste it into the query, and click **Run**.
4. You should see "Success". This creates:
   - `projects` table — all project info (title, category, brief, objective, etc.)
   - `project_images` table — image URLs linked to each project
   - **Row Level Security** rules — visitors can only read *published* projects; only logged-in users can change anything
   - a public storage bucket called `project-images`

## 4. Configure Supabase in the website

1. In Supabase, go to **Project Settings → API**.
2. Copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long `eyJ...` string — this is safe to use in frontend code)
3. Open `js/config.js` and paste them:

   ```js
   const SUPABASE_URL = "https://abcdefgh.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIs...";
   ```

4. Save and reload the website. It now loads your real database instead of the demo data.

> ⚠️ **Never** put your `service_role` key in any frontend file. Only the anon key belongs here. Security is enforced by Row Level Security, which `setup.sql` already configured.

## 5. Create the admin account

1. In Supabase, go to **Authentication → Users**.
2. Click **Add user → Create new user**.
3. Enter your email and a strong password, and tick **Auto Confirm User**.
4. Done — this email + password now signs in at `/admin/index.html`.

   *(Optional but recommended: in **Authentication → Providers → Email**, turn OFF "Allow new users to sign up" so nobody else can create an account in your project.)*

## 6. Configure Supabase Storage

Already done in step 3 — `sql/setup.sql` created the **public** `project-images` bucket with rules:
- anyone can **view** images (needed for the public site),
- only logged-in users can **upload/update/delete** images.

You don't need to touch the Storage settings unless you want to rename the bucket. If you do, also change `SUPABASE_BUCKET` in `js/config.js`.

## 7. Deploy the website (GitHub Pages or any static host)

The site is 100% static — it works on GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.

**GitHub Pages:**

1. Push the folder to a GitHub repository (see below).
2. In the repo: **Settings → Pages → Source: Deploy from a branch** → choose `main` and `/ (root)` → Save.
3. Your site appears at `https://yourusername.github.io/repo-name/`.

**Pushing to GitHub from the command line:**

```bash
git init
git add .
git commit -m "Portfolio website"
git branch -M main
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

> Uploaded project images live in **Supabase Storage**, never in the repository — the repo only contains website code.

## 8. Using the admin dashboard

Open **`/admin/index.html`** (e.g. `https://yoursite.com/admin/index.html`) and sign in with the account from step 5. The admin area is completely separate from the public website — there are no links to it anywhere on the public pages.

**Dashboard features:**

- **+ New Project** — create a project. Fill in title, category, client, year, the five case-study texts (client brief, objective, creative direction, design process, result), then **Save Project**.
- **Upload images** — after saving, use the *Upload images* button on the right. Select multiple files at once. The **first image is the cover**; use ↑ ↓ to reorder and × to delete.
- **Publish / unpublish** — the green toggle on each project row. Published projects appear on the public site instantly; drafts stay private.
- **Edit** — opens the project for editing; the public version updates as soon as you save.
- **Delete** — removes the project and its uploaded images permanently.
- **Reorder** — the ↑ ↓ buttons on each row change the display order on the public site.
- **Featured** — tick "Featured project" to show it large on the homepage.

## 9. Adding / editing / deleting portfolio projects

Same as section 8 — everything happens in the dashboard:

1. Sign in at `/admin/index.html`.
2. Click **+ New Project**, fill in the fields, **Save Project**.
3. Click **Upload images** and add your artwork (multiple images supported).
4. Tick **Published** → the project appears on the public Work page immediately.

To change text later: **Edit → change → Save Project**. To remove: **Delete**. No code, no redeploying.

---

## Customising the site content

All static text (name, statement, bio, services, contact details, socials) lives directly in the HTML files with `<!-- EDIT ME -->` comments marking each spot:

| What | File |
|---|---|
| Hero name + statement | `index.html` |
| Bio, philosophy, skills, software | `about.html` |
| Services + descriptions | `services.html` |
| Email, phone, WhatsApp, socials | `contact.html` + footer in every page |
| Page titles / accent colour / fonts | `css/style.css` (`:root` variables at the top) |

## Troubleshooting

- **Site shows demo projects after configuring Supabase** — hard-refresh (Ctrl+Shift+R); check the URL/key in `js/config.js` have no typos or extra quotes.
- **Login fails** — make sure the user was created with **Auto Confirm User** ticked, and that email sign-in isn't blocked by a "Confirm email" requirement.
- **"new row violates row-level security policy"** — you're signed out or the policies from `setup.sql` didn't run; re-run the SQL.
- **Images don't display** — confirm the `project-images` bucket exists and is **public** (Storage → project-images → make public).

Built with plain HTML/CSS/JS + [Supabase](https://supabase.com). Fonts: [Syne](https://fonts.google.com/specimen/Syne) & [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts.
