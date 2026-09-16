/* ============================================================
   KOBBY — Portfolio
   contact.js — contact form (saves to Supabase "messages"),
   copy-email button
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Copy email ---------- */
  document.querySelectorAll("[data-copy-email]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var email = btn.getAttribute("data-copy-email") || "";
      var done = function () {
        var old = btn.textContent;
        btn.textContent = "Copied ✓";
        setTimeout(function () { btn.textContent = old; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done, function () {});
      }
    });
  });

  /* ---------- Contact form ---------- */
  var form = document.getElementById("contactForm");
  if (!form) return;

  var status = document.getElementById("cfStatus");
  var submitBtn = document.getElementById("cfSubmit");
  var doneBox = document.getElementById("cfDone");

  function setStatus(msg, isError) {
    status.textContent = msg;
    status.classList.toggle("error", Boolean(isError));
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var name = document.getElementById("cfName").value.trim();
    var email = document.getElementById("cfEmail").value.trim();
    var message = document.getElementById("cfMessage").value.trim();
    var company = document.getElementById("cfCompany").value; // honeypot

    status.hidden = false;
    if (!name || !message) { setStatus("Please fill in your name and message.", true); return; }
    if (!validEmail(email)) { setStatus("Please enter a valid email address.", true); return; }
    if (message.length < 10) { setStatus("Your message is a little short — tell me a bit more.", true); return; }

    // Bots fill the hidden field — silently pretend success.
    if (company) {
      form.hidden = true;
      doneBox.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    setStatus("Sending…", false);

    var finish = function () {
      form.hidden = true;
      doneBox.hidden = false;
      window.scrollTo({ top: doneBox.getBoundingClientRect().top + window.pageYOffset - 120, behavior: "smooth" });
    };

    if (!(window.sb && window.SUPABASE_CONFIGURED)) {
      // Supabase not set up: fall back to the visitor's email app.
      var subject = encodeURIComponent("Project enquiry from " + name);
      var body = encodeURIComponent(message + "\n\n— " + name + " (" + email + ")");
      window.location.href = "mailto:bruhkobby707@gmail.com?subject=" + subject + "&body=" + body;
      submitBtn.disabled = false;
      setStatus("", false);
      return;
    }

    window.sb.from("messages")
      .insert({ name: name, email: email, message: message })
      .then(function (res) {
        if (res.error) throw res.error;
        finish();
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        setStatus("Sorry — sending failed (" + (err.message || "unknown error") + "). Please email me directly at bruhkobby707@gmail.com.", true);
      });
  });
})();
