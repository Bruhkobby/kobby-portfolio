/* ============================================================
   KOBBY — Portfolio CMS
   panels.js — Overview, Site (settings + testimonials + clients +
   packages), Stats and Blog panels. Uses the helpers that
   admin.js shares through window.Admin.
   ============================================================ */
(function () {
  "use strict";

  var A = window.Admin;
  if (!A) return;
  var $ = A.$, esc = A.esc, attr = A.attr;
  var P = window.AdminPanels = window.AdminPanels || {};

  function sb() { return window.sb; }
  function goTab(name) {
    var b = document.querySelector('.tab-btn[data-tab="' + name + '"]');
    if (b) b.click();
  }
  function todayUTC() { return new Date().toISOString().slice(0, 10); }
  function daysAgo(iso) { return (Date.now() - new Date(iso).getTime()) / 86400000; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /* ============================================================
     BLOG MANIFEST (list of posts written in the code, built by the site)
     ============================================================ */
  function loadManifest() {
    return fetch("../blog/posts.json?t=" + Date.now()).then(function (r) {
      if (!r.ok) throw new Error("none");
      return r.json();
    }).then(function (j) { return j.posts || []; }).catch(function () { return []; });
  }

  /* ============================================================
     OVERVIEW
     ============================================================ */
  P.overview = {
    show: function () {
      var hello = $("ovHello");
      var hour = new Date().getHours();
      hello.textContent = (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening") + ", Kobby. Here is how the site is doing.";

      var safe = function (p, fallback) { return Promise.resolve(p).then(function (r) { return r; }, function () { return fallback; }); };
      var q = function (builder) {
        return builder.then(function (r) { return r && !r.error ? (r.data || []) : []; }, function () { return []; });
      };

      Promise.all([
        safe(A.loadProjects(), []),
        safe(A.loadMessages(), []),
        q(sb().from("activity_log").select("*").order("created_at", { ascending: false }).limit(8)),
        sb().rpc("analytics_summary", { days: 7 }).then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; }),
        loadManifest(),
        q(sb().from("blog_posts").select("slug,title,publish_on,status")),
        q(sb().from("testimonials").select("id")),
        q(sb().from("site_settings").select("value").eq("key", "general"))
      ]).then(function (r) {
        var projects = A.state.projects, messages = A.state.messages;
        var activity = r[2], stats = r[3], manifest = r[4], dbPosts = r[5], testimonials = r[6], settings = r[7];

        var live = projects.filter(function (p) { return p.published && !A.isScheduled(p); }).length;
        var sched = projects.filter(A.isScheduled).length;
        var drafts = projects.filter(function (p) { return !p.published; }).length;
        var open = messages.filter(function (m) { return (m.status || "new") === "new" || m.status === "in_progress"; });

        // upcoming blog posts (from code + from the admin)
        var today = todayUTC();
        var upcoming = manifest.filter(function (p) { return p.status === "scheduled"; }).map(function (p) { return p.date; })
          .concat(dbPosts.filter(function (p) { return p.status === "ready" && p.publish_on > today; }).map(function (p) { return p.publish_on; }))
          .sort();

        var tiles = [
          ["Live projects", live, "projects"],
          ["Drafts", drafts, "projects"],
          ["Scheduled", sched, "projects"],
          ["Need a reply", open.length, "inbox"],
          ["Visits, 7 days", stats ? stats.visits : "—", "stats"],
          ["Next blog post", upcoming[0] ? shortDate(upcoming[0]) : "None", "blog"]
        ];
        $("ovTiles").innerHTML = tiles.map(function (t) {
          return '<button type="button" class="stat-tile" data-goto="' + t[2] + '"><span class="stat-num">' + esc(t[1]) + '</span><span class="stat-label">' + esc(t[0]) + "</span></button>";
        }).join("");

        // needs attention
        var items = [];
        var newCount = messages.filter(function (m) { return (m.status || "new") === "new"; }).length;
        if (newCount) items.push(["inbox", plural(newCount, "new message is", "new messages are") + " waiting for you."]);
        var late = open.filter(function (m) { return daysAgo(m.created_at) > 3; }).length;
        if (late) items.push(["inbox", plural(late, "message has", "messages have") + " waited more than 3 days for a reply."]);
        var noCover = projects.filter(function (p) { return p.published && !(p.project_images || []).length; }).length;
        if (noCover) items.push(["projects", plural(noCover, "published project has", "published projects have") + " no images."]);
        var noAlt = 0;
        projects.forEach(function (p) { if (p.published) (p.project_images || []).forEach(function (im) { if (!(im.alt_text || "").trim()) noAlt++; }); });
        if (noAlt) items.push(["projects", plural(noAlt, "image has", "images have") + " no description yet. Short descriptions help Google and screen readers."]);
        var oldDrafts = projects.filter(function (p) { return !p.published && daysAgo(p.updated_at || p.created_at) > 14; }).length;
        if (oldDrafts) items.push(["projects", plural(oldDrafts, "draft hasn't", "drafts haven't") + " been touched in over two weeks."]);
        if (upcoming.length < 3) items.push(["blog", "Only " + plural(upcoming.length, "blog post is", "blog posts are") + " scheduled. Write one in the Blog tab, or send me ideas."]);
        if (settings[0] && settings[0].value && settings[0].value.available === false) items.push(["site", "The site currently says you're fully booked."]);
        if (!testimonials.length) items.push(["site", "No testimonials yet. Add a real client quote in the Site tab and it will show on your home page."]);
        $("ovAttention").innerHTML = items.length
          ? items.map(function (i) { return '<li><button type="button" class="link-btn" data-goto="' + i[0] + '">' + esc(i[1]) + "</button></li>"; }).join("")
          : "<li>All good. Nothing needs your attention right now. ✓</li>";

        // latest messages
        $("ovMessages").innerHTML = messages.length
          ? messages.slice(0, 4).map(function (m) {
              return '<button type="button" class="ov-msg" data-goto="inbox"><strong>' + esc(m.name || "Anonymous") + "</strong>" +
                '<span class="muted small">' + esc(String(m.message || "").slice(0, 90)) + (String(m.message || "").length > 90 ? "…" : "") + "</span></button>";
            }).join("")
          : '<p class="muted small">No messages yet.</p>';

        // activity
        $("ovActivity").innerHTML = activity.length
          ? activity.map(function (a) {
              return "<li><span>" + esc(a.action) + (a.detail ? " — " + esc(a.detail) : "") + '</span><time class="muted small">' + esc(A.niceTime(a.created_at)) + "</time></li>";
            }).join("")
          : '<li class="muted">Nothing yet. Your changes will be listed here.</li>';
      });
    }
  };
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-goto]");
    if (g && g.closest("#overviewTab")) goTab(g.getAttribute("data-goto"));
  });

  function shortDate(iso) {
    return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  /* ============================================================
     SITE: settings + content managers
     ============================================================ */
  function loadSettings() {
    sb().from("site_settings").select("value").eq("key", "general").then(function (res) {
      var v = (res.data && res.data[0] && res.data[0].value) || {};
      $("sAvailable").checked = v.available !== false;
      $("sWhatsapp").value = v.whatsapp || "233545414923";
      $("sWaMessage").value = v.whatsapp_message || "Hi Kobby, I found your portfolio and I'd like to talk about a project.";
    });
  }
  function saveSettings(e) {
    e.preventDefault();
    var err = $("settingsError");
    err.hidden = true;
    var wa = $("sWhatsapp").value.replace(/\D/g, "");
    if (wa.length < 8) { err.textContent = "Enter the WhatsApp number with its country code, digits only (for example 233545414923)."; err.hidden = false; return; }
    var value = { available: $("sAvailable").checked, whatsapp: wa, whatsapp_message: $("sWaMessage").value.trim() || "Hi Kobby, I found your portfolio and I'd like to talk about a project." };
    var btn = $("settingsSave");
    btn.disabled = true;
    sb().from("site_settings").upsert({ key: "general", value: value, updated_at: new Date().toISOString() }).then(function (res) {
      btn.disabled = false;
      if (res.error) { err.textContent = "Could not save: " + res.error.message; err.hidden = false; return; }
      $("settingsStatus").textContent = "Saved ✓ It's live on the site now.";
      A.log("Changed site settings", value.available ? "Available" : "Fully booked");
    });
  }

  // A small reusable list manager (add / edit / reorder / show-hide / delete)
  function Manager(cfg) {
    var root = $(cfg.el), rows = [], editing = null;

    function load() {
      return sb().from(cfg.table).select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true })
        .then(function (res) {
          if (res.error) { root.innerHTML = '<h3>' + esc(cfg.title) + '</h3><p class="muted">Could not load: ' + esc(res.error.message) + "</p>"; return; }
          rows = res.data || [];
          render();
        });
    }

    function render() {
      var html = '<div class="mgr-head"><div><h3>' + esc(cfg.title) + '</h3><p class="muted small">' + esc(cfg.blurb) + "</p></div>" +
        (editing ? "" : '<button type="button" class="btn btn-primary btn-sm" data-m="add">+ Add</button>') + "</div>";
      if (editing) html += formHTML();
      if (!rows.length && !editing) html += '<p class="muted small mgr-empty">' + esc(cfg.empty) + "</p>";
      html += '<div class="mgr-list">' + rows.map(function (r, i) {
        var s = cfg.summary(r);
        return '<div class="mgr-row" data-id="' + attr(r.id) + '">' +
          (s.thumb ? '<img class="mgr-thumb" src="' + attr(s.thumb) + '" alt="" />' : "") +
          '<div class="mgr-main"><div class="mgr-title">' + esc(s.title) + '</div><div class="muted small">' + esc(s.sub || "") + "</div></div>" +
          '<label class="check mgr-show"><input type="checkbox" data-m="show"' + (r.published ? " checked" : "") + " /><span>Show</span></label>" +
          '<button class="icon-btn" data-m="up"' + (i === 0 ? " disabled" : "") + ' title="Move up">↑</button>' +
          '<button class="icon-btn" data-m="down"' + (i === rows.length - 1 ? " disabled" : "") + ' title="Move down">↓</button>' +
          '<button class="btn btn-ghost btn-sm" data-m="edit">Edit</button>' +
          '<button class="btn btn-danger btn-sm" data-m="del">Delete</button></div>';
      }).join("") + "</div>";
      root.innerHTML = html;
    }

    function formHTML() {
      var r = editing === "new" ? {} : rows.filter(function (x) { return x.id === editing; })[0] || {};
      return '<form class="mgr-form" novalidate>' + cfg.fields.map(function (f) {
        var v = cfg.toForm ? cfg.toForm(r)[f.key] : r[f.key];
        v = v == null ? "" : v;
        var input;
        if (f.type === "textarea" || f.type === "lines") input = '<textarea name="' + f.key + '" rows="' + (f.rows || 3) + '" maxlength="' + (f.max || 1000) + '" placeholder="' + attr(f.placeholder || "") + '">' + esc(v) + "</textarea>";
        else if (f.type === "file") input = '<input type="file" name="' + f.key + '" accept="image/*" />' + (v ? '<img class="mgr-thumb" src="' + attr(v) + '" alt="" style="margin-top:0.5rem;" />' : "");
        else input = '<input type="text" name="' + f.key + '" maxlength="' + (f.max || 200) + '" value="' + attr(v) + '" placeholder="' + attr(f.placeholder || "") + '" />';
        return '<label class="field"><span>' + esc(f.label) + (f.required ? " *" : "") + "</span>" + input + (f.help ? '<small class="muted">' + esc(f.help) + "</small>" : "") + "</label>";
      }).join("") +
        '<div class="alert alert-error" data-m="err" hidden></div>' +
        '<div class="form-actions"><button class="btn btn-primary" type="submit">Save</button><button class="btn btn-ghost" type="button" data-m="cancel">Cancel</button></div></form>';
    }

    function byId(id) { return rows.filter(function (r) { return r.id === id; })[0]; }
    function renumber(list) {
      return Promise.all(list.map(function (r, i) {
        return r.sort_order === i + 1 ? null : sb().from(cfg.table).update({ sort_order: i + 1 }).eq("id", r.id);
      })).then(load);
    }

    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-m]");
      if (!b) return;
      var m = b.getAttribute("data-m");
      var row = b.closest(".mgr-row");
      var r = row ? byId(row.getAttribute("data-id")) : null;
      if (m === "add") { editing = "new"; render(); }
      else if (m === "cancel") { editing = null; render(); }
      else if (m === "edit" && r) { editing = r.id; render(); }
      else if (m === "del" && r) {
        if (!confirm("Delete \"" + cfg.summary(r).title + "\"?")) return;
        sb().from(cfg.table).delete().eq("id", r.id).then(function (res) {
          if (res.error) { alert("Could not delete: " + res.error.message); return; }
          A.log("Deleted " + cfg.noun, cfg.summary(r).title);
          load();
        });
      }
      else if ((m === "up" || m === "down") && r) {
        var i = rows.indexOf(r), j = i + (m === "up" ? -1 : 1);
        if (j < 0 || j >= rows.length) return;
        var list = rows.slice(); list[i] = rows[j]; list[j] = r;
        renumber(list);
      }
    });
    root.addEventListener("change", function (e) {
      var b = e.target.closest('[data-m="show"]');
      if (!b) return;
      var r = byId(b.closest(".mgr-row").getAttribute("data-id"));
      sb().from(cfg.table).update({ published: b.checked }).eq("id", r.id).then(function (res) {
        if (res.error) { alert("Could not update: " + res.error.message); b.checked = !b.checked; return; }
        r.published = b.checked;
        A.log((b.checked ? "Showed " : "Hid ") + cfg.noun, cfg.summary(r).title);
      });
    });
    root.addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      var errBox = form.querySelector('[data-m="err"]');
      errBox.hidden = true;
      var vals = {};
      cfg.fields.forEach(function (f) { vals[f.key] = form.elements[f.key]; });
      for (var k = 0; k < cfg.fields.length; k++) {
        var f = cfg.fields[k];
        if (f.required && f.type !== "file" && !vals[f.key].value.trim()) { errBox.textContent = f.label + " is required."; errBox.hidden = false; return; }
      }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      var existing = editing === "new" ? {} : byId(editing) || {};
      var fileField = cfg.fields.filter(function (f) { return f.type === "file"; })[0];
      var file = fileField && vals[fileField.key].files && vals[fileField.key].files[0];

      var upload = Promise.resolve(null);
      if (file) {
        upload = A.optimiseImage(file).then(function (f) {
          var ext = (f.name.split(".").pop() || "png").toLowerCase();
          var path = "clients/" + Date.now() + "-" + A.slugify(f.name.replace(/\.[^.]+$/, "")) + "." + ext;
          return sb().storage.from(window.SUPABASE_BUCKET).upload(path, f, { cacheControl: "31536000", upsert: false }).then(function (res) {
            if (res.error) throw res.error;
            return sb().storage.from(window.SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl;
          });
        });
      }
      var saved = null;
      upload.then(function (url) {
        var payload = cfg.toDB(function (key) { return vals[key] ? vals[key].value.trim() : ""; }, url, existing);
        saved = Object.assign({}, existing, payload);
        if (editing === "new") {
          payload.sort_order = rows.reduce(function (m, r) { return Math.max(m, r.sort_order || 0); }, 0) + 1;
          payload.published = true;
          return sb().from(cfg.table).insert(payload);
        }
        return sb().from(cfg.table).update(payload).eq("id", editing);
      }).then(function (res) {
        if (res.error) throw res.error;
        A.log((editing === "new" ? "Added " : "Edited ") + cfg.noun, cfg.summary(saved).title);
        editing = null;
        return load();
      }).catch(function (err) {
        btn.disabled = false;
        errBox.textContent = "Could not save: " + (err.message || err);
        errBox.hidden = false;
      });
    });

    return { load: load };
  }

  var managers = null;
  function initManagers() {
    if (managers) return;
    managers = {
      testimonials: Manager({
        el: "mgrTestimonials", table: "testimonials", noun: "testimonial",
        title: "Testimonials", blurb: "Real quotes from real clients only. They appear in “Kind words” on your home page. With none added, that section stays hidden.",
        empty: "No testimonials yet. Ask a happy client for one or two sentences and add it here.",
        fields: [
          { key: "quote", label: "What they said", type: "textarea", required: true, max: 1000, rows: 3 },
          { key: "name", label: "Their name", required: true, max: 120 },
          { key: "role", label: "Their business or role (optional)", max: 160 }
        ],
        summary: function (r) { return { title: "“" + String(r.quote || "").slice(0, 80) + (String(r.quote || "").length > 80 ? "…" : "") + "”", sub: r.name + (r.role ? " · " + r.role : "") }; },
        toDB: function (get) { return { quote: get("quote"), name: get("name"), role: get("role") || null }; }
      }),
      clients: Manager({
        el: "mgrClients", table: "clients", noun: "client",
        title: "Client logos", blurb: "Businesses you've worked with, shown under your testimonials. Add a logo image, or just the name. Only add clients who are happy to be listed.",
        empty: "No clients added yet.",
        fields: [
          { key: "name", label: "Client name", required: true, max: 120 },
          { key: "logo_url", label: "Logo (optional)", type: "file", help: "A clear logo on a transparent or light background works best." }
        ],
        toForm: function (r) { return { name: r.name, logo_url: r.logo_url }; },
        summary: function (r) { return { title: r.name, sub: r.logo_url ? "With logo" : "Name only", thumb: r.logo_url || "" }; },
        toDB: function (get, url, existing) { return { name: get("name"), logo_url: url || existing.logo_url || null }; }
      }),
      packages: Manager({
        el: "mgrPackages", table: "packages", noun: "package",
        title: "Pricing packages", blurb: "Starting prices shown on the Services page. Only add prices you're happy to stand behind. With none added, the page says every project is quoted individually.",
        empty: "No packages yet, so the Services page says every project is quoted individually.",
        fields: [
          { key: "name", label: "Package name", required: true, max: 120, placeholder: "Logo & brand identity" },
          { key: "price_from", label: "Price", required: true, max: 60, placeholder: "GHS 1,500" },
          { key: "price_note", label: "Small label before the price (optional)", max: 60, placeholder: "Starting from" },
          { key: "includes", label: "What's included (one item per line)", type: "lines", rows: 5, max: 800 }
        ],
        toForm: function (r) { return { name: r.name, price_from: r.price_from, price_note: r.price_note, includes: (r.includes || []).join("\n") }; },
        summary: function (r) { return { title: r.name, sub: (r.price_note ? r.price_note + " " : "") + r.price_from + " · " + (r.includes || []).length + " items" }; },
        toDB: function (get) {
          return { name: get("name"), price_from: get("price_from"), price_note: get("price_note") || null,
            includes: get("includes").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean) };
        }
      })
    };
  }

  P.site = {
    show: function () {
      initManagers();
      loadSettings();
      managers.testimonials.load();
      managers.clients.load();
      managers.packages.load();
    }
  };
  $("settingsForm").addEventListener("submit", saveSettings);

  /* ============================================================
     STATS
     ============================================================ */
  var statsDays = 30;
  P.stats = {
    show: function () { loadStats(statsDays); }
  };
  $("statsRange").addEventListener("click", function (e) {
    var b = e.target.closest("[data-days]");
    if (!b) return;
    statsDays = parseInt(b.getAttribute("data-days"), 10);
    Array.prototype.forEach.call($("statsRange").children, function (c) { c.classList.toggle("active", c === b); });
    loadStats(statsDays);
  });

  function rankList(el, rows, label, value, empty) {
    $(el).innerHTML = rows.length
      ? rows.map(function (r) { return "<li><span>" + esc(label(r)) + "</span><strong>" + value(r) + "</strong></li>"; }).join("")
      : '<li class="muted">' + esc(empty) + "</li>";
  }

  function loadStats(days) {
    $("stTiles").innerHTML = '<p class="muted">Loading…</p>';
    sb().rpc("analytics_summary", { days: days }).then(function (res) {
      if (res.error) {
        $("stTiles").innerHTML = '<p class="muted">Could not load stats: ' + esc(res.error.message) + "</p>";
        return;
      }
      var d = res.data || {};
      var perVisit = d.visits ? (d.views / d.visits).toFixed(1) : "—";
      var tiles = [["Visits", d.visits || 0], ["Page views", d.views || 0], ["Pages per visit", perVisit]];
      $("stTiles").innerHTML = tiles.map(function (t) {
        return '<div class="stat-tile static"><span class="stat-num">' + esc(t[1]) + '</span><span class="stat-label">' + esc(t[0]) + "</span></div>";
      }).join("");

      // bars: fill in the days with no visits
      var map = {};
      (d.by_day || []).forEach(function (r) { map[r.d] = r; });
      var series = [];
      for (var i = days - 1; i >= 0; i--) {
        var day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        series.push({ d: day, visits: map[day] ? map[day].visits : 0, views: map[day] ? map[day].views : 0 });
      }
      var max = series.reduce(function (m, s) { return Math.max(m, s.visits); }, 0);
      $("stBars").innerHTML = max === 0
        ? '<p class="muted small">No visits recorded in this period yet. Numbers start appearing as visitors open your site.</p>'
        : '<div class="bar-row">' + series.map(function (s) {
            var h = Math.max(s.visits ? 4 : 1, Math.round((s.visits / max) * 100));
            return '<span class="bar" style="height:' + h + '%" title="' + attr(s.d + ": " + s.visits + " visits, " + s.views + " page views") + '"></span>';
          }).join("") + "</div>" +
          '<div class="bar-axis muted small"><span>' + esc(shortDate(series[0].d)) + "</span><span>Peak: " + max + " visits in a day</span><span>Today</span></div>";

      var titles = {};
      A.state.projects.forEach(function (p) { titles[p.slug] = p.title; });
      var pageNames = { "index.html": "Home", "portfolio.html": "Portfolio", "about.html": "About", "services.html": "Services", "contact.html": "Contact", "blog.html": "Blog", "project.html": "A project page", "terms.html": "Terms", "privacy.html": "Privacy" };
      rankList("stPages", d.pages || [], function (r) { return pageNames[r.path] || r.path; }, function (r) { return r.views; }, "No data yet.");
      rankList("stProjects", d.projects || [], function (r) { return titles[r.slug] || r.slug; }, function (r) { return r.views; }, "No project views yet.");
      rankList("stRefs", d.referrers || [], function (r) { return r.ref; }, function (r) { return r.visits; }, "No data yet.");
      var dn = { mobile: "Phone", tablet: "Tablet", desktop: "Computer" };
      rankList("stDevices", d.devices || [], function (r) { return dn[r.device] || r.device; }, function (r) { return r.visits; }, "No data yet.");
    });
  }

  /* ============================================================
     BLOG
     ============================================================ */
  var blog = { posts: [], editing: null };

  P.blog = {
    show: function () {
      $("blogEditView").hidden = true;
      $("blogListView").hidden = false;
      loadBlog();
    }
  };

  function loadBlog() {
    var list = $("blogList");
    Promise.all([
      loadManifest(),
      sb().from("blog_posts").select("*").order("publish_on", { ascending: false }).then(function (r) { return r && !r.error ? r.data || [] : []; }, function () { return []; })
    ]).then(function (r) {
      var manifest = r[0], db = r[1];
      blog.posts = db;
      var liveSlugs = {};
      manifest.forEach(function (p) { if (p.status === "live") liveSlugs[p.slug] = true; });
      var today = todayUTC();
      var rows = [];
      db.forEach(function (p) {
        var label, cls;
        if (p.status === "draft") { label = "Draft"; cls = "badge-draft"; }
        else if (liveSlugs[p.slug]) { label = "Live"; cls = "badge-published"; }
        else if (p.publish_on <= today) { label = "Publishing soon"; cls = "badge-scheduled"; }
        else { label = "Scheduled " + shortDate(p.publish_on); cls = "badge-scheduled"; }
        rows.push({ date: p.publish_on, html: row(p.title, p.category + " · " + p.publish_on, label, cls, "edit", p.id, liveSlugs[p.slug] ? "../blog/" + p.slug + ".html" : "") });
      });
      manifest.forEach(function (p) {
        if (p.source === "admin") return;
        var live = p.status === "live";
        rows.push({ date: p.date, html: row(p.title, p.category + " · " + p.date + " · written in the code", live ? "Live" : "Scheduled " + shortDate(p.date), live ? "badge-published" : "badge-scheduled", "", "", live ? "../blog/" + p.slug + ".html" : "") });
      });
      rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      list.innerHTML = rows.length ? rows.map(function (x) { return x.html; }).join("") : '<div class="card"><p class="muted">No posts yet. Click “+ New post” to write your first one.</p></div>';
    });
  }

  function row(title, sub, label, cls, act, id, href) {
    return '<div class="project-row"><div class="project-main"><div class="project-name">' + esc(title) + '</div><div class="project-sub"><span class="badge ' + cls + '">' + esc(label) + "</span>" + esc(sub) + "</div></div>" +
      '<div class="project-actions">' + (href ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="' + attr(href) + '">View</a>' : "") +
      (act ? '<button class="btn btn-ghost btn-sm" data-post="' + attr(id) + '">Edit</button>' : "") + "</div></div>";
  }

  $("blogList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-post]");
    if (b) openPost(b.getAttribute("data-post"));
  });
  $("newPostBtn").addEventListener("click", function () { openPost(null); });
  $("blogBack").addEventListener("click", function () { P.blog.show(); });

  function openPost(id) {
    var p = id ? blog.posts.filter(function (x) { return x.id === id; })[0] : null;
    blog.editing = p ? p.id : null;
    $("blogEditTitle").textContent = p ? "Edit post" : "New post";
    $("bTitle").value = p ? p.title : "";
    $("bSlug").value = p ? p.slug : "";
    $("bSlug").dataset.dirty = p ? "1" : "";
    $("bCategory").value = p ? p.category : "Design";
    $("bDate").value = p ? p.publish_on : todayUTC();
    $("bStatus").value = p ? p.status : "draft";
    $("bDescription").value = p ? p.description : "";
    $("bBody").value = p ? p.body_md : "";
    $("blogError").hidden = true;
    $("blogStatusMsg").textContent = "";
    $("blogPublishNow").hidden = !p;
    $("blogPause").hidden = !p;
    $("blogDelete").hidden = !p;
    countDesc();
    $("blogListView").hidden = true;
    $("blogEditView").hidden = false;
    window.scrollTo(0, 0);
  }
  function countDesc() {
    var n = $("bDescription").value.length;
    $("bDescCount").textContent = "(" + n + " characters" + (n > 160 ? " — Google may cut it short" : "") + ")";
  }
  $("bDescription").addEventListener("input", countDesc);
  $("bTitle").addEventListener("input", function () { if (!$("bSlug").dataset.dirty) $("bSlug").value = A.slugify($("bTitle").value); });
  $("bSlug").addEventListener("input", function () { this.dataset.dirty = "1"; });

  function savePost(overrides) {
    var err = $("blogError");
    err.hidden = true;
    var post = {
      title: $("bTitle").value.trim(),
      slug: A.slugify($("bSlug").value || $("bTitle").value),
      category: $("bCategory").value.trim() || "Design",
      publish_on: $("bDate").value,
      status: $("bStatus").value,
      description: $("bDescription").value.trim(),
      body_md: $("bBody").value.trim(),
      updated_at: new Date().toISOString()
    };
    Object.assign(post, overrides || {});
    var fail = function (msg) { err.textContent = msg; err.hidden = false; };
    if (!post.title) return fail("Add a title.");
    if (!post.description) return fail("Add a short description for Google.");
    if (!post.publish_on) return fail("Choose a publish date.");
    if (post.status === "ready" && post.body_md.length < 200) return fail("The post is too short to publish. Write the full post first, or keep it as a draft.");
    $("blogSave").disabled = true;
    var req = blog.editing
      ? sb().from("blog_posts").update(post).eq("id", blog.editing).select().single()
      : sb().from("blog_posts").insert(post).select().single();
    req.then(function (res) {
      $("blogSave").disabled = false;
      if (res.error) {
        fail(/duplicate|unique/i.test(res.error.message) ? "Another post already uses that web address. Change the slug." : "Could not save: " + res.error.message);
        return;
      }
      blog.editing = (res.data && res.data.id) || blog.editing;
      $("bStatus").value = post.status;
      $("bDate").value = post.publish_on;
      $("blogPublishNow").hidden = $("blogPause").hidden = $("blogDelete").hidden = false;
      $("blogEditTitle").textContent = "Edit post";
      $("blogStatusMsg").textContent = post.status === "ready"
        ? (post.publish_on <= todayUTC() ? "Saved ✓ It appears on the blog within about an hour." : "Saved ✓ It will publish on " + post.publish_on + ".")
        : "Saved as a draft ✓";
      A.log(post.status === "ready" ? "Saved blog post (ready)" : "Saved blog draft", post.title);
      if (res.data && res.data.id) blog.posts = blog.posts.filter(function (x) { return x.id !== res.data.id; }).concat([res.data]);
    });
  }
  $("blogForm").addEventListener("submit", function (e) { e.preventDefault(); savePost(); });
  $("blogPublishNow").addEventListener("click", function () {
    $("bDate").value = todayUTC();
    $("bStatus").value = "ready";
    savePost();
  });
  $("blogPause").addEventListener("click", function () {
    $("bStatus").value = "draft";
    savePost();
  });
  $("blogDelete").addEventListener("click", function () {
    if (!blog.editing || !confirm("Delete this post? If it is already live it will be removed from the blog at the next update.")) return;
    sb().from("blog_posts").delete().eq("id", blog.editing).then(function (res) {
      if (res.error) { alert("Could not delete: " + res.error.message); return; }
      A.log("Deleted blog post", $("bTitle").value);
      P.blog.show();
    });
  });
})();
