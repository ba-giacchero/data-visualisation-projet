import { getHostByYear, bindWikiPreviews, wikiLinkHtml } from '../shared-links.js';

const OLYMPIC_FILE = '../../120 years of Olympic history/athlete_events.csv';
const state = { year: 2016, selected: ['Athletics', 'Gymnastics'], brush: null };
let model;
let currentRows = [];
let dimensions;
let scales;
let lineSelection;

const formatNumber = d3.format(',');
const formatValue = (dimension, value) => dimension === 'age' ? `${value.toFixed(1)} ans` : `${value.toFixed(1)} ${dimension === 'height' ? 'cm' : 'kg'}`;
const dimensionsLabels = { age: 'Âge', height: 'Taille (cm)', weight: 'Poids (kg)' };

function parseAthletes(rows) {
  const summerRows = rows.filter(row => row.Season === 'Summer' && +row.Year >= 1960 && +row.Year <= 2016);
  const years = [...new Set(summerRows.map(row => +row.Year))].sort(d3.ascending);
  const grouped = new Map();
  const sportCountries = new Map();

  summerRows.forEach(row => {
    const key = `${row.Year}|${row.Sport}`;
    if (!sportCountries.has(key)) sportCountries.set(key, new Map());
    const cMap = sportCountries.get(key);
    const noc = row.NOC;
    if (!cMap.has(noc)) cMap.set(noc, { noc, country: row.Team || noc, ids: new Set() });
    cMap.get(noc).ids.add(row.ID);

    if (row.Age !== 'NA' && row.Height !== 'NA' && row.Weight !== 'NA') {
      if (!grouped.has(key)) grouped.set(key, { year: +row.Year, sport: row.Sport, ages: [], heights: [], weights: [] });
      const group = grouped.get(key);
      group.ages.push(+row.Age); group.heights.push(+row.Height); group.weights.push(+row.Weight);
    }
  });

  const profiles = [...grouped.values()].map(group => {
    const key = `${group.year}|${group.sport}`;
    const cList = [...(sportCountries.get(key)?.values() || [])]
      .map(c => ({ noc: c.noc, country: c.country, count: c.ids.size }))
      .sort((a, b) => d3.descending(a.count, b.count));
    return {
      year: group.year,
      sport: group.sport,
      count: group.ages.length,
      age: d3.median(group.ages),
      height: d3.median(group.heights),
      weight: d3.median(group.weights),
      countriesCount: cList.length,
      topCountries: cList.slice(0, 3)
    };
  });
  return { years, profiles };
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const y = +params.get('year');
  if (y && model.years.includes(y)) state.year = y;
  const s = params.get('sport');
  const s2 = params.get('sportB');
  const available = yearRows().map(r => r.sport);
  if (s && available.includes(s)) {
    state.selected[0] = s;
    if (s2 && available.includes(s2) && s2 !== s) {
      state.selected[1] = s2;
    } else if (state.selected[1] === s) {
      state.selected[1] = available.find(item => item !== s) || state.selected[1];
    }
  }
}

function initialize(rows) {
  model = parseAthletes(rows);
  applyUrlParams();
  d3.select('#year').selectAll('option').data(model.years).join('option').attr('value', d => d).text(d => d);
  d3.select('#year').property('value', state.year).on('change', event => { state.year = +event.target.value; updateSportMenus(); render(); });
  d3.select('#reset').on('click', () => { state.year = 2016; state.selected = ['Athletics', 'Gymnastics']; state.brush = null; d3.select('#year').property('value', state.year); updateSportMenus(); render(); });
  updateSportMenus(); render();
}

function yearRows() { return model.profiles.filter(row => row.year === state.year).sort((a,b) => d3.descending(a.count,b.count)); }

function updateSportMenus() {
  const sports = yearRows().map(row => row.sport);
  ['#sport-a', '#sport-b'].forEach((selector, index) => {
    const select = d3.select(selector);
    select.selectAll('option').data(sports).join('option').attr('value', d => d).text(d => d);
    if (!sports.includes(state.selected[index])) state.selected[index] = sports[index] || '';
    select.property('value', state.selected[index]).on('change', event => { state.selected[index] = event.target.value; render(); });
  });
}

function renderNarrative() {
  const host = getHostByYear(state.year);
  const rowA = currentRows.find(r => r.sport === state.selected[0]) || yearRows().find(r => r.sport === state.selected[0]);
  const rowB = currentRows.find(r => r.sport === state.selected[1]) || yearRows().find(r => r.sport === state.selected[1]);

  const sportLink = row => {
    if (!row) return '';
    const topStr = row.topCountries.map(c => `${c.country} (${c.count})`).join(', ');
    return wikiLinkHtml({
      href: `../geographie/index.html?year=${state.year}&sport=${encodeURIComponent(row.sport)}`,
      text: row.sport,
      eyebrow: 'Spécialisation géographique',
      title: `${row.sport} · ${state.year}`,
      body: `Voir la répartition mondiale des délégations engagées en ${row.sport}.`,
      metrics: [
        ['Pays représentés', `${row.countriesCount} nations`],
        ['Principales délégations', topStr || 'N/D'],
        ['Profil médian', `${row.height.toFixed(0)} cm · ${row.weight.toFixed(0)} kg`]
      ]
    });
  };

  const topCountryLink = row => {
    const top = row?.topCountries?.[0];
    if (!top) return '';
    return wikiLinkHtml({
      href: `../economie/index.html?year=${state.year}&country=${encodeURIComponent(top.noc)}`,
      text: top.country,
      eyebrow: 'Le poids de la richesse',
      title: `${top.country} (${top.noc}) · ${state.year}`,
      body: `Première délégation en ${row.sport} (${top.count} athlètes). Explorer le PIB et l’efficacité olympique de ce pays.`,
      metrics: [
        ['Athlètes en ' + row.sport, `${top.count} athlètes`],
        ['Édition', `${state.year}`]
      ]
    });
  };

  let hostPart = `Lors de l’édition <strong>${state.year}</strong>`;
  if (host) {
    const domLink = wikiLinkHtml({
      href: `../domicile/index.html?year=${host.year}`,
      text: `${host.city} ${host.year}`,
      eyebrow: 'Trajectoire des pays hôtes',
      title: `${host.country} · ${host.city} ${host.year}`,
      body: `Analyser comment l’accueil des Jeux a transformé la délégation et les médailles du pays hôte (${host.country}) entre T−3 et T+3.`,
      metrics: [
        ['Pays hôte', `${host.country} (${host.noc})`],
        ['Ville hôte', host.city]
      ]
    });
    const ecoHostLink = wikiLinkHtml({
      href: `../economie/index.html?year=${host.year}&country=${host.noc}`,
      text: host.country,
      eyebrow: 'Le poids de la richesse',
      title: `${host.country} · Économie & Jeux ${host.year}`,
      body: `Comparer le PIB par habitant, la taille de délégation et l’efficacité de ${host.country} face au reste du monde.`,
      metrics: [
        ['Code CIO', host.noc],
        ['Édition accueillie', `${host.city} ${host.year}`]
      ]
    });
    hostPart = `Aux Jeux de ${domLink} organisés par ${ecoHostLink}`;
  }

  let comparePart = '';
  if (rowA && rowB) {
    const leadA = topCountryLink(rowA);
    comparePart = `, la discipline ${sportLink(rowA)} (${formatNumber(rowA.count)} athlètes mesurés, taille médiane ${rowA.height.toFixed(0)}&nbsp;cm${leadA ? `, dominée en effectif par ${leadA}` : ''}) se distingue de ${sportLink(rowB)} (${formatNumber(rowB.count)} athlètes, ${rowB.height.toFixed(0)}&nbsp;cm).`;
  }

  d3.select('#wiki-narrative').html(`${hostPart}${comparePart}`);
  bindWikiPreviews(document.querySelector('#wiki-narrative'));
}

function render() {
  currentRows = yearRows().slice(0, 36);
  renderNarrative();
  drawChart();
}

function drawChart() {
  const container = document.querySelector('#chart');
  const width = Math.max(container.clientWidth, 760);
  const height = 550;
  const margin = { top:34, right:52, bottom:35, left:52 };
  d3.select('#chart').selectAll('svg').remove();
  const svg = d3.select('#chart').append('svg').attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  const x = d3.scalePoint().domain(Object.keys(dimensionsLabels)).range([margin.left, width - margin.right]);
  scales = {
    age: d3.scaleLinear().domain([d3.min(currentRows, d => d.age) - 1, d3.max(currentRows, d => d.age) + 1]).nice().range([height - margin.bottom, margin.top]),
    height: d3.scaleLinear().domain([d3.min(currentRows, d => d.height) - 3, d3.max(currentRows, d => d.height) + 3]).nice().range([height - margin.bottom, margin.top]),
    weight: d3.scaleLinear().domain([d3.min(currentRows, d => d.weight) - 3, d3.max(currentRows, d => d.weight) + 3]).nice().range([height - margin.bottom, margin.top])
  };
  dimensions = Object.keys(dimensionsLabels);
  const path = row => d3.line()(dimensions.map(dimension => [x(dimension), scales[dimension](row[dimension])]));
  const plot = svg.append('g');
  plot.selectAll('.sport-line').data(currentRows, d => d.sport).join('path')
    .attr('class', row => lineClass(row))
    .attr('d', path)
    .on('mouseenter', (event, row) => showTooltip(event, row))
    .on('mousemove', moveTooltip)
    .on('mouseleave', () => d3.select('#tooltip').classed('visible', false))
    .on('click', (_, row) => {
      window.location.href = `../geographie/index.html?year=${state.year}&sport=${encodeURIComponent(row.sport)}`;
    });
  dimensions.forEach(dimension => {
    const axis = plot.append('g').attr('class', 'axis').attr('transform', `translate(${x(dimension)},0)`).call(d3.axisLeft(scales[dimension]).ticks(7));
    axis.append('text').attr('class', 'axis-title').attr('y', margin.top - 17).attr('text-anchor', 'middle').text(dimensionsLabels[dimension]);
    if (dimension === 'height') addBrush(axis, x(dimension));
  });
  updateSelectionLabel();
}

function lineClass(row) {
  const classes = ['sport-line'];
  if (state.selected.includes(row.sport)) classes.push('selected');
  if (state.brush && row.height >= state.brush[0] && row.height <= state.brush[1]) classes.push('brushed');
  return classes.join(' ');
}

function addBrush(axis, position) {
  const brush = d3.brushY().extent([[-12, 34], [12, 515]]).on('brush end', event => {
    if (!event.selection) { state.brush = null; } else { state.brush = event.selection.map(scales.height.invert).sort(d3.ascending); }
    lineSelection.attr('class', lineClass); updateSelectionLabel();
  });
  const brushGroup = axis.append('g').attr('class', 'brush').call(brush);
  if (state.brush) brushGroup.call(brush.move, state.brush.map(scales.height));
  lineSelection = axis.ownerSVGElement ? d3.select(axis.node().parentNode).selectAll('.sport-line') : d3.selectAll('.sport-line');
}

function updateSelectionLabel() {
  d3.select('#selection-label').text(state.brush ? `Taille sélectionnée : ${state.brush[0].toFixed(0)} à ${state.brush[1].toFixed(0)} cm · ${currentRows.filter(row => row.height >= state.brush[0] && row.height <= state.brush[1]).length} sports concernés` : 'Pincez l’axe Taille pour isoler une tranche d’athlètes.');
}

function showTooltip(event, row) {
  const topStr = row.topCountries?.slice(0, 2).map(c => `${c.country} (${c.count})`).join(', ') || '—';
  d3.select('#tooltip').html(`<strong>${row.sport}</strong><div class="tooltip-row"><span>Athlètes mesurés</span><b>${formatNumber(row.count)}</b></div><div class="tooltip-row"><span>Âge médian</span><b>${formatValue('age', row.age)}</b></div><div class="tooltip-row"><span>Taille médiane</span><b>${formatValue('height', row.height)}</b></div><div class="tooltip-row"><span>Poids médian</span><b>${formatValue('weight', row.weight)}</b></div><div class="tooltip-row"><span>Nations (${row.countriesCount})</span><b>${topStr}</b></div>`).classed('visible', true);
  moveTooltip(event);
}
function moveTooltip(event) { const node = document.querySelector('#tooltip'); const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14); const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14); d3.select('#tooltip').style('left', `${Math.max(8,left)}px`).style('top', `${Math.max(8,top)}px`); }

fetch(OLYMPIC_FILE).then(response => response.text()).then(text => initialize(d3.csvParse(text))).catch(error => { console.error(error); d3.select('#chart').text('Impossible de charger le dataset olympique.'); });
window.addEventListener('resize', () => { if (model) drawChart(); });
