// Migration B+ des pages statiques /reglages/<modèle>/ (une seule fois, idempotente ; ne régénère rien d'autre).
// Règle : un usage (cinéma, jeu vidéo, sport) n'affiche des valeurs que si le modèle (et son année) possède une fiche documentée propre
// dans index.html (verifiedFor). Sinon la carte garde son titre et affiche « Réglages non documentés » avec un lien de navigation.
// Titres, descriptions, chapô et résumé sont alignés sur ce qui est réellement documenté. Rien n'est supprimé de index.html.
// Usage : node tools/migrate_bplus.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const lines = html.split("\n");
const start = lines.findIndex(l => l.startsWith("var YEARS")), end = lines.findIndex(l => l.startsWith("var state ="));
const ctx = { window: {}, state: { model: null, usage: null, brand: null, year: null } };
vm.createContext(ctx);
vm.runInContext(lines.slice(start, end).join("\n") + "\n;this.api={BRANDS,USAGES,verifiedFor,HUB_PAGES};", ctx);
const A = ctx.api;
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CARDS = [["Cinéma", "cinema", "cinéma"], ["Jeu vidéo", "jeu", "jeu"], ["Sport en direct", "sport", "sport"]];
const ALL3 = "cinéma, jeu, sport";
const join = a => a.length > 1 ? a.slice(0, -1).join(", ") + " et " + a[a.length - 1] : a[0] || "";
const msg = brand => '<p class="note"><b>Réglages non documentés.</b> Aucune source fiable ne donne de réglages pour ce modèle précis. Nous ne reprenons ni ceux d\'un autre modèle ni des valeurs génériques : mieux vaut rien qu\'un chiffre faux.</p>' +
  '<p class="note">' + (A.HUB_PAGES[brand] ? `<a href="${A.HUB_PAGES[brand]}">Conseils généraux ${esc(brand)} : menus et modes d'image</a> · ` : "") + '<a href="#autres-reglages">Autres modèles documentés</a></p>';
function find(name, gamme) {
  for (const b of Object.keys(A.BRANDS)) for (const y of Object.keys(A.BRANDS[b].models)) for (const m of A.BRANDS[b].models[y])
    if (b + " " + m[0] === name && (!gamme || y === gamme)) return { brand: b, model: m[0], year: y };
  return null;
}
let n = 0; const log = [];
for (const slug of fs.readdirSync(path.join(root, "reglages"))) {
  const f = path.join(root, "reglages", slug, "index.html");
  if (!fs.existsSync(f)) continue;
  let h = fs.readFileSync(f, "utf8");
  const name = (/<h1>Réglages ([^<]+)<\/h1>/.exec(h) || [])[1];
  const gamme = (/<p class="lead">[^<]*? · gamme (\d{4})/.exec(h) || [])[1];
  const info = name && find(name, gamme);
  if (!info) continue;
  const orig = h;
  /* Panasonic TX-65GZ1000 : guide sans carte par usage ; seule la section « valeurs de départ proposées (non vérifiées) » est masquée */
  if (slug === "panasonic-tx-65gz1000") {
    const re = /(<section class="card" id="s-valeurs-de-depart-proposees-non-verifiee">)<h2>[^<]*<\/h2>[\s\S]*?(<\/section>)/;
    if (re.test(h)) {
      h = h.replace(re, (a, p1, p2) => p1 + "<h2>Valeurs chiffrées</h2>" + msg(info.brand) + p2);
      h = h.replace(/<li><a href="#s-valeurs-de-depart-proposees-non-verifiee">[^<]*<\/a><\/li>/, '<li><a href="#s-valeurs-de-depart-proposees-non-verifiee">Valeurs chiffrées</a></li>');
      h = h.replace("Modes conseillés, et valeurs de départ proposées par Mon Bon Écran, non vérifiées.", "Modes conseillés d'après des tests publiés ; réglages chiffrés non documentés.");
      h = h.replace("les valeurs de la section « Valeurs de départ proposées » sont celles que nous proposons, non vérifiées sur la télé et non calibrées à la sonde. Le reste de la page s'appuie sur des tests publiés.", "nous n'affichons donc aucune valeur chiffrée. La page s'appuie sur des tests publiés.");
      fs.writeFileSync(f, h); n++; log.push(slug + " : valeurs proposées non vérifiées masquées");
    }
    continue;
  }
  if (h.includes("D'où viennent ces réglages") || h.includes("Guide de réglage non calibré")) continue; /* guides et fiches issues de documentes.json : données propres */
  const kept = [], hidden = [];
  for (const [title, usage, lab] of CARDS) {
    const re = new RegExp('(<section class="card"[^>]*><h2>' + title + '</h2>)(<p class="hint">[^<]*</p>)?([\\s\\S]*?)(</section>)');
    const m = re.exec(h);
    if (!m || !/class="set"/.test(m[3])) { if (m && /Réglages non documentés/.test(m[3])) hidden.push(lab); continue; }
    ctx.state.brand = info.brand; ctx.state.model = info.model; ctx.state.year = info.year; ctx.state.usage = usage;
    if (A.verifiedFor()) { kept.push(lab); continue; }
    h = h.replace(re, (all, a, hint, body, z) => a + (hint || "") + msg(info.brand) + z); hidden.push(lab);
  }
  if (!hidden.length) continue;
  const label = kept.length === 3 ? ALL3 : kept.length ? join(kept) : "non documentés";
  /* titres, descriptions, données structurées */
  h = h.replace(/(<title>Réglages [^<:]+ : )[^<|]*?( \| )/, "$1" + label + "$2").replace(/(<meta property="og:title" content="Réglages [^"]+ : )[^"|]*?( \||")/, (x, p1, p2) => p1 + label + p2);
  h = h.replace(/("headline":"Réglages [^"]+? : )[^"]*"/, "$1" + label + '"');
  const lv = (/<p class="lvl" data-level="(\d)"/.exec(h) || [])[1];
  const vid = h.includes("tirées d'une vidéo");
  const tech = (/<p class="lead">([^<]*?) · gamme/.exec(h) || [])[1];
  const desc = !kept.length ? `${name} (${tech}, ${gamme}) : réglages non documentés pour ce modèle, aucune valeur affichée.`
    : lv === "1" ? `${name} (${tech}, ${gamme}) : menus relevés sur le téléviseur, valeurs de départ pour ${join(kept)}. Non calibrées à la sonde.`
    : `${name} (${tech}, ${gamme}) : valeurs indicatives pour ${join(kept)}, ${vid ? "tirées d'une vidéo (source non identifiée), " : ""}non calibrées.`;
  h = h.replace(/(name="description" content=")[^"]*"/, (a, p) => p + esc(desc) + '"').replace(/(property="og:description" content=")[^"]*"/, (a, p) => p + esc(desc) + '"');
  /* chapô et résumé rapide */
  h = h.replace(/Choisissez votre usage : valeurs de départ à ajuster dans le menu de la télé\.|Valeurs documentées : [^<]*?\. Les autres usages sont signalés « non documentés »\./, kept.length ? `Valeurs documentées : ${join(kept)}. Les autres usages sont signalés « non documentés ».` : "Réglages non documentés pour ce modèle ; conseils généraux et autres modèles documentés ci-dessous.");
  const UL = { "cinéma": "Cinéma", "jeu": "Jeu vidéo", "sport": "Sport" };
  h = h.replace(/(<dt>Dans la fiche<\/dt><dd>)[^<]*(<\/dd>)/, (a, p1, p2) => p1 + (kept.length ? kept.map(x => UL[x]).join(", ") : "Conseils généraux") + p2);
  if (!kept.length) {
    h = h.replace(/(<p class="lvl" data-level="3"><b>)[\s\S]*?(<\/p>)/, (a, p1, p2) => p1 + "Niveau 3</b> · Réglages non documentés pour ce modèle : aucune valeur n'est affichée tant qu'une source propre au modèle n'est pas identifiée." + p2);
    h = h.replace(/<p class="note">Valeurs de départ pour un écran de 55 pouces[^<]*<\/p>\n?/, "");
  }
  if (h !== orig) { fs.writeFileSync(f, h); n++; log.push(slug + " : documenté " + (kept.join("+") || "aucun") + " ; masqué " + hidden.join("+") + " ; titre « " + label + " »"); }
}
/* hubs marque : pas de valeurs « repères » pour un modèle sans aucun usage documenté */
for (const hub of Object.values(A.HUB_PAGES)) {
  const f = path.join(root, hub.replace(/^\//, ""), "index.html"); if (!fs.existsSync(f)) continue;
  let h = fs.readFileSync(f, "utf8"), o = h, nodoc = 0, doc = 0;
  h = h.replace(/(<tr><td><a href="\/reglages\/([^"]+)\/">[^<]*<\/a><\/td><td>[^<]*<\/td><td>)([\s\S]*?)(<\/td><\/tr>)/g, (all, p1, slug, cell, p4) => {
    const pf = path.join(root, "reglages", slug, "index.html"); if (!fs.existsSync(pf)) return all;
    if (/<title>[^<]*: non documentés/.test(fs.readFileSync(pf, "utf8"))) { nodoc++; return p1 + "Réglages non documentés" + p4; }
    doc++; return all;
  });
  if (nodoc) h = h.replace(/(\d+) modèles, avec leur niveau de fiabilité/g, (x, c) => `${c} modèles (${doc} avec réglages documentés), avec leur niveau de fiabilité`);
  if (h !== o) { fs.writeFileSync(f, h); n++; log.push(hub + " : " + nodoc + " lignes non documentées ; " + doc + " conservées"); }
}
console.log(log.join("\n") + "\npages modifiées : " + n);
