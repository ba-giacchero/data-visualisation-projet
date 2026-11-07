import { getHostByYear, bindWikiPreviews, wikiLinkHtml } from '../shared-links.js';

const OLYMPIC_FILE = '../../120 years of Olympic history/athlete_events.csv';
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
const dimensionsLabels = { age: 'Âge', height: 'Taille (cm)', weight: 'Poids (kg)' };

function prepareRaw(rows) {
  const seenAthlete = new Set();
  const records = [];
  rows.forEach(row => {
    const year = +row.Year;
    if ((row.Season !== 'Summer' && row.Season !== 'Winter') || year < 1960 || year > 2016) return;
    if (row.Age === 'NA' || row.Height === 'NA' || row.Weight === 'NA') return;
    const isMedalist = Boolean(row.Medal && row.Medal !== 'NA');
    const dedupKey = `${row.Season}|${year}|${row.Sport}|${row.ID}`;
    // Keep unique athlete per sport & edition, prioritizing medalist status if they won in any event of that sport
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

  // Deduplicate athletes per sport (keeping medalist=true if they won at least one medal in that sport)
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

    // Country breakdown for this sport
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

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const seasonParam = params.get('season') || params.get('saison');
  if (seasonParam === 'Winter' || seasonParam === 'hiver') state.season = 'Winter';
  else if (seasonParam === 'Summer' || seasonParam === 'ete') state.season = 'Summer';

  const years = seasonYears(state.season);
  const y = +params.get('year');
  if (y && years.includes(y)) state.year = y;
  else state.year = years[years.length - 1];

  const sexParam = params.get('sex');
  if (sexParam && ['ALL', 'F', 'M'].includes(sexParam.toUpperCase())) state.sex = sexParam.toUpperCase();

  const cohortParam = params.get('cohort');
  if (cohortParam && ['all', 'medalists'].includes(cohortParam)) state.cohort = cohortParam;

  const nocParam = params.get('noc');
  if (nocParam) state.focusNoc = nocParam.toUpperCase();

  const available = computeProfiles().map(r => r.sport);
  const s = params.get('sport');
  const s2 = params.get('sportB');
  if (s && available.includes(s)) {
    state.selected[0] = s;
    if (s2 && available.includes(s2) && s2 !== s) {
      state.selected[1] = s2;
    } else if (state.selected[1] === s || !available.includes(state.selected[1])) {
      state.selected[1] = available.find(item => item !== s) || state.selected[1];
    }
  } else if (state.season === 'Winter') {
    state.selected = [available[0] || 'Ice Hockey', available[1] || 'Alpine Skiing'];
  }
}

function updateYearMenu() {
  const years = seasonYears(state.season);
  if (!years.includes(state.year)) state.year = years[years.length - 1];
  d3.select('#year').selectAll('option').data(years).join('option').attr('value', d => d).text(d => d);
  d3.select('#year').property('value', state.year);
}

function initialize(rows) {
  rawRecords = prepareRaw(rows);
  applyUrlParams();

  d3.select('#season').property('value', state.season).on('change', event => {
    state.season = event.target.value;
    state.brush = null;
    updateYearMenu();
    updateSportMenus();
    render();
  });
  updateYearMenu();
  d3.select('#year').on('change', event => { state.year = +event.target.value; updateSportMenus(); render(); });
  d3.select('#sex').property('value', state.sex).on('change', event => { state.sex = event.target.value; updateSportMenus(); render(); });
  d3.select('#cohort').property('value', state.cohort).on('change', event => { state.cohort = event.target.value; updateSportMenus(); render(); });

  d3.select('#reset').on('click', () => {
    state.season = 'Summer';
    state.year = 2016;
    state.sex = 'ALL';
    state.cohort = 'all';
    state.selected = ['Athletics', 'Gymnastics'];
    state.brush = null;
    d3.select('#season').property('value', state.season);
    d3.select('#sex').property('value', state.sex);
    d3.select('#cohort').property('value', state.cohort);
    updateYearMenu();
    updateSportMenus();
    render();
  });
  updateSportMenus();
  render();
}

function updateSportMenus() {
  const profiles = computeProfiles();
  const sports = profiles.map(row => row.sport);
  ['#sport-a', '#sport-b'].forEach((selector, index) => {
    const select = d3.select(selector);
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
      title: `${row.sport} · ${state.year}`,
      body: `Voir la carte mondiale des médailles et des effectifs engagés en ${row.sport}.`,
      metrics: [
        ['Pays représentés', `${row.countriesCount} nations`],
        ['Nations dominantes', topStr || 'N/D'],
        ['Profil médian', `${row.height.toFixed(0)} cm · ${row.weight.toFixed(0)} kg`]
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
      title: `${top.country} (${top.noc}) · ${state.year}`,
      body: `Première nation en ${row.sport}. Explorer le PIB par habitant et l’efficacité olympique de ${top.country}.`,
      metrics: [
        ['Bilan en ' + row.sport, `${top.medals} méd. · ${top.count} athl.`],
        ['Gabarit national médian', `${top.medianHeight.toFixed(0)} cm · ${top.medianWeight.toFixed(0)} kg`]
      ]
    });
  };

  let hostPart = `Lors de l’édition <strong>${state.year}</strong>`;
  if (host) {
    const domLink = wikiLinkHtml({
      href: `../domicile/index.html?season=${state.season}&year=${host.year}`,
      text: `${host.city} ${host.year}`,
      eyebrow: 'Trajectoire des pays hôtes',
      title: `${host.country} · ${host.city} ${host.year}`,
      body: `Analyser comment l’accueil des Jeux a transformé la délégation et les médailles de ${host.country} entre T−3 et T+3.`,
      metrics: [
        ['Pays hôte', `${host.country} (${host.noc})`],
        ['Ville hôte', host.city]
      ]
    });
    const ecoHostLink = wikiLinkHtml({
      href: `../economie/index.html?saison=${ecoSaison}&year=${host.year}&country=${host.noc}`,
      text: host.country,
      eyebrow: 'Le poids de la richesse',
      title: `${host.country} · Économie & Jeux ${host.year}`,
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
    comparePart = `, la discipline ${sportLink(rowA)} (${formatNumber(rowA.count)} ${cohortLabel}, médiane ${rowA.height.toFixed(0)}&nbsp;cm / ${rowA.weight.toFixed(0)}&nbsp;kg${leadA ? `, dominée par ${leadA}` : ''}) se distingue de ${sportLink(rowB)} (${formatNumber(rowB.count)} ${cohortLabel}, ${rowB.height.toFixed(0)}&nbsp;cm / ${rowB.weight.toFixed(0)}&nbsp;kg).`;
  }

  d3.select('#wiki-narrative').html(`${hostPart}${comparePart}`);
  bindWikiPreviews(document.querySelector('#wiki-narrative'));
}

function render() {
  currentRows = computeProfiles().slice(0, 36);
  renderNarrative();
  drawChart();
  renderDetailPanel();
}

function drawChart() {
  const container = document.querySelector('#chart');
  const width = Math.max(container.clientWidth, 760);
  const height = 520;
  const margin = { top:34, right:52, bottom:35, left:52 };
  d3.select('#chart').selectAll('svg').remove();
  if (!currentRows.length) return;
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
    .on('click', (event, row) => {
      if (event.shiftKey || event.altKey) {
        state.selected[1] = row.sport;
      } else if (state.selected[0] === row.sport) {
        window.location.href = `../geographie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(row.sport)}`;
        return;
      } else {
        state.selected[0] = row.sport;
      }
      d3.select('#sport-a').property('value', state.selected[0]);
      d3.select('#sport-b').property('value', state.selected[1]);
      render();
    });
  plot.selectAll('.selected-a, .selected-b').raise();
  dimensions.forEach(dimension => {
    const axis = plot.append('g').attr('class', 'axis').attr('transform', `translate(${x(dimension)},0)`).call(d3.axisLeft(scales[dimension]).ticks(7));
    axis.append('text').attr('class', 'axis-title').attr('y', margin.top - 17).attr('text-anchor', 'middle').text(dimensionsLabels[dimension]);
    if (dimension === 'height') addBrush(axis, x(dimension));
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

function addBrush(axis) {
  const brush = d3.brushY().extent([[-12, 34], [12, 485]]).on('brush end', event => {
    if (!event.selection) { state.brush = null; } else { state.brush = event.selection.map(scales.height.invert).sort(d3.ascending); }
    lineSelection.attr('class', lineClass); updateSelectionLabel();
  });
  const brushGroup = axis.append('g').attr('class', 'brush').call(brush);
  if (state.brush) brushGroup.call(brush.move, state.brush.map(scales.height));
  lineSelection = axis.ownerSVGElement ? d3.select(axis.node().parentNode).selectAll('.sport-line') : d3.selectAll('.sport-line');
}

function updateSelectionLabel() {
  d3.select('#selection-label').text(state.brush ? `Taille sélectionnée : ${state.brush[0].toFixed(0)} à ${state.brush[1].toFixed(0)} cm · ${currentRows.filter(row => row.height >= state.brush[0] && row.height <= state.brush[1]).length} sports concernés` : 'Cliquez sur une courbe pour l’analyser en détail (2e clic : ouvrir sur la carte).');
}

function renderDetailPanel() {
  const profiles = computeProfiles();
  const selectedRows = [
    profiles.find(r => r.sport === state.selected[0]),
    profiles.find(r => r.sport === state.selected[1])
  ].filter(Boolean);

  const ecoSaison = state.season === 'Winter' ? 'hiver' : 'ete';
  const grid = d3.select('#sport-detail-grid').html('');

  // Shared domains across the 2 compared sports so visual comparison is truthful
  const allHeights = selectedRows.flatMap(r => [r.medalistStats?.height.q1, r.medalistStats?.height.q3, r.nonMedalistStats?.height.q1, r.nonMedalistStats?.height.q3, r.height]).filter(v => v != null);
  const allWeights = selectedRows.flatMap(r => [r.medalistStats?.weight.q1, r.medalistStats?.weight.q3, r.nonMedalistStats?.weight.q1, r.nonMedalistStats?.weight.q3, r.weight]).filter(v => v != null);
  const allAges = selectedRows.flatMap(r => [r.medalistStats?.age.q1, r.medalistStats?.age.q3, r.nonMedalistStats?.age.q1, r.nonMedalistStats?.age.q3, r.age]).filter(v => v != null);

  const domainMap = {
    height: [Math.floor((d3.min(allHeights) || 150) - 4), Math.ceil((d3.max(allHeights) || 200) + 4)],
    weight: [Math.floor((d3.min(allWeights) || 45) - 4), Math.ceil((d3.max(allWeights) || 105) + 4)],
    age: [Math.floor((d3.min(allAges) || 16) - 2), Math.ceil((d3.max(allAges) || 35) + 2)]
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
      `<h3>${titleHtml}</h3><span class="sport-card-subtitle">${formatNumber(row.totalMedalists)} médaillés / ${formatNumber(row.totalAthletes)} athlètes</span>`
    );

    card.append('div').attr('class', 'morpho-legend').html(
      `<span><i class="morpho-dot medalist"></i>Médaillés (Q1–Médiane–Q3)</span>` +
      `<span><i class="morpho-dot participant"></i>Non-médaillés (Q1–Médiane–Q3)</span>`
    );

    // Draw D3 SVG Dumbbell / IQR Box comparison between Medalists and Non-medalists
    const W = 460, H = 162;
    const svg = card.append('svg').attr('class', 'morpho-svg').attr('viewBox', `0 0 ${W} ${H}`);
    const metrics = [
      { key: 'height', label: 'Taille (cm)', unit: 'cm', y: 30 },
      { key: 'weight', label: 'Poids (kg)', unit: 'kg', y: 84 },
      { key: 'age', label: 'Âge (ans)', unit: 'ans', y: 138 }
    ];

    metrics.forEach(m => {
      const x = d3.scaleLinear().domain(domainMap[m.key]).range([105, W - 24]);
      const g = svg.append('g');
      g.append('text').attr('x', 0).attr('y', m.y + 4).attr('fill', 'var(--ink)').attr('font-size', 12).attr('font-weight', 600).text(m.label);
      g.append('line').attr('x1', 105).attr('x2', W - 24).attr('y1', m.y).attr('y2', m.y).attr('stroke', '#dedfd7').attr('stroke-dasharray', '2 3');

      // Non-medalists bar (bottom offset +6)
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

      // Medalists bar (top offset -6)
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
        g.append('text')
          .attr('x', x(med.med)).attr('y', m.y - 14)
          .attr('text-anchor', 'middle').attr('font-size', 10.5).attr('font-weight', 700).attr('fill', 'var(--ink)')
          .text(`${med.med.toFixed(0)} ${m.unit}`);
      }
    });

    // Top nations in this sport
    card.append('div').attr('class', 'bastions-title').text(`Bastions nationaux en ${row.sport} (${state.year})`);
    const list = card.append('div').attr('class', 'bastions-list');
    row.topCountries.slice(0, 4).forEach(c => {
      const cGeoLink = wikiLinkHtml({
        href: `../geographie/index.html?season=${state.season}&year=${state.year}&sport=${encodeURIComponent(row.sport)}&noc=${c.noc}`,
        text: `${c.country} (${c.noc})`,
        eyebrow: 'Profil géographique & sportif',
        title: `${c.country} en ${row.sport} (${state.year})`,
        body: `Ouvrir la répartition sportive complète de ${c.country} sur la carte mondiale.`,
        metrics: [
          ['Médailles dans ce sport', `${c.medals} médailles`],
          ['Athlètes engagés', `${c.count} athlètes`],
          ['Gabarit national médian', `${c.medianHeight.toFixed(0)} cm · ${c.medianWeight.toFixed(0)} kg`]
        ]
      });
      const cEcoLink = wikiLinkHtml({
        href: `../economie/index.html?saison=${ecoSaison}&year=${state.year}&country=${c.noc}`,
        text: `${c.medals} méd.`,
        eyebrow: 'Le poids de la richesse',
        title: `Richesse & Efficacité · ${c.country}`,
        body: `Situer la performance de ${c.country} par rapport à son PIB par habitant.`,
        metrics: [['Médailles en ' + row.sport, `${c.medals}`], ['Effectif', `${c.count} athlètes`]]
      });
      list.append('div').attr('class', 'bastion-row').html(
        `<span>${cGeoLink}</span>` +
        `<span class="bastion-stats">${cEcoLink} · ${c.count} athl. · <b>${c.medianHeight.toFixed(0)} cm / ${c.medianWeight.toFixed(0)} kg</b></span>`
      );
    });
  });

  bindWikiPreviews(document.querySelector('#sport-detail'));
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
    `<div class="tooltip-row"><span>Bastions (${row.countriesCount} pays)</span><b>${topStr}</b></div>`
  ).classed('visible', true);
  moveTooltip(event);
}
function moveTooltip(event) { const node = document.querySelector('#tooltip'); const left = Math.min(event.clientX + 16, window.innerWidth - node.offsetWidth - 14); const top = Math.min(event.clientY + 16, window.innerHeight - node.offsetHeight - 14); d3.select('#tooltip').style('left', `${Math.max(8,left)}px`).style('top', `${Math.max(8,top)}px`); }

fetch(OLYMPIC_FILE).then(response => response.text()).then(text => initialize(d3.csvParse(text))).catch(error => { console.error(error); d3.select('#chart').text('Impossible de charger le dataset olympique.'); });
window.addEventListener('resize', () => { if (rawRecords.length) drawChart(); });
