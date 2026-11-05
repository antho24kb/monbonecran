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
