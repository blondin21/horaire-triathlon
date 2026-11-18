# Horaires de passage : natation, vélo, course à pied (Vercel + Neon)

Application web pour calculer les horaires de passage de groupes sur un ou plusieurs parcours.
Chaque parcours regroupe trois disciplines. Les données sont enregistrées dans **Neon** (Postgres serverless),
proposé par le Marketplace de Vercel (offre gratuite disponible).

## Contenu
- `public/index.html` : l'application (page unique)
- `api/routes/…`, `api/auth/[action].mjs`, `api/users/index.mjs` : points d'entrée de l'API (fonctions Vercel)
- `lib/` : logique de l'API (`db.mjs` contient toutes les requêtes SQL), sessions et connexion
- `schema.sql` : structure des tables, à titre de référence (elles se créent toutes seules au premier appel)
- `vercel.json`, `package.json` : configuration

## Publier
1. Mets le dossier sur GitHub, puis sur [vercel.com](https://vercel.com) : *Add New… > Project*, choisis le dépôt.
   Laisse « Other » comme framework : `vercel.json` indique déjà le dossier à publier (`public`), sans commande de build.
2. Dans l'onglet **Storage** du projet, *Create Database*, choisis **Neon (Postgres)** dans le Marketplace, puis connecte-le au projet
   (tous les environnements). Vercel ajoute alors la variable `DATABASE_URL`.
3. Dans *Settings > Environment variables*, ajoute les variables de la section suivante.
4. Redéploie (*Deployments > … > Redeploy*) pour que les variables soient prises en compte.

Avec la ligne de commande : `npm install -g vercel`, puis `vercel` (aperçu) ou `vercel --prod`.
Pour tester en local : `vercel link`, `vercel env pull .env.local`, puis `vercel dev`.

## Accès : administrateur, éditeurs et invités
- **Invité (sans connexion)** : voit uniquement les onglets de restitution (natation, vélo, course, globale) et peut exporter
  les tableaux. Aucun paramètre n'est visible ni modifiable, et les GPX ne se téléchargent pas.
- **Éditeur** : accès à tout : paramétrage, création et suppression de parcours, GPX.
- **Administrateur** : tout ce que fait un éditeur, plus la gestion des accès (bouton « Utilisateurs »).

Variables d'environnement :
| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Ajoutée par l'intégration Neon. Adresse de la base |
| `SESSION_SECRET` | **Obligatoire.** Longue chaîne aléatoire (16 caractères minimum) qui signe les sessions. Exemple : `openssl rand -base64 32` |
| `ADMIN_EMAIL` | **Obligatoire.** Email du compte administrateur principal |
| `ADMIN_PASSWORD` | **Obligatoire au départ.** Mot de passe initial de l'administrateur |

**Première connexion** : ouvre le site, clique sur « Se connecter » et saisis `ADMIN_EMAIL` et `ADMIN_PASSWORD`. Le compte
administrateur est alors créé dans la base. `ADMIN_PASSWORD` ne sert qu'à cette création : change ensuite ton mot de passe dans
« Mon compte », puis tu peux supprimer cette variable de Vercel.

**Créer un utilisateur avec son email** : bouton « Utilisateurs », saisis l'email et choisis le rôle, puis « Créer l'accès ».
L'application génère un **lien d'activation** (valable 7 jours, à usage unique). Copie-le, ou clique sur « Envoyer par email »
pour ouvrir ton application de messagerie avec le message déjà rédigé. La personne ouvre le lien, choisit son mot de passe et
est connectée. Aucun email n'est envoyé automatiquement par le site.

Dans la liste des accès : « Nouveau lien » (mot de passe oublié : la personne choisit un nouveau mot de passe), changement de rôle
et suppression (l'accès est révoqué immédiatement, même si la personne est connectée). Chacun peut changer son mot de passe
dans « Mon compte ». Après 5 échecs de connexion, le compte est bloqué 15 minutes.

Si tu perds l'accès administrateur : supprime la ligne de ton compte dans la table `hdp_users` (éditeur SQL de Neon) et reconnecte-toi
avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`. Changer `SESSION_SECRET` déconnecte tout le monde.

## Onglets de chaque parcours
Quatre onglets : **Natation**, **Vélo**, **Course à pied** et **Restitution globale**. Dans chaque discipline, le bouton
« Paramétrage / Restitution » bascule entre les deux vues (réservé aux personnes connectées).
- **Paramétrage** : groupes (nom, heure de départ, vitesse en km/h pour le vélo, allure en min:s par 100 m pour la natation
  et par km pour la course), transitions T1 (natation → vélo) et T2 (vélo → course), points de passage, distance et GPX.
- **Restitution** : tableau des horaires par point, curseur d'heure, plan avec fond de carte (si la discipline a un tracé GPX).
- **Restitution globale** : chronologie et détail, par discipline ou par groupe, et total combiné par groupe (avec T1 et T2).
- **Exports** : chaque tableau de résultats a un bouton Tableur (.xlsx) et Image (.png).

Natation en mètres. Le GPX est facultatif pour la natation et la course.
Couleurs : bleu pour la natation, vert pour le vélo, rouge pour la course à pied.

## Limites à connaître
- **Taille des GPX** : 3,5 Mo maximum par fichier (limite de requête de Vercel). Un fichier plus lourd est refusé avec un message.
- **Hébergement Vercel** : l'offre gratuite « Hobby » est prévue pour un usage personnel non commercial.
  Vérifie les conditions de Vercel si l'événement est organisé par une structure commerciale.
- **Données des autres versions** : les données de la version Netlify ou Vercel + Upstash ne sont pas reprises.
  Recrée les parcours (import des GPX, points et groupes).

## Fond de carte et scripts externes
Le plan utilise Leaflet (unpkg.com) avec OpenStreetMap (par défaut), Plan IGN, Photo aérienne IGN ou Tracé seul ; le choix est
mémorisé sur l'appareil. Aucune clé n'est nécessaire. Respecte les conditions d'utilisation des tuiles OpenStreetMap et vérifie
celles de l'IGN avant une diffusion large. L'export .xlsx utilise SheetJS (cdnjs.cloudflare.com) ; sans lui, l'export bascule sur un CSV.

## En cas de problème
- **« Base de données non configurée »** : Neon n'est pas connecté au projet, ou le projet n'a pas été redéployé après la connexion.
- **« La connexion n'est pas configurée »** : `SESSION_SECRET` manque (ou fait moins de 16 caractères), ou `DATABASE_URL` est absente.
- **Impossible de se connecter en administrateur** : vérifie `ADMIN_EMAIL` et `ADMIN_PASSWORD`, saisis exactement les mêmes valeurs,
  et redéploie après toute modification des variables.
- **Erreur 404 sur /api** : vérifie que les dossiers `api/` et `lib/` sont bien dans le dépôt, à la racine.
- Les noms exacts des menus Vercel et Neon peuvent évoluer ; cherche l'équivalent dans la même rubrique.
