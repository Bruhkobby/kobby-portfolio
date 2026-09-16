/* ============================================================
   KOBBY — Portfolio
   animations.js — hero reveal, scroll reveal, custom cursor
   ============================================================ */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hero entrance (staggered) ---------- */
  var runHeroReveal = function () {
    var heroItems = document.querySelectorAll("[data-hero-reveal]");
    heroItems.forEach(function (el, i) {
      setTimeout(function () { el.classList.add("in"); }, 120 + i * 110);
    });
  };
  document.addEventListener("page:ready", runHeroReveal);
  // Safety: if page:ready fired before this script registered (possible on
  // slower connections), run the hero reveal immediately.
  if (document.body.classList.contains("page-ready")) runHeroReveal();

  /* ---------- Scroll reveal ---------- */
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          // Stagger siblings inside the same parent slightly.
          var siblings = Array.prototype.filter.call(
            entry.target.parentNode.children,
            function (n) { return n.hasAttribute && n.hasAttribute("data-reveal"); }
          );
          var idx = siblings.indexOf(entry.target);
          entry.target.style.setProperty("--reveal-delay", (idx > 0 ? Math.min(idx * 0.08, 0.4) : 0) + "s");
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    var observeAll = function () {
      document.querySelectorAll("[data-reveal]:not(.in)").forEach(function (el) { io.observe(el); });
    };
    observeAll();
    // Observe elements injected later (e.g. portfolio grid).
    document.addEventListener("content:updated", observeAll);
  } else {
    // No observer / reduced motion → show everything.
    document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("in"); });
    document.addEventListener("content:updated", function () {
      document.querySelectorAll("[data-reveal]:not(.in)").forEach(function (el) { el.classList.add("in"); });
    });
  }

  /* ---------- Subtle custom cursor (desktop only) ---------- */
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  if (finePointer && !reduceMotion) {
    var dot = document.getElementById("cursorDot");
    if (dot) {
      var x = 0, y = 0, tx = 0, ty = 0, raf = null;

      var loop = function () {
        x += (tx - x) * 0.2;
        y += (ty - y) * 0.2;
        dot.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)";
        raf = requestAnimationFrame(loop);
      };

      document.addEventListener("mousemove", function (e) {
        tx = e.clientX; ty = e.clientY;
        dot.classList.add("visible");
        if (raf === null) { x = tx; y = ty; raf = requestAnimationFrame(loop); }
      });
      document.addEventListener("mouseleave", function () {
        dot.classList.remove("visible");
      });

      // Grow over interactive elements
      document.addEventListener("mouseover", function (e) {
        if (e.target.closest("a, button, .filter-btn")) dot.classList.add("hovering");
      });
      document.addEventListener("mouseout", function (e) {
        if (e.target.closest("a, button, .filter-btn")) dot.classList.remove("hovering");
      });
    }
  }
})();
