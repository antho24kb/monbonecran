# Outils de génération

`index.html` est la **source unique** de l'application. Les pages suivantes en sont dérivées :

| Commande | Génère |
|---|---|
| `node tools/gen_pages.js "Marque|Modèle"` | une page de réglages `/reglages/<modèle>/` |
| `node tools/gen_sections.js` | les 5 pages de rubriques, `sitemap.xml`, et le lien « Régler sa télé » des pages `/reglages/` |

**À relancer `node tools/gen_sections.js` après chaque modification de `index.html`**, puis publier tout le dossier
(les pages de rubriques sont des copies de `index.html` avec leur propre contenu).

Les titres des rubriques viennent de `ROUTE_TITLES` dans `index.html` (une seule source).

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
