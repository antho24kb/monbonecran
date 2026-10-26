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
<meta name="theme-color" content="#FFF8F1">
<meta property="og:type" content="article"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Mon Bon Écran">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icon-512.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#FFFAF6;--surface:#fff;--fg:#2A1B4D;--muted:#7A6E92;--line:rgba(90,50,160,.12);--accent:#F26A1B;--soft:#F4EEFF;--track:#EBE3F7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.5 Inter,-apple-system,Helvetica,Arial,sans-serif}
main{max-width:640px;margin:0 auto;padding:20px 16px 48px}
.top{font:800 15px Manrope,sans-serif;color:var(--accent);text-decoration:none}
h1{font:800 26px/1.2 Manrope,sans-serif;margin:16px 0 6px}
.lead{color:var(--muted);margin:0 0 18px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px;margin:14px 0}
h2{font:800 20px Manrope,sans-serif;margin:0}.hint{color:var(--muted);margin:2px 0 8px;font-size:15px}
.path{background:var(--soft);border-radius:10px;padding:8px 10px;font-size:14px;margin:0 0 10px}
.set{display:flex;justify-content:space-between;gap:12px;padding:8px 0 2px}.set b{text-align:right}
.meter{height:5px;background:var(--track);border-radius:3px}.meter i{display:block;height:100%;background:var(--accent);border-radius:3px}
.note{color:var(--muted);font-size:14px}
.cta{display:block;text-align:center;background:var(--accent);color:#fff;font:800 16px Manrope,sans-serif;text-decoration:none;padding:14px;border-radius:999px;margin:20px 0}
</style></head><body><main>
<a class="top" href="/">‹ Mon Bon Écran</a>
<h1>Réglages ${esc(name)}</h1>
<p class="lead">${esc(info.tech)} · gamme ${esc(info.year)}. Choisissez votre usage et recopiez les valeurs dans le menu de la télé.</p>
${body}
<p class="note">${esc(note)}</p>
<a class="cta" href="/">Régler selon ma taille d'écran</a>
<p class="note">Site indépendant, non affilié aux marques citées. <a href="/mentions-legales.html" style="color:inherit">Mentions légales</a></p>
</main></body></html>` };
}

const targets = process.argv.slice(2).map(a => a.split("|"));
const outDir = process.env.OUT || path.join(root, "reglages");
for (const [b, m] of targets) {
  const p = page(b, m);
  fs.mkdirSync(path.join(outDir, p.slug), { recursive: true });
  fs.writeFileSync(path.join(outDir, p.slug, "index.html"), p.html);
  console.log("OK", p.slug);
}
