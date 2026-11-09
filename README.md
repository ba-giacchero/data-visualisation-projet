# La fabrique des nations olympiques

Projet de visualisation d’information (M2 informatique, Université Côte d’Azur) : quatre visualisations D3.js sur les Jeux olympiques de 1960 à 2016, réunies sur une page unique. Les choix de visualisation, les règles de calcul et les limites sont présentés dans le rapport du projet.

## Lancer la page

```bash
python main.py
```

Puis ouvrir http://localhost:8000. Une connexion Internet est nécessaire : D3, topojson-client et le fond de carte sont chargés depuis jsDelivr. Ouvrir `index.html` directement depuis le disque ne fonctionne pas : le navigateur bloque alors la lecture des fichiers CSV.

## Contenu du dépôt

```
index.html                     page unique : les quatre visualisations
styles-unified.css             feuille de style commune
main.py                        serveur local (port 8000, sans cache)
visualizations/
  shared-links.js              code commun : chargement des données, formats, noms français, liens entre les vues
  geographie/app.js            vue 1 : géographie sportive
  economie/app.js              vue 2 : richesse et médailles
  economie/data/olympiques.csv données agrégées par pays et par édition (vues 2 et 3)
  economie/data/prep.py        script qui produit olympiques.csv
  domicile/app.js              vue 3 : avantage à domicile
  anatomie/app.js              vue 4 : morphologie des athlètes
120 years of Olympic history/  athlete_events.csv (Kaggle)
donnees_brutes/                mpd2023_web.xlsx (Maddison Project Database 2023)
tables_code_pays/              noc_iso3.csv (code CIO, code Maddison, nom français)
                               sport_fr.csv (nom français des sports)
```

Les données brutes sont versionnées dans le dépôt : aucun téléchargement n’est nécessaire.

## Régénérer les données agrégées

`olympiques.csv` est déjà fourni. Pour le recalculer après une modification des données brutes ou de `tables_code_pays/noc_iso3.csv` :

```bash
pip install pandas openpyxl
python visualizations/economie/data/prep.py
```

Le script s’arrête et liste les codes CIO absents de `noc_iso3.csv` s’il en trouve.

## Travailler sur le dépôt

- `main` contient la version de référence, celle du rapport.
- Chaque modification se fait sur une branche dédiée, puis rejoint `main` par une pull request.
- Avant de fusionner, vérifier la page complète avec `python main.py` : les quatre vues partagent `index.html`, `styles-unified.css` et `shared-links.js`.
