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

    // Already signed in? Go straight to the dashboard.
    window.sb.auth.getSession().then(function (res) {
      if (res.data && res.data.session) {
        location.href = "dashboard.html";
      }
    });

    var form = document.getElementById("loginForm");
    var errorBox = document.getElementById("loginError");
    var btn = document.getElementById("loginBtn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorBox.hidden = true;
      btn.disabled = true;
      btn.textContent = "Signing in…";

      var email = document.getElementById("email").value.trim();
      var password = document.getElementById("password").value;

      window.sb.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          location.href = "dashboard.html";
        })
        .catch(function (err) {
          errorBox.textContent = err.message || "Sign in failed. Check your email and password.";
          errorBox.hidden = false;
          btn.disabled = false;
          btn.textContent = "Sign in";
        });
    });
  }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  var state = {
    projects: [],
    editingId: null,   // null = new project
    editingImages: []  // images of the project being edited
  };

  function $(id) { return document.getElementById(id); }

  function initDashboard() {
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
      loadProjects();
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
  }

  /* ============================================================
     PROJECT LIST
     ============================================================ */
  function loadProjects() {
    window.sb
      .from("projects")
      .select("*, project_images(image_url, image_order)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        state.projects = res.data || [];
        renderProjectList();
      })
      .catch(function (err) {
        $("projectList").innerHTML = '<p class="muted">Could not load projects: ' + escapeHTML(err.message) + "</p>";
      });
  }

  function coverOf(p) {
    var imgs = (p.project_images || []).slice().sort(function (a, b) { return (a.image_order || 0) - (b.image_order || 0); });
    return imgs.length ? imgs[0].image_url : "";
  }

  function renderProjectList() {
    var wrap = $("projectList");
    $("projectCount").textContent = state.projects.length;

    if (!state.projects.length) {
      wrap.innerHTML = '<div class="card"><p class="muted">No projects yet. Click “+ New Project” to create your first one.</p></div>';
      return;
    }

    wrap.innerHTML = "";
    state.projects.forEach(function (p, index) {
      var row = document.createElement("div");
      row.className = "project-row";
      row.innerHTML =
        '<img class="project-thumb" src="' + (coverOf(p) || "data:image/gif;base64,R0lGODlhAQABAAAAACw=") + '" alt="" />' +
        '<div class="project-main">' +
          '<div class="project-name">' + escapeHTML(p.title) + "</div>" +
          '<div class="project-sub">' +
            '<span class="badge ' + (p.published ? "badge-published" : "badge-draft") + '">' + (p.published ? "Published" : "Draft") + "</span>" +
            (p.featured ? '<span class="badge badge-featured">Featured</span>' : "") +
            escapeHTML(p.category) + (p.year ? " · " + escapeHTML(p.year) : "") +
          "</div>" +
        "</div>" +
        '<div class="project-actions">' +
          '<button class="btn btn-ghost btn-sm" data-act="up" title="Move up"' + (index === 0 ? " disabled" : "") + ">↑</button>" +
          '<button class="btn btn-ghost btn-sm" data-act="down" title="Move down"' + (index === state.projects.length - 1 ? " disabled" : "") + ">↓</button>" +
          '<label class="toggle' + (p.published ? " on" : "") + '" title="Publish / unpublish"><input type="checkbox" data-act="publish" style="display:none"' + (p.published ? " checked" : "") + " /></label>" +
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
        else if (action === "up") moveProject(index, -1);
        else if (action === "down") moveProject(index, 1);
      });
      wrap.appendChild(row);
    });
  }

  function togglePublished(p) {
    window.sb.from("projects")
      .update({ published: !p.published, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .then(function (res) {
        if (res.error) throw res.error;
        p.published = !p.published;
        renderProjectList();
      })
      .catch(function (err) { alert("Could not update: " + err.message); });
  }

  function moveProject(index, dir) {
    var other = index + dir;
    if (other < 0 || other >= state.projects.length) return;
    var a = state.projects[index], b = state.projects[other];
    var sa = a.sort_order || index, sbv = b.sort_order || other;
    Promise.all([
      window.sb.from("projects").update({ sort_order: sbv }).eq("id", a.id),
      window.sb.from("projects").update({ sort_order: sa }).eq("id", b.id)
    ]).then(function (results) {
      if (results[0].error || results[1].error) { alert("Could not reorder."); }
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
        loadProjects();
      })
      .catch(function (err) { alert("Could not delete: " + err.message); });
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

    if (projectId) {
      var p = state.projects.find(function (x) { return x.id === projectId; });
      if (!p) { showList(); return; }
      $("editorTitle").textContent = "Edit Project";
      $("fTitle").value = p.title || "";
      $("fSlug").value = p.slug || "";
      $("fSlug").dataset.dirty = "1";
      $("fCategory").value = p.category || "Other";
      $("fClient").value = p.client || "";
      $("fYear").value = p.year || "";
      $("fBrief").value = p.brief || "";
      $("fObjective").value = p.objective || "";
      $("fCreative").value = p.creative_direction || "";
      $("fProcess").value = p.process || "";
      $("fResult").value = p.result || "";
      $("fFeatured").checked = Boolean(p.featured);
      $("fPublished").checked = Boolean(p.published);
      loadEditorImages(projectId);
    } else {
      $("editorTitle").textContent = "New Project";
      $("fYear").value = String(new Date().getFullYear());
      $("imagesHint").textContent = "Save the project first, then upload images.";
      $("addImagesBtn").disabled = true;
      $("imagesList").innerHTML = '<p class="muted small">Save the project first to upload images.</p>';
    }

    $("listView").hidden = true;
    $("editorView").hidden = false;
    window.scrollTo(0, 0);
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
      featured: $("fFeatured").checked,
      published: $("fPublished").checked,
      updated_at: new Date().toISOString()
    };

    var btn = $("saveBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    var done = function (id, isNew) {
      btn.disabled = false;
      btn.textContent = "Save Project";
      $("saveStatus").textContent = "Saved ✓";
      state.editingId = id;
      $("editorTitle").textContent = "Edit Project";
      $("addImagesBtn").disabled = false;
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
        '<img src="' + img.image_url + '" alt="" />' +
        '<span class="img-label">' + escapeHTML(fileNameOf(img.image_url)) + "</span>" +
        (i === 0 ? '<span class="cover-tag">Cover</span>' : "") +
        '<button class="icon-btn" data-act="up" title="Move up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button class="icon-btn" data-act="down" title="Move down"' + (i === state.editingImages.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<button class="icon-btn danger" data-act="del" title="Delete image">×</button>';

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

    files.forEach(function (file, idx) {
      var ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      var path = state.editingId + "/" + Date.now() + "-" + idx + "-" + slugify(file.name.replace(/\.[^.]+$/, "")) + "." + ext;
      status.textContent = "Uploading " + (uploaded + 1) + " / " + files.length + "…";

      window.sb.storage.from(window.SUPABASE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false })
        .then(function (res) {
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
            status.textContent = "Upload complete ✓";
            $("imageInput").value = "";
            loadEditorImages(state.editingId);
          }
        })
        .catch(function (err) {
          status.textContent = "Upload failed: " + err.message;
        });
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

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    if (page === "login") initLogin();
    else if (page === "dashboard") initDashboard();
  });
})();
