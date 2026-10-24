# Security notes

How this site is protected, and what needs doing by hand.

## What protects the admin

- **Admin allow-list.** Only accounts listed in `public.admins` count as admin. A signed-in stranger sees nothing and can change nothing (`sql/security-hardening.sql`). Sign-ups should also be switched off in Supabase.
- **Two-step sign-in (TOTP).** Turn it on in the dashboard under Account. Once a verified authenticator exists, the database refuses everything until the 6-digit code has been entered.
- **Sign-in throttling**, a 12-character minimum password, and an idle sign-out timer.
- **Row Level Security** on every table. Visitors can only read published projects, and can only *insert* messages and page views, never read them.
- **Spam limits in the database**: messages are limited per email and overall, page views are limited overall, and all inputs are length- and shape-checked.
- **Uploads**: the storage bucket only accepts images and video, up to 50 MB, and only admins can write.

## What protects visitors

- **Content-Security-Policy** on every page: scripts only from this site and one pinned Supabase library URL, no inline scripts, no framing (`js/framebust.js` backs this up, since GitHub Pages can't send headers).
- **Blog posts written in the admin** are passed through an allow-list sanitizer (`blog-src/sanitize.py`) before they are published, so a post can never carry scripts.
- **No secrets in the repo.** Only the public anon key is in the frontend, and it is safe by design because RLS does the guarding. Never add a `service_role` key to any file.
- **Dependabot** keeps the GitHub Actions up to date (`.github/dependabot.yml`).

## If the phone with the authenticator is lost

In the Supabase SQL Editor run `delete from auth.mfa_factors where user_id = '<your user id>';` then sign in with the password and set it up again.

## Reporting a problem

Email the address on the contact page.

## Message alerts

`sql/upgrade-alerts.sql` sends a WhatsApp (or ntfy phone) alert for each new contact message. The key lives in the private `alert_config` table, which the website and visitors cannot read, and an alert failing never blocks a message. At most one alert is sent per minute.
