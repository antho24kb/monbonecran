// Génère les pages de rubriques (une URL par rubrique) à partir de index.html, qui reste la source unique.
//   node tools/gen_sections.js            -> écrit les dossiers de rubriques et le sitemap
//   OUT=/chemin/temporaire node tools/gen_sections.js   -> écrit ailleurs (test, rien n'est modifié dans le dépôt)
//
// Chaque page de rubrique = le même site (même design, même JavaScript) avec :
//   - son propre <title>, sa description, son adresse canonique et ses balises de partage ;
//   - le contenu de la rubrique déjà écrit dans le HTML (visible sans JavaScript) ;
//   - un bloc de texte spécifique (<section class="seo">) calculé à partir des données de l'appli ;
//   - des données structurées (JSON-LD).
//
// Le site est recentré sur « Trouver sa télé » : plus de pages de réglages (archive : étiquette git archive-reglages-avant-recentrage).
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const OUT = process.env.OUT || root;
const SITE = "https://monbonecran.fr";
const SRC = fs.readFileSync(path.join(root, "index.html"), "utf8");
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ANALYTICS_TAG = '<script src="/mbe-analytics.js" defer></script>';
const jsonld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const today = new Date().toISOString().slice(0, 10);

/* ---------- pages de l'application (une par rubrique) ---------- */
const APP_PAGES = [
  { path: "/choisir-sa-tele/", mode: "buy", name: "Choisir sa télé",
    desc: "Quelle TV choisir en 2026 ? Répondez à 4 questions (budget, taille d'écran, jeu vidéo, technologie) et obtenez un top 3 clair, noté sur 10." },
  { path: "/classements-par-budget/", mode: "rank", name: "Classements par budget",
    desc: "La meilleure TV qualité-prix pour chaque budget, de moins de 500 € à plus de 2 500 € : top 3, notes sur 10, technologie conseillée et points forts." },
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
    d.brands = Object.keys(BRANDS);
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
    d.brandInfo = {};
    Object.keys(BRANDS).forEach(b => {
      const B = BRANDS[b], years = {};
      YEARS.forEach(y => { years[y] = (B.models[y] || []).filter(m => !m[2]).map(m => ({ n: m[0], t: m[1] })); });
      d.brandInfo[b] = { path: B.path, modes: B.modes, years };
    });
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

const fr = s => s.replace(/ /g, " ");

function seoBuy(d) {
  return `<h1>Quelle TV choisir en 2026 ? La réponse en quatre questions</h1>
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
<p>Pour aller plus vite, consultez nos <a href="/classements-par-budget/">classements par budget</a> ou le <a href="/comparateur/">comparateur</a>.</p>`;
}
function seoRank(d) {
  return `<h1>Meilleure TV qualité-prix : notre top 3 pour chaque budget</h1>
<p>Notre top 3 pour chacune des cinq tranches de prix, avec la technologie conseillée, la note indicative sur 10 et les atouts de chaque modèle. Les prix varient selon la taille et les promotions : vérifiez toujours chez le marchand.</p>
${d.ranks.map(r => `<h3>${esc(r.l)} (${esc(r.h.toLowerCase())})</h3>
<p>Technologie conseillée : <b>${esc(r.tech)}</b>. ${esc(r.text)}</p>
<ol>${r.picks.map(p => `<li><b>${esc(p.name)}</b>${p.score ? " (note " + esc(fr(p.score)) + ")" : ""} : ${esc(p.line)}</li>`).join("")}</ol>`).join("\n")}
<h3>Comment lire les notes</h3>
<p>Note indicative sur 10 : image 50 %, jeu vidéo 30 %, son 20 %, calculée d'après la fiche technique (type de dalle, formats HDR, fréquence, HDMI 2.1, audio). Ce ne sont pas des mesures en laboratoire.</p>
<p>Besoin d'aide pour trancher ? Lisez le <a href="/guide-des-technologies/">guide des technologies</a>, utilisez le <a href="/comparateur/">comparateur</a>, ou laissez-vous guider par <a href="/choisir-sa-tele/">Choisir sa télé</a>.</p>`;
}
function seoCmp(d) {
  const by = {};
  d.budgets.forEach(b => (by[b.l] = []));
  d.pool.forEach(m => by[d.budgets[m.p].l].push(m.c[0] + " " + m.c[1] + " (" + m.c[3] + ")"));
  return `<h1>Comparateur de téléviseurs : 2 ou 3 modèles côte à côte</h1>
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
  return `<h1>LED, QLED, Mini LED ou OLED : quelle technologie de TV choisir ?</h1>
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
const SEO = { buy: seoBuy, rank: seoRank, cmp: seoCmp, tech: seoTech };


/* ---------- données structurées ---------- */
function crumbsLD(items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0], item: SITE + it[1] })) };
}
const WEBSITE_LD = { "@context": "https://schema.org", "@type": "WebSite", name: "Mon Bon Écran", url: SITE + "/", inLanguage: "fr-FR",
  description: "Trouver sa télé et identifier son modèle : conseils d'achat, comparateur et classements par budget." };

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
.seo h1,.seo h2{font-family:var(--f-display); font-weight:800; font-size:1.08rem; letter-spacing:-.02em; color:var(--fg); margin:14px 0 6px; line-height:1.25; text-wrap:balance}
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
  /* Le logo est un <h1> dans index.html (accueil). Ici il devient <div class="bm"> avec exactement les mêmes styles :
     les sélecteurs CSS « h1 » et les deux sélecteurs JavaScript sont renommés, rien d'autre ne change. */
  h = h.replace(/<style>[\s\S]*?<\/style>/g, css => css.replace(/(^|[\s,>}])h1(?=[\s,{.:])/g, "$1.bm"));
  h = must(h, '<h1 role="link" tabindex="0" aria-label="Retour à l\'accueil"><span>Mon Bon</span> <span class="tv">Écran</span></h1>',
    '<div class="bm" role="link" tabindex="0" aria-label="Retour à l\'accueil"><span>Mon Bon</span> <span class="tv">Écran</span></div>');
  h = must(h, 'e.target.closest("h1, .mark")', 'e.target.closest(".bm, .mark")');
  h = must(h, 'document.querySelector("#top h1")', 'document.querySelector("#top .bm")');
  if (/<h1[\s>]/.test(h.replace(/<script[\s\S]*?<\/script>/g, ""))) throw new Error("Il reste un <h1> issu de index.html");
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
function sitemap() {
  const urls = [["/", today]].concat(APP_PAGES.map(p => [p.path, today]),
    ["mentions-legales.html", "confidentialite.html", "methodologie.html"].filter(f => fs.existsSync(path.join(root, f))).map(f => ["/" + f, gitDate(f)]));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([p, d]) => `<url><loc>${SITE}${p}</loc><lastmod>${d}</lastmod></url>`).join("\n") + `\n</urlset>\n`;
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
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap());
  console.log("sitemap.xml OK");
  await br.close();
  if (errors.length) { console.error("Erreurs JS :", errors); process.exit(1); }
})();
