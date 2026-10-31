# Le poids de la richesse : notes pour le rapport

Question : les pays riches envoient-ils plus d'athlètes et gagnent-ils plus de médailles ?

## Données et préparation (`data/prep.py`)

| Source | Usage |
|---|---|
| `Olympic_Athlete_Event_Results.csv` | une ligne par athlète et par épreuve, Jeux d'été et d'hiver depuis 1960 |
| `paralympic_games.csv` | participants et médailles par pays et par édition |
| Maddison Project Database 2023 (`mpd2023_web.xlsx`) | PIB par habitant (dollars PPA 2011) et population |
| `tables_code_pays/noc_iso3.csv`, `para_nom_iso3.csv` | code CIO ou nom paralympique → code ISO |
| `tables_code_pays/code_continent.csv` | code pays → association continentale du CIO |

- **Délégation** : athlètes distincts (`athlete_id` unique par pays et par édition).
- **Médailles** : triplets uniques (épreuve, pays, couleur) ; une équipe championne rapporte une médaille.
- **Pourquoi Maddison plutôt que la Banque mondiale** : séries plus longues et pays disparus (URSS, Yougoslavie, Tchécoslovaquie).
- Une ligne par pays et par édition : `saison, annee, pays, nom, iso3, medailles, athletes, gdppc, pop`.

## Encodages

| Élément | Encodage | Justification |
|---|---|---|
| PIB/hab | position x, échelle log | la richesse s'étale de 500 à 100 000 $ ; le log rend lisibles les écarts relatifs |
| Mesure olympique | position y (4 choix) | canal le plus précis pour la variable étudiée |
| Taille des bulles | aire ∝ population, athlètes ou médailles (racine carrée) | l'aire, pas le rayon, est proportionnelle à la valeur |
| Pays sans PIB | cercle creux, bande à gauche | présents mais hors échelle ; leur poids est indiqué par le taux de couverture |
| 0 médaille | bande sous l'axe | évite l'empilement de plus de 100 pays sur la ligne zéro, et log(0) impossible |
| Pays comparés | couleur catégorielle (5 au plus), le reste en gris | la couleur est réservée à ce que l'utilisateur a choisi ; chaque pays garde sa couleur |
| Médianes | lignes en tirets | découpent le nuage en quadrants (« moins riche, plus efficace »…) |
| Tendance | droite des moindres carrés | rend la corrélation visible |

**Efficacité** = (médailles ÷ athlètes du pays) ÷ (médailles ÷ athlètes de l'édition). 1 = moyenne de l'édition. Elle neutralise la taille de la délégation et le nombre d'épreuves, qui change d'une édition à l'autre.

## Vues et interactions, par tâche

| Tâche | Réponse dans la visualisation |
|---|---|
| Locate | recherche avec autocomplétion |
| Browse | infobulle (PIB, population, athlètes, médailles, ratios) ; curseur d'édition, bouton Lecture |
| Find Extremes | tableau triable ; mesures Médailles et Délégation ; triangle pour l'efficacité > 4 |
| Correlate | droite de tendance et ρ de Spearman de l'édition, sous le nuage |
| Find Outliers | quadrants ; efficacité (un pays pauvre et efficace ressort en haut à gauche) |
| Filter | continents, délégation minimale, Jeux, saison |
| Derive | athlètes par million d'habitants ; efficacité |
| Analyze Trends | trajectoires animées des pays dans le plan PIB × mesure, absences et boycotts signalés |
| Compare / Benchmark | jusqu'à 5 pays superposés, pastilles de couleur, résumés par pays |
| Summarize | graphique de ρ par édition : le lien se renforce-t-il ou s'affaiblit-il ? |

Principe d'organisation : vue d'ensemble (nuage), puis filtres et zoom (contrôles, édition), puis détails à la demande (infobulle, trajectoires, tableau).

## Premiers constats (Jeux olympiques d'été, filtres par défaut)

À vérifier dans l'outil avant de les citer :

- **Édition 2020, ρ entre PIB/hab et chaque mesure** : efficacité 0,33, médailles 0,50, délégation 0,55, athlètes par habitant 0,68. La richesse pèse donc plus sur la participation que sur la réussite par athlète.
- **Stabilité dans le temps** : pour l'efficacité, ρ reste entre environ 0,25 et 0,45 de 1960 à 2020.
- **Jeux d'hiver 2018** : ρ = 0,48 pour l'efficacité, soit un lien plus fort qu'en été. Explication probable : le coût des sports d'hiver et le climat.
- **Paralympiques d'été 2016** : ρ = −0,11 pour l'efficacité. C'est à prendre avec prudence, puisque seuls les pays médaillés figurent dans la source.
- **Un exemple de valeur extrême** : le Kenya atteint 4 fois l'efficacité moyenne en 2008, avec un PIB/hab de 2 500 $.

## Limites

- **Pays sans PIB** : micro-États et pays disparus. Ils pèsent environ 1 à 2 % des médailles (voir la phrase de couverture).
- **Données paralympiques** : seuls les pays médaillés figurent, et certains effectifs sont incohérents. RPC 2020 a été corrigé à la main.
- **Sports collectifs** : ils pénalisent l'efficacité, car tous les joueurs comptent comme athlètes pour une seule médaille.
- **Petites délégations** : leur efficacité est instable, d'où le filtre réglé à 5 athlètes par défaut.
- **Suivi par code ISO** : RFA et Allemagne sont réunies, de même que ROC et la Russie. L'URSS reste séparée de la Russie, car Maddison leur donne deux codes différents.
- **Corrélation et causalité** : une corrélation ne prouve pas que la richesse cause les résultats. Population, climat et accueil des Jeux jouent aussi.
