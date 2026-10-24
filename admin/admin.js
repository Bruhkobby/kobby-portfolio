/* ============================================================
   KOBBY — Portfolio CMS
   admin.js — authentication + project management dashboard
   ============================================================ */

(function () {
  "use strict";

  var page = document.body.getAttribute("data-admin");
  var notConfiguredEl = document.getElementById("notConfigured");

  /* ============================================================
     GUARD: Supabase must be configured
     ============================================================ */
  // Remember (in this browser only) that this is the site owner, so the
  // owner's own visits are not counted in the Stats tab.
  function markOwner() {
    try { localStorage.setItem("kobbyOwner", "1"); } catch (e) {}
  }

  function requireSupabase() {
    if (!(window.sb && window.SUPABASE_CONFIGURED)) {
      if (notConfiguredEl) notConfiguredEl.hidden = false;
      return false;
    }
    return true;
  }

  /* ============================================================
     LOGIN PAGE
     ============================================================ */
  function initLogin() {
    if (!requireSupabase()) return;

    var form = document.getElementById("loginForm");
    var errorBox = document.getElementById("loginError");
    var btn = document.getElementById("loginBtn");
    var mfaForm = document.getElementById("mfaForm");
    var mfaError = document.getElementById("mfaError");
    var mfaBtn = document.getElementById("mfaBtn");

    // After 5 wrong passwords in a row, the button pauses for a minute (it grows each time).
    // The real protection is on the server; this just stops a person (or a script on this page) hammering it.
    var LOCK_KEY = "kobbyLoginLock";
    function lockState() {
      try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}") || {}; } catch (e) { return {}; }
    }
    function saveLock(v) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch (e) {} }
    function waitSeconds() {
      var st = lockState();
      return st.until && st.until > Date.now() ? Math.ceil((st.until - Date.now()) / 1000) : 0;
    }
    function recordFailure() {
      var st = lockState();
      st.fails = (st.fails || 0) + 1;
      if (st.fails % 5 === 0) st.until = Date.now() + Math.min(15, st.fails / 5) * 60 * 1000;
      saveLock(st);
    }

    function showMfa() {
      form.hidden = true;
      mfaForm.hidden = false;
      document.getElementById("mfaCode").value = "";
      document.getElementById("mfaCode").focus();
    }
    // Password was right. Does this account also need the 6-digit code?
    function continueAfterPassword() {
      return window.sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
        var d = r && r.data;
        if (d && d.nextLevel === "aal2" && d.currentLevel !== "aal2") { showMfa(); return; }
        markOwner();
        location.href = "dashboard.html";
      }, function () { markOwner(); location.href = "dashboard.html"; });
    }

    // Already signed in? Go on (and ask for the code first if two-step sign-in is on).
    window.sb.auth.getSession().then(function (res) {
      if (res.data && res.data.session) continueAfterPassword();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorBox.hidden = true;
      var wait = waitSeconds();
      if (wait) {
        errorBox.textContent = "Too many tries. Please wait " + wait + " seconds and try again.";
        errorBox.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = "Signing in…";

      var email = document.getElementById("email").value.trim();
      var password = document.getElementById("password").value;

      window.sb.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          saveLock({});
          return continueAfterPassword();
        })
        .catch(function (err) {
          recordFailure();
          errorBox.textContent = /rate|too many/i.test((err && err.message) || "")
            ? "Too many tries. Please wait a few minutes and try again."
            : "Sign in failed. Check your email and password.";
          errorBox.hidden = false;
          btn.disabled = false;
          btn.textContent = "Sign in";
        });
    });

    mfaForm.addEventListener("submit", function (e) {
      e.preventDefault();
      mfaError.hidden = true;
      var code = document.getElementById("mfaCode").value.replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) { mfaError.textContent = "Enter the 6 digits from your authenticator app."; mfaError.hidden = false; return; }
      mfaBtn.disabled = true;
      var factorId = null;
      window.sb.auth.mfa.listFactors().then(function (r) {
        if (r.error) throw r.error;
        var f = ((r.data && r.data.totp) || []).filter(function (x) { return x.status === "verified"; })[0];
        if (!f) throw new Error("No authenticator found for this account.");
        factorId = f.id;
        return window.sb.auth.mfa.challenge({ factorId: factorId });
      }).then(function (c) {
        if (c.error) throw c.error;
        return window.sb.auth.mfa.verify({ factorId: factorId, challengeId: c.data.id, code: code });
      }).then(function (v) {
        if (v.error) throw v.error;
        markOwner();
        location.href = "dashboard.html";
      }).catch(function (err) {
        mfaBtn.disabled = false;
        mfaError.textContent = /invalid|expired|code/i.test((err && err.message) || "") ? "That code didn't work. Check the app and try the new code." : ((err && err.message) || "Could not verify the code.");
        mfaError.hidden = false;
      });
    });
    document.getElementById("mfaCancel").addEventListener("click", function () {
      window.sb.auth.signOut().then(function () { location.reload(); }, function () { location.reload(); });
    });
  }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  var state = {
    projects: [],
    editingId: null,   // null = new project
    editingImages: [], // images of the project being edited
    divisionFilter: "all",
    messages: [],
    inboxFilter: "all",
    inboxSearch: ""
  };

  /* ---------- Divisions (shared list in js/config.js) ---------- */
  var DIVISIONS = (window.DIVISIONS && window.DIVISIONS.length) ? window.DIVISIONS : [
    { id: "all-work", name: "All projects", categories: [] }
  ];

  function divisionOf(category) {
    var c = String(category || "Other").toLowerCase();
    for (var i = 0; i < DIVISIONS.length; i++) {
      if (DIVISIONS[i].categories.some(function (x) { return x.toLowerCase() === c; })) return DIVISIONS[i];
    }
    return DIVISIONS[DIVISIONS.length - 1];
  }

  // Fill the Category dropdown, grouped by division.
  function fillCategorySelect() {
    var sel = document.getElementById("fCategory");
    if (!sel || !(window.DIVISIONS && window.DIVISIONS.length)) return;
    sel.innerHTML = DIVISIONS.map(function (d) {
      return '<optgroup label="' + escapeAttr(d.name) + '">' +
        d.categories.map(function (c) { return "<option>" + escapeHTML(c) + "</option>"; }).join("") +
        "</optgroup>";
    }).join("");
  }

  // Make sure an older/unknown category still shows up when editing.
  function setCategoryValue(value) {
    var sel = $("fCategory");
    var found = Array.prototype.some.call(sel.options, function (o) { return o.value === value; });
    if (value && !found) {
      var opt = document.createElement("option");
      opt.textContent = value;
      sel.insertBefore(opt, sel.firstChild);
    }
    sel.value = value || "Other";
  }

  function $(id) { return document.getElementById(id); }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".division-tab");
    if (!t) return;
    state.divisionFilter = t.getAttribute("data-division");
    renderProjectList();
  });

  // Signs you out after 30 minutes with no activity, so a forgotten open tab can't be misused.
  function startIdleTimer() {
    var LIMIT = 30 * 60 * 1000, timer = null;
    function expire() {
      window.sb.auth.signOut().then(function () { location.href = "index.html"; }, function () { location.href = "index.html"; });
    }
    function reset() { clearTimeout(timer); timer = setTimeout(expire, LIMIT); }
    ["click", "keydown", "touchstart", "scroll", "mousemove"].forEach(function (ev) {
      document.addEventListener(ev, reset, { passive: true });
    });
    reset();
  }

  function initDashboard() {
    fillCategorySelect();
    if (!requireSupabase()) {
      $("projectList").innerHTML = '<div class="card"><p class="muted">Connect Supabase first (see the yellow note above) — then your projects will appear here.</p></div>';
      $("projectCount").textContent = "0";
      return;
    }

    // ---- Auth guard: no session → back to login ----
    window.sb.auth.getSession().then(function (res) {
      if (!(res.data && res.data.session)) {
        location.href = "index.html";
        return;
      }
      var user = res.data.session.user;
      var emailEl = $("userEmail");
      if (emailEl) emailEl.textContent = user.email || "";
      var accEmail = $("accountEmail");
      if (accEmail) accEmail.textContent = user.email || "";
      // Only the site owner may use the dashboard. (The database enforces this too;
      // this just gives anyone else a clear exit instead of an empty screen.)
      // If two-step sign-in is on and the code hasn't been entered yet, go back and ask for it.
      window.sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
        var d = a && a.data;
        if (d && d.nextLevel === "aal2" && d.currentLevel !== "aal2") { location.href = "index.html"; return null; }
        return window.sb.rpc("is_admin");
      }, function () { return window.sb.rpc("is_admin"); }).then(function (r) {
        if (!r) return;
        if (!r.error && r.data === false) {
          window.sb.auth.signOut().then(function () { location.href = "index.html"; });
          return;
        }
        markOwner();
        startIdleTimer();
        loadProjects().then(function () {
          if (window.AdminPanels && window.AdminPanels.overview) window.AdminPanels.overview.show();
        });
      });
    });

    // Signed out elsewhere → redirect
    window.sb.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") location.href = "index.html";
    });

    // ---- Topbar buttons ----
    $("logoutBtn").addEventListener("click", function () {
      window.sb.auth.signOut().then(function () { location.href = "index.html"; });
    });
    $("newProjectBtn").addEventListener("click", function () { openEditor(null); });
    $("backToList").addEventListener("click", function () { showList(); });

    // ---- Editor form ----
    $("projectForm").addEventListener("submit", saveProject);
    $("fTitle").addEventListener("input", function () {
      // Auto-generate the slug from the title (only while it's untouched)
      var slugField = $("fSlug");
      if (!slugField.dataset.dirty) slugField.value = slugify($("fTitle").value);
    });
    $("fSlug").addEventListener("input", function () { this.dataset.dirty = "1"; });

    // ---- Image uploads ----
    $("addImagesBtn").addEventListener("click", function () { $("imageInput").click(); });
    $("imageInput").addEventListener("change", uploadImages);
    // ---- Video upload ----
    $("addVideoBtn").addEventListener("click", function () { $("videoInput").click(); });
    $("videoInput").addEventListener("change", uploadVideo);

    // ---- Tabs (Projects / Inbox / Account) ----
    var tabSections = ["overviewTab", "projectsTab", "inboxTab", "siteTab", "statsTab", "blogTab", "accountTab"];
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".tab-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        var active = btn.getAttribute("data-tab");
        tabSections.forEach(function (id) {
          var section = $(id);
          if (section) section.hidden = id !== active + "Tab";
        });
        if (active === "inbox") loadInbox();
        if (window.AdminPanels && window.AdminPanels[active]) window.AdminPanels[active].show();
        if (active === "account") loadActivityLog();
      });
    });

    // ---- Account tab ----
    $("passwordForm").addEventListener("submit", changePassword);
    initMfaCard();
    $("exportBtn").addEventListener("click", exportBackup);
    $("signOutAllBtn").addEventListener("click", signOutAll);

    // ---- Inbox ----
    loadInboxCount();
    $("inboxSearch").addEventListener("input", function () { state.inboxSearch = this.value.trim().toLowerCase(); renderInbox(); });
    $("inboxFilters").addEventListener("click", function (e) {
      var b = e.target.closest("[data-filter]");
      if (!b) return;
      state.inboxFilter = b.getAttribute("data-filter");
      renderInbox();
    });

    // ---- Project editor extras ----
    $("previewBtn").addEventListener("click", function () { if (state.editingId) previewProject(currentEditing()); });
    $("copyLinkBtn").addEventListener("click", function () { if (state.editingId) copyProjectLink(currentEditing(), $("copyLinkBtn")); });
    $("templateBtn").addEventListener("click", function () { insertTemplate(); updateStoryMeter(); });
    ["fBrief", "fObjective", "fCreative", "fProcess", "fResult"].forEach(function (id) {
      $(id).addEventListener("input", updateStoryMeter);
    });
    $("clearScheduleBtn").addEventListener("click", function () { $("fPublishAt").value = ""; });
  }

  function currentEditing() {
    return state.projects.find(function (x) { return x.id === state.editingId; }) || { slug: slugify($("fSlug").value || $("fTitle").value) };
  }

  /* ============================================================
     PROJECT LIST
     ============================================================ */
  function loadProjects() {
    return window.sb
      .from("projects")
      .select("*, project_images(id, image_url, image_order, alt_text)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        state.projects = res.data || [];
        renderProjectList();
        return state.projects;
      })
      .catch(function (err) {
        $("projectList").innerHTML = '<p class="muted">Could not load projects: ' + escapeHTML(err.message) + "</p>";
        return [];
      });
  }

  function coverOf(p) {
    var imgs = (p.project_images || []).slice().sort(function (a, b) { return (a.image_order || 0) - (b.image_order || 0); });
    return imgs.length ? imgs[0].image_url : "";
  }

  function renderDivisionTabs() {
    var tabs = $("divisionTabs");
    if (!tabs) return;
    var counts = {};
    state.projects.forEach(function (p) { var id = divisionOf(p.category).id; counts[id] = (counts[id] || 0) + 1; });
    var items = [{ id: "all", name: "All", count: state.projects.length }].concat(
      DIVISIONS.filter(function (d) { return counts[d.id]; }).map(function (d) { return { id: d.id, name: d.name, count: counts[d.id] }; })
    );
    if (!items.some(function (t) { return t.id === state.divisionFilter; })) state.divisionFilter = "all";
    tabs.innerHTML = items.map(function (t) {
      return '<button type="button" class="division-tab' + (t.id === state.divisionFilter ? " active" : "") + '" data-division="' + escapeAttr(t.id) + '">' +
        escapeHTML(t.name) + ' <span class="division-tab-count">' + t.count + "</span></button>";
    }).join("");
  }

  function isScheduled(p) {
    return Boolean(p.published && p.publish_at && new Date(p.publish_at).getTime() > Date.now());
  }
  function shortDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function renderProjectList() {
    var wrap = $("projectList");
    $("projectCount").textContent = state.projects.length;
    var pub = state.projects.filter(function (p) { return p.published; }).length;
    var sched = state.projects.filter(isScheduled).length;
    var statsEl = $("statsLine");
    if (statsEl) {
      statsEl.textContent = state.projects.length + " total · " + pub + " published · " + (state.projects.length - pub) + " drafts" + (sched ? " · " + sched + " scheduled" : "");
    }
    renderDivisionTabs();

    if (!state.projects.length) {
      wrap.innerHTML = '<div class="card"><p class="muted">No projects yet. Click “+ New Project” to create your first one.</p></div>';
      return;
    }

    wrap.innerHTML = "";
    DIVISIONS.forEach(function (d) {
      if (state.divisionFilter !== "all" && state.divisionFilter !== d.id) return;
      var group = state.projects.filter(function (p) { return divisionOf(p.category) === d; });
      if (!group.length) return;

      var head = document.createElement("div");
      head.className = "division-head";
      head.innerHTML = "<span>" + escapeHTML(d.name) + '</span><span class="count-badge">' + group.length + "</span>";
      wrap.appendChild(head);

      group.forEach(function (p, gi) {
        var row = document.createElement("div");
        row.className = "project-row";
        row.innerHTML =
          '<img class="project-thumb" src="' + escapeAttr(coverOf(p) || "data:image/gif;base64,R0lGODlhAQABAAAAACw=") + '" alt="" />' +
          '<div class="project-main">' +
            '<div class="project-name">' + escapeHTML(p.title) + "</div>" +
            '<div class="project-sub">' +
              (isScheduled(p)
                ? '<span class="badge badge-scheduled">Goes live ' + escapeHTML(shortDate(p.publish_at)) + "</span>"
                : '<span class="badge ' + (p.published ? "badge-published" : "badge-draft") + '">' + (p.published ? "Published" : "Draft") + "</span>") +
              (coverOf(p) ? "" : '<span class="badge badge-warn">No cover image</span>') +
              (p.featured ? '<span class="badge badge-featured">Featured</span>' : "") +
              escapeHTML(p.category) + (p.year ? " · " + escapeHTML(p.year) : "") +
            "</div>" +
          "</div>" +
          '<div class="project-actions">' +
            '<button class="btn btn-ghost btn-sm" data-act="up" title="Move up"' + (gi === 0 ? " disabled" : "") + ">↑</button>" +
            '<button class="btn btn-ghost btn-sm" data-act="down" title="Move down"' + (gi === group.length - 1 ? " disabled" : "") + ">↓</button>" +
            '<label class="toggle' + (p.published ? " on" : "") + '" title="Publish / unpublish"><input type="checkbox" data-act="publish" style="display:none"' + (p.published ? " checked" : "") + " /></label>" +
            '<button class="btn btn-ghost btn-sm" data-act="preview" title="See it as visitors will">Preview</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="link" title="Copy the public link">Link</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="dup" title="Make a copy as a draft">Copy</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="edit">Edit</button>' +
            '<button class="btn btn-danger btn-sm" data-act="delete">Delete</button>' +
          "</div>";

        row.addEventListener("click", function (e) {
          var act = e.target.closest("[data-act]");
          if (!act) return;
          var action = act.getAttribute("data-act");
          if (action === "edit") openEditor(p.id);
          else if (action === "publish") togglePublished(p);
          else if (action === "delete") deleteProject(p);
          else if (action === "preview") previewProject(p);
          else if (action === "link") copyProjectLink(p, act);
          else if (action === "dup") duplicateProject(p);
          else if (action === "up") moveProject(group, gi, -1);
          else if (action === "down") moveProject(group, gi, 1);
        });
        wrap.appendChild(row);
      });
    });
  }

  function togglePublished(p) {
    window.sb.from("projects")
      .update({ published: !p.published, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .then(function (res) {
        if (res.error) throw res.error;
        p.published = !p.published;
        logActivity(p.published ? "Published project" : "Unpublished project", p.title);
        renderProjectList();
      })
      .catch(function (err) { alert("Could not update: " + err.message); });
  }

  // Swap a project with its neighbour inside the same division, then
  // renumber the whole list 1..n so the public order always matches.
  function moveProject(group, gi, dir) {
    var other = gi + dir;
    if (other < 0 || other >= group.length) return;
    var a = group[gi], b = group[other];
    var order = state.projects.slice();
    var ia = order.indexOf(a), ib = order.indexOf(b);
    order[ia] = b;
    order[ib] = a;
    var jobs = [];
    order.forEach(function (p, i) {
      var want = i + 1;
      if (p.sort_order !== want) jobs.push(window.sb.from("projects").update({ sort_order: want }).eq("id", p.id));
    });
    Promise.all(jobs).then(function (results) {
      if (results.some(function (r) { return r.error; })) { alert("Could not reorder."); }
      loadProjects();
    });
  }

  function deleteProject(p) {
    if (!confirm('Delete "' + p.title + '"? This also deletes its images. This cannot be undone.')) return;
    // Best effort: remove storage files under the project folder first.
    window.sb.storage.from(window.SUPABASE_BUCKET).list(p.id)
      .then(function (res) {
        var files = (res.data || []).map(function (f) { return p.id + "/" + f.name; });
        return files.length ? window.sb.storage.from(window.SUPABASE_BUCKET).remove(files) : null;
      })
      .then(function () {
        return window.sb.from("projects").delete().eq("id", p.id);
      })
      .then(function (res) {
        if (res.error) throw res.error;
        logActivity("Deleted project", p.title);
        loadProjects();
      })
      .catch(function (err) { alert("Could not delete: " + err.message); });
  }

  /* ============================================================
     PROJECT EXTRAS: preview, public link, duplicate, templates, log
     ============================================================ */
  function publicUrl(p, preview) {
    return new URL("../project.html?slug=" + encodeURIComponent(p.slug) + (preview ? "&preview=1" : ""), location.href).href;
  }
  function previewProject(p) {
    window.open(publicUrl(p, true), "_blank", "noopener");
  }
  function copyProjectLink(p, btn) {
    var url = publicUrl(p, false);
    var old = btn.textContent;
    var done = function (msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = old; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done("Copied ✓"); }, function () { window.prompt("Copy this link:", url); });
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  function duplicateProject(p) {
    if (!confirm('Make a draft copy of "' + p.title + '"? The text is copied; add the images to the copy yourself.')) return;
    var base = p.slug + "-copy", slug = base, n = 2;
    while (state.projects.some(function (x) { return x.slug === slug; })) slug = base + "-" + n++;
    var nextOrder = state.projects.reduce(function (m, x) { return Math.max(m, x.sort_order || 0); }, 0) + 1;
    window.sb.from("projects").insert({
      title: p.title + " (copy)", slug: slug, category: p.category, client: p.client, year: p.year,
      brief: p.brief, objective: p.objective, creative_direction: p.creative_direction, process: p.process,
      result: p.result, video_url: p.video_url, featured: false, published: false, sort_order: nextOrder,
      ...("services" in p ? { services: p.services, tools: p.tools, duration: p.duration, highlights: p.highlights, client_quote: p.client_quote, client_quote_by: p.client_quote_by } : {})
    }).select().single().then(function (res) {
      if (res.error) throw res.error;
      logActivity("Duplicated project", p.title);
      return loadProjects().then(function () { openEditor(res.data.id); });
    }).catch(function (err) { alert("Could not copy: " + err.message); });
  }

  // Starter text for common project types. Only fills boxes that are empty,
  // and the [square brackets] are reminders for you to replace.
  var TEMPLATES = {
    brand: { brief: "[Client name] needed a brand identity that [what they wanted]. They had [what they started with].", objective: "Create a recognisable identity that [goal], and works across [where it is used].", creative_direction: "I built the look around [idea]. Colours: [colours]. Type: [fonts].", process: "Research and moodboard, three logo directions, one refined route, then the full set of files and guidelines.", result: "[Client] now has a complete identity: [what was delivered]. [Result so far.]" },
    flyer: { brief: "[Client/event] needed a flyer for [event or offer] on [date].", objective: "Get people to notice it quickly and know [what to do next].", creative_direction: "A bold layout with [image/type idea] so the key message reads at a glance. Colours: [colours].", process: "Quick sketches, a first layout, then changes based on the client's feedback.", result: "Delivered print-ready and social versions. [Response or result.]" },
    video: { brief: "[Client] had [raw footage] and wanted a [type of video] for [where it will be shown].", objective: "Tell the story in [length] and keep people watching to the end.", creative_direction: "Pace: [fast/calm]. Colour grade: [look]. Music and sound: [choice]. Text and motion: [style].", process: "Sorted and selected footage, rough cut, music and sound, colour and graphics, then final export.", result: "Final video delivered in [formats]. [Views or reaction.]" },
    social: { brief: "[Client] needed a consistent set of posts for [platform] to [goal].", objective: "Make the page look professional and recognisable in the feed.", creative_direction: "A repeatable template with [colours/fonts/layout idea] so every post feels like the same brand.", process: "Designed a master template, adapted it for each post type, then delivered editable files.", result: "[Number] designs delivered. [Result so far.]" }
  };
  function insertTemplate() {
    var key = $("templateSelect").value;
    var t = TEMPLATES[key];
    if (!t) return;
    var map = { brief: "fBrief", objective: "fObjective", creative_direction: "fCreative", process: "fProcess", result: "fResult" };
    var filled = 0;
    Object.keys(map).forEach(function (k) {
      var box = $(map[k]);
      if (!box.value.trim()) { box.value = t[k]; filled++; }
    });
    $("templateStatus").textContent = filled
      ? "Added starter text to " + filled + " empty box" + (filled > 1 ? "es" : "") + ". Replace everything in [square brackets]."
      : "All boxes already have text, so nothing was changed.";
  }

  // Quietly records what you did (shown in Overview and Account). Never blocks anything.
  function logActivity(action, detail) {
    if (!(window.sb && window.SUPABASE_CONFIGURED)) return;
    try {
      window.sb.from("activity_log").insert({ action: action, detail: detail ? String(detail).slice(0, 280) : null })
        .then(function () {}, function () {});
    } catch (e) {}
  }

  function loadActivityLog() {
    var box = $("activityFull");
    if (!box) return;
    window.sb.from("activity_log").select("*").order("created_at", { ascending: false }).limit(50).then(function (res) {
      if (res.error) { box.innerHTML = '<li class="muted">Could not load the log.</li>'; return; }
      var rows = res.data || [];
      box.innerHTML = rows.length ? rows.map(function (r) {
        return "<li><span>" + escapeHTML(r.action) + (r.detail ? " — " + escapeHTML(r.detail) : "") + '</span><time class="muted small">' + escapeHTML(niceTime(r.created_at)) + "</time></li>";
      }).join("") : '<li class="muted">Nothing recorded yet. Your changes will appear here.</li>';
    });
  }

  function niceTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  /* ============================================================
     EDITOR
     ============================================================ */
  function showList() {
    $("editorView").hidden = true;
    $("listView").hidden = false;
    state.editingId = null;
    loadProjects();
  }

  function openEditor(projectId) {
    state.editingId = projectId;
    state.editingImages = [];

    var form = $("projectForm");
    form.reset();
    delete $("fSlug").dataset.dirty;
    $("formError").hidden = true;
    $("saveStatus").textContent = "";
    $("uploadStatus").textContent = "";
    $("imageInput").value = "";
    $("templateStatus").textContent = "";
    $("templateSelect").value = "";
    $("fPublishAt").value = "";
    $("storyMeter").textContent = "";
    $("previewBtn").hidden = !projectId;
    $("copyLinkBtn").hidden = !projectId;

    if (projectId) {
      var p = state.projects.find(function (x) { return x.id === projectId; });
      if (!p) { showList(); return; }
      $("editorTitle").textContent = "Edit Project";
      $("fTitle").value = p.title || "";
      $("fSlug").value = p.slug || "";
      $("fSlug").dataset.dirty = "1";
      setCategoryValue(p.category);
      $("fClient").value = p.client || "";
      $("fYear").value = p.year || "";
      $("fBrief").value = p.brief || "";
      $("fObjective").value = p.objective || "";
      $("fCreative").value = p.creative_direction || "";
      $("fProcess").value = p.process || "";
      $("fResult").value = p.result || "";
      $("fVideo").value = p.video_url || "";
      $("fServices").value = p.services || "";
      $("fTools").value = p.tools || "";
      $("fDuration").value = p.duration || "";
      $("fHighlights").value = p.highlights || "";
      $("fQuote").value = p.client_quote || "";
      $("fQuoteBy").value = p.client_quote_by || "";
      $("fFeatured").checked = Boolean(p.featured);
      $("fPublished").checked = Boolean(p.published);
      $("fPublishAt").value = p.publish_at ? toLocalInput(p.publish_at) : "";
      loadEditorImages(projectId);
    } else {
      $("editorTitle").textContent = "New Project";
      $("fYear").value = String(new Date().getFullYear());
      $("fVideo").value = "";
      $("imagesHint").textContent = "Save the project first, then upload images.";
      $("addImagesBtn").disabled = true;
      $("addVideoBtn").disabled = true;
      $("imagesList").innerHTML = '<p class="muted small">Save the project first to upload images.</p>';
    }

    $("listView").hidden = true;
    $("editorView").hidden = false;
    updateStoryMeter();
    window.scrollTo(0, 0);
  }

  // Tells you how complete the case study is, so thin projects are easy to spot.
  function updateStoryMeter() {
    var ids = ["fBrief", "fObjective", "fCreative", "fProcess", "fResult"];
    var done = ids.filter(function (id) { return $(id).value.trim().length > 20; }).length;
    var msg = done + " of 5 story sections written";
    if (done === 5) msg += " — a full case study ✓";
    else if (done < 3) msg += " — projects with at least 3 sections read as real case studies";
    $("storyMeter").textContent = msg;
  }

  // <input type="datetime-local"> wants local time without a zone
  function toLocalInput(iso) {
    var d = new Date(iso);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function saveProject(e) {
    e.preventDefault();
    var errorBox = $("formError");
    errorBox.hidden = true;

    var title = $("fTitle").value.trim();
    if (!title) { showError(errorBox, "Title is required."); return; }

    var slug = slugify($("fSlug").value || title);
    var payload = {
      title: title,
      slug: slug,
      category: $("fCategory").value,
      client: $("fClient").value.trim(),
      year: $("fYear").value.trim(),
      brief: $("fBrief").value.trim(),
      objective: $("fObjective").value.trim(),
      creative_direction: $("fCreative").value.trim(),
      process: $("fProcess").value.trim(),
      result: $("fResult").value.trim(),
      video_url: $("fVideo").value.trim(),
      featured: $("fFeatured").checked,
      published: $("fPublished").checked,
      publish_at: $("fPublishAt").value ? new Date($("fPublishAt").value).toISOString() : null,
      updated_at: new Date().toISOString()
    };
    var extras = {
      services: $("fServices").value.trim(),
      tools: $("fTools").value.trim(),
      duration: $("fDuration").value.trim(),
      highlights: $("fHighlights").value.trim(),
      client_quote: $("fQuote").value.trim(),
      client_quote_by: $("fQuoteBy").value.trim()
    };
    var hasExtras = Object.keys(extras).some(function (k) { return extras[k]; });
    // Only send the new fields once the database has them (see sql/upgrade-case-studies.sql).
    var dbHasExtras = state.projects.length ? ("services" in state.projects[0]) : true;
    if (dbHasExtras) Object.assign(payload, extras);
    else if (hasExtras) {
      showError(errorBox, "The case-study details need a one-time database update first. Run the new SQL file (upgrade-case-studies.sql), then save again.");
      return;
    }

    // Don't publish starter text that still has [placeholders] in it.
    if (payload.published) {
      var leftover = [payload.brief, payload.objective, payload.creative_direction, payload.process, payload.result]
        .some(function (t) { return /\[[^\]]{2,}\]/.test(t || ""); });
      if (leftover && !confirm("Some text still has [square brackets] from the starter text. Publish anyway?")) return;
    }

    var btn = $("saveBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    var done = function (id, isNew) {
      btn.disabled = false;
      btn.textContent = "Save Project";
      $("saveStatus").textContent = "Saved ✓";
      $("previewBtn").hidden = false;
      $("copyLinkBtn").hidden = false;
      logActivity(isNew ? "Created project" : "Edited project", title);
      state.editingId = id;
      $("editorTitle").textContent = "Edit Project";
      $("addImagesBtn").disabled = false;
      $("addVideoBtn").disabled = false;
      $("imagesHint").textContent = "Upload the cover first — the first image is used as the project cover.";
      if (isNew) {
        // Refresh stored project list so "Back to list" shows the new item.
        state.projects.push(Object.assign({ id: id }, payload, { project_images: [] }));
      }
    };
    var fail = function (err) {
      btn.disabled = false;
      btn.textContent = "Save Project";
      showError(errorBox, err.message || "Could not save the project.");
    };

    if (state.editingId) {
      window.sb.from("projects").update(payload).eq("id", state.editingId)
        .then(function (res) { if (res.error) throw res.error; done(state.editingId, false); })
        .catch(fail);
    } else {
      // New project: find the next sort_order, then insert.
      var nextOrder = state.projects.reduce(function (max, p) { return Math.max(max, p.sort_order || 0); }, 0) + 1;
      payload.sort_order = nextOrder;
      window.sb.from("projects").insert(payload).select().single()
        .then(function (res) {
          if (res.error) throw res.error;
          done(res.data.id, true);
        })
        .catch(fail);
    }
  }

  function showError(box, msg) {
    box.textContent = msg;
    box.hidden = false;
  }

  /* ============================================================
     IMAGE MANAGEMENT
     ============================================================ */
  function loadEditorImages(projectId) {
    $("imagesList").innerHTML = '<p class="muted small">Loading images…</p>';
    $("addImagesBtn").disabled = false;
    $("addVideoBtn").disabled = false;
    window.sb.from("project_images")
      .select("*")
      .eq("project_id", projectId)
      .order("image_order", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        state.editingImages = res.data || [];
        renderEditorImages();
      })
      .catch(function (err) {
        $("imagesList").innerHTML = '<p class="muted small">Could not load images: ' + escapeHTML(err.message) + "</p>";
      });
  }

  function renderEditorImages() {
    var list = $("imagesList");
    if (!state.editingImages.length) {
      list.innerHTML = '<p class="muted small">No images yet. Upload your cover image first.</p>';
      return;
    }
    list.innerHTML = "";
    state.editingImages.forEach(function (img, i) {
      var item = document.createElement("div");
      item.className = "image-item";
      item.innerHTML =
        '<img src="' + escapeAttr(img.image_url) + '" alt="" />' +
        '<span class="img-label">' + escapeHTML(fileNameOf(img.image_url)) + "</span>" +
        (i === 0 ? '<span class="cover-tag">Cover</span>' : "") +
        '<button class="icon-btn" data-act="up" title="Move up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button class="icon-btn" data-act="down" title="Move down"' + (i === state.editingImages.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<button class="icon-btn danger" data-act="del" title="Delete image">×</button>' +
        '<input class="alt-input" type="text" maxlength="300" placeholder="Describe this image (helps Google and screen readers)" value="' + escapeAttr(img.alt_text || "") + '" aria-label="Image description" />';

      var altBox = item.querySelector(".alt-input");
      altBox.addEventListener("change", function () {
        var v = altBox.value.trim();
        window.sb.from("project_images").update({ alt_text: v || null }).eq("id", img.id).then(function (res) {
          if (res.error) { alert("Could not save the description: " + res.error.message); return; }
          img.alt_text = v;
          altBox.classList.add("saved");
          setTimeout(function () { altBox.classList.remove("saved"); }, 1200);
        });
      });

      item.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-act]");
        if (!btn) return;
        var act = btn.getAttribute("data-act");
        if (act === "del") deleteImage(img, i);
        else if (act === "up") moveImage(i, -1);
        else if (act === "down") moveImage(i, 1);
      });
      list.appendChild(item);
    });
  }

  function uploadImages(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length || !state.editingId) return;
    var status = $("uploadStatus");
    var nextOrder = state.editingImages.reduce(function (m, im) { return Math.max(m, im.image_order || 0); }, -1) + 1;
    var uploaded = 0;

    var saved = 0;
    files.forEach(function (original, idx) {
      status.textContent = "Preparing " + (idx + 1) + " / " + files.length + "…";
      var optimise = $("optimiseImages").checked ? optimiseImage(original) : Promise.resolve(original);
      var file = original;
      optimise.then(function (f) {
        file = f;
        saved += Math.max(0, original.size - f.size);
        var ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        var path = state.editingId + "/" + Date.now() + "-" + idx + "-" + slugify(file.name.replace(/\.[^.]+$/, "")) + "." + ext;
        status.textContent = "Uploading " + (uploaded + 1) + " / " + files.length + "…";
        return window.sb.storage.from(window.SUPABASE_BUCKET).upload(path, file, { cacheControl: "31536000", upsert: false }).then(function (res) { res.__path = path; return res; });
      })
        .then(function (res) {
          var path = res.__path;
          if (res.error) throw res.error;
          var pub = window.sb.storage.from(window.SUPABASE_BUCKET).getPublicUrl(path);
          return window.sb.from("project_images").insert({
            project_id: state.editingId,
            image_url: pub.data.publicUrl,
            image_order: nextOrder + idx
          });
        })
        .then(function (res) {
          if (res.error) throw res.error;
          uploaded++;
          if (uploaded === files.length) {
            status.textContent = "Upload complete ✓" + (saved > 50000 ? " — images shrunk by " + Math.round(saved / 1024) + " KB so the site loads faster." : "");
            logActivity("Uploaded images", files.length + " to " + ((state.projects.find(function (x) { return x.id === state.editingId; }) || {}).title || "a project"));
            $("imageInput").value = "";
            loadEditorImages(state.editingId);
          }
        })
        .catch(function (err) {
          status.textContent = "Upload failed: " + err.message;
        });
    });
  }

  // Shrinks big photos (max 2400px on the long side, WebP) so pages load fast.
  // Falls back to the original file if anything goes wrong or it wouldn't be smaller.
  function optimiseImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var MAX = 2400, r = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      var w = Math.max(1, Math.round(bmp.width * r)), h = Math.max(1, Math.round(bmp.height * r));
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve) {
        c.toBlob(function (blob) {
          if (!blob || blob.type !== "image/webp" || (r === 1 && blob.size >= file.size * 0.95)) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" }));
        }, "image/webp", 0.86);
      });
    }).catch(function () { return file; });
  }

  function uploadVideo(e) {
    var file = (e.target.files || [])[0];
    if (!file || !state.editingId) return;
    var status = $("uploadStatus");
    var ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    var path = state.editingId + "/" + Date.now() + "-video." + ext;
    status.textContent = "Uploading video…";

    window.sb.storage.from(window.SUPABASE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false })
      .then(function (res) {
        if (res.error) throw res.error;
        var pub = window.sb.storage.from(window.SUPABASE_BUCKET).getPublicUrl(path);
        $("fVideo").value = pub.data.publicUrl;
        status.textContent = "Video uploaded ✓ — remember to click Save Project.";
        $("videoInput").value = "";
      })
      .catch(function (err) {
        status.textContent = "Video upload failed: " + err.message;
      });
  }

  function deleteImage(img, index) {
    if (!confirm("Delete this image?")) return;
    // Best effort storage cleanup, then remove the DB row.
    var pathPart = "/" + window.SUPABASE_BUCKET + "/";
    var idxUrl = img.image_url.indexOf(pathPart);
    var storagePath = idxUrl !== -1 ? img.image_url.substring(idxUrl + pathPart.length).split("?")[0] : null;

    var removeRow = function () {
      return window.sb.from("project_images").delete().eq("id", img.id);
    };
    var finish = function () {
      state.editingImages.splice(index, 1);
      renderEditorImages();
    };
    if (storagePath) {
      window.sb.storage.from(window.SUPABASE_BUCKET).remove([storagePath]).then(removeRow).then(finish)
        .catch(function () { removeRow().then(finish); });
    } else {
      removeRow().then(finish).catch(function (err) { alert("Could not delete: " + err.message); });
    }
  }

  function moveImage(index, dir) {
    var other = index + dir;
    if (other < 0 || other >= state.editingImages.length) return;
    var a = state.editingImages[index], b = state.editingImages[other];
    Promise.all([
      window.sb.from("project_images").update({ image_order: b.image_order }).eq("id", a.id),
      window.sb.from("project_images").update({ image_order: a.image_order }).eq("id", b.id)
    ]).then(function () {
      var tmp = a.image_order; a.image_order = b.image_order; b.image_order = tmp;
      var arr = state.editingImages;
      arr[index] = b; arr[other] = a;
      renderEditorImages();
    });
  }

  /* ============================================================
     INBOX (contact form messages)
     ============================================================ */
  function loadInboxCount() {
    if (!(window.sb && window.SUPABASE_CONFIGURED)) return;
    window.sb.from("messages")
      .select("id, read")
      .eq("read", false)
      .then(function (res) {
        if (res.error) return; // table may not exist yet — ignore quietly
        var badge = $("inboxCount");
        if (!badge) return;
        var unread = (res.data || []).length;
        badge.textContent = unread;
        badge.hidden = unread === 0;
      });
  }

  var STATUS_LABELS = { "new": "New", in_progress: "In progress", replied: "Replied", booked: "Booked", closed: "Closed" };

  function loadInbox() {
    var list = $("inboxList");
    if (!list) return;
    if (!(window.sb && window.SUPABASE_CONFIGURED)) {
      list.innerHTML = '<p class="muted">Connect Supabase first (see the README) — then contact-form messages will appear here.</p>';
      return;
    }
    return window.sb.from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        state.messages = res.data || [];
        renderInbox();
        loadInboxCount();
        return state.messages;
      })
      .catch(function (err) {
        list.innerHTML = '<p class="muted">Could not load messages: ' + escapeHTML(err.message) + "</p>";
        return [];
      });
  }

  function isOpenMessage(m) { return (m.status || "new") === "new" || m.status === "in_progress"; }

  function waDigits(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (d.charAt(0) === "0") d = "233" + d.slice(1);   // local Ghana number
    return d;
  }

  function renderInbox() {
    var list = $("inboxList");
    var all = state.messages;

    // filter chips with counts
    var counts = { all: all.length, open: all.filter(isOpenMessage).length };
    ["replied", "booked", "closed"].forEach(function (k) { counts[k] = all.filter(function (m) { return m.status === k; }).length; });
    var chips = [["all", "All"], ["open", "Needs a reply"], ["replied", "Replied"], ["booked", "Booked"], ["closed", "Closed"]];
    $("inboxFilters").innerHTML = chips.map(function (c) {
      return '<button type="button" class="division-tab' + (state.inboxFilter === c[0] ? " active" : "") + '" data-filter="' + c[0] + '">' +
        c[1] + ' <span class="division-tab-count">' + counts[c[0]] + "</span></button>";
    }).join("");

    var q = state.inboxSearch;
    var msgs = all.filter(function (m) {
      if (state.inboxFilter === "open" && !isOpenMessage(m)) return false;
      if (["replied", "booked", "closed"].indexOf(state.inboxFilter) !== -1 && m.status !== state.inboxFilter) return false;
      if (q) {
        var hay = [m.name, m.email, m.phone, m.message, m.note].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (!all.length) {
      list.innerHTML = '<div class="card"><p class="muted">No messages yet. When someone uses the contact form on your website, it will show up here.</p></div>';
      return;
    }
    if (!msgs.length) {
      list.innerHTML = '<div class="card"><p class="muted">No messages match this filter.</p></div>';
      return;
    }
    list.innerHTML = "";
    msgs.forEach(function (m) {
      var item = document.createElement("div");
      item.className = "card message-card" + (m.read ? "" : " message-unread");
      var date = m.created_at ? new Date(m.created_at) : null;
      var dateStr = date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) + " · " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
      var first = String(m.name || "").trim().split(/\s+/)[0] || "there";
      var mailto = "mailto:" + encodeURIComponent(m.email || "") + "?subject=" + encodeURIComponent("Re: your message to Kobby") +
        "&body=" + encodeURIComponent("Hi " + first + ",\n\nThanks for getting in touch.\n\n");
      var wa = m.phone ? "https://wa.me/" + waDigits(m.phone) + "?text=" + encodeURIComponent("Hi " + first + ", it's Kobby. Thanks for your message about your project.") : "";
      var status = m.status || "new";
      item.innerHTML =
        '<div class="message-head">' +
          '<div class="message-who">' +
            (m.read ? "" : '<span class="dot-new" title="Unread"></span>') +
            "<strong>" + escapeHTML(m.name || "Anonymous") + "</strong>" +
            '<a class="message-email" href="mailto:' + escapeAttr(encodeURIComponent(m.email || "")) + '">' + escapeHTML(m.email || "") + "</a>" +
            (m.phone ? '<span class="muted small">' + escapeHTML(m.phone) + "</span>" : "") +
          "</div>" +
          '<span class="muted small">' + escapeHTML(dateStr) + "</span>" +
        "</div>" +
        '<p class="message-body">' + escapeHTML(m.message || "").replace(/\n/g, "<br />") + "</p>" +
        '<div class="message-tools">' +
          '<label class="status-pick"><span class="muted small">Status</span><select data-act="status" class="status-' + status + '">' +
            Object.keys(STATUS_LABELS).map(function (k) { return '<option value="' + k + '"' + (k === status ? " selected" : "") + ">" + STATUS_LABELS[k] + "</option>"; }).join("") +
          "</select></label>" +
          '<a class="btn btn-secondary btn-sm" data-act="reply" href="' + escapeAttr(mailto) + '">Reply by email</a>' +
          (wa ? '<a class="btn btn-secondary btn-sm" data-act="reply" target="_blank" rel="noopener" href="' + escapeAttr(wa) + '">WhatsApp</a>' : "") +
          (m.read ? "" : '<button class="btn btn-ghost btn-sm" data-act="read">Mark read</button>') +
          '<button class="btn btn-danger btn-sm" data-act="del">Delete</button>' +
        "</div>" +
        '<label class="field note-field"><span>Private note (only you can see this)</span>' +
          '<textarea rows="2" maxlength="1000" data-act="note" placeholder="e.g. Wants a logo, budget GHS 1,000, call Friday">' + escapeHTML(m.note || "") + "</textarea></label>";

      item.addEventListener("click", function (e) {
        var act = e.target.closest("[data-act]");
        if (!act) return;
        var action = act.getAttribute("data-act");
        if (action === "read") updateMessage(m, { read: true });
        else if (action === "del") deleteMessageRow(m);
        else if (action === "reply" && (m.status || "new") === "new") updateMessage(m, { status: "in_progress" }, true);
      });
      item.addEventListener("change", function (e) {
        var sel = e.target.closest('select[data-act="status"]');
        if (sel) updateMessage(m, { status: sel.value });
      });
      var note = item.querySelector('textarea[data-act="note"]');
      note.addEventListener("blur", function () {
        var v = note.value.trim();
        if (v === (m.note || "")) return;
        updateMessage(m, { note: v || null }, true);
      });
      list.appendChild(item);
    });
  }

  // quiet = don't redraw the list (used while typing a note or opening a reply)
  function updateMessage(m, patch, quiet) {
    patch = Object.assign({}, patch);
    if (patch.status && patch.status !== "new") patch.read = true;
    if (patch.status === "replied" && !m.replied_at) patch.replied_at = new Date().toISOString();
    return window.sb.from("messages").update(patch).eq("id", m.id)
      .then(function (res) {
        if (res.error) throw res.error;
        Object.assign(m, patch);
        if (patch.status) logActivity("Message marked " + STATUS_LABELS[patch.status].toLowerCase(), m.name || m.email);
        loadInboxCount();
        if (!quiet) renderInbox();
      })
      .catch(function (err) { alert("Could not update: " + err.message); });
  }

  function deleteMessageRow(m) {
    if (!confirm("Delete this message from " + (m.name || m.email || "anonymous") + "?")) return;
    window.sb.from("messages")
      .delete()
      .eq("id", m.id)
      .then(function (res) {
        if (res.error) throw res.error;
        state.messages = state.messages.filter(function (x) { return x.id !== m.id; });
        logActivity("Deleted message", m.name || m.email);
        loadInboxCount();
        renderInbox();
      })
      .catch(function (err) { alert("Could not delete: " + err.message); });
  }

  /* ============================================================
     ACCOUNT (password, backup, sessions)
     ============================================================ */
  function changePassword(e) {
    e.preventDefault();
    var errBox = $("pwError");
    errBox.hidden = true;
    $("pwStatus").textContent = "";

    var current = $("pwCurrent").value;
    var next = $("pwNew").value;
    var confirm = $("pwConfirm").value;

    if (next.length < 12) { showError(errBox, "New password must be at least 12 characters. A few random words joined together works well."); return; }
    if (next !== confirm) { showError(errBox, "New passwords do not match."); return; }
    if (next === current) { showError(errBox, "The new password is the same as the current one."); return; }

    var btn = $("pwSaveBtn");
    btn.disabled = true;
    btn.textContent = "Updating…";

    // Verify the current password by signing in, then update.
    window.sb.auth.getSession()
      .then(function (res) {
        var email = res.data.session.user.email;
        return window.sb.auth.signInWithPassword({ email: email, password: current });
      })
      .then(function (res) {
        if (res.error) throw new Error("Current password is incorrect.");
        return window.sb.auth.updateUser({ password: next });
      })
      .then(function (res) {
        if (res.error) throw res.error;
        btn.disabled = false;
        btn.textContent = "Update Password";
        $("passwordForm").reset();
        $("pwStatus").textContent = "Password updated ✓";
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = "Update Password";
        showError(errBox, err.message || "Could not update the password.");
      });
  }

  /* ============================================================
     TWO-STEP SIGN-IN (authenticator app)
     ============================================================ */
  function initMfaCard() {
    var stateEl = $("mfaState"), enrollBox = $("mfaEnroll"), startBtn = $("mfaStart"), offBtn = $("mfaOff");
    var pending = null;   // factor being set up

    function refresh() {
      enrollBox.hidden = true;
      startBtn.hidden = offBtn.hidden = true;
      window.sb.auth.mfa.listFactors().then(function (r) {
        if (r.error) throw r.error;
        var active = ((r.data && r.data.totp) || []).filter(function (f) { return f.status === "verified"; })[0];
        if (active) {
          stateEl.textContent = "On ✓ — signing in needs your password and a code from your authenticator app.";
          offBtn.hidden = false;
          offBtn.setAttribute("data-factor", active.id);
        } else {
          stateEl.textContent = "Off — only your password protects the admin. Turning this on is strongly recommended.";
          startBtn.hidden = false;
        }
      }).catch(function () { stateEl.textContent = "Could not check two-step sign-in right now."; });
    }

    startBtn.addEventListener("click", function () {
      var err = $("mfaEnrollError"); err.hidden = true;
      startBtn.disabled = true;
      // remove leftovers from an abandoned earlier attempt, then start fresh
      window.sb.auth.mfa.listFactors().then(function (r) {
        var stale = ((r.data && r.data.all) || []).filter(function (f) { return f.status !== "verified"; });
        return Promise.all(stale.map(function (f) { return window.sb.auth.mfa.unenroll({ factorId: f.id }); }));
      }).then(function () {
        return window.sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator " + new Date().toISOString().slice(0, 10) + "-" + Math.random().toString(36).slice(2, 6) });
      }).then(function (r) {
        startBtn.disabled = false;
        if (r.error) throw r.error;
        pending = r.data;
        $("mfaQr").src = r.data.totp.qr_code;
        $("mfaSecret").textContent = r.data.totp.secret;
        $("mfaEnrollCode").value = "";
        enrollBox.hidden = false;
        startBtn.hidden = true;
        $("mfaEnrollCode").focus();
      }).catch(function (e) {
        startBtn.disabled = false;
        err.textContent = "Could not start setup: " + ((e && e.message) || e);
        err.hidden = false; enrollBox.hidden = false;
      });
    });

    $("mfaEnrollCancel").addEventListener("click", function () {
      var f = pending; pending = null;
      if (f) window.sb.auth.mfa.unenroll({ factorId: f.id }).then(refresh, refresh); else refresh();
    });

    $("mfaEnrollConfirm").addEventListener("click", function () {
      var err = $("mfaEnrollError"); err.hidden = true;
      var code = $("mfaEnrollCode").value.replace(/\s/g, "");
      if (!pending) return;
      if (!/^\d{6}$/.test(code)) { err.textContent = "Enter the 6 digits shown in your authenticator app."; err.hidden = false; return; }
      window.sb.auth.mfa.challenge({ factorId: pending.id }).then(function (c) {
        if (c.error) throw c.error;
        return window.sb.auth.mfa.verify({ factorId: pending.id, challengeId: c.data.id, code: code });
      }).then(function (v) {
        if (v.error) throw v.error;
        pending = null;
        logActivity("Turned on two-step sign-in", "");
        refresh();
      }).catch(function (e) {
        err.textContent = "That code didn't work. Check the app and try the newest code. (" + ((e && e.message) || e) + ")";
        err.hidden = false;
      });
    });

    offBtn.addEventListener("click", function () {
      if (!confirm("Turn off two-step sign-in? Your admin will then be protected by your password only.")) return;
      window.sb.auth.mfa.unenroll({ factorId: offBtn.getAttribute("data-factor") }).then(function (r) {
        if (r.error) { alert("Could not turn it off: " + r.error.message); return; }
        logActivity("Turned off two-step sign-in", "");
        refresh();
      });
    });

    refresh();
  }

  function exportBackup() {
    var status = $("exportStatus");
    status.textContent = "Preparing backup…";
    var grab = function (table, sel, order) {
      var q = window.sb.from(table).select(sel || "*");
      if (order) q = q.order(order, { ascending: true });
      return q.then(function (res) { if (res.error) throw new Error(table + ": " + res.error.message); return res.data || []; });
    };
    Promise.all([
      grab("projects", "*, project_images(*)", "sort_order"),
      grab("messages", "*", "created_at"),
      grab("testimonials", "*", "sort_order"),
      grab("clients", "*", "sort_order"),
      grab("packages", "*", "sort_order"),
      grab("site_settings"),
      grab("blog_posts", "*", "publish_on")
    ]).then(function (r) {
      var data = {
        exported_at: new Date().toISOString(),
        project_count: r[0].length,
        projects: r[0], messages: r[1], testimonials: r[2], clients: r[3], packages: r[4], site_settings: r[5], blog_posts: r[6]
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "portfolio-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      status.textContent = "Backup downloaded ✓";
      logActivity("Downloaded a backup", "");
    }).catch(function (err) {
      status.textContent = "Backup failed: " + err.message;
    });
  }

  function signOutAll() {
    if (!confirm("Sign out from ALL devices? You will need to sign in again everywhere.")) return;
    window.sb.auth.signOut({ scope: "global" }).then(function () {
      location.href = "index.html";
    });
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function slugify(str) {
    return String(str).toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  }

  function fileNameOf(url) {
    try { return decodeURIComponent(url.split("/").pop().split("?")[0]); }
    catch (e) { return url; }
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function escapeAttr(str) { return escapeHTML(str); }

  /* ============================================================
     SHARED WITH js panels (admin/panels.js)
     ============================================================ */
  window.Admin = {
    $: $, state: state, esc: escapeHTML, attr: escapeAttr, slugify: slugify, log: logActivity,
    niceTime: niceTime, loadProjects: loadProjects, loadMessages: loadInbox, isScheduled: isScheduled,
    publicUrl: publicUrl, optimiseImage: optimiseImage, toLocalInput: toLocalInput
  };
  window.AdminPanels = window.AdminPanels || {};

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    if (page === "login") initLogin();
    else if (page === "dashboard") initDashboard();
  });
})();
