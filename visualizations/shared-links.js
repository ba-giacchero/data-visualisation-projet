// Système de liens contextuels et d'aperçus au survol (façon Wikipédia)

export const HOST_EDITIONS = [
  { year: 1960, city: 'Rome', country: 'Italie', noc: 'ITA', iso3: 'ITA' },
  { year: 1964, city: 'Tokyo', country: 'Japon', noc: 'JPN', iso3: 'JPN' },
  { year: 1968, city: 'Mexico City', country: 'Mexique', noc: 'MEX', iso3: 'MEX' },
  { year: 1972, city: 'Munich', country: 'Allemagne de l’Ouest', noc: 'FRG', iso3: 'DEU' },
  { year: 1976, city: 'Montreal', country: 'Canada', noc: 'CAN', iso3: 'CAN' },
  { year: 1980, city: 'Moscow', country: 'URSS', noc: 'URS', iso3: 'SUN' },
  { year: 1984, city: 'Los Angeles', country: 'États-Unis', noc: 'USA', iso3: 'USA' },
  { year: 1988, city: 'Seoul', country: 'Corée du Sud', noc: 'KOR', iso3: 'KOR' },
  { year: 1992, city: 'Barcelona', country: 'Espagne', noc: 'ESP', iso3: 'ESP' },
  { year: 1996, city: 'Atlanta', country: 'États-Unis', noc: 'USA', iso3: 'USA' },
  { year: 2000, city: 'Sydney', country: 'Australie', noc: 'AUS', iso3: 'AUS' },
  { year: 2004, city: 'Athens', country: 'Grèce', noc: 'GRE', iso3: 'GRC' },
  { year: 2008, city: 'Beijing', country: 'Chine', noc: 'CHN', iso3: 'CHN' },
  { year: 2012, city: 'London', country: 'Royaume-Uni', noc: 'GBR', iso3: 'GBR' },
  { year: 2016, city: 'Rio de Janeiro', country: 'Brésil', noc: 'BRA', iso3: 'BRA' }
];

export function getHostByYear(year) {
  return HOST_EDITIONS.find(h => h.year === +year) || null;
}

export function getHostsByNocOrIso(code) {
  return HOST_EDITIONS.filter(h => h.noc === code || h.iso3 === code);
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
    <div class="wiki-preview-eyebrow">${eyebrow}</div>
    <div class="wiki-preview-title">${title}</div>
    <div class="wiki-preview-body">${body}</div>
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
  root.querySelectorAll('[data-wiki-preview]').forEach(el => {
    if (el.dataset.wikiBound) return;
    el.dataset.wikiBound = '1';
    el.addEventListener('mouseenter', event => {
      try {
        const data = JSON.parse(el.dataset.wikiPreview);
        showWikiPreview(event, data);
      } catch (e) {
        console.error(e);
      }
    });
    el.addEventListener('mousemove', moveWikiPreview);
    el.addEventListener('mouseleave', hideWikiPreview);
    el.addEventListener('blur', hideWikiPreview);
  });
}

export function wikiLinkHtml({ href, text, className = 'wiki-link', eyebrow, title, body, metrics = [] }) {
  const payload = JSON.stringify({ eyebrow, title, body, metrics }).replace(/"/g, '&quot;');
  return `<a href="${href}" class="${className}" data-wiki-preview="${payload}">${text}</a>`;
}
