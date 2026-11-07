// Fonctions analytiques indépendantes du DOM : mêmes calculs pour les graphiques et leurs détails.
export function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
export function ranks(values) {
  const sorted = values.map((v, i) => ({v, i})).sort((a, b) => a.v - b.v), result = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1; while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
    for (let k = i; k < j; k++) result[sorted[k].i] = (i + j - 1) / 2;
    i = j;
  }
  return result;
}
export function spearman(rows, x, y) {
  if (rows.length < 3) return null;
  const a = ranks(rows.map(x)), b = ranks(rows.map(y)), ma = mean(a), mb = mean(b);
  const numerator = a.reduce((sum, value, i) => sum + (value - ma) * (b[i] - mb), 0);
  const denominator = Math.sqrt(a.reduce((sum, v) => sum + (v - ma) ** 2, 0) * b.reduce((sum, v) => sum + (v - mb) ** 2, 0));
  return denominator ? numerator / denominator : null;
}
export function rowsForEdition(data, state, year = state.year) {
  const countries = data.countries.filter(r => r.season === state.season && r.year === year);
  if (!state.sport) return countries;
  const sports = new Map(data.sports.filter(r => r.season === state.season && r.year === year && r.sport === state.sport).map(r => [r.noc, r]));
  return countries.filter(r => sports.has(r.noc)).map(r => ({...r, ...sports.get(r.noc)}));
}
export function specialization(data, state, noc, sport) {
  const rows = data.sports.filter(r => r.season === state.season && r.year === state.year);
  const globalMedals = rows.reduce((sum, r) => sum + r.medals, 0);
  const ownMedals = rows.filter(r => r.noc === noc).reduce((sum, r) => sum + r.medals, 0);
  const sportMedals = rows.filter(r => r.sport === sport).reduce((sum, r) => sum + r.medals, 0);
  const medals = rows.find(r => r.noc === noc && r.sport === sport)?.medals || 0;
  return {medals, lq: ownMedals && sportMedals && globalMedals ? (medals / ownMedals) / (sportMedals / globalMedals) : null,
    ownMedals, sportMedals, globalMedals};
}
export function hostSeries(data, state, host) {
  if (!host) return {points: [], baseline: null};
  const years = [...new Set(data.countries.filter(r => r.season === state.season).map(r => r.year))].sort((a,b)=>a-b);
  const hostIndex = years.indexOf(host.year);
  const points = Array.from({length: 7}, (_, i) => {
    const offset = i - 3, index = hostIndex + offset, year = years[index];
    if (index < 0 || year == null) return {offset, year: null, share: null, medals: null, athletes: null, index: null};
    const rows = rowsForEdition(data, state, year), row = rows.find(r => r.noc === host.noc);
    const total = rows.reduce((sum, r) => sum + r.medals, 0);
    return {offset, year, share: row && total ? row.medals / total : null, medals: row?.medals ?? null, athletes: row?.athletes ?? null};
  });
  const previous = points.filter(r => r.offset < 0 && r.share !== null);
  const baseline = previous.length >= 2 ? mean(previous.map(r => r.share)) : null;
  return {baseline, previous: previous.length, points: points.map(r => ({...r, index: baseline > 0 && r.share !== null ? r.share / baseline * 100 : null}))};
}

export function validateDataset(data) {
  const fail = reason => {throw new Error(`Dataset incompatible : ${reason}`);};
  if (!data || data.schemaVersion !== 1 || typeof data.name !== 'string') fail('nom et schemaVersion: 1 requis.');
  for (const key of ['countries', 'sports', 'profiles', 'hosts']) if (!Array.isArray(data[key])) fail(`table ${key} absente.`);
  if (!data.countries.length || data.countries.length > 30000 || data.sports.length > 400000 || data.profiles.length > 250000) fail('taille de table invalide.');
  const str = (r, k) => typeof r[k] === 'string' && r[k].length <= 400;
  const num = (r, k) => Number.isFinite(r[k]) && r[k] >= 0;
  const edition = r => ['summer', 'winter'].includes(r.season) && Number.isInteger(r.year) && r.year >= 1896 && r.year <= 2100;
  const unique = new Set();
  for (const row of data.countries) {
    if (!edition(row) || !['noc','name','continent'].every(k=>str(row,k)) || !num(row,'athletes') || !num(row,'medals')) fail('pays, saison, année ou effectifs invalides.');
    for (const k of ['gdp','population']) if (row[k] !== null && (!num(row,k) || row[k] === 0)) fail(`${k} doit être positif ou null.`);
    const key = `${row.season}|${row.year}|${row.noc}`; if(unique.has(key)) fail('doublon pays-édition.'); unique.add(key);
  }
  const sportKeys=new Set(), medalSums=new Map();
  for (const row of data.sports) {
    const countryKey=`${row.season}|${row.year}|${row.noc}`, sportKey=`${countryKey}|${row.sport}`;
    if (!edition(row) || !str(row,'sport') || !str(row,'noc') || !num(row,'athletes') || !num(row,'medals') || !unique.has(countryKey)) fail('discipline sans pays correspondant ou effectifs invalides.');
    if(sportKeys.has(sportKey))fail('doublon pays-discipline-édition.');sportKeys.add(sportKey);
    medalSums.set(countryKey,(medalSums.get(countryKey)||0)+row.medals);
  }
  for(const row of data.countries) if((medalSums.get(`${row.season}|${row.year}|${row.noc}`)||0)!==row.medals)fail('somme des médailles par discipline différente du total national.');
  for (const row of data.profiles) {
    if (!edition(row) || !str(row,'sport') || !str(row,'event') || !['sport','event'].includes(row.level) || !['F','M'].includes(row.sex) || !['all','medalists'].includes(row.cohort) || !num(row,'total')) fail('profil anatomique invalide.');
    for (const key of ['height','weight','age']) if (row[key] !== null) {
      const s = row[key];
      if (!s || !['n','p10','q1','median','q3','p90'].every(k=>num(s,k)) || s.n > row.total || s.n < 1 || !(s.p10 <= s.q1 && s.q1 <= s.median && s.median <= s.q3 && s.q3 <= s.p90)) fail('quantiles ou effectifs incohérents.');
    }
  }
  for (const row of data.hosts) if(!edition(row) || !str(row,'noc') || !str(row,'name') || !str(row,'city')) fail('édition hôte invalide.');
  return data;
}
