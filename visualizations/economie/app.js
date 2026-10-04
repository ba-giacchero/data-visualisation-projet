const OLYMPIC_FILE = '../../120 years of Olympic history/athlete_events.csv';
const NOC_FILE = '../../120 years of Olympic history/noc_regions.csv';
const GDP_FILE = '../../Global GDP-PIB per Capita Dataset (1960-present)/pib_per_capita_countries_dataset.csv';
const POPULATION_FILE = '../../Demographic data/wdi_wide.csv';

const state = { year: 2016, metric: 'athletes', continents: new Set(), search: '' };
const continentNames = ['Afrique', 'Amériques', 'Asie', 'Europe', 'Océanie'];
const continentColors = { Afrique: '#d27b45', Amériques: '#287c78', Asie: '#be5c49', Europe: '#526c9f', Océanie: '#b58b2b', 'Inconnu': '#87918a' };
const continentMap = { Africa: 'Afrique', Americas: 'Amériques', Asia: 'Asie', Europe: 'Europe', Oceania: 'Océanie' };

const formatNumber = d3.format(',');
const formatMoney = value => value >= 1000 ? `$${d3.format(',.0f')(value)}` : `$${d3.format('.2f')(value)}`;
const clean = value => value && value !== 'NA' ? value : null;
const normalizeCountryName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const populationAliases = {
  'greatbritain': 'unitedkingdom',
  'russianempire': 'russianfederation',
  'russia': 'russianfederation',
  'southkorea': 'korearep',
  'northkorea': 'koreademocraticpeoplesrep',
  'iran': 'iranislamicrep',
  'venezuela': 'venezuelarb',
  'bolivia': 'boliviaplurinationalstateof',
  'tanzania': 'tanzania',
  'moldova': 'moldovarep'
};

function normalizeContinent(region) {
  if (!region) return 'Inconnu';
  const normalized = region.trim();
  const broadRegion = normalized.toLowerCase();
  if (continentMap[normalized]) return continentMap[normalized];
  if (broadRegion.includes('africa') || broadRegion.includes('afrique') || broadRegion.includes('áfrica')) return 'Afrique';
  if (broadRegion.includes('europe') || broadRegion.includes('europa')) return 'Europe';
  if (broadRegion.includes('asia') || broadRegion.includes('asie')) return 'Asie';
  if (broadRegion.includes('america') || broadRegion.includes('amérique') || broadRegion.includes('américa')) return 'Amériques';
  if (broadRegion.includes('oceania') || broadRegion.includes('pacific') || broadRegion.includes('océanie')) return 'Océanie';
  return 'Inconnu';
}

function uniqueMedalKey(row) {
  return `${row.NOC}|${row.Event}|${row.Medal}`;
}

function aggregate(athletes, nocs, gdpRows, populationRows) {
  const nocLookup = new Map(nocs.map(row => [row.NOC, { name: row.region || row.NOC, continent: normalizeContinent(row.region) }]));
  const rowsByCountryYear = new Map();
  const athleteKeys = new Set();
  const medalKeys = new Set();

  athletes.filter(row => row.Season === 'Summer' && +row.Year >= 1960 && +row.Year <= 2016).forEach(row => {
    const year = +row.Year;
    const key = `${year}|${row.NOC}`;
    if (!rowsByCountryYear.has(key)) rowsByCountryYear.set(key, { year, noc: row.NOC, athleteKeys: new Set(), medalKeys: new Set() });
    const group = rowsByCountryYear.get(key);
    const athleteKey = `${row.NOC}|${row.ID}`;
    group.athleteKeys.add(athleteKey);
    athleteKeys.add(`${year}|${athleteKey}`);
    const medal = clean(row.Medal);
    if (medal) {
      const medalKey = uniqueMedalKey(row);
      group.medalKeys.add(medalKey);
      medalKeys.add(`${year}|${medalKey}`);
    }
  });

  const gdpLookup = new Map();
  gdpRows.filter(row => row.indicator_code === 'NY.GDP.PCAP.CD').forEach(row => {
    const value = +String(row.gdp_per_capita).replace(',', '.');
    if (value > 0) gdpLookup.set(`${row.year}|${row.country_code}`, {
      value,
      continent: normalizeContinent(row.region)
    });
  });

  const populationLookup = new Map();
  populationRows.forEach(row => {
    const population = +String(row.Population).replace(/,/g, '');
    if (population > 0) populationLookup.set(normalizeCountryName(row['Country Name']), population);
  });

  return { rowsByCountryYear, nocLookup, gdpLookup, populationLookup };
}

let model;
let chart;
let xScale;
let zoomBehavior;

function initialize(data) {
  model = aggregate(data.athletes, data.nocs, data.gdpRows, data.populationRows);
  const years = [...new Set([...model.rowsByCountryYear.values()].map(row => row.year))].sort(d3.ascending);
  const yearSelect = d3.select('#year');
  yearSelect.selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
  yearSelect.property('value', state.year);
  yearSelect.on('change', event => { state.year = +event.target.value; render(); });

  d3.select('#continent-buttons').selectAll('button').data(continentNames).join('button')
    .attr('class', 'continent-button active').attr('type', 'button').text(d => d)
    .on('click', (event, continent) => {
      if (state.continents.has(continent)) state.continents.delete(continent); else state.continents.add(continent);
      d3.select(event.currentTarget).classed('active', !state.continents.has(continent));
      render();
    });
  d3.selectAll('.metric-button').on('click', (event) => {
    state.metric = event.currentTarget.dataset.metric;
    d3.selectAll('.metric-button').classed('active', false);
    d3.select(event.currentTarget).classed('active', true);
    render();
  });
  d3.select('#search').on('input', event => { state.search = event.target.value.trim().toLowerCase(); render(); });
  d3.select('#reset').on('click', () => {
    state.year = 2016; state.metric = 'athletes'; state.continents.clear(); state.search = '';
    d3.select('#year').property('value', state.year); d3.select('#search').property('value', '');
    d3.selectAll('.metric-button').classed('active', false).filter('[data-metric="athletes"]').classed('active', true);
    d3.selectAll('.continent-button').classed('active', true); render();
  });
  render();
}

function currentData() {
  const result = [];
  for (const group of model.rowsByCountryYear.values()) {
    if (group.year !== state.year) continue;
    const place = model.nocLookup.get(group.noc) || { name: group.noc, continent: 'Inconnu' };
    const gdp = model.gdpLookup.get(`${group.year}|${group.noc}`);
    if (!gdp) continue;
    const continent = gdp.continent === 'Inconnu' ? place.continent : gdp.continent;
    const countryKey = normalizeCountryName(place.name);
    const populationKey = populationAliases[countryKey] || countryKey;
    const population = model.populationLookup.get(populationKey);
    if (!population) continue;
    result.push({
      ...group, country: place.name, continent, gdp: gdp.value, population,
      athletes: group.athleteKeys.size, medals: group.medalKeys.size
    });
  }
  return result.filter(row => {
    const continentVisible = state.continents.size === 0 || !state.continents.has(row.continent);
    const searchVisible = !state.search || row.country.toLowerCase().includes(state.search) || row.noc.toLowerCase().includes(state.search);
    return continentVisible && searchVisible;
  });
}

function render() {
  const data = currentData();
  const allYearData = currentDataForStats();
  updateStats(allYearData);
  d3.select('#chart-title').text(state.metric === 'athletes' ? 'PIB par habitant et taille des délégations' : 'PIB par habitant et médailles comptées');
  drawChart(data);
}

function currentDataForStats() {
  const previousSearch = state.search; const previousContinents = state.continents;
  state.search = ''; state.continents = new Set();
  const data = currentData();
  state.search = previousSearch; state.continents = previousContinents;
  return data;
}

function updateStats(data) {
  d3.select('#country-count').text(formatNumber(data.length));
  d3.select('#athlete-total').text(formatNumber(d3.sum(data, d => d.athletes)));
  d3.select('#medal-total').text(formatNumber(d3.sum(data, d => d.medals)));
}

function drawChart(data) {
  const container = document.querySelector('#chart');
  const width = Math.max(container.clientWidth, 620);
  const height = window.innerWidth < 700 ? 430 : 550;
  const margin = { top: 14, right: 28, bottom: 65, left: 72 };
  d3.select('#chart').selectAll('svg').remove();
  const svg = d3.select('#chart').append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const maxGdp = d3.max(data, d => d.gdp) || 100000;
  xScale = d3.scaleLog().domain([Math.max(100, d3.min(data, d => d.gdp) || 100), maxGdp * 1.12]).range([0, innerWidth]);
  const yMax = d3.max(data, d => d[state.metric]) || 1;
  const yScale = d3.scaleLinear().domain([0, yMax * 1.12]).nice().range([innerHeight, 0]);
  const radius = d3.scaleSqrt().domain([0, d3.max(data, d => d.population) || 1]).range([4, 28]);

  plot.append('g').attr('class', 'grid').call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(''));
  plot.append('g').attr('class', 'axis x-axis').attr('transform', `translate(0,${innerHeight})`).call(d3.axisBottom(xScale).ticks(6, d => `$${d3.format('.2s')(d)}`));
  plot.append('g').attr('class', 'axis').call(d3.axisLeft(yScale).ticks(6));
  plot.append('text').attr('class', 'axis-label').attr('x', innerWidth / 2).attr('y', innerHeight + 52).attr('text-anchor', 'middle').text('PIB par habitant (USD, échelle logarithmique)');
  plot.append('text').attr('class', 'axis-label').attr('transform', 'rotate(-90)').attr('x', -innerHeight / 2).attr('y', -51).attr('text-anchor', 'middle').text(state.metric === 'athletes' ? 'Nombre d’athlètes uniques' : 'Nombre de médailles');

  const tooltip = d3.select('#tooltip');
  const dots = plot.append('g').selectAll('circle').data(data, d => d.noc).join('circle').attr('class', 'dot')
    .attr('data-continent', d => d.continent).attr('cx', d => xScale(d.gdp)).attr('cy', d => yScale(d[state.metric])).attr('r', d => radius(d.population)).attr('fill', d => continentColors[d.continent] || continentColors.Inconnu)
    .on('mouseenter', (event, d) => showTooltip(event, d)).on('mousemove', (event) => moveTooltip(event)).on('mouseleave', () => tooltip.classed('visible', false));

  if (!data.length) plot.append('text').attr('class', 'empty').attr('x', innerWidth / 2).attr('y', innerHeight / 2).attr('text-anchor', 'middle').text('Aucune donnée pour cette sélection');
  zoomBehavior = d3.zoom().scaleExtent([1, 7]).translateExtent([[0, 0], [width, height]]).on('zoom', event => {
    const transformedX = event.transform.rescaleX(xScale);
    plot.select('.x-axis').call(d3.axisBottom(transformedX).ticks(6, d => `$${d3.format('.2s')(d)}`));
    dots.attr('cx', d => transformedX(d.gdp));
  });
  svg.call(zoomBehavior);
}

function showTooltip(event, d) {
  const tooltip = d3.select('#tooltip');
  const ratio = d.athletes / d.population * 1000000;
  tooltip.html(`<strong>${d.country} <span>(${d.noc})</span></strong><div class="tooltip-row"><span>PIB / habitant</span><b>${formatMoney(d.gdp)}</b></div><div class="tooltip-row"><span>Population</span><b>${formatNumber(d.population)}</b></div><div class="tooltip-row"><span>Athlètes uniques</span><b>${formatNumber(d.athletes)}</b></div><div class="tooltip-row"><span>Médailles</span><b>${formatNumber(d.medals)}</b></div><div class="tooltip-row"><span>Athlètes / million d’habitants</span><b>${ratio.toFixed(2)}</b></div>`).classed('visible', true);
  moveTooltip(event);
}

function moveTooltip(event) {
  const node = document.querySelector('#tooltip');
  const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14);
  const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14);
  d3.select('#tooltip').style('left', `${Math.max(8, left)}px`).style('top', `${Math.max(8, top)}px`);
}

Promise.all([d3.csv(OLYMPIC_FILE), d3.csv(NOC_FILE), d3.csv(GDP_FILE), d3.csv(POPULATION_FILE)])
  .then(([athletes, nocs, gdpRows, populationRows]) => initialize({ athletes, nocs, gdpRows, populationRows }))
  .catch(error => {
    console.error(error);
    d3.select('#chart').html('<p class="empty">Impossible de charger les CSV. Lancez la page avec <code>python main.py</code> depuis le dossier du projet.</p>');
  });

window.addEventListener('resize', () => { if (model) drawChart(currentData()); });
