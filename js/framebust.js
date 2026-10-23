/* Stops other websites from showing this page inside a hidden frame
   (a trick used to make people click things they can't see). */
(function () {
  if (window.top !== window.self) {
    document.documentElement.style.display = "none";
    try { window.top.location = window.self.location; } catch (e) {}
  }
})();
