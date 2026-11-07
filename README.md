# Au-delà des médailles

Tableau de bord D3 à quatre vues liées, sur une seule page.

## Démarrer la démonstration

```sh
python3 main.py
```

Ouvrir **http://localhost:8000**. Aucun serveur de données ni compte externe n'est nécessaire. Les deux exports JSON et D3 sont inclus ; les polices externes ont une police système de repli.

## Questions et techniques

1. **La richesse fait-elle gagner ?** Nuage de points PIB par habitant / médailles, délégation ou ratio ; détail temporel d'un pays.
2. **À chaque pays ses disciplines ?** Matrice de spécialisation relative ; détail des médailles et des parts par discipline.
3. **Un sport, un seul gabarit ?** Distributions de taille, poids, âge, par sexe ; détail par épreuve et catégories, couverture et médaillés.
4. **Accueillir les Jeux change-t-il la donne ?** Série avant/pendant/après l'accueil ; détail des valeurs brutes et comparaison des hôtes.

Année, saison, pays suivi et discipline sont communs. Le pays est mis en évidence sans supprimer les autres pays. Les distributions anatomiques sont mondiales, pas filtrées par nationalité. Les choix sont conservés dans l'URL (sauf les données importées, qui restent en mémoire locale).

## Changer les données

- Sélecteur **Olympedia / Kaggle historique** : changement réel des quatre tables, pas simplement de métrique.
- Sélecteur **été / hiver** : saisons disponibles dans la source.
- **Exporter les données**, puis **Importer un dataset** : fichier JSON normalisé complet, validé avant remplacement. Voir [le contrat](docs/DATASET.md).
- Les résultats fournis s'arrêtent à l'été 2020 et à l'hiver 2022. Le catalogue des éditions mentionne 2024 mais ne contient pas ses résultats.

## Reproduire la préparation

```sh
python3 scripts/build_dashboard.py
```

Python 3.10+ et bibliothèque standard uniquement. Les données économiques déjà préparées par l'équipe sont relues depuis `visualizations/economie/data/olympiques.csv` (Maddison annuel). Pour actualiser aussi cette jointure depuis le XLSX brut, lancer d'abord `python3 visualizations/economie/data/prep.py` ; cette ancienne préparation requiert pandas et openpyxl. Les médailles et délégations du tableau de bord sont recalculées depuis les résultats bruts, pas reprises de cet export économique.

## Vérifications

```sh
npm test
```

Node 22+ ; aucune installation npm nécessaire. Tests des deux schémas, de la couverture, des sommes de médailles, du filtre sport, des rangs avec ex aequo, des indices de spécialisation et de l'étude avant/après. Les contrôles contre le tableau des médailles Olympedia détectent trois divergences internes à la source ; elles sont conservées dans les métadonnées et documentées dans l'audit.

## Fichiers utiles

- `index.html`, `dashboard/` : nouvelle démonstration unifiée.
- `scripts/build_dashboard.py` : pipeline reproductible des deux datasets.
- `docs/AUDIT_ET_RAPPORT.md` : audit critique, décisions, consignes et plan de rapport (15 pages maximum).
- `docs/DATASET.md` : schéma d'import, unités et règles de comptage.
- `visualizations/` : pages autonomes antérieures conservées comme références. Elles ne constituent pas la démonstration unifiée et peuvent encore utiliser les anciens CSV. La vue économie étendue y conserve notamment l'exploration paralympique ; les données individuelles nécessaires aux trois autres vues n'étant pas présentes, les paralympiques ne sont pas mélangés au dashboard.

Les résultats ne prouvent aucun effet causal de la richesse, d'un gabarit ou de l'accueil des Jeux. La validation du choix des données auprès d'Aline ou Marco et les noms des quatre responsables restent à renseigner par l'équipe.
