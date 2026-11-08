import { ROOT_PREFIX, registerVizController, countryFr, loadFrenchNames } from '../shared-links.js';
// Vue 2 : la richesse fait-elle les médailles ?
// Nombre moyen de médailles par pays dans cinq groupes de richesse (quintiles de PIB par habitant), par édition.

// ---------- Réglages ----------
const L = 1100, H = 460;      // taille du dessin (format large : graphique pleine largeur)
const DUREE_GLISSEMENT = 600; // ms, changement d'édition ou de saison
const DUREE_FILTRE = 200;     // ms, curseur et repère de pays
const PAS_LECTURE = 1000;     // ms par édition, bouton « Lecture »

// ---------- État de l'interface ----------
const etat = {
  saison: "ete",
  annee: null,       // null : dernière édition disponible
  paysFocus: null    // code CIO d'un pays reçu par lien depuis une autre vue
};
let donnees = [];    // lignes de data/olympiques.csv
let annees = [];     // éditions disponibles pour la saison choisie

// ---------- Format des nombres en français ----------
const localeFr = d3.formatLocale({ decimal: ",", thousands: "\u202f", grouping: [3], currency: ["", "\u202f$"], minus: "-" });
const nombre = localeFr.format(",.0f");
const decimal1 = localeFr.format(",.1f");

// ---------- Chargement ----------
function appliquerParametres(params = {}, redessiner = false) {
  const sParam = params.saison || params.season;
  if (sParam === "hiver" || sParam === "Winter") {
    etat.saison = "hiver";
    d3.selectAll("input[name=saison]").property("checked", function() { return this.value === "hiver"; });
  } else if (sParam === "ete" || sParam === "Summer") {
    etat.saison = "ete";
    d3.selectAll("input[name=saison]").property("checked", function() { return this.value === "ete"; });
  }
  const y = +(params.year || params.annee);
  if (y) etat.annee = y;
  // Pays transmis par un lien d'une autre vue (code CIO) : sa barre de groupe est repérée
  const pays = params.country || params.noc;
  etat.paysFocus = pays ? String(pays).toUpperCase() : null;
  if (redessiner && donnees.length) {
    arreterLecture();
    majCurseurAnnee();
    dessiner();
  }
}

let urlDejaAppliquee = false;
function charger() {
  Promise.all([d3.csv(`${ROOT_PREFIX}visualizations/economie/data/olympiques.csv`, d3.autoType), loadFrenchNames()]).then(([lignes]) => {
    donnees = lignes;
    if (!urlDejaAppliquee) {
      urlDejaAppliquee = true;
      const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
      appliquerParametres(urlParams, false);
      registerVizController('economie', params => appliquerParametres(params, true));
    }
    majCurseurAnnee();
    dessiner();
  }).catch(erreur => {
    d3.select("#nuage-aide").classed("erreur", true).text(
      `Impossible de charger les données (${erreur.message}). ` +
      "Lancez « python main.py » à la racine du projet puis ouvrez http://localhost:8000.");
  });
}

// ---------- Graphique en barres : médailles moyennes par quintile de PIB par habitant ----------
const MB = { haut: 34, droite: 28, bas: 112, gauche: 72 }; // marges du graphique en barres
const BAS_BARRES = H - MB.bas;
const xBarres = d3.scaleBand().domain([1, 2, 3, 4, 5])
  .range([MB.gauche, L - MB.droite]).padding(0.35);
// Dégradé discret du moins riche (clair) au plus riche (sarcelle du projet, --teal)
const COULEURS_QUINTILES = ["#c4dcd5", "#9cc7bc", "#72aea2", "#4a948a", "#287c78"];
const barres = {};
const maxParSaison = new Map(); // axe vertical fixe pour toute la saison : hauteurs comparables pendant la lecture

function quintiles(saison, annee) {
  const classees = donnees.filter(d => d.saison === saison && d.annee === annee &&
    d.iso3 !== "exclu" && Number.isFinite(d.gdppc) && Number.isFinite(d.medailles))
    .sort((a, b) => d3.ascending(a.gdppc, b.gdppc));
  return d3.range(5).map(index => {
    const pays = classees.slice(Math.floor(index * classees.length / 5), Math.floor((index + 1) * classees.length / 5));
    return {
      index: index + 1,
      pays,
      pibMin: pays[0]?.gdppc,
      pibMax: pays[pays.length - 1]?.gdppc,
      moyenne: d3.mean(pays, d => d.medailles),
      medailles: pays.filter(d => d.medailles > 0).length
    };
  }).filter(g => g.pays.length);
}

function echelleBarres() {
  if (!maxParSaison.has(etat.saison)) {
    const max = d3.max(annees, a => d3.max(quintiles(etat.saison, a), g => g.moyenne));
    maxParSaison.set(etat.saison, max || 1);
  }
  return d3.scaleLinear().domain([0, maxParSaison.get(etat.saison)]).nice().range([BAS_BARRES, MB.haut]);
}

function initBarres() {
  const svg = d3.select("#nuage");
  svg.selectAll("*").remove();
  svg.attr("viewBox", [0, 0, L, H]);
  barres.grille = svg.append("g").attr("class", "boxplot-grid").attr("transform", `translate(${MB.gauche},0)`);
  barres.axeY = svg.append("g").attr("class", "boxplot-y-axis").attr("transform", `translate(${MB.gauche},0)`);
  barres.groupes = svg.append("g");
  svg.append("g").attr("class", "boxplot-x-axis").attr("transform", `translate(0,${BAS_BARRES})`)
    .call(d3.axisBottom(xBarres).tickSize(0).tickPadding(10).tickFormat(d => `Quintile ${d}`));
  svg.append("text").attr("class", "boxplot-axis-title")
    .attr("transform", `translate(20,${(MB.haut + BAS_BARRES) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").text("Nombre moyen de médailles par pays");
  svg.append("text").attr("class", "boxplot-axis-title")
    .attr("x", (MB.gauche + L - MB.droite) / 2).attr("y", H - 12)
    .attr("text-anchor", "middle").text("Groupes de richesse, du PIB/hab. le plus bas au plus élevé");
  barres.vide = svg.append("text").attr("class", "boxplot-empty")
    .attr("x", L / 2).attr("y", H / 2).attr("text-anchor", "middle")
    .text("Aucun pays avec PIB par habitant connu pour cette édition.");
}

function dessiner(duree = 0) {
  if (!barres.groupes) initBarres();
  const groupes = quintiles(etat.saison, etat.annee);
  const y = echelleBarres();
  const t = d3.transition().duration(duree).ease(d3.easeCubicInOut);
  const largeur = L - MB.gauche - MB.droite;

  barres.vide.style("display", groupes.length ? "none" : null);
  barres.grille.transition(t)
    .call(d3.axisLeft(y).ticks(5).tickSize(-largeur).tickFormat(""))
    .call(g => g.select(".domain").remove());
  barres.axeY.transition(t).call(d3.axisLeft(y).ticks(5).tickFormat(localeFr.format("~g")));

  const groupe = barres.groupes.selectAll("g.quintile").data(groupes, d => d.index).join(entree => {
    const g = entree.append("g").attr("class", "quintile")
      .attr("transform", d => `translate(${xBarres(d.index)},0)`);
    g.append("rect").attr("class", "barre-quintile")
      .attr("fill", d => COULEURS_QUINTILES[d.index - 1])
      .attr("width", xBarres.bandwidth()).attr("y", BAS_BARRES).attr("height", 0)
      .attr("tabindex", 0).attr("role", "img")
      .on("mouseenter focus", (event, d) => afficherTexteInfobulle(event,
        `<strong>Quintile ${d.index}</strong> · ${d.pays.length} pays<br>` +
        `Moyenne : ${decimal1(d.moyenne)} médailles par pays<br>` +
        `Pays médaillés : ${d.medailles} sur ${d.pays.length}`))
      .on("mousemove", deplacerInfobulle)
      .on("mouseleave blur", cacherInfobulle);
    g.append("text").attr("class", "barre-focus")
      .attr("x", xBarres.bandwidth() / 2).attr("y", BAS_BARRES - 26).attr("text-anchor", "middle");
    g.append("text").attr("class", "barre-valeur")
      .attr("x", xBarres.bandwidth() / 2).attr("y", BAS_BARRES - 8).attr("text-anchor", "middle");
    g.append("text").attr("class", "barre-pays")
      .attr("x", xBarres.bandwidth() / 2).attr("y", BAS_BARRES + 40).attr("text-anchor", "middle");
    g.append("text").attr("class", "barre-pib")
      .attr("x", xBarres.bandwidth() / 2).attr("y", BAS_BARRES + 56).attr("text-anchor", "middle");
    return g;
  });

  // select() transmet les nouvelles données du groupe à chaque enfant (infobulle à jour)
  groupe.select(".barre-quintile")
    .attr("aria-label", d => `Quintile ${d.index} : ${decimal1(d.moyenne)} médailles en moyenne, ${d.pays.length} pays`)
    .transition(t)
    .attr("y", d => y(d.moyenne)).attr("height", d => BAS_BARRES - y(d.moyenne));
  // La valeur défile jusqu'à la nouvelle moyenne, en repartant de la valeur affichée
  groupe.select(".barre-valeur").transition(t)
    .attr("y", d => y(d.moyenne) - 8)
    .tween("text", function (d) {
      const noeud = this;
      const i = d3.interpolateNumber(noeud._valeur ?? 0, d.moyenne);
      return u => { noeud._valeur = i(u); noeud.textContent = decimal1(noeud._valeur); };
    });
  groupe.select(".barre-pays").text(d => `${d.pays.length} pays`);
  groupe.select(".barre-pib").text(d => `${nombre(d.pibMin)} - ${nombre(d.pibMax)} $ / hab.`);
  majFocus(groupe, y, t);
}

// ---------- Infobulle ----------
const infobulle = d3.select("#infobulle");

function afficherTexteInfobulle(event, html) {
  infobulle.style("display", "block").html(html);
  deplacerInfobulle(event);
}

// Suit la souris en coordonnées fenêtre (position: fixed) ou se cale sur l'élément au clavier
function deplacerInfobulle(event) {
  let cx = event.clientX, cy = event.clientY;
  if (cx == null && event.currentTarget) {
    const r = event.currentTarget.getBoundingClientRect();
    cx = r.right;
    cy = r.top;
  }
  const n = infobulle.node();
  if (!n) return;
  let gauche = (cx || 0) + 14;
  let haut = (cy || 0) + 14;
  if (gauche + n.offsetWidth > window.innerWidth - 12) {
    gauche = (cx || 0) - n.offsetWidth - 12;
  }
  if (haut + n.offsetHeight > window.innerHeight - 12) {
    haut = (cy || 0) - n.offsetHeight - 12;
  }
  infobulle.style("left", `${Math.max(8, gauche)}px`).style("top", `${Math.max(8, haut)}px`);
}
function cacherInfobulle() {
  infobulle.style("display", "none");
}

// ---------- Contrôles ----------
function majCurseurAnnee() {
  annees = [...new Set(donnees.filter(d => d.saison === etat.saison).map(d => d.annee))]
    .sort(d3.ascending);
  if (!annees.includes(etat.annee)) {
    etat.annee = etat.annee == null
      ? annees[annees.length - 1]
      : annees[d3.minIndex(annees, a => Math.abs(a - etat.annee))];
  }
  d3.select("#annee").attr("max", annees.length - 1);
  afficherAnnee();
}

function afficherAnnee() {
  d3.select("#annee").property("value", annees.indexOf(etat.annee)).attr("aria-valuetext", etat.annee);
  d3.select("#annee-valeur").text(etat.annee);
}
function changerAnnee(annee) {
  etat.annee = annee;
  afficherAnnee();
  dessiner(DUREE_GLISSEMENT);
}

// Lecture : les éditions défilent une à une
let lecture = null;

function basculerLecture() {
  if (lecture) return arreterLecture();
  if (etat.annee === annees[annees.length - 1]) changerAnnee(annees[0]);
  lecture = d3.interval(() => {
    const i = annees.indexOf(etat.annee);
    if (i >= annees.length - 1) return arreterLecture();
    changerAnnee(annees[i + 1]);
  }, PAS_LECTURE);
  d3.select("#lecture").text("❚❚ Pause").attr("aria-pressed", true);
}

function arreterLecture() {
  if (lecture) lecture.stop();
  lecture = null;
  d3.select("#lecture").text("▶ Lecture").attr("aria-pressed", false);
}

// Repère du pays reçu par lien : barre cerclée, nom au-dessus, pastille pour le retirer
function majFocus(groupe, y, t) {
  const nomFocus = etat.paysFocus ? countryFr(etat.paysFocus) : null;
  const indexFocus = etat.paysFocus
    ? quintiles(etat.saison, etat.annee).find(g => g.pays.some(d => d.pays === etat.paysFocus))?.index
    : undefined;
  groupe.select(".barre-quintile").classed("focus", d => d.index === indexFocus);
  groupe.select(".barre-focus").text(d => (d.index === indexFocus ? nomFocus : ""))
    .transition(t).attr("y", d => y(d.moyenne) - 26);
  d3.select("#eco-focus").property("hidden", !nomFocus)
    .text(nomFocus ? (indexFocus ? `${nomFocus} ✕` : `${nomFocus} : absent ou PIB inconnu en ${etat.annee} ✕`) : "");
}

d3.select("#eco-focus").on("click", () => { etat.paysFocus = null; dessiner(DUREE_FILTRE); });

d3.selectAll("input[name=saison]").on("change", e => {
  etat.paysFocus = null;
  arreterLecture();
  etat.saison = e.target.value;
  majCurseurAnnee();
  dessiner(DUREE_GLISSEMENT);
});

d3.select("#annee").on("input", e => {
  arreterLecture();
  etat.annee = annees[+e.target.value];
  afficherAnnee();
  dessiner(DUREE_FILTRE);
});

d3.select("#lecture").on("click", basculerLecture);

charger();
