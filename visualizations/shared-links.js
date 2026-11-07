// Système unifié de données partagées, liens contextuels (façon Wikipédia) et navigation fluide par scroll

export const ROOT_PREFIX = window.location.pathname.includes('/visualizations/') ? '../../' : '';

export const HOST_EDITIONS = [
  { season: 'Summer', year: 1960, city: 'Rome', country: 'Italie', noc: 'ITA', iso3: 'ITA' },
  { season: 'Summer', year: 1964, city: 'Tokyo', country: 'Japon', noc: 'JPN', iso3: 'JPN' },
  { season: 'Summer', year: 1968, city: 'Mexico City', country: 'Mexique', noc: 'MEX', iso3: 'MEX' },
  { season: 'Summer', year: 1972, city: 'Munich', country: 'Allemagne de l’Ouest', noc: 'FRG', iso3: 'DEU' },
  { season: 'Summer', year: 1976, city: 'Montreal', country: 'Canada', noc: 'CAN', iso3: 'CAN' },
  { season: 'Summer', year: 1980, city: 'Moscow', country: 'URSS', noc: 'URS', iso3: 'SUN' },
  { season: 'Summer', year: 1984, city: 'Los Angeles', country: 'États-Unis', noc: 'USA', iso3: 'USA' },
  { season: 'Summer', year: 1988, city: 'Seoul', country: 'Corée du Sud', noc: 'KOR', iso3: 'KOR' },
  { season: 'Summer', year: 1992, city: 'Barcelona', country: 'Espagne', noc: 'ESP', iso3: 'ESP' },
  { season: 'Summer', year: 1996, city: 'Atlanta', country: 'États-Unis', noc: 'USA', iso3: 'USA' },
  { season: 'Summer', year: 2000, city: 'Sydney', country: 'Australie', noc: 'AUS', iso3: 'AUS' },
  { season: 'Summer', year: 2004, city: 'Athens', country: 'Grèce', noc: 'GRE', iso3: 'GRC' },
  { season: 'Summer', year: 2008, city: 'Beijing', country: 'Chine', noc: 'CHN', iso3: 'CHN' },
  { season: 'Summer', year: 2012, city: 'London', country: 'Royaume-Uni', noc: 'GBR', iso3: 'GBR' },
  { season: 'Summer', year: 2016, city: 'Rio de Janeiro', country: 'Brésil', noc: 'BRA', iso3: 'BRA' }
];

export const WINTER_HOST_EDITIONS = [
  { season: 'Winter', year: 1960, city: 'Squaw Valley', country: 'États-Unis', noc: 'USA', iso3: 'USA' },
  { season: 'Winter', year: 1964, city: 'Innsbruck', country: 'Autriche', noc: 'AUT', iso3: 'AUT' },
  { season: 'Winter', year: 1968, city: 'Grenoble', country: 'France', noc: 'FRA', iso3: 'FRA' },
  { season: 'Winter', year: 1972, city: 'Sapporo', country: 'Japon', noc: 'JPN', iso3: 'JPN' },
  { season: 'Winter', year: 1976, city: 'Innsbruck', country: 'Autriche', noc: 'AUT', iso3: 'AUT' },
  { season: 'Winter', year: 1980, city: 'Lake Placid', country: 'États-Unis', noc: 'USA', iso3: 'USA' },
  { season: 'Winter', year: 1984, city: 'Sarajevo', country: 'Yougoslavie', noc: 'YUG', iso3: 'YUG' },
  { season: 'Winter', year: 1988, city: 'Calgary', country: 'Canada', noc: 'CAN', iso3: 'CAN' },
  { season: 'Winter', year: 1992, city: 'Albertville', country: 'France', noc: 'FRA', iso3: 'FRA' },
  { season: 'Winter', year: 1994, city: 'Lillehammer', country: 'Norvège', noc: 'NOR', iso3: 'NOR' },
  { season: 'Winter', year: 1998, city: 'Nagano', country: 'Japon', noc: 'JPN', iso3: 'JPN' },
  { season: 'Winter', year: 2002, city: 'Salt Lake City', country: 'États-Unis', noc: 'USA', iso3: 'USA' },
  { season: 'Winter', year: 2006, city: 'Torino', country: 'Italie', noc: 'ITA', iso3: 'ITA' },
  { season: 'Winter', year: 2010, city: 'Vancouver', country: 'Canada', noc: 'CAN', iso3: 'CAN' },
  { season: 'Winter', year: 2014, city: 'Sochi', country: 'Russie', noc: 'RUS', iso3: 'RUS' }
];

export function getHostByYear(year, season = 'Summer') {
  const s = (season === 'hiver' || season === 'Winter') ? 'Winter' : 'Summer';
  const list = s === 'Winter' ? WINTER_HOST_EDITIONS : HOST_EDITIONS;
  return list.find(h => h.year === +year) || null;
}

export function getHostsByNocOrIso(code, season = 'Summer') {
  const s = (season === 'hiver' || season === 'Winter') ? 'Winter' : 'Summer';
  const list = s === 'Winter' ? WINTER_HOST_EDITIONS : HOST_EDITIONS;
  return list.filter(h => h.noc === code || h.iso3 === code);
}

// Cache mémoire partagé pour éviter de recharger athlete_events.csv (41 Mo) plusieurs fois dans la vue unifiée
let olympicPromise = null;
let gdpPromise = null;
let popPromise = null;
let worldPromise = null;

export function getOlympicRows() {
  if (!olympicPromise) {
    olympicPromise = d3.csv(`${ROOT_PREFIX}120 years of Olympic history/athlete_events.csv`);
  }
  return olympicPromise;
}

export function getGdpRows() {
  if (!gdpPromise) {
    gdpPromise = d3.csv(`${ROOT_PREFIX}Global GDP-PIB per Capita Dataset (1960-present)/pib_per_capita_countries_dataset.csv`);
  }
  return gdpPromise;
}

export function getPopulationRows() {
  if (!popPromise) {
    popPromise = d3.csv(`${ROOT_PREFIX}Demographic data/wdi_wide.csv`);
  }
  return popPromise;
}

export function getWorldTopo() {
  if (!worldPromise) {
    worldPromise = d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
  }
  return worldPromise;
}

// Contrôleurs de sections pour la navigation fluide sur une seule page
const controllers = new Map();
const pendingParams = new Map();

export function registerVizController(vizName, handler) {
  controllers.set(vizName, handler);
  if (pendingParams.has(vizName)) {
    const params = pendingParams.get(vizName);
    pendingParams.delete(vizName);
    handler(params);
  }
}

export function navigateToViz(vizName, params = {}, subSelector = null) {
  hideWikiPreview();
  const targetSection = document.getElementById(`sec-${vizName}`);
  const handler = controllers.get(vizName);
  if (targetSection) {
    if (handler) handler(params);
    else pendingParams.set(vizName, params);
    const scrollTarget = (subSelector && document.querySelector(subSelector)) || targetSection;
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  // Fallback si ouvert hors de la page unifiée
  const query = new URLSearchParams(params).toString();
  window.location.href = `${ROOT_PREFIX}index.html?${query}#sec-${vizName}`;
  return false;
}

function parseHrefToTarget(href) {
  if (!href) return null;
  let vizName = null;
  if (href.includes('geographie')) vizName = 'geographie';
  else if (href.includes('economie')) vizName = 'economie';
  else if (href.includes('domicile')) vizName = 'domicile';
  else if (href.includes('anatomie')) vizName = 'anatomie';
  if (!vizName) return null;

  const qIndex = href.indexOf('?');
  const params = {};
  if (qIndex !== -1) {
    const search = href.slice(qIndex + 1).split('#')[0];
    const usp = new URLSearchParams(search);
    for (const [k, v] of usp.entries()) params[k] = v;
  }
  return { vizName, params };
}

let previewNode = null;

function ensurePreviewNode() {
  if (!previewNode) {
    previewNode = document.querySelector('#wiki-preview');
    if (!previewNode) {
      previewNode = document.createElement('div');
      previewNode.id = 'wiki-preview';
      previewNode.className = 'wiki-preview';
      previewNode.setAttribute('role', 'status');
      previewNode.setAttribute('aria-live', 'polite');
      document.body.appendChild(previewNode);
    }
  }
  return previewNode;
}

export function showWikiPreview(event, { eyebrow, title, body, metrics = [] }) {
  const node = ensurePreviewNode();
  const metricsHtml = metrics.length
    ? `<div class="wiki-preview-metrics">${metrics.map(([k, v]) => `<div class="wiki-preview-row"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`
    : '';
  node.innerHTML = `
    <div class="wiki-preview-eyebrow">${eyebrow || ''}</div>
    <div class="wiki-preview-title">${title || ''}</div>
    <div class="wiki-preview-body">${body || ''}</div>
    ${metricsHtml}
  `;
  node.classList.add('visible');
  moveWikiPreview(event);
}

export function moveWikiPreview(event) {
  const node = ensurePreviewNode();
  if (!node.classList.contains('visible')) return;
  const clientX = event.clientX ?? (event.pageX - window.scrollX);
  const clientY = event.clientY ?? (event.pageY - window.scrollY);
  const left = Math.min(clientX + 16, window.innerWidth - node.offsetWidth - 14);
  const top = Math.min(clientY + 18, window.innerHeight - node.offsetHeight - 14);
  node.style.left = `${Math.max(8, left)}px`;
  node.style.top = `${Math.max(8, top)}px`;
}

export function hideWikiPreview() {
  const node = ensurePreviewNode();
  node.classList.remove('visible');
}

export function bindWikiPreviews(root = document) {
  if (!root) return;
  root.querySelectorAll('[data-wiki-preview], .wiki-link[data-title]').forEach(el => {
    if (el.dataset.wikiBound) return;
    el.dataset.wikiBound = '1';
    el.addEventListener('mouseenter', event => {
      try {
        if (el.dataset.wikiPreview) {
          showWikiPreview(event, JSON.parse(el.dataset.wikiPreview));
        } else if (el.dataset.title) {
          showWikiPreview(event, {
            eyebrow: el.dataset.eyebrow || '',
            title: el.dataset.title || '',
            body: el.dataset.body || '',
            metrics: []
          });
        }
      } catch (e) {
        console.error(e);
      }
    });
    el.addEventListener('mousemove', moveWikiPreview);
    el.addEventListener('mouseleave', hideWikiPreview);
    el.addEventListener('blur', hideWikiPreview);
    el.addEventListener('click', event => {
      if (el.dataset.viz) {
        event.preventDefault();
        const p = el.dataset.params ? JSON.parse(el.dataset.params) : {};
        navigateToViz(el.dataset.viz, p);
        return;
      }
      const target = parseHrefToTarget(el.getAttribute('href'));
      if (target && document.getElementById(`sec-${target.vizName}`)) {
        event.preventDefault();
        navigateToViz(target.vizName, target.params);
      }
    });
  });
}

export function wikiLinkHtml({ href, text, className = 'wiki-link', eyebrow, title, body, metrics = [] }) {
  const payload = JSON.stringify({ eyebrow, title, body, metrics }).replace(/"/g, '&quot;');
  return `<a href="${href}" class="${className}" data-wiki-preview="${payload}">${text}</a>`;
}
