// Génère les pages de rubriques (une URL par rubrique) à partir de index.html, qui reste la source unique.
//   node tools/gen_sections.js            -> écrit les dossiers de rubriques, le sitemap et les liens des pages /reglages/
//   OUT=/chemin/temporaire node tools/gen_sections.js   -> écrit ailleurs (test, rien n'est modifié dans le dépôt)
//
// Chaque page de rubrique = le même site (même design, même JavaScript) avec :
//   - son propre <title>, sa description, son adresse canonique et ses balises de partage ;
//   - le contenu de la rubrique déjà écrit dans le HTML (visible sans JavaScript) ;
//   - un bloc de texte spécifique (<section class="seo">) calculé à partir des données de l'appli ;
//   - des données structurées (JSON-LD).
//
// AJOUTER UNE PAGE MARQUE OU TECHNO PLUS TARD : voir BRAND_PAGES / TECH_PAGES en bas de ce fichier.
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const OUT = process.env.OUT || root;
const SITE = "https://monbonecran.fr";
const SRC = fs.readFileSync(path.join(root, "index.html"), "utf8");
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const today = new Date().toISOString().slice(0, 10);

/* ---------- pages de l'application (une par rubrique) ---------- */
const APP_PAGES = [
  { path: "/choisir-sa-tele/", mode: "buy", name: "Choisir sa télé",
    desc: "Choisissez votre téléviseur en 4 étapes : budget, taille d'écran, jeu vidéo et technologie (LED, QLED, Mini LED, OLED). Un top 3 clair, noté sur 10." },
  { path: "/regler-sa-tele/", mode: "set", name: "Régler sa télé",
    desc: "Les meilleurs réglages image pour votre télé (Samsung, LG, Sony, TCL, Hisense, Philips…) : cinéma, jeu vidéo ou sport. Valeurs à copier, menu par menu." },
  { path: "/classements-par-budget/", mode: "rank", name: "Classements par budget",
    desc: "Notre top 3 des téléviseurs pour chaque budget, de moins de 500 € à plus de 2 500 € : notes sur 10, technologies conseillées et points forts de chaque modèle." },
  { path: "/comparateur/", mode: "cmp", name: "Comparateur",
    desc: "Comparez 2 ou 3 téléviseurs de notre sélection : technologie, note sur 10, fréquence, HDMI 2.1, son, points forts et points faibles." },
  { path: "/guide-des-technologies/", mode: "tech", name: "Guide des technologies",
    desc: "LED, QLED, Mini LED ou OLED ? Les avantages, les limites et le budget habituel de chaque technologie de téléviseur, pour choisir selon votre pièce et vos usages." }
];

/* ---------- données lues dans l'appli elle-même (aucune donnée dupliquée) ---------- */
async function readApp(page) {
  return page.evaluate(() => {
    const d = {};
    d.budgets = BUDGETS.map(b => ({ l: b.l, h: b.h }));
    d.sizes = BSIZES.map(s => ({ l: s.l, h: s.h }));
    d.usages = Object.keys(USAGES).map(k => ({ l: USAGES[k].label, h: USAGES[k].hint }));
    d.brands = Object.keys(BRANDS);
    d.families = Array.from(new Set(Object.keys(DEVICES).map(k => DEVICES[k].family)));
    d.pool = poolModels().map(m => ({ k: m.k, c: m.c, p: m.p }));
    d.ranks = BUDGETS.map((b, k) => {
      state = freshState("rank"); state.rb = k; renderCore();
      return {
        l: b.l, h: b.h,
        tech: ((stage.querySelector(".set-name") || {}).textContent || "").replace(/^Technologie conseillée : /, ""),
        text: (stage.querySelector(".set .note") || {}).textContent || "",
        picks: Array.from(stage.querySelectorAll(".pick")).map(el => ({
          name: el.querySelector("b").textContent, score: (el.querySelector(".sc") || {}).textContent || "",
          line: el.querySelector("small").textContent
        }))
      };
    });
    d.routeTitles = ROUTE_TITLES;
    d.techFacts = BTECHS.map(b => ({ k: b.k, l: b.l, f: TECHFACTS[b.k] }));
    return d;
  });
}
async function prerender(page, mode) {
  return page.evaluate(m => {
    state = freshState(m); renderCore();
    return { stage: stage.innerHTML, crumbs: crumbs.textContent, progressHidden: document.getElementById("progress").hidden };
  }, mode);
}

/* ---------- blocs de texte spécifiques ---------- */
const brandOf = n => n.split(" ")[0];
function modelPages() {
  const dir = path.join(root, "reglages");
  return fs.readdirSync(dir).filter(f => fs.existsSync(path.join(dir, f, "index.html"))).sort().map(f => {
    const h = fs.readFileSync(path.join(dir, f, "index.html"), "utf8");
    const name = (/<h1>Réglages ([^<]+)<\/h1>/.exec(h) || [])[1] || f;
    const lead = (/<p class="lead">([^<]*?)\./.exec(h) || [])[1] || "";
    return { slug: f, name, lead, brand: brandOf(name) };
  });
}
const fr = s => s.replace(/ /g, " ");

function seoBuy(d) {
  return `<h2>Comment choisir sa télé en quatre questions</h2>
<p>Mon Bon Écran vous guide pas à pas : votre budget, la taille de l'écran, votre usage (jeu vidéo ou non) puis la technologie. À la fin, vous obtenez un top 3 de modèles de notre sélection, avec une note indicative sur 10 et un lien pour acheter.</p>
<h3>1. Votre budget</h3>
<ul>${d.budgets.map(b => `<li><b>${esc(b.l)}</b> : ${esc(b.h.toLowerCase())}</li>`).join("")}</ul>
<h3>2. La taille de l'écran</h3>
<p>Plus on est loin de l'écran, plus la diagonale peut être grande. Nos repères :</p>
<ul>${d.sizes.map(s => `<li><b>${esc(s.l)}</b> : ${esc(s.h.replace(/^Diagonale/, "diagonale").replace(" · ", ", "))}</li>`).join("")}</ul>
<h3>3. Vos usages</h3>
<p>Si vous jouez sur console, regardez la fréquence de l'écran (120 Hz ou plus) et la présence de ports HDMI 2.1 : ils permettent la 4K à 120 images par seconde et le VRR (fréquence variable). Pour la télévision et le streaming, une entrée de gamme bien choisie suffit souvent.</p>
<h3>4. La technologie</h3>
<p>LED pour les petits budgets, QLED pour des couleurs plus vives, Mini LED pour un salon très lumineux et les films en HDR, OLED pour des noirs parfaits le soir. Le détail est dans notre <a href="/guide-des-technologies/">guide des technologies</a>.</p>
<h3>Comment nous notons les modèles</h3>
<p>La note sur 10 est indicative : image 50 %, jeu vidéo 30 %, son 20 %. Elle est calculée d'après la fiche technique (type de dalle, formats HDR, fréquence, HDMI 2.1, audio), pas d'après des mesures en laboratoire.</p>
<p>Pour aller plus vite, consultez nos <a href="/classements-par-budget/">classements par budget</a> ou le <a href="/comparateur/">comparateur</a>. Une fois la télé choisie, voyez comment la <a href="/regler-sa-tele/">régler</a>.</p>`;
}
function seoSet(d) {
  const mp = modelPages();
  const groups = {};
  mp.forEach(m => (groups[m.brand] = groups[m.brand] || []).push(m));
  const order = d.brands.filter(b => groups[b]).concat(Object.keys(groups).filter(b => !d.brands.includes(b)));
  return `<h2>Régler sa télé : des réglages image faciles à copier</h2>
<p>Choisissez votre téléviseur (marque, modèle, taille) puis l'usage qui vous intéresse. Nous affichons les valeurs à reporter dans le menu de votre télé : mode d'image, luminosité, contraste, couleurs, netteté et fluidité des mouvements. Les noms de menus changent un peu selon la version du logiciel de votre téléviseur.</p>
<h3>Trois usages, trois jeux de réglages</h3>
<ul>${d.usages.map(u => `<li><b>${esc(u.l)}</b> : ${esc(u.h.charAt(0).toLowerCase() + u.h.slice(1))}</li>`).join("")}</ul>
<h3>Console de jeu ou box</h3>
<p>Une console ou une box peut aussi demander des réglages : ${d.families.map(esc).join(", ")}. Le réglage de la sortie vidéo (HDR, 4K, mode jeu) dépend de l'appareil et de la télé : nous l'indiquons pour chaque combinaison.</p>
<h3>Marques couvertes</h3>
<p>${d.brands.map(esc).join(", ")}. Vous ne trouvez pas votre modèle ? Le nom exact figure sur l'étiquette au dos de la télé ou dans les réglages (Assistance, À propos).</p>
<h3>Réglages par modèle</h3>
<p>Une page dédiée existe pour ces modèles, avec les valeurs de départ pour un écran de 55 pouces :</p>
${order.map(b => `<h4>${esc(b)}</h4><ul>${groups[b].map(m => `<li><a href="/reglages/${m.slug}/">Réglages ${esc(m.name)}</a>${m.lead ? " (" + esc(m.lead) + ")" : ""}</li>`).join("")}</ul>`).join("\n")}
<p>Pas encore de télé ? Commencez par <a href="/choisir-sa-tele/">choisir la bonne</a>.</p>`;
}
function seoRank(d) {
  return `<h2>Quel téléviseur choisir selon son budget ?</h2>
<p>Notre top 3 pour chacune des cinq tranches de prix, avec la technologie conseillée, la note indicative sur 10 et les atouts de chaque modèle. Les prix varient selon la taille et les promotions : vérifiez toujours chez le marchand.</p>
${d.ranks.map(r => `<h3>${esc(r.l)} (${esc(r.h.toLowerCase())})</h3>
<p>Technologie conseillée : <b>${esc(r.tech)}</b>. ${esc(r.text)}</p>
<ol>${r.picks.map(p => `<li><b>${esc(p.name)}</b>${p.score ? " : " + esc(fr(p.score)) : ""}. ${esc(p.line)}</li>`).join("")}</ol>`).join("\n")}
<h3>Comment lire les notes</h3>
<p>Note indicative sur 10 : image 50 %, jeu vidéo 30 %, son 20 %, calculée d'après la fiche technique (type de dalle, formats HDR, fréquence, HDMI 2.1, audio). Ce ne sont pas des mesures en laboratoire.</p>
<p>Besoin d'aide pour trancher ? Lisez le <a href="/guide-des-technologies/">guide des technologies</a>, utilisez le <a href="/comparateur/">comparateur</a>, ou laissez-vous guider par <a href="/choisir-sa-tele/">Choisir sa télé</a>.</p>`;
}
function seoCmp(d) {
  const by = {};
  d.budgets.forEach(b => (by[b.l] = []));
  d.pool.forEach(m => by[d.budgets[m.p].l].push(m.c[0] + " " + m.c[1] + " (" + m.c[3] + ")"));
  return `<h2>Comparer des téléviseurs côte à côte</h2>
<p>Sélectionnez deux ou trois modèles de notre sélection : le comparateur les met face à face sur les critères qui comptent vraiment.</p>
<h3>Ce que compare le tableau</h3>
<ul><li><b>Technologie, année et budget</b> du modèle</li><li><b>Note sur 10</b> (image 50 %, jeu 30 %, son 20 %)</li><li><b>Fréquence</b> de l'écran, en hertz</li><li><b>HDMI et jeu vidéo</b> : nombre de ports, HDMI 2.1, 4K 120 Hz</li><li><b>Son</b> : puissance des haut-parleurs</li><li><b>Points forts et points faibles</b></li></ul>
<h3>Comment lire les écarts</h3>
<p>Une fréquence de 120 Hz ou plus et des ports HDMI 2.1 comptent surtout si vous jouez sur console. Pour les films, la technologie de dalle (OLED, Mini LED) et la luminosité pèsent davantage. La note résume l'ensemble, mais elle reste indicative : ce ne sont pas des mesures en laboratoire.</p>
<h3>Les ${d.pool.length} modèles comparables</h3>
${d.budgets.map(b => `<p><b>${esc(b.l)}</b> : ${by[b.l].length ? by[b.l].map(esc).join(", ") : "aucun modèle pour l'instant"}.</p>`).join("\n")}
<p>Pas sûr de votre budget ? Consultez les <a href="/classements-par-budget/">classements par budget</a>.</p>`;
}
function seoTech(d) {
  return `<h2>LED, QLED, Mini LED ou OLED : laquelle choisir ?</h2>
<p>Quatre technologies se partagent le marché. Elles diffèrent surtout par la façon d'éclairer l'image, ce qui change le contraste, la luminosité et le prix.</p>
<h3>Les définitions en bref</h3>
<ul>
<li><b>LED</b> : un écran LCD éclairé par des diodes. Simple et économique.</li>
<li><b>QLED</b> : un écran LCD éclairé par des diodes avec une couche de « boîtes quantiques » qui rend les couleurs plus vives.</li>
<li><b>Mini LED</b> : un LCD rétroéclairé par de très nombreuses petites diodes, regroupées en zones. L'image est plus lumineuse et plus contrastée.</li>
<li><b>OLED</b> : chaque point de l'image produit sa propre lumière. Quand il est éteint, le noir est parfait.</li>
</ul>
<h3>Choisir selon votre pièce et vos usages</h3>
<ul>
<li><b>Salon lumineux ou sport en journée</b> : Mini LED ou QLED.</li>
<li><b>Films le soir, pièce sombre</b> : OLED.</li>
<li><b>Jeu sur console</b> : OLED ou Mini LED avec 120 Hz et HDMI 2.1.</li>
<li><b>Petit budget, télévision et streaming</b> : LED ou QLED d'entrée de gamme.</li>
</ul>
<h3>Budget habituel</h3>
<ul>${d.techFacts.map(t => `<li><b>${esc(t.l)}</b> : ${esc(t.f.budget || "")}</li>`).join("")}</ul>
<p>Prêt à choisir ? Voyez les <a href="/classements-par-budget/">classements par budget</a> ou laissez-vous guider par <a href="/choisir-sa-tele/">Choisir sa télé</a>.</p>`;
}
const SEO = { buy: seoBuy, set: seoSet, rank: seoRank, cmp: seoCmp, tech: seoTech };

/* ---------- données structurées ---------- */
function crumbsLD(items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0], item: SITE + it[1] })) };
}
const WEBSITE_LD = { "@context": "https://schema.org", "@type": "WebSite", name: "Mon Bon Écran", url: SITE + "/", inLanguage: "fr-FR",
  description: "Choisir et régler sa télé : conseils d'achat, comparateur et réglages image." };

function ldFor(pg, d) {
  pg.title = d.routeTitles[pg.path];
  const out = [
    jsonld({ "@context": "https://schema.org", "@type": "WebPage", name: pg.title, description: pg.desc, url: SITE + pg.path, inLanguage: "fr-FR", isPartOf: { "@type": "WebSite", url: SITE + "/" } }),
    jsonld(crumbsLD([["Accueil", "/"], [pg.name, pg.path]]))];
  if (pg.mode === "rank") {
    let n = 0;
    out.push(jsonld({ "@context": "https://schema.org", "@type": "ItemList", name: "Top 3 des téléviseurs par budget",
      itemListElement: d.ranks.flatMap(r => r.picks.map(p => ({ "@type": "ListItem", position: ++n, name: p.name + " (" + r.l + ")" }))) }));
  }
  return out.join("\n");
}

/* ---------- assemblage d'une page de rubrique à partir de index.html ---------- */
const SEO_CSS = `<style>
.seo{margin:6px 14px 10px; font-size:.86rem; line-height:1.6; color:var(--muted)}
.seo h2{font-family:var(--f-display); font-weight:800; font-size:1.08rem; letter-spacing:-.02em; color:var(--fg); margin:14px 0 6px}
.seo h3{font-family:var(--f-display); font-weight:800; font-size:.95rem; color:var(--fg); margin:14px 0 4px}
.seo h4{font-size:.88rem; font-weight:700; color:var(--fg); margin:10px 0 2px}
.seo p{margin:0 0 8px}
.seo ul,.seo ol{margin:0 0 8px; padding-left:20px}
.seo li{margin:2px 0}
.seo a{color:var(--accent)}
</style>`;
function must(s, a, b) { if (!s.includes(a)) throw new Error("Ancre introuvable dans index.html : " + a.slice(0, 60)); return s.replace(a, () => b); }

function buildPage(pg, d, pre, seoHtml, ld) {
  let h = SRC;
  pg.title = d.routeTitles[pg.path];
  const url = SITE + pg.path;
  h = h.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(pg.title)}</title>`);
  h = h.replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(pg.desc)}">`);
  h = h.replace(/<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${url}">`);
  h = h.replace(/<meta property="og:title" content="[^"]*">/, () => `<meta property="og:title" content="${esc(pg.title)}">`);
  h = h.replace(/<meta property="og:description" content="[^"]*">/, () => `<meta property="og:description" content="${esc(pg.desc)}">`);
  h = h.replace(/<meta property="og:url" content="[^"]*">/, () => `<meta property="og:url" content="${url}">`);
  h = must(h, '<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">');
  h = must(h, "</head>", SEO_CSS + "\n" + ld + "\n</head>");
  h = must(h, "<body>", '<body class="is-flow">');
  h = must(h, /<main id="stage" class="list">[\s\S]*?<\/main>/.exec(h)[0], `<main id="stage" class="list">${pre.stage}</main>`);
  h = must(h, '<div class="crumbs" id="crumbs"></div>', `<div class="crumbs" id="crumbs">${esc(pre.crumbs)}</div>`);
  if (pre.progressHidden) h = must(h, 'id="progress"', 'id="progress" hidden');
  h = must(h, "<footer ", `<section class="seo" id="seo">\n${seoHtml}\n</section>\n  <footer `);
  return h;
}

/* ---------- sitemap ---------- */
function gitDate(rel) {
  try { const s = execSync(`git log -1 --format=%cs -- "${rel}"`, { cwd: root }).toString().trim(); return s || today; } catch (e) { return today; }
}
function sitemap(extraPaths) {
  const urls = [["/", today]].concat(APP_PAGES.map(p => [p.path, today]),
    ["mentions-legales.html", "confidentialite.html"].map(f => ["/" + f, gitDate(f)]),
    modelPages().map(m => ["/reglages/" + m.slug + "/", gitDate("reglages/" + m.slug + "/index.html")]),
    extraPaths.map(p => [p, today]));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([p, d]) => `<url><loc>${SITE}${p}</loc><lastmod>${d}</lastmod></url>`).join("\n") + `\n</urlset>\n`;
}

/* ---------- pages /reglages/<modèle>/ : lien de retour vers la rubrique + fil d'Ariane (idempotent) ---------- */
function patchModelPages() {
  let n = 0;
  for (const m of modelPages()) {
    const f = path.join(root, "reglages", m.slug, "index.html");
    let h = fs.readFileSync(f, "utf8");
    if (h.includes('data-crumb="regler"')) continue;
    const top = '<a class="top" href="/">‹ Mon Bon Écran</a>';
    if (!h.includes(top)) continue;
    h = h.replace(top, () => top + ' <a class="top" data-crumb="regler" href="/regler-sa-tele/" style="margin-left:10px">· Régler sa télé</a>');
    const ld = jsonld(crumbsLD([["Accueil", "/"], ["Régler sa télé", "/regler-sa-tele/"], ["Réglages " + m.name, "/reglages/" + m.slug + "/"]]));
    h = h.replace("</head>", () => ld + "\n</head>");
    const out = path.join(OUT, "reglages", m.slug); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), h); n++;
  }
  return n;
}

/* ---------- pages de contenu légères (marques, technologies) : prêtes à l'emploi, pas encore utilisées ----------
   Ajouter une entrée dans BRAND_PAGES ou TECH_PAGES, puis relancer ce script. Exemple d'entrée :
   { path: "/marques/philips/", name: "Philips", title: "Télévisions Philips : Ambilight, OLED, notre avis | Mon Bon Écran",
     desc: "…", html: "<h2>…</h2><p>…</p><ul><li><a href='/reglages/philips-oled849/'>…</a></li></ul>" }
   La page est générée avec le même habillage que les pages /reglages/, un fil d'Ariane et son entrée dans le sitemap. */
const BRAND_PAGES = [];
const TECH_PAGES = [];
function contentPage(pg, parent) {
  const url = SITE + pg.path;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pg.title)}</title>
<meta name="description" content="${esc(pg.desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#FFF8F1">
<meta property="og:type" content="article"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Mon Bon Écran">
<meta property="og:title" content="${esc(pg.title)}"><meta property="og:description" content="${esc(pg.desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icon-512.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>:root{--bg:#FFFAF6;--fg:#2A1B4D;--muted:#7A6E92;--accent:#F26A1B}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 Inter,-apple-system,Helvetica,Arial,sans-serif}main{max-width:640px;margin:0 auto;padding:20px 16px 48px}a{color:var(--accent)}.top{font:800 15px Manrope,sans-serif;text-decoration:none}h1{font:800 26px/1.2 Manrope,sans-serif;margin:16px 0 8px}h2{font:800 20px Manrope,sans-serif;margin:22px 0 6px}</style>
${jsonld(WEBSITE_LD)}
${jsonld(crumbsLD([["Accueil", "/"], [parent[0], parent[1]], [pg.name, pg.path]]))}
</head><body><main>
<a class="top" href="/">‹ Mon Bon Écran</a> <a class="top" href="${parent[1]}" style="margin-left:10px">· ${esc(parent[0])}</a>
<h1>${esc(pg.name)}</h1>
${pg.html}
<p style="font-size:14px;color:var(--muted)">Site indépendant, non affilié aux marques citées. <a href="/mentions-legales.html" style="color:inherit">Mentions légales</a></p>
</main></body></html>`;
}

/* ---------- exécution ---------- */
(async () => {
  const br = await chromium.launch();
  const page = await br.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(root, "index.html"));
  await page.waitForFunction(() => typeof renderCore === "function" && typeof freshState === "function");
  const d = await readApp(page);
  for (const pg of APP_PAGES) {
    const pre = await prerender(page, pg.mode);
    const html = buildPage(pg, d, pre, SEO[pg.mode](d), ldFor(pg, d));
    const dir = path.join(OUT, pg.path); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
    console.log("OK", pg.path, (html.length / 1024).toFixed(0) + " Ko");
  }
  const extra = [];
  for (const [list, parent] of [[BRAND_PAGES, ["Régler sa télé", "/regler-sa-tele/"]], [TECH_PAGES, ["Guide des technologies", "/guide-des-technologies/"]]]) {
    for (const pg of list) {
      const dir = path.join(OUT, pg.path); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.html"), contentPage(pg, parent)); extra.push(pg.path); console.log("OK", pg.path);
    }
  }
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap(extra));
  console.log("sitemap.xml OK ; pages /reglages/ mises à jour :", patchModelPages());
  await br.close();
  if (errors.length) { console.error("Erreurs JS :", errors); process.exit(1); }
})();
