import {
  getHostByYear,
  getHostsByNocOrIso,
  getOlympicRows,
  getWorldTopo,
  registerVizController,
  navigateToViz,
  bindWikiPreviews,
  wikiLinkHtml
} from '../shared-links.js';

const state = { season: 'Summer', year: 2016, sport: 'Tous les sports', metric: 'athletes', selectedNoc: null };
const colors = ['#dbe8e1', '#b5d2c7', '#89b2a5', '#559187', '#287c78', '#174d4b'];
const formatNumber = d3.format(',');
const formatPercent = d3.format('.1f');
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
        country: row.Team ? row.Team.replace(/-\d+$/, '') : row.NOC,
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

function seasonYears(season = state.season) {
  return [...new Set(model.filter(row => row.season === season).map(row => row.year))].sort(d3.ascending);
}

function applyParams(params = {}) {
  if (!model) return;
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

  geoSel('#geo-season', '#season').property('value', state.season);
  geoSel('#geo-metric', '#metric').property('value', state.metric);
  updateYearMenu();
  updateSportMenu();
  render();
}

function updateYearMenu() {
  const years = seasonYears(state.season);
  if (!years.includes(state.year)) state.year = years[years.length - 1];
  const sel = geoSel('#geo-year', '#year');
  sel.selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
  sel.property('value', state.year);
}

function initialize(rows, world) {
  model = aggregate(rows);
  worldFeatures = topojson.feature(world, world.objects.countries).features;
  registerVizController('geographie', applyParams);

  const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  if (Object.keys(urlParams).length) applyParams(urlParams);

  geoSel('#geo-season', '#season').property('value', state.season).on('change', event => {
    state.season = event.target.value;
    state.sport = 'Tous les sports';
    updateYearMenu();
    updateSportMenu();
    render();
  });
  updateYearMenu();
  geoSel('#geo-year', '#year').on('change', event => { state.year = +event.target.value; render(); });
  updateSportMenu();
  geoSel('#geo-sport', '#sport').on('change', event => { state.sport = event.target.value; render(); });
  geoSel('#geo-metric', '#metric').property('value', state.metric).on('change', event => { state.metric = event.target.value; render(); });
  geoSel('#geo-reset', '#reset').on('click', () => {
    state.season = 'Summer';
    state.year = 2016;
    state.sport = 'Tous les sports';
    state.metric = 'athletes';
    state.selectedNoc = null;
    geoSel('#geo-season', '#season').property('value', state.season);
    geoSel('#geo-metric', '#metric').property('value', state.metric);
    updateYearMenu();
    updateSportMenu();
    render();
  });
  geoSel('#geo-close-detail', '#close-detail').on('click', () => {
    state.selectedNoc = null;
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
  sel.selectAll('option').data(options).join('option').attr('value', d => d).text(d => d);
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
      ? (isAll ? 'Taux de conversion en médailles' : 'Part de la discipline dans la délégation')
      : 'Répartition mondiale des effectifs';
  geoSel('#geo-map-eyebrow', '#map-eyebrow').text(eyebrowText);

  if (isAll) {
    geoSel('#geo-map-title', '#map-title').text(`Tous les sports (${state.season === 'Winter' ? 'Hiver' : 'Été'} ${state.year})`);
  } else {
    const prof = sportProfiles.get(`${state.season}|${state.year}|${state.sport}`);
    const metrics = prof
      ? [['Âge médian', `${prof.age.toFixed(1)} ans`], ['Taille médiane', `${prof.height.toFixed(1)} cm`], ['Poids médian', `${prof.weight.toFixed(1)} kg`]]
      : [['Édition', `${state.year}`]];
    geoSel('#geo-map-title', '#map-title').html(wikiLinkHtml({
      href: `../anatomie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(state.sport)}`,
      text: state.sport,
      eyebrow: 'L’anatomie de l’élite',
      title: `Profil physique en ${state.sport}`,
      body: `Consulter l’âge, la taille et le poids des médaillés et participants en ${state.sport} (${state.year}).`,
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
    geoSel('#geo-map-context', '#map-context').html(`Jeux organisés à ${hostLink}. Cliquez sur un pays de la carte pour détailler sa délégation.`);
  } else {
    geoSel('#geo-map-context', '#map-context').text('Cliquez sur un pays de la carte pour détailler sa délégation.');
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
    geoSel('#geo-summary-label', '#summary-label').text(isAll ? 'médailles attribuées' : `médailles en ${state.sport}`);
    geoSel('#geo-scale-min', '#scale-min').text('Moins de médailles');
    geoSel('#geo-scale-max', '#scale-max').text('Plus de médailles');
  } else if (state.metric === 'specialization') {
    const topRow = [...data].sort((a, b) => d3.descending(a.value, b.value))[0];
    geoSel('#geo-athlete-total', '#athlete-total').text(topRow && topRow.value > 0 ? `${formatPercent(topRow.value)} %` : '—');
    geoSel('#geo-summary-label', '#summary-label').text(topRow && topRow.value > 0 ? `maximum (${topRow.noc})` : 'spécialisation max');
    geoSel('#geo-scale-min', '#scale-min').text('Faible part nationale');
    geoSel('#geo-scale-max', '#scale-max').text('Forte concentration');
  } else {
    geoSel('#geo-athlete-total', '#athlete-total').text(formatNumber(d3.sum(data, row => row.sportAthletes)));
    geoSel('#geo-summary-label', '#summary-label').text(isAll ? 'athlètes affichés' : `athlètes en ${state.sport}`);
    geoSel('#geo-scale-min', '#scale-min').text('Moins d’athlètes');
    geoSel('#geo-scale-max', '#scale-max').text('Plus d’athlètes');
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
  const color = d3.scaleQuantize().domain([0, max]).range(colors);

  svg.selectAll('.sphere')
    .data([null])
    .join('path')
    .attr('class', 'sphere')
    .attr('fill', '#dce8e2')
    .attr('d', path({ type: 'Sphere' }));

  svg.selectAll('.country')
    .data(worldFeatures, feature => feature.id)
    .join('path')
    .attr('class', feature => {
      const row = lookup.get(keyFromFeature(feature));
      const hasValue = row && row.value > 0;
      const isActive = row && state.selectedNoc && row.noc === state.selectedNoc;
      return `country ${hasValue ? '' : 'no-data'} ${isActive ? 'active' : ''}`;
    })
    .attr('d', path)
    .attr('fill', feature => {
      const row = lookup.get(keyFromFeature(feature));
      return row && row.value > 0 ? color(row.value) : '#c8d1ca';
    })
    .on('mouseenter', (event, feature) => showMapTooltip(event, lookup.get(keyFromFeature(feature)), feature))
    .on('mousemove', moveTooltip)
    .on('mouseleave', () => d3.select('#tooltip').classed('visible', false))
    .on('click', (event, feature) => {
      const row = lookup.get(keyFromFeature(feature));
      if (row && (row.value > 0 || row.total > 0)) {
        state.selectedNoc = row.noc;
        d3.select(container).selectAll('.country').classed('active', false);
        d3.select(event.currentTarget).classed('active', true);
        renderDetail(row);
      }
    });
}

function showMapTooltip(event, row, feature) {
  if (!row) return;
  const name = row.country || feature.properties?.name || 'Pays';
  const isAll = state.sport === 'Tous les sports';
  const share = row.total > 0 ? (row.sportAthletes / row.total * 100) : 0;
  d3.select('#tooltip').html(
    `<strong>${name} (${row.noc})</strong>` +
    `<div class="tooltip-row"><span>${isAll ? 'Délégation totale' : `Athlètes en ${state.sport}`}</span><b>${formatNumber(row.sportAthletes)}${!isAll ? ` (${formatPercent(share)} %)` : ''}</b></div>` +
    `<div class="tooltip-row"><span>${isAll ? 'Médailles totales' : `Médailles en ${state.sport}`}</span><b>${formatNumber(row.sportMedals)}</b></div>` +
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
    text: row.country,
    eyebrow: 'Le poids de la richesse',
    title: `${row.country} (${row.noc}) en ${state.year}`,
    body: `Voir la position économique et l’efficacité olympique de ${row.country} depuis 1960.`,
    metrics: [
      ['Délégation (' + state.year + ')', `${formatNumber(row.total)} athlètes`],
      ['Médailles obtenues', `${formatNumber(row.medalsCount)} médailles`],
      ['Disciplines disputées', `${row.sportCounts.size} sports`]
    ]
  });
  geoSel('#geo-detail-title', '#detail-title').html(countryLink);

  const medalsLink = wikiLinkHtml({
    href: `../economie/index.html?saison=${ecoSaison}&year=${state.year}&country=${encodeURIComponent(row.noc)}&mesure=medailles`,
    text: `${formatNumber(row.medalsCount)} médailles`,
    eyebrow: 'Richesse et médailles',
    title: `Bilan de ${row.country} en ${state.year}`,
    body: `Comparer la récolte de médailles et le PIB par habitant de ${row.country}.`,
    metrics: [
      ['Athlètes engagés', `${formatNumber(row.total)}`],
      ['Médailles', `${formatNumber(row.medalsCount)}`]
    ]
  });
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
    .attr('fill', (item, index) => colors[(index + 2) % colors.length])
    .attr('stroke', 'var(--panel)')
    .attr('stroke-width', 2)
    .style('cursor', d => d.data[0] !== 'Autres' ? 'pointer' : 'default')
    .on('click', (_, d) => {
      if (d.data[0] !== 'Autres') {
        navigateToViz('anatomie', { season: state.season, year: state.year, sport: d.data[0], noc: row.noc });
      }
    });

  svg.append('text').attr('class', 'donut-total').attr('y', -2).text(formatNumber(useMedalsInDonut ? row.medalsCount : row.total));
  svg.append('text').attr('class', 'donut-label').attr('y', 15).text(useMedalsInDonut ? 'médailles' : 'athlètes');

  geoSel('#geo-detail-legend', '#detail-legend').html(top.map((item, index) => {
    const sportName = item[0];
    const dot = `<i style="background:${colors[(index + 2) % colors.length]}"></i>`;
    if (sportName === 'Autres') {
      return `<div class="legend-item">${dot}<span>${sportName}</span><span>${formatNumber(item[1])}</span></div>`;
    }
    const athCount = row.sportCounts.get(sportName) || 0;
    const medCount = row.sportMedalCounts.get(sportName) || 0;
    const prof = sportProfiles.get(`${state.season}|${state.year}|${sportName}`);
    const link = wikiLinkHtml({
      href: `../anatomie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(sportName)}&noc=${row.noc}`,
      text: sportName,
      eyebrow: 'L’anatomie de l’élite',
      title: `${sportName} (${state.year})`,
      body: `Voir le profil physique des médaillés et participants en ${sportName}.`,
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
    const hostOfYear = getHostByYear(state.year, state.season);
    if (hostOfYear) {
      const hLink = wikiLinkHtml({
        href: `../domicile/index.html?season=${state.season}&year=${hostOfYear.year}`,
        text: `${hostOfYear.city} ${hostOfYear.year}`,
        eyebrow: 'Avantage à domicile',
        title: `${hostOfYear.country} à ${hostOfYear.city} ${hostOfYear.year}`,
        body: `Comparer avec la trajectoire du pays hôte de cette édition (${hostOfYear.country}).`,
        metrics: [['Pays hôte', hostOfYear.country], ['Année', `${hostOfYear.year}`]]
      });
      geoSel('#geo-detail-context', '#detail-context').html(`Édition organisée à ${hLink}.`);
    } else {
      geoSel('#geo-detail-context', '#detail-context').html('');
    }
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
