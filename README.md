# La fabrique des nations olympiques

Projet de visualisation d’information, M2 informatique, Université Côte d’Azur : quatre visualisations D3.js sur les Jeux olympiques de 1960 à 2016 (Jeux d’été et Jeux d’hiver), réunies sur une page unique.

## Lancer la démo

```bash
python main.py
```

Puis ouvrir http://localhost:8000. Une connexion Internet est nécessaire : D3, topojson-client et le fond de carte sont chargés depuis le CDN jsDelivr.

## Membres

| Membre | Visualisation | Technique D3 |
|---|---|---|
| Pierre | 1. Géographie sportive | carte choroplèthe à classes de même effectif, anneau de composition par sport |
| Antoine | 2. Richesse et médailles | diagramme en barres animé (quintiles de PIB par habitant) et nuage de points lié, côte à côte, sur une mesure commune (médailles ou efficacité) |
| Baptiste | 3. Avantage à domicile | nuage de bulles chronologique et frise avant/après (T-3 à T+3) |
| Juliette | 4. Morphologie des athlètes | coordonnées parallèles et cartes de comparaison médaillés / autres participants |

## Les quatre vues

1. Les nations misent-elles sur quelques sports ? Carte des délégations par édition et par discipline (athlètes, médailles ou spécialisation), avec lecture des éditions. Un clic sur un pays affiche la répartition de sa délégation par sport.
2. La richesse fait-elle les médailles ? Les pays participants sont répartis en cinq groupes de même taille selon leur PIB par habitant ; les pays sans PIB connu forment un groupe à part. Deux graphiques côte à côte portent sur la même mesure, au choix : médailles par pays ou efficacité (médailles par athlète rapportées à celles de l’édition, pays d’au moins 5 athlètes). Les barres donnent la moyenne de chaque groupe ; le nuage de points place chaque pays selon son PIB par habitant, les pays sans médaille étant regroupés dans une bande. Le survol d’une barre montre ses pays dans le nuage, le survol d’un cercle situe le pays sur la barre de son groupe ; un clic isole un groupe ou repère un pays. Lecture animée des éditions.
3. Accueillir les Jeux améliore-t-il les résultats ? Une bulle par édition accueillie, placée selon l’évolution des médailles (ou de la délégation) par rapport à la moyenne des trois éditions précédentes. Un clic affiche la délégation, les médailles et le PIB par habitant du pays hôte de T-3 à T+3, et les disciplines qui progressent le plus.
4. Chaque sport a-t-il son gabarit ? Âge, taille et poids médians par sport (coordonnées parallèles, sélection d’une plage de taille), puis comparaison de deux sports : écart de médiane entre médaillés et autres participants.

Dans chaque vue, un sélecteur permet de passer des Jeux d’été aux Jeux d’hiver. Les mentions soulignées en pointillés mènent à la vue qui prolonge l’analyse (même édition, même pays ou même sport).

## Sources des données

- 120 years of Olympic history: athletes and results (heesoo37, Kaggle) : https://www.kaggle.com/datasets/heesoo37/120-years-of-olympic-history-athletes-and-results
- Maddison Project Database 2023 (PIB par habitant en dollars PPA 2011, population ; vues 2 et 3) : Bolt, J. et van Zanden, J. L. (2024), Journal of Economic Surveys. https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023
- Fond de carte : Natural Earth 110m (world-atlas).

Tout le projet repose sur ces deux sources. `visualizations/economie/data/olympiques.csv` est précalculé à partir d’elles : une ligne par pays, par saison et par édition (athlètes uniques, une médaille par épreuve collective, PIB par habitant et population Maddison). Il est utilisé par les vues 2 et 3.

## Structure du dépôt

```
index.html                     page unique : les quatre visualisations
styles-unified.css             feuille de style
main.py                        serveur local (port 8000)
visualizations/
  shared-links.js              chargement des données, formats de nombres, noms français, liens entre les vues
  geographie/app.js            vue 1
  economie/app.js              vue 2
  economie/data/olympiques.csv données par pays et par édition (vues 2 et 3)
  economie/data/prep.py        script qui produit olympiques.csv
  domicile/app.js              vue 3
  anatomie/app.js              vue 4
120 years of Olympic history/  athlete_events.csv (Kaggle, vues 1, 3 et 4)
donnees_brutes/                mpd2023_web.xlsx (Maddison 2023, entrée de prep.py)
tables_code_pays/              noc_iso3.csv (code CIO, code ISO3 de Maddison, nom français ; entrée de prep.py)
                               sport_fr.csv (nom français des 51 sports)
```

## Régénérer les données

```bash
python visualizations/economie/data/prep.py
```

Le script lit `athlete_events.csv`, `mpd2023_web.xlsx` et `noc_iso3.csv`, puis écrit `olympiques.csv` (pandas et openpyxl requis).

## Règles de calcul communes

- Une médaille compte pour un pays, une épreuve et une couleur : les membres d’une équipe championne donnent une seule médaille. Conséquence : deux athlètes d’un même pays ex aequo dans une épreuve individuelle comptent pour une médaille (15 cas depuis 1960).
- Un athlète est compté une fois par pays et par édition.
- Les noms de sports et de pays sont traduits à l’affichage par les tables de `tables_code_pays/` ; les données et les filtres restent en anglais.

## Limites méthodologiques connues

- Vue 1 (spécialisation) : aucune taille minimale de délégation n’est imposée pour la part d’une discipline ; une très petite délégation peut afficher 100 % dans un sport.
- Vue 2 : les pays sans PIB par habitant connu (RDA, certains petits États) sont exclus. Les groupes sont recalculés à chaque édition, et la moyenne du groupe le plus riche est tirée par quelques grandes nations.
- Vue 3 : la progression est calculée sur des nombres bruts de médailles et d’athlètes, alors que le nombre total de médailles distribuées augmente entre 1960 et 2016. Les pourcentages calculés sur de petites bases sont instables (Mexique 1968 : environ 1 médaille avant, 9 à domicile, soit +800 %).
- Vue 4 : les médianes par sport mélangent des épreuves et des catégories de poids différentes ; les athlètes sans âge, taille ou poids renseigné sont exclus, ainsi que les sports comptant moins de 20 athlètes mesurés. Avec le filtre « Tous », les coordonnées parallèles mélangent hommes et femmes ; les cartes de comparaison calculent l’écart de médiane à sexe égal.
