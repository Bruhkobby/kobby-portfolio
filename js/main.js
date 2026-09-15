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
    setTimeout(function () { location.href = href; }, 320);
  });
})();
