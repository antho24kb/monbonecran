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
const ANALYTICS_TAG = '<script src="/mbe-analytics.js" defer></script>';
const jsonld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const today = new Date().toISOString().slice(0, 10);

/* ---------- pages de l'application (une par rubrique) ---------- */
const APP_PAGES = [
  { path: "/choisir-sa-tele/", mode: "buy", name: "Choisir sa télé",
    desc: "Quelle TV choisir en 2026 ? Répondez à 4 questions (budget, taille d'écran, jeu vidéo, technologie) et obtenez un top 3 clair, noté sur 10." },
  { path: "/regler-sa-tele/", mode: "set", name: "Régler sa télé",
    desc: "Le meilleur réglage image pour votre TV 4K (Samsung, LG, Sony, TCL, Hisense, Philips…) : cinéma, jeu vidéo ou sport. Valeurs à copier, menu par menu." },
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
const brandOf = n => n.split(" ")[0];
/* Pages pivots de marque (/reglages/<marque>/) : une entrée par marque à publier. En ajouter une ici suffit. */
const HUBS = [
  { brand: "Samsung", slug: "samsung", kw: "Réglage TV Samsung" },
  { brand: "LG", slug: "lg", kw: "Réglage TV LG" },
  { brand: "TCL", slug: "tcl", kw: "Réglage TV TCL" }
];
const HUB_SLUGS = HUBS.map(h => h.slug);
/* Écran d'ordinateur : pages modèle avec Cinéma, Jeu vidéo et Sport côte à côte ; pages de marque plus larges. Rien ne change sur téléphone. */
const DESK_MODEL = `<style id="desk">@media (min-width:1000px) and (hover:hover){body{background:radial-gradient(900px 600px at -10% -10%,rgba(255,138,31,.16),transparent 60%),radial-gradient(800px 600px at 110% 0%,rgba(139,77,255,.12),transparent 60%),var(--bg)}main{max-width:1240px;padding:36px 32px 64px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:20px;align-items:start}main>*{grid-column:1/-1}main>a.top{grid-row:1;justify-self:start}main>a.top+a.top{margin-left:150px!important}main>section.card:nth-of-type(-n+3){grid-column:auto;margin:6px 0}h1{font-size:40px;margin-top:22px}.lead{font-size:19px;max-width:60ch}main>section.card:nth-of-type(n+4),main>.note,main>.cta{max-width:820px}.cta{max-width:420px!important}}</style>`;
const DESK_HUB = `<style id="desk">@media (min-width:1000px) and (hover:hover){body{background:radial-gradient(900px 600px at -10% -10%,rgba(255,138,31,.16),transparent 60%),radial-gradient(800px 600px at 110% 0%,rgba(139,77,255,.12),transparent 60%),var(--bg)}main{max-width:1100px;padding:36px 32px 64px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px;align-items:start}main>*{grid-column:1/-1}main>a.top{grid-row:1;justify-self:start}main>a.top+a.top{margin-left:150px!important}main>section.card:nth-of-type(1),main>section.card:nth-of-type(2){grid-column:auto}h1{font-size:40px;margin-top:22px}.lead{font-size:19px;max-width:62ch}.cta{max-width:420px}}</style>`;
const hubOf = brand => HUBS.find(h => h.brand === brand);
function modelPages() {
  const dir = path.join(root, "reglages");
  return fs.readdirSync(dir).filter(f => !HUB_SLUGS.includes(f) && fs.existsSync(path.join(dir, f, "index.html"))).sort().map(f => {
    const h = fs.readFileSync(path.join(dir, f, "index.html"), "utf8");
    const name = (/<h1>Réglages ([^<]+)<\/h1>/.exec(h) || [])[1] || f;
    const lead = (/<p class="lead">([^<]*?)\./.exec(h) || [])[1] || "";
    /* carte Cinéma de la page publiée : chemin de menu et deux repères (déjà échappés en HTML) */
    const cine = (/<section class="card"><h2>Cinéma<\/h2>([\s\S]*?)<\/section>/.exec(h) || [])[1] || "";
    const sets = Array.from(cine.matchAll(/<div class="set"><span>([^<]*)<\/span><b>([^<]*)<\/b>/g)).map(x => ({ n: x[1].split(" &gt; ").pop(), full: x[1], v: x[2] }));
    const lum = sets.find(i => /luminosité/i.test(i.n) && !/HDR|maximale|noir|dynamique|logo|IA/i.test(i.full)), net = sets.find(i => /nettet/i.test(i.n));
    return { slug: f, name, lead, brand: brandOf(name), cpath: (/<p class="path">([^<]*)<\/p>/.exec(cine) || [])[1] || "", keys: [lum, net].filter(Boolean) };
  });
}
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
<p>Pour aller plus vite, consultez nos <a href="/classements-par-budget/">classements par budget</a> ou le <a href="/comparateur/">comparateur</a>. Une fois la télé choisie, voyez comment la <a href="/regler-sa-tele/">régler</a>.</p>`;
}
function seoSet(d) {
  const mp = modelPages();
  const groups = {};
  mp.forEach(m => (groups[m.brand] = groups[m.brand] || []).push(m));
  const order = d.brands.filter(b => groups[b]).concat(Object.keys(groups).filter(b => !d.brands.includes(b)));
  const hubs = HUBS.filter(h => groups[h.brand]);
  return `<h1>Meilleur réglage image TV 4K : les valeurs à copier, modèle par modèle</h1>
<p>Le meilleur réglage image dépend de votre téléviseur : chaque marque a ses menus et chaque modèle ses valeurs. Choisissez votre télé (marque, modèle, taille) puis l'usage qui vous intéresse. Nous affichons les valeurs à reporter dans le menu : mode d'image, luminosité, contraste, couleurs, netteté et fluidité des mouvements. Les noms de menus changent un peu selon la version du logiciel de votre téléviseur.</p>
<h2>Les réglages de base à vérifier sur toute TV 4K</h2>
<p>Avant les valeurs propres à votre modèle, quatre réglages changent déjà l'image sur n'importe quelle télé :</p>
<ul>
<li><b>Le mode d'image</b> : pour les films et les séries, choisissez Cinéma, Film ou Filmmaker Mode plutôt que Dynamique ou Vif.</li>
<li><b>La température de couleur</b> : le réglage Chaud est le plus proche de l'image voulue par les réalisateurs. Elle paraît un peu jaune au début, puis l'œil s'habitue.</li>
<li><b>Le lissage des mouvements</b> : désactivez-le pour les films (il donne l'effet « feuilleton »), gardez-le faible pour le sport.</li>
<li><b>La réduction de bruit et la netteté</b> : coupez la réduction de bruit sur une source de bonne qualité et gardez une netteté basse, sinon l'image paraît artificielle.</li>
</ul>
<p>Pour le jeu vidéo, activez le mode Jeu de la télé : il réduit le retard à l'affichage. Ce sont des points de départ, pas une calibration à la sonde : ajustez selon votre pièce et vos goûts.</p>
${hubs.length ? `<h2>Réglages par marque</h2>
<ul>${hubs.map(h => `<li><a href="/reglages/${h.slug}/">${esc(h.kw)}</a> : les menus de la marque et les ${groups[h.brand].length > 1 ? groups[h.brand].length + " modèles détaillés" : "modèles détaillés"}</li>`).join("")}</ul>` : ""}
<h2>Trois usages, trois jeux de réglages</h2>
<ul>${d.usages.map(u => `<li><b>${esc(u.l)}</b> : ${esc(u.h.charAt(0).toLowerCase() + u.h.slice(1))}</li>`).join("")}</ul>
<h2>Console de jeu ou box</h2>
<p>Une console ou une box peut aussi demander des réglages : ${d.families.map(esc).join(", ")}. Le réglage de la sortie vidéo (HDR, 4K, mode jeu) dépend de l'appareil et de la télé : nous l'indiquons pour chaque combinaison.</p>
<h2>Marques couvertes</h2>
<p>${d.brands.map(esc).join(", ")}. Vous ne trouvez pas votre modèle ? Le nom exact figure sur l'étiquette au dos de la télé ou dans les réglages (Assistance, À propos).</p>
<h2>Réglages par modèle</h2>
<p>Une page dédiée existe pour ces modèles, avec les valeurs de départ pour un écran de 55 pouces :</p>
${order.map(b => `<h3>${esc(b)}</h3><ul>${groups[b].map(m => `<li><a href="/reglages/${m.slug}/">Réglages ${esc(m.name)}</a>${m.lead ? " (" + esc(m.lead) + ")" : ""}</li>`).join("")}</ul>`).join("\n")}
<p>Pas encore de télé ? Commencez par <a href="/choisir-sa-tele/">choisir la bonne</a>.</p>`;
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
function sitemap(extraPaths) {
  const urls = [["/", today]].concat(APP_PAGES.map(p => [p.path, today]),
    ["mentions-legales.html", "confidentialite.html", "methodologie.html"].filter(f => fs.existsSync(path.join(root, f))).map(f => ["/" + f, gitDate(f)]),
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
    let h = fs.readFileSync(f, "utf8"), changed = false;
    const top = '<a class="top" href="/">‹ Mon Bon Écran</a>';
    if (!h.includes('data-crumb="regler"') && h.includes(top)) {
      h = h.replace(top, () => top + ' <a class="top" data-crumb="regler" href="/regler-sa-tele/" style="margin-left:10px">· Régler sa télé</a>');
      const ld = jsonld(crumbsLD([["Accueil", "/"], ["Régler sa télé", "/regler-sa-tele/"], ["Réglages " + m.name, "/reglages/" + m.slug + "/"]]));
      h = h.replace("</head>", () => ld + "\n</head>"); changed = true;
    }
    /* titre court (moins de 60 caractères quand c'est possible) */
    const t2 = h.replace(/(<title>[^<]*?|<meta property="og:title" content="[^"]*?) : cinéma, jeu vidéo et sport/g, "$1 : cinéma, jeu, sport");
    if (t2 !== h) { h = t2; changed = true; }
    const t3 = h.replace(/<title>([^<]{45,}) \| Mon Bon Écran<\/title>/, (all, t) => (t.length + 16 > 60 ? `<title>${t}</title>` : all));
    if (t3 !== h) { h = t3; changed = true; }
    /* liens internes : page de la marque, autres modèles de la marque, sinon modèles de même technologie */
    const all = modelPages(), fam = x => /OLED/.test(x.lead) ? "OLED" : /Mini LED|Neo QLED/.test(x.lead) ? "Mini LED" : /QLED|QNED/.test(x.lead) ? "QLED" : "LED";
    const sib = all.filter(x => x.brand === m.brand && x.slug !== m.slug), hub = hubOf(m.brand);
    const other = sib.length >= 2 ? [] : all.filter(x => x.brand !== m.brand && fam(x) === fam(m)).filter((x, i, arr) => arr.findIndex(y => y.brand === x.brand) === i).slice(0, 4);
    const li = x => `<li><a href="/reglages/${x.slug}/">Réglages ${esc(x.name)}</a></li>`;
    const block = `<section class="card" id="autres-reglages" data-rel="liens"><h2>Autres réglages</h2>` +
      (hub ? `<p><a href="/reglages/${hub.slug}/">${esc(hub.kw)}</a> : les menus et les modes de la marque.</p>` : "") +
      (sib.length ? `<p class="hint">Autres modèles ${esc(m.brand)}</p><ul>${sib.map(li).join("")}</ul>` : "") +
      (other.length ? `<p class="hint">Même technologie, autres marques</p><ul>${other.map(li).join("")}</ul>` : "") + `</section>\n`;
    const h3 = h.replace(/<section class="card" id="autres-reglages" data-rel="liens">[\s\S]*?<\/section>\n/, "");
    const cta = '<a class="cta" href="/">';
    if (h3.includes(cta)) { const h4 = h3.replace(cta, () => block + cta); if (h4 !== h) { h = h4; changed = true; } }
    { const h5 = h.replace(/<style id="desk">[\s\S]*?<\/style>\n/, "").replace("</head>", () => DESK_MODEL + "\n</head>"); if (h5 !== h) { h = h5; changed = true; } }
    /* niveau de fiabilité des réglages (1 : relevé sur la télé · 2 : test spécialisé identifiable · 3 : non calibré) */
    {
      const LVL_CSS = '<style id="lvl">.lvl{background:#F4EEFF;border-left:4px solid #8B4DFF;border-radius:10px;padding:8px 12px;font-size:14px;margin:0 0 14px}.lvl[data-level="1"]{border-color:#2E9E5B}.lvl[data-level="3"]{border-color:#F26A1B}</style>\n';
      let lvl = null;
      if (/data-level="3"/.test(h) && h.includes("Guide de réglage non calibré")) lvl = null;
      else if (h.includes("relevés sur une vraie télé") || m.slug === "philips-oled849") lvl = ['1', "Niveau 1</b> · Menus relevés sur le téléviseur. Les valeurs chiffrées restent des points de départ, non calibrées à la sonde."];
      else if (h.includes("tirées d'une vidéo") || h.includes("tirées d’une vidéo")) lvl = ['3', "Niveau 3</b> · Valeurs indicatives tirées d'une vidéo (source non identifiée), non calibrées : à tester sur un film que vous connaissez."];
      else lvl = ['3', "Niveau 3</b> · Valeurs de départ non calibrées, à ajuster selon votre pièce et vos goûts."];
      let h6 = h.replace(/<style id="lvl">[\s\S]*?<\/style>\n/, "");
      h6 = h6.replace("</head>", () => LVL_CSS + "</head>");
      if (lvl) {
        h6 = h6.replace(/<p class="lvl"[^>]*>[\s\S]*?<\/p>\n?/, "");
        h6 = h6.replace(/(<p class="lead">[^<]*<\/p>\n?)/, (all) => all.replace(/\n?$/, "\n") + `<p class="lvl" data-level="${lvl[0]}"><b>` + lvl[1] + "</p>\n");
      }
      if (h6 !== h) { h = h6; changed = true; }
    }
    /* mesure d'audience + consentement : script commun à toutes les pages */
    if (!h.includes("/mbe-analytics.js")) { h = h.replace("</body>", () => ANALYTICS_TAG + "</body>"); changed = true; }
    if (!changed) continue;
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
/* Page pivot d'une marque : tout vient des données de l'appli et des pages modèle déjà publiées (aucune valeur inventée). */
function hubPage(hub, d) {
  const B = d.brandInfo[hub.brand], mp = modelPages().filter(m => m.brand === hub.brand);
  const years = Object.keys(B.years).sort().reverse();
  const covered = years.reduce((n, y) => n + B.years[y].length, 0);
  const rows = mp.map(m => {
    return `<tr><td><a href="/reglages/${m.slug}/">${esc(m.name.slice(hub.brand.length + 1))}</a></td><td>${esc(m.lead.replace(" · gamme ", ", "))}</td><td>${m.keys.length ? m.keys.map(k => `${k.n} : <b>${k.v}</b>`).join("<br>") : "voir la page"}</td></tr>`;
  }).join("");
  const seen = new Set(), paths = mp.map(m => m.cpath).filter(p => { const k = p.toLowerCase().replace(/s\b/g, ""); if (!p || seen.has(k)) return false; seen.add(k); return true; });
  const one = mp.length === 1;
  const html = `<p class="lead">Les menus image des téléviseurs ${esc(hub.brand)}, les modes à choisir pour le cinéma, le jeu vidéo et le sport, et ${one ? "la page de réglages détaillée du " + esc(mp[0].name) : "les pages de réglages détaillées de " + mp.length + " modèles"}.</p>
<section class="card"><h2>Où se trouvent les réglages image sur une TV ${esc(hub.brand)} ?</h2>
<p>Sur la plupart des téléviseurs ${esc(hub.brand)}, le chemin est :</p><p class="path">${esc(B.path)}</p>
${paths.length ? `<p>Sur les modèles que nous détaillons, nous avons relevé ${paths.length > 1 ? "ces chemins" : "ce chemin"} :</p>${paths.map(p => `<p class="path">${p}</p>`).join("")}` : ""}
<p class="note">Les noms de menus changent selon l'année du téléviseur et la version de son logiciel. Cherchez l'intitulé le plus proche.</p></section>
<section class="card"><h2>Quel mode d'image choisir sur une TV ${esc(hub.brand)} ?</h2>
<div class="set"><span>Films et séries</span><b>${esc(B.modes.cinema)}</b></div>
<div class="set"><span>Jeu vidéo (console, PC)</span><b>${esc(B.modes.jeu)}</b></div>
<div class="set"><span>Sport en direct</span><b>${esc(B.modes.sport)}</b></div>
<p>Le mode d'image est le réglage qui change le plus le rendu : il fixe d'un coup les couleurs, le contraste et les traitements. Pour un film, évitez les modes Dynamique ou Vif. Pour le jeu, le mode Jeu réduit le retard à l'affichage.</p>
<p>Ensuite, vérifiez trois réglages : la température de couleur sur Chaud pour les films, le lissage des mouvements désactivé pour les films et faible pour le sport, la réduction de bruit coupée sur une source de bonne qualité.</p></section>
<section class="card"><h2>${one ? "Réglages détaillés du " + esc(mp[0].name) : "Réglages " + esc(hub.brand) + " par modèle"}</h2>
<p>${one ? "Cette page donne" : "Chaque page donne"} les valeurs à recopier, menu par menu, pour le cinéma, le jeu vidéo et le sport.</p>
<div class="tw"><table><thead><tr><th>Modèle</th><th>Technologie, gamme</th><th>Repères en mode cinéma</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section class="card"><h2>Votre TV ${esc(hub.brand)} n'est pas dans la liste ?</h2>
<p>Notre outil couvre ${covered} modèles ${esc(hub.brand)} de ${years[years.length - 1]} à ${years[0]}. Sans page dédiée, il affiche des valeurs de départ communes à la marque, à adapter à votre télé.</p>
${years.map(y => B.years[y].length ? `<p><b>Gamme ${y}</b> : ${B.years[y].map(m => esc(m.n)).join(", ")}.</p>` : "").join("")}
<a class="cta" href="/regler-sa-tele/">Trouver les réglages de ma TV ${esc(hub.brand)}</a>
<p class="note">Le nom exact du modèle figure sur l'étiquette au dos de la télé ou dans les réglages (Assistance, À propos).</p></section>
<p class="note">Valeurs de départ, à ajuster selon votre pièce et vos goûts : ce n'est pas une calibration à la sonde. Mon Bon Écran est un guide indépendant, non affilié au fabricant ${esc(hub.brand)}.</p>`;
  const title = `${hub.kw} : les meilleurs réglages | Mon Bon Écran`;
  return { path: `/reglages/${hub.slug}/`, name: hub.kw, h1: `${hub.kw} : les meilleurs réglages image`, title,
    desc: `Réglage image d'une TV ${hub.brand} : où trouver les menus, quel mode choisir (cinéma, jeu vidéo, sport) et les valeurs à copier pour ${one ? "le " + mp[0].name : mp.length + " modèles"}.`, html };
}
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
<style>:root{--bg:#FFFAF6;--fg:#2A1B4D;--muted:#7A6E92;--accent:#F26A1B}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 Inter,-apple-system,Helvetica,Arial,sans-serif}main{max-width:640px;margin:0 auto;padding:20px 16px 48px}a{color:var(--accent)}.top{font:800 15px Manrope,sans-serif;text-decoration:none}h1{font:800 26px/1.2 Manrope,sans-serif;margin:16px 0 8px}h2{font:800 20px Manrope,sans-serif;margin:22px 0 6px}
.lead{color:var(--muted);margin:0 0 18px}.card{background:#fff;border:1px solid rgba(90,50,160,.12);border-radius:18px;padding:16px;margin:14px 0}.card h2{margin:0 0 8px}.card p{margin:0 0 10px}
.path{background:#F4EEFF;border-radius:10px;padding:8px 10px;font-size:14px}.set{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(90,50,160,.12)}.set b{text-align:right}
.note{color:var(--muted);font-size:14px}.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid rgba(90,50,160,.12);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
.cta{display:block;text-align:center;background:var(--accent);color:#fff;font:800 16px Manrope,sans-serif;text-decoration:none;padding:14px;border-radius:999px;margin:16px 0 12px}</style>
${DESK_HUB}
${jsonld(WEBSITE_LD)}
${jsonld(crumbsLD([["Accueil", "/"], [parent[0], parent[1]], [pg.name, pg.path]]))}
</head><body><main>
<a class="top" href="/">‹ Mon Bon Écran</a> <a class="top" href="${parent[1]}" style="margin-left:10px">· ${esc(parent[0])}</a>
<h1>${esc(pg.h1 || pg.name)}</h1>
${pg.html}
<p style="font-size:14px;color:var(--muted)">Site indépendant, non affilié aux marques citées. <a href="/mentions-legales.html" style="color:inherit">Mentions légales</a></p>
</main><script src="/mbe-analytics.js" defer></script></body></html>`;
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
  HUBS.filter(hb => modelPages().some(m => m.brand === hb.brand)).forEach(hb => BRAND_PAGES.push(hubPage(hb, d)));
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
