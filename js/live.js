/* ============================================================
   KOBBY — Portfolio
   live.js — brings in what you manage in the admin:
     • availability + WhatsApp settings
     • testimonials, client logos and pricing packages
     • privacy-friendly page counting (no cookies, no IP address)
   If the database can't be reached, the site keeps working with the
   built-in defaults and the last values it saw on this device.
   ============================================================ */
(function () {
  "use strict";

  var BASE = window.SUPABASE_URL, KEY = window.SUPABASE_ANON_KEY;
  if (!BASE || !KEY || document.body.hasAttribute("data-admin")) return;

  var CACHE_KEY = "kobbyLive1";

  function api(path) {
    return fetch(BASE + "/rest/v1/" + path, { headers: { apikey: KEY, Authorization: "Bearer " + KEY } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null") || {}; } catch (e) { return {}; }
  }
  function writeCache(patch) {
    try {
      var c = readCache(); for (var k in patch) c[k] = patch[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  /* ---------- Settings ---------- */
  function applySettings(v) { if (v && window.KobbySite) window.KobbySite.apply(v); }

  /* ---------- Content (testimonials, clients, packages) ---------- */
  function applyContent(c) {
    if (c.testimonials) window.TESTIMONIALS = c.testimonials;
    if (c.clients) window.CLIENTS = c.clients;
    if (c.packages) window.PRICING = c.packages;
    if (window.KobbyExtras) window.KobbyExtras.render();
  }

  var cache = readCache();
  applySettings(cache.settings);
  if (cache.content) applyContent(cache.content);

  api("site_settings?select=value&key=eq.general").then(function (rows) {
    if (rows && rows[0]) { applySettings(rows[0].value); writeCache({ settings: rows[0].value }); }
  }).catch(function () {});

  var needTestimonials = document.getElementById("testimonials");
  var needPackages = document.getElementById("pricing-packages");
  if (needTestimonials || needPackages) {
    var jobs = [
      needTestimonials ? api("testimonials?select=quote,name,role&order=sort_order.asc,created_at.asc") : Promise.resolve(null),
      needTestimonials ? api("clients?select=name,logo_url&order=sort_order.asc,created_at.asc") : Promise.resolve(null),
      needPackages ? api("packages?select=name,price_from,price_note,includes&order=sort_order.asc,created_at.asc") : Promise.resolve(null)
    ];
    Promise.all(jobs).then(function (r) {
      var content = {};
      if (r[0]) content.testimonials = r[0].map(function (t) { return { quote: t.quote, name: t.name, role: t.role || "" }; });
      if (r[1]) content.clients = r[1].map(function (c) { return { name: c.name, logo: c.logo_url || "" }; });
      if (r[2]) content.packages = r[2].map(function (p) { return { name: p.name, from: p.price_from, note: p.price_note || "", includes: p.includes || [] }; });
      var old = readCache().content || {};
      for (var k in content) old[k] = content[k];
      writeCache({ content: old });
      applyContent(content);
    }).catch(function () {});
  }

  /* ---------- Page counting ----------
     Counts a page view with: the page, the project (if any), the site you
     came from, and mobile/tablet/desktop. No cookies, no IP address, no
     ID that follows anyone around. Skipped when the visitor has "Do Not
     Track" or Global Privacy Control switched on, and for the site owner. */
  function track() {
    var host = location.hostname;
    var isLocal = host === "localhost" || host === "127.0.0.1" || location.protocol === "file:";
    if (isLocal && !window.__KOBBY_TRACK_TEST) return;
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    try { if (localStorage.getItem("kobbyOwner") === "1") return; } catch (e) {}

    var segs = location.pathname.split("/").filter(Boolean);
    var file = segs[segs.length - 1] || "index.html";
    if (file.indexOf(".") === -1) file = "index.html";
    if (segs.length > 1 && segs[segs.length - 2] === "blog") file = "blog/" + file;
    var slug = null;
    if (file === "project.html") {
      slug = new URLSearchParams(location.search).get("slug");
      if (slug) slug = slug.toLowerCase().slice(0, 120);
      if (slug && !/^[a-z0-9-]+$/.test(slug)) slug = null;   // matches the database check
    }
    file = file.toLowerCase().replace(/[^a-z0-9._\/-]/g, "").slice(0, 200) || "index.html";
    var once = "kobbyV:" + file + ":" + (slug || "");
    var entry = true;
    try {
      if (sessionStorage.getItem(once)) return;          // a reload isn't a new view
      sessionStorage.setItem(once, "1");
      entry = !sessionStorage.getItem("kobbyS");          // first page of this visit
      sessionStorage.setItem("kobbyS", "1");
    } catch (e) {}

    var ref = null;
    try {
      if (document.referrer) {
        var h = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (h && h !== host.replace(/^www\./, "")) ref = h.toLowerCase().slice(0, 120);
        if (ref && !/^[a-z0-9.-]+$/.test(ref)) ref = null;
      }
    } catch (e) {}
    var w = window.innerWidth;
    var row = { path: file, project_slug: slug, referrer: ref, device: w < 700 ? "mobile" : w < 1100 ? "tablet" : "desktop", is_entry: entry };

    fetch(BASE + "/rest/v1/page_views", {
      method: "POST",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
      keepalive: true
    }).catch(function () {});
  }
  track();
})();
