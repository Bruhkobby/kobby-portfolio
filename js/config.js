/* ============================================================
   SUPABASE CONFIGURATION  —  EDIT THIS FILE
   ============================================================
   1. Go to https://supabase.com and create a free project.
   2. In your Supabase Dashboard open:  Settings -> API
   3. Copy the "Project URL" and the "anon public" key.
   4. Paste them between the quotes below.

   IMPORTANT: Only use the ANON (public) key here.
   NEVER put your service_role key in any frontend file.
   ============================================================ */

const SUPABASE_URL = "https://ixubjyxegefvpgdickac.supabase.co";      // <-- e.g. "https://abcdefgh.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4dWJqeXhlZ2VmdnBnZGlja2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzU0NjMsImV4cCI6MjEwNTA1MTQ2M30.q60T03z8fR74dDNKA1JlsmTAESUQ8S858XGu82wGabQ"; // <-- e.g. "eyJhbGciOiJIUzI1NiIsInR5..."

/* ------------------------------------------------------------
   Storage bucket used for project image uploads.
   (Created for you by sql/setup.sql — name usually stays the same)
   ------------------------------------------------------------ */
const SUPABASE_BUCKET = "project-images";

/* ------------------------------------------------------------
   PORTFOLIO DIVISIONS
   One list shared by the public Portfolio page and the admin
   dashboard. Each project has a Category; each Category belongs
   to one division. To add a category, add it to a division here.
   ------------------------------------------------------------ */
window.DIVISIONS = [
  { id: "video",    name: "Video & Motion",   blurb: "Video edits, motion graphics and animated pieces.",   categories: ["Video Editing", "Motion"] },
  { id: "branding", name: "Branding",         blurb: "Logos, brand identities and guidelines.",             categories: ["Branding"] },
  { id: "print",    name: "Flyers & Posters", blurb: "Print and digital flyers, posters and banners.",      categories: ["Flyers", "Posters"] },
  { id: "social",   name: "Social Media",     blurb: "Campaign visuals and content for social platforms.",  categories: ["Social Media"] },
  { id: "graphic",  name: "Graphic Design",   blurb: "Layouts, UI/UX, photo editing and other design work.", categories: ["Graphic Design", "UI/UX", "Photo Editing", "Other"] }
];

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
