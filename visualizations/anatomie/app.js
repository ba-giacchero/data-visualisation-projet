import { bindWikiPreviews, wikiLinkHtml, getOlympicRows, registerVizController, sportFr, countryFr } from '../shared-links.js';

const state = {
  season: 'Summer',
  year: 2016,
  sex: 'ALL',
  selected: ['Athletics', 'Gymnastics'],
  brush: null
};
let rawRecords = [];
let currentRows = [];
// Athlètes mesurés (âge, taille, poids) minimum pour calculer le profil d'un sport.
const MIN_MEASURED = 20;
let excludedSports = 0;  // sports écartés faute d'athlètes mesurés, pour l'édition et les filtres en cours
let dimensions;
let scales;
let lineSelection;

// Nombres au format français : « 2 165 » et « 26,5 »
const localeFr = d3.formatLocale({ decimal: ',', thousands: ' ', grouping: [3], currency: ['', ' €'], minus: '-' });
const formatNumber = localeFr.format(',');
const formatDecimal = localeFr.format('.1f');
const formatValue = (dimension, value) => `${formatDecimal(value)} ${dimension === 'age' ? 'ans' : dimension === 'height' ? 'cm' : 'kg'}`;
// Boutons à deux ou trois positions (même composant que les vues 2 et 3)
const frenchList = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}` : items[0] || '';
const setRadio = (name, value) => d3.selectAll(`input[name=${name}]`).property('checked', function () { return this.value === value; });
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
      country: countryFr(row.NOC, row.Team ? row.Team.replace(/-\d+$/, '') : row.NOC), // nom français (table de correspondance)
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
  excludedSports = 0;
  for (const [sport, athletes] of sportsMap.entries()) {
    const medalists = athletes.filter(a => a.isMedalist);
    const nonMedalists = athletes.filter(a => !a.isMedalist);
    // Médiane trop instable sous le seuil : le sport est écarté (et compté pour le signaler)
    if (athletes.length < MIN_MEASURED) { excludedSports++; continue; }

    const byNoc = d3.group(athletes, a => a.noc);
    const cList = [...byNoc.entries()].map(([noc, list]) => ({
      noc,
      country: list[0].country,
      count: list.length,
      medals: sportMedalsByNoc.get(`${sport}|${noc}`)?.size || 0
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
      label: sportFr(sport), // nom affiché en français ; `sport` reste la clé anglaise des données
      count: athletes.length,
      totalAthletes: athletes.length,
      totalMedalists: medalists.length,
      age: d3.median(athletes, a => a.age),
      height: d3.median(athletes, a => a.height),
      weight: d3.median(athletes, a => a.weight),
      medalistStats: statsFor(medalists),
      nonMedalistStats: statsFor(nonMedalists),
      bySex: Object.fromEntries(['F', 'M'].map(sx => [sx, {
        med: statsFor(medalists.filter(a => a.sex === sx)),
        non: statsFor(nonMedalists.filter(a => a.sex === sx))
      }])),
      countriesCount: cList.length,
      topCountries: cList.slice(0, 5)
    });
  }

  return profiles.sort((a, b) => d3.descending(a.count, b.count));
}

function applyParams(params = {}) {
  stopPlay();
  const seasonParam = params.season || params.saison;
  if (seasonParam === 'Winter' || seasonParam === 'hiver') state.season = 'Winter';
  else if (seasonParam === 'Summer' || seasonParam === 'ete') state.season = 'Summer';

  const years = seasonYears(state.season);
  const y = +params.year;
  if (y && years.includes(y)) state.year = y;
  else if (!years.includes(state.year)) state.year = years[years.length - 1];

  const sexParam = params.sex;
  if (sexParam && ['ALL', 'F', 'M'].includes(String(sexParam).toUpperCase())) state.sex = String(sexParam).toUpperCase();



  setRadio('anat-season', state.season);
  setRadio('anat-sex', state.sex);
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

// Édition : curseur sur les années de la saison (comme la vue 2), l'année choisie s'affiche à côté
function updateYearMenu() {
  const years = seasonYears(state.season);
  if (!years.includes(state.year)) state.year = years[years.length - 1];
  d3.select('#anat-year').attr('max', years.length - 1)
    .property('value', years.indexOf(state.year)).attr('aria-valuetext', state.year);
  d3.select('#anat-year-value').text(state.year);
}

// ---------- Lecture : les éditions défilent une par une (même rythme que la vue 2) ----------
const PLAY_STEP = 1000; // ms par édition
let playTimer = null;

function stopPlay() {
  if (playTimer) playTimer.stop();
  playTimer = null;
  d3.select('#anat-play').text('▶ Lecture').attr('aria-pressed', false);
}

function setYear(year) {
  state.year = year;
  updateYearMenu();
  updateSportMenus();
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
  d3.select('#anat-play').text('❚❚ Pause').attr('aria-pressed', true);
}

function initialize(rows) {
  rawRecords = prepareRaw(rows);

  setRadio('anat-season', state.season);
  d3.selectAll('input[name=anat-season]').on('change', event => {
    stopPlay();
    state.season = event.target.value;
    state.brush = null;
    updateYearMenu();
    updateSportMenus();
    render();
  });
  d3.select('#anat-play').on('click', togglePlay);
  d3.select('#anat-year').on('input', event => {
    stopPlay();
    state.year = seasonYears(state.season)[+event.target.value];
    d3.select('#anat-year-value').text(state.year);
    d3.select('#anat-year').attr('aria-valuetext', state.year);
    updateSportMenus();
    render();
  });
  setRadio('anat-sex', state.sex);
  d3.selectAll('input[name=anat-sex]').on('change', event => { state.sex = event.target.value; updateSportMenus(); render(); });

  anatSel('#anat-reset', '#reset').on('click', () => {
    stopPlay();
    state.season = 'Summer';
    state.year = 2016;
    state.sex = 'ALL';
    state.selected = ['Athletics', 'Gymnastics'];
    state.brush = null;
    setRadio('anat-season', state.season);
    setRadio('anat-sex', state.sex);
    updateYearMenu();
    updateSportMenus();
    render();
  });

  const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  applyParams(urlParams);
  registerVizController('anatomie', applyParams);
}

// Choisir pour un emplacement le sport déjà affiché dans l'autre : les deux sports sont échangés
function setSport(index, sport) {
  if (state.selected[1 - index] === sport) state.selected[1 - index] = state.selected[index];
  state.selected[index] = sport;
  anatSel('#anat-sport-a', '#sport-a').property('value', state.selected[0]);
  anatSel('#anat-sport-b', '#sport-b').property('value', state.selected[1]);
}

function updateSportMenus() {
  const profiles = computeProfiles();
  const sports = profiles.map(row => row.sport);
  [['#anat-sport-a', '#sport-a'], ['#anat-sport-b', '#sport-b']].forEach(([scoped, fallback], index) => {
    const select = anatSel(scoped, fallback);
    select.selectAll('option').data(sports).join('option').attr('value', d => d).text(d => sportFr(d));
    if (!sports.includes(state.selected[index])) {
      state.selected[index] = sports.find(s => s !== state.selected[1 - index]) || sports[index] || '';
    }
    select.property('value', state.selected[index]).on('change', event => {
      setSport(index, event.target.value);
      render();
    });
  });
}

function render() {
  currentRows = computeProfiles(); // tous les sports au-dessus du seuil de mesure (plus de limite cachée à 36)
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
      // Un clic choisit le sport 1, Maj+clic le sport 2 (plus de changement de vue caché sur le sport déjà choisi)
      if (event.shiftKey || event.altKey) {
        if (state.selected[1] === row.sport) return;
        setSport(1, row.sport);
      } else if (state.selected[0] === row.sport) {
        return;
      } else {
        setSport(0, row.sport);
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
      : 'Cliquez sur une courbe pour le sport 1 (Maj+clic : sport 2). Glissez sur l’axe Taille pour filtrer une plage.'
  );
  // Transparence : sports non affichés faute de mesures suffisantes
  d3.select('#anat-excluded-note').text(excludedSports
    ? `${excludedSports} sport${excludedSports > 1 ? 's' : ''} non affiché${excludedSports > 1 ? 's' : ''} (moins de ${MIN_MEASURED} athlètes mesurés).`
    : '');
  // L'entrée de légende « plage de taille filtrée » n'apparaît que lorsqu'une plage est sélectionnée
  d3.select('#anat-legend-brushed').attr('hidden', state.brush ? null : true);
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
      text: row.label,
      eyebrow: 'La carte des groupes sportifs',
      title: `Géographie de ${row.label} (${state.year})`,
      body: `Voir sur la carte mondiale quels pays remportent les médailles et engagent le plus d’athlètes en ${row.label}.`,
      metrics: [
        ['Participants mesurés', `${formatNumber(row.totalAthletes)} athlètes`],
        ['Médaillés mesurés', `${formatNumber(row.totalMedalists)} médaillés`],
        ['Nations engagées', `${row.countriesCount} pays`]
      ]
    });

    card.append('div').attr('class', 'sport-card-header').html(
      `<h3>${titleHtml}</h3><span class="sport-card-subtitle">${formatNumber(row.totalMedalists)} médaillés sur ${formatNumber(row.totalAthletes)} athlètes mesurés</span>`
    );

    const mainColor = idx === 0 ? 'var(--accent)' : 'var(--teal)';
    const textColor = idx === 0 ? 'var(--red)' : 'var(--teal)'; // version lisible pour le texte (contraste >= 4,5:1)
    // Accord avec le filtre Sexe : « plus grandes » pour les femmes, « plus grands » sinon
    // (aussi pour un sport uniquement féminin, comme la gymnastique rythmique)
    const fem = state.sex === 'F' || (!row.bySex?.M?.med && !row.bySex?.M?.non);
    const metrics = [
      { key: 'height', label: 'Taille (cm)', unit: 'cm', y: 30, min: 2, more: fem ? 'plus grandes' : 'plus grands', less: fem ? 'plus petites' : 'plus petits', same: 'une taille' },
      { key: 'weight', label: 'Poids (kg)', unit: 'kg', y: 110, min: 2, more: fem ? 'plus lourdes' : 'plus lourds', less: fem ? 'plus légères' : 'plus légers', same: 'un poids' },
      { key: 'age', label: 'Âge (ans)', unit: 'ans', y: 190, min: 1, more: fem ? 'plus âgées' : 'plus âgés', less: fem ? 'plus jeunes' : 'plus jeunes', same: 'un âge' }
    ];
    // Écart entre la médiane des médaillés et celle des autres participants (en cm, kg ou ans).
    // Il est jugé net au-delà de `min` (2 cm, 2 kg, 1 an) ; en dessous, la mesure est dite comparable.
    // Filtre « Tous » : l'écart est calculé dans chaque sexe puis moyenné (pondéré par le nombre de médaillés).
    // Sinon le mélange hommes / femmes peut effacer un écart réel (ex. gymnastique 2016 : −4 cm chez les femmes
    // comme chez les hommes, mais ≈ 0 cm en mélangeant, car les médaillés comptent plus d'hommes).
    const rawShift = m => {
      if (state.sex === 'ALL') {
        const parts = ['F', 'M'].map(sx => row.bySex?.[sx]).filter(p => p?.med && p?.non);
        if (!parts.length) return null;
        const total = d3.sum(parts, p => p.med.n);
        return d3.sum(parts, p => (p.med[m.key].med - p.non[m.key].med) * p.med.n) / total;
      }
      const med = row.medalistStats?.[m.key], nm = row.nonMedalistStats?.[m.key];
      return med && nm ? med.med - nm.med : null;
    };
    const shift = m => {
      const v = rawShift(m);
      if (v === null) return null;
      return Math.sign(v) * Math.round(Math.abs(v)); // arrondi symétrique : le verdict juge la valeur affichée
    };
    const fmtShift = (v, m) => `${v > 0 ? '+' : ''}${formatNumber(v)} ${m.unit}`;
    const shifts = metrics.map(m => ({ m, v: shift(m) })).filter(d => d.v !== null);
    const clear = shifts.filter(d => Math.abs(d.v) >= d.m.min);
    const similar = shifts.filter(d => Math.abs(d.v) < d.m.min);

    // Verdict en une phrase : en quoi les médaillés se distinguent-ils des autres participants ?
    const who = fem ? 'Les médaillées' : 'Les médaillés';
    const others = fem ? 'les autres participantes' : 'les autres participants';
    let verdict;
    if (!shifts.length) verdict = 'Pas assez de médaillés mesurés pour comparer.';
    else if (!clear.length) verdict = `${who} ont un gabarit proche de celui des ${others.replace('les ', '')}${state.sex === 'ALL' ? ' (comparaison à sexe égal)' : ''}.`;
    else {
      verdict = `${who} sont ${frenchList(clear.map(d => `${d.v > 0 ? d.m.more : d.m.less} (${fmtShift(d.v, d.m)})`))} que ${others}`;
      verdict += similar.length ? `, pour ${frenchList(similar.map(d => d.m.same))} comparable${similar.length > 1 ? 's' : ''}` : '';
      verdict += state.sex === 'ALL' ? ' (comparaison à sexe égal).' : '.';
    }
    card.append('p').attr('class', `card-verdict ${clear.length ? 'marked' : ''}`).style('border-left-color', mainColor).html(verdict);

    card.append('div').attr('class', 'morpho-legend').html(
      `<span><i class="morpho-dot" style="background:${mainColor}"></i>Médaillés</span>` +
      `<span><i class="morpho-dot participant"></i>Autres participants</span>` +
      `<span class="morpho-legend-note">barre : 50 % central des athlètes · point : médiane</span>`
    );

    const W = 560, H = 252;
    const trackLeft = 108, trackRight = W - 120;
    const svg = card.append('svg').attr('class', 'morpho-svg').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('text').attr('class', 'morpho-col-title').attr('x', W).attr('y', 8).attr('text-anchor', 'end').text(state.sex === 'ALL' ? 'médiane vs autres, à sexe égal' : 'médiane vs autres');

    metrics.forEach(m => {
      // Écart de médiane à droite de chaque ligne : en grand et en couleur quand il est net
      const v = shift(m);
      if (v !== null) {
        const isClear = Math.abs(v) >= m.min;
        svg.append('text').attr('class', `morpho-delta ${isClear ? 'marked' : ''}`)
          .attr('x', W).attr('y', m.y + 13).attr('text-anchor', 'end')
          .style('fill', isClear ? textColor : null)
          .text(fmtShift(v, m));
      }
      // Échelle commune aux deux cartes (même domaine) : les positions se comparent d'une carte à l'autre
      const x = d3.scaleLinear().domain(domainMap[m.key]).range([trackLeft, trackRight]).clamp(true);
      const g = svg.append('g');
      const yMed = m.y, yOth = m.y + 18, yAxis = m.y + 40;
      g.append('text').attr('class', 'morpho-row-label').attr('x', 0).attr('y', m.y + 13).text(m.label);

      // Repères verticaux légers et graduations sous la ligne
      const ticks = x.ticks(5);
      g.selectAll('.morpho-grid').data(ticks).join('line').attr('class', 'morpho-grid')
        .attr('x1', d => x(d)).attr('x2', d => x(d)).attr('y1', yMed - 16).attr('y2', yAxis);
      g.append('line').attr('class', 'morpho-axis').attr('x1', trackLeft).attr('x2', trackRight).attr('y1', yAxis).attr('y2', yAxis);
      g.selectAll('.morpho-tick').data(ticks).join('text').attr('class', 'morpho-tick')
        .attr('x', d => x(d)).attr('y', yAxis + 12).attr('text-anchor', 'middle').text(d => formatNumber(d));

      // Une barre = de 25 % à 75 % des athlètes, bornée par deux petits traits ; le point = la médiane
      const drawRange = (stats, y, color, thick, cls) => {
        g.append('line').attr('class', cls).attr('x1', x(stats.q1)).attr('x2', x(stats.q3)).attr('y1', y).attr('y2', y)
          .attr('stroke', color).attr('stroke-width', thick);
        [stats.q1, stats.q3].forEach(v => g.append('line').attr('x1', x(v)).attr('x2', x(v))
          .attr('y1', y - thick / 2 - 3).attr('y2', y + thick / 2 + 3).attr('stroke', color).attr('stroke-width', 1.5));
        g.append('circle').attr('cx', x(stats.med)).attr('cy', y).attr('r', thick / 2 + 2)
          .attr('fill', color).attr('stroke', 'var(--panel)').attr('stroke-width', 1.5);
      };
      const clampLabel = v => Math.max(trackLeft + 22, Math.min(trackRight - 22, x(v)));

      const med = row.medalistStats?.[m.key];
      if (med) {
        drawRange(med, yMed, mainColor, 8, 'morpho-range medalist');
        g.append('text').attr('class', 'morpho-med-label').attr('x', clampLabel(med.med)).attr('y', yMed - 9)
          .attr('text-anchor', 'middle').style('fill', textColor).text(`${formatNumber(med.med)} ${m.unit}`);
      }
      const nm = row.nonMedalistStats?.[m.key];
      if (nm) {
        drawRange(nm, yOth, '#87918a', 6, 'morpho-range others');
        g.append('text').attr('class', 'morpho-oth-label').attr('x', clampLabel(nm.med)).attr('y', yOth + 15)
          .attr('text-anchor', 'middle').text(`${formatNumber(nm.med)} ${m.unit}`);
      }
    });
  });

  bindWikiPreviews(anatNode('#anat-sport-detail', '#sport-detail'));
}

function showTooltip(event, row) {
  const topStr = row.topCountries?.slice(0, 2).map(c => `${c.country} (${formatNumber(c.medals)} méd.)`).join(', ') || '-';
  const medH = row.medalistStats ? `${row.medalistStats.height.med.toFixed(0)} cm / ${row.medalistStats.weight.med.toFixed(0)} kg` : 'N/D';
  d3.select('#tooltip').html(
    `<strong>${row.label}</strong>` +
    `<div class="tooltip-row"><span>Athlètes mesurés</span><b>${formatNumber(row.count)} athlètes</b></div>` +
    `<div class="tooltip-row"><span>Âge médian</span><b>${formatValue('age', row.age)}</b></div>` +
    `<div class="tooltip-row"><span>Taille médiane</span><b>${formatValue('height', row.height)}</b></div>` +
    `<div class="tooltip-row"><span>Poids médian</span><b>${formatValue('weight', row.weight)}</b></div>` +
    `<div class="tooltip-row"><span>Médiane des médaillés</span><b>${medH}</b></div>` +
    `<div class="tooltip-row"><span>Nations les plus médaillées</span><b>${topStr}</b></div>`
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
