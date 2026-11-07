import { HOST_EDITIONS, WINTER_HOST_EDITIONS, bindWikiPreviews, showWikiPreview, moveWikiPreview, hideWikiPreview, wikiLinkHtml } from '../shared-links.js';

const OLYMPIC_FILE = '../../120 years of Olympic history/athlete_events.csv';
const GDP_FILE = '../../Global GDP-PIB per Capita Dataset (1960-present)/pib_per_capita_countries_dataset.csv';
const POPULATION_FILE = '../../Demographic data/wdi_wide.csv';
const state = { season: 'Summer', index: 13, rankMetric: 'delegationEffect', detailVisible: true };
const historicalEconomicCodes = { FRG: 'DEU', URS: 'RUS', YUG: 'SRB' };
const populationKeys = { ITA:'italy', JPN:'japan', MEX:'mexico', FRG:'germany', CAN:'canada', URS:'russianfederation', RUS:'russianfederation', USA:'unitedstates', KOR:'korearep', ESP:'spain', AUS:'australia', GRE:'greece', CHN:'china', GBR:'unitedkingdom', BRA:'brazil', AUT:'austria', FRA:'france', YUG:'serbia', NOR:'norway' };

const formatNumber = d3.format(',');
const formatMoney = value => value >= 1000 ? `$${d3.format(',.0f')(value)}` : `$${d3.format('.2f')(value)}`;
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
let model;

function aggregate(rows, gdpRows, populationRows) {
  const groups = new Map();
  const sProfiles = new Map();
  const yearsBySeason = { Summer: new Set(), Winter: new Set() };

  rows.filter(row => (row.Season === 'Summer' || row.Season === 'Winter') && +row.Year >= 1960 && +row.Year <= 2016).forEach(row => {
    const year = +row.Year;
    yearsBySeason[row.Season].add(year);
    const key = `${row.Season}|${year}|${row.NOC}`;
    if (!groups.has(key)) {
      groups.set(key, {
        season: row.Season,
        year,
        noc: row.NOC,
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
      const mKey = `${row.NOC}|${row.Event}|${row.Medal}`;
      group.medals.add(mKey);
      if (!group.sportMedals.has(row.Sport)) group.sportMedals.set(row.Sport, new Set());
      group.sportMedals.get(row.Sport).add(mKey);
    }

    if (row.Age !== 'NA' && row.Height !== 'NA' && row.Weight !== 'NA') {
      const sKey = `${row.Season}|${year}|${row.Sport}`;
      if (!sProfiles.has(sKey)) sProfiles.set(sKey, { ages:[], heights:[], weights:[] });
      const sp = sProfiles.get(sKey);
      sp.ages.push(+row.Age); sp.heights.push(+row.Height); sp.weights.push(+row.Weight);
    }
  });

  const gdp = new Map();
  gdpRows.filter(row => row.indicator_code === 'NY.GDP.PCAP.CD').forEach(row => {
    const value = +String(row.gdp_per_capita).replace(',', '.');
    if (value > 0) gdp.set(`${row.year}|${row.country_code}`, value);
  });
  const population = new Map();
  populationRows.forEach(row => {
    const value = +String(row.Population).replace(/,/g, '');
    if (value > 0) population.set(normalize(row['Country Name']), value);
  });
  const sportProfiles = new Map([...sProfiles.entries()].map(([k, v]) => [k, {
    age: d3.median(v.ages),
    height: d3.median(v.heights),
    weight: d3.median(v.weights)
  }]));

  return {
    seasonYears: {
      Summer: [...yearsBySeason.Summer].sort(d3.ascending),
      Winter: [...yearsBySeason.Winter].sort(d3.ascending)
    },
    groups: [...groups.values()].map(group => ({
      ...group,
      delegation: group.athletes.size,
      medals: group.medals.size,
      sportAthletesMap: new Map([...group.sports.entries()].map(([s, set]) => [s, set.size])),
      sportMedalsMap: new Map([...group.sportMedals.entries()].map(([s, set]) => [s, set.size])),
      topSports: [...group.sports.entries()].map(([s, set]) => ({
        sport: s,
        count: set.size,
        medals: group.sportMedals.get(s)?.size || 0
      })).sort((a,b) => d3.descending(a.medals, b.medals) || d3.descending(a.count, b.count)).slice(0, 3)
    })),
    gdp,
    population,
    sportProfiles
  };
}

function getEditionByOffset(season, baseYear, offset) {
  const years = model.seasonYears[season] || [];
  const idx = years.indexOf(baseYear);
  if (idx === -1) return baseYear + offset * 4;
  const targetIdx = idx + offset;
  if (targetIdx >= 0 && targetIdx < years.length) return years[targetIdx];
  return baseYear + offset * 4;
}

function previousAverage(host, key) {
  const values = d3.range(1, 4).map(distance => {
    const y = getEditionByOffset(host.season, host.year, -distance);
    return model.groups.find(row => row.season === host.season && row.year === y && row.noc === host.noc)?.[key];
  }).filter(value => value !== undefined && value > 0);
  return values.length ? d3.mean(values) : null;
}

function computeSportDrivers(host, currentGroup) {
  if (!currentGroup) return [];
  const prevGroups = d3.range(1, 4).map(distance => {
    const y = getEditionByOffset(host.season, host.year, -distance);
    return model.groups.find(row => row.season === host.season && row.year === y && row.noc === host.noc);
  }).filter(Boolean);

  const allSports = new Set([
    ...currentGroup.sportAthletesMap.keys(),
    ...prevGroups.flatMap(g => [...g.sportAthletesMap.keys()])
  ]);

  const drivers = [];
  allSports.forEach(sport => {
    const medT = currentGroup.sportMedalsMap.get(sport) || 0;
    const athT = currentGroup.sportAthletesMap.get(sport) || 0;
    const medPrev = prevGroups.length ? d3.mean(prevGroups, g => g.sportMedalsMap.get(sport) || 0) : 0;
    const athPrev = prevGroups.length ? d3.mean(prevGroups, g => g.sportAthletesMap.get(sport) || 0) : 0;
    if (medT === 0 && athT < 3) return;
    drivers.push({
      sport,
      medT,
      medPrev,
      medDelta: medT - medPrev,
      athT,
      athPrev,
      athDelta: athT - athPrev
    });
  });

  return drivers
    .sort((a, b) => d3.descending(a.medDelta, b.medDelta) || d3.descending(a.medT, b.medT) || d3.descending(a.athDelta, b.athDelta))
    .slice(0, 4);
}

function enrichHostsForSeason(season) {
  const rawList = season === 'Winter' ? WINTER_HOST_EDITIONS : HOST_EDITIONS;
  return rawList.map(host => {
    const current = model.groups.find(row => row.season === season && row.year === host.year && row.noc === host.noc);
    const delegationBase = previousAverage(host, 'delegation');
    const medalsBase = previousAverage(host, 'medals');
    return {
      ...host,
      delegation: current?.delegation ?? null,
      medals: current?.medals ?? null,
      topSports: current?.topSports ?? [],
      sportDrivers: computeSportDrivers(host, current),
      gdp: model.gdp.get(`${host.year}|${historicalEconomicCodes[host.noc] || host.noc}`) ?? null,
      population: model.population.get(populationKeys[host.noc] || '') ?? null,
      delegationEffect: delegationBase && current ? (current.delegation - delegationBase) / delegationBase * 100 : null,
      medalsEffect: medalsBase && current ? (current.medals - medalsBase) / medalsBase * 100 : null
    };
  });
}

function updateSeasonHosts() {
  model.hosts = enrichHostsForSeason(state.season);
  const avail = availableHosts();
  if (!avail.includes(model.hosts[state.index])) {
    state.index = model.hosts.indexOf(avail[avail.length - 1] || model.hosts[0]);
  }
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const seasonParam = params.get('season') || params.get('saison');
  if (seasonParam === 'Winter' || seasonParam === 'hiver') state.season = 'Winter';
  else if (seasonParam === 'Summer' || seasonParam === 'ete') state.season = 'Summer';
  model.hosts = enrichHostsForSeason(state.season);

  const y = +params.get('year');
  const noc = params.get('noc') || params.get('country');
  if (y) {
    const idx = model.hosts.findIndex(h => h.year === y);
    if (idx !== -1) { state.index = idx; state.detailVisible = true; }
  } else if (noc) {
    const idx = model.hosts.findIndex(h => h.noc === noc.toUpperCase());
    if (idx !== -1) { state.index = idx; state.detailVisible = true; }
  }
}

function initialize(rows, gdpRows, populationRows) {
  model = aggregate(rows, gdpRows, populationRows);
  model.hosts = enrichHostsForSeason(state.season);
  applyUrlParams();
  setupControls();
  render();
}

function selectedHost() { return model.hosts[state.index] || model.hosts[0]; }

function setupControls() {
  d3.select('#season').property('value', state.season).on('change', event => {
    state.season = event.target.value;
    state.detailVisible = true;
    updateSeasonHosts();
    render();
  });
  d3.select('#rank-metric').on('change', event => {
    state.rankMetric = event.target.value;
    const available = availableHosts();
    if (!available.some(host => host.year === selectedHost().year)) state.index = model.hosts.indexOf(available[0]);
    render();
  });
  d3.select('#close-detail').on('click', () => { state.detailVisible = false; d3.select('#event-detail').attr('hidden', true); });
}

function availableHosts() {
  return model.hosts.filter(host => host.gdp !== null && host[state.rankMetric] !== null);
}

function render() {
  const host = selectedHost();
  const selLink = wikiLinkHtml({
    href: `../geographie/index.html?season=${state.season}&year=${host.year}&noc=${host.noc}`,
    text: `${host.city} ${host.year}`,
    eyebrow: 'La carte des groupes sportifs',
    title: `${host.country} (${host.noc}) · ${host.year}`,
    body: `Explorer la carte mondiale et la répartition par discipline des ${formatNumber(host.delegation || 0)} athlètes de ${host.country}.`,
    metrics: [
      ['Délégation hôte', `${formatNumber(host.delegation || 0)} athlètes`],
      ['Médailles obtenues', `${formatNumber(host.medals || 0)} médailles`]
    ]
  });
  d3.select('#selected-edition').html(selLink);
  bindWikiPreviews(document.querySelector('.toolbar'));
  renderTimeline();
  renderImpact();
  if (state.detailVisible) renderEventDetail(host);
}

function renderTimeline() {
  d3.select('#timeline').selectAll('button').data(availableHosts(), host => `${host.year}-${host.city}`).join('button').attr('class', host => `timeline-item ${host.year === selectedHost().year ? 'active' : ''}`).on('click', (_, host) => { state.index = model.hosts.indexOf(host); state.detailVisible = true; render(); }).html(host => `<span class="timeline-dot"></span><span>${host.year}</span><span class="timeline-city">${host.city}</span>`);
}

function renderImpact() {
  const container = document.querySelector('#impact');
  const width = Math.max(container.clientWidth, 650);
  const height = 430;
  const margin = { top:25, right:30, bottom:58, left:70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const validRows = availableHosts();
  const minGdp = d3.min(validRows, host => host.gdp) || 100;
  const maxGdp = d3.max(validRows, host => host.gdp) || 100000;
  const maxEffect = d3.max(validRows, host => Math.abs(host[state.rankMetric])) || 1;
  const minMedalsEffect = d3.min(validRows, host => host.medalsEffect) || -1;
  const maxMedalsEffect = d3.max(validRows, host => host.medalsEffect) || 1;
  const x = d3.scaleLog().domain([Math.max(100, minGdp * .8), maxGdp * 1.2]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([-maxEffect * 1.15, maxEffect * 1.15]).nice().range([innerHeight, 0]);
  const radius = d3.scaleSqrt().domain([0, d3.max(validRows, host => host.delegation) || 1]).range([5, 25]);
  const color = d3.scaleDiverging().domain([minMedalsEffect, 0, maxMedalsEffect]).interpolator(d3.interpolateRgbBasis(['#b9413e', '#f4f0e8', '#174d4b']));
  d3.select('#impact').selectAll('svg').remove();
  const svg = d3.select('#impact').append('svg').attr('class', 'impact-svg').attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  plot.append('g').attr('class', 'impact-grid').call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(''));
  plot.append('g').attr('class', 'impact-axis').attr('transform', `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(6, value => `$${d3.format('.2s')(value)}`));
  plot.append('g').attr('class', 'impact-axis').call(d3.axisLeft(y).ticks(6).tickFormat(value => `${value > 0 ? '+' : ''}${d3.format('.0f')(value)}%`));
  plot.append('line').attr('class', 'impact-zero').attr('x2', innerWidth).attr('y1', y(0)).attr('y2', y(0));
  plot.append('text').attr('class', 'impact-label').attr('x', innerWidth / 2).attr('y', innerHeight + 45).attr('text-anchor', 'middle').text('PIB par habitant (USD courants, échelle logarithmique)');
  plot.append('text').attr('class', 'impact-label').attr('transform', 'rotate(-90)').attr('x', -innerHeight / 2).attr('y', -51).attr('text-anchor', 'middle').text(state.rankMetric === 'delegationEffect' ? 'Progression de la taille de la délégation' : 'Progression des médailles');
  const tooltip = d3.select('#tooltip');
  plot.selectAll('.impact-point').data(validRows, host => host.year).join('circle').attr('class', host => `impact-point ${host.year === selectedHost().year ? 'active' : ''}`).attr('cx', host => x(host.gdp)).attr('cy', host => y(host[state.rankMetric])).attr('r', host => radius(host.delegation)).attr('fill', host => host.medalsEffect === null ? '#aeb8b1' : color(host.medalsEffect)).on('click', (_, host) => { state.index = model.hosts.indexOf(host); state.detailVisible = true; render(); }).on('mouseenter', (event, host) => showTooltip(event, host)).on('mousemove', moveTooltip).on('mouseleave', () => tooltip.classed('visible', false));
}

function eventRows(host) {
  return d3.range(-3, 4).map(offset => {
    const year = getEditionByOffset(host.season, host.year, offset);
    const data = model.groups.find(row => row.season === host.season && row.year === year && row.noc === host.noc);
    const economicCode = historicalEconomicCodes[host.noc] || host.noc;
    return { offset, year, delegation:data?.delegation ?? null, medals:data?.medals ?? null, gdp:model.gdp.get(`${year}|${economicCode}`) ?? null };
  });
}

function renderEventDetail(host) {
  const rows = eventRows(host);
  const ecoSaison = state.season === 'Winter' ? 'hiver' : 'ete';
  const container = document.querySelector('#event-chart');
  const width = Math.max(container.clientWidth, 760);
  const height = 700;
  const margin = { top:30, right:30, bottom:48, left:72 };
  const gap = 42;
  const panelHeight = (height - margin.top - margin.bottom - gap * 2) / 3;
  const innerWidth = width - margin.left - margin.right;
  const x = d3.scalePoint().domain(rows.map(row => row.offset)).range([0, innerWidth]).padding(.4);
  const panels = [
    {
      key:'delegation',
      title:'Taille de la délégation',
      color:'delegation',
      y:margin.top,
      format:value => `${formatNumber(value)} athlètes`,
      tick:value => value,
      href: `../geographie/index.html?season=${state.season}&year=${host.year}&noc=${host.noc}`,
      preview: {
        eyebrow: 'La carte des groupes sportifs',
        title: `Délégation de ${host.country} (${host.year})`,
        body: `Ouvrir la carte mondiale et la répartition par sport des ${formatNumber(host.delegation || 0)} athlètes engagés à domicile.`,
        metrics: [['Athlètes à T', `${formatNumber(host.delegation || 0)}`], ['Effet domicile', host.delegationEffect !== null ? `${host.delegationEffect >= 0 ? '+' : ''}${host.delegationEffect.toFixed(1)} %` : 'N/D']]
      }
    },
    {
      key:'medals',
      title:'Médailles obtenues',
      color:'medals',
      y:margin.top + panelHeight + gap,
      format:value => `${formatNumber(value)} médailles`,
      tick:value => value,
      href: `../economie/index.html?saison=${ecoSaison}&year=${host.year}&country=${host.noc}&mesure=medailles`,
      preview: {
        eyebrow: 'Le poids de la richesse',
        title: `Médailles de ${host.country} (${host.year})`,
        body: `Comparer la récolte de médailles de ${host.country} au reste du monde selon le PIB par habitant.`,
        metrics: [['Médailles à T', `${formatNumber(host.medals || 0)}`], ['Effet domicile', host.medalsEffect !== null ? `${host.medalsEffect >= 0 ? '+' : ''}${host.medalsEffect.toFixed(1)} %` : 'N/D']]
      }
    },
    {
      key:'gdp',
      title:'PIB par habitant (USD courants)',
      color:'gdp',
      y:margin.top + (panelHeight + gap) * 2,
      format:formatMoney,
      tick:value => value >= 1000 ? `$${d3.format('.2s')(value)}` : `$${value}`,
      href: `../economie/index.html?saison=${ecoSaison}&year=${host.year}&country=${host.noc}`,
      preview: {
        eyebrow: 'Le poids de la richesse',
        title: `Trajectoire économique · ${host.country}`,
        body: `Suivre la trajectoire PIB × efficacité olympique de ${host.country} depuis 1960.`,
        metrics: [['PIB/hab à T', host.gdp ? formatMoney(host.gdp) : 'N/D'], ['Population', host.population ? formatNumber(host.population) : 'N/D']]
      }
    }
  ];
  d3.select('#event-detail').attr('hidden', null);

  const countryLink = wikiLinkHtml({
    href: `../economie/index.html?saison=${ecoSaison}&year=${host.year}&country=${host.noc}`,
    text: host.country,
    eyebrow: 'Le poids de la richesse',
    title: `${host.country} (${host.noc}) · Trajectoire économique`,
    body: `Explorer la position de ${host.country} dans le nuage PIB/hab × efficacité et sa trajectoire depuis 1960.`,
    metrics: [['PIB / habitant', host.gdp ? formatMoney(host.gdp) : 'N/D'], ['Médailles (' + host.year + ')', `${formatNumber(host.medals || 0)}`]]
  });
  d3.select('#event-detail-title').html(`${countryLink} · ${host.city} ${host.year}`);

  const delLink = wikiLinkHtml({
    href: `../geographie/index.html?season=${state.season}&year=${host.year}&noc=${host.noc}`,
    text: `${formatNumber(host.delegation || 0)} athlètes`,
    eyebrow: 'La carte des groupes sportifs',
    title: `Composition sportive de ${host.country} (${host.year})`,
    body: `Voir la répartition par discipline de la délégation hôte sur la carte mondiale.`,
    metrics: [['Délégation totale', `${formatNumber(host.delegation || 0)} athlètes`], ['Effet délégation', host.delegationEffect !== null ? `${host.delegationEffect >= 0 ? '+' : ''}${host.delegationEffect.toFixed(1)} %` : 'N/D']]
  });

  const sportsLinks = (host.topSports || []).map(item => {
    const prof = model.sportProfiles.get(`${state.season}|${host.year}|${item.sport}`);
    return wikiLinkHtml({
      href: `../anatomie/index.html?season=${state.season}&year=${host.year}&sport=${encodeURIComponent(item.sport)}`,
      text: `${item.sport} (${item.medals} méd. / ${item.count} athl.)`,
      eyebrow: 'L’anatomie de l’élite',
      title: `Profil morphologique · ${item.sport} (${host.year})`,
      body: `Comparer l’âge, la taille et le poids des médaillés et participants en ${item.sport}.`,
      metrics: [
        [`Bilan ${host.noc}`, `${item.medals} méd. · ${item.count} athl.`],
        ['Taille médiane', prof ? `${prof.height.toFixed(0)} cm` : 'N/D'],
        ['Poids médian', prof ? `${prof.weight.toFixed(0)} kg` : 'N/D']
      ]
    });
  }).join(', ');

  d3.select('#event-narrative').html(
    `En <strong>${host.year}</strong>, ${countryLink} engage ${delLink} à domicile` +
    (sportsLinks ? `, avec pour fers de lance ${sportsLinks}` : '') + `.`
  );

  d3.select('#event-chart').selectAll('svg').remove();
  const svg = d3.select('#event-chart').append('svg').attr('class','event-svg').attr('width',width).attr('height',height).attr('viewBox',`0 0 ${width} ${height}`);
  svg.append('line').attr('class','host-line').attr('x1',margin.left + x(0)).attr('x2',margin.left + x(0)).attr('y1',margin.top - 12).attr('y2',height - margin.bottom);
  panels.forEach(panel => {
    const values = rows.map(row => row[panel.key]).filter(value => value !== null);
    const max = Math.max(1, d3.max(values) || 1);
    const y = d3.scaleLinear().domain([0, max * 1.18]).nice().range([panel.y + panelHeight, panel.y]);
    const plot = svg.append('g');
    plot.append('g').attr('class','event-grid').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-innerWidth).tickFormat(''));
    plot.append('g').attr('class','event-axis').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(panel.tick));
    plot.append('text')
      .attr('class','event-panel-link')
      .attr('x',margin.left)
      .attr('y',panel.y - 14)
      .text(panel.title)
      .on('mouseenter', event => showWikiPreview(event, panel.preview))
      .on('mousemove', moveWikiPreview)
      .on('mouseleave', hideWikiPreview)
      .on('click', () => { window.location.href = panel.href; });
    plot.append('g').attr('class','event-axis').attr('transform',`translate(${margin.left},${panel.y + panelHeight})`).call(d3.axisBottom(x).tickFormat(offset => offset === 0 ? 'T' : offset > 0 ? `T+${offset}` : `T${offset}`));
    const line = d3.line().defined(row => row[panel.key] !== null).x(row => margin.left + x(row.offset)).y(row => y(row[panel.key]));
    plot.append('path').datum(rows).attr('class',`event-line-${panel.color}`).attr('d',line);
    plot.selectAll('.event-point').data(rows).join('circle')
      .attr('class',row => `event-point ${panel.color}`)
      .attr('cx',row => margin.left + x(row.offset))
      .attr('cy',row => row[panel.key] === null ? y(0) : y(row[panel.key]))
      .attr('r',4)
      .attr('opacity',row => row[panel.key] === null ? .35 : 1)
      .style('cursor', row => row[panel.key] !== null ? 'pointer' : 'default')
      .on('click', (_, row) => {
        if (row[panel.key] === null) return;
        if (panel.key === 'delegation') {
          window.location.href = `../geographie/index.html?season=${state.season}&year=${row.year}&noc=${host.noc}`;
        } else {
          window.location.href = `../economie/index.html?saison=${ecoSaison}&year=${row.year}&country=${host.noc}`;
        }
      });
  });

  // Render Sport Drivers Breakdown
  const breakdown = d3.select('#host-sports-breakdown').html('');
  if (host.sportDrivers && host.sportDrivers.length) {
    breakdown.append('div').attr('class', 'host-sports-header').html(
      `<h3>Disciplines motrices de l’avantage domicile à ${host.city} ${host.year}</h3>` +
      `<span>Médailles à T comparées à la moyenne des 3 éditions précédentes (T−3 à T−1)</span>`
    );
    const grid = breakdown.append('div').attr('class', 'host-sports-grid');
    const maxMed = Math.max(1, d3.max(host.sportDrivers, d => Math.max(d.medT, d.medPrev)) || 1);

    host.sportDrivers.forEach(d => {
      const prof = model.sportProfiles.get(`${state.season}|${host.year}|${d.sport}`);
      const sLink = wikiLinkHtml({
        href: `../anatomie/index.html?season=${state.season}&year=${host.year}&sport=${encodeURIComponent(d.sport)}`,
        text: d.sport,
        eyebrow: 'L’anatomie de l’élite',
        title: `${d.sport} · Profil & Podiums (${host.year})`,
        body: `Analyser le gabarit des médaillés et les bastions nationaux en ${d.sport}.`,
        metrics: [
          [`Médailles ${host.noc} à T`, `${d.medT} (moy. avant : ${d.medPrev.toFixed(1)})`],
          [`Athlètes ${host.noc} à T`, `${d.athT} (moy. avant : ${d.athPrev.toFixed(1)})`],
          ['Profil médian mondial', prof ? `${prof.height.toFixed(0)} cm · ${prof.weight.toFixed(0)} kg` : 'N/D']
        ]
      });
      const deltaStr = `${d.medDelta >= 0 ? '+' : ''}${d.medDelta.toFixed(1)} méd.`;
      const wT = Math.round((d.medT / maxMed) * 100);
      const wPrev = Math.round((d.medPrev / maxMed) * 100);

      grid.append('div').attr('class', 'host-sport-item').html(
        `<div class="host-sport-top"><strong>${sLink}</strong><span class="host-sport-delta ${d.medDelta > 0 ? 'pos' : 'neutral'}">${deltaStr}</span></div>` +
        `<div class="host-sport-bars">` +
          `<div class="host-bar-row"><span>À domicile (T)</span><div class="host-bar-track"><div class="host-bar-fill at-t" style="width:${wT}%"></div></div><b>${d.medT} méd.</b></div>` +
          `<div class="host-bar-row"><span>Moy. T−3..−1</span><div class="host-bar-track"><div class="host-bar-fill before-t" style="width:${wPrev}%"></div></div><span>${d.medPrev.toFixed(1)} méd.</span></div>` +
        `</div>`
      );
    });
  }

  bindWikiPreviews(document.querySelector('#event-detail'));
}

function showTooltip(event, host) { const metric = state.rankMetric === 'delegationEffect' ? 'Effet sur la taille de la délégation' : 'Effet sur les médailles'; const effect = key => host[key] === null ? 'N/D' : `${host[key] >= 0 ? '+' : ''}${host[key].toFixed(1)} %`; d3.select('#tooltip').html(`<strong>${host.country} · ${host.year}</strong><div class="tooltip-row"><span>Ville hôte</span><b>${host.city}</b></div><div class="tooltip-row"><span>Effet sur la taille de la délégation</span><b>${effect('delegationEffect')}</b></div><div class="tooltip-row"><span>Effet sur les médailles</span><b>${effect('medalsEffect')}</b></div><div class="tooltip-row"><span>PIB / habitant</span><b>${host.gdp ? formatMoney(host.gdp) : 'N/D'}</b></div><div class="tooltip-row"><span>Population</span><b>${host.population ? formatNumber(host.population) : 'N/D'}</b></div><div class="tooltip-row"><span>Nombre d’athlètes</span><b>${host.delegation ? formatNumber(host.delegation) : 'N/D'}</b></div><div class="tooltip-row"><span>Médailles</span><b>${host.medals ? formatNumber(host.medals) : 'N/D'}</b></div>`).classed('visible', true); moveTooltip(event); }
function moveTooltip(event) { const node = document.querySelector('#tooltip'); const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14); const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14); d3.select('#tooltip').style('left', `${Math.max(8, left)}px`).style('top', `${Math.max(8, top)}px`); }
Promise.all([d3.csv(OLYMPIC_FILE), d3.csv(GDP_FILE), d3.csv(POPULATION_FILE)]).then(([rows, gdpRows, populationRows]) => initialize(rows, gdpRows, populationRows)).catch(error => { console.error(error); d3.select('#impact').html('<p>Impossible de charger les données de la trajectoire des pays hôtes.</p>'); });
window.addEventListener('resize', () => { if (model) renderImpact(); });
