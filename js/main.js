/* ============================================================
   KOBBY — Portfolio
   main.js — navigation, mobile menu, page transitions, year
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Active nav link ---------- */
  var page = document.body.getAttribute("data-page");
  document.querySelectorAll("[data-nav]").forEach(function (link) {
    var href = link.getAttribute("href") || "";
    var name = href.replace(".html", "").replace("./", "");
    if (page === name || (page === "portfolio" && name === "portfolio")) {
      link.classList.add("active");
    }
  });
  // Blog posts belong to the Blog section
  if (page === "post") {
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      if ((link.getAttribute("href") || "").indexOf("blog") !== -1) {
        link.classList.add("active");
      }
    });
  }
  // project.html belongs to the Work section
  if (page === "project") {
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      if ((link.getAttribute("href") || "").indexOf("portfolio") !== -1) {
        link.classList.add("active");
      }
    });
  }

  /* ---------- Mobile menu ---------- */
  var toggle = document.getElementById("menuToggle");
  var menu = document.getElementById("mobileMenu");
  if (toggle && menu) {
    var closeMenu = function () {
      menu.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    };
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-hidden", String(!open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) closeMenu();
    });
  }

  /* ---------- Page fade transitions ---------- */
  // Fade the page in once everything is ready.
  var revealPage = function () {
    document.body.classList.add("page-ready");
    document.body.classList.remove("page-leaving");
    document.dispatchEvent(new CustomEvent("page:ready"));
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(revealPage, 40);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(revealPage, 40);
    });
  }

  /* ---------- Site settings ----------
     These are the built-in defaults. The real values are kept in the admin
     (Site tab) and js/live.js applies them on top as soon as they load. */
  var SITE = {
    available: true,            // true = "Available for new projects", false = "Fully booked"
    whatsapp: "233545414923",   // number with country code, no + or spaces
    whatsappMessage: "Hi Kobby, I found your portfolio and I'd like to talk about a project."
  };

  var fab = null;
  function waLink() {
    return "https://wa.me/" + String(SITE.whatsapp).replace(/\D/g, "") + "?text=" + encodeURIComponent(SITE.whatsappMessage);
  }

  function renderSite() {
    var link = waLink();
    document.querySelectorAll("[data-whatsapp]").forEach(function (a) { a.href = link; });
    if (fab) fab.href = link;
    document.querySelectorAll("[data-availability]").forEach(function (el) {
      el.classList.toggle("is-busy", !SITE.available);
      el.innerHTML = '<span class="availability-dot" aria-hidden="true"></span>' +
        (SITE.available ? "Available for new projects" : "Fully booked right now — message me to join the waitlist");
    });
  }

  // Floating WhatsApp button (not on the admin pages)
  if (!document.body.hasAttribute("data-admin") && !document.querySelector(".whatsapp-fab")) {
    fab = document.createElement("a");
    fab.className = "whatsapp-fab";
    fab.target = "_blank";
    fab.rel = "noopener";
    fab.setAttribute("aria-label", "Chat with Kobby on WhatsApp");
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.4.3-.8.1-.8-.4V16.2A2.5 2.5 0 0 1 4 14z" stroke-linejoin="round"/></svg><span>Chat on WhatsApp</span>';
    document.body.appendChild(fab);
  }
  renderSite();

  // Called by js/live.js with the values saved in the admin.
  window.KobbySite = {
    apply: function (s) {
      if (!s) return;
      if (typeof s.available === "boolean") SITE.available = s.available;
      if (s.whatsapp && /\d{7,}/.test(String(s.whatsapp))) SITE.whatsapp = String(s.whatsapp);
      if (s.whatsapp_message) SITE.whatsappMessage = String(s.whatsapp_message);
      renderSite();
    }
  };

  // Fade out before navigating to an internal page.
  document.addEventListener("click", function (e) {
    var link = e.target.closest("a");
    if (!link) return;
    var href = link.getAttribute("href");
    if (!href) return;
    // Skip anchors, new tabs, downloads, admin links and modifier clicks.
    if (
      href.charAt(0) === "#" ||
      link.target === "_blank" ||
      link.hasAttribute("download") ||
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
      href.indexOf("admin/") !== -1 ||
      (href.indexOf("://") !== -1 && href.indexOf(location.host) === -1)
    ) return;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    // Same page → let the browser handle it.
    var targetPath = href.split("#")[0];
    var currentPath = location.pathname.split("/").pop() || "index.html";
    if (targetPath === currentPath || targetPath === "") return;

    e.preventDefault();
    document.body.classList.add("page-leaving");
    // Safety: if navigation is ever blocked (extension, network), undo the
    // fade so the visitor is never left on an invisible page.
    setTimeout(function () { document.body.classList.remove("page-leaving"); }, 1400);
    setTimeout(function () { location.href = href; }, 320);
  });
})();
