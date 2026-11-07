"""Prépare les deux sources du tableau de bord sans dépendance Python externe.

Exécution : python3 scripts/build_dashboard.py
Les CSV sont lus avec le parseur standard (champs multilignes et BOM compris).
"""
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dashboard' / 'data'


def read(path):
    with (ROOT / path).open(encoding='utf-8-sig', newline='') as stream:
        yield from csv.DictReader(stream)


def number(value):
    """Une plage biographique n'est pas une mesure ponctuelle : elle reste manquante."""
    try:
        n = float(value)
        return n if math.isfinite(n) and n > 0 else None
    except (ValueError, TypeError):
        return None


def quantile(values, p):
    pos = (len(values) - 1) * p
    lo, hi = math.floor(pos), math.ceil(pos)
    return round(values[lo] + (values[hi] - values[lo]) * (pos - lo), 2)


def summary(values):
    values = sorted(v for v in values if v is not None)
    return {'n': len(values), 'q1': quantile(values, .25), 'median': quantile(values, .5),
            'q3': quantile(values, .75), 'p10': quantile(values, .1), 'p90': quantile(values, .9)} if values else None


country_names = {r['noc']: r['country'] for r in read('donnees_brutes/Olympics_Country.csv')}
iso = {r['noc']: r['iso3'] for r in read('tables_code_pays/noc_iso3.csv')}
continents = {r['code']: r['continent'] for r in read('tables_code_pays/code_continent.csv')}
economics = {(r['saison'], int(r['annee']), r['pays']): r for r in read('visualizations/economie/data/olympiques.csv')}
games = {}
for r in read('donnees_brutes/Olympics_Games.csv'):
    if 'Summer Olympics' in r['edition'] or 'Winter Olympics' in r['edition']:
        year = int(r['year'])
        season = 'summer' if 'Summer' in r['edition'] else 'winter'
        # Tokyo 2020 s'est tenu en 2021 : l'âge estimé utilise l'année effective.
        games[(season, year)] = {'season': season, 'year': year, 'actualYear': 2021 if year == 2020 else year,
                               'city': r['city'], 'noc': r['country_noc'], 'name': country_names.get(r['country_noc'], r['country_noc'])}


def build(source, records, raw_count):
    countries, sport_groups, profiles = {}, {}, defaultdict(dict)
    edition_medals = defaultdict(set)
    all_rows = matched_bio = missing_sex = 0
    for r in records:
        season, year, noc, aid = r['season'], r['year'], r['noc'], r['id']
        if year < 1960:
            continue
        all_rows += 1
        matched_bio += r.get('bio', True)
        if not r['sex']:
            missing_sex += 1
        key = (season, year, noc)
        if key not in countries:
            eco = economics.get(('ete' if season == 'summer' else 'hiver', year, noc), {})
            countries[key] = {'season': season, 'year': year, 'noc': noc, 'name': country_names.get(noc, r.get('country') or noc),
                              'continent': continents.get(iso.get(noc), 'Autre'), 'gdp': number(eco.get('gdppc')),
                              'population': number(eco.get('pop')), '_athletes': set(), '_medals': set()}
        group = countries[key]
        group['_athletes'].add(aid)
        skey = (*key, r['sport'])
        if skey not in sport_groups:
            sport_groups[skey] = {'season': season, 'year': year, 'noc': noc, 'sport': r['sport'], '_athletes': set(), '_medals': set()}
        sg = sport_groups[skey]
        sg['_athletes'].add(aid)
        if r['medal'] in ('Gold', 'Silver', 'Bronze'):
            # Collectif : une équipe = une médaille. Individuel : deux médaillés
            # d'un même pays/couleur dans une épreuve restent deux médailles.
            medal = (r['eventId'], r['medal'], '' if r['team'] else aid)
            group['_medals'].add(medal)
            sg['_medals'].add(medal)
            edition_medals[(season, year)].add((noc, *medal))
        if r['sex'] not in ('F', 'M'):
            continue
        for level, event in [('sport', ''), ('event', r['event'])]:
            pkey = (season, year, r['sport'], level, event, r['sex'])
            # Athlète unique, par discipline/épreuve/édition/sexe. On réunit ses
            # inscriptions pour identifier les médaillés sans surpondérer les multi-épreuves.
            item = profiles[pkey].setdefault(aid, {'height': r['height'], 'weight': r['weight'], 'age': r['age'], 'medalist': False})
            item['medalist'] |= r['medal'] in ('Gold', 'Silver', 'Bronze')
    for group in [*countries.values(), *sport_groups.values()]:
        group['athletes'] = len(group.pop('_athletes'))
        group['medals'] = len(group.pop('_medals'))
    profile_rows = []
    for (season, year, sport, level, event, sex), athletes in profiles.items():
        for cohort in ['all', 'medalists']:
            people = [p for p in athletes.values() if cohort == 'all' or p['medalist']]
            if not people:
                continue
            profile_rows.append({'season': season, 'year': year, 'sport': sport, 'level': level, 'event': event,
                                 'sex': sex, 'cohort': cohort, 'total': len(people),
                                 **{measure: summary(p[measure] for p in people) for measure in ['height', 'weight', 'age']}})
    editions = sorted(edition_medals)
    result = {'schemaVersion': 1, 'name': source, 'countries': list(countries.values()), 'sports': list(sport_groups.values()),
              'profiles': profile_rows, 'hosts': [games[k] for k in editions if k in games],
              'meta': {'rawRows': raw_count, 'scopeRows': all_rows, 'matchedBioRows': matched_bio, 'missingSexRows': missing_sex,
                       'years': {},
                       'gdpUnit': 'dollars internationaux PPA 2011', 'age': 'approximatif',
                       'note': 'Inscriptions, y compris DNS. Mesures biographiques non datées. Aucune imputation des valeurs manquantes.'}}
    # Métadonnées de période déterminées par les résultats réels, jamais par le catalogue des futures éditions.
    result['meta']['years'] = {season: sorted({r['year'] for r in result['countries'] if r['season'] == season}) for season in ['summer', 'winter']}
    tally = {}
    for r in read('donnees_brutes/Olympic_Games_Medal_Tally.csv'):
        if 'Summer Olympics' in r['edition'] or 'Winter Olympics' in r['edition']:
            tally[('summer' if 'Summer' in r['edition'] else 'winter', int(r['year']), r['country_noc'])] = int(r['total'])
    result['meta']['medalDiscrepancies'] = [
        {'season': r['season'], 'year': r['year'], 'noc': r['noc'], 'results': r['medals'], 'tally': tally.get((r['season'], r['year'], r['noc']), 0)}
        for r in result['countries'] if source.startswith('Olympedia') and r['medals'] != tally.get((r['season'], r['year'], r['noc']), 0)
    ]
    filename = 'olympedia' if source.startswith('Olympedia') else 'historique'
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{filename}.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f"{source}: {all_rows:,} inscriptions, {len(countries):,} pays-éditions, {len(profile_rows):,} distributions")
    return result


def olympedia_records():
    bios = {r['athlete_id']: r for r in read('donnees_brutes/Olympic_Athlete_Bio.csv')}
    for r in read('donnees_brutes/Olympic_Athlete_Event_Results.csv'):
        if 'Summer Olympics' not in r['edition'] and 'Winter Olympics' not in r['edition']:
            continue
        year = int(r['edition'][:4]); season = 'summer' if 'Summer' in r['edition'] else 'winter'
        bio = bios.get(r['athlete_id'], {})
        born = re.search(r'(\d{4})$', bio.get('born', ''))
        age = games.get((season, year), {}).get('actualYear', year) - int(born[1]) if born else None
        yield {'season': season, 'year': year, 'noc': r['country_noc'], 'id': r['athlete_id'], 'sport': r['sport'],
               'event': r['event'], 'eventId': r['result_id'], 'team': r['isTeamSport'] == 'True', 'medal': r['medal'],
               'sex': {'Male': 'M', 'Female': 'F'}.get(bio.get('sex')), 'height': number(bio.get('height')),
               'weight': number(bio.get('weight')), 'age': age if age and 8 <= age <= 90 else None, 'bio': bool(bio)}


def historic_records():
    # Épreuves collectives identifiées depuis Olympedia ; les libellés de l'ancienne
    # source étant différents, une liste explicite conserve sa définition des sports.
    team_sports = {'Basketball', 'Football', 'Hockey', 'Ice Hockey', 'Handball', 'Volleyball', 'Beach Volleyball', 'Water Polo', 'Rugby Sevens', 'Baseball', 'Softball', 'Curling'}
    for r in read('120 years of Olympic history/athlete_events.csv'):
        event = r['Event']
        collective = r['Sport'] in team_sports or any(word in event.lower() for word in ['team', 'relay', 'double', 'pairs', 'fours', 'eights', 'quadruple', 'cox', 'two', 'four', 'synchronized', 'group', 'duet', 'skiff', 'multihull', 'tornado', 'flying dutchman', 'dragon', 'soling', 'star', '5.5 metre', '6 metre', '8 metre', '12 metre'])
        yield {'season': r['Season'].lower(), 'year': int(r['Year']), 'noc': r['NOC'], 'id': r['ID'], 'sport': r['Sport'],
               'event': event, 'eventId': event, 'team': collective, 'medal': r['Medal'], 'sex': r['Sex'],
               'height': number(r['Height']), 'weight': number(r['Weight']), 'age': number(r['Age']), 'country': r['Team']}


if __name__ == '__main__':
    build('Olympedia · résultats 1960–2022', olympedia_records(), sum(1 for _ in read('donnees_brutes/Olympic_Athlete_Event_Results.csv')))
    build('Kaggle historique · résultats 1960–2016', historic_records(), sum(1 for _ in read('120 years of Olympic history/athlete_events.csv')))
