# Audit critique et base du rapport

État examiné : `main` au commit `0f747db` (« Intercations entre les visualisations »), récupéré le 6 novembre 2026. Les modifications locales antérieures ont été sauvegardées dans un stash nommé « sauvegarde avant integration dashboard 2026-11-06 ». Ce document distingue les constats sur la version reçue et la nouvelle démonstration à la racine du dépôt.

## 1. Le problème n'était pas seulement esthétique

La version reçue contient des interactions et plusieurs développements intéressants, notamment une économie déjà beaucoup plus complète. Mais les pages ne partagent ni leur préparation des données, ni toujours leur période, ni leur unité d'analyse. La navigation entre quatre pages ne suffit pas à rendre les analyses complémentaires.

### Ce qui fonctionnait

- L'économie utilise une source économique annuelle Maddison, des codes ISO, des comparaisons de pays, des ratios, une corrélation, une animation et un tableau. C'est la vue la plus avancée sur le plan analytique.
- La carte est un point d'entrée familier ; son détail par pays est une bonne idée.
- Le détail morphologique par discipline fait découvrir la diversité des athlètes.
- Le passage de la parité à l'avantage à domicile donne à la quatrième vue une question plus proche des résultats olympiques.
- Les liens contextuels avec année, pays et sport commencent à relier les sujets.

### Ce qui empêchait de répondre clairement aux questions

| Vue reçue | Limite | Conséquence analytique | Décision dans le dashboard |
|---|---|---|---|
| Économie | Très nombreux contrôles et vue isolée | La mécanique prend parfois le pas sur la question | Trois métriques explicites, une corrélation et une trajectoire à la demande |
| Géographie | Couleurs d'effectifs absolus sur une carte | On voit d'abord la taille des nations et des territoires, pas leur spécialisation | Matrice de parts relatives, comparaison possible avec les volumes bruts |
| Anatomie | Une médiane par discipline, pondérée par des lignes athlète-épreuve et regroupant les sexes | Un profil peut seulement représenter le mélange d'hommes et de femmes ou de catégories | Distributions séparées par sexe, athlètes dédupliqués, détail des épreuves |
| Domicile | Nuage PIB / progression et séries utilisant l'ancien dataset | La variable économique parasite la question avant/après ; les périodes et jointures divergent | Série de part mondiale des médailles, normalisée par le niveau antérieur |

La page d'entrée ne présentait plus le projet : elle redirigeait immédiatement vers la carte. La version unifiée présente maintenant la question générale, les quatre questions locales, un contexte commun et un constat recalculé sous chaque graphique.

## 2. Question générale et complémentarité

**Comment les ressources, les spécialisations sportives, la diversité des athlètes et l'accueil des Jeux s'articulent-ils avec les résultats olympiques ?**

« Qu'est-ce qui fait une nation olympique ? » est le titre accessible. La formulation analytique ci-dessus évite de prétendre expliquer causalement le succès avec des corrélations descriptives.

| Question écrite | Observation recherchée | Encodage principal | Action utile | Niveau détail |
|---|---|---|---|---|
| La richesse fait-elle gagner ? | Corrélation, exceptions, effet du choix de métrique | X logarithmique : PIB/habitant ; Y : résultat ; aire : délégation | Sélectionner un pays, changer nombre / ratio, parcourir le temps | Trajectoire du pays et tableau chiffré |
| À chaque pays ses disciplines ? | Surreprésentation relative d'un sport dans les médailles | Matrice pays × disciplines, couleur d'indice relatif | Cliquer une case, confronter indice et nombre de médailles | Répartition complète des médailles du pays |
| Un sport, un seul gabarit ? | Dispersion et effet des catégories dans une discipline | Position sur une échelle commune ; boîtes et moustaches, sexe par couleur | Choisir mesure et sexe, descendre dans les épreuves | Effectifs, quartiles, couverture, médianes des médaillés |
| Accueillir les Jeux change-t-il la donne ? | Écart au niveau antérieur de l'hôte et persistance éventuelle | Temps relatif en X, part mondiale indexée en Y | Choisir un hôte, cliquer une édition de sa trajectoire | Comptes bruts et comparaison avec les autres hôtes |

L'économie caractérise les ressources ; la spécialisation les résultats par discipline ; l'anatomie la diversité des inscrits au sein des disciplines ; le domicile le contexte d'une édition. La vue anatomique n'explique pas directement la richesse nationale : elle reste une lecture micro-démographique complémentaire, dont le lien passe par le sport sélectionné.

### Pertinence particulière de l'anatomie

Une ligne médiane d'un sport n'est pas un résultat en soi. Le poids de boxeurs de catégories différentes n'est pas un « profil idéal » et comparer directement la boxe féminine et masculine sans catégories serait peu informatif.

Le nouvel objectif est de montrer **ce que le résumé agrégé efface**. La vue d'ensemble donne la dispersion des inscrits dans quelques disciplines, séparée par sexe. Le niveau épreuve distingue les catégories ; les limites des catégories ne sont pas artificiellement appariées entre hommes et femmes. La comparaison avec les médaillés est descriptive et apparaît dans le tableau de détail, pas comme une prédiction de performance.

À garder dans le rapport : ce volet est défendable si l'équipe assume un thème économique **et démographique**. Si le sujet final est limité à la performance économique des nations, une vue « accès des femmes aux disciplines selon le pays et l'époque » serait plus directement reliée à l'économie. Cette alternative exigerait une nouvelle question, une métrique et une évaluation ; elle n'est pas présentée comme déjà réalisée.

## 3. Audit des données réellement présentes

### Sources disponibles

| Fichier | Taille logique | Utilisation |
|---|---:|---|
| `Olympic_Athlete_Event_Results.csv` | 316 834 lignes | Résultats par athlète et épreuve, médailles, sport, NOC, édition |
| `Olympic_Athlete_Bio.csv` | 155 861 biographies, ID uniques | Sexe, naissance, taille, poids |
| `Olympics_Games.csv` | 64 éditions dans le catalogue | Hôtes, villes et années ; ne garantit pas des résultats disponibles |
| `Olympics_Country.csv` | Référentiel NOC | Noms de délégations |
| `Olympic_Games_Medal_Tally.csv` | 1 807 lignes | Contrôle indépendant des comptes de médailles |
| `mpd2023_web.xlsx` | Maddison Project Database 2023 | PIB/habitant et population annuels, via l'export économique de l'équipe |
| `athlete_events.csv` | 271 116 lignes | Deuxième source Kaggle, pour comparer et changer de dataset |

La nouvelle source Olympedia couvre effectivement **1960–2020 en été** et **1960–2022 en hiver** après restriction du projet. Elle apporte 242 672 lignes d'inscription, 3 502 pays-éditions et 12 933 distributions (discipline/épreuve, sexe, tous/médaillés). Le fichier historique apporte 209 072 inscriptions et 3 112 pays-éditions dans son périmètre 1960–2016.

Les résultats de Paris 2024 ne sont pas présents. Afficher « Paris 2024 » comme périmètre analysé serait donc incorrect. Le catalogue seul ne permet pas de compléter les inscriptions ni les résultats.

### Problèmes trouvés et traitement

1. **Lignes de participation ≠ personnes.** Un nageur multi-épreuves ne doit pas peser cinq fois plus dans une distribution de tailles. Déduplication par ID, édition et discipline ; au détail, ID, édition et épreuve.
2. **NOC de participation ≠ nationalité biographique.** Le regroupement national utilise le NOC du résultat ; la biographie ne sert pas à réassigner le pays de l'athlète.
3. **Médailles collectives.** Olympedia fournit `isTeamSport` et `result_id` : déduplication par résultat/NOC/couleur pour les équipes. Les individus restent distincts en cas de podium partagé dans un même pays. La source historique nécessite une classification explicite d'épreuves collectives ; cette règle est moins fiable que le drapeau natif.
4. **Poids sous forme de plages.** Certaines biographies contiennent `58-60`, `81-82`, etc. Ces valeurs restent manquantes ; leur milieu ne devient pas artificiellement une mesure.
5. **Naissance et âge.** Olympedia fournit une date de naissance, pas l'âge à chaque édition. L'âge est estimé par différence d'années ; Tokyo 2020 utilise 2021. Les tailles et poids sont biographiques et non datés : leur évolution ne doit pas être interprétée comme un suivi longitudinal du corps.
6. **Valeurs absentes.** Les quantiles sont calculés séparément par variable. Un poids manquant ne supprime pas une taille connue. Chaque mesure porte son effectif `n`, distinct de l'effectif total du groupe.
7. **Population historique.** Le dashboard utilise la population de l'année dans Maddison via la jointure économique préparée, jamais une population actuelle appliquée à toutes les années.
8. **Pays historiques et codes.** Les NOC restent distincts pour les séries de résultats. Le pays ISO sert seulement à joindre l'économie. URSS et Russie ne sont pas fusionnées pour l'avant/après.
9. **DNS et couverture.** Le jeu décompte les inscrits, y compris certains non-partants. L'interface parle donc d'athlètes inscrits, pas de partants effectifs.
10. **Cohérence entre sources internes.** Comparaison exhaustive des résultats Olympedia avec le fichier de tableaux de médailles : trois écarts subsistent (Corée du Sud été 1992 : 28 vs 29 ; Canada hiver 2022 : 27 vs 26 ; États-Unis hiver 2022 : 27 vs 25). Le dashboard conserve le comptage dérivé des résultats pour pouvoir décomposer par sport ; il ne corrige pas arbitrairement ces valeurs. Les écarts sont exportés dans `meta.medalDiscrepancies`.

Exemple de contrôle : été 2016, 207 délégations, 11 406 inscrits et 972 médailles selon les résultats Olympedia du dépôt. Les comptes de médailles par pays de cette édition concordent avec le tableau Olympedia fourni. Le fichier historique a sa propre photographie des résultats et n'est pas forcé à reproduire les corrections rétrospectives de la nouvelle source.

## 4. Pipeline de visualisation reproductible

### Acquisition

Les fichiers bruts restent dans le dépôt. Aucune actualisation silencieuse depuis un service web. Le script `scripts/build_dashboard.py` transforme les deux sources dans le même schéma. L'export économique annuel déjà produit par l'équipe est utilisé pour les valeurs Maddison.

### Transformation

Jointure résultats/biographies par `athlete_id`, association édition/saison/année, conservation des NOC d'inscription, agrégation de personnes uniques, comptage des médailles, jointure NOC→ISO→économie, distributions, calculs descriptifs. Aucun comblement des valeurs manquantes. Le script est indépendant du répertoire de lancement et utilise la bibliothèque standard Python.

### Abstraction

- Pays-édition : NOC nominal, année ordonnée, population/PIB/athlètes/médailles quantitatifs.
- Pays-sport-édition : matrice de participations et médailles.
- Profils : groupe discipline ou épreuve × sexe × édition × cohorte, quantiles et effectif par mesure.
- Hôtes : événement ordinal relatif aux éditions avant et après.

### Encodage visuel et interaction

- Positions X/Y pour comparer les grandeurs quantitatives ; axe PIB logarithmique explicitement nommé.
- Surface des bulles proportionnelle aux inscrits ; petite taille minimale pour rester sélectionnable, mentionnée comme limite de précision pour les très petits points.
- Couleur séquentielle pour une quantité ou un indice, jamais une palette qualitative présentée comme quantitative.
- Boîtes P25–P75 et moustaches P10–P90, médiane en trait. Ces moustaches ne sont pas des intervalles de confiance et ne suivent pas la convention min/max de Tukey.
- Ligne temporelle indexée : base 100 = moyenne de la part mondiale des médailles sur les trois éditions précédentes, au moins deux disponibles.
- Sélection liée, filtres, année, lecture/pause, changement de source, détails et tableaux.

Les domaines économiques et anatomiques sont fixes dans le temps, à saison et métrique données. Le graphique hôte utilise son propre contexte relatif, nécessairement dépendant de l'hôte étudié. La lecture temporelle se termine à la dernière édition ; elle s'arrête quand la page devient cachée.

## 5. Définitions statistiques à défendre

### Spécialisation

`LQ(pays,sport) = (médailles pays-sport / médailles pays) / (médailles mondiales du sport / médailles mondiales)`.

×1 = même poids relatif que dans le programme mondial ; ×2 = deux fois ce poids. Un pays sans médaille n'a pas d'indice défini. Un sport sans médaille du pays donne zéro si le pays a d'autres médailles. Un indice élevé sur une seule médaille est instable ; les volumes sont donc toujours accessibles.

L'aperçu montre cinq délégations en tête du tableau des médailles et quatre délégations spécialisées (au moins trois médailles, indice maximal dans les disciplines affichées). Le pays sélectionné est épinglé, même s'il n'est pas dans ces groupes. Les colonnes sont les huit disciplines les plus médaillées, avec la discipline sélectionnée épinglée. Cette sélection doit être annoncée, pas présentée comme un inventaire exhaustif.

### Corrélation de rang

Spearman mesure le lien monotone entre PIB/habitant et la métrique choisie. Les ex aequo reçoivent un rang moyen ; une variable constante ou un échantillon trop court n'a pas de corrélation affichable. Il n'existe aucun test causal dans le projet. Population, taille du programme, qualifications, boycotts et investissements sont des explications concurrentes.

### Avant/après accueil

La part mondiale neutralise partiellement le nombre variable d'épreuves. Un indice de 150 signifie une part de médailles 50 % plus élevée que la référence antérieure, pas une hausse de 50 points de pourcentage. Les trois éditions précédentes sont des éditions de la source, pas nécessairement douze années calendaires (décalage du calendrier hivernal). Les années absentes et les pays absents ne sont pas remplacés par zéro. Les séries sont interrompues.

Ce n'est pas une étude économétrique d'effet de traitement : il manque un groupe de contrôle comparable et un mécanisme d'identification. Les hôtes ne sont pas choisis aléatoirement.

## 6. Utilisateurs, objectifs et tâches

| Utilisateur | Objectif concret | Tâche vérifiable |
|---|---|---|
| Public curieux | Lire son pays sans expertise statistique | Trouver France 2016, lire les médailles et suivre la trajectoire |
| Journaliste de données | Trouver et vérifier un angle | Passer de médailles brutes à médailles/100, examiner une exception ; comparer Londres avant/après 2012 |
| Analyste sportif | Comparer des disciplines et leurs profils | Sélectionner boxe, choisir poids et détail par épreuve ; confronter effectifs et quartiles |
| Étudiant/enseignant | Comprendre le pipeline et tester la robustesse | Changer de source et de saison, vérifier les unités et les absences |

Le tableau de bord conserve le contexte mondial lors de la sélection d'un pays : sélection et filtrage ne sont pas confondus. L'anatomie reste mondiale ; le pays ne devient pas silencieusement un filtre sur quelques athlètes. Le sport, en revanche, conditionne les comptes économiques et le graphique hôte ainsi que les distributions détaillées.

## 7. Conformité aux consignes

| Exigence | État | Preuve ou action restante |
|---|---|---|
| Choisir des données multivariées Kaggle | Oui, deux sources Kaggle identifiées | Variables individuelles, catégorielles et temporelles ; date d'extraction récente à confirmer |
| Validation avec Aline ou Marco | Non vérifiable dans le dépôt | Confirmer la validation et noter la date dans le rapport |
| Pipeline brut → variables visuelles | Documenté | Script de préparation, méthode intégrée, sections 3–5 de cet audit |
| Utilisateurs cibles | Documenté | Section 6 et interface Méthode |
| Objectifs et tâches | Documenté | Questions et interactions par vue |
| Une technique D3 par étudiant | Quatre techniques implémentées | Inscrire les responsables et contributions ; aucun nom n'est inventé |
| Navigation, sélection, filtres | Implémenté | Filtres communs, clics liés, curseur temporel, panneaux |
| Deux niveaux overview + details | Implémenté dans les quatre vues | Boutons Explorer et tableaux/trajectoires |
| Changer le dataset | Implémenté | Deux sources normalisées, été/hiver et import/export JSON validé |
| Démonstration exécutable | Oui | `python3 main.py`, navigateur sur localhost:8000 |
| Rapport de 15 pages maximum | Trame et contenu analytique prêts | Rédaction finale et mise en page à faire par l'équipe |
| Code source | Présent | Dashboard, préparation, tests et anciennes pages préservées |

### Scénario de démonstration (5 à 7 minutes)

1. Montrer les quatre questions et les Jeux de 2016. Lire les sources et la couverture.
2. Passer des médailles au ratio par 100 inscrits : le classement et le lien avec la richesse changent.
3. Cliquer une case pays/sport de la matrice ; observer la sélection liée et ouvrir le détail.
4. Choisir boxe, poids, femmes/hommes puis épreuves. Montrer que les catégories expliquent une partie de la dispersion globale et que certains poids manquent.
5. Retirer le sport ; choisir Londres 2012. Lire l'écart à la référence, puis distinguer description et causalité.
6. Changer de saison, puis de source. Exporter/importer un JSON et montrer qu'un fichier incompatible est refusé.

## 8. Plan conseillé du rapport (15 pages maximum)

1. Problématique, groupe, validation du dataset et périmètre : 1 page.
2. Sources, structure, qualité, limites et choix des données : 2 pages.
3. Utilisateurs, objectifs et tâches : 1 page.
4. Pipeline, transformations et modèle commun : 2 pages.
5. Quatre vues : question, encodages, interaction, détail et constat, 1,5 page chacune : 6 pages.
6. Évaluation, comparaison à l'ancienne version et limites : 1,5 page.
7. Conclusion, répartition des contributions et références : 1,5 page.

Ne pas déclarer une évaluation utilisateur qui n'a pas eu lieu. Prévoir au moins cinq tâches sur deux ou trois personnes, noter compréhension des axes et indices, erreurs, temps approximatif et commentaires. Vérifier particulièrement la compréhension de ×2, de la base 100 et des boîtes P25–P75.

## 9. Vérifications et prochaines décisions d'équipe

Les tests automatisés vérifient les schémas, les années réellement disponibles, l'agrégation des médailles par sport, les mesures et quantiles, le filtrage sportif, les ex aequo de Spearman, la spécialisation et les absences dans l'étude hôte. Les vérifications navigateur couvrent changement de source, saison, année, sélection pays/sport, détails, lecture temporelle et responsive.

Restent des décisions humaines et éditoriales : confirmer le périmètre auprès de l'encadrant ; décider si le volet anatomique appartient bien au récit collectif ; confirmer la date/version de l'extraction Olympedia ; attribuer les quatre vues ; réaliser des tests utilisateurs ; finaliser le rapport sans dépasser quinze pages.

## Références

- Source historique : [120 years of Olympic history — Kaggle](https://www.kaggle.com/datasets/heesoo37/120-years-of-olympic-history-athletes-and-results).
- Source récente : [Olympic Historical Dataset From Olympedia.org — Joseph Cheng, Kaggle](https://www.kaggle.com/datasets/josephcheng123456/olympic-historical-dataset-from-olympediaorg). Cette source publique correspond aux noms et au schéma des fichiers présents dans `donnees_brutes/`. La date/version exacte de l'extraction locale reste à confirmer par l'équipe.
- [Maddison Project Database 2023 — Groningen Growth and Development Centre](https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023?lang=en), Bolt et Van Zanden. PIB en dollars internationaux à prix 2011 et population ; voir également la préparation économique de l'équipe.
- D3 7.9.0, Mike Bostock et contributeurs ; bibliothèque embarquée dans `dashboard/vendor/d3.min.js` pour rendre la démonstration indépendante du CDN.
