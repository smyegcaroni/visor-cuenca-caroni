/* Keep only the Caroni header logo in this tab; other Terria links are unchanged. */
(function () {
  "use strict";
  var imageSelector = 'a img[src^="/caroni-branding/logo_fao_caroni.png"]';

  function isLogoLink(anchor) {
    if (!anchor || !anchor.querySelector('img[src^="/caroni-branding/logo_fao_caroni.png"]')) return false;
    try {
      return new URL(anchor.href, document.baseURI).origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function useSameTab(anchor) {
    if (isLogoLink(anchor) && anchor.getAttribute("target") !== "_self") {
      anchor.setAttribute("target", "_self");
    }
  }

  function updateLogo() {
    document.querySelectorAll(imageSelector).forEach(function (image) {
      useSameTab(image.closest("a"));
    });
  }

  // Update before the browser's default action, including keyboard activation.
  // Do not preventDefault: Ctrl/Cmd-click and middle-click retain browser behavior.
  document.addEventListener("click", function (event) {
    var element = event.target;
    if (element && typeof element.closest === "function") useSameTab(element.closest("a"));
  }, true);

  function start() {
    updateLogo();
    new MutationObserver(updateLogo).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
