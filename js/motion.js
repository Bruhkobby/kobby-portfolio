/* ============================================================
   KOBBY — Portfolio
   motion.js — small, editor-style touches:
     1. Timeline bar with a playhead that follows your scroll
     2. Cursor that says "View", "Play" or "Zoom" over work
     3. Logo that animates in once per visit and spins its ® on hover
   Everything is skipped when the visitor asks for reduced motion.
   ============================================================ */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var isAdmin = document.body.hasAttribute("data-admin");

  /* ---------- 3. Logo ---------- */
  var brand = document.querySelector(".brand");
  if (brand && brand.firstChild && brand.firstChild.nodeType === 3 && !brand.querySelector(".brand-letter")) {
    var word = brand.firstChild.nodeValue.trim();
    var frag = document.createDocumentFragment();
    word.split("").forEach(function (ch, i) {
      var s = document.createElement("span");
      s.className = "brand-letter";
      s.style.setProperty("--i", i);
      s.setAttribute("aria-hidden", "true");
      s.textContent = ch;
      frag.appendChild(s);
    });
    brand.replaceChild(frag, brand.firstChild);
    brand.setAttribute("aria-label", "Kobby, home page");
    var seen = false;
    try { seen = sessionStorage.getItem("kobbyLogoIntro") === "1"; sessionStorage.setItem("kobbyLogoIntro", "1"); } catch (e) {}
    if (!seen) brand.classList.add("brand-intro");   // only the first page of a visit
  }

  /* ---------- 1. Timeline bar (public pages only) ---------- */
  if (!isAdmin) {
    var FPS = 25, TOTAL = 90;           // a pretend 90-second edit
    var tl = document.createElement("div");
    tl.className = "timeline";
    tl.setAttribute("aria-hidden", "true");
    tl.innerHTML = '<span class="tl-code">00:00:00:00</span><span class="tl-track"><span class="tl-head"></span></span>';
    document.body.appendChild(tl);
    var code = tl.querySelector(".tl-code");
    var ticking = false, lastText = "";

    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var update = function () {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (max < 120) { tl.classList.remove("on"); return; }
      var p = Math.min(1, Math.max(0, window.scrollY / max));
      tl.style.setProperty("--p", p.toFixed(4));
      var frames = Math.round(p * TOTAL * FPS);
      var text = "00:" + pad(Math.floor(frames / FPS / 60)) + ":" + pad(Math.floor(frames / FPS) % 60) + ":" + pad(frames % FPS);
      if (text !== lastText) { code.textContent = text; lastText = text; }
      tl.classList.add("on");
    };
    var request = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    document.addEventListener("content:updated", request);
    window.addEventListener("load", request);
    update();
  }

  /* ---------- 2. Cursor labels (mouse only) ---------- */
  var dot = document.getElementById("cursorDot");
  if (dot && window.matchMedia("(pointer: fine)").matches) {
    var labelFor = function (el) {
      var card = el.closest(".project-card, .featured-media, .featured-wrap a");
      if (card) return card.querySelector(".card-badge") ? "Play" : "View";
      if (el.closest(".case-hero-media img, .case-gallery img")) return "Zoom";
      return "";
    };
    var current = "";
    document.addEventListener("mouseover", function (e) {
      if (document.getElementById("quickview") && document.getElementById("quickview").classList.contains("open")) {
        if (current) { dot.classList.remove("labeled"); current = ""; }
        return;
      }
      var label = labelFor(e.target);
      if (label === current) return;
      current = label;
      if (label) { dot.setAttribute("data-label", label); dot.classList.add("labeled"); }
      else dot.classList.remove("labeled");
    });
    document.addEventListener("mouseleave", function () { dot.classList.remove("labeled"); current = ""; });
  }
})();
