// Génère une page /reglages/<marque>-<modèle>/ pour chaque modèle de l'outil « Régler sa télé » qui n'en a pas encore,
// met à jour la table MODEL_PAGES de /regler-sa-tele/ et ajoute les pages au sitemap.
//   NODE_PATH=$(npm root -g) node tools/gen_reglages_modeles.js
// Les pages existantes (écrites à la main) ne sont jamais modifiées. Idempotent : relancer régénère uniquement les pages créées par ce script.
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");
const SITE = "https://monbonecran.fr";
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const MARK = "<!-- page générée : tools/gen_reglages_modeles.js -->";
const HUBS = { Samsung: "samsung", LG: "lg", TCL: "tcl" };
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto("file://" + path.join(root, "regler-sa-tele/index.html"));
  await page.waitForTimeout(500);
  const data = await page.evaluate(() => {
    const list = [];
    Object.keys(BRANDS).forEach(br => { const ms = BRANDS[br].models; Object.keys(ms).forEach(y => ms[y].forEach(m => {
      if (m[2]) return;
      state.brand = br; state.model = m[0]; state.year = y;
      const u = {};
      Object.keys(USAGES).forEach(k => {
        const v = verifiedFor();
        u[k] = { path: v ? v.path : BRANDS[br].path, items: settingsFor(br, k, 55), game: !!(v && v.game) };
      });
      list.push({ brand: br, model: m[0], year: y, tech: m[1], guide: guideFor(br, m[0], y), usages: u });
    })); });
    return { list, usages: USAGES, notes: Object.fromEntries(Object.keys(BRANDS).map(k => [k, BRANDS[k].modes])) };
  });
  await b.close();

  const isHand = f => { const x = path.join(root, "reglages", f, "index.html"); return fs.existsSync(x) && !fs.readFileSync(x, "utf8").includes(MARK); };
  const existing = new Set(fs.readdirSync(path.join(root, "reglages")).filter(isHand));
  const nameCount = {};
  data.list.forEach(m => { const s = slugify(m.brand + " " + m.model); nameCount[s] = (nameCount[s] || 0) + 1; });
  const gen = [];
  data.list.forEach(m => {
    const base = slugify(m.brand + " " + m.model), dup = nameCount[base] > 1;
    if (m.guide) { m.slug = m.guide.split("/")[2]; m.own = true; return; }
    if (existing.has(base + "-" + m.year)) { m.slug = base + "-" + m.year; m.own = true; return; }
    if (!dup && existing.has(base)) { m.slug = base; m.own = true; return; }
    m.slug = dup ? base + "-" + m.year : base;
    m.own = false; gen.push(m);
  });

  const head = fs.readFileSync(path.join(root, "reglages/samsung-s95h/index.html"), "utf8");
  const css = head.slice(head.indexOf("<style>\n:root"), head.indexOf('<script type="application/ld+json">'));
  const extra = head.slice(head.indexOf('<style id="desk">'), head.indexOf("</head>"));
  const pre = head.slice(0, head.indexOf("<title>"));
  const lvlLegend = /<details class="lvl-legend"[\s\S]*?<\/details>/.exec(head)[0];

  const setRows = items => items.map(x => '<div class="set"><span>' + esc(x.name) + "</span><b>" + esc(x.num !== undefined ? x.num : x.val) + "</b></div>" + (x.num !== undefined ? '<div class="meter"><i style="width:' + Math.min(100, x.num) + '%"></i></div>' : "")).join("");

  gen.forEach(m => {
    const name = m.brand + " " + m.model, url = "/reglages/" + m.slug + "/";
    const sib = data.list.filter(x => x.brand === m.brand && x.year === m.year && x.slug !== m.slug).slice(0, 14);
    const title = "Réglages " + name + " : valeurs de départ | Mon Bon Écran";
    const desc = name + " (" + m.tech + ", " + m.year + ") : chemin des menus et valeurs de départ pour le cinéma, le jeu vidéo et le sport. Valeurs génériques de la marque, non calibrées.";
    const ld = [
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [["Accueil", "/"], ["Régler sa télé", "/regler-sa-tele/"], ["Réglages " + name, url]].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c[0], item: SITE + c[1] })) },
      { "@context": "https://schema.org", "@type": "TechArticle", headline: "Réglages " + name, description: desc, inLanguage: "fr-FR", mainEntityOfPage: { "@type": "WebPage", "@id": SITE + url }, publisher: { "@type": "Organization", name: "Mon Bon Écran", url: SITE + "/" }, about: { "@type": "Thing", name } }
    ].map(o => '<script type="application/ld+json">' + JSON.stringify(o) + "</script>").join("\n");
    let secs = "";
    Object.keys(data.usages).forEach(k => {
      const u = m.usages[k], U = data.usages[k];
      secs += '<section class="card" id="s-' + k + '"><h2>' + esc(U.label) + "</h2><p class=\"hint\">" + esc(U.hint) + "</p><p class=\"path\">" + esc(u.path) + "</p>" + setRows(u.items) + "</section>\n";
    });
    const body = `<body><main>
${MARK}
<nav class="crumb" aria-label="Fil d'Ariane"><a href="/">Accueil</a><i aria-hidden="true">›</i><a href="/regler-sa-tele/">Régler sa télé</a><i aria-hidden="true">›</i><span aria-current="page">Réglages ${esc(name)}</span></nav>
<h1>Réglages ${esc(name)}</h1>
<p class="lead">${esc(m.tech)} · gamme ${esc(m.year)}. Valeurs de départ génériques de la marque, pour un écran de 55 pouces.</p>
<p class="lvl" data-level="3"><b>Niveau 3</b> · Valeurs de départ génériques de la marque, non vérifiées pour ce modèle. Elles ne sont pas calibrées : prenez-les comme point de départ et ajustez-les à votre goût.</p>
${lvlLegend}
${secs}<section class="card" id="s-notes"><h2>À savoir</h2><p>Les noms de menus changent selon la version du logiciel de votre téléviseur. Sur un écran de 75 pouces ou plus, gardez la netteté basse ; sur un petit écran (50 pouces et moins), vous pouvez l'augmenter de quelques points si l'image paraît douce.</p><p class="note">Aucune de ces valeurs n'a été relevée sur le ${esc(name)} lui-même. Elles seront remplacées par de vrais réglages dès qu'un relevé ou un test spécialisé identifiable sera disponible.</p></section>
<section class="card" id="autres-reglages" data-rel="liens"><h2>Autres réglages</h2>${HUBS[m.brand] ? `<p><a href="/reglages/${HUBS[m.brand]}/">Réglage TV ${esc(m.brand)}</a> : les menus et les modes de la marque.</p>` : ""}<p class="hint">Autres modèles ${esc(m.brand)} ${esc(m.year)}</p><ul>${sib.map(x => `<li><a href="/reglages/${x.slug}/">Réglages ${esc(x.brand + " " + x.model)}</a></li>`).join("")}</ul></section>
<a class="cta" href="/regler-sa-tele/">Régler un autre modèle</a>
<p class="note">Site indépendant, non affilié aux marques citées. <a href="/mentions-legales.html" style="color:inherit">Mentions légales</a></p>
</main><script src="/mbe-analytics.js" defer></script></body></html>
`;
    const html = pre + "<title>" + esc(title) + '</title>\n<meta name="description" content="' + esc(desc) + '">\n<link rel="canonical" href="' + SITE + url + '">\n<meta name="theme-color" content="#FFF8F1">\n<meta property="og:type" content="article"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Mon Bon Écran">\n<meta property="og:title" content="' + esc("Réglages " + name + " : valeurs de départ") + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:url" content="' + SITE + url + '"><meta property="og:image" content="' + SITE + '/icon-512.png">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">\n<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">\n' + css + ld + "\n" + extra + "</head>" + body;
    const dir = path.join(root, "reglages", m.slug); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  });

  /* table modèle -> adresse, injectée dans l'outil */
  const map = {};
  data.list.forEach(m => { map[m.brand + "|" + m.model + "|" + m.year] = "/reglages/" + m.slug + "/"; });
  const tp = path.join(root, "regler-sa-tele/index.html");
  let t = fs.readFileSync(tp, "utf8");
  const line = "var MODEL_PAGES = " + JSON.stringify(map) + ";";
  if (/^var MODEL_PAGES = .*;$/m.test(t)) t = t.replace(/^var MODEL_PAGES = .*;$/m, () => line);
  else t = t.replace("var GUIDE_YEARS =", () => "/* Adresse propre de chaque modèle (générée par tools/gen_reglages_modeles.js). */\n" + line + "\nvar GUIDE_YEARS =");
  fs.writeFileSync(tp, t);

  /* sitemap */
  const sp = path.join(root, "sitemap.xml");
  let sm = fs.readFileSync(sp, "utf8");
  const urls = new Set(); data.list.forEach(m => urls.add("/reglages/" + m.slug + "/"));
  Object.values(HUBS).forEach(h => urls.add("/reglages/" + h + "/"));
  let add = "";
  [...urls].sort().forEach(u => { if (!sm.includes("<loc>" + SITE + u + "</loc>")) add += "<url><loc>" + SITE + u + "</loc><lastmod>" + today + "</lastmod></url>\n"; });
  sm = sm.replace("</urlset>", () => add + "</urlset>");
  fs.writeFileSync(sp, sm);
  console.log("modèles", data.list.length, "pages créées", gen.length, "pages existantes rattachées", data.list.length - gen.length, "URL ajoutées au sitemap", (add.match(/<url>/g) || []).length);
})();
