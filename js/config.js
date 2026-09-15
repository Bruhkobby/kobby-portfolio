/* ============================================================
   SUPABASE CONFIGURATION  —  EDIT THIS FILE
   ============================================================
   1. Go to https://supabase.com and create a free project.
   2. In your Supabase Dashboard open:  Settings -> API
   3. Copy the "Project URL" and the "anon public" key.
   4. Paste them between the quotes below.

   While these two values are empty, the website runs in
   DEMO MODE with sample projects (see js/demo-data.js).

   IMPORTANT: Only use the ANON (public) key here.
   NEVER put your service_role key in any frontend file.
   ============================================================ */

const SUPABASE_URL = "";      // <-- e.g. "https://abcdefgh.supabase.co"
const SUPABASE_ANON_KEY = ""; // <-- e.g. "eyJhbGciOiJIUzI1NiIsInR5..."

/* ------------------------------------------------------------
   Storage bucket used for project image uploads.
   (Created for you by sql/setup.sql — name usually stays the same)
   ------------------------------------------------------------ */
const SUPABASE_BUCKET = "project-images";

/* ------------------------------------------------------------
   Do not edit below this line.
   Creates the shared Supabase client used by the public site
   and the admin dashboard (window.sb).
   ------------------------------------------------------------ */
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Expose for scripts that read these values via `window.`.
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.SUPABASE_BUCKET = SUPABASE_BUCKET;
window.SUPABASE_CONFIGURED = SUPABASE_CONFIGURED;

window.sb = null;
if (SUPABASE_CONFIGURED && window.supabase && typeof window.supabase.createClient === "function") {
  try {
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  } catch (err) {
    console.error("Supabase client failed to initialise:", err);
  }
}
