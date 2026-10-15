(function () {
  "use strict";

  const DISMISS_KEY = "visor-caroni:pwa-prompt-dismissed-at";
  const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;
  const SHOW_DELAY_MS = 3500;
  let deferredInstallPrompt;
  let promptShown = false;
  let promptTimer;
  let previousFocus;

  const baseUrl = new URL(
    document.querySelector("base")?.href || "./",
    window.location.href
  );

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIosSafari() {
    const touchMac =
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || touchMac;
    const webkit = /WebKit/i.test(navigator.userAgent);
    const otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(
      navigator.userAgent
    );
    return ios && webkit && !otherIosBrowser;
  }

  function isDesktopSafari() {
    return (
      (navigator.platform || "").startsWith("Mac") &&
      /Safari/i.test(navigator.userAgent) &&
      !/Chrome|Chromium|CriOS|Edg/i.test(navigator.userAgent) &&
      navigator.maxTouchPoints < 2
    );
  }

  function wasRecentlyDismissed() {
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
      return (
        Number.isFinite(dismissedAt) &&
        Date.now() - dismissedAt < DISMISS_FOR_MS
      );
    } catch (_error) {
      return false;
    }
  }

  function rememberDismissal() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (_error) {
      // Storage may be unavailable in private browsing; dismissal remains in-memory.
    }
  }

  function removePrompt(remember) {
    if (promptTimer) {
      window.clearTimeout(promptTimer);
      promptTimer = undefined;
    }

    const backdrop = document.getElementById("visor-caroni-install-backdrop");
    if (!backdrop) return;

    if (remember) rememberDismissal();
    backdrop.remove();
    document.removeEventListener("keydown", handleEscape);
    previousFocus?.focus?.();
  }

  function handleEscape(event) {
    if (event.key === "Escape") removePrompt(true);
  }

  function createPrompt(mode) {
    if (promptShown || isStandalone() || wasRecentlyDismissed()) return;
    promptShown = true;
    previousFocus = document.activeElement;

    const isManualInstall = mode !== "native";
    const instructions =
      mode === "ios"
        ? "En Safari, toca Compartir y selecciona \u201cAñadir a la pantalla de inicio\u201d."
        : mode === "safari"
          ? "En Safari, abre el menú Archivo y selecciona \u201cAñadir al Dock\u201d."
          : "En el menú de tu navegador, selecciona \u201cInstalar aplicación\u201d o \u201cAñadir a la pantalla de inicio\u201d.";

    const backdrop = document.createElement("div");
    backdrop.id = "visor-caroni-install-backdrop";
    backdrop.className = "visor-caroni-install-backdrop";

    const dialog = document.createElement("section");
    dialog.className = "visor-caroni-install-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "visor-caroni-install-title");
    dialog.setAttribute("aria-describedby", "visor-caroni-install-description");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "visor-caroni-install-close";
    closeButton.setAttribute("aria-label", "Cerrar invitación de instalación");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => removePrompt(true));

    const header = document.createElement("div");
    header.className = "visor-caroni-install-header";

    const logo = document.createElement("img");
    logo.className = "visor-caroni-install-logo";
    logo.src = new URL(
      "caroni-assets/favicons/pwa-icon-192x192.png?v=20261014visoricon1",
      baseUrl
    ).href;
    logo.alt = "";
    logo.width = 72;
    logo.height = 72;

    const heading = document.createElement("h2");
    heading.id = "visor-caroni-install-title";
    heading.textContent = "Instala Visor Caroní";
    header.append(logo, heading);

    const description = document.createElement("p");
    description.id = "visor-caroni-install-description";
    description.textContent =
      "Instala Visor Caroní para abrir el visor desde la pantalla de inicio o el escritorio y acceder más rápido a la interfaz.";

    const offlineNote = document.createElement("p");
    offlineNote.className = "visor-caroni-install-note";
    offlineNote.textContent =
      "La aplicación conserva archivos esenciales para iniciar sin conexión. Las capas, mapas base y consultas a servicios geoespaciales requieren Internet, salvo los recursos ya almacenados por el navegador.";

    const actions = document.createElement("div");
    actions.className = "visor-caroni-install-actions";

    const primaryButton = document.createElement("button");
    primaryButton.type = "button";
    primaryButton.className = "visor-caroni-install-primary";
    primaryButton.textContent = isManualInstall
      ? "Entendido"
      : "Instalar aplicación";

    if (isManualInstall) {
      const manualInstructions = document.createElement("p");
      manualInstructions.className = "visor-caroni-install-instructions";
      manualInstructions.textContent = instructions;
      dialog.append(
        closeButton,
        header,
        description,
        manualInstructions,
        offlineNote
      );
      primaryButton.addEventListener("click", () => removePrompt(true));
    } else {
      dialog.append(closeButton, header, description, offlineNote);
      primaryButton.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        primaryButton.disabled = true;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = undefined;
        removePrompt(choice.outcome !== "accepted");
      });
    }

    const secondaryButton = document.createElement("button");
    secondaryButton.type = "button";
    secondaryButton.className = "visor-caroni-install-secondary";
    secondaryButton.textContent = "Ahora no";
    secondaryButton.addEventListener("click", () => removePrompt(true));

    actions.append(primaryButton, secondaryButton);
    dialog.append(actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.addEventListener("keydown", handleEscape);
    primaryButton.focus();
  }

  function schedulePrompt(mode, delay = SHOW_DELAY_MS) {
    if (promptTimer) window.clearTimeout(promptTimer);

    const show = () => {
      promptTimer = undefined;
      createPrompt(mode);
    };
    const startTimer = () => {
      if (promptTimer) window.clearTimeout(promptTimer);
      promptTimer = window.setTimeout(show, delay);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startTimer, { once: true });
    } else {
      startTimer();
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    schedulePrompt("native", 1200);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = undefined;
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch (_error) {
      // Storage may be unavailable in private browsing.
    }
    removePrompt(false);
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker
      .register(new URL("service-worker.js?v=20261014visoricon1", baseUrl), {
        scope: baseUrl.pathname
      })
      .catch((error) =>
        console.warn("No se pudo registrar el modo sin conexión.", error)
      );
  }

  if (!isStandalone()) {
    if (isIosSafari()) schedulePrompt("ios");
    else if (isDesktopSafari()) schedulePrompt("safari");
    else schedulePrompt("browser", 7000);
  }
})();
