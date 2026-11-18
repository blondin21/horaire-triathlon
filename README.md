# Horaires de passage : vélo, natation, course à pied (Netlify)

Application web pour calculer les horaires de passage de groupes sur un ou plusieurs parcours.
Chaque parcours regroupe trois disciplines et est enregistré dans **Netlify Blobs**, la base clé/valeur intégrée
à Netlify : aucune base à créer ni à configurer.

## Onglets de chaque parcours
Quatre onglets : **Natation**, **Vélo**, **Course à pied** et **Restitution globale**. Dans chaque discipline, le bouton
« Paramétrage / Restitution » bascule entre les deux vues.
- **Paramétrage** : groupes (nom, heure de départ, vitesse en km/h pour le vélo, allure en min:s par 100 m pour la natation
  et par km pour la course), points de passage, distance et fichier GPX. Les transitions se règlent par groupe :
  **T1** (natation → vélo) dans l'onglet Vélo, **T2** (vélo → course) dans l'onglet Course à pied, en minutes.
- **Restitution** : tableau des horaires par point, curseur d'heure, plan avec fond de carte (si la discipline a un tracé GPX).
- **Restitution globale** : chronologie des groupes et tableau de détail, au choix **par discipline** ou **par groupe**
  (dans ce cas, chaque groupe affiche nage, T1, vélo, T2, course et son total), puis un tableau du **total combiné par groupe**
  (natation + T1 + vélo + T2 + course). Les groupes sont rapprochés d'une discipline à l'autre par leur rang dans la liste.
- **Exports** : chaque tableau de résultats (et la chronologie) a un bouton **Tableur (.xlsx)** et **Image (.png)**.

Les distances de la natation se saisissent en mètres. Pour la natation et la course, le GPX est facultatif :
sans tracé, la distance se règle à la main et le plan n'est pas affiché.
Les horaires de départ de chaque discipline sont indépendants (pas d'enchaînement automatique avec les transitions).
Couleurs : bleu pour la natation, vert pour le vélo, rouge pour la course à pied.

## Contenu
- `public/index.html` : l'application
- `netlify/functions/routes.mjs` : API `/api/routes` (liste, création, lecture, modification, suppression, GPX)
- `netlify/functions/auth.mjs` et `netlify/lib/session.mjs` : connexion par email et mot de passe (sessions par cookie signé)
- `netlify.toml`, `package.json` : configuration

## Publier
1. Mets le dossier sur GitHub, puis dans Netlify : *Add new site > Import an existing project*.
   Aucun réglage à changer : `netlify.toml` indique le dossier `public` et les fonctions.
   (Ou avec la CLI : `npm install`, puis `npx netlify deploy --prod`.)
2. Ouvre le site, clique sur « Nouveau parcours » et importe un GPX (ou charge l'exemple).

## Connexion et mode invité
- **Invité (sans connexion)** : voit uniquement les onglets de restitution (natation, vélo, course, globale) et peut exporter
  les tableaux. Aucun paramètre n'est visible ni modifiable, et les GPX ne se téléchargent pas.
- **Connecté (email + mot de passe)** : accès à tout : paramétrage, création et suppression de parcours, GPX.
  La session dure 30 jours.

Variables d'environnement à définir dans Netlify (*Site configuration > Environment variables*), puis redéployer :
| Variable | Rôle |
|---|---|
| `SESSION_SECRET` | **Obligatoire.** Longue chaîne aléatoire (16 caractères minimum) qui signe les sessions. Exemple : `openssl rand -base64 32` |
| `INVITE_CODE` | **Obligatoire.** Code d'invitation à communiquer aux personnes autorisées à créer un compte |
| `EDITOR_EMAILS` | Facultatif. Liste d'emails autorisés, séparés par des virgules. Si elle est définie, seuls ces emails peuvent créer un compte |

Premier compte : ouvre le site, clique sur « Se connecter », choisis « Créer un compte », saisis ton email, un mot de passe
(8 caractères minimum) et le code d'invitation. Les comptes suivants se créent de la même façon.

Mot de passe oublié : aucun email n'est envoyé par l'application. Recrée le compte avec le même email et le code d'invitation,
ce qui remplace le mot de passe. Garde donc le code d'invitation secret : toute personne qui le connaît peut créer ou réinitialiser un compte
(utilise `EDITOR_EMAILS` pour limiter les emails acceptés). Après 5 échecs de connexion, le compte est bloqué 15 minutes.
Pour retirer un accès, supprime la ligne correspondante du magasin `auth` dans Netlify (*Blobs*) ou change `SESSION_SECRET`
(ce qui déconnecte tout le monde).

L'ancienne variable `EDIT_CODE` n'est plus utilisée.

## Tester en local
`npm install`, puis `npx netlify dev` (Blobs fonctionne en local avec la CLI). Ouvre http://localhost:8888.
Pour tester la connexion en local, définis `SESSION_SECRET` et `INVITE_CODE` dans un fichier `.env` à la racine du projet.

## Fond de carte
Le plan utilise Leaflet (chargé depuis unpkg.com). Le sélecteur en haut à droite de la carte propose OpenStreetMap (par défaut),
Plan IGN, Photo aérienne IGN et Tracé seul ; le choix est mémorisé sur l'appareil. Aucune clé API n'est nécessaire.
Respecte les conditions d'utilisation des tuiles OpenStreetMap (usage modéré, mention de la source déjà affichée)
et vérifie celles de l'IGN (Géoplateforme) avant une diffusion large. Sur la carte, un clic sur un point superposé
(tour 1 / tour 2) passe au suivant.

## Données
Un blob JSON par parcours (`route:<id>`) dans le magasin `parcours` (les comptes sont dans le magasin `auth`), avec les trois disciplines, et un blob par GPX d'origine
(`gpx:<id>:<discipline>`, 4 Mo maximum). Les modifications s'enregistrent automatiquement après 0,7 s.
Les anciens parcours (vélo seul) sont convertis automatiquement : leurs données deviennent la discipline vélo,
la natation et la course reçoivent des valeurs par défaut. Les km des points sont saisis à la main (ils ne sont pas déduits du GPX).

## Scripts externes
La page charge Leaflet (unpkg.com) pour la carte et SheetJS (cdnjs.cloudflare.com) pour l'export .xlsx. Si SheetJS ne se charge pas,
l'export tableur bascule sur un fichier CSV.
