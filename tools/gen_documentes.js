// Génère les fiches « réglages documentés » à partir de tools/data/documentes.json (données publiques, sources citées).
// Niveau 2 : réglages issus d'un test spécialisé identifiable (modèle exact, source citée). Niveau 3 : recommandations de tests publiés, sans valeur chiffrée.
// Aucune valeur n'est déduite ni reprise d'un modèle voisin. Usage : node tools/gen_documentes.js, puis node tools/gen_sections.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const SITE = "https://monbonecran.fr";
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const src = fs.readFileSync(path.join(__dirname, "gen_pages.js"), "utf8");
const head0 = src.slice(src.indexOf('<meta name="viewport"'), src.indexOf("<title>"));
const cs = src.indexOf("<style>\n:root"), css = src.slice(cs, src.indexOf("</style>", cs) + 8);
const LVL2 = "Réglages issus d'un test spécialisé identifiable, modèle exact précisé. Ils ne remplacent pas une calibration sur votre exemplaire.";
const LVL3 = "Guide de réglage non calibré : les recommandations ne remplacent pas une calibration professionnelle.";
const ul = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
const rows = a => a.map(x => `<div class="set"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join("");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "documentes.json"), "utf8"));
const out = [];
for (const d of data) {
  const name = `${d.brand} ${d.model}`, s = slug(name), url = `${SITE}/reglages/${s}/`;
  const title = d.level === 2 ? `Réglages ${name} : SDR, HDR, jeu` : `Réglages ${name} : modes et conseils`;
  const desc = d.level === 2
    ? `${name} (${d.tech}, ${d.year}) : réglages SDR, HDR et jeu issus du test RTINGS de ce modèle exact. Source citée, non calibrés sur votre exemplaire.`
    : `${name} (${d.tech}, ${d.year}) : réglages recommandés par des tests publiés, sans valeur chiffrée. Guide non calibré, sources citées.`;
  const ld = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[["Accueil","/"],["Régler sa télé","/regler-sa-tele/"],["Réglages "+name,"/reglages/"+s+"/"]].map((it,i)=>({"@type":"ListItem",position:i+1,name:it[0],item:SITE+it[1]}))});
  const ldArt = JSON.stringify({"@context":"https://schema.org","@type":"TechArticle",headline:"Réglages "+name,description:desc,inLanguage:"fr-FR",mainEntityOfPage:{"@type":"WebPage","@id":url},publisher:{"@type":"Organization",name:"Mon Bon Écran",url:SITE+"/"},about:{"@type":"Thing",name:name}});
  let body = `<section class="card"><h2>D'où viennent ces réglages</h2>${ul(d.provenance)}</section>\n`;
  if (d.level === 2) {
    body += `<section class="card" id="s-cinema"><h2>Cinéma</h2><p class="hint">SDR : films et séries</p><p class="path">${esc(d.path)}</p>${rows(d.sdr)}</section>\n`;
    body += `<section class="card" id="s-hdr"><h2>HDR</h2><p class="hint">Contenus HDR (Dolby Vision ou HDR10)</p><p class="path">${esc(d.path)}</p>${rows(d.hdr)}</section>\n`;
    body += `<section class="card" id="s-jeu-video"><h2>Jeu vidéo</h2><p class="path">${esc(d.path)}</p>${rows(d.jeu)}<p class="note">${esc(d.jeuNote)}</p></section>\n`;
  } else {
    body += `<section class="card"><h2>Réglages recommandés</h2><p class="path">${esc(d.path)}</p>${rows(d.doc)}</section>\n`;
  }
  body += `<section class="card"><h2>Sources</h2><ul>${d.sources.map(x => `<li><a href="${esc(x[1])}" rel="nofollow noopener" target="_blank">${esc(x[0])}</a></li>`).join("")}</ul><p class="note">Les noms de menus peuvent varier selon la version du logiciel et le pays. Aucune valeur n'est reprise d'un autre modèle.</p></section>\n`;
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
<script type="application/ld+json">${ldArt}</script>
</head><body><main>
<a class="top" href="/">‹ Mon Bon Écran</a> <a class="top" data-crumb="regler" href="/regler-sa-tele/" style="margin-left:10px">· Régler sa télé</a>
<h1>Réglages ${esc(name)}</h1>
<p class="lead">${esc(d.tech)} · gamme ${esc(d.year)}. ${esc(d.lead)}</p>
<p class="lvl" data-level="${d.level}"><b>Niveau ${d.level}</b> · ${esc(d.level === 2 ? LVL2 : LVL3)}</p>
${body}<a class="cta" href="/">Régler selon ma taille d'écran</a>
<p class="note">Site indépendant, non affilié aux marques citées. <a href="/mentions-legales.html" style="color:inherit">Mentions légales</a></p>
</main><script src="/mbe-analytics.js" defer></script></body></html>`;
  fs.mkdirSync(path.join(root, "reglages", s), { recursive: true });
  fs.writeFileSync(path.join(root, "reglages", s, "index.html"), html);
  out.push(s);
}
console.log("OK", out.join(" "));
