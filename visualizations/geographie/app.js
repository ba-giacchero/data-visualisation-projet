import {
  getHostByYear,
  getHostsByNocOrIso,
  getOlympicRows,
  getWorldTopo,
  registerVizController,
  bindWikiPreviews,
  wikiLinkHtml,
  sportFr,
  countryFr,
  formatNumber,
  formatDecimal,
  formatPercent
} from '../shared-links.js';

const state = { season: 'Summer', year: 2016, sport: 'Tous les sports', metric: 'athletes', selectedNoc: null };
// Rampe sarcelle commune aux vues 1, 2 et 3 (du plus faible au plus fort)
const colors = ['#cee3de', '#c4dcd5', '#9cc7bc', '#72aea2', '#4a948a', '#287c78'];

const mapColors = d3.range(8).map(i => {
  const t = (i + 1) / 8;
  return d3.interpolateRgb(colors[1], colors[5])(t);
});
// Catégories du donut : tons sourds cohérents avec le projet ; le gris final est réservé à « Autres »
// Sans sarcelle (réservée aux valeurs de la carte) ni rouge (réservé à la sélection)
const sportColors = ['#3b556e', '#c96d3b', '#9a8c3a', '#7a5c8e', '#5f8fa8', '#a3785a', '#6e8b5a', '#c08497', '#b8bdb6'];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const mapAliases = {
  unitedstatesofamerica: 'unitedstates',
  usa: 'unitedstates',
  greatbritain: 'unitedkingdom',
  uk: 'unitedkingdom',
  russianfederation: 'russia',
  sovietunion: 'russia',
  westgermany: 'germany',
  eastgermany: 'germany',
  korearep: 'southkorea',
  republicofkorea: 'southkorea',
  demrepkorea: 'northkorea',
  koreademocraticpeoplesrep: 'northkorea',
  czechia: 'czechrepublic',
  czechoslovakia: 'czechrepublic',
  iranislamicrep: 'iran',
  boliviaplurinationalstateof: 'bolivia',
  tanzaniaunitedrepublicof: 'tanzania',
  venezuelabolivarianrepublicof: 'venezuela',
  cotedivoire: 'ivorycoast',
  taiwan: 'chinesetaipei',
  syrianarabrepublic: 'syria',
  laopeoplesdemocraticrepublic: 'laos',
  congodemrep: 'democraticrepublicofthecongo',
  drcongo: 'democraticrepublicofthecongo',
  bosniaandherz: 'bosniaandherzegovina',
  dominicanrep: 'dominicanrepublic',
  centralafricanrep: 'centralafricanrepublic',
  eqguinea: 'equatorialguinea',
  eswatini: 'swaziland',
  macedonia: 'northmacedonia'
};

const geoSel = (scoped, fallback) => document.querySelector(scoped) ? d3.select(scoped) : d3.select(fallback);
const geoNode = (scoped, fallback) => document.querySelector(scoped) || document.querySelector(fallback);

let model;
let sportProfiles = new Map();
let worldFeatures;

function countryKey(value) {
  const key = normalize(value);
  return mapAliases[key] || key;
}

function keyFromFeature(feature) {
  return countryKey(feature.properties?.name || '');
}

function aggregate(rows) {
  const groups = new Map();
  const sProfiles = new Map();
  rows.filter(row => (row.Season === 'Summer' || row.Season === 'Winter') && +row.Year >= 1960 && +row.Year <= 2016).forEach(row => {
    const key = `${row.Season}|${row.Year}|${row.NOC}`;
    if (!groups.has(key)) {
      groups.set(key, {
        season: row.Season,
        year: +row.Year,
        noc: row.NOC,
        country: row.Team ? row.Team.replace(/-\d+$/, '') : row.NOC, // nom anglais : clé de rapprochement avec la carte
        name: countryFr(row.NOC, row.Team ? row.Team.replace(/-\d+$/, '') : row.NOC), // nom affiché en français
        athletes: new Set(),
        medals: new Set(),
        sports: new Map(),
        sportMedals: new Map()
      });
    }
    const group = groups.get(key);
    const athleteKey = `${row.NOC}|${row.ID}`;
    group.athletes.add(athleteKey);
    if (!group.sports.has(row.Sport)) group.sports.set(row.Sport, new Set());
    group.sports.get(row.Sport).add(athleteKey);

    if (row.Medal && row.Medal !== 'NA') {
      const medalKey = `${row.NOC}|${row.Event}|${row.Medal}`;
      group.medals.add(medalKey);
      if (!group.sportMedals.has(row.Sport)) group.sportMedals.set(row.Sport, new Set());
      group.sportMedals.get(row.Sport).add(medalKey);
    }

    if (row.Age !== 'NA' && row.Height !== 'NA' && row.Weight !== 'NA') {
      const sKey = `${row.Season}|${row.Year}|${row.Sport}`;
      if (!sProfiles.has(sKey)) sProfiles.set(sKey, { ages: [], heights: [], weights: [] });
      const sp = sProfiles.get(sKey);
      sp.ages.push(+row.Age);
      sp.heights.push(+row.Height);
      sp.weights.push(+row.Weight);
    }
  });

  sportProfiles = new Map(
    [...sProfiles.entries()].map(([k, v]) => [k, {
      count: v.ages.length,
      age: d3.median(v.ages),
      height: d3.median(v.heights),
      weight: d3.median(v.weights)
    }])
  );

  return [...groups.values()].map(group => ({
    ...group,
    total: group.athletes.size,
    medalsCount: group.medals.size,
    sportCounts: new Map([...group.sports].map(([sport, athletes]) => [sport, athletes.size])),
    sportMedalCounts: new Map([...group.sportMedals].map(([sport, medals]) => [sport, medals.size]))
  }));
}

// Boutons à positions (même composant que les vues 2, 3 et 4)
const setRadio = (name, value) => d3.selectAll(`input[name=${name}]`).property('checked', function () { return this.value === value; });

function seasonYears(season = state.season) {
  return [...new Set(model.filter(row => row.season === season).map(row => row.year))].sort(d3.ascending);
}

function applyParams(params = {}) {
  if (!model) return;
  stopPlay();
  const seasonParam = params.season || params.saison;
  if (seasonParam === 'Winter' || seasonParam === 'hiver') state.season = 'Winter';
  else if (seasonParam === 'Summer' || seasonParam === 'ete') state.season = 'Summer';

  const years = seasonYears(state.season);
  const y = +params.year;
  if (y && years.includes(y)) state.year = y;
  else if (!years.includes(state.year)) state.year = years[years.length - 1];

  if (params.metric && ['athletes', 'medals', 'specialization'].includes(params.metric)) {
    state.metric = params.metric;
  }

  if (params.sport) {
    const decodedSport = decodeURIComponent(params.sport);
    const sports = [...new Set(model.filter(row => row.season === state.season && row.year === state.year).flatMap(row => [...row.sportCounts.keys()]))];
    state.sport = sports.includes(decodedSport) ? decodedSport : 'Tous les sports';
  } else if (params.noc || params.country) {
    state.sport = 'Tous les sports';
  }

  const noc = params.noc || params.country;
  if (noc) {
    const found = model.find(row => row.season === state.season && row.year === state.year && (row.noc === String(noc).toUpperCase() || countryKey(row.country) === countryKey(noc)));
    if (found) state.selectedNoc = found.noc;
  }

  setRadio('geo-season', state.season);
  setRadio('geo-metric', state.metric);
  updateYearMenu();
  updateSportMenu();
  render();
}

// Édition : curseur sur les années de la saison (comme les vues 2 et 4), l'année choisie s'affiche à côté
function updateYearMenu() {
  const years = seasonYears(state.season);
  if (!years.includes(state.year)) state.year = years[years.length - 1];
  d3.select('#geo-year').attr('max', years.length - 1)
    .property('value', years.indexOf(state.year)).attr('aria-valuetext', state.year);
  d3.select('#geo-year-value').text(state.year);
}

// ---------- Lecture : les éditions défilent une par une (même rythme que la vue 2) ----------
const PLAY_STEP = 1000; // ms par édition
let playTimer = null;

function stopPlay() {
  if (playTimer) playTimer.stop();
  playTimer = null;
  d3.select('#geo-play').text('▶ Lecture').attr('aria-pressed', false);
}

function setYear(year) {
  state.year = year;
  updateYearMenu();
  render();
}

function togglePlay() {
  if (playTimer) return stopPlay();
  const years = seasonYears(state.season);
  if (state.year === years[years.length - 1]) setYear(years[0]); // depuis la fin : on repart du début
  playTimer = d3.interval(() => {
    const list = seasonYears(state.season);
    const i = list.indexOf(state.year);
    if (i >= list.length - 1) return stopPlay();
    setYear(list[i + 1]);
  }, PLAY_STEP);
  d3.select('#geo-play').text('❚❚ Pause').attr('aria-pressed', true);
}

function initialize(rows, world) {
  model = aggregate(rows);
  worldFeatures = topojson.feature(world, world.objects.countries).features;
  registerVizController('geographie', applyParams);

  const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  if (Object.keys(urlParams).length) applyParams(urlParams);

  setRadio('geo-season', state.season);
  d3.selectAll('input[name=geo-season]').on('change', event => {
    stopPlay();
    state.season = event.target.value;
    state.sport = 'Tous les sports';
    updateYearMenu();
    updateSportMenu();
    render();
  });
  updateYearMenu();
  d3.select('#geo-play').on('click', togglePlay);
  d3.select('#geo-year').on('input', event => {
    stopPlay();
    state.year = seasonYears(state.season)[+event.target.value];
    d3.select('#geo-year-value').text(state.year);
    render();
  });
  updateSportMenu();
  geoSel('#geo-sport', '#sport').on('change', event => { state.sport = event.target.value; render(); });
  setRadio('geo-metric', state.metric);
  d3.selectAll('input[name=geo-metric]').on('change', event => { state.metric = event.target.value; render(); });
  geoSel('#geo-reset', '#reset').on('click', () => {
    stopPlay();
    state.season = 'Summer';
    state.year = 2016;
    state.sport = 'Tous les sports';
    state.metric = 'athletes';
    state.selectedNoc = null;
    geoSel('#geo-country-search', '#country-search').property('value', '');
    setRadio('geo-season', state.season);
    setRadio('geo-metric', state.metric);
    updateYearMenu();
    updateSportMenu();
    render();
  });
  geoSel('#geo-close-detail', '#close-detail').on('click', () => {
    state.selectedNoc = null;
    geoSel('#geo-country-search', '#country-search').property('value', '');
    renderDetail(null);
    d3.selectAll('.country').classed('active', false);
  });
  render();
}

function updateSportMenu() {
  const sports = [...new Set(model.filter(row => row.season === state.season && row.year === state.year).flatMap(row => [...row.sportCounts.keys()]))].sort(d3.ascending);
  const options = ['Tous les sports', ...sports];
  if (!options.includes(state.sport)) state.sport = 'Tous les sports';
  const sel = geoSel('#geo-sport', '#sport');
  sel.selectAll('option').data(options).join('option').attr('value', d => d).text(d => sportFr(d));
  sel.property('value', state.sport);
}

function computeRowMetric(row) {
  const isAll = state.sport === 'Tous les sports';
  const sportAthletes = isAll ? row.total : (row.sportCounts.get(state.sport) || 0);
  const sportMedals = isAll ? row.medalsCount : (row.sportMedalCounts.get(state.sport) || 0);
  let value = sportAthletes;
  if (state.metric === 'medals') {
    value = sportMedals;
  } else if (state.metric === 'specialization') {
    if (isAll) {
      value = row.total >= 3 ? (row.medalsCount / row.total * 100) : 0;
    } else {
      value = row.total > 0 ? (sportAthletes / row.total * 100) : 0;
    }
  }
  return { ...row, sportAthletes, sportMedals, value };
}

function currentData() {
  return model.filter(row => row.season === state.season && row.year === state.year).map(computeRowMetric);
}

function renderMapHeading() {
  const host = getHostByYear(state.year, state.season);
  const isAll = state.sport === 'Tous les sports';
  const eyebrowText = state.metric === 'medals'
    ? 'Géographie des médailles'
    : state.metric === 'specialization'
      ? (isAll ? 'Médailles pour 100 athlètes' : 'Part de la discipline dans la délégation')
      : 'Répartition mondiale des effectifs';
  geoSel('#geo-map-eyebrow', '#map-eyebrow').text(eyebrowText);

  if (isAll) {
    geoSel('#geo-map-title', '#map-title').text(`Tous les sports (${state.season === 'Winter' ? 'Hiver' : 'Été'} ${state.year})`);
  } else {
    const prof = sportProfiles.get(`${state.season}|${state.year}|${state.sport}`);
    const metrics = prof
      ? [['Âge médian', `${formatDecimal(prof.age)} ans`], ['Taille médiane', `${formatDecimal(prof.height)} cm`], ['Poids médian', `${formatDecimal(prof.weight)} kg`]]
      : [['Édition', `${state.year}`]];
    geoSel('#geo-map-title', '#map-title').html(wikiLinkHtml({
      href: `../anatomie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(state.sport)}`,
      text: sportFr(state.sport),
      eyebrow: 'L’anatomie de l’élite',
      title: `Profil physique en ${sportFr(state.sport)}`,
      body: `Consulter l’âge, la taille et le poids des médaillés et participants en ${sportFr(state.sport)} (${state.year}).`,
      metrics
    }));
  }

  if (host) {
    const hostLink = wikiLinkHtml({
      href: `../domicile/index.html?season=${state.season}&year=${host.year}`,
      text: `${host.city} ${host.year} (${host.country})`,
      eyebrow: 'Trajectoire des pays hôtes',
      title: `${host.country}, pays hôte en ${host.year}`,
      body: `Observer l’évolution de la délégation et des médailles de ${host.country} autour des Jeux de ${host.year}.`,
      metrics: [['Ville hôte', host.city], ['Pays hôte', `${host.country} (${host.noc})`]]
    });
    geoSel('#geo-map-context', '#map-context').html(`Jeux organisés à ${hostLink}.`);
  } else {
    geoSel('#geo-map-context', '#map-context').text('');
  }
  bindWikiPreviews(geoNode('#geo-map-heading-box', '.map-heading'));
}

function render() {
  updateSportMenu();
  const data = currentData();
  const max = d3.max(data, row => row.value) || 1;
  renderMapHeading();

  const isAll = state.sport === 'Tous les sports';
  if (state.metric === 'medals') {
    geoSel('#geo-athlete-total', '#athlete-total').text(formatNumber(d3.sum(data, row => row.sportMedals)));
    geoSel('#geo-summary-label', '#summary-label').text(isAll ? 'médailles attribuées' : `médailles en ${sportFr(state.sport)}`);
    geoSel('#geo-scale-min', '#scale-min').text(isAll ? 'Médailles' : `Médailles en ${sportFr(state.sport)}`);
  } else if (state.metric === 'specialization') {
    const topRow = [...data].sort((a, b) => d3.descending(a.value, b.value))[0];
    geoSel('#geo-athlete-total', '#athlete-total').text(topRow && topRow.value > 0 ? `${formatPercent(topRow.value)}` : '-');
    geoSel('#geo-summary-label', '#summary-label').text(topRow && topRow.value > 0 ? `maximum (${topRow.name})` : 'spécialisation max');
    geoSel('#geo-scale-min', '#scale-min').text(isAll ? 'Médailles pour 100 athlètes' : 'Part de la délégation (%)');
  } else {
    geoSel('#geo-athlete-total', '#athlete-total').text(formatNumber(d3.sum(data, row => row.sportAthletes)));
    geoSel('#geo-summary-label', '#summary-label').text(isAll ? 'athlètes affichés' : `athlètes en ${sportFr(state.sport)}`);
    geoSel('#geo-scale-min', '#scale-min').text(isAll ? 'Athlètes' : `Athlètes en ${sportFr(state.sport)}`);
  }

  drawMap(data, max);
  renderDetail(data.find(row => row.noc === state.selectedNoc) || null);
}

function drawMap(data, max) {
  const container = geoNode('#geo-map', '#map');
  if (!container) return;
  const width = Math.max(container.clientWidth, 560);
  const height = Math.round(width * 0.49);
  const mapSel = d3.select(container);
  const svg = mapSel.selectAll('svg').data([null]).join('svg').attr('class', 'map-svg').attr('viewBox', `0 0 ${width} ${height}`);
  const projection = d3.geoNaturalEarth1().fitSize([width, height], { type: 'FeatureCollection', features: worldFeatures });
  const path = d3.geoPath(projection);
  const lookup = new Map();
  data.forEach(row => {
    const k = countryKey(row.country);
    if (!lookup.has(k) || row.total > lookup.get(k).total) lookup.set(k, row);
  });
  const search = geoSel('#geo-country-search', '#country-search');
  geoSel('#geo-country-options', '#country-options')
    .selectAll('option')
    .data([...lookup.values()].filter(row => row.total > 0).sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    .join('option')
    .attr('value', row => row.name);
  search.on('change', event => {
    const typed = normalize(event.target.value);
    const row = [...lookup.values()].find(item => normalize(item.name) === typed) || lookup.get(countryKey(event.target.value));
    if (row && row.total > 0) selectCountry(row);
  });
  // Classes de même effectif (quantiles) sur les valeurs non nulles : avec des classes de même largeur,
  // 172 pays sur 207 tombaient dans la première classe en 2016 (555 athlètes pour les États-Unis, médiane à 11).
  // La valeur 0 a sa propre teinte, la plus claire.
  const positives = data.map(row => row.value).filter(v => Number.isFinite(v) && v > 0);
  const color = d3.scaleQuantile().domain(positives.length ? positives : [1]).range(mapColors);
  const fillFor = value => (value > 0 ? color(value) : colors[0]);
  renderMapLegend(color, positives);

  svg.selectAll('.sphere')
    .data([null])
    .join('path')
    .attr('class', 'sphere')
    .attr('fill', '#eceeea')
    .attr('d', path({ type: 'Sphere' }));

  svg.selectAll('.country')
    .data(worldFeatures, feature => feature.id)
    .join('path')
    .attr('class', feature => {
      const row = lookup.get(keyFromFeature(feature));
      const hasValue = row && Number.isFinite(row.value);
      const isActive = row && state.selectedNoc && row.noc === state.selectedNoc;
      return `country ${hasValue ? '' : 'no-data'} ${isActive ? 'active' : ''}`;
    })
    .attr('d', path)
    .attr('fill', feature => {
      const row = lookup.get(keyFromFeature(feature));
      return row && Number.isFinite(row.value) ? fillFor(row.value) : '#d8d9d5';
    })
    .on('mouseenter', (event, feature) => showMapTooltip(event, lookup.get(keyFromFeature(feature)), feature))
    .on('mousemove', moveTooltip)
    .on('mouseleave', () => d3.select('#tooltip').classed('visible', false))
    .on('click', (event, feature) => {
      const row = lookup.get(keyFromFeature(feature));
      if (row && (row.value > 0 || row.total > 0)) selectCountry(row);
    });
}

// Légende de la carte : une pastille par classe avec ses bornes (0 à part)
function renderMapLegend(color, values) {
  const isPercent = state.metric === 'specialization';
  const fmt = isPercent ? formatDecimal : formatNumber;

  const items = [{ fill: colors[0], label: '0' }];

  color.range().forEach(fill => {
    const classValues = values.filter(value => color(value) === fill);

    if (!classValues.length) return;

    const min = d3.min(classValues);
    const max = d3.max(classValues);

    items.push({
      fill,
      label: min === max
        ? fmt(min)
        : `${fmt(min)}-${fmt(max)}`
    });
  });

  items.push({ fill: '#d8d9d5', label: 'absent' });

  geoSel('#geo-scale-classes', '#scale-classes')
    .html(items
      .map(item =>
        `<span class="scale-item">
          <i style="background:${item.fill}"></i>${item.label}
        </span>`
      )
      .join(''));
}

function selectCountry(row) {
  state.selectedNoc = row.noc;
  geoSel('#geo-country-search', '#country-search').property('value', row.name);
  render();
}

function showMapTooltip(event, row, feature) {
  const name = row?.name || feature.properties?.name || 'Pays';
  if (!row) {
    d3.select('#tooltip').html(`<strong>${name}</strong>`).classed('visible', true);
    moveTooltip(event);
    return;
  }
  const isAll = state.sport === 'Tous les sports';
  const share = row.total > 0 ? (row.sportAthletes / row.total * 100) : 0;
  d3.select('#tooltip').html(
    `<strong>${name} (${row.noc})</strong>` +
    `<div class="tooltip-row"><span>${isAll ? 'Délégation totale' : `Athlètes en ${sportFr(state.sport)}`}</span><b>${formatNumber(row.sportAthletes)}${!isAll ? ` (${formatPercent(share)})` : ''}</b></div>` +
    `<div class="tooltip-row"><span>${isAll ? 'Médailles totales' : `Médailles en ${sportFr(state.sport)}`}</span><b>${formatNumber(row.sportMedals)}</b></div>` +
    (!isAll ? `<div class="tooltip-row"><span>Total national</span><b>${formatNumber(row.total)} athlètes, ${formatNumber(row.medalsCount)} médailles</b></div>` : '')
  ).classed('visible', true);
  moveTooltip(event);
}

function moveTooltip(event) {
  const node = document.querySelector('#tooltip');
  if (!node) return;
  const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14);
  const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14);
  d3.select('#tooltip').style('left', `${Math.max(8, left)}px`).style('top', `${Math.max(8, top)}px`);
}

function renderDetail(row) {
  const panel = geoSel('#geo-detail-panel', '#detail-panel');
  if (!row) {
    panel.classed('empty', true);
    geoSel('#geo-detail-title', '#detail-title').text('Choisissez un pays sur la carte');
    geoSel('#geo-detail-subtitle', '#detail-subtitle').text('Cliquez sur un pays coloré de la carte pour faire apparaître la composition de sa délégation par sport.');
    geoSel('#geo-detail-chart', '#detail-chart').html('');
    geoSel('#geo-detail-legend', '#detail-legend').html('');
    geoSel('#geo-detail-context', '#detail-context').html('');
    return;
  }
  panel.classed('empty', false);
  const ecoSaison = state.season === 'Winter' ? 'hiver' : 'ete';

  const countryLink = wikiLinkHtml({
    href: `../economie/index.html?saison=${ecoSaison}&year=${state.year}&country=${encodeURIComponent(row.noc)}`,
    text: row.name,
    eyebrow: 'Le poids de la richesse',
    title: `${row.name} (${row.noc}) en ${state.year}`,
    body: `Voir le groupe de richesse de ${row.name} en ${state.year} et le comparer aux autres pays.`,
    metrics: [
      ['Délégation (' + state.year + ')', `${formatNumber(row.total)} athlètes`],
      ['Médailles obtenues', `${formatNumber(row.medalsCount)} médailles`],
      ['Disciplines disputées', `${row.sportCounts.size} sports`]
    ]
  });
  geoSel('#geo-detail-title', '#detail-title').html(countryLink);

  const medalsLink = `${formatNumber(row.medalsCount)} médailles`; // (le lien vers la vue 2 est porté par le nom du pays)
  geoSel('#geo-detail-subtitle', '#detail-subtitle').html(`${state.year} : ${formatNumber(row.total)} athlètes, ${medalsLink}`);

  const useMedalsInDonut = state.metric === 'medals' && row.medalsCount > 0;
  const sourceMap = useMedalsInDonut ? row.sportMedalCounts : row.sportCounts;
  const sports = [...sourceMap].filter(d => d[1] > 0).sort((a, b) => d3.descending(a[1], b[1]));
  const top = sports.slice(0, 8);
  const remainder = d3.sum(sports.slice(8), item => item[1]);
  if (remainder) top.push(['Autres', remainder]);

  const radius = 72;
  const pie = d3.pie().sort(null).value(item => item[1]);
  const arc = d3.arc().innerRadius(42).outerRadius(radius);
  const svg = geoSel('#geo-detail-chart', '#detail-chart')
    .html('')
    .append('svg')
    .attr('class', 'donut')
    .attr('width', 176)
    .attr('height', 176)
    .attr('viewBox', '0 0 176 176')
    .append('g')
    .attr('transform', 'translate(88,88)');

  svg.selectAll('path')
    .data(pie(top))
    .join('path')
    .attr('d', arc)
    .attr('fill', (item, index) => sportColors[index % sportColors.length])
    .attr('stroke', 'var(--panel)')
    .attr('stroke-width', 2);

  svg.append('text').attr('class', 'donut-total').attr('y', -2).text(formatNumber(useMedalsInDonut ? row.medalsCount : row.total));
  svg.append('text').attr('class', 'donut-label').attr('y', 15).text(useMedalsInDonut ? 'médailles' : 'athlètes');

  geoSel('#geo-detail-legend', '#detail-legend').html(top.map((item, index) => {
    const sportName = item[0];
    const dot = `<i style="background:${sportColors[index % sportColors.length]}"></i>`;
    if (sportName === 'Autres') {
      return `<div class="legend-item">${dot}<span>${sportFr(sportName)}</span><span>${formatNumber(item[1])}</span></div>`;
    }
    const athCount = row.sportCounts.get(sportName) || 0;
    const medCount = row.sportMedalCounts.get(sportName) || 0;
    const prof = sportProfiles.get(`${state.season}|${state.year}|${sportName}`);
    const link = wikiLinkHtml({
      href: `../anatomie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(sportName)}&noc=${row.noc}`,
      text: sportFr(sportName),
      eyebrow: 'L’anatomie de l’élite',
      title: `${sportFr(sportName)} (${state.year})`,
      body: `Voir le profil physique des médaillés et participants en ${sportFr(sportName)}.`,
      metrics: [
        [`Bilan ${row.noc}`, `${athCount} athl., ${medCount} méd.`],
        ['Taille médiane mondiale', prof ? `${prof.height.toFixed(0)} cm` : 'N/D'],
        ['Poids médian mondial', prof ? `${prof.weight.toFixed(0)} kg` : 'N/D']
      ]
    });
    const badgeText = medCount > 0 ? `${formatNumber(athCount)} athl. (${medCount} méd.)` : `${formatNumber(athCount)} athl.`;
    return `<div class="legend-item">${dot}<span>${link}</span><span>${badgeText}</span></div>`;
  }).join(''));

  const hostedEditions = getHostsByNocOrIso(row.noc, state.season);
  if (hostedEditions.length) {
    const links = hostedEditions.map(h => wikiLinkHtml({
      href: `../domicile/index.html?season=${state.season}&year=${h.year}`,
      text: `${h.city} ${h.year}`,
      eyebrow: 'Avantage à domicile',
      title: `${h.country} à ${h.city} ${h.year}`,
      body: `Voir l’effet de l’accueil des Jeux de ${h.year} sur la délégation et les médailles de ${h.country}.`,
      metrics: [['Édition hôte', `${h.city} ${h.year}`], ['Pays', h.country]]
    })).join(', ');
    geoSel('#geo-detail-context', '#detail-context').html(`Pays hôte (${state.season === 'Winter' ? 'Hiver' : 'Été'}) : ${links}.`);
  } else {
    geoSel('#geo-detail-context', '#detail-context').html('');
  }

  bindWikiPreviews(geoNode('#geo-detail-panel', '#detail-panel'));
}

Promise.all([getOlympicRows(), getWorldTopo()])
  .then(([rows, world]) => initialize(rows, world))
  .catch(error => {
    console.error(error);
    geoSel('#geo-map', '#map').html('<p>Impossible de charger la carte et les données.</p>');
  });

window.addEventListener('resize', () => {
  if (model && worldFeatures) {
    const data = currentData();
    drawMap(data, d3.max(data, row => row.value) || 1);
  }
});
