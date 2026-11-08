// Génère des pages statiques par modèle à partir des données de index.html (aucune donnée dupliquée).
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const lines = html.split("\n");
const start = lines.findIndex(l => l.startsWith("var YEARS"));
const end = lines.findIndex(l => l.startsWith("var state ="));
const src = lines.slice(start, end).join("\n");
const ctx = { window: {}, state: { model: null, usage: null, brand: null } };
vm.createContext(ctx);
vm.runInContext(src + "\n;this.api={BRANDS,USAGES,settingsFor,verifiedFor,sizeTip,isOledModel,VERIFIED};", ctx);
const A = ctx.api;
const SITE = "https://monbonecran.fr";
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

function findModel(brand, model) {
  const ms = A.BRANDS[brand].models;
  for (const y of Object.keys(ms)) for (const m of ms[y]) if (m[0] === model) return { year: y, tech: m[1], unconfirmed: !!m[2] };
  return null;
}

function sheet(brand, model, usage) {
  ctx.state.brand = brand; ctx.state.model = model; ctx.state.usage = usage;
  const v = A.verifiedFor();
  return { items: vm.runInContext(`settingsFor(${JSON.stringify(brand)},${JSON.stringify(usage)},55)`, ctx), path: v ? v.path : A.BRANDS[brand].path, verified: !!v, note: !v ? "Valeurs de départ affichées à titre d'exemple. Les noms de menus changent selon la version du logiciel de votre téléviseur." : v.game ? "Réglages pour le jeu et le sport en direct. Les noms de menus peuvent varier selon la version du logiciel de votre téléviseur." : v.unverified ? "Valeurs tirées d'une vidéo, à tester sur un film que vous connaissez. Les noms de menus peuvent varier selon la version du logiciel." : "Noms de menus relevés sur une vraie télé de ce modèle. Valeurs de départ : ajustez-les selon votre pièce et ce que vous regardez." };
}

function page(brand, model) {
  const info = findModel(brand, model);
  const name = `${brand} ${model}`;
  const s = slug(name);
  const url = `${SITE}/reglages/${s}/`;
  const title = `Réglages ${name} : cinéma, jeu vidéo et sport`;
  const desc = `Les meilleurs réglages image pour votre ${name} (${info.tech}, ${info.year}) : mode cinéma, jeu vidéo (PS5, Xbox) et sport. Valeurs à copier, menu par menu.`;
  let body = "";
  for (const u of Object.keys(A.USAGES)) {
    const sh = sheet(brand, model, u);
    body += `<section class="card"><h2>${esc(A.USAGES[u].label)}</h2><p class="hint">${esc(A.USAGES[u].hint)}</p><p class="path">${esc(sh.path)}</p>`;
    for (const x of sh.items) {
      const val = x.num !== undefined ? x.num : x.val;
      body += `<div class="set"><span>${esc(x.name)}</span><b>${esc(val)}</b></div>` + (x.num !== undefined ? `<div class="meter"><i style="width:${x.num}%"></i></div>` : "");
    }
    body += `<p class="note">${esc(sh.note)}</p></section>`;
  }
  const note = `Valeurs de départ pour un écran de 55 pouces, à ajuster selon votre pièce et vos goûts. Les noms de menus changent selon la version du logiciel de votre téléviseur.`;
  return { slug: s, name, html: `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>html{touch-action:manipulation;-webkit-text-size-adjust:100%}</style>
<script>["gesturestart","gesturechange","gestureend"].forEach(function(e){document.addEventListener(e,function(ev){ev.preventDefault()},{passive:false})});var _lt=0;document.addEventListener("touchend",function(ev){var n=Date.now();if(n-_lt<350)ev.preventDefault();_lt=n},{passive:false});document.addEventListener("touchmove",function(ev){if(ev.touches.length>1)ev.preventDefault()},{passive:false});</script>
<title>${esc(title)} | Mon Bon Écran</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#d3d8dc">
<meta property="og:type" content="article"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Mon Bon Écran">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icon-512.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<style>
@font-face{font-family:"Archivo Black";font-display:swap;src:url(/fonts/archivo-black-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:Archivo;font-weight:500;font-display:swap;src:url(/fonts/archivo-latin-500-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-weight:600;font-display:swap;src:url(/fonts/ibm-plex-mono-latin-600-normal.woff2) format("woff2")}
:root{--bg:#d3d8dc;--surface:#eceff1;--fg:#0f1113;--muted:#4a525a;--line:rgba(15,17,19,.25);--accent:#1448c8;--orange:#ff4b1f;--noir:"Archivo Black",Impact,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:500 17px/1.5 Archivo,Arial,sans-serif}
.bandeau{background:#000;display:flex;justify-content:space-between;gap:10px;padding:9px 16px;font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#9aa4ad}.bandeau b{font:400 11px var(--noir);color:#fff}
main{max-width:640px;margin:0 auto;padding:18px 16px 48px}
.top{font:600 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent);text-decoration:none}
h1{font:400 clamp(1.9rem,9vw,2.6rem)/.95 var(--noir);text-transform:uppercase;letter-spacing:-.02em;margin:18px 0 8px}
.lead{color:#2a3036;margin:0 0 18px}
.card{background:var(--surface);border:2px solid var(--fg);box-shadow:4px 4px 0 var(--fg);padding:16px;margin:16px 4px 18px 0}
h2{font:400 1.15rem var(--noir);text-transform:uppercase;margin:0}.hint{color:var(--muted);margin:2px 0 8px;font-size:15px}
.path{background:#fff;border:1px solid var(--line);padding:8px 10px;font:600 13px var(--mono);margin:0 0 10px}
.set{display:flex;justify-content:space-between;gap:12px;padding:8px 0 2px;border-top:1px solid var(--line)}.set b{text-align:right;font-family:var(--mono);font-weight:600;font-size:.9rem}
.meter{height:5px;background:#b8bfc5}.meter i{display:block;height:100%;background:var(--accent)}
.note{color:var(--muted);font-size:14px}
.cta{display:block;text-align:center;background:var(--fg);color:#fff;font:400 1rem var(--noir);text-transform:uppercase;text-decoration:none;padding:15px;margin:22px 0}
a{color:var(--accent)}
.mbe-ck{border:2px solid #0f1113!important;border-radius:0!important;background:#eceff1!important;box-shadow:4px 4px 0 #0f1113!important;color:#0f1113!important}
.mbe-ck h2{font:600 .8rem var(--mono)!important;letter-spacing:.1em;text-transform:uppercase;color:#0f1113!important;border:0!important;padding:0!important}
.mbe-ck a{color:#1448c8!important}
.mbe-ck button{border-radius:0!important;background:#0f1113!important;border-color:#0f1113!important;color:#fff!important;font-family:var(--noir)!important;font-weight:400!important;text-transform:uppercase}
.mbe-ck button:nth-child(2){background:#1448c8!important}
.mbe-ckl{background:none!important;color:inherit!important}
</style>
<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[["Accueil","/"],["Régler sa télé","/regler-sa-tele/"],["Réglages "+name,"/reglages/"+s+"/"]].map((it,i)=>({"@type":"ListItem",position:i+1,name:it[0],item:SITE+it[1]}))})}</script></head><body><div class="bandeau"><span><b>TV</b> + RÉGLAGES</span><span>Cinéma · Jeu · Sport</span></div><main>
<a class="top" href="/">‹ Mon Bon Écran</a> <a class="top" data-crumb="regler" href="/regler-sa-tele/" style="margin-left:10px">· Régler sa télé</a>
<h1>Réglages ${esc(name)}</h1>
<p class="lead">${esc(info.tech)} · gamme ${esc(info.year)}. Choisissez votre usage et recopiez les valeurs dans le menu de la télé.</p>
${body}
<p class="note">${esc(note)}</p>
<a class="cta" href="/">Régler selon ma taille d'écran</a>
<p class="note">Site indépendant, non affilié aux marques citées. <a href="/mentions-legales.html" style="color:inherit">Mentions légales</a></p>
</main><script src="/mbe-analytics.js" defer></script></body></html>` };
}

const targets = process.argv.slice(2).map(a => a.split("|"));
const outDir = process.env.OUT || path.join(root, "reglages");
for (const [b, m] of targets) {
  const p = page(b, m);
  fs.mkdirSync(path.join(outDir, p.slug), { recursive: true });
  fs.writeFileSync(path.join(outDir, p.slug, "index.html"), p.html);
  console.log("OK", p.slug);
}
