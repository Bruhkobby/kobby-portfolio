/* ============================================================
   KOBBY — Portfolio
   portfolio.js — loads projects (Supabase or demo data) and
   renders the homepage, portfolio grid and case-study pages.
   ============================================================ */

(function () {
  "use strict";

  var CATEGORIES = ["All", "Branding", "Social Media", "Flyers", "Posters", "UI/UX", "Photo Editing", "Motion", "Other"];

  /* ============================================================
     DATA LAYER
     ============================================================ */

  function isDemoMode() {
    return !(window.sb && window.SUPABASE_CONFIGURED);
  }

  // Fetch published projects from Supabase, with images ordered.
  function fetchProjects() {
    if (isDemoMode()) {
      return Promise.resolve(normalizeAll(window.DEMO_PROJECTS || []));
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
        // Graceful fallback so the site never appears broken.
        return normalizeAll(window.DEMO_PROJECTS || []);
      });
  }

  // Convert a Supabase row (or demo object) into one predictable shape.
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
          '<img src="' + p.cover + '" alt="' + escapeAttr(p.title) + '" loading="lazy" />' +
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
            '<img src="' + featured.cover + '" alt="' + escapeAttr(featured.title) + '" />' +
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

      document.dispatchEvent(new CustomEvent("content:updated"));
    });
  }

  /* ============================================================
     PORTFOLIO GRID + FILTERS
     ============================================================ */

  function initPortfolio() {
    var grid = document.getElementById("work-grid");
    var filterBar = document.getElementById("filterBar");
    if (!grid) return;

    var allProjects = [];
    var activeFilter = "All";

    function renderFilters() {
      filterBar.innerHTML = CATEGORIES.map(function (cat) {
        var hasProjects = cat === "All" || allProjects.some(function (p) {
          return (p.category || "Other").toLowerCase() === cat.toLowerCase();
        });
        if (cat !== "All" && !hasProjects) return ""; // hide empty categories
        return '<button class="filter-btn' + (cat === activeFilter ? " active" : "") + '" data-filter="' + escapeAttr(cat) + '">' + escapeHTML(cat) + "</button>";
      }).join("");
    }

    function renderGrid() {
      var list = activeFilter === "All"
        ? allProjects
        : allProjects.filter(function (p) {
            return (p.category || "Other").toLowerCase() === activeFilter.toLowerCase();
          });

      grid.innerHTML = "";
      document.getElementById("emptyNote").hidden = list.length > 0;

      list.forEach(function (p, i) {
        var card = el(cardHTML(p, "c-" + (i % 4)));
        grid.appendChild(card);
        // Staggered entrance
        setTimeout(function () { card.classList.add("shown"); }, 60 + i * 90);
      });
    }

    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      activeFilter = btn.getAttribute("data-filter");
      filterBar.querySelectorAll(".filter-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      renderGrid();
    });

    fetchProjects().then(function (projects) {
      allProjects = projects;
      renderFilters();
      renderGrid();
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

  function initCaseStudy() {
    var wrap = document.getElementById("project-page");
    if (!wrap) return;

    var slug = new URLSearchParams(location.search).get("slug");
    if (!slug) {
      wrap.innerHTML = '<div class="case-hero"><p class="loading-note">Project not found. <a class="case-back" href="portfolio.html">← Back to work</a></p></div>';
      return;
    }

    fetchProjects().then(function (projects) {
      var p = projects.find(function (x) { return x.slug === slug; });
      if (!p) {
        wrap.innerHTML =
          '<div class="case-hero">' +
            '<h1 class="case-title">Project not found</h1>' +
            '<p class="page-sub" style="margin-top:1.5rem;">This project may have been unpublished or the link is wrong.</p>' +
            '<a class="case-back" style="margin-top:2.5rem; display:inline-block;" href="portfolio.html">← Back to work</a>' +
          "</div>";
        return;
      }

      document.title = p.title + " — Kobby";

      // Final design: first images, large. Gallery: remaining images.
      var finalImages = p.images.slice(0, 2);
      var galleryImages = p.images.slice(2);

      var html =
        '<div class="case-hero">' +
          '<a class="case-back" href="portfolio.html">← All work</a>' +
          '<h1 class="case-title" data-reveal>' + escapeHTML(p.title) + "</h1>" +
          '<div class="case-meta" data-reveal>' +
            '<div class="case-meta-item"><span class="case-meta-label">Category</span><span class="case-meta-value">' + escapeHTML(p.category) + "</span></div>" +
            (p.client ? '<div class="case-meta-item"><span class="case-meta-label">Client</span><span class="case-meta-value">' + escapeHTML(p.client) + "</span></div>" : "") +
            (p.year ? '<div class="case-meta-item"><span class="case-meta-label">Year</span><span class="case-meta-value">' + escapeHTML(p.year) + "</span></div>" : "") +
          "</div>" +
        "</div>" +
        '<div class="case-hero-media" data-reveal><div class="frame"><img src="' + p.cover + '" alt="' + escapeAttr(p.title) + '" /></div></div>' +
        '<div class="case-body">' +
          sectionHTML("Client Brief", p.brief) +
          sectionHTML("Objective", p.objective) +
          sectionHTML("Creative Direction", p.creative_direction) +
          sectionHTML("Design Process", p.process) +
          (finalImages.length
            ? '<div class="case-section" data-reveal>' +
                '<h2 class="case-section-label">Final Design</h2>' +
                '<div class="case-gallery" style="padding:0;">' +
                  finalImages.map(function (src, i) {
                    return '<div class="frame' + (i % 2 === 1 ? " wide" : "") + '"><img src="' + src + '" alt="' + escapeAttr(p.title) + ' — final design ' + (i + 1) + '" loading="lazy" /></div>';
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
                    return '<div class="frame"><img src="' + src + '" alt="' + escapeAttr(p.title) + ' — gallery image ' + (i + 1) + '" loading="lazy" /></div>';
                  }).join("") +
                "</div>" +
              "</div>"
            : "") +
        "</div>";

      wrap.innerHTML = html;
      document.dispatchEvent(new CustomEvent("content:updated"));
      window.scrollTo(0, 0);
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
