/* ============================================================
   KOBBY — Portfolio
   extras.js — renders testimonials and pricing packages from js/content.js
   ============================================================ */
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // ---- Testimonials (home page) ----
    var tSection = document.getElementById("testimonials");
    var quotes = (window.TESTIMONIALS || []).filter(function (t) { return t && t.quote && t.name; });
    var clients = (window.CLIENTS || []).filter(function (c) { return c && c.name; });
    if (tSection && clients.length) {
      var row = document.getElementById("clients-row");
      row.innerHTML = '<span class="clients-label">Worked with</span>' + clients.map(function (c) {
        return c.logo
          ? '<img class="client-logo" src="' + esc(c.logo) + '" alt="' + esc(c.name) + '" loading="lazy" />'
          : '<span class="client-name">' + esc(c.name) + "</span>";
      }).join("");
      row.hidden = false;
      tSection.hidden = false;
      if (!quotes.length) document.getElementById("testimonials-label").textContent = "Clients";
    }
    if (tSection && quotes.length) {
      document.getElementById("testimonials-grid").innerHTML = quotes.map(function (t) {
        return '<blockquote class="testimonial" data-reveal>' +
          "<p>“" + esc(t.quote) + "”</p>" +
          "<footer><strong>" + esc(t.name) + "</strong>" + (t.role ? " · " + esc(t.role) : "") + "</footer>" +
        "</blockquote>";
      }).join("");
      tSection.hidden = false;
    }

    // ---- Pricing packages (services page) ----
    var pWrap = document.getElementById("pricing-packages");
    var packs = (window.PRICING || []).filter(function (p) { return p && p.name && p.from; });
    if (pWrap && packs.length) {
      pWrap.innerHTML = packs.map(function (p) {
        return '<div class="package" data-reveal>' +
          '<h3 class="package-name">' + esc(p.name) + "</h3>" +
          '<p class="package-price"><span>' + esc(p.note || "From") + "</span> " + esc(p.from) + "</p>" +
          (p.includes && p.includes.length ? "<ul>" + p.includes.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : "") +
        "</div>";
      }).join("");
      pWrap.hidden = false;
    }

    document.dispatchEvent(new CustomEvent("content:updated"));
  });
})();
