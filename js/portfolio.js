/* ============================================================
   KOBBY — Portfolio
   portfolio.js — loads published projects from Supabase and
   renders the homepage, portfolio grid and case-study pages.
   ============================================================ */

(function () {
  "use strict";

  // Divisions come from js/config.js (shared with the admin dashboard).
  var DIVISIONS = (window.DIVISIONS && window.DIVISIONS.length) ? window.DIVISIONS : [
    { id: "all-work", name: "All work", blurb: "", categories: [] }
  ];

  function divisionOf(category) {
    var c = String(category || "Other").toLowerCase();
    for (var i = 0; i < DIVISIONS.length; i++) {
      if (DIVISIONS[i].categories.some(function (x) { return x.toLowerCase() === c; })) return DIVISIONS[i];
    }
    return DIVISIONS[DIVISIONS.length - 1]; // anything unrecognised goes in the last division
  }

  function groupByDivision(projects) {
    return DIVISIONS.map(function (d) {
      return { division: d, projects: projects.filter(function (p) { return divisionOf(p.category) === d; }) };
    }).filter(function (g) { return g.projects.length; });
  }

  /* ============================================================
     DATA LAYER
     ============================================================ */

  var LOAD_ERROR_TEXT = "Projects couldn't be loaded right now. Please refresh in a moment.";

  // Fetch published projects from Supabase, with images ordered.
  // Rejects if the database can't be reached — the site never shows
  // placeholder projects, so callers show LOAD_ERROR_TEXT instead.
  function fetchProjects() {
    if (!(window.sb && window.SUPABASE_CONFIGURED)) {
      return Promise.reject(new Error("Supabase client is not available"));
    }
    return window.sb
      .from("projects")
      .select("*, project_images(*)")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .order("image_order", { referencedTable: "project_images", ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        return normalizeAll(res.data || []);
      })
      .catch(function (err) {
        console.error("Could not load projects:", err);
        throw err;
      });
  }

  // Convert a Supabase row into one predictable shape.
  function normalizeProject(p) {
    var images = (p.project_images || p.images || [])
      .slice()
      .sort(function (a, b) { return (a.image_order || 0) - (b.image_order || 0); })
      .map(function (im) { return im.image_url; });
    return {
      id: p.id,
      title: p.title || "Untitled",
      slug: p.slug || "",
      category: p.category || "Other",
      client: p.client || "",
      year: p.year ? String(p.year) : "",
      brief: p.brief || "",
      objective: p.objective || "",
      creative_direction: p.creative_direction || "",
      process: p.process || "",
      result: p.result || "",
      video_url: p.video_url || "",
      featured: Boolean(p.featured),
      images: images,
      cover: images[0] || ""
    };
  }

  function normalizeAll(list) {
    return list.map(normalizeProject).filter(function (p) { return p.cover; });
  }

  /* ============================================================
     SHARED RENDERING
     ============================================================ */

  function el(html) {
    var div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstElementChild;
  }

  function cardHTML(p, extraClass) {
    return (
      '<a class="project-card ' + (extraClass || "") + '" href="project.html?slug=' + encodeURIComponent(p.slug) + '">' +
        '<div class="card-media">' +
          '<img src="' + escapeAttr(p.cover) + '" alt="' + escapeAttr(p.title) + '" loading="lazy" />' +
          (p.video_url ? '<span class="card-badge">▶ Video</span>' : "") +
        "</div>" +
        '<div class="card-info">' +
          '<h3 class="card-title">' + escapeHTML(p.title) + "</h3>" +
          '<p class="card-meta">' + escapeHTML(p.category) + (p.year ? "<br />" + escapeHTML(p.year) : "") + "</p>" +
        "</div>" +
      "</a>"
    );
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function escapeAttr(str) { return escapeHTML(str); }

  /* ============================================================
     HOMEPAGE
     ============================================================ */

  function initHome() {
    var featuredWrap = document.getElementById("featured-project");
    var selectedWrap = document.getElementById("selected-work");
    if (!featuredWrap && !selectedWrap) return;

    fetchProjects().then(function (projects) {
      if (!projects.length) {
        if (featuredWrap) featuredWrap.innerHTML = '<p class="loading-note">No published projects yet.</p>';
        if (selectedWrap) selectedWrap.innerHTML = "";
        return;
      }

      var featured = projects.find(function (p) { return p.featured; }) || projects[0];
      if (featuredWrap) {
        featuredWrap.innerHTML = (
          '<a class="featured-media" href="project.html?slug=' + encodeURIComponent(featured.slug) + '" data-reveal>' +
            '<img src="' + escapeAttr(featured.cover) + '" alt="' + escapeAttr(featured.title) + '" />' +
          "</a>" +
          '<div class="featured-meta" data-reveal>' +
            '<h3 class="featured-title"><a href="project.html?slug=' + encodeURIComponent(featured.slug) + '">' + escapeHTML(featured.title) + "</a></h3>" +
            '<p class="featured-tags">' + escapeHTML(featured.category) + (featured.year ? " — " + escapeHTML(featured.year) : "") + "</p>" +
          "</div>"
        );
      }

      var rest = projects.filter(function (p) { return p !== featured; }).slice(0, 3);
      if (selectedWrap) {
        selectedWrap.innerHTML = rest.map(function (p, i) { return cardHTML(p, "preview-" + i); }).join("");
      }

      var chips = document.getElementById("division-links");
      if (chips) {
        chips.innerHTML = groupByDivision(projects).map(function (g) {
          return '<a class="filter-btn" href="portfolio.html#' + g.division.id + '">' + escapeHTML(g.division.name) + "</a>";
        }).join("");
      }

      document.dispatchEvent(new CustomEvent("content:updated"));
    }).catch(function () {
      if (featuredWrap) featuredWrap.innerHTML = '<p class="loading-note">' + LOAD_ERROR_TEXT + "</p>";
      if (selectedWrap) selectedWrap.innerHTML = "";
    });
  }

  /* ============================================================
     PORTFOLIO GRID + FILTERS
     ============================================================ */

  function initPortfolio() {
    var holder = document.getElementById("work-divisions");
    var filterBar = document.getElementById("filterBar");
    if (!holder) return;

    var groups = [];
    var active = "all"; // "all" or a division id

    function readHash() {
      var h = decodeURIComponent((location.hash || "").replace("#", ""));
      return groups.some(function (g) { return g.division.id === h; }) ? h : "all";
    }

    function renderTabs() {
      var total = groups.reduce(function (n, g) { return n + g.projects.length; }, 0);
      var tabs = [{ id: "all", name: "All", count: total }].concat(groups.map(function (g) {
        return { id: g.division.id, name: g.division.name, count: g.projects.length };
      }));
      filterBar.innerHTML = tabs.map(function (t) {
        return '<button class="filter-btn' + (t.id === active ? " active" : "") + '" data-filter="' + escapeAttr(t.id) + '">' +
          escapeHTML(t.name) + ' <span class="filter-count">' + t.count + "</span></button>";
      }).join("");
    }

    function renderSections() {
      var shown = active === "all" ? groups : groups.filter(function (g) { return g.division.id === active; });
      document.getElementById("emptyNote").hidden = shown.length > 0;
      holder.innerHTML = "";
      var n = 0;
      shown.forEach(function (g) {
        var section = document.createElement("section");
        section.className = "division";
        section.id = "division-" + g.division.id;
        section.innerHTML =
          '<div class="section-head">' +
            '<h2 class="section-label">' + escapeHTML(g.division.name) + "</h2>" +
            '<span class="section-rule"></span>' +
            '<span class="division-count">' + g.projects.length + (g.projects.length === 1 ? " project" : " projects") + "</span>" +
          "</div>" +
          (g.division.blurb ? '<p class="division-blurb">' + escapeHTML(g.division.blurb) + "</p>" : "") +
          '<div class="work-grid"></div>';
        var grid = section.querySelector(".work-grid");
        g.projects.forEach(function (p, i) {
          var card = el(cardHTML(p, "c-" + (i % 4)));
          grid.appendChild(card);
          setTimeout(function () { card.classList.add("shown"); }, 60 + (n++) * 90);
        });
        holder.appendChild(section);
      });
    }

    function select(id, updateHash) {
      active = id;
      renderTabs();
      renderSections();
      if (updateHash) {
        try { history.replaceState(null, "", id === "all" ? location.pathname + location.search : "#" + id); } catch (e) {}
      }
    }

    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      select(btn.getAttribute("data-filter"), true);
    });
    window.addEventListener("hashchange", function () { if (groups.length) select(readHash(), false); });

    fetchProjects().then(function (projects) {
      groups = groupByDivision(projects);
      active = readHash();
      renderTabs();
      renderSections();
      if (!groups.length) {
        var note = document.getElementById("emptyNote");
        note.textContent = "No published projects yet.";
        note.hidden = false;
      }
    }).catch(function () {
      holder.innerHTML = "";
      var note = document.getElementById("emptyNote");
      note.textContent = LOAD_ERROR_TEXT;
      note.hidden = false;
    });
  }

  /* ============================================================
     CASE STUDY PAGE
     ============================================================ */

  function sectionHTML(label, text) {
    if (!text) return "";
    return (
      '<div class="case-section" data-reveal>' +
        '<h2 class="case-section-label">' + label + "</h2>" +
        '<p class="case-section-text">' + escapeHTML(text) + "</p>" +
      "</div>"
    );
  }

  // Turn a video URL into an embed player (YouTube / Vimeo) or a native
  // <video> element for direct files (mp4/webm) and storage uploads.
  function videoEmbedHTML(url) {
    var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
    var vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (yt) {
      return '<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(yt[1]) + '" title="Project video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
    }
    if (vm) {
      return '<div class="video-frame"><iframe src="https://player.vimeo.com/video/' + encodeURIComponent(vm[1]) + '" title="Project video" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>';
    }
    return '<div class="video-frame"><video src="' + escapeAttr(url) + '" controls playsinline preload="metadata"></video></div>';
  }

  // Give each project page its own search-engine details (title is set separately).
  function setHead(selector, attr, value) {
    var node = document.head.querySelector(selector);
    if (node && value) node.setAttribute(attr, value);
  }

  function updateProjectSEO(p) {
    var url = location.origin + location.pathname + "?slug=" + encodeURIComponent(p.slug);
    var desc = String(p.brief || p.objective || "").replace(/\s+/g, " ").trim();
    if (desc.length > 155) desc = desc.slice(0, 152).replace(/\s+\S*$/, "") + "…";
    if (!desc) desc = p.title + " — " + p.category + " project by Kobby, graphic designer and video editor.";
    var title = p.title + " — Kobby";

    setHead('link[rel="canonical"]', "href", url);
    setHead('meta[name="description"]', "content", desc);
    setHead('meta[property="og:title"]', "content", title);
    setHead('meta[property="og:description"]', "content", desc);
    setHead('meta[property="og:url"]', "content", url);
    setHead('meta[name="twitter:title"]', "content", title);
    setHead('meta[name="twitter:description"]', "content", desc);
    if (/^https?:/.test(p.cover)) {
      setHead('meta[property="og:image"]', "content", p.cover);
      setHead('meta[name="twitter:image"]', "content", p.cover);
    }

    var ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: p.title,
      description: desc,
      url: url,
      genre: p.category,
      image: p.images,
      creator: { "@type": "Person", name: "Elorm Kwabena Delight Brown", alternateName: "Kobby" },
      ...(p.year ? { dateCreated: p.year } : {})
    });
    document.head.appendChild(ld);
  }

  function initCaseStudy() {
    var wrap = document.getElementById("project-page");
    if (!wrap) return;

    var slug = new URLSearchParams(location.search).get("slug");
    if (!slug) {
      wrap.innerHTML = '<div class="case-hero"><p class="loading-note">Project not found. <a class="case-back" href="portfolio.html">← Back to portfolio</a></p></div>';
      return;
    }

    fetchProjects().then(function (projects) {
      var idx = -1;
      var p = null;
      for (var k = 0; k < projects.length; k++) {
        if (projects[k].slug === slug) { p = projects[k]; idx = k; break; }
      }
      if (!p) {
        wrap.innerHTML =
          '<div class="case-hero">' +
            '<h1 class="case-title">Project not found</h1>' +
            '<p class="page-sub" style="margin-top:1.5rem;">This project may have been unpublished or the link is wrong.</p>' +
            '<a class="case-back" style="margin-top:2.5rem; display:inline-block;" href="portfolio.html">← Back to portfolio</a>' +
          "</div>";
        return;
      }

      document.title = p.title + " — Kobby";
      updateProjectSEO(p);

      // Final design: first images, large. Gallery: remaining images.
      var finalImages = p.images.slice(0, 2);
      var galleryImages = p.images.slice(2);

      var html =
        '<div class="case-hero">' +
          '<a class="case-back" href="portfolio.html">← Portfolio</a>' +
          '<h1 class="case-title" data-reveal>' + escapeHTML(p.title) + "</h1>" +
          '<div class="case-meta" data-reveal>' +
            '<div class="case-meta-item"><span class="case-meta-label">Category</span><span class="case-meta-value">' + escapeHTML(p.category) + "</span></div>" +
            (p.client ? '<div class="case-meta-item"><span class="case-meta-label">Client</span><span class="case-meta-value">' + escapeHTML(p.client) + "</span></div>" : "") +
            (p.year ? '<div class="case-meta-item"><span class="case-meta-label">Year</span><span class="case-meta-value">' + escapeHTML(p.year) + "</span></div>" : "") +
          "</div>" +
        "</div>" +
        '<div class="case-hero-media" data-reveal><div class="frame"><img src="' + escapeAttr(p.cover) + '" alt="' + escapeAttr(p.title) + '" /></div></div>' +
        '<div class="case-body">' +
          (p.video_url ? '<div class="case-section" data-reveal>' + '<h2 class="case-section-label">Motion</h2>' + videoEmbedHTML(p.video_url) + "</div>" : "") +
          sectionHTML("Client Brief", p.brief) +
          sectionHTML("Objective", p.objective) +
          sectionHTML("Creative Direction", p.creative_direction) +
          sectionHTML("Design Process", p.process) +
          (finalImages.length
            ? '<div class="case-section" data-reveal>' +
                '<h2 class="case-section-label">Final Design</h2>' +
                '<div class="case-gallery" style="padding:0;">' +
                  finalImages.map(function (src, i) {
                    return '<div class="frame' + (i % 2 === 1 ? " wide" : "") + '"><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(p.title) + ' — final design ' + (i + 1) + '" loading="lazy" /></div>';
                  }).join("") +
                "</div>" +
              "</div>"
            : "") +
          sectionHTML("Result / Outcome", p.result) +
          (galleryImages.length
            ? '<div class="case-section" data-reveal>' +
                '<h2 class="case-section-label">Project Gallery</h2>' +
                '<div class="case-gallery" style="padding:0;">' +
                  galleryImages.map(function (src, i) {
                    return '<div class="frame"><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(p.title) + ' — gallery image ' + (i + 1) + '" loading="lazy" /></div>';
                  }).join("") +
                "</div>" +
              "</div>"
            : "") +
        "</div>";

      wrap.innerHTML = html;

      // More projects from the same division
      var division = divisionOf(p.category);
      var related = projects.filter(function (x) { return x !== p && divisionOf(x.category) === division; }).slice(0, 3);
      if (related.length) {
        wrap.insertAdjacentHTML("beforeend",
          '<div class="case-body"><div class="case-section case-related" data-reveal>' +
            '<h2 class="case-section-label">More in ' + escapeHTML(division.name) + "</h2>" +
            '<div class="related-grid">' + related.map(function (x) { return cardHTML(x, ""); }).join("") + "</div>" +
          "</div></div>");
      }

      // Prev / next project navigation
      var prev = idx > 0 ? projects[idx - 1] : null;
      var next = idx < projects.length - 1 ? projects[idx + 1] : null;
      if (prev || next) {
        var pager = '<div class="case-pager" data-reveal>';
        pager += prev
          ? '<a class="case-pager-link" href="project.html?slug=' + encodeURIComponent(prev.slug) + '"><span class="case-pager-kicker">← Previous</span><span class="case-pager-title">' + escapeHTML(prev.title) + "</span></a>"
          : "<span></span>";
        pager += next
          ? '<a class="case-pager-link next" href="project.html?slug=' + encodeURIComponent(next.slug) + '"><span class="case-pager-kicker">Next →</span><span class="case-pager-title">' + escapeHTML(next.title) + "</span></a>"
          : "<span></span>";
        pager += "</div>";
        wrap.insertAdjacentHTML("beforeend", pager);
      }

      setupLightbox(wrap);

      document.dispatchEvent(new CustomEvent("content:updated"));
      window.scrollTo(0, 0);
    }).catch(function () {
      wrap.innerHTML =
        '<div class="case-hero">' +
          '<p class="loading-note">' + LOAD_ERROR_TEXT + ' <a class="case-back" href="portfolio.html">← Back to portfolio</a></p>' +
        "</div>";
    });
  }

  /* ---------- Fullscreen image viewer (lightbox) ---------- */
  function setupLightbox(scope) {
    if (!scope || document.getElementById("lightboxEl")) return;
    var lb = document.createElement("div");
    lb.className = "lightbox";
    lb.id = "lightboxEl";
    lb.setAttribute("aria-hidden", "true");
    lb.innerHTML = '<button class="lightbox-close" type="button" aria-label="Close">×</button><img alt="" />';
    document.body.appendChild(lb);
    var lbImg = lb.querySelector("img");

    function close() {
      lb.classList.remove("open");
      document.body.style.overflow = "";
    }
    lb.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    scope.addEventListener("click", function (e) {
      var img = e.target.closest(".case-hero-media img, .case-gallery img");
      if (!img) return;
      lbImg.src = img.getAttribute("src");
      lbImg.alt = img.getAttribute("alt") || "";
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    initHome();
    initPortfolio();
    initCaseStudy();
  });
})();
