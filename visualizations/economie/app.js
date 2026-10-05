// Données préparées par prep/build_data.py (jointures NOC → ISO3, PIB, population, continents).
const DATA_FILE = 'data/economie.json';

const state = { year: 2016, metric: 'athletes', hiddenContinents: new Set(), search: '' };
const continentColors = { Afrique: '#d27b45', Amériques: '#287c78', Asie: '#be5c49', Europe: '#526c9f', Océanie: '#b58b2b' };
const metricLabels = {
  athletes: { title: 'PIB par habitant et taille des délégations', axis: 'Nombre d’athlètes uniques' },
  medals: { title: 'PIB par habitant et médailles comptées', axis: 'Nombre de médailles' }
};

const formatNumber = d3.format(',');
const formatMoney = value => value >= 1000 ? `$${d3.format(',.0f')(value)}` : `$${d3.format('.2f')(value)}`;
const formatGdpTick = d => `$${d3.format('.2s')(d)}`;
const normalizeText = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plural = (count, singular, pluralForm = `${singular}s`) => `${formatNumber(count)} ${count > 1 ? pluralForm : singular}`;

let editions;
let chart;

function initialize(payload) {
  editions = new Map(payload.editions.map(edition => [edition.year, edition]));
  const years = payload.meta.years;
  if (!editions.has(state.year)) state.year = years[years.length - 1];

  const yearSelect = d3.select('#year');
  yearSelect.selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
  yearSelect.property('value', state.year);
  yearSelect.on('change', event => {
    state.year = +event.target.value;
    render();
    resetZoom();
  });

  const continentButtons = d3.select('#continent-buttons').selectAll('button').data(payload.meta.continents).join('button')
    .attr('class', 'continent-button active').attr('type', 'button').attr('aria-pressed', 'true')
    .on('click', (event, continent) => {
      if (state.hiddenContinents.has(continent)) state.hiddenContinents.delete(continent); else state.hiddenContinents.add(continent);
      const visible = !state.hiddenContinents.has(continent);
      d3.select(event.currentTarget).classed('active', visible).attr('aria-pressed', visible);
      render();
    });
  continentButtons.append('i').attr('class', 'swatch').style('background', d => continentColors[d]);
  continentButtons.append('span').text(d => d);

  d3.selectAll('.metric-button').on('click', event => {
    state.metric = event.currentTarget.dataset.metric;
    d3.selectAll('.metric-button').classed('active', false);
    d3.select(event.currentTarget).classed('active', true);
    render();
  });
  d3.select('#search').on('input', event => { state.search = normalizeText(event.target.value); render(); });
  d3.select('#reset').on('click', () => {
    state.year = 2016; state.metric = 'athletes'; state.hiddenContinents.clear(); state.search = '';
    d3.select('#year').property('value', state.year); d3.select('#search').property('value', '');
    d3.selectAll('.metric-button').classed('active', false).filter('[data-metric="athletes"]').classed('active', true);
    d3.selectAll('.continent-button').classed('active', true).attr('aria-pressed', 'true');
    render();
    resetZoom();
  });

  buildChart();
  render();
}

function yearData() {
  return editions.get(state.year).countries;
}

function matchesSearch(d) {
  return normalizeText(d.country).includes(state.search) || d.noc.toLowerCase().includes(state.search);
}

function visibleData() {
  return yearData().filter(d => !state.hiddenContinents.has(d.continent));
}

function render() {
  const data = visibleData();
  const matches = state.search ? data.filter(matchesSearch) : null;
  updateStats(matches || data, Boolean(matches));
  updateExcluded(editions.get(state.year).excluded);
  d3.select('#chart-title').text(metricLabels[state.metric].title);
  updateChart(data, matches ? new Set(matches.map(d => d.noc)) : null);
}

function updateStats(data, searching) {
  d3.select('#country-count').text(formatNumber(data.length));
  d3.select('#athlete-total').text(formatNumber(d3.sum(data, d => d.athletes)));
  d3.select('#medal-total').text(formatNumber(d3.sum(data, d => d.medals)));
  d3.select('#country-label').text(searching ? 'pays en évidence' : 'pays affichés');
}

function updateExcluded(excluded) {
  const note = d3.select('#excluded-note');
  note.property('hidden', excluded.countries === 0);
  d3.select('#excluded-summary').text(
    `${plural(excluded.countries, 'pays exclu', 'pays exclus')} (${plural(excluded.athletes, 'athlète')}, ${plural(excluded.medals, 'médaille')}) : données économiques indisponibles`
  );
  const reasons = Object.values(excluded.reasons).filter(reason => reason.countries > 0);
  d3.select('#excluded-list').selectAll('li').data(reasons).join('li')
    .html(reason => `<b>${reason.label}</b> — ${reason.nocs.map(r => `${r.name} (${r.noc}, ${formatNumber(r.athletes)})`).join(', ')}`);
}

// --- Graphique ---------------------------------------------------------------
// Le squelette SVG est construit une fois (et à chaque redimensionnement) ; render() ne fait
// que mettre à jour les domaines et la jointure, ce qui permet de conserver le zoom.

function buildChart() {
  const container = document.querySelector('#chart');
  const width = Math.max(container.clientWidth, 620);
  const height = window.innerWidth < 700 ? 430 : 550;
  const margin = { top: 14, right: 28, bottom: 65, left: 72 };
  const box = { x0: margin.left, x1: width - margin.right, y0: margin.top, y1: height - margin.bottom };
  const previousTransform = chart ? d3.zoomTransform(chart.svg.node()) : d3.zoomIdentity;

  d3.select('#chart').selectAll('svg').remove();
  const svg = d3.select('#chart').append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  svg.append('defs').append('clipPath').attr('id', 'plot-clip')
    .append('rect').attr('x', box.x0).attr('y', box.y0).attr('width', box.x1 - box.x0).attr('height', box.y1 - box.y0);

  const gridX = svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${box.y1})`);
  const gridY = svg.append('g').attr('class', 'grid').attr('transform', `translate(${box.x0},0)`);
  const xAxis = svg.append('g').attr('class', 'axis x-axis').attr('transform', `translate(0,${box.y1})`);
  const yAxis = svg.append('g').attr('class', 'axis y-axis').attr('transform', `translate(${box.x0},0)`);
  svg.append('text').attr('class', 'axis-label').attr('x', (box.x0 + box.x1) / 2).attr('y', box.y1 + 52).attr('text-anchor', 'middle')
    .text('PIB par habitant (USD, échelle logarithmique)');
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('transform', 'rotate(-90)')
    .attr('x', -(box.y0 + box.y1) / 2).attr('y', box.x0 - 51).attr('text-anchor', 'middle');

  const plot = svg.append('g').attr('clip-path', 'url(#plot-clip)');
  plot.append('rect').attr('class', 'zoom-surface').attr('x', box.x0).attr('y', box.y0)
    .attr('width', box.x1 - box.x0).attr('height', box.y1 - box.y0);
  const dotsLayer = plot.append('g').attr('class', 'dots');
  const empty = svg.append('text').attr('class', 'empty').attr('x', (box.x0 + box.x1) / 2).attr('y', (box.y0 + box.y1) / 2)
    .attr('text-anchor', 'middle').text('Aucune donnée pour cette sélection');

  const zoom = d3.zoom()
    .scaleExtent([1, 20])
    .extent([[box.x0, box.y0], [box.x1, box.y1]])
    .translateExtent([[box.x0, box.y0], [box.x1, box.y1]])
    // La molette ne zoome qu'avec Ctrl/⌘ : sinon elle fait défiler la page.
    .filter(event => event.type === 'wheel' ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.button)
    // Le facteur ×10 par défaut avec Ctrl est prévu pour le pincement du pavé tactile (petits deltas) ;
    // on ne l'applique pas aux crans de molette, sinon Ctrl + molette zoome beaucoup trop vite.
    .wheelDelta(event => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002)
      * (event.ctrlKey && Math.abs(event.deltaY) < 50 ? 10 : 1))
    .on('zoom', event => positionElements(event.transform));

  chart = {
    svg, box, zoom, gridX, gridY, xAxis, yAxis, yLabel, dotsLayer, empty,
    x: d3.scaleLog().range([box.x0, box.x1]),
    y: d3.scaleLinear().range([box.y1, box.y0]),
    r: d3.scaleSqrt().range([4, 28])
  };
  svg.call(zoom);
  svg.call(zoom.transform, previousTransform);
}

function updateChart(data, matchedNocs) {
  const all = yearData();
  // Les domaines dépendent de l'édition et de la métrique, pas des filtres : les axes restent
  // stables quand on masque un continent et la transformation de zoom garde son sens.
  chart.x.domain([d3.min(all, d => d.gdp) / 1.25, d3.max(all, d => d.gdp) * 1.25]);
  chart.y.domain([0, (d3.max(all, d => d[state.metric]) || 1) * 1.08]).nice();
  chart.r.domain([0, d3.max(all, d => d.population) || 1]);
  chart.yLabel.text(metricLabels[state.metric].axis);

  const tooltip = d3.select('#tooltip');
  const transform = d3.zoomTransform(chart.svg.node());
  const zx = transform.rescaleX(chart.x);
  const zy = transform.rescaleY(chart.y);
  // Population décroissante : les petites bulles sont dessinées en dernier, donc au-dessus.
  const sorted = [...data].sort((a, b) => d3.descending(a.population, b.population));

  chart.dotsLayer.selectAll('circle').data(sorted, d => d.noc)
    .join(
      enter => enter.append('circle').attr('class', 'dot')
        .attr('cx', d => zx(d.gdp)).attr('cy', d => zy(d[state.metric])).attr('r', 0)
        .on('mouseenter', (event, d) => showTooltip(event, d))
        .on('mousemove', event => moveTooltip(event))
        .on('mouseleave', () => tooltip.classed('visible', false)),
      update => update,
      exit => exit.remove()
    )
    .order()
    .attr('data-continent', d => d.continent)
    .style('--dot-color', d => continentColors[d.continent])
    .classed('highlight', d => matchedNocs !== null && matchedNocs.has(d.noc))
    .classed('dimmed', d => matchedNocs !== null && !matchedNocs.has(d.noc))
    .transition().duration(450)
    .attr('cx', d => zx(d.gdp))
    .attr('cy', d => zy(d[state.metric]))
    .attr('r', d => chart.r(d.population));

  chart.empty.attr('display', data.length ? 'none' : null);
  drawAxes(zx, zy);
}

function positionElements(transform) {
  const zx = transform.rescaleX(chart.x);
  const zy = transform.rescaleY(chart.y);
  chart.dotsLayer.selectAll('circle').interrupt()
    .attr('cx', d => zx(d.gdp)).attr('cy', d => zy(d[state.metric])).attr('r', d => chart.r(d.population));
  drawAxes(zx, zy);
}

function drawAxes(zx, zy) {
  const { box } = chart;
  chart.xAxis.call(d3.axisBottom(zx).ticks(6, formatGdpTick));
  chart.yAxis.call(d3.axisLeft(zy).ticks(6));
  // Sur l'échelle log, ticks() renvoie aussi les subdivisions 2…9 : la grille ne garde que les graduations étiquetées.
  const labelled = zx.tickFormat(6, formatGdpTick);
  chart.gridX.call(d3.axisBottom(zx).tickValues(zx.ticks(6).filter(v => labelled(v) !== '')).tickSize(-(box.y1 - box.y0)).tickFormat(''));
  chart.gridY.call(d3.axisLeft(zy).ticks(6).tickSize(-(box.x1 - box.x0)).tickFormat(''));
}

function resetZoom() {
  const { k, x, y } = d3.zoomTransform(chart.svg.node());
  if (k === 1 && x === 0 && y === 0) return;
  chart.svg.transition().duration(450).call(chart.zoom.transform, d3.zoomIdentity);
}

function showTooltip(event, d) {
  const tooltip = d3.select('#tooltip');
  const ratio = d.athletes / d.population * 1000000;
  tooltip.html(`<strong>${d.country} <span>(${d.noc})</span></strong><div class="tooltip-row"><span>Continent</span><b>${d.continent}</b></div><div class="tooltip-row"><span>PIB / habitant</span><b>${formatMoney(d.gdp)}</b></div><div class="tooltip-row"><span>Population</span><b>${formatNumber(d.population)}</b></div><div class="tooltip-row"><span>Athlètes uniques</span><b>${formatNumber(d.athletes)}</b></div><div class="tooltip-row"><span>Médailles</span><b>${formatNumber(d.medals)}</b></div><div class="tooltip-row"><span>Athlètes / million d’habitants</span><b>${ratio.toFixed(2)}</b></div>`).classed('visible', true);
  moveTooltip(event);
}

function moveTooltip(event) {
  const node = document.querySelector('#tooltip');
  const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14);
  const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14);
  d3.select('#tooltip').style('left', `${Math.max(8, left)}px`).style('top', `${Math.max(8, top)}px`);
}

d3.json(DATA_FILE)
  .then(initialize)
  .catch(error => {
    console.error(error);
    d3.select('#chart').html('<p class="empty">Impossible de charger <code>data/economie.json</code>. Lancez la page avec <code>python main.py</code> depuis le dossier du projet.</p>');
  });

let resizeTimer;
window.addEventListener('resize', () => {
  if (!chart) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { buildChart(); render(); }, 150);
});
