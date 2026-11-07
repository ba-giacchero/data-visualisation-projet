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
| [à compléter] | 1. Géographie sportive | carte choroplèthe |
| Antoine | 2. Richesse et efficacité | nuage de points |
| [à compléter] | 3. Avantage à domicile | graphique avant/après (event study) et nuage de bulles |
| [à compléter] | 4. Morphologie des athlètes | coordonnées parallèles |

## Les quatre vues

1. **Les nations misent-elles sur quelques sports ?** Carte des délégations par édition et par discipline (athlètes, médailles ou spécialisation) ; clic sur un pays : répartition de sa délégation par sport.
2. **La richesse fait-elle les médailles ?** Nuage PIB par habitant / mesure olympique (efficacité, médailles, délégation, athlètes par habitant), bulles selon la population, filtres par continent et délégation minimale ; clic : trajectoire des pays comparés.
3. **Accueillir les Jeux améliore-t-il les résultats ?** Une bulle par édition accueillie ; clic : délégation et médailles du pays hôte de T−3 à T+3.
4. **Chaque sport a-t-il son gabarit ?** Âge, taille et poids médians par sport ; brossage de la taille, comparaison de deux sports.

Dans chaque vue, un sélecteur permet de passer des Jeux d’été aux Jeux d’hiver.

## Sources des données

- **120 years of Olympic history: athletes and results** (heesoo37, Kaggle) : https://www.kaggle.com/datasets/heesoo37/120-years-of-olympic-history-athletes-and-results
- **Maddison Project Database 2023** (PIB par habitant en dollars PPA 2011, population ; vues 2 et 3) : Bolt, J. et van Zanden, J. L. (2024), *Journal of Economic Surveys*. https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023
- Fond de carte : Natural Earth 110m (world-atlas).

Tout le projet repose sur ces deux sources. `visualizations/economie/data/olympiques.csv` est précalculé à partir d’elles : une ligne par pays, par saison et par édition (athlètes uniques, une médaille par épreuve collective, PIB par habitant et population Maddison). Il est utilisé par les vues 2 et 3.

## Structure du dépôt

```
index.html                     page unique : les quatre visualisations
styles-unified.css             feuille de style
main.py                        serveur local (port 8000)
visualizations/
  shared-links.js              chargement des données et liens entre les vues
  geographie/app.js            vue 1
  economie/app.js              vue 2
  economie/data/olympiques.csv données par pays et par édition (vues 2 et 3)
  economie/data/prep.py        script qui produit olympiques.csv
  domicile/app.js              vue 3
  anatomie/app.js              vue 4
120 years of Olympic history/  athlete_events.csv (Kaggle, vues 1, 3 et 4)
donnees_brutes/                mpd2023_web.xlsx (Maddison 2023, entrée de prep.py)
tables_code_pays/              code_continent.csv (vue 2), noc_iso3.csv (code CIO → ISO3, entrée de prep.py)
```

## Régénérer les données

```bash
python visualizations/economie/data/prep.py
```

Le script lit `athlete_events.csv`, `mpd2023_web.xlsx` et `noc_iso3.csv`, puis écrit `olympiques.csv` (pandas et openpyxl requis).

## Limites méthodologiques connues

- **Vue 1 (spécialisation)** : aucune taille minimale de délégation n’est imposée ; une très petite délégation peut afficher une part de 100 % dans un sport.
- **Vue 2** : les pays sans PIB connu (RDA, certains petits États) sont placés dans une bande à part et exclus de la corrélation.
- **Vue 3 (pays hôte)** : la progression est calculée sur des **nombres bruts** de médailles et d’athlètes. Or le nombre total de médailles distribuées augmente fortement entre 1960 et 2016 : une partie de la hausse observée l’année d’accueil reflète cette croissance et non l’effet domicile. Certaines références reposent sur une seule édition antérieure, et les pourcentages calculés sur de petites bases sont instables.
- **Vue 4 (anatomie)** : les médianes par sport mélangent des épreuves et des catégories de poids très différentes (athlétisme, haltérophilie, boxe, judo, lutte) ; les athlètes sans âge, taille ou poids renseigné sont exclus.
