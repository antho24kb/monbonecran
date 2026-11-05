# Google Analytics 4 : réglages à faire dans la propriété (identifiant G-1SSN7H2506)

Le code est dans `/mbe-analytics.js`. Les réglages ci-dessous se font dans l'interface GA4 : le code ne peut pas les imposer.

## 1. Réglages obligatoires
1. **Mesure améliorée** : *Admin > Flux de données > (ton flux Web) > Mesure améliorée (roue dentée)*.
   - **Désactiver « Modifications de page basées sur les événements d'historique du navigateur »** (sinon chaque navigation du site est comptée deux fois : une fois par le site, une fois par GA4, même avec `send_page_view:false`).
   - Désactiver « Clics sortants » (doublon avec `affiliate_click`), « Recherche sur site », « Engagement vidéo », « Téléchargements de fichiers », « Interactions avec les formulaires », « Défilements » (non utilisés, moins de données collectées).
   - Garder « Pages vues » activé (c'est l'interrupteur général, le code envoie ses propres `page_view`).
2. **Conservation des données** : *Admin > Collecte et modification des données > Collecte des données* > « Conservation des données d'événement » = **2 mois**, et « Réinitialiser les données utilisateur lors d'une nouvelle activité » activé.
3. **Google Signals** : *Admin > Collecte et modification des données > Collecte des données* > désactivé.
4. **Données publicitaires** : ne lier ni Google Ads ni autre service publicitaire.

## 2. Dimensions personnalisées (événement `affiliate_click`)
*Admin > Affichage des données > Définitions personnalisées > Créer une dimension personnalisée* (rôle Éditeur minimum). Créer 3 dimensions, toutes de portée **Événement** :

| Nom de la dimension | Portée | Paramètre d'événement | Valeurs possibles |
|---|---|---|---|
| Boutique affiliée | Événement | `shop` | amazon, electrodepot, joybuy |
| Produit cliqué | Événement | `item_label` | nom du produit (100 caractères max) |
| Type de produit | Événement | `item_type` | tele, accessoire |

Règles à connaître : le nom du paramètre doit être identique au code (minuscules, underscore) ; portée et paramètre ne se modifient plus après enregistrement ; un compte standard permet 50 dimensions d'événement ; la dimension n'est utilisable que 24 à 48 h après sa création et **n'est pas rétroactive** (les clics avant sont « (not set) ») ; `item_label` a beaucoup de valeurs différentes, GA4 peut donc regrouper les moins fréquentes dans « (other) » dans les rapports standard.

Créer ces dimensions tout de suite après la publication, pour perdre le moins de données possible. La liste déroulante « Paramètre d'événement » n'affiche un paramètre qu'après réception d'un premier événement : il est possible de saisir le nom à la main.

## 3. Événement clé et lecture
- *Admin > Affichage des données > Événements* : activer **« Marquer comme événement clé »** sur `affiliate_click` (après le premier clic reçu).
- Lecture : *Explorer > Exploration en forme libre* ; dimensions Boutique affiliée, Produit cliqué, Type de produit ; valeur « Nombre d'événements » ; filtre « Nom de l'événement = affiliate_click ».
- Sources de trafic (TikTok, Facebook) : ajouter `?utm_source=tiktok&utm_medium=social` (ou `facebook`) aux liens des bios et publications.

## 4. Vérifier qu'il n'y a pas de doublon (DebugView / Temps réel)
Sur le site, accepter les cookies, puis naviguer : accueil, une rubrique, Retour. Dans *Rapports > Temps réel*, la carte « Nombre d'événements par nom » doit afficher **un** `page_view` par page ouverte. Deux `page_view` par navigation = la case « historique du navigateur » est encore cochée (point 1).
