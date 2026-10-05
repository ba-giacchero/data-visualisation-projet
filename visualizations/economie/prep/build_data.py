"""Construit visualizations/economie/data/economie.json.

Sources :
- 120 years of Olympic history/athlete_events.csv (JO d'été 1960–2016) ;
- Global GDP-PIB per Capita Dataset (1960-present)/pib_per_capita_countries_dataset.csv
  (indicateur NY.GDP.PCAP.CD ; 0.0 = valeur manquante) ;
- API Banque mondiale : population SP.POP.TOTL et métadonnées pays (région).
  Les réponses brutes sont mises en cache dans prep/raw/ ; le build fonctionne
  ensuite hors ligne. `--refresh` force un nouveau téléchargement.
- prep/noc_iso3.csv : table de correspondance NOC (CIO) → ISO3, construite à la main.

Usage : python visualizations/economie/prep/build_data.py [--refresh]
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd
import requests

PREP = Path(__file__).resolve().parent
VIZ = PREP.parent
ROOT = VIZ.parents[1]
RAW = PREP / 'raw'
OUT = VIZ / 'data' / 'economie.json'

ATHLETES_CSV = ROOT / '120 years of Olympic history' / 'athlete_events.csv'
GDP_CSV = ROOT / 'Global GDP-PIB per Capita Dataset (1960-present)' / 'pib_per_capita_countries_dataset.csv'
NOC_ISO3_CSV = PREP / 'noc_iso3.csv'

FIRST_YEAR, LAST_YEAR = 1960, 2016
WB_API = 'https://api.worldbank.org/v2'
WB_COUNTRIES_URL = f'{WB_API}/country?format=json&per_page=400'
WB_POPULATION_URL = f'{WB_API}/country/all/indicator/SP.POP.TOTL?format=json&date={FIRST_YEAR}:{LAST_YEAR}&per_page=20000'
WB_COUNTRIES_RAW = RAW / 'wb_countries.json'
WB_POPULATION_RAW = RAW / 'wb_population_SP.POP.TOTL.json'

# Critères de couverture (cf. rapport)
COVERAGE_YEAR, COVERAGE_MIN = 2016, 0.95
KEY_NOCS = ['USA', 'GBR', 'GER', 'FRA', 'CHN', 'JPN', 'AUS']

REASONS = {
    'no_iso': 'pas de code ISO (entité historique ou non nationale)',
    'no_gdp': 'pas de PIB par habitant',
    'no_population': 'pas de population',
}

# --- Régions Banque mondiale → 5 continents -------------------------------
# Libellés des régions BM (le libellé MENA a changé en 2024, les deux sont acceptés).
REGION_CONTINENT = {
    'Sub-Saharan Africa': 'Afrique',
    'Latin America & Caribbean': 'Amériques',
    'North America': 'Amériques',
    'South Asia': 'Asie',
    'East Asia & Pacific': 'Asie',
    'Europe & Central Asia': 'Europe',
    'Middle East & North Africa': 'Asie',
    'Middle East, North Africa, Afghanistan & Pakistan': 'Asie',
}
# Exceptions pays par pays, prioritaires sur la région :
CONTINENT_OVERRIDES = {
    # MENA : Maghreb, Égypte (et Djibouti, Corne de l'Afrique) → Afrique ; Malte → Europe.
    **{iso: 'Afrique' for iso in ['DZA', 'MAR', 'TUN', 'LBY', 'EGY', 'DJI']},
    'MLT': 'Europe',
    # East Asia & Pacific : Australie, Nouvelle-Zélande et îles du Pacifique → Océanie.
    **{iso: 'Océanie' for iso in ['AUS', 'NZL', 'PNG', 'FJI', 'SLB', 'VUT', 'WSM', 'TON', 'KIR',
                                  'TUV', 'NRU', 'FSM', 'MHL', 'PLW', 'ASM', 'GUM', 'MNP',
                                  'NCL', 'PYF']},
    # Europe & Central Asia : l'Asie centrale (membres du Conseil olympique d'Asie) → Asie.
    # Le Caucase (ARM, AZE, GEO), la Turquie et Chypre restent en Europe : leurs comités
    # nationaux appartiennent aux Comités olympiques européens.
    **{iso: 'Asie' for iso in ['KAZ', 'KGZ', 'TJK', 'TKM', 'UZB']},
}
CONTINENTS = ['Afrique', 'Amériques', 'Asie', 'Europe', 'Océanie']

# Noms Banque mondiale peu lisibles → nom usuel en anglais.
NAME_OVERRIDES = {
    'BHS': 'Bahamas', 'GMB': 'Gambia', 'VEN': 'Venezuela', 'PRI': 'Puerto Rico',
    'KNA': 'Saint Kitts and Nevis', 'LCA': 'Saint Lucia', 'VCT': 'Saint Vincent and the Grenadines',
    'VIR': 'US Virgin Islands', 'EGY': 'Egypt', 'IRN': 'Iran', 'PSE': 'Palestine', 'SYR': 'Syria',
    'YEM': 'Yemen', 'CIV': "Côte d'Ivoire", 'COD': 'DR Congo', 'COG': 'Republic of the Congo',
    'SOM': 'Somalia', 'KGZ': 'Kyrgyzstan', 'RUS': 'Russia', 'SVK': 'Slovakia', 'TUR': 'Turkey',
    'FSM': 'Micronesia', 'HKG': 'Hong Kong', 'KOR': 'South Korea', 'PRK': 'North Korea',
    'LAO': 'Laos', 'NRU': 'Nauru', 'VNM': 'Vietnam', 'BRN': 'Brunei', 'CZE': 'Czech Republic',
}


def fetch_json(url, path, refresh):
    """Télécharge `url` dans `path` (cache brut) sauf s'il existe déjà."""
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding='utf-8'))
    print(f'Téléchargement {url}')
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    payload = response.json()
    meta = payload[0]
    if int(meta.get('pages', 1)) > 1:
        sys.exit(f'Réponse paginée inattendue pour {url} : augmenter per_page.')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(response.text, encoding='utf-8')  # réponse brute, telle que reçue
    return payload


def load_world_bank(refresh):
    _, countries = fetch_json(WB_COUNTRIES_URL, WB_COUNTRIES_RAW, refresh)
    _, population = fetch_json(WB_POPULATION_URL, WB_POPULATION_RAW, refresh)

    meta = {}
    for country in countries:
        region = country['region']['value'].strip()
        if region == 'Aggregates':
            continue
        iso3 = country['id']
        if region not in REGION_CONTINENT:
            sys.exit(f'Région Banque mondiale inconnue pour {iso3} : {region!r}')
        meta[iso3] = {
            'name': NAME_OVERRIDES.get(iso3, country['name']),
            'continent': CONTINENT_OVERRIDES.get(iso3, REGION_CONTINENT[region]),
        }

    pop = {}
    for row in population:
        iso3 = row['countryiso3code']
        if iso3 in meta and row['value']:
            pop[(iso3, int(row['date']))] = int(row['value'])
    return meta, pop


def load_gdp():
    gdp = pd.read_csv(GDP_CSV, usecols=['country_code', 'indicator_code', 'year', 'gdp_per_capita'])
    gdp = gdp[(gdp.indicator_code == 'NY.GDP.PCAP.CD') & (gdp.gdp_per_capita > 0)]
    return {(row.country_code, int(row.year)): float(row.gdp_per_capita) for row in gdp.itertuples()}


def load_noc_table(nocs_needed, wb_meta):
    table = pd.read_csv(NOC_ISO3_CSV, dtype=str, keep_default_na=False)
    if list(table.columns) != ['noc', 'iso3', 'note'] or table.noc.duplicated().any():
        sys.exit('noc_iso3.csv : colonnes attendues noc,iso3,note et NOC uniques.')
    missing = sorted(set(nocs_needed) - set(table.noc))
    if missing:
        sys.exit(f'noc_iso3.csv ne couvre pas ces NOC : {", ".join(missing)}')
    for row in table.itertuples():
        if row.iso3 and row.iso3 not in wb_meta and not row.note:
            sys.exit(f'{row.noc} → {row.iso3} : ISO3 absent de la Banque mondiale sans note explicative.')
        if not row.iso3 and not row.note:
            sys.exit(f'{row.noc} : iso3 vide sans note explicative.')
    return dict(zip(table.noc, table.iso3))


def load_olympics():
    athletes = pd.read_csv(ATHLETES_CSV, usecols=['ID', 'Team', 'NOC', 'Year', 'Season', 'Event', 'Medal'])
    summer = athletes[(athletes.Season == 'Summer') & athletes.Year.between(FIRST_YEAR, LAST_YEAR)]
    # Athlètes uniques par (édition, NOC).
    counts = summer.groupby(['Year', 'NOC']).ID.nunique().rename('athletes').to_frame()
    # Médailles dédupliquées : une médaille d'équipe compte 1 par (NOC, épreuve, métal).
    medals = (summer.dropna(subset=['Medal'])
              .drop_duplicates(['Year', 'NOC', 'Event', 'Medal'])
              .groupby(['Year', 'NOC']).size().rename('medals'))
    counts = counts.join(medals).fillna({'medals': 0}).astype(int).reset_index()

    # Libellé des délégations exclues sans ISO (URS → « Soviet Union ») : nom d'équipe le plus
    # fréquent, sans les suffixes « -1 », « -2 » des équipes multiples.
    teams = summer.assign(Team=summer.Team.str.replace(r'-\d+$', '', regex=True))
    labels = teams.groupby('NOC').Team.agg(lambda t: t.mode().iloc[0]).to_dict()
    return counts, labels


def build(refresh):
    wb_meta, population = load_world_bank(refresh)
    gdp = load_gdp()
    counts, labels = load_olympics()
    noc_iso3 = load_noc_table(counts.NOC.unique(), wb_meta)

    editions = []
    for year, group in counts.groupby('Year'):
        year = int(year)
        kept, excluded = [], {key: [] for key in REASONS}
        for row in group.itertuples():
            iso3 = noc_iso3[row.NOC]
            if not iso3:
                reason = 'no_iso'
            elif (iso3, year) not in gdp:
                reason = 'no_gdp'
            elif (iso3, year) not in population or iso3 not in wb_meta:
                reason = 'no_population'
            else:
                kept.append({
                    'noc': row.NOC,
                    'iso3': iso3,
                    'country': wb_meta[iso3]['name'],
                    'continent': wb_meta[iso3]['continent'],
                    'gdp': round(gdp[(iso3, year)], 2),
                    'population': population[(iso3, year)],
                    'athletes': int(row.athletes),
                    'medals': int(row.medals),
                })
                continue
            excluded[reason].append({
                'noc': row.NOC,
                'name': wb_meta[iso3]['name'] if iso3 in wb_meta else labels[row.NOC],
                'athletes': int(row.athletes),
                'medals': int(row.medals),
            })

        by_reason = {
            key: {
                'label': REASONS[key],
                'countries': len(rows),
                'athletes': sum(r['athletes'] for r in rows),
                'medals': sum(r['medals'] for r in rows),
                'nocs': sorted(rows, key=lambda r: -r['athletes']),
            }
            for key, rows in excluded.items()
        }
        editions.append({
            'year': year,
            'total': {
                'countries': len(group),
                'athletes': int(group.athletes.sum()),
                'medals': int(group.medals.sum()),
            },
            'countries': sorted(kept, key=lambda r: r['noc']),
            'excluded': {
                'countries': sum(b['countries'] for b in by_reason.values()),
                'athletes': sum(b['athletes'] for b in by_reason.values()),
                'medals': sum(b['medals'] for b in by_reason.values()),
                'reasons': by_reason,
            },
        })
    return editions, noc_iso3


def report(editions, noc_iso3):
    pct = lambda part, whole: f'{100 * part / whole:5.1f} %' if whole else '   — '
    print('\nCouverture par édition (conservé / total)')
    print(f'{"Année":<6} {"Pays":>11} {"Athlètes":>22} {"Médailles":>20}')
    for e in editions:
        k = {key: e['total'][key] - e['excluded'][key] for key in ('countries', 'athletes', 'medals')}
        t = e['total']
        print(f'{e["year"]:<6} {k["countries"]:>4}/{t["countries"]:<4}   '
              f'{k["athletes"]:>6}/{t["athletes"]:<6} {pct(k["athletes"], t["athletes"])}  '
              f'{k["medals"]:>4}/{t["medals"]:<4} {pct(k["medals"], t["medals"])}')

    print('\nNOC exclus (toutes éditions confondues)')
    totals = {}
    for e in editions:
        for key, block in e['excluded']['reasons'].items():
            for r in block['nocs']:
                entry = totals.setdefault(r['noc'], {'name': r['name'], 'athletes': 0, 'medals': 0,
                                                     'years': [], 'reasons': set()})
                entry['athletes'] += r['athletes']
                entry['medals'] += r['medals']
                entry['years'].append(e['year'])
                entry['reasons'].add(key)
    for noc, entry in sorted(totals.items(), key=lambda item: -item[1]['athletes']):
        iso = noc_iso3[noc] or '—'
        years = ', '.join(str(y) for y in entry['years'])
        print(f'  {noc:<4} {iso:<4} {entry["name"][:34]:<34} {entry["athletes"]:>6} athl. '
              f'{entry["medals"]:>4} méd.  [{"/".join(sorted(entry["reasons"]))}]  {years}')

    print('\nCritères')
    ok = True
    target = next(e for e in editions if e['year'] == COVERAGE_YEAR)
    for key in ('athletes', 'medals'):
        share = 1 - target['excluded'][key] / target['total'][key]
        passed = share >= COVERAGE_MIN
        ok &= passed
        print(f'  [{"OK" if passed else "ÉCHEC"}] {COVERAGE_YEAR} : {key} couverts {share:.1%} (seuil {COVERAGE_MIN:.0%})')
    for noc in KEY_NOCS:
        missing = [e['year'] for e in editions
                   if any(r['noc'] == noc for b in e['excluded']['reasons'].values() for r in b['nocs'])]
        present = [e['year'] for e in editions if any(c['noc'] == noc for c in e['countries'])]
        passed = not missing
        ok &= passed
        detail = f'exclu en {missing}' if missing else f'présent aux {len(present)} éditions disputées'
        print(f'  [{"OK" if passed else "ÉCHEC"}] {noc} : {detail}')
    return ok


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true', help='retélécharger les données Banque mondiale')
    args = parser.parse_args()

    editions, noc_iso3 = build(args.refresh)
    unknown = {c['noc'] for e in editions for c in e['countries'] if c['continent'] not in CONTINENTS}
    if unknown:
        sys.exit(f'Continent non résolu pour : {", ".join(sorted(unknown))}')

    payload = {
        'meta': {
            'generated': date.today().isoformat(),
            'season': 'Summer',
            'years': [e['year'] for e in editions],
            'continents': CONTINENTS,
            'sources': {
                'olympics': '120 years of Olympic history (athlete_events.csv)',
                'gdp': 'Banque mondiale NY.GDP.PCAP.CD (pib_per_capita_countries_dataset.csv)',
                'population': f'Banque mondiale SP.POP.TOTL (API, {FIRST_YEAR}–{LAST_YEAR})',
                'regions': 'Banque mondiale, métadonnées pays (region.value), regroupées en 5 continents',
            },
            'notes': {
                'athletes': 'Athlètes uniques (ID) par pays et par édition.',
                'medals': "Médailles dédupliquées par (NOC, épreuve, métal) : une médaille d'équipe compte 1.",
            },
        },
        'editions': editions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Écrit {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} Ko)')

    if not report(editions, noc_iso3):
        sys.exit('\nAu moins un critère de couverture n’est pas atteint : corriger noc_iso3.csv.')


if __name__ == '__main__':
    main()
