/* Mon Bon Écran – mesure d'audience Google Analytics 4 avec consentement (RGPD / CNIL, Consent Mode v2)
 *
 * Fichier COMMUN à toutes les pages du site (accueil, rubriques, pages de réglages, pages légales, futures pages).
 * Pour instrumenter une page : <script src="/mbe-analytics.js" defer></script> avant </body> (ou dans <head>).
 *
 * Principes
 *  - Rien n'est chargé chez Google, aucun cookie Analytics n'est posé tant que le visiteur n'a pas cliqué sur « Accepter ».
 *  - Consent Mode v2 : ad_storage, ad_user_data, ad_personalization restent TOUJOURS « denied » ; seul analytics_storage passe à « granted ».
 *  - Le choix est mémorisé 6 mois (localStorage, clé mbe_consent). Il peut être retiré à tout moment via « Gérer mes cookies » (pied de page).
 *  - page_view : un seul par véritable changement d'URL (chargement, pushState, replaceState, Retour/Avant), jamais en double.
 *  - affiliate_click : un événement par clic sur un lien sponsorisé (a[rel~=sponsored]), sans jamais retarder ni bloquer le lien.
 *  - Aucune donnée personnelle : on n'envoie ni identifiant utilisateur, ni e-mail, ni saisie du visiteur.
 *  - Ce fichier n'a aucun lien avec le suivi Supabase (index.html) : les deux comptent chacun de leur côté.
 */
(function () {
  "use strict";
  if (window.__mbeAnalytics) return;
  window.__mbeAnalytics = true;

  var GA_ID = "G-1SSN7H2506";
  var KEY = "mbe_consent";
  var TTL = 183 * 24 * 3600 * 1000; /* 6 mois */
  var UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  var granted = false, loaded = false;
  var lastPath = null, lastLocation = null, landingSent = false, timer = null, memChoice = null;

  /* ---------- choix mémorisé ---------- */
  function readChoice() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && (v.v === "granted" || v.v === "denied") && typeof v.t === "number" && v.t <= Date.now() + 60000 && Date.now() - v.t < TTL) return v.v;
    } catch (e) {}
    return memChoice;
  }
  function saveChoice(v) {
    memChoice = v;
    try { localStorage.setItem(KEY, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {}
  }

  /* ---------- Google Analytics ---------- */
  function gt() { if (window.gtag) window.gtag.apply(null, arguments); }

  function loadGA() {
    window["ga-disable-" + GA_ID] = false;
    if (loaded) { gt("consent", "update", { analytics_storage: "granted" }); return; }
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    /* Consent Mode v2 : tout refusé par défaut, puis seule la mesure d'audience est accordée. */
    gt("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
    gt("consent", "update", { analytics_storage: "granted" });
    gt("js", new Date());
    gt("config", GA_ID, {
      send_page_view: false,              /* les page_view sont envoyés à la main, une seule fois par URL */
      allow_google_signals: false,        /* pas de signaux Google */
      allow_ad_personalization_signals: false,
      cookie_flags: "SameSite=Lax;Secure",
      cookie_expires: 15552000            /* 6 mois, comme le consentement */
    });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
  }

  function clearCookies() {
    var names = ["_ga", "_ga_" + GA_ID.replace(/^G-/, "")];
    var host = location.hostname, parts = host.split("."), domains = [""];
    for (var i = 0; i < parts.length - 1; i++) domains.push("; domain=" + parts.slice(i).join("."), "; domain=." + parts.slice(i).join("."));
    names.forEach(function (n) {
      domains.forEach(function (d) {
        try { document.cookie = n + "=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d; } catch (e) {}
      });
    });
  }

  function grant() {
    saveChoice("granted");
    granted = true;
    loadGA();
    lastPath = null; /* la page en cours compte comme page d'arrivée */
    sendPageView();
  }
  function deny() {
    var was = granted;
    saveChoice("denied");
    granted = false;
    if (loaded) {
      window["ga-disable-" + GA_ID] = true;
      gt("consent", "update", { analytics_storage: "denied" });
    }
    if (was || loaded) clearCookies();
  }

  /* ---------- page_view : un seul par véritable changement d'URL ---------- */
  function normPath(p) {
    p = (p || "/").replace(/index\.html$/, "");
    if (p.charAt(p.length - 1) !== "/" && !/\.[a-z0-9]+$/i.test(p)) p += "/";
    return p;
  }
  function landingQuery() {
    /* Seuls les paramètres de campagne sont transmis (sources TikTok, Facebook…), uniquement à l'arrivée sur le site. */
    var out = [];
    try {
      var sp = new URLSearchParams(location.search);
      UTM.forEach(function (k) { var v = sp.get(k); if (v) out.push(k + "=" + encodeURIComponent(v.slice(0, 100))); });
    } catch (e) {}
    return out.length ? "?" + out.join("&") : "";
  }
  function sendPageView() {
    if (!granted || !loaded) return;
    var p = normPath(location.pathname);
    if (p === lastPath) return;
    lastPath = p;
    var loc = location.origin + location.pathname + (landingSent ? "" : landingQuery());
    var params = { page_location: loc, page_path: location.pathname, page_title: document.title };
    if (landingSent && lastLocation) params.page_referrer = lastLocation;
    landingSent = true;
    lastLocation = location.origin + location.pathname;
    gt("event", "page_view", params);
  }
  function schedulePageView() {
    clearTimeout(timer);
    timer = setTimeout(sendPageView, 80); /* laisse l'application mettre à jour le titre et l'URL */
  }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== "function") return;
    history[m] = function () {
      var r = orig.apply(this, arguments);
      schedulePageView();
      return r;
    };
  });
  window.addEventListener("popstate", schedulePageView);

  /* ---------- clics affiliés (indépendant du suivi Supabase) ---------- */
  document.addEventListener("click", function (e) {
    try {
      if (!granted || !loaded) return;
      var a = e.target && e.target.closest && e.target.closest("a[rel~=sponsored]");
      if (!a) return;
      var label = a.getAttribute("data-l");
      if (!label) {
        var m = /[?&]k=([^&]+)/.exec(a.href);
        label = m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "?";
      }
      gt("event", "affiliate_click", {
        shop: a.getAttribute("data-shop") || "amazon",
        item_label: String(label).slice(0, 100),
        item_type: a.classList.contains("accgo") ? "accessoire" : "tele",
        page_path: location.pathname
      });
    } catch (x) {}
  }, true);

  /* ---------- bandeau de consentement ---------- */
  var banner = null;
  function injectCss() {
    if (document.getElementById("mbe-ck-css")) return;
    var st = document.createElement("style");
    st.id = "mbe-ck-css";
    st.textContent =
      ".mbe-ck{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;max-width:560px;max-height:calc(100vh - 24px);overflow:auto;margin:0 auto;box-sizing:border-box;background:#fff;color:#1D1D1F;border:1px solid rgba(60,60,67,.2);border-radius:18px;box-shadow:0 10px 40px rgba(31,21,53,.3);padding:14px 16px 16px;font:15px/1.4 Inter,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%;text-align:left}" +
      ".mbe-ck *{box-sizing:border-box}" +
      ".mbe-ck h2::before,.mbe-ck h2::after{content:none!important;display:none!important}" +
      ".mbe-ck h2{padding:0;font:800 17px/1.3 Manrope,Inter,-apple-system,Arial,sans-serif;margin:0 0 6px;color:#2A1470}" +
      ".mbe-ck p{margin:0 0 12px}" +
      ".mbe-ck .mbe-st{color:#6E6E73;font-size:14px}" +
      ".mbe-ck a{color:#5B21B6}" +
      ".mbe-ck .mbe-r{display:flex;gap:10px}" +
      ".mbe-ck button{flex:1 1 0;min-height:48px;padding:10px 12px;border-radius:12px;border:2px solid #2A1470;background:#2A1470;color:#fff;font:700 16px/1.2 Inter,-apple-system,Arial,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-appearance:none;appearance:none}" +
      ".mbe-ck button:focus-visible{outline:3px solid #E8590C;outline-offset:2px}" +
      ".mbe-ckl{background:none;border:0;padding:8px 4px;margin:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer;touch-action:manipulation}" +
      ".mbe-ckfoot{text-align:center;font-size:.8rem;color:#6E6E73;margin:14px 0 0}";
    document.head.appendChild(st);
  }
  function showBanner(focus) {
    injectCss();
    hideBanner();
    var cur = readChoice();
    var d = document.createElement("div");
    d.className = "mbe-ck";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "false");
    d.setAttribute("aria-labelledby", "mbe-ck-t");
    d.setAttribute("aria-describedby", "mbe-ck-d");
    var h = document.createElement("h2"); h.id = "mbe-ck-t"; h.textContent = "Mesure d'audience";
    var p = document.createElement("p"); p.id = "mbe-ck-d";
    p.appendChild(document.createTextNode("Avec votre accord, nous utilisons Google Analytics pour mesurer les pages vues, la provenance et les clics vers les boutiques. Pas de publicité. Vous pouvez changer d'avis en bas de page. "));
    var a = document.createElement("a"); a.href = "/confidentialite.html"; a.textContent = "En savoir plus";
    p.appendChild(a); p.appendChild(document.createTextNode("."));
    d.appendChild(h); d.appendChild(p);
    if (cur) {
      var s = document.createElement("p"); s.className = "mbe-st";
      s.textContent = "Votre choix actuel : " + (cur === "granted" ? "accepté" : "refusé") + ".";
      d.appendChild(s);
    }
    var row = document.createElement("div"); row.className = "mbe-r";
    var no = document.createElement("button"); no.type = "button"; no.textContent = "Refuser";
    var yes = document.createElement("button"); yes.type = "button"; yes.textContent = "Accepter";
    no.addEventListener("click", function () { deny(); hideBanner(); });
    yes.addEventListener("click", function () { grant(); hideBanner(); });
    row.appendChild(no); row.appendChild(yes); d.appendChild(row);
    document.body.appendChild(d);
    banner = d;
    /* évite que le bandeau masque le bas de la page */
    document.body.style.paddingBottom = (d.offsetHeight + 24) + "px";
    if (focus) no.focus();
  }
  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
    document.body.style.paddingBottom = "";
  }

  /* ---------- lien « Gérer mes cookies » dans le pied de page ---------- */
  function addFooterLink() {
    if (document.querySelector("[data-mbe-cookies]")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "mbe-ckl"; b.setAttribute("data-mbe-cookies", "");
    b.textContent = "Gérer mes cookies";
    b.addEventListener("click", function () { showBanner(true); });
    injectCss();
    var f = document.querySelector("footer");
    if (f) { f.appendChild(document.createTextNode(" · ")); f.appendChild(b); return; }
    var host = document.querySelector("main") || document.body;
    var p = document.createElement("p"); p.className = "mbe-ckfoot"; p.appendChild(b);
    host.appendChild(p);
  }

  /* ---------- démarrage ---------- */
  function init() {
    addFooterLink();
    var c = readChoice();
    if (c === "granted") { granted = true; loadGA(); sendPageView(); }
    else if (c === "denied") { granted = false; }
    else showBanner(false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* petite API utile aux tests et aux futurs développements */
  window.mbeConsent = { open: function () { showBanner(true); }, get: readChoice };
})();
