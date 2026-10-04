const OLYMPIC_FILE = '../../120 years of Olympic history/athlete_events.csv';
const state = { year:2016, sort:'parity', largeOnly:false };
let model;
const formatNumber = d3.format(',');
const formatPercent = d3.format('.1f');

function aggregate(rows) {
  const groups = new Map();
  rows.filter(row => row.Season === 'Summer' && +row.Year >= 1960 && +row.Year <= 2016 && (row.Sex === 'M' || row.Sex === 'F')).forEach(row => {
    const key = `${row.Year}|${row.NOC}`;
    if (!groups.has(key)) groups.set(key, { year:+row.Year, noc:row.NOC, country:row.Team || row.NOC, men:new Set(), women:new Set() });
    const group = groups.get(key);
    const athleteKey = `${row.NOC}|${row.ID}`;
    if (row.Sex === 'M') group.men.add(athleteKey); else group.women.add(athleteKey);
  });
  return [...groups.values()].map(group => {
    const men = group.men.size; const women = group.women.size; const total = men + women;
    return { ...group, men, women, total, menShare:men / total * 100, womenShare:women / total * 100, parity:Math.abs(men - women) / total * 100 };
  });
}

function initialize(rows) {
  model = aggregate(rows);
  const years = [...new Set(model.map(row => row.year))].sort(d3.ascending);
  d3.select('#year').selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
  d3.select('#year').property('value', state.year).on('change', event => { state.year = +event.target.value; render(); });
  d3.selectAll('.sort-button').on('click', event => { state.sort = event.currentTarget.dataset.sort; d3.selectAll('.sort-button').classed('active', false); d3.select(event.currentTarget).classed('active', true); render(); });
  d3.select('#large-delegations').on('change', event => { state.largeOnly = event.target.checked; render(); });
  d3.select('#reset').on('click', () => { state.year = 2016; state.sort = 'parity'; state.largeOnly = false; d3.select('#year').property('value', state.year); d3.select('#large-delegations').property('checked', false); d3.selectAll('.sort-button').classed('active', false).filter('[data-sort="parity"]').classed('active', true); render(); });
  render();
}

function currentData() {
  const rows = model.filter(row => row.year === state.year && (!state.largeOnly || row.total > 50));
  return rows.sort((a,b) => state.sort === 'alpha' ? d3.ascending(a.country, b.country) : state.sort === 'size' ? d3.descending(a.total, b.total) : d3.ascending(a.parity, b.parity));
}

function render() {
  const data = currentData();
  d3.select('#summary').text(`${formatNumber(data.length)} pays affichés · ${formatNumber(d3.sum(data, row => row.total))} athlètes`);
  drawChart(data);
}

function drawChart(data) {
  const container = document.querySelector('#chart');
  const width = Math.max(container.clientWidth, 820);
  const rowHeight = 25;
  const margin = { top:38, right:30, bottom:48, left:150 };
  const height = Math.max(230, margin.top + margin.bottom + data.length * rowHeight);
  d3.select('#chart').selectAll('svg').remove();
  const svg = d3.select('#chart').append('svg').attr('class','chart-svg').attr('width',width).attr('height',height).attr('viewBox',`0 0 ${width} ${height}`);
  if (!data.length) { svg.append('text').attr('class','empty').attr('x',30).attr('y',70).text('Aucune délégation ne correspond à ce filtre.'); return; }
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([-100,100]).range([0,innerWidth]);
  const y = d3.scaleBand().domain(data.map(row => row.noc)).range([0,innerHeight]).padding(.22);
  const plot = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
  plot.append('g').attr('class','grid').call(d3.axisBottom(x).tickValues([-100,-75,-50,-25,0,25,50,75,100]).tickSize(innerHeight).tickFormat(''));
  plot.append('g').attr('class','axis').attr('transform',`translate(0,${innerHeight})`).call(d3.axisBottom(x).tickValues([-100,-75,-50,-25,0,25,50,75,100]).tickFormat(d => `${Math.abs(d)}%`));
  plot.append('line').attr('class','zero-line').attr('y2',innerHeight).attr('x1',x(0)).attr('x2',x(0));
  plot.append('text').attr('class','axis-title').attr('x',x(-50)).attr('y',-17).attr('text-anchor','middle').text('Hommes');
  plot.append('text').attr('class','axis-title').attr('x',x(50)).attr('y',-17).attr('text-anchor','middle').text('Femmes');
  plot.selectAll('.country-label').data(data).join('text').attr('class','country-label').attr('x',-12).attr('y',row => y(row.noc) + y.bandwidth()/2).attr('dy','.35em').attr('text-anchor','end').text(row => row.country);
  const tooltip = d3.select('#tooltip');
  plot.append('g').selectAll('.men-bar').data(data).join('rect').attr('class','bar men-bar').attr('x',row => x(-row.menShare)).attr('y',row => y(row.noc)).attr('width',row => x(0) - x(-row.menShare)).attr('height',y.bandwidth()).on('mouseenter',(event,row) => showTooltip(event,row)).on('mousemove',moveTooltip).on('mouseleave',() => tooltip.classed('visible',false));
  plot.append('g').selectAll('.women-bar').data(data).join('rect').attr('class','bar women-bar').attr('x',x(0)).attr('y',row => y(row.noc)).attr('width',row => x(row.womenShare) - x(0)).attr('height',y.bandwidth()).on('mouseenter',(event,row) => showTooltip(event,row)).on('mousemove',moveTooltip).on('mouseleave',() => tooltip.classed('visible',false));
}

function showTooltip(event,row) { d3.select('#tooltip').html(`<strong>${row.country} <span>(${row.noc})</span></strong><div class="tooltip-row"><span>Délégation</span><b>${formatNumber(row.total)} athlètes</b></div><div class="tooltip-row"><span>Hommes</span><b>${formatNumber(row.men)} · ${formatPercent(row.menShare)}%</b></div><div class="tooltip-row"><span>Femmes</span><b>${formatNumber(row.women)} · ${formatPercent(row.womenShare)}%</b></div><div class="tooltip-row"><span>Écart à la parité</span><b>${formatPercent(row.parity)} pts</b></div>`).classed('visible',true); moveTooltip(event); }
function moveTooltip(event) { const node = document.querySelector('#tooltip'); const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14); const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14); d3.select('#tooltip').style('left',`${Math.max(8,left)}px`).style('top',`${Math.max(8,top)}px`); }

fetch(OLYMPIC_FILE).then(response => response.text()).then(text => initialize(d3.csvParse(text))).catch(error => { console.error(error); d3.select('#chart').html('<p class="empty">Impossible de charger le dataset olympique.</p>'); });
window.addEventListener('resize',() => { if (model) drawChart(currentData()); });
