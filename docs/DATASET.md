# Contrat du dataset importable

Le sélecteur de source remplace les quatre tables en même temps. L'import attend un **JSON normalisé**, pas un CSV arbitraire. C'est nécessaire car une distribution anatomique, un résultat national et une édition hôte n'ont pas la même granularité.

Pour un exemple complet, exporter la source courante depuis l'interface, ou consulter `dashboard/data/olympedia.json`. Taille d'import maximale : 40 Mo. Aucun fichier importé n'est envoyé sur un serveur. Au rechargement, un import doit être refait ; l'URL ne transporte pas son contenu.

## Structure

```json
{
  "schemaVersion": 1,
  "name": "Ma source olympique",
  "countries": [],
  "sports": [],
  "profiles": [],
  "hosts": [],
  "meta": {}
}
```

`season` vaut `summer` ou `winter`. `year` est l'année nominale de l'édition. Les nombres manquants sont `null`, jamais des chaînes `NA`, un zéro fictif ou `NaN`.

## countries — un pays par saison et édition

```json
{"season":"summer","year":2016,"noc":"FRA","name":"France","continent":"Europe","gdp":36800,"population":66000000,"athletes":400,"medals":42}
```

Cet exemple illustre le format ; les valeurs économiques et d'effectifs ci-dessus ne sont pas les données de référence du projet.

- `gdp` : PIB/habitant annuel, dollars internationaux PPA 2011, positif ou null.
- `population` : habitants de cette année, positif ou null.
- `athletes` : inscrits distincts par NOC et édition.
- `medals` : médailles nationales, collectifs dédupliqués.
- `continent` : Europe, Asie, Afrique, Amérique, Océanie ou Autre.
- Aucune clé (saison, année, NOC) dupliquée.

## sports — un pays/sport par édition

Même clé pays-édition, plus `sport`, `athletes`, `medals`. Le pays-édition doit exister dans `countries`. La somme des médailles par sport doit égaler le total national. Les effectifs des sports ne sont pas forcément additifs : une personne peut être inscrite dans plusieurs disciplines.

## profiles — distribution par sexe, niveau et cohorte

Champs : `season`, `year`, `sport`, `level` (`sport` ou `event`), `event` (chaîne vide au niveau sport), `sex` (`F` ou `M`), `cohort` (`all` ou `medalists`), `total`, puis `height`, `weight`, `age`.

Chaque variable est `null` ou un résumé :

```json
{"n":80,"p10":165,"q1":170,"median":175,"q3":180,"p90":185}
```

Unités : taille en cm, poids en kg, âge en années. `n` ≤ `total`. Ordre requis : p10 ≤ q1 ≤ médiane ≤ q3 ≤ p90. Percentiles interpolés linéairement. Les valeurs de cet exemple sont illustratives.

Un athlète multi-épreuves compte une fois par sport au niveau global, mais une fois dans chaque épreuve au niveau détail. La cohorte médaillée inclut toute personne avec au moins une médaille dans ce groupe précis ; elle ne signifie pas « médaillé dans n'importe quel sport ».

## hosts — éditions hôtes présentes dans les résultats

`season`, `year`, `noc`, `name` (nom du pays) et `city`. Pas d'édition future ajoutée à partir du seul catalogue. Un pays historique n'est pas remplacé automatiquement par son successeur.

## meta — provenance et contrôles

Le pipeline renseigne `rawRows`, `scopeRows`, `matchedBioRows`, `missingSexRows`, `years`, `gdpUnit`, `age`, `note`, `medalDiscrepancies`. Ces métadonnées servent à l'audit ; les périodes dans l'interface sont recalculées à partir des lignes réelles.

## Reproduction et contrôles

`python3 scripts/build_dashboard.py` lit les sources brutes et produit les deux exports. `npm test` contrôle notamment les sommes de médailles et les définitions statistiques. L'import valide la structure, les types, les valeurs positives, les correspondances pays/discipline et l'ordre des quantiles avant tout changement d'état de l'application.
