// Génère les pages « guide de réglage non calibré » (niveau 3) à partir de tools/principes.json.
// Aucune valeur chiffrée de réglage : uniquement des faits sourcés. Usage : node tools/gen_principes.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const SITE = "https://monbonecran.fr";
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const src = fs.readFileSync(path.join(__dirname, "gen_pages.js"), "utf8");
// En-tête et styles communs, repris des pages existantes (une seule source d'habillage)
const head0 = src.slice(src.indexOf('<meta name="viewport"'), src.indexOf("<title>"));
const cs = src.indexOf("<style>\n:root"), css = src.slice(cs, src.indexOf("</style>", cs) + 8);
const LEVEL3 = "Guide de réglage non calibré : les recommandations ne remplacent pas une calibration professionnelle.";
const ul = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "principes.json"), "utf8"));
const out = [];
for (const d of data) {
  const name = `${d.brand} ${d.model}`, s = slug(name), url = `${SITE}/reglages/${s}/`;
  const title = `Réglages ${name} : modes et conseils`;
  const desc = `Quel mode image choisir sur le ${name} (${d.tech}, ${d.year}) : cinéma, jeu, sport, HDR. Guide non calibré, sources citées, sans valeurs inventées.`;
  const ld = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[["Accueil","/"],["Régler sa télé","/regler-sa-tele/"],["Réglages "+name,"/reglages/"+s+"/"]].map((it,i)=>({"@type":"ListItem",position:i+1,name:it[0],item:SITE+it[1]}))});
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
${head0}<title>${esc(title)} | Mon Bon Écran</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#FFF8F1">
<meta property="og:type" content="article"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Mon Bon Écran">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icon-512.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
${css}
<script type="application/ld+json">${ld}</script>
</head><body><main>
<a class="top" href="/">‹ Mon Bon Écran</a> <a class="top" data-crumb="regler" href="/regler-sa-tele/" style="margin-left:10px">· Régler sa télé</a>
<h1>Réglages ${esc(name)}</h1>
<p class="lead">${esc(d.tech)} · gamme ${esc(d.year)}. Modes conseillés et fonctions à connaître, sans valeurs chiffrées.</p>
<p class="lvl" data-level="3"><b>Niveau 3</b> · ${esc(LEVEL3)}</p>
<section class="card"><h2>Présentation</h2><p>${esc(d.intro)}</p>${ul(d.specs)}</section>
<section class="card"><h2>Quel mode d'image choisir ?</h2>${d.modes.map(m => `<p><b>${esc(m[0])}</b> : ${esc(m[1])}</p>`).join("")}</section>
<section class="card"><h2>Traitements d'image</h2>${d.traitements.map(m => `<p><b>${esc(m[0])}</b> : ${esc(m[1])}</p>`).join("")}</section>
<section class="card"><h2>HDR et Dolby Vision</h2>${ul(d.hdr)}</section>
<section class="card"><h2>Jeu vidéo</h2>${ul(d.gaming)}</section>
<section class="card"><h2>À activer ou désactiver</h2>${ul(d.options)}</section>
<section class="card"><h2>Sources</h2><ul>${d.sources.map(x => `<li><a href="${esc(x[1])}" rel="nofollow noopener" target="_blank">${esc(x[0])}</a></li>`).join("")}</ul>
<p class="note">Ces tests portent surtout sur les versions britanniques et américaines : références, tailles, firmwares et options peuvent différer en France. Les valeurs chiffrées (rétroéclairage, contraste, netteté…) seront ajoutées quand un relevé ou un test spécialisé identifiable sera disponible.</p></section>
<a class="cta" href="/">Régler selon ma taille d'écran</a>
<p class="note">Site indépendant, non affilié aux marques citées. <a href="/mentions-legales.html" style="color:inherit">Mentions légales</a></p>
</main><script src="/mbe-analytics.js" defer></script></body></html>`;
  fs.mkdirSync(path.join(root, "reglages", s), { recursive: true });
  fs.writeFileSync(path.join(root, "reglages", s, "index.html"), html);
  out.push(s);
}
console.log("OK", out.join(" "));
