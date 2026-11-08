import { HOST_EDITIONS, WINTER_HOST_EDITIONS, bindWikiPreviews, wikiLinkHtml, getOlympicRows, getEconomicRows, registerVizController, sportFr, formatNumber, formatDecimal, formatMoney, formatPercent } from '../shared-links.js';

const state = { season: 'Summer', index: 13, rankMetric: 'medalsEffect' };

const domSel = (scoped, fallback) => document.querySelector(scoped) ? d3.select(scoped) : d3.select(fallback);
const domNode = (scoped, fallback) => document.querySelector(scoped) || document.querySelector(fallback);

let model;
// Couleur = effet affiché sur l'axe vertical (délégation ou médailles), en classes : rouge pour une baisse, sarcelle de plus en plus foncée pour une hausse
const MEDAL_CLASSES = [
  { label: 'baisse', color: '#b9413e' },
  { label: '0 à +50 %', color: '#c4dcd5' },
  { label: '+50 à +100 %', color: '#8fbfb3' },
  { label: '+100 à +200 %', color: '#4a948a' },
  { label: 'plus de +200 %', color: '#174d4b' }
];
const POINT_RADIUS = 10; // rayon unique des bulles du graphique d'impact
const IMPACT_TRANSITION = 700; // ms, glissement des bulles quand on change d'effet mesuré
const lastImpact = { metric: null, season: null }; // dernier état dessiné, pour savoir quand animer
const medalColor =d3.scaleThreshold().domain([0, 50, 100, 200]).range(MEDAL_CLASSES.map(c => c.color));

function aggregate(rows, economicRows) {
  const groups = new Map();
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
  });

  // PIB par habitant et population (Maddison 2023), par année et code CIO : même source que la vue 2
  const gdp = new Map();
  const population = new Map();
  economicRows.forEach(row => {
    const key = `${row.annee}|${row.pays}`;
    if (+row.gdppc > 0) gdp.set(key, +row.gdppc);
    if (+row.pop > 0) population.set(key, +row.pop);
  });

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
    population
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
      gdp: model.gdp.get(`${host.year}|${host.noc}`) ?? null,
      population: model.population.get(`${host.year}|${host.noc}`) ?? null,
      delegationBase,
      medalsBase,
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

function applyParams(params = {}) {
  const seasonParam = params.season || params.saison;
  if (seasonParam === 'Winter' || seasonParam === 'hiver') state.season = 'Winter';
  else if (seasonParam === 'Summer' || seasonParam === 'ete') state.season = 'Summer';
  d3.selectAll('input[name=dom-season]').property('checked', function () { return this.value === state.season; });
  model.hosts = enrichHostsForSeason(state.season);

  const y = +params.year;
  const noc = params.noc || params.country;
  if (y) {
    const idx = model.hosts.findIndex(h => h.year === y);
    if (idx !== -1) { state.index = idx; }
  } else if (noc) {
    const idx = model.hosts.findIndex(h => h.noc === noc.toUpperCase());
    if (idx !== -1) { state.index = idx; }
  }
  render();
}

function initialize(rows, economicRows) {
  model = aggregate(rows, economicRows);
  model.hosts = enrichHostsForSeason(state.season);
  setupControls();
  const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  applyParams(urlParams);
  registerVizController('domicile', applyParams);
}

function selectedHost() { return model.hosts[state.index] || model.hosts[0]; }

function setupControls() {
  // Boutons à deux positions (Été / Hiver, Délégation / Médailles) à la place des listes déroulantes
  d3.selectAll('input[name=dom-season]').property('checked', function () { return this.value === state.season; }).on('change', event => {
    state.season = event.target.value;
    updateSeasonHosts();
    render();
  });
  d3.selectAll('input[name=dom-rank-metric]').property('checked', function () { return this.value === state.rankMetric; }).on('change', event => {
    state.rankMetric = event.target.value;
    const available = availableHosts();
    if (!available.some(host => host.year === selectedHost().year)) state.index = model.hosts.indexOf(available[0]);
    render();
  });
}

function availableHosts() {
  return model.hosts.filter(host => host.gdp !== null && host[state.rankMetric] !== null);
}

function render() {
  const host = selectedHost();
  bindWikiPreviews(document.querySelector('#sec-domicile') || document);
  renderTimeline();
  renderImpact();
  renderEventDetail(host);
}

function renderTimeline() {
  domSel('#dom-timeline', '#timeline')
    .selectAll('button')
    .data(availableHosts(), host => `${host.year}-${host.city}`)
    .join('button')
    .attr('class', host => `timeline-item ${host.year === selectedHost().year ? 'active' : ''}`)
    .attr('aria-pressed', host => host.year === selectedHost().year)
    .attr('title', host => `${host.city} ${host.year} (${host.country})`)
    .on('click', (_, host) => { state.index = model.hosts.indexOf(host); render(); })
    .html(host => {
      const v = host[state.rankMetric];
      const dot = v === null ? '#aeb8b1' : medalColor(v);
      return `<span class="timeline-dot" style="background:${dot}"></span><span class="timeline-year">${host.year}</span><span class="timeline-city">${host.city}</span>`;
    });
}

function renderImpact() {
  const container = domNode('#dom-impact', '#impact');
  if (!container) return;
  const width = Math.max(container.clientWidth, 420);
  const height = 430;
  const margin = { top: 18, right: 24, bottom: 52, left: 62 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const validRows = availableHosts();
  // Axe horizontal : année de l'édition (ordre chronologique) ; le PIB reste dans l'infobulle
  const [minYear, maxYear] = d3.extent(validRows, host => host.year);
  const x = d3.scaleLinear().domain([(minYear ?? 1960) - 3, (maxYear ?? 2016) + 3]).range([0, innerWidth]);
  // Axe vertical ajusté aux valeurs (0 toujours visible) : une baisse ne peut pas dépasser −100 %
  // Valeur isolée (ex. Mexique 1968 : +800 % alors que la suivante est à +340 %) : l'axe s'arrête au-dessus
  // de la deuxième valeur, et l'édition extrême est posée sur le bord haut avec sa vraie valeur écrite
  // Axe commun aux deux filtres (délégation et médailles) : l'échelle ne change pas quand on passe de l'un à l'autre
  const effects = model.hosts.filter(host => host.gdp !== null)
    .flatMap(host => [host.delegationEffect, host.medalsEffect])
    .filter(v => v !== null).sort(d3.descending);
  const cap = effects.length > 2 && effects[0] > 1.8 * effects[1] && effects[1] > 0 ? effects[1] * 1.3 : null;
  const [minEffect, maxEffect] = d3.extent([0, ...effects.map(v => (cap !== null ? Math.min(v, cap) : v))]);
  const pad = (maxEffect - minEffect) * .1 || 10;
  const y = d3.scaleLinear().domain([minEffect < 0 ? minEffect - pad : -pad / 2, maxEffect + pad]).nice().range([innerHeight, 0]);
  const isOutlier = host => cap !== null && host[state.rankMetric] > cap;
  const cy = host => (isOutlier(host) ? POINT_RADIUS + 2 : y(host[state.rankMetric]));
  const color = medalColor;
  renderColorLegend();
  const impactSel = d3.select(container);
  // Changement d'effet mesuré (même saison) : on mémorise la position et la couleur de chaque bulle avant de redessiner
  const animate = lastImpact.metric !== null && lastImpact.metric !== state.rankMetric && lastImpact.season === state.season;
  const previous = new Map();
  impactSel.selectAll('.impact-point').each(function (host) {
    previous.set(host.year, { cy: +this.getAttribute('cy'), fill: this.getAttribute('fill') });
  });
  lastImpact.metric = state.rankMetric;
  lastImpact.season = state.season;
  impactSel.selectAll('svg').remove();
  const svg = impactSel.append('svg').attr('class', 'impact-svg').attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  plot.append('g').attr('class', 'impact-grid').call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(''));
  plot.append('g').attr('class', 'impact-axis').attr('transform', `translate(0,${innerHeight})`).call(d3.axisBottom(x).tickValues(validRows.map(host => host.year).filter((_, i, all) => innerWidth / all.length >= 34 || i % 2 === 0)).tickFormat(d3.format('d')));
  plot.append('g').attr('class', 'impact-axis').call(d3.axisLeft(y).ticks(6).tickFormat(value => `${value > 0 ? '+' : ''}${formatNumber(value)}\u202f%`));
  plot.append('line').attr('class', 'impact-zero').attr('x2', innerWidth).attr('y1', y(0)).attr('y2', y(0));
  plot.append('text').attr('class', 'impact-label').attr('x', innerWidth / 2).attr('y', innerHeight + 42).attr('text-anchor', 'middle').text('Édition des Jeux (pays hôte)');
  plot.append('text').attr('class', 'impact-label').attr('transform', 'rotate(-90)').attr('x', -innerHeight / 2).attr('y', -46).attr('text-anchor', 'middle').text(state.rankMetric === 'delegationEffect' ? 'Progression de la délégation' : 'Progression des médailles');
  const tooltip = d3.select('#tooltip');
  // Bulles de taille identique (les délégations hôtes vont de 400 à 700 athlètes : la taille ne se distinguait pas) ;
  // la bulle choisie passe au premier plan
  const fill = host => host[state.rankMetric] === null ? '#aeb8b1' : color(host[state.rankMetric]);
  const points = plot.selectAll('.impact-point').data(validRows, host => host.year).join('circle').attr('class', host => `impact-point ${host.year === selectedHost().year ? 'active' : ''}`).attr('cx', host => x(host.year)).attr('cy', cy).attr('r', POINT_RADIUS).attr('fill', fill).on('click', (_, host) => { state.index = model.hosts.indexOf(host); render(); }).on('mouseenter', (event, host) => showTooltip(event, host)).on('mousemove', moveTooltip).on('mouseleave', () => tooltip.classed('visible', false));
  plot.select('.impact-point.active').raise();
  // Effet visuel : les bulles glissent de leur ancienne position vers la nouvelle et changent de couleur en douceur
  if (animate) {
    points.filter(host => previous.has(host.year))
      .attr('cy', host => previous.get(host.year).cy)
      .attr('fill', host => previous.get(host.year).fill)
      .transition().duration(IMPACT_TRANSITION).ease(d3.easeCubicInOut)
      .attr('cy', cy).attr('fill', fill);
  }
  // Coupure de l'axe signalée par deux petits traits obliques en haut de l'axe vertical
  const breakMark = validRows.some(isOutlier)
    ? plot.append('path').attr('class', 'impact-break').attr('d', 'M-6,4 L6,-2 M-6,9 L6,3')
    : null;
  const labelText = host => (isOutlier(host) ? `${host.noc} ↑ +${formatNumber(host[state.rankMetric])}\u202f%` : host.noc);
  const labels = drawImpactLabels(plot, validRows, host => x(host.year), cy, () => POINT_RADIUS, innerWidth, innerHeight, labelText);
  // Pendant le glissement, étiquettes et coupure d'axe sont masquées, puis réapparaissent à leur nouvelle place
  if (animate) {
    [labels, breakMark].filter(Boolean).forEach(sel => sel.style('opacity', 0)
      .transition().delay(IMPACT_TRANSITION - 150).duration(250).style('opacity', 1));
  }
}

// Légende des couleurs : une pastille par classe d'effet sur les médailles
function renderColorLegend() {
  const legend = d3.select('#sec-domicile .color-legend').html('');
  // La couleur suit le filtre choisi (délégation ou médailles), comme l'axe vertical
  const metric = state.rankMetric === 'delegationEffect' ? 'athlètes' : 'médailles';
  legend.append('span').attr('class', 'legend-title').text(`Couleur : progression des ${metric} vs 3 éditions précédentes`);
  const items = legend.append('span').attr('class', 'color-swatches');
  MEDAL_CLASSES.forEach(c => {
    const item = items.append('span').attr('class', 'swatch-item');
    item.append('i').style('background', c.color);
    item.append('span').text(c.label);
  });
}

// Étiquettes « GBR 2012 » : placées à droite, à gauche, au-dessus ou au-dessous de la bulle,
// seulement si elles ne chevauchent ni une bulle ni une autre étiquette. L'édition choisie passe en premier.
function drawImpactLabels(plot, rows, cx, cy, r, innerWidth, innerHeight, labelText = host => host.noc) {
  const boxes = rows.map(host => ({ x0: cx(host) - r(host), x1: cx(host) + r(host), y0: cy(host) - r(host), y1: cy(host) + r(host), self: host }));
  const free = (b, host) => b.x0 >= 0 && b.x1 <= innerWidth && b.y0 >= 0 && b.y1 <= innerHeight &&
    boxes.every(o => o.self === host || b.x1 < o.x0 || b.x0 > o.x1 || b.y1 < o.y0 || b.y0 > o.y1);
  const active = selectedHost().year;
  const order = [...rows].sort((a, b) => (b.year === active) - (a.year === active));
  const labels = [];
  order.forEach(host => {
    const text = labelText(host); // l'année se lit sur l'axe horizontal
    const w = text.length * 6.2, h = 11, px = cx(host), py = cy(host), pr = r(host);
    const candidates = [
      { x: px + pr + 4, y: py + 4, anchor: 'start', b: { x0: px + pr + 2, x1: px + pr + 6 + w, y0: py - h / 2 - 1, y1: py + h / 2 } },
      { x: px - pr - 4, y: py + 4, anchor: 'end', b: { x0: px - pr - 6 - w, x1: px - pr - 2, y0: py - h / 2 - 1, y1: py + h / 2 } },
      { x: px, y: py - pr - 4, anchor: 'middle', b: { x0: px - w / 2, x1: px + w / 2, y0: py - pr - 4 - h, y1: py - pr - 2 } },
      { x: px, y: py + pr + 12, anchor: 'middle', b: { x0: px - w / 2, x1: px + w / 2, y0: py + pr + 2, y1: py + pr + 4 + h } }
    ];
    const spot = candidates.find(c => free(c.b, host)) || (host.year === active ? candidates[0] : null);
    if (!spot) return;
    boxes.push({ ...spot.b, self: null });
    labels.push({ ...spot, text, active: host.year === active });
  });
  return plot.append('g').attr('class', 'impact-labels').selectAll('text').data(labels).join('text')
    .attr('class', d => `impact-point-label ${d.active ? 'active' : ''}`)
    .attr('x', d => d.x).attr('y', d => d.y).attr('text-anchor', d => d.anchor).text(d => d.text);
}

function eventRows(host) {
  return d3.range(-3, 4).map(offset => {
    const year = getEditionByOffset(host.season, host.year, offset);
    const data = model.groups.find(row => row.season === host.season && row.year === year && row.noc === host.noc);
    return { offset, year, delegation:data?.delegation ?? null, medals:data?.medals ?? null, gdp:model.gdp.get(`${year}|${host.noc}`) ?? null };
  });
}

function renderEventDetail(host) {
  const rows = eventRows(host);
  const ecoSaison = state.season === 'Winter' ? 'hiver' : 'ete';
  const container = domNode('#dom-event-chart', '#event-chart');
  if (!container) return;
  const width = Math.max(container.clientWidth, 420);
  const height = 470;
  const margin = { top: 34, right: 20, bottom: 28, left: 60 };
  const gap = 38;
  const panelHeight = (height - margin.top - margin.bottom - gap * 2) / 3;
  const innerWidth = width - margin.left - margin.right;
  const x = d3.scalePoint().domain(rows.map(row => row.offset)).range([0, innerWidth]).padding(.4);
  const panels = [
    {
      key:'delegation',
      title:'Taille de la délégation',
      color:'delegation',
      y:margin.top,
      tick:value => value,
    },
    {
      key:'medals',
      title:'Médailles obtenues',
      color:'medals',
      y:margin.top + panelHeight + gap,
      tick:value => value,
    },
    {
      key:'gdp',
      title:'PIB par habitant (dollars PPA 2011)',
      color:'gdp',
      y:margin.top + (panelHeight + gap) * 2,
      tick:value => formatMoney(value),
    }
  ];
  domSel('#dom-event-detail', '#event-detail').attr('hidden', null);

  const countryLink = wikiLinkHtml({
    href: `../economie/index.html?saison=${ecoSaison}&year=${host.year}&country=${host.noc}`,
    text: host.country,
    eyebrow: 'Le poids de la richesse',
    title: `${host.country} (${host.noc})`,
    body: `Voir le groupe de richesse de ${host.country} en ${host.year} et le comparer aux autres pays.`,
    metrics: [['PIB / habitant', host.gdp ? formatMoney(host.gdp) : 'N/D'], ['Médailles (' + host.year + ')', `${formatNumber(host.medals || 0)}`]]
  });
  domSel('#dom-event-detail-title', '#event-detail-title').html(`${countryLink} (${host.city} ${host.year})`);

  const delLink = wikiLinkHtml({
    href: `../geographie/index.html?season=${state.season}&year=${host.year}&noc=${host.noc}`,
    text: `${formatNumber(host.delegation || 0)} athlètes`,
    eyebrow: 'La carte des groupes sportifs',
    title: `Composition sportive de ${host.country} (${host.year})`,
    body: `Voir la répartition par discipline de la délégation hôte sur la carte mondiale.`,
    metrics: [['Délégation totale', `${formatNumber(host.delegation || 0)} athlètes`], ['Effet délégation', host.delegationEffect !== null ? `${formatPercent(host.delegationEffect, true)}` : 'N/D']]
  });

  const sportsLinks = (host.topSports || []).map(item => `${sportFr(item.sport)} (${item.medals} méd., ${item.count} athl.)`).join(', ');

  domSel('#dom-event-narrative', '#event-narrative').html(
    `En ${host.year}, à domicile : ${delLink} engagés` +
    (sportsLinks ? ` ; disciplines les plus médaillées : ${sportsLinks}` : '') + `.`
  );

  const chartSel = d3.select(container);
  chartSel.selectAll('svg').remove();
  const svg = chartSel.append('svg').attr('class','event-svg').attr('width',width).attr('height',height).attr('viewBox',`0 0 ${width} ${height}`);
  svg.append('line').attr('class','host-line').attr('x1',margin.left + x(0)).attr('x2',margin.left + x(0)).attr('y1',margin.top - 10).attr('y2',height - margin.bottom);
  const tickLabel = offset => offset === 0 ? 'T' : offset > 0 ? `T+${offset}` : `T-${-offset}`;
  panels.forEach((panel, index) => {
    const values = rows.map(row => row[panel.key]).filter(value => value !== null);
    const max = Math.max(1, d3.max(values) || 1);
    const y = d3.scaleLinear().domain([0, max * 1.18]).nice().range([panel.y + panelHeight, panel.y]);
    const plot = svg.append('g');
    plot.append('g').attr('class','event-grid').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-innerWidth).tickFormat(''));
    plot.append('g').attr('class','event-axis').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(panel.tick));
    plot.append('text')
      .attr('class','event-panel-title')
      .attr('x',margin.left)
      .attr('y',panel.y - 12)
      .text(panel.title);
    // Axe des éditions partagé : libellés T−3…T+3 seulement sous le dernier panneau
    const last = index === panels.length - 1;
    plot.append('g').attr('class', `event-axis ${last ? '' : 'event-axis-silent'}`).attr('transform',`translate(${margin.left},${panel.y + panelHeight})`)
      .call(d3.axisBottom(x).tickSize(last ? 6 : 0).tickFormat(last ? tickLabel : ''));
    const line = d3.line().defined(row => row[panel.key] !== null).x(row => margin.left + x(row.offset)).y(row => y(row[panel.key]));
    plot.append('path').datum(rows).attr('class',`event-line-${panel.color}`).attr('d',line);
    // Éditions sans donnée (pas encore disputées dans la base, ou absence) : « n.d. » au lieu d'un faux zéro
    plot.selectAll('.event-missing').data(rows.filter(row => row[panel.key] === null)).join('text')
      .attr('class','event-missing')
      .attr('x', row => margin.left + x(row.offset)).attr('y', panel.y + panelHeight - 5).attr('text-anchor','middle')
      .text('n.d.');
    plot.selectAll('.event-point').data(rows.filter(row => row[panel.key] !== null)).join('circle')
      .attr('class',`event-point ${panel.color}`)
      .attr('cx',row => margin.left + x(row.offset))
      .attr('cy',row => y(row[panel.key]))
      .attr('r',4);
  });

  const breakdown = domSel('#dom-host-sports-breakdown', '#host-sports-breakdown').attr('hidden', null).html('');
  if (host.sportDrivers && host.sportDrivers.length) {
    breakdown.append('div').attr('class', 'host-sports-header').html(
      `<h3>Disciplines qui progressent le plus à ${host.city} ${host.year}</h3>` +
      `<span>Médailles l’année d’accueil (T) comparées à la moyenne des trois éditions précédentes</span>`
    );
    const grid = breakdown.append('div').attr('class', 'host-sports-grid');
    const maxMed = Math.max(1, d3.max(host.sportDrivers, d => Math.max(d.medT, d.medPrev)) || 1);

    host.sportDrivers.forEach(d => {
      const sLink = sportFr(d.sport);
      const deltaStr = `${d.medDelta > 0 ? '+' : ''}${formatDecimal(d.medDelta)} méd.`;
      const wT = Math.round((d.medT / maxMed) * 100);
      const wPrev = Math.round((d.medPrev / maxMed) * 100);

      grid.append('div').attr('class', 'host-sport-item').html(
        `<div class="host-sport-top"><strong>${sLink}</strong><span class="host-sport-delta ${d.medDelta > 0 ? 'pos' : 'neutral'}">${deltaStr}</span></div>` +
        `<div class="host-sport-bars">` +
          `<div class="host-bar-row"><span>Accueil (T)</span><div class="host-bar-track"><div class="host-bar-fill at-t" style="width:${wT}%"></div></div><b>${d.medT} méd.</b></div>` +
          `<div class="host-bar-row"><span>Moy. T-3 à T-1</span><div class="host-bar-track"><div class="host-bar-fill before-t" style="width:${wPrev}%"></div></div><span>${formatDecimal(d.medPrev)} méd.</span></div>` +
        `</div>`
      );
    });
  }

  bindWikiPreviews(domNode('#dom-event-detail', '#event-detail'));
  bindWikiPreviews(domNode('#dom-host-sports-breakdown', '#host-sports-breakdown'));
}

function showTooltip(event, host) {
  const effect = key => host[key] === null ? 'N/D' : `${formatPercent(host[key], true)}`;
  d3.select('#tooltip').html(
    `<strong>${host.country} (${host.year})</strong>` +
    `<div class="tooltip-row"><span>Ville hôte</span><b>${host.city}</b></div>` +
    `<div class="tooltip-row"><span>Effet sur la délégation</span><b>${effect('delegationEffect')}</b></div>` +
    `<div class="tooltip-row"><span>Effet sur les médailles</span><b>${effect('medalsEffect')}</b></div>` +
    `<div class="tooltip-row"><span>PIB / habitant</span><b>${host.gdp ? formatMoney(host.gdp) : 'N/D'}</b></div>` +
    `<div class="tooltip-row"><span>Population</span><b>${host.population ? formatNumber(host.population) : 'N/D'}</b></div>` +
    `<div class="tooltip-row"><span>Athlètes à T (moy. avant)</span><b>${host.delegation ? formatNumber(host.delegation) : 'N/D'}${host.delegationBase ? ` (${formatDecimal(host.delegationBase)})` : ''}</b></div>` +
    `<div class="tooltip-row"><span>Médailles à T (moy. avant)</span><b>${host.medals !== null ? formatNumber(host.medals) : 'N/D'}${host.medalsBase ? ` (${formatDecimal(host.medalsBase)})` : ''}</b></div>`
  ).classed('visible', true);
  moveTooltip(event);
}

function moveTooltip(event) {
  const node = document.querySelector('#tooltip');
  const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14);
  const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14);
  d3.select('#tooltip').style('left', `${Math.max(8, left)}px`).style('top', `${Math.max(8, top)}px`);
}

Promise.all([getOlympicRows(), getEconomicRows()])
  .then(([rows, economicRows]) => initialize(rows, economicRows))
  .catch(error => {
    console.error(error);
    domSel('#dom-impact', '#impact').html('<p>Impossible de charger les données de la trajectoire des pays hôtes.</p>');
  });

window.addEventListener('resize', () => {
  if (model) {
    renderImpact();
    renderEventDetail(selectedHost());
  }
});
