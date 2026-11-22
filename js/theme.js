/* ============================================================
   KOBBY — light / dark mode
   Runs in the <head> so the right theme is set before the page paints (no flash).
   Order of choice: the visitor's own pick (remembered on their device) →
   otherwise their phone / computer setting.
   ============================================================ */
(function () {
  var root = document.documentElement;
  var KEY = "kobby-theme";

  function saved() {
    try { var v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; }
    catch (e) { return null; }
  }
  function system() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function current() { return root.getAttribute("data-theme") || saved() || system(); }

  function labelButtons() {
    var dark = current() === "dark";
    var btns = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btns[i].setAttribute("title", dark ? "Light mode" : "Dark mode");
    }
  }
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    labelButtons();
  }

  apply(saved() || system());

  // Browsers that can fade smoothly between pages by themselves (see glass.css) get this flag.
  if ("onpagereveal" in window) root.classList.add("vt");

  // Follow the device setting live, unless the visitor has chosen for themselves.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () { if (!saved()) apply(system()); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  document.addEventListener("DOMContentLoaded", function () {
    labelButtons();
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".theme-toggle");
      if (!btn) return;
      var next = current() === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (err) { /* private mode: still works for this visit */ }
    });
  });
})();
