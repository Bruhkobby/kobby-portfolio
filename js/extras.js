/* ============================================================
   KOBBY — Portfolio
   extras.js — renders testimonials, client logos and pricing packages.
   The data comes from the admin (js/live.js loads it); js/content.js is
   only a fallback used when the database can't be reached.
   ============================================================ */
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    // ---- Testimonials + clients (home page) ----
    var tSection = document.getElementById("testimonials");
    var quotes = (window.TESTIMONIALS || []).filter(function (t) { return t && t.quote && t.name; });
    var clients = (window.CLIENTS || []).filter(function (c) { return c && c.name; });
    if (tSection) {
      var row = document.getElementById("clients-row");
      var grid = document.getElementById("testimonials-grid");
      if (clients.length) {
        row.innerHTML = '<span class="clients-label">Worked with</span>' + clients.map(function (c) {
          return c.logo
            ? '<img class="client-logo" src="' + esc(c.logo) + '" alt="' + esc(c.name) + '" loading="lazy" />'
            : '<span class="client-name">' + esc(c.name) + "</span>";
        }).join("");
      }
      row.hidden = !clients.length;
      document.getElementById("testimonials-label").textContent = quotes.length ? "Kind words" : "Clients";
      grid.innerHTML = quotes.map(function (t) {
        return '<blockquote class="testimonial" data-reveal>' +
          "<p>“" + esc(t.quote) + "”</p>" +
          "<footer><strong>" + esc(t.name) + "</strong>" + (t.role ? " · " + esc(t.role) : "") + "</footer>" +
        "</blockquote>";
      }).join("");
      tSection.hidden = !(quotes.length || clients.length);
    }

    // ---- Pricing packages (services page) ----
    // Cedis for visitors in Ghana, dollars for everyone else; they can switch.
    // The browser's own time zone / language picks the default, nothing is sent anywhere.
    var pWrap = document.getElementById("pricing-packages");
    var packs = (window.PRICING || []).filter(function (p) { return p && p.name && (p.from || p.usd); });
    if (pWrap) {
      var hasGhs = packs.some(function (p) { return p.from; });
      var hasUsd = packs.some(function (p) { return p.usd; });
      var cur = pickCurrency(hasGhs, hasUsd);

      var toggle = document.getElementById("currency-toggle");
      if (!toggle) {
        toggle = document.createElement("div");
        toggle.id = "currency-toggle";
        toggle.className = "currency-toggle";
        toggle.setAttribute("role", "group");
        toggle.setAttribute("aria-label", "Show prices in");
        pWrap.parentNode.insertBefore(toggle, pWrap);
        toggle.addEventListener("click", function (e) {
          var b = e.target.closest("button[data-cur]");
          if (!b) return;
          try { localStorage.setItem("kobbyCurrency", b.getAttribute("data-cur")); } catch (err) {}
          render();
        });
      }
      toggle.hidden = !(hasGhs && hasUsd);
      toggle.innerHTML = [["GHS", "Cedis (GH₵)"], ["USD", "US dollars ($)"]].map(function (c) {
        return '<button type="button" class="filter-btn' + (cur === c[0] ? " active" : "") + '" data-cur="' + c[0] + '" aria-pressed="' + (cur === c[0]) + '">' + c[1] + "</button>";
      }).join("");

      pWrap.innerHTML = packs.map(function (p) {
        var price = cur === "USD" ? (p.usd || p.from) : (p.from || p.usd);
        return '<div class="package" data-reveal>' +
          '<h3 class="package-name">' + esc(p.name) + "</h3>" +
          '<p class="package-price"><span>' + esc(p.note || "From") + "</span> " + esc(price) + "</p>" +
          (p.includes && p.includes.length ? "<ul>" + p.includes.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : "") +
        "</div>";
      }).join("");
      pWrap.hidden = !packs.length;
    }

    document.dispatchEvent(new CustomEvent("content:updated"));
  }

  function pickCurrency(hasGhs, hasUsd) {
    if (!hasUsd) return "GHS";
    if (!hasGhs) return "USD";
    var saved = null;
    try { saved = localStorage.getItem("kobbyCurrency"); } catch (e) {}
    if (saved === "GHS" || saved === "USD") return saved;
    var tz = "", lang = (navigator.language || "").toLowerCase();
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    return (tz === "Africa/Accra" || /-gh$/.test(lang)) ? "GHS" : "USD";
  }

  window.KobbyExtras = { render: render };
  document.addEventListener("DOMContentLoaded", render);
})();
