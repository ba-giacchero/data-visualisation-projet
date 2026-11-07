import { getHostByYear, bindWikiPreviews, wikiLinkHtml, getOlympicRows, registerVizController, navigateToViz } from '../shared-links.js';

const state = {
  season: 'Summer',
  year: 2016,
  sex: 'ALL',
  cohort: 'all',
  selected: ['Athletics', 'Gymnastics'],
  brush: null,
  focusNoc: null
};
let rawRecords = [];
let currentRows = [];
let dimensions;
let scales;
let lineSelection;

const formatNumber = d3.format(',');
const formatValue = (dimension, value) => dimension === 'age' ? `${value.toFixed(1)} ans` : `${value.toFixed(1)} ${dimension === 'height' ? 'cm' : 'kg'}`;
const dimensionsLabels = { age: 'Âge (ans)', height: 'Taille (cm)', weight: 'Poids (kg)' };
const anatSel = (scoped, fallback) => document.querySelector(scoped) ? d3.select(scoped) : d3.select(fallback);
const anatNode = (scoped, fallback) => document.querySelector(scoped) || document.querySelector(fallback);

function prepareRaw(rows) {
  const records = [];
  rows.forEach(row => {
    const year = +row.Year;
    if ((row.Season !== 'Summer' && row.Season !== 'Winter') || year < 1960 || year > 2016) return;
    if (row.Age === 'NA' || row.Height === 'NA' || row.Weight === 'NA') return;
    const isMedalist = Boolean(row.Medal && row.Medal !== 'NA');
    const dedupKey = `${row.Season}|${year}|${row.Sport}|${row.ID}`;
    records.push({
      key: dedupKey,
      season: row.Season,
      year,
      sport: row.Sport,
      sex: row.Sex,
      noc: row.NOC,
      country: row.Team ? row.Team.replace(/-\d+$/, '') : row.NOC,
      id: row.ID,
      age: +row.Age,
      height: +row.Height,
      weight: +row.Weight,
      isMedalist,
      eventMedalKey: isMedalist ? `${row.NOC}|${row.Event}|${row.Medal}` : null
    });
  });
  return records;
}

function seasonYears(season = state.season) {
  return [...new Set(rawRecords.filter(r => r.season === season).map(r => r.year))].sort(d3.ascending);
}

function computeProfiles() {
  const filtered = rawRecords.filter(r =>
    r.season === state.season &&
    r.year === state.year &&
    (state.sex === 'ALL' || r.sex === state.sex)
  );

  const bySportAthlete = new Map();
  const sportMedalsByNoc = new Map();

  filtered.forEach(r => {
    const sKey = `${r.sport}|${r.id}`;
    if (!bySportAthlete.has(sKey)) {
      bySportAthlete.set(sKey, { ...r });
    } else if (r.isMedalist) {
      bySportAthlete.get(sKey).isMedalist = true;
    }
    if (r.eventMedalKey) {
      const mKey = `${r.sport}|${r.noc}`;
      if (!sportMedalsByNoc.has(mKey)) sportMedalsByNoc.set(mKey, new Set());
      sportMedalsByNoc.get(mKey).add(r.eventMedalKey);
    }
  });

  const uniqueAthletes = [...bySportAthlete.values()];
  const sportsMap = d3.group(uniqueAthletes, d => d.sport);

  const profiles = [];
  for (const [sport, athletes] of sportsMap.entries()) {
    const medalists = athletes.filter(a => a.isMedalist);
    const nonMedalists = athletes.filter(a => !a.isMedalist);
    const activeSet = state.cohort === 'medalists' ? medalists : athletes;
    if (!activeSet.length) continue;

    const byNoc = d3.group(athletes, a => a.noc);
    const cList = [...byNoc.entries()].map(([noc, list]) => ({
      noc,
      country: list[0].country,
      count: list.length,
      medals: sportMedalsByNoc.get(`${sport}|${noc}`)?.size || 0,
      medianHeight: d3.median(list, a => a.height),
      medianWeight: d3.median(list, a => a.weight)
    })).sort((a, b) => d3.descending(a.medals, b.medals) || d3.descending(a.count, b.count));

    const statsFor = list => {
      if (!list.length) return null;
      const ages = list.map(a => a.age).sort(d3.ascending);
      const heights = list.map(a => a.height).sort(d3.ascending);
      const weights = list.map(a => a.weight).sort(d3.ascending);
      return {
        n: list.length,
        age: { q1: d3.quantile(ages, 0.25), med: d3.median(ages), q3: d3.quantile(ages, 0.75) },
        height: { q1: d3.quantile(heights, 0.25), med: d3.median(heights), q3: d3.quantile(heights, 0.75) },
        weight: { q1: d3.quantile(weights, 0.25), med: d3.median(weights), q3: d3.quantile(weights, 0.75) }
      };
    };

    profiles.push({
      year: state.year,
      sport,
      count: activeSet.length,
      totalAthletes: athletes.length,
      totalMedalists: medalists.length,
      age: d3.median(activeSet, a => a.age),
      height: d3.median(activeSet, a => a.height),
      weight: d3.median(activeSet, a => a.weight),
      medalistStats: statsFor(medalists),
      nonMedalistStats: statsFor(nonMedalists),
      allStats: statsFor(athletes),
      countriesCount: cList.length,
      topCountries: cList.slice(0, 5)
    });
  }

  return profiles.sort((a, b) => d3.descending(a.count, b.count));
}

function applyParams(params = {}) {
  const seasonParam = params.season || params.saison;
  if (seasonParam === 'Winter' || seasonParam === 'hiver') state.season = 'Winter';
  else if (seasonParam === 'Summer' || seasonParam === 'ete') state.season = 'Summer';

  const years = seasonYears(state.season);
  const y = +params.year;
  if (y && years.includes(y)) state.year = y;
  else if (!years.includes(state.year)) state.year = years[years.length - 1];

  const sexParam = params.sex;
  if (sexParam && ['ALL', 'F', 'M'].includes(String(sexParam).toUpperCase())) state.sex = String(sexParam).toUpperCase();

  const cohortParam = params.cohort;
  if (cohortParam && ['all', 'medalists'].includes(cohortParam)) state.cohort = cohortParam;

  const nocParam = params.noc;
  if (nocParam) state.focusNoc = nocParam.toUpperCase();

  anatSel('#anat-season', '#season').property('value', state.season);
  anatSel('#anat-sex', '#sex').property('value', state.sex);
  anatSel('#anat-cohort', '#cohort').property('value', state.cohort);
  updateYearMenu();

  const available = computeProfiles().map(r => r.sport);
  const s = params.sport ? decodeURIComponent(params.sport) : null;
  const s2 = params.sportB ? decodeURIComponent(params.sportB) : null;
  if (s && available.includes(s)) {
    state.selected[0] = s;
    if (s2 && available.includes(s2) && s2 !== s) {
      state.selected[1] = s2;
    } else if (state.selected[1] === s || !available.includes(state.selected[1])) {
      state.selected[1] = available.find(item => item !== s) || state.selected[1];
    }
  } else if (state.season === 'Winter' && !available.includes(state.selected[0])) {
    state.selected = [available[0] || 'Ice Hockey', available[1] || 'Alpine Skiing'];
  }
  updateSportMenus();
  render();
}

function updateYearMenu() {
  const years = seasonYears(state.season);
  if (!years.includes(state.year)) state.year = years[years.length - 1];
  const sel = anatSel('#anat-year', '#year');
  sel.selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
  sel.property('value', state.year);
}

function initialize(rows) {
  rawRecords = prepareRaw(rows);

  anatSel('#anat-season', '#season').property('value', state.season).on('change', event => {
    state.season = event.target.value;
    state.brush = null;
    updateYearMenu();
    updateSportMenus();
    render();
  });
  anatSel('#anat-year', '#year').on('change', event => { state.year = +event.target.value; updateSportMenus(); render(); });
  anatSel('#anat-sex', '#sex').property('value', state.sex).on('change', event => { state.sex = event.target.value; updateSportMenus(); render(); });
  anatSel('#anat-cohort', '#cohort').property('value', state.cohort).on('change', event => { state.cohort = event.target.value; updateSportMenus(); render(); });

  anatSel('#anat-reset', '#reset').on('click', () => {
    state.season = 'Summer';
    state.year = 2016;
    state.sex = 'ALL';
    state.cohort = 'all';
    state.selected = ['Athletics', 'Gymnastics'];
    state.brush = null;
    anatSel('#anat-season', '#season').property('value', state.season);
    anatSel('#anat-sex', '#sex').property('value', state.sex);
    anatSel('#anat-cohort', '#cohort').property('value', state.cohort);
    updateYearMenu();
    updateSportMenus();
    render();
  });

  const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  applyParams(urlParams);
  registerVizController('anatomie', applyParams);
}

function updateSportMenus() {
  const profiles = computeProfiles();
  const sports = profiles.map(row => row.sport);
  [['#anat-sport-a', '#sport-a'], ['#anat-sport-b', '#sport-b']].forEach(([scoped, fallback], index) => {
    const select = anatSel(scoped, fallback);
    select.selectAll('option').data(sports).join('option').attr('value', d => d).text(d => d);
    if (!sports.includes(state.selected[index])) {
      state.selected[index] = sports.find(s => s !== state.selected[1 - index]) || sports[index] || '';
    }
    select.property('value', state.selected[index]).on('change', event => {
      state.selected[index] = event.target.value;
      render();
    });
  });
}

function renderNarrative() {
  const host = getHostByYear(state.year, state.season);
  const ecoSaison = state.season === 'Winter' ? 'hiver' : 'ete';
  const rowA = currentRows.find(r => r.sport === state.selected[0]);
  const rowB = currentRows.find(r => r.sport === state.selected[1]);

  const sportLink = row => {
    if (!row) return '';
    const topStr = row.topCountries.slice(0, 3).map(c => `${c.country} (${c.medals} méd.)`).join(', ');
    return wikiLinkHtml({
      href: `../geographie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(row.sport)}&metric=medals`,
      text: row.sport,
      eyebrow: 'La carte des groupes sportifs',
      title: `${row.sport} (${state.year})`,
      body: `Voir la carte mondiale des médailles et des effectifs engagés en ${row.sport}.`,
      metrics: [
        ['Pays représentés', `${row.countriesCount} nations`],
        ['Nations dominantes', topStr || 'N/D'],
        ['Profil médian', `${row.height.toFixed(0)} cm, ${row.weight.toFixed(0)} kg`]
      ]
    });
  };

  const topCountryLink = row => {
    const top = row?.topCountries?.[0];
    if (!top) return '';
    return wikiLinkHtml({
      href: `../economie/index.html?saison=${ecoSaison}&year=${state.year}&country=${encodeURIComponent(top.noc)}`,
      text: `${top.country} (${top.medals} méd.)`,
      eyebrow: 'Le poids de la richesse',
      title: `${top.country} (${top.noc}) en ${state.year}`,
      body: `Première nation en ${row.sport}. Consulter le PIB par habitant et l’efficacité olympique de ${top.country}.`,
      metrics: [
        ['Bilan en ' + row.sport, `${top.medals} méd., ${top.count} athl.`],
        ['Gabarit national médian', `${top.medianHeight.toFixed(0)} cm, ${top.medianWeight.toFixed(0)} kg`]
      ]
    });
  };

  let hostPart = `En <strong>${state.year}</strong>`;
  if (host) {
    const domLink = wikiLinkHtml({
      href: `../domicile/index.html?season=${state.season}&year=${host.year}`,
      text: `${host.city} ${host.year}`,
      eyebrow: 'Trajectoire des pays hôtes',
      title: `${host.country} à ${host.city} ${host.year}`,
      body: `Analyser comment l’accueil des Jeux a transformé la délégation et les médailles de ${host.country}.`,
      metrics: [
        ['Pays hôte', `${host.country} (${host.noc})`],
        ['Ville hôte', host.city]
      ]
    });
    const ecoHostLink = wikiLinkHtml({
      href: `../economie/index.html?saison=${ecoSaison}&year=${host.year}&country=${host.noc}`,
      text: host.country,
      eyebrow: 'Le poids de la richesse',
      title: `${host.country} (${host.year})`,
      body: `Comparer le PIB par habitant et l’efficacité de ${host.country} face au reste du monde.`,
      metrics: [
        ['Code CIO', host.noc],
        ['Édition accueillie', `${host.city} ${host.year}`]
      ]
    });
    hostPart = `Aux Jeux de ${domLink} organisés par ${ecoHostLink}`;
  }

  const cohortLabel = state.cohort === 'medalists' ? 'médaillés' : 'athlètes mesurés';
  let comparePart = '';
  if (rowA && rowB) {
    const leadA = topCountryLink(rowA);
    comparePart = `, ${sportLink(rowA)} (${formatNumber(rowA.count)} ${cohortLabel}, médiane de ${rowA.height.toFixed(0)} cm et ${rowA.weight.toFixed(0)} kg${leadA ? `, dominé par ${leadA}` : ''}) s’oppose à ${sportLink(rowB)} (${formatNumber(rowB.count)} ${cohortLabel}, ${rowB.height.toFixed(0)} cm et ${rowB.weight.toFixed(0)} kg).`;
  }

  anatSel('#anat-wiki-narrative', '#wiki-narrative').html(`${hostPart}${comparePart}`);
  bindWikiPreviews(anatNode('#anat-wiki-narrative', '#wiki-narrative'));
}

function render() {
  currentRows = computeProfiles().slice(0, 36);
  renderNarrative();
  drawChart();
  renderDetailPanel();
}

function drawChart() {
  const container = anatNode('#anat-chart', '#chart');
  if (!container) return;
  const width = Math.max(container.clientWidth, 640);
  const height = 370;
  const margin = { top: 30, right: 52, bottom: 26, left: 52 };
  const chartSel = d3.select(container);
  chartSel.selectAll('svg').remove();
  if (!currentRows.length) return;
  const svg = chartSel.append('svg').attr('class', 'parallel-svg').attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  const x = d3.scalePoint().domain(Object.keys(dimensionsLabels)).range([margin.left, width - margin.right]);
  scales = {
    age: d3.scaleLinear().domain([d3.min(currentRows, d => d.age) - 1, d3.max(currentRows, d => d.age) + 1]).nice().range([height - margin.bottom, margin.top]),
    height: d3.scaleLinear().domain([d3.min(currentRows, d => d.height) - 3, d3.max(currentRows, d => d.height) + 3]).nice().range([height - margin.bottom, margin.top]),
    weight: d3.scaleLinear().domain([d3.min(currentRows, d => d.weight) - 3, d3.max(currentRows, d => d.weight) + 3]).nice().range([height - margin.bottom, margin.top])
  };
  dimensions = Object.keys(dimensionsLabels);
  const path = row => d3.line()(dimensions.map(dimension => [x(dimension), scales[dimension](row[dimension])]));

  const plot = svg.append('g');
  const groups = plot.selectAll('.sport-group')
    .data(currentRows, d => d.sport)
    .join('g')
    .attr('class', 'sport-group');

  // Ligne visible
  groups.append('path')
    .attr('class', row => lineClass(row))
    .attr('d', path);

  // Hitbox élargie (16px) transparente pour un survol et un clic faciles sans déplacer les nœuds DOM
  groups.append('path')
    .attr('class', 'sport-hit')
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', 'transparent')
    .attr('stroke-width', 16)
    .style('pointer-events', 'stroke')
    .style('cursor', 'pointer')
    .on('mouseenter', function(event, row) {
      plot.selectAll('.sport-line').classed('hovered', false);
      d3.select(this.parentNode).select('.sport-line').classed('hovered', true);
      showTooltip(event, row);
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', function() {
      plot.selectAll('.sport-line').classed('hovered', false);
      d3.select('#tooltip').classed('visible', false);
    })
    .on('click', (event, row) => {
      if (event.shiftKey || event.altKey) {
        state.selected[1] = row.sport;
      } else if (state.selected[0] === row.sport) {
        navigateToViz('geographie', { season: state.season, year: state.year, sport: row.sport });
        return;
      } else {
        state.selected[0] = row.sport;
      }
      anatSel('#anat-sport-a', '#sport-a').property('value', state.selected[0]);
      anatSel('#anat-sport-b', '#sport-b').property('value', state.selected[1]);
      render();
    });

  svg.on('mouseleave', () => {
    plot.selectAll('.sport-line').classed('hovered', false);
    d3.select('#tooltip').classed('visible', false);
  });

  groups.classed('selected-group', row => row.sport === state.selected[0] || row.sport === state.selected[1]);
  plot.selectAll('.selected-group').raise();
  lineSelection = plot.selectAll('.sport-line');

  dimensions.forEach(dimension => {
    const axis = plot.append('g').attr('class', 'axis').attr('transform', `translate(${x(dimension)},0)`).call(d3.axisLeft(scales[dimension]).ticks(6));
    axis.append('text').attr('class', 'axis-title').attr('y', margin.top - 14).attr('text-anchor', 'middle').text(dimensionsLabels[dimension]);
    if (dimension === 'height') addBrush(axis, margin.top, height - margin.bottom);
  });
  updateSelectionLabel();
}

function lineClass(row) {
  const classes = ['sport-line'];
  if (row.sport === state.selected[0]) classes.push('selected-a');
  else if (row.sport === state.selected[1]) classes.push('selected-b');
  if (state.brush && row.height >= state.brush[0] && row.height <= state.brush[1]) classes.push('brushed');
  return classes.join(' ');
}

function addBrush(axis, topY, bottomY) {
  const brush = d3.brushY().extent([[-14, topY], [14, bottomY]]).on('brush end', event => {
    if (!event.selection) {
      state.brush = null;
    } else {
      state.brush = event.selection.map(scales.height.invert).sort(d3.ascending);
    }
    if (lineSelection) lineSelection.attr('class', lineClass);
    updateSelectionLabel();
  });
  const brushGroup = axis.append('g').attr('class', 'brush').call(brush);
  if (state.brush) brushGroup.call(brush.move, state.brush.map(scales.height));
}

function updateSelectionLabel() {
  anatSel('#anat-selection-label', '#selection-label').text(
    state.brush
      ? `Taille filtrée : ${state.brush[0].toFixed(0)} à ${state.brush[1].toFixed(0)} cm (${currentRows.filter(row => row.height >= state.brush[0] && row.height <= state.brush[1]).length} sports)`
      : 'Survolez ou cliquez sur une courbe pour comparer un sport (Maj+clic pour le second sport).'
  );
}

function paddedDomain(values, defaultMin, defaultMax, minPad) {
  const valid = values.filter(v => v != null && !Number.isNaN(v));
  if (!valid.length) return [defaultMin, defaultMax];
  const minVal = d3.min(valid);
  const maxVal = d3.max(valid);
  const span = Math.max(1, maxVal - minVal);
  const pad = Math.max(minPad, span * 0.25);
  return [minVal - pad, maxVal + pad];
}

function renderDetailPanel() {
  const profiles = computeProfiles();
  const selectedRows = [
    profiles.find(r => r.sport === state.selected[0]),
    profiles.find(r => r.sport === state.selected[1])
  ].filter(Boolean);

  const ecoSaison = state.season === 'Winter' ? 'hiver' : 'ete';
  const grid = anatSel('#anat-sport-detail-grid', '#sport-detail-grid').html('');

  const allHeights = selectedRows.flatMap(r => [r.medalistStats?.height.q1, r.medalistStats?.height.q3, r.nonMedalistStats?.height.q1, r.nonMedalistStats?.height.q3, r.height]);
  const allWeights = selectedRows.flatMap(r => [r.medalistStats?.weight.q1, r.medalistStats?.weight.q3, r.nonMedalistStats?.weight.q1, r.nonMedalistStats?.weight.q3, r.weight]);
  const allAges = selectedRows.flatMap(r => [r.medalistStats?.age.q1, r.medalistStats?.age.q3, r.nonMedalistStats?.age.q1, r.nonMedalistStats?.age.q3, r.age]);

  const domainMap = {
    height: paddedDomain(allHeights, 150, 200, 6),
    weight: paddedDomain(allWeights, 45, 105, 6),
    age: paddedDomain(allAges, 16, 35, 3)
  };

  selectedRows.forEach((row, idx) => {
    const card = grid.append('article').attr('class', `sport-card ${idx === 0 ? 'card-a' : 'card-b'}`);
    const titleHtml = wikiLinkHtml({
      href: `../geographie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(row.sport)}&metric=medals`,
      text: row.sport,
      eyebrow: 'La carte des groupes sportifs',
      title: `Géographie de ${row.sport} (${state.year})`,
      body: `Voir sur la carte mondiale quels pays remportent les médailles et engagent le plus d’athlètes en ${row.sport}.`,
      metrics: [
        ['Participants mesurés', `${formatNumber(row.totalAthletes)} athlètes`],
        ['Médaillés mesurés', `${formatNumber(row.totalMedalists)} médaillés`],
        ['Nations engagées', `${row.countriesCount} pays`]
      ]
    });

    card.append('div').attr('class', 'sport-card-header').html(
      `<h3>${titleHtml}</h3><span class="sport-card-subtitle">${formatNumber(row.totalMedalists)} médaillés sur ${formatNumber(row.totalAthletes)} athlètes</span>`
    );

    card.append('div').attr('class', 'morpho-legend').html(
      `<span><i class="morpho-dot medalist"></i>Médaillés (25 % à 75 % et médiane)</span>` +
      `<span><i class="morpho-dot participant"></i>Non-médaillés (25 % à 75 % et médiane)</span>`
    );

    const W = 460, H = 152;
    const trackLeft = 108, trackRight = W - 28;
    const svg = card.append('svg').attr('class', 'morpho-svg').attr('viewBox', `0 0 ${W} ${H}`);
    const metrics = [
      { key: 'height', label: 'Taille (cm)', unit: 'cm', y: 30 },
      { key: 'weight', label: 'Poids (kg)', unit: 'kg', y: 80 },
      { key: 'age', label: 'Âge (ans)', unit: 'ans', y: 130 }
    ];

    metrics.forEach(m => {
      const x = d3.scaleLinear().domain(domainMap[m.key]).range([trackLeft, trackRight]).clamp(true);
      const g = svg.append('g');
      g.append('text').attr('x', 0).attr('y', m.y + 4).attr('fill', 'var(--ink)').attr('font-size', 12).attr('font-weight', 600).text(m.label);
      g.append('line').attr('x1', trackLeft).attr('x2', trackRight).attr('y1', m.y).attr('y2', m.y).attr('stroke', '#dedfd7').attr('stroke-dasharray', '2 3');

      const nm = row.nonMedalistStats?.[m.key];
      if (nm) {
        g.append('line')
          .attr('x1', x(nm.q1)).attr('x2', x(nm.q3))
          .attr('y1', m.y + 6).attr('y2', m.y + 6)
          .attr('stroke', '#87918a').attr('stroke-width', 5).attr('stroke-linecap', 'round').attr('opacity', 0.55);
        g.append('circle')
          .attr('cx', x(nm.med)).attr('cy', m.y + 6).attr('r', 4.5)
          .attr('fill', '#68736d').attr('stroke', 'var(--panel)').attr('stroke-width', 1.5);
      }

      const med = row.medalistStats?.[m.key];
      if (med) {
        const mainColor = idx === 0 ? 'var(--accent)' : 'var(--teal)';
        g.append('line')
          .attr('x1', x(med.q1)).attr('x2', x(med.q3))
          .attr('y1', m.y - 6).attr('y2', m.y - 6)
          .attr('stroke', mainColor).attr('stroke-width', 5).attr('stroke-linecap', 'round').attr('opacity', 0.85);
        g.append('circle')
          .attr('cx', x(med.med)).attr('cy', m.y - 6).attr('r', 5)
          .attr('fill', mainColor).attr('stroke', 'var(--panel)').attr('stroke-width', 1.5);
        const labelX = Math.max(trackLeft + 24, Math.min(trackRight - 24, x(med.med)));
        g.append('text')
          .attr('x', labelX).attr('y', m.y - 13)
          .attr('text-anchor', 'middle').attr('font-size', 10.5).attr('font-weight', 700).attr('fill', 'var(--ink)')
          .text(`${med.med.toFixed(0)} ${m.unit}`);
      }
    });

    card.append('div').attr('class', 'bastions-title').text(`Principales nations en ${row.sport} (${state.year})`);
    const list = card.append('div').attr('class', 'bastions-list');
    row.topCountries.slice(0, 4).forEach(c => {
      const cGeoLink = wikiLinkHtml({
        href: `../geographie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(row.sport)}&noc=${c.noc}`,
        text: `${c.country} (${c.noc})`,
        eyebrow: 'La carte des groupes sportifs',
        title: `${c.country} en ${row.sport} (${state.year})`,
        body: `Ouvrir la répartition sportive complète de ${c.country} sur la carte mondiale.`,
        metrics: [
          ['Médailles dans ce sport', `${c.medals} médailles`],
          ['Athlètes engagés', `${c.count} athlètes`],
          ['Gabarit national médian', `${c.medianHeight.toFixed(0)} cm, ${c.medianWeight.toFixed(0)} kg`]
        ]
      });
      const cEcoLink = wikiLinkHtml({
        href: `../economie/index.html?saison=${ecoSaison}&year=${state.year}&country=${c.noc}`,
        text: `${c.medals} méd.`,
        eyebrow: 'Le poids de la richesse',
        title: `Richesse et efficacité de ${c.country}`,
        body: `Situer la performance de ${c.country} par rapport à son PIB par habitant.`,
        metrics: [['Médailles en ' + row.sport, `${c.medals}`], ['Effectif', `${c.count} athlètes`]]
      });
      list.append('div').attr('class', 'bastion-row').html(
        `<span class="bastion-country">${cGeoLink}</span>` +
        `<span class="bastion-stats">${cEcoLink}, ${c.count} athl., <b>${c.medianHeight.toFixed(0)} cm / ${c.medianWeight.toFixed(0)} kg</b></span>`
      );
    });
  });

  bindWikiPreviews(anatNode('#anat-sport-detail', '#sport-detail'));
}

function showTooltip(event, row) {
  const topStr = row.topCountries?.slice(0, 2).map(c => `${c.country} (${c.medals} méd.)`).join(', ') || '—';
  const medH = row.medalistStats ? `${row.medalistStats.height.med.toFixed(0)} cm / ${row.medalistStats.weight.med.toFixed(0)} kg` : 'N/D';
  d3.select('#tooltip').html(
    `<strong>${row.sport}</strong>` +
    `<div class="tooltip-row"><span>Effectif affiché</span><b>${formatNumber(row.count)} athlètes</b></div>` +
    `<div class="tooltip-row"><span>Âge médian</span><b>${formatValue('age', row.age)}</b></div>` +
    `<div class="tooltip-row"><span>Taille médiane</span><b>${formatValue('height', row.height)}</b></div>` +
    `<div class="tooltip-row"><span>Poids médian</span><b>${formatValue('weight', row.weight)}</b></div>` +
    `<div class="tooltip-row"><span>Médiane des médaillés</span><b>${medH}</b></div>` +
    `<div class="tooltip-row"><span>Premières nations</span><b>${topStr}</b></div>`
  ).classed('visible', true);
  moveTooltip(event);
}

function moveTooltip(event) {
  const node = document.querySelector('#tooltip');
  const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14);
  const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14);
  d3.select('#tooltip').style('left', `${Math.max(8, left)}px`).style('top', `${Math.max(8, top)}px`);
}

getOlympicRows()
  .then(rows => initialize(rows))
  .catch(error => {
    console.error(error);
    anatSel('#anat-chart', '#chart').text('Impossible de charger les données olympiques.');
  });

window.addEventListener('resize', () => { if (rawRecords.length) drawChart(); });
