# Outils de génération

`index.html` est la **source unique** de l'application. Les pages suivantes en sont dérivées :

| Commande | Génère |
|---|---|
| `node tools/gen_pages.js "Marque|Modèle"` | une page de réglages `/reglages/<modèle>/` |
| `node tools/gen_sections.js` | les 5 pages de rubriques, `sitemap.xml`, et le lien « Régler sa télé » des pages `/reglages/` |

**À relancer `node tools/gen_sections.js` après chaque modification de `index.html`**, puis publier tout le dossier
(les pages de rubriques sont des copies de `index.html` avec leur propre contenu).

Les titres des rubriques viennent de `ROUTE_TITLES` dans `index.html` (une seule source).

## Guides « non calibrés » (niveau 3)
`node tools/gen_principes.js` génère les pages guides à partir de `principes.json`. Ce fichier de travail est **privé** : il est conservé hors du dépôt (dossier `monbonecran-prive/` à côté du dépôt, ou variable `MBE_PRIVATE`). Les pages générées sont, elles, publiées. Lancer ensuite `node tools/gen_sections.js`.

## Ajouter une page marque ou technologie
Dans `tools/gen_sections.js`, ajouter une entrée à `BRAND_PAGES` ou `TECH_PAGES` (`path`, `name`, `title`, `desc`, `html`),
relancer le script : la page, son fil d'Ariane (JSON-LD) et son entrée de sitemap sont créés.

## Mesure d'audience (Google Analytics 4) et consentement

Tout est dans **un seul fichier commun : `/mbe-analytics.js`** (identifiant `G-1SSN7H2506`, bandeau, Consent Mode v2, `page_view`, `affiliate_click`, lien « Gérer mes cookies »).

- Une page est instrumentée dès qu'elle contient `<script src="/mbe-analytics.js" defer></script>` avant `</body>`.
- Les générateurs (`gen_pages.js`, `gen_sections.js`, y compris `BRAND_PAGES` / `TECH_PAGES`) l'ajoutent automatiquement. `gen_sections.js` l'ajoute aussi, de façon idempotente, aux pages `/reglages/` existantes.
- Pour une page écrite à la main : copier la ligne ci-dessus. Rien d'autre à faire.
- Rien n'est chargé chez Google avant « Accepter ». Pour changer l'identifiant, la durée (6 mois) ou les textes du bandeau : modifier uniquement `mbe-analytics.js`.
- Ce fichier est indépendant du suivi Supabase (`index.html`) et de Cloudflare.
- `stats.html` n'est volontairement pas instrumenté.

## Sections ajoutées à la main sur des guides générés (maintenance)
Certaines pages générées par `gen_principes.js` contiennent une section ajoutée **manuellement**, absente de `principes.json` (fichier privé, introuvable hors de la machine de son propriétaire).

| Page | Section manuelle | Date |
|---|---|---|
| `/reglages/lg-oled-evo-g6/` | « Dolby Vision Cinema Home » (`id="s-dolby-vision-cinema-home"`, réglages indicatifs niveau 3) + 2 phrases d'introduction ajustées (sous le titre et dans « Présentation ») + entrée du sommaire et du « Résumé rapide » | 2026-11-20 |

**Consigne : ne jamais régénérer ces pages (`node tools/gen_principes.js`) sans avoir d'abord réintégré la section dans `principes.json`**, sinon elle sera supprimée sans avertissement. Après toute régénération, comparer la page avec la version précédente (`git diff`) et vérifier que la section et ses 20 réglages sont toujours présents. Ne pas contourner l'absence de `principes.json` en recréant le fichier de mémoire. La provenance détaillée de ces valeurs est conservée dans les données internes du projet (hors dépôt public) ; elle ne doit pas apparaître sur le site.
