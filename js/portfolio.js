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

  var quickList = []; // projects currently on screen, in order (used by the quick-view popup)

  var LOAD_ERROR_TEXT = "Projects couldn't be loaded right now. Please refresh in a moment.";

  // Fetch published projects from Supabase, with images ordered.
  // Rejects if the database can't be reached — the site never shows
  // placeholder projects, so callers show LOAD_ERROR_TEXT instead.
  function fetchProjects(opts) {
    if (!(window.sb && window.SUPABASE_CONFIGURED)) {
      return Promise.reject(new Error("Supabase client is not available"));
    }
    var preview = Boolean(opts && opts.preview);   // admin only: also shows drafts and scheduled projects
    var q = window.sb.from("projects").select("*, project_images(*)");
    if (!preview) q = q.eq("published", true);
    return q
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .order("image_order", { referencedTable: "project_images", ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        if (!preview) {
          // Scheduled projects stay hidden until their date (the database enforces this
          // for visitors too; this keeps the signed-in admin's view identical).
          var now = Date.now();
          rows = rows.filter(function (r) { return !r.publish_at || new Date(r.publish_at).getTime() <= now; });
        }
        return normalizeAll(rows);
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
      ;
    var alts = images.map(function (im) { return (im.alt_text || "").trim(); });
    images = images.map(function (im) { return im.image_url; });
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
      services: p.services || "",
      tools: p.tools || "",
      duration: p.duration || "",
      highlights: p.highlights || "",
      client_quote: p.client_quote || "",
      client_quote_by: p.client_quote_by || "",
      featured: Boolean(p.featured),
      images: images,
      alts: alts,
      cover: images[0] || ""
    };
  }

  function normalizeAll(list) {
    return list.map(normalizeProject).filter(function (p) { return p.cover; });
  }

  /* ============================================================
     SHARED RENDERING
     ============================================================ */

  // Alt text you wrote in the admin, or a sensible fallback.
  function altFor(p, i, fallback) {
    return (p.alts && p.alts[i]) || fallback;
  }

  function el(html) {
    var div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstElementChild;
  }

  function cardHTML(p, extraClass) {
    return (
      '<a class="project-card ' + (extraClass || "") + '" href="project.html?slug=' + encodeURIComponent(p.slug) + '">' +
        '<div class="card-media">' +
          '<img src="' + escapeAttr(p.cover) + '" alt="' + escapeAttr(altFor(p, 0, p.title)) + '" loading="lazy" />' +
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
            '<img src="' + escapeAttr(featured.cover) + '" alt="' + escapeAttr(altFor(featured, 0, featured.title)) + '" />' +
          "</a>" +
          '<div class="featured-meta" data-reveal>' +
            '<h2 class="featured-title"><a href="project.html?slug=' + encodeURIComponent(featured.slug) + '">' + escapeHTML(featured.title) + "</a></h2>" +
            '<p class="featured-tags">' + escapeHTML(featured.category) + (featured.year ? " — " + escapeHTML(featured.year) : "") + "</p>" +
          "</div>"
        );
      }

      var rest = projects.filter(function (p) { return p !== featured; }).slice(0, 3);
      quickList = [featured].concat(rest);
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
      quickList = [];
      var n = 0;
      shown.forEach(function (g) {
        quickList = quickList.concat(g.projects);
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

  // "number | meaning" lines -> big figures. Shows nothing unless you wrote real ones.
  function highlightsHTML(text) {
    var rows = String(text || "").split(/\r?\n/).map(function (l) {
      var i = l.indexOf("|");
      if (i < 1) return null;
      var v = l.slice(0, i).trim(), t = l.slice(i + 1).trim();
      return v && t ? { v: v.slice(0, 24), t: t.slice(0, 80) } : null;
    }).filter(Boolean).slice(0, 4);
    if (!rows.length) return "";
    return '<ul class="case-highlights" data-reveal aria-label="Key results">' +
      rows.map(function (r) {
        return '<li><span class="case-highlight-value">' + escapeHTML(r.v) + '</span><span class="case-highlight-text">' + escapeHTML(r.t) + "</span></li>";
      }).join("") + "</ul>";
  }

  // A client's own words, shown only when you added a real quote.
  function quoteHTML(quote, by) {
    if (!quote) return "";
    return '<div class="case-section case-quote-section" data-reveal>' +
      '<h2 class="case-section-label">Client feedback</h2>' +
      '<figure class="case-quote"><blockquote><p>' + escapeHTML(quote) + "</p></blockquote>" +
      (by ? "<figcaption>" + escapeHTML(by) + "</figcaption>" : "") + "</figure></div>";
  }

  function sectionHTML(label, text, id) {
    if (!text) return "";
    return (
      '<div class="case-section"' + (id ? ' id="' + id + '"' : "") + ' data-reveal>' +
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

    // ?preview=1 lets the signed-in admin see a draft or scheduled project before it goes public.
    var isPreview = new URLSearchParams(location.search).get("preview") === "1";
    fetchProjects({ preview: isPreview }).then(function (projects) {
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
      if (isPreview) {
        var robots = document.createElement("meta");
        robots.name = "robots"; robots.content = "noindex, nofollow";
        document.head.appendChild(robots);
        var bar = document.createElement("div");
        bar.className = "preview-banner";
        bar.textContent = "Preview — only you can see this page while you are signed in to the admin.";
        document.body.appendChild(bar);
      }
      updateProjectSEO(p);

      // Final design: first images, large. Gallery: remaining images.
      var finalImages = p.images.slice(0, 2);
      var galleryImages = p.images.slice(2);

      // Reading time + jump links
      var words = [p.brief, p.objective, p.creative_direction, p.process, p.result].join(" ").split(/\s+/).filter(Boolean).length;
      var minutes = Math.max(1, Math.ceil(words / 200));
      var jump = [];
      if (p.video_url) jump.push(["cs-video", "Video"]);
      if (p.brief) jump.push(["cs-brief", "Brief"]);
      if (p.objective) jump.push(["cs-objective", "Objective"]);
      if (p.creative_direction) jump.push(["cs-direction", "Direction"]);
      if (p.process) jump.push(["cs-process", "Process"]);
      if (finalImages.length) jump.push(["cs-final", "Final design"]);
      if (p.result) jump.push(["cs-result", "Result"]);
      if (galleryImages.length) jump.push(["cs-gallery", "Gallery"]);
      var jumpHTML =
        '<div class="case-jump" data-reveal>' +
          (jump.length >= 3
            ? jump.map(function (j) { return '<a class="filter-btn" href="#' + j[0] + '">' + j[1] + "</a>"; }).join("")
            : "") +
          '<button class="filter-btn copy-link" type="button">Copy link</button>' +
        "</div>";

      var html =
        '<div class="case-hero">' +
          '<a class="case-back" href="portfolio.html">← Portfolio</a>' +
          '<h1 class="case-title" data-reveal>' + escapeHTML(p.title) + "</h1>" +
          '<div class="case-meta" data-reveal>' +
            '<div class="case-meta-item"><span class="case-meta-label">Category</span><span class="case-meta-value">' + escapeHTML(p.category) + "</span></div>" +
            (p.client ? '<div class="case-meta-item"><span class="case-meta-label">Client</span><span class="case-meta-value">' + escapeHTML(p.client) + "</span></div>" : "") +
            (p.year ? '<div class="case-meta-item"><span class="case-meta-label">Year</span><span class="case-meta-value">' + escapeHTML(p.year) + "</span></div>" : "") +
            (p.duration ? '<div class="case-meta-item"><span class="case-meta-label">Timeline</span><span class="case-meta-value">' + escapeHTML(p.duration) + "</span></div>" : "") +
            (p.services ? '<div class="case-meta-item case-meta-wide"><span class="case-meta-label">What I did</span><span class="case-meta-value">' + escapeHTML(p.services) + "</span></div>" : "") +
            (p.tools ? '<div class="case-meta-item case-meta-wide"><span class="case-meta-label">Tools</span><span class="case-meta-value">' + escapeHTML(p.tools) + "</span></div>" : "") +
            (words ? '<div class="case-meta-item"><span class="case-meta-label">Reading time</span><span class="case-meta-value">' + minutes + " min</span></div>" : "") +
          "</div>" +
          jumpHTML +
        "</div>" +
        '<div class="case-hero-media" data-reveal><div class="frame"><img src="' + escapeAttr(p.cover) + '" alt="' + escapeAttr(altFor(p, 0, p.title)) + '" /></div></div>' +
        highlightsHTML(p.highlights) +
        '<div class="case-body">' +
          (p.video_url ? '<div class="case-section" id="cs-video" data-reveal>' + '<h2 class="case-section-label">Motion</h2>' + videoEmbedHTML(p.video_url) + "</div>" : "") +
          sectionHTML("Client Brief", p.brief, "cs-brief") +
          sectionHTML("Objective", p.objective, "cs-objective") +
          sectionHTML("Creative Direction", p.creative_direction, "cs-direction") +
          sectionHTML("Design Process", p.process, "cs-process") +
          (finalImages.length
            ? '<div class="case-section" id="cs-final" data-reveal>' +
                '<h2 class="case-section-label">Final Design</h2>' +
                '<div class="case-gallery" style="padding:0;">' +
                  finalImages.map(function (src, i) {
                    return '<div class="frame' + (i % 2 === 1 ? " wide" : "") + '"><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(altFor(p, i, p.title + " — final design " + (i + 1))) + '" loading="lazy" /></div>';
                  }).join("") +
                "</div>" +
              "</div>"
            : "") +
          sectionHTML("Result / Outcome", p.result, "cs-result") +
          quoteHTML(p.client_quote, p.client_quote_by) +
          (galleryImages.length
            ? '<div class="case-section" id="cs-gallery" data-reveal>' +
                '<h2 class="case-section-label">Project Gallery</h2>' +
                '<div class="case-gallery" style="padding:0;">' +
                  galleryImages.map(function (src, i) {
                    return '<div class="frame"><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(altFor(p, i + 2, p.title + " — gallery image " + (i + 1))) + '" loading="lazy" /></div>';
                  }).join("") +
                "</div>" +
              "</div>"
            : "") +
        "</div>";

      wrap.innerHTML = html;

      var copyBtn = wrap.querySelector(".copy-link");
      if (copyBtn) {
        copyBtn.addEventListener("click", function () {
          function done() {
            copyBtn.textContent = "Link copied";
            setTimeout(function () { copyBtn.textContent = "Copy link"; }, 2000);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(location.href).then(done, function () {});
          } else {
            try {
              var t = document.createElement("textarea");
              t.value = location.href;
              document.body.appendChild(t);
              t.select();
              document.execCommand("copy");
              document.body.removeChild(t);
              done();
            } catch (e) {}
          }
        });
      }

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

      // Invite the reader to start their own project
      wrap.insertAdjacentHTML("beforeend",
        '<section class="section cta-strip">' +
          '<p class="statement-text" data-reveal>Want something like this?</p>' +
          '<a class="btn-outline" href="contact.html" data-reveal>Start a project</a>' +
        "</section>");

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
     QUICK VIEW (popup on the portfolio + home pages)
     Click a tile → the full design opens over the page. Ctrl/⌘-click
     or middle-click still opens the full project page normally.
     ============================================================ */

  var QV_SECTIONS = [
    ["brief", "Client brief"], ["objective", "Objective"], ["creative_direction", "Creative direction"],
    ["process", "Design process"], ["result", "Result"]
  ];
  var qv = { el: null, index: -1, open: false, opener: null, pushed: false };

  function qvBuild() {
    if (qv.el) return qv.el;
    var d = document.createElement("div");
    d.className = "quickview";
    d.id = "quickview";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-hidden", "true");
    d.setAttribute("aria-labelledby", "qvTitle");
    d.innerHTML =
      '<div class="qv-bar">' +
        '<span class="qv-count" id="qvCount"></span>' +
        '<button class="qv-close" type="button" aria-label="Close preview">Close ✕</button>' +
      "</div>" +
      '<div class="qv-body" id="qvBody"></div>' +
      '<div class="qv-nav">' +
        '<button class="qv-step" type="button" data-step="-1"></button>' +
        '<button class="qv-step next" type="button" data-step="1"></button>' +
      "</div>";
    document.body.appendChild(d);
    qv.el = d;

    d.addEventListener("click", function (e) {
      if (e.target.closest(".qv-close")) { qvClose(); return; }
      var step = e.target.closest(".qv-step");
      if (step && !step.disabled) { qvShow(qv.index + parseInt(step.getAttribute("data-step"), 10)); return; }
      var full = e.target.closest(".qv-full");
      if (full) { qv.pushed = false; } // leaving for the full page: no need to rewind history
    });
    return d;
  }

  function qvShow(i) {
    if (i < 0 || i >= quickList.length) return;
    var p = quickList[i];
    qv.index = i;
    var body = document.getElementById("qvBody");

    var text = QV_SECTIONS.filter(function (s) { return p[s[0]]; }).map(function (s) {
      return '<div class="qv-block"><h3 class="qv-label">' + s[1] + "</h3><p>" + escapeHTML(p[s[0]]) + "</p></div>";
    }).join("");
    var meta = [p.category, p.client, p.year].filter(Boolean).map(escapeHTML).join(" · ");

    body.innerHTML =
      '<p class="qv-kicker">' + meta + "</p>" +
      '<h2 class="qv-title" id="qvTitle">' + escapeHTML(p.title) + "</h2>" +
      (p.video_url ? '<div class="qv-video">' + videoEmbedHTML(p.video_url) + "</div>" : "") +
      '<div class="qv-images">' +
        p.images.map(function (src, n) {
          return '<img src="' + escapeAttr(src) + '" alt="' + escapeAttr(altFor(p, n, p.title + (p.images.length > 1 ? " — image " + (n + 1) : ""))) + '"' + (n ? ' loading="lazy"' : "") + " />";
        }).join("") +
      "</div>" +
      (text ? '<div class="qv-text">' + text + "</div>" : "") +
      '<a class="btn-outline qv-full" href="project.html?slug=' + encodeURIComponent(p.slug) + '">Open the full case study →</a>';

    document.getElementById("qvCount").textContent = (i + 1) + " / " + quickList.length;
    var prev = quickList[i - 1], next = quickList[i + 1];
    var bp = qv.el.querySelector('.qv-step[data-step="-1"]');
    var bn = qv.el.querySelector('.qv-step[data-step="1"]');
    bp.disabled = !prev; bn.disabled = !next;
    bp.innerHTML = prev ? "← <span>" + escapeHTML(prev.title) + "</span>" : "";
    bn.innerHTML = next ? "<span>" + escapeHTML(next.title) + "</span> →" : "";
    qv.el.scrollTop = 0;
  }

  function qvOpen(i, opener) {
    qvBuild();
    qv.opener = opener || null;
    if (!qv.open) {
      qv.open = true;
      qv.el.classList.add("open");
      qv.el.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      try { history.pushState({ qv: 1 }, "", location.href); qv.pushed = true; } catch (e) { qv.pushed = false; }
    }
    qvShow(i);
    qv.el.querySelector(".qv-close").focus();
  }

  function qvClose(fromPop) {
    if (!qv.open) return;
    qv.open = false;
    qv.el.classList.remove("open");
    qv.el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    var iframe = qv.el.querySelector("iframe, video");
    if (iframe) document.getElementById("qvBody").innerHTML = ""; // stop any playing video
    if (!fromPop && qv.pushed) { qv.pushed = false; try { history.back(); } catch (e) {} }
    qv.pushed = false;
    if (qv.opener && document.body.contains(qv.opener)) qv.opener.focus();
  }

  function initQuickView() {
    var page = document.body.getAttribute("data-page");
    if (page !== "portfolio" && page !== "index") return;

    // Capture phase, so this runs before the page-fade handler in main.js.
    document.addEventListener("click", function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href^="project.html?slug="]');
      if (!a || (qv.el && qv.el.contains(a))) return;
      var slug = decodeURIComponent((a.getAttribute("href").split("slug=")[1] || "").split("&")[0]);
      var i = -1;
      for (var k = 0; k < quickList.length; k++) { if (quickList[k].slug === slug) { i = k; break; } }
      if (i < 0) return; // not loaded yet: just follow the link
      e.preventDefault();
      e.stopPropagation();
      qvOpen(i, a);
    }, true);

    document.addEventListener("keydown", function (e) {
      if (!qv.open) return;
      if (e.key === "Escape") { e.preventDefault(); qvClose(); }
      else if (e.key === "ArrowRight") { qvShow(qv.index + 1); }
      else if (e.key === "ArrowLeft") { qvShow(qv.index - 1); }
      else if (e.key === "Tab") {
        // keep keyboard focus inside the popup
        var f = Array.prototype.filter.call(qv.el.querySelectorAll("a[href], button:not([disabled]), iframe"), function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // Phone/browser Back button closes the popup instead of leaving the page.
    window.addEventListener("popstate", function () { if (qv.open) { qv.pushed = false; qvClose(true); } });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    initHome();
    initPortfolio();
    initCaseStudy();
    initQuickView();
  });
})();
