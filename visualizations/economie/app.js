import { getHostByYear, getHostsByNocOrIso, bindWikiPreviews, wikiLinkHtml } from '../shared-links.js';
// Le poids de la richesse
// Vue d'ensemble : nuage PIB/hab (x) et une mesure olympique (y), un cercle par pays.
// Synthèse : corrélation richesse-mesure par édition. Vue détail : trajectoires des pays comparés.

// ---------- Réglages (modifiables) ----------
const L = 900, H = 520;                                   // taille du dessin
const M = { haut: 40, droite: 30, bas: 50, gauche: 150 }; // marges du nuage (gauche : bande « PIB inconnu »)
const M_TRAJECTOIRE = { ...M, gauche: 60 };               // pas de bande « PIB inconnu » dans la trajectoire
const H_EVOLUTION = 200;                                  // hauteur du graphique de synthèse
const M_EVOLUTION = { haut: 15, droite: 30, bas: 30, gauche: 60 };
const BANDE = { debut: 50, largeur: 70 };                 // bande des pays sans PIB
const BANDE_ZERO = 36;        // px, bande des valeurs nulles (0 médaille), sous l'axe vertical
const EFFICACITE_MAX = 4;     // au-delà : cercle posé sur le bord haut avec un triangle
const MIN_ATHLETES = 5;       // filtre par défaut : en dessous, l'efficacité est trop instable
const MIN_CORRELATION = 8;    // pays au moins pour calculer une corrélation ou une tendance
const DUREE_GLISSEMENT = 600; // ms, changement d'édition ou de mesure
const DUREE_FILTRE = 200;     // ms, filtres et sélection
const DUREE_FONDU = 300;      // ms, changement de Jeux ou de saison
const PAS_ANIMATION = 300;    // ms par édition dans la trajectoire
const PAS_LECTURE = 1200;     // ms par édition, bouton « Lecture » du nuage
const COULEURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"]; // un pays comparé = une couleur
const MAX_COMPARAISON = COULEURS.length;
const CONTINENTS = ["Afrique", "Amérique", "Asie", "Europe", "Océanie"]; // associations continentales du CIO
const BOYCOTTS = {            // Olympiques d'été, signalés quand le pays est absent
  1976: "boycott africain de Montréal",
  1980: "boycott de Moscou",
  1984: "boycott de Los Angeles",
  1988: "boycott de Séoul"
};

// Mesures de l'axe vertical. bandeZero : les valeurs nulles vont dans la bande sous l'axe.
const MESURES = {
  efficacite: {
    titre: "Efficacité (1 = moyenne de l’édition)", nom: "l’efficacité",
    valeur: d => d.efficacite, log: false, bandeZero: true,
    quadrants: ["plus efficace", "moins efficace"]
  },
  medailles: {
    titre: "Médailles (échelle log)", nom: "le nombre de médailles",
    valeur: d => d.medailles, log: true, bandeZero: true,
    quadrants: ["plus de médailles", "moins de médailles"]
  },
  delegation: {
    titre: "Délégation (athlètes, échelle log)", nom: "la taille de la délégation",
    valeur: d => d.athletes, log: true, bandeZero: false,
    quadrants: ["plus grande délégation", "plus petite délégation"]
  },
  parHabitant: {
    titre: "Athlètes par million d’habitants (échelle log)", nom: "les athlètes par habitant",
    valeur: d => d.parMillion, log: true, bandeZero: false,
    quadrants: ["plus d’athlètes par habitant", "moins d’athlètes par habitant"]
  }
};

// Grandeurs possibles pour la taille des bulles
const TAILLES = {
  population: { titre: "population (millions d’hab.)", valeur: d => d.pop, format: v => nombre(v / 1e6) },
  athletes: { titre: "athlètes", valeur: d => d.athletes, format: v => nombre(v) },
  medailles: { titre: "médailles", valeur: d => d.medailles, format: v => nombre(v) }
};

// ---------- État de l'interface ----------
const etat = {
  jeux: "olympiques",  // nom du fichier chargé : data/olympiques.csv ou data/paralympiques.csv
  saison: "ete",
  mesure: "efficacite",
  taille: "population",
  annee: null,         // null : dernière édition disponible
  minAthletes: MIN_ATHLETES,
  continents: new Set(CONTINENTS),
  selections: [],      // pays comparés : { cle, nom, couleur }
  tri: { colonne: "medailles", sens: -1 } // tableau des pays
};
let donnees = [];            // lignes du fichier chargé
let annees = [];             // éditions disponibles pour la saison choisie
let nomsRecherche = new Map(); // nom affiché -> clé du pays
let echellesY = {}, echellesTaille = {};

// Clé d'un pays dans la durée : le code ISO réunit RFA et Allemagne, ROC et Russie...
// sauf pour les codes de service, partagés par plusieurs pays
const cle = d => (d.iso3 === "sans_pib" || d.iso3 === "exclu" ? d.pays : d.iso3);
const selectionDe = d => etat.selections.find(s => s.cle === cle(d));
const estSelectionne = d => selectionDe(d) !== undefined;

// ---------- Format des nombres en français (axes et infobulle) ----------
d3.formatDefaultLocale({ decimal: ",", thousands: " ", grouping: [3], currency: ["", " $"] });
const nombre = d3.format(",.0f");
const decimal = d3.format(".2f");
const decimal1 = d3.format(",.1f");
const nomSaison = s => (s === "ete" ? "été" : "hiver");
const nomJeux = () => (etat.jeux === "olympiques" ? "Jeux olympiques" : "Jeux paralympiques");
const boycott = a => (etat.jeux === "olympiques" && etat.saison === "ete" ? BOYCOTTS[a] : undefined);

// ---------- Chargement et indicateurs ----------
// Table code pays (ISO, ou code CIO pour les codes de service) -> continent, commune aux deux fichiers
const tableContinents = d3.csv("../../tables_code_pays/code_continent.csv")
  .then(lignes => new Map(lignes.map(d => [d.code, d.continent])));
let requete = 0; // seule la dernière demande de fichier est affichée


let urlDejaAppliquee = false;
function appliquerParametresUrl() {
  if (urlDejaAppliquee) return;
  urlDejaAppliquee = true;
  const params = new URLSearchParams(window.location.search);
  const sParam = params.get("saison") || params.get("season");
  if (sParam === "hiver" || sParam === "Winter") {
    etat.saison = "hiver";
    d3.selectAll("input[name=saison]").property("checked", function() { return this.value === "hiver"; });
  } else if (sParam === "ete" || sParam === "Summer") {
    etat.saison = "ete";
    d3.selectAll("input[name=saison]").property("checked", function() { return this.value === "ete"; });
  }
  const y = +params.get("year") || +params.get("annee");
  if (y) etat.annee = y;
  const m = params.get("mesure");
  if (m && MESURES[m]) {
    etat.mesure = m;
    d3.selectAll("input[name=mesure]").property("checked", function() { return this.value === m; });
  }
  const c = params.get("country") || params.get("noc") || params.get("iso3");
  if (c) {
    const code = c.toUpperCase();
    const match = donnees.find(d => d.saison === etat.saison && (d.pays === code || d.iso3 === code || d.nom.toLowerCase() === c.toLowerCase()));
    if (match && match.iso3 !== "exclu") {
      const k = cle(match);
      if (!etat.selections.some(s => s.cle === k)) {
        etat.selections.push({ cle: k, nom: match.nom, couleur: COULEURS[0] });
      }
    }
  }
}

function charger() {
  const numero = ++requete;
  Promise.all([d3.csv(`data/${etat.jeux}.csv`, d3.autoType), tableContinents]).then(([lignes, continents]) => {
    if (numero !== requete) return;
    d3.select("#couverture").classed("erreur", false);
    for (const d of lignes) d.continent = continents.get(cle(d));
    donnees = calculerIndicateurs(lignes);
    construireEchelles();
    appliquerParametresUrl();
    majCurseurAnnee();
    majRecherche();
    majLegende();
    dessinerAvecFondu();
    afficherDetail(); // la clé ISO reste valable d'un fichier à l'autre
  }).catch(erreur => {
    d3.select("#couverture").classed("erreur", true).text(
      `Impossible de charger les données (${erreur.message}). ` +
      "Lancez « python main.py » à la racine du projet puis ouvrez http://localhost:8000.");
  });
}

// Efficacité = (médailles / athlètes du pays) / (médailles / athlètes de l'édition, tous pays)
function calculerIndicateurs(lignes) {
  const taux = d3.rollup(lignes,
    v => d3.sum(v, d => d.medailles) / d3.sum(v, d => d.athletes),
    d => d.saison, d => d.annee);
  for (const d of lignes) {
    d.tauxEdition = taux.get(d.saison).get(d.annee);
    d.tauxPays = d.athletes > 0 ? d.medailles / d.athletes : 0;
    d.efficacite = d.tauxPays / d.tauxEdition;
    d.aPib = d.gdppc != null;
    d.parMillion = d.pop ? d.athletes / (d.pop / 1e6) : null;
  }
  return lignes;
}

// Domaines fixes pour toutes les éditions : un pays ne bouge que si ses valeurs changent
function construireEchelles() {
  const basBande = H - M.bas - BANDE_ZERO;
  const max = valeur => d3.max(donnees, valeur);
  nuage.x = d3.scaleLog()
    .domain(d3.extent(donnees.filter(d => d.aPib), d => d.gdppc))
    .range([M.gauche + 10, L - M.droite]);
  trajectoire.x = nuage.x.copy().range([M_TRAJECTOIRE.gauche + 10, L - M.droite]);
  echellesY = {
    efficacite: d3.scaleLinear().domain([0, EFFICACITE_MAX]).range([basBande, M.haut]),
    medailles: d3.scaleLog().domain([1, max(d => d.medailles)]).nice().range([basBande, M.haut]),
    delegation: d3.scaleLog().domain([1, max(d => d.athletes)]).nice().range([H - M.bas, M.haut]),
    parHabitant: d3.scaleLog().domain(d3.extent(donnees, d => d.parMillion)).nice().range([H - M.bas, M.haut])
  };
  for (const [nom, taille] of Object.entries(TAILLES)) {
    echellesTaille[nom] = d3.scaleSqrt().domain([0, max(taille.valeur)]).range([2, 24]);
  }
}

// ---------- Position et taille d'un pays ----------
const mesure = () => MESURES[etat.mesure];
const echelleY = () => echellesY[etat.mesure];
const defini = d => mesure().valeur(d) != null;            // athlètes par habitant : population connue
const dansBandeZero = d => mesure().bandeZero && mesure().valeur(d) === 0;
const horsDomaine = d => mesure().valeur(d) > echelleY().domain()[1];
const rayon = d => {
  const v = TAILLES[etat.taille].valeur(d);
  return v == null ? 3 : echellesTaille[etat.taille](v);    // population inconnue : petit cercle
};

// Nombre entre 0 et 1 tiré du nom : un pays garde sa place d'une édition à l'autre (constance d'objet)
function hachage(texte) {
  let h = 0;
  for (const c of String(texte)) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return h / 1000;
}

// Valeurs nulles (0 médaille) : pas de place sur l'échelle, ces pays sont étalés dans une bande sous l'axe
function positionY(d) {
  if (dansBandeZero(d)) {
    const tirage = hachage([...String(d.pays)].reverse().join("")); // indépendant du tirage en x
    return H - M.bas - BANDE_ZERO + 6 + tirage * (BANDE_ZERO - 12);
  }
  return echelleY()(Math.min(mesure().valeur(d), echelleY().domain()[1]));
}
const positionX = (d, cadre) => (d.aPib ? cadre.x(d.gdppc) : BANDE.debut + hachage(d.pays) * BANDE.largeur);
const position = cadre => d => `translate(${positionX(d, cadre)},${positionY(d)})`;

// ---------- Statistiques : corrélation de rang et tendance ----------
// Rangs moyens (ex aequo partagés), pour la corrélation de Spearman
function rangs(valeurs) {
  const ordre = d3.range(valeurs.length).sort((i, j) => valeurs[i] - valeurs[j]);
  const r = new Array(valeurs.length);
  for (let k = 0; k < ordre.length;) {
    let l = k;
    while (l + 1 < ordre.length && valeurs[ordre[l + 1]] === valeurs[ordre[k]]) l++;
    for (let m = k; m <= l; m++) r[ordre[m]] = (k + l) / 2 + 1;
    k = l + 1;
  }
  return r;
}

function pearson(xs, ys) {
  const mx = d3.mean(xs), my = d3.mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// Pays retenus pour les statistiques d'une édition : filtres appliqués, PIB et mesure connus
const pourStatistiques = (saison, annee) => donnees.filter(d =>
  d.saison === saison && d.annee === annee && d.iso3 !== "exclu" && d.aPib && defini(d) && passeFiltres(d));

// Spearman : ne dépend que de l'ordre, donc insensible aux échelles log et aux valeurs extrêmes
function correlation(lignes) {
  if (lignes.length < MIN_CORRELATION) return null;
  const rho = pearson(rangs(lignes.map(d => d.gdppc)), rangs(lignes.map(d => mesure().valeur(d))));
  return rho == null ? null : { rho, n: lignes.length };
}

function forceLien(rho) {
  const a = Math.abs(rho);
  if (a < 0.1) return "pas de lien";
  return `lien ${rho > 0 ? "positif" : "négatif"} ${a < 0.3 ? "faible" : a < 0.5 ? "modéré" : "fort"}`;
}

// Tendance : moindres carrés dans l'espace du dessin (log du PIB, log de la mesure si échelle log)
function tendance(lignes) {
  const m = mesure();
  const points = lignes.filter(d => !m.log || m.valeur(d) > 0);   // log(0) impossible : 0 médaille exclu
  if (points.length < MIN_CORRELATION) return null;
  const xs = points.map(d => Math.log10(d.gdppc));
  const ys = points.map(d => (m.log ? Math.log10(m.valeur(d)) : m.valeur(d)));
  const mx = d3.mean(xs), my = d3.mean(ys);
  const pente = d3.sum(xs, (x, i) => (x - mx) * (ys[i] - my)) / d3.sum(xs, x => (x - mx) ** 2);
  const y = x => my + pente * (x - mx);
  const retour = v => (m.log ? 10 ** v : v);
  return d3.extent(xs).map(x => [10 ** x, retour(y(x))]);
}

// ---------- Cadres SVG (le nuage et la trajectoire partagent les axes) ----------
function creerCadre(selecteur, marge) {
  const svg = d3.select(selecteur).attr("viewBox", [0, 0, L, H]);
  const cadre = { svg, marge };
  cadre.bandeZero = svg.append("g").attr("class", "bande-zero");
  cadre.bandeZero.append("rect").attr("class", "bande")
    .attr("x", marge.gauche).attr("y", H - M.bas - BANDE_ZERO)
    .attr("width", L - marge.droite - marge.gauche).attr("height", BANDE_ZERO);
  cadre.bandeZero.append("text").attr("class", "titre-bande")
    .attr("x", L - marge.droite - 5).attr("y", H - M.bas - BANDE_ZERO + 12).attr("text-anchor", "end")
    .text("0 médaille");
  cadre.axeX = svg.append("g").attr("transform", `translate(0,${H - M.bas})`);
  cadre.axeY = svg.append("g").attr("transform", `translate(${marge.gauche},0)`);
  svg.append("text").attr("class", "titre-axe")
    .attr("x", L - marge.droite).attr("y", H - 10).attr("text-anchor", "end")
    .text("PIB par habitant (dollars PPA 2011, échelle log)");
  cadre.titreY = svg.append("text").attr("class", "titre-axe")
    .attr("transform", `translate(14,${M.haut}) rotate(-90)`).attr("text-anchor", "end");
  cadre.seuilY = svg.append("line").attr("class", "seuil");
  return cadre;
}

function majAxes(cadre, t) {
  const axe = mesure().log ? d3.axisLeft(echelleY()).ticks(6, "~g") : d3.axisLeft(echelleY()).ticks(6);
  cadre.axeX.transition(t).call(d3.axisBottom(cadre.x).ticks(6, "~s"));
  cadre.axeY.transition(t).call(axe);
  cadre.titreY.text(mesure().titre);
  cadre.bandeZero.style("display", mesure().bandeZero ? null : "none");
}

const nuage = creerCadre("#nuage", M);
nuage.svg.insert("rect", ":first-child").attr("class", "bande")
  .attr("x", BANDE.debut - 8).attr("y", M.haut)
  .attr("width", BANDE.largeur + 16).attr("height", H - M.haut - M.bas);
nuage.svg.append("text").attr("class", "titre-bande")
  .attr("x", BANDE.debut + BANDE.largeur / 2).attr("y", H - M.bas + 18)
  .attr("text-anchor", "middle").text("PIB inconnu");
nuage.seuilX = nuage.svg.append("line").attr("class", "seuil")
  .attr("y1", M.haut).attr("y2", H - M.bas);
nuage.quadrants = nuage.svg.append("g").attr("class", "quadrants");
nuage.tendance = nuage.svg.append("line").attr("class", "tendance");
nuage.points = nuage.svg.append("g");

const trajectoire = creerCadre("#trajectoire", M_TRAJECTOIRE);
trajectoire.fond = trajectoire.svg.insert("g", ":first-child"); // l'année en grand, sous les axes
trajectoire.anneeFond = trajectoire.fond.append("text").attr("class", "annee-fond")
  .attr("x", L / 2).attr("y", H / 2 + 40).attr("text-anchor", "middle");
trajectoire.etatFond = trajectoire.fond.append("text").attr("class", "etat-fond")
  .attr("x", L / 2).attr("y", H / 2 + 80).attr("text-anchor", "middle");

// ---------- Vue d'ensemble : le nuage ----------
const passeFiltres = d =>
  d.athletes >= etat.minAthletes && (d.continent === undefined || etat.continents.has(d.continent));

function dessiner(duree) {
  const t = d3.transition().duration(duree);
  const edition = donnees.filter(d => d.saison === etat.saison && d.annee === etat.annee);
  const pays = edition.filter(d => d.iso3 !== "exclu");          // réfugiés, neutres : hors visu
  const visibles = pays.filter(d => defini(d) && (passeFiltres(d) || estSelectionne(d))); // comparés : toujours

  // Seuils des quadrants, calculés sur tous les pays de l'édition (les filtres ne les changent pas)
  const medianePib = d3.median(pays.filter(d => d.aPib), d => d.gdppc);
  const seuilY = etat.mesure === "efficacite" ? 1 : d3.median(pays.filter(defini), mesure().valeur);
  const seuilYTrace = seuilY > 0 || !mesure().log;               // médiane à 0 : pas de place en log

  majAxes(nuage, t);
  nuage.seuilX.style("display", medianePib == null ? "none" : null);
  if (medianePib != null) {
    nuage.seuilX.transition(t).attr("x1", nuage.x(medianePib)).attr("x2", nuage.x(medianePib));
  }
  nuage.seuilY.style("display", seuilYTrace ? null : "none");
  if (seuilYTrace) {
    nuage.seuilY.transition(t)
      .attr("x1", M.gauche).attr("x2", L - M.droite)
      .attr("y1", echelleY()(seuilY)).attr("y2", echelleY()(seuilY));
  }
  ecrireQuadrants();
  ecrireCouverture(pays, visibles);
  dessinerTendance(t);

  nuage.points.selectAll(".point")
    .data(visibles, d => d.pays)                                  // clé = pays : constance d'objet
    .join(
      entree => {
        const g = entree.append("g").attr("class", "point")
          .attr("tabindex", 0).attr("role", "button")
          .attr("transform", position(nuage)).style("opacity", 0);
        g.append("circle");
        g.append("path").attr("class", "triangle").attr("d", d3.symbol(d3.symbolTriangle, 50));
        return g;
      },
      maj => maj,
      sortie => sortie.transition(t).style("opacity", 0).remove()
    )
    .sort((a, b) => rayon(b) - rayon(a))                         // petits cercles devant
    .classed("sans-pib", d => !d.aPib)
    .classed("selectionne", estSelectionne)
    .attr("aria-label", description)
    .attr("aria-pressed", estSelectionne)
    .on("mouseenter focus", afficherInfobulle)
    .on("mousemove", deplacerInfobulle)
    .on("mouseleave blur", cacherInfobulle)
    .on("click", (e, d) => basculerSelection(cle(d), d.nom))
    .on("keydown", (e, d) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        basculerSelection(cle(d), d.nom);
      }
    })
    .call(g => g.transition(t).attr("transform", position(nuage)).style("opacity", 1))
    .call(g => g.select("circle")
      .style("fill", d => (estSelectionne(d) && d.aPib ? selectionDe(d).couleur : null))
      .style("stroke", d => (estSelectionne(d) && !d.aPib ? selectionDe(d).couleur : null))
      .transition(t).attr("r", d => (estSelectionne(d) ? Math.max(rayon(d), 5) : rayon(d)))) // comparés : visibles
    .call(g => g.select(".triangle")
      .attr("display", d => (horsDomaine(d) ? null : "none"))
      .attr("transform", d => `translate(0,${-rayon(d) - 6})`));

  nuage.points.selectAll(".selectionne").raise();
  majEvolution();
  majTableau(visibles);
}

// Olympiques/Paralympiques et été/hiver : fondu, pas de glissement (compétitions différentes)
function dessinerAvecFondu() {
  nuage.points.transition().duration(DUREE_FONDU).style("opacity", 0).on("end", () => {
    nuage.points.selectAll(".point").remove();
    dessiner(0);
    nuage.points.transition().duration(DUREE_FONDU).style("opacity", 1);
  });
}

function ecrireQuadrants() {
  const [haut, bas] = mesure().quadrants;
  const gauche = M.gauche + 15, droite = L - M.droite - 5;
  const yBas = mesure().bandeZero ? H - M.bas - BANDE_ZERO - 6 : H - M.bas - 8; // au-dessus de la bande 0
  const coins = [
    { texte: `moins riche, ${haut}`, x: gauche, y: M.haut + 14, ancre: "start" },
    { texte: `plus riche, ${haut}`, x: droite, y: M.haut + 14, ancre: "end" },
    { texte: `moins riche, ${bas}`, x: gauche, y: yBas, ancre: "start" },
    { texte: `plus riche, ${bas}`, x: droite, y: yBas, ancre: "end" }
  ];
  nuage.quadrants.selectAll("text").data(coins).join("text")
    .attr("x", d => d.x).attr("y", d => d.y).attr("text-anchor", d => d.ancre)
    .text(d => d.texte);
}

// Taux de couverture (T9) : part de l'édition qui appartient à des pays avec PIB
function ecrireCouverture(pays, visibles) {
  const avecPib = pays.filter(d => d.aPib);
  const part = cle => Math.round(100 * d3.sum(avecPib, d => d[cle]) / d3.sum(pays, d => d[cle]));
  const nonPlaces = pays.filter(d => !defini(d)).length;
  const masques = pays.length - visibles.length - nonPlaces;
  const totalAthletes = d3.sum(visibles, d => d.athletes);
  const sCible = etat.saison === "hiver" ? "Winter" : "Summer";
  const peutLier = etat.jeux === "olympiques" && etat.annee <= 2016;
  const lienGeo = peutLier
    ? wikiLinkHtml({
        href: `../geographie/index.html?season=${sCible}&year=${etat.annee}`,
        text: `${visibles.length} pays affichés`,
        eyebrow: "La carte des groupes sportifs",
        title: `Géographie des délégations · ${etat.annee}`,
        body: `Explorer la répartition mondiale des ${nombre(totalAthletes)} athlètes engagés en ${etat.annee} par discipline.`,
        metrics: [["Pays affichés", `${visibles.length} nations`], ["Athlètes engagés", `${nombre(totalAthletes)} athlètes`]]
      })
    : `${visibles.length} pays affichés`;
  const lienAnat = peutLier
    ? wikiLinkHtml({
        href: `../anatomie/index.html?season=${sCible}&year=${etat.annee}`,
        text: `${part("athletes")} % des athlètes de l’édition`,
        eyebrow: "L’anatomie de l’élite",
        title: `Profils morphologiques · ${etat.annee}`,
        body: `Comparer l’âge, la taille et le poids médians des athlètes par discipline lors des Jeux de ${etat.annee}.`,
        metrics: [["Édition", `${etat.annee}`], ["Couverture PIB", `${part("athletes")} % des athlètes`]]
      })
    : `${part("athletes")} % des athlètes de l’édition`;

  d3.select("#couverture").html(
    `${lienGeo}` +
    (masques > 0 ? ` (${masques} masqués par les filtres)` : "") +
    (nonPlaces ? `, ${nonPlaces} sans population connue non placés` : "") +
    `. Les pays au PIB connu représentent ${part("medailles")} % des médailles ` +
    `et ${lienAnat}.` +
    (etat.jeux === "paralympiques"
      ? " Source paralympique : seuls les pays médaillés sont recensés, la moyenne de l’édition est donc surestimée."
      : ""));
  bindWikiPreviews(document.querySelector("#couverture"));
}

// Droite de tendance et corrélation de l'édition affichée (Correlate)
function dessinerTendance(t) {
  const lignes = pourStatistiques(etat.saison, etat.annee);
  const c = correlation(lignes);
  const droite = tendance(lignes);
  const y = echelleY().copy().clamp(true);
  nuage.tendance.style("display", droite ? null : "none");
  if (droite) {
    nuage.tendance.transition(t)
      .attr("x1", nuage.x(droite[0][0])).attr("y1", y(droite[0][1]))
      .attr("x2", nuage.x(droite[1][0])).attr("y2", y(droite[1][1]));
  }
  d3.select("#correlation").text(c
    ? `${etat.annee} : corrélation de rang entre richesse et ${mesure().nom} ρ = ${decimal(c.rho)} ` +
      `(${forceLien(c.rho)}), sur ${c.n} pays au PIB connu.` +
      (mesure().log && mesure().bandeZero ? " La tendance ignore les pays sans médaille, la corrélation non." : "")
    : `${etat.annee} : trop peu de pays au PIB connu pour mesurer un lien.`);
}

// ---------- Synthèse : le lien richesse-mesure au fil des éditions (Summarize) ----------
const evolution = { svg: d3.select("#evolution").attr("viewBox", [0, 0, L, H_EVOLUTION]) };
evolution.y = d3.scaleLinear().domain([-1, 1])
  .range([H_EVOLUTION - M_EVOLUTION.bas, M_EVOLUTION.haut]);
evolution.grille = evolution.svg.append("g").attr("class", "grille");
evolution.axeX = evolution.svg.append("g")
  .attr("transform", `translate(0,${H_EVOLUTION - M_EVOLUTION.bas})`);
evolution.svg.append("g").attr("transform", `translate(${M_EVOLUTION.gauche},0)`)
  .call(d3.axisLeft(evolution.y).tickValues([-1, -0.5, 0, 0.5, 1]).tickFormat(d3.format("~g")));
evolution.svg.append("text").attr("class", "titre-axe")
  .attr("transform", `translate(14,${M_EVOLUTION.haut}) rotate(-90)`).attr("text-anchor", "end")
  .text("ρ de Spearman");
evolution.grille.selectAll("line").data([-0.5, 0, 0.5]).join("line")
  .attr("class", d => (d === 0 ? "zero" : null))
  .attr("x1", M_EVOLUTION.gauche).attr("x2", L - M_EVOLUTION.droite)
  .attr("y1", evolution.y).attr("y2", evolution.y);
evolution.ligne = evolution.svg.append("path").attr("class", "ligne-evolution");
evolution.points = evolution.svg.append("g");

function majEvolution() {
  const serie = annees
    .map(annee => ({ annee, ...correlation(pourStatistiques(etat.saison, annee)) }))
    .filter(d => d.rho != null);
  const x = d3.scaleLinear().domain(d3.extent(annees))
    .range([M_EVOLUTION.gauche + 15, L - M_EVOLUTION.droite - 15]);
  evolution.axeX.call(d3.axisBottom(x).tickValues(annees).tickFormat(d3.format("d")));
  evolution.ligne.attr("d", d3.line().x(d => x(d.annee)).y(d => evolution.y(d.rho))(serie));
  evolution.points.selectAll("circle").data(serie, d => d.annee).join("circle")
    .attr("cx", d => x(d.annee)).attr("cy", d => evolution.y(d.rho))
    .attr("r", d => (d.annee === etat.annee ? 7 : 5))
    .classed("courante", d => d.annee === etat.annee)
    .attr("tabindex", 0).attr("role", "button")
    .attr("aria-label", d => `${d.annee} : rho ${decimal(d.rho)}, ${forceLien(d.rho)}`)
    .on("mouseenter focus", (e, d) => afficherTexteInfobulle(e,
      `<strong>${d.annee}</strong><br>ρ = ${decimal(d.rho)} (${forceLien(d.rho)})<br>${d.n} pays`))
    .on("mousemove", deplacerInfobulle)
    .on("mouseleave blur", cacherInfobulle)
    .on("click", (e, d) => { arreterLecture(); changerAnnee(d.annee); })
    .on("keydown", (e, d) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        arreterLecture();
        changerAnnee(d.annee);
      }
    });
  d3.select("#evolution-titre").text(
    `Le lien entre richesse et ${mesure().nom}, édition par édition (${nomJeux()} d’${nomSaison(etat.saison)})`);
}

// ---------- Tableau des pays affichés (Find Extremes, alternative accessible au nuage) ----------
const COLONNES_TABLEAU = [
  { id: "nom", titre: "Pays", valeur: d => d.nom, texte: d => d.nom },
  { id: "continent", titre: "Continent", valeur: d => d.continent, texte: d => d.continent ?? "–" },
  { id: "gdppc", titre: "PIB/hab ($)", valeur: d => d.gdppc, texte: d => (d.aPib ? nombre(d.gdppc) : "–"), nombre: true },
  { id: "pop", titre: "Population (M)", valeur: d => d.pop, texte: d => (d.pop != null ? decimal1(d.pop / 1e6) : "–"), nombre: true },
  { id: "athletes", titre: "Athlètes", valeur: d => d.athletes, texte: d => nombre(d.athletes), nombre: true },
  { id: "medailles", titre: "Médailles", valeur: d => d.medailles, texte: d => nombre(d.medailles), nombre: true },
  { id: "efficacite", titre: "Efficacité", valeur: d => d.efficacite, texte: d => decimal(d.efficacite), nombre: true },
  { id: "parMillion", titre: "Athlètes / M hab.", valeur: d => d.parMillion, texte: d => (d.parMillion != null ? decimal(d.parMillion) : "–"), nombre: true }
];
let lignesTableau = [];

d3.select("#tableau thead tr").selectAll("th").data(COLONNES_TABLEAU).join("th")
  .attr("scope", "col").classed("nombre", c => c.nombre)
  .append("button").attr("type", "button").text(c => c.titre)
  .on("click", (e, c) => {
    etat.tri = { colonne: c.id, sens: etat.tri.colonne === c.id ? -etat.tri.sens : (c.nombre ? -1 : 1) };
    majTableau(lignesTableau);
  });

function majTableau(lignes) {
  lignesTableau = lignes;
  const colonne = COLONNES_TABLEAU.find(c => c.id === etat.tri.colonne);
  const triees = [...lignes].sort((a, b) => {
    const va = colonne.valeur(a), vb = colonne.valeur(b);
    if (va == null) return 1;                                   // valeurs inconnues en bas
    if (vb == null) return -1;
    return etat.tri.sens * (colonne.nombre ? va - vb : String(va).localeCompare(vb, "fr"));
  });
  d3.selectAll("#tableau th").attr("aria-sort", c =>
    c.id === etat.tri.colonne ? (etat.tri.sens > 0 ? "ascending" : "descending") : null);
  d3.select("#tableau-titre").text(
    `Tableau des ${lignes.length} pays affichés, ${nomJeux()} d’${nomSaison(etat.saison)} ${etat.annee}`);
  d3.select("#tableau tbody").selectAll("tr").data(triees, d => d.pays).join(entree => {
    const tr = entree.append("tr");
    tr.selectAll("td").data(COLONNES_TABLEAU).join("td").classed("nombre", c => c.nombre);
    return tr;
  })
    .order()
    .classed("selectionne", estSelectionne)
    .each(function (d) {
      d3.select(this).selectAll("td").data(COLONNES_TABLEAU).each(function (c) {
        const td = d3.select(this);
        if (c.id === "athletes" && etat.jeux === "olympiques" && d.annee <= 2016) {
          const sCible = etat.saison === "hiver" ? "Winter" : "Summer";
          return td.html(wikiLinkHtml({
            href: `../geographie/index.html?season=${sCible}&year=${d.annee}&noc=${d.pays}`,
            text: c.texte(d),
            eyebrow: "La carte des groupes sportifs",
            title: `${d.nom} · ${d.annee}`,
            body: `Voir la répartition par sport des ${c.texte(d)} athlètes de ${d.nom} sur la carte mondiale.`,
            metrics: [["Délégation", `${c.texte(d)} athlètes`], ["Médailles", `${nombre(d.medailles)}`]]
          }));
        }
        if (c.id !== "nom") return td.text(c.texte(d));
        // Nom cliquable : ajoute ou retire le pays de la comparaison
        td.html("");
        if (estSelectionne(d)) td.append("span").attr("class", "pastille").style("background", selectionDe(d).couleur);
        td.append("button").attr("type", "button").attr("class", "lien").text(d.nom)
          .attr("aria-pressed", estSelectionne(d))
          .on("click", () => basculerSelection(cle(d), d.nom));
      });
    });
  bindWikiPreviews(document.querySelector('#tableau'));
}

// ---------- Légende ----------
function majLegende() {
  const taille = TAILLES[etat.taille], echelle = echellesTaille[etat.taille];
  const max = echelle.domain()[1];
  const valeurs = [...new Set([max / 50, max / 5, max].map(v => Math.max(1, +v.toPrecision(1))))];
  const rayons = valeurs.map(echelle);
  const rMax = d3.max(rayons);
  const legende = d3.select("#legende").html("");

  // Tailles : cercles alignés par le bas, valeur dessous
  const tailles = legende.append("span").attr("class", "item");
  tailles.append("span").text(`Taille : ${taille.titre}`);
  const svgTailles = tailles.append("svg")
    .attr("width", d3.sum(rayons, r => 2 * r + 18)).attr("height", 2 * rMax + 14);
  let decalage = 0;
  valeurs.forEach((v, i) => {
    const r = rayons[i];
    const g = svgTailles.append("g").attr("transform", `translate(${decalage + r + 9},0)`);
    g.append("circle").attr("class", "legende-cercle").attr("cy", 2 * rMax - r).attr("r", r);
    g.append("text").attr("y", 2 * rMax + 12).attr("text-anchor", "middle").text(taille.format(v));
    decalage += 2 * r + 18;
  });

  const symbole = (texte, dessin) => {
    const item = legende.append("span").attr("class", "item");
    dessin(item.append("svg").attr("width", 22).attr("height", 18));
    item.append("span").text(texte);
  };
  symbole("PIB inconnu", s => s.append("circle").attr("class", "legende-vide")
    .attr("cx", 11).attr("cy", 9).attr("r", 6));
  if (etat.mesure === "efficacite") {
    symbole(`efficacité > ${EFFICACITE_MAX} (hors échelle)`, s => s.append("path").attr("class", "triangle")
      .attr("transform", "translate(11,9)").attr("d", d3.symbol(d3.symbolTriangle, 50)));
  }
  symbole(etat.mesure === "efficacite" ? "PIB médian, efficacité moyenne" : "médianes de l’édition",
    s => s.append("line").attr("class", "seuil").attr("x1", 0).attr("x2", 22).attr("y1", 9).attr("y2", 9));
  symbole("tendance", s => s.append("line").attr("class", "tendance")
    .attr("x1", 0).attr("x2", 22).attr("y1", 14).attr("y2", 4));
}

// ---------- Infobulle (T3) ----------
const infobulle = d3.select("#infobulle");

const description = d =>
  `${d.nom} : ${d.athletes} athlètes, ${d.medailles} médailles, ` +
  `PIB par habitant ${d.aPib ? nombre(d.gdppc) + " $" : "inconnu"}`;

function afficherInfobulle(event, d) {
  afficherTexteInfobulle(event,
    `<strong>${d.nom}</strong>, ${nomJeux()} d’${nomSaison(d.saison)} ${d.annee}<br>` +
    `Continent : ${d.continent ?? "inconnu"}<br>` +
    `PIB/hab : ${d.aPib ? nombre(d.gdppc) + " $ (PPA 2011)" : "inconnu"}<br>` +
    `Population : ${d.pop != null ? decimal1(d.pop / 1e6) + " M d’hab." : "inconnue"}<br>` +
    `Athlètes : ${d.athletes}` +
    (d.parMillion != null ? ` (${decimal(d.parMillion)} par million d’hab.)` : "") + "<br>" +
    `Médailles : ${d.medailles} (${decimal(d.tauxPays)} par athlète, ` +
    `moyenne de l’édition : ${decimal(d.tauxEdition)})<br>` +
    `Efficacité : ${decimal(d.efficacite)} × la moyenne`);
}

function afficherTexteInfobulle(event, html) {
  infobulle.style("display", "block").html(html);
  deplacerInfobulle(event);
}

// Suit la souris, ou se cale sur l'élément au clavier ; bascule de côté près des bords
function deplacerInfobulle(event) {
  let px = event.pageX, py = event.pageY;
  if (px == null) {
    const r = event.currentTarget.getBoundingClientRect();
    px = r.right + window.scrollX;
    py = r.top + window.scrollY;
  }
  const n = infobulle.node();
  let gauche = px + 12, haut = py + 12;
  if (gauche + n.offsetWidth > window.scrollX + document.documentElement.clientWidth) {
    gauche = px - n.offsetWidth - 12;
  }
  if (haut + n.offsetHeight > window.scrollY + window.innerHeight) haut = py - n.offsetHeight - 12;
  infobulle.style("left", `${Math.max(0, gauche)}px`).style("top", `${Math.max(0, haut)}px`);
}
function cacherInfobulle() {
  infobulle.style("display", "none");
}

// ---------- Comparaison : jusqu'à 5 pays ----------
function basculerSelection(cleChoisie, nom) {
  if (etat.selections.some(s => s.cle === cleChoisie)) retirer(cleChoisie);
  else ajouter(cleChoisie, nom);
}

function ajouter(cleChoisie, nom) {
  if (etat.selections.some(s => s.cle === cleChoisie)) return;
  if (etat.selections.length >= MAX_COMPARAISON) {
    signaler(`${MAX_COMPARAISON} pays au plus : retirez-en un pour en ajouter un autre.`);
    return;
  }
  // Premier emplacement de couleur libre : les pays déjà choisis gardent la leur
  const couleur = COULEURS.find(c => !etat.selections.some(s => s.couleur === c));
  etat.selections.push({ cle: cleChoisie, nom, couleur });
  apresSelection();
}

function retirer(cleChoisie) {
  etat.selections = etat.selections.filter(s => s.cle !== cleChoisie);
  apresSelection();
}

function toutEffacer() {
  if (!etat.selections.length) return;
  etat.selections = [];
  apresSelection();
}

function apresSelection() {
  signaler("");
  dessiner(DUREE_FILTRE); // les pays comparés restent affichés même hors filtres
  afficherDetail();
}

let minuteurMessage = null;
function signaler(texte) {
  clearTimeout(minuteurMessage);
  d3.select("#comparaison .message").text(texte);
  if (texte) minuteurMessage = setTimeout(() => signaler(""), 4000);
}

// Pastilles des pays comparés, chacune avec son bouton de retrait
function majComparaison() {
  const zone = d3.select("#comparaison");
  zone.select(".aide").text(etat.selections.length
    ? `Comparaison (${etat.selections.length}/${MAX_COMPARAISON}) :`
    : `Cliquez sur des pays (${MAX_COMPARAISON} au plus) pour comparer leurs trajectoires.`);
  zone.select(".puces").selectAll(".puce")
    .data(etat.selections, s => s.cle)
    .join(entree => {
      const puce = entree.append("span").attr("class", "puce");
      puce.append("span").attr("class", "pastille").style("background", s => s.couleur);
      puce.append("span").attr("class", "nom");
      puce.append("button").attr("type", "button").attr("class", "retirer").text("✕")
        .attr("aria-label", s => `Retirer ${s.nom}`)
        .on("click", (e, s) => retirer(s.cle));
      return puce;
    })
    .call(puce => puce.select(".nom").text(s => s.nom));
  zone.select("#tout-effacer").style("display", etat.selections.length ? null : "none");
}

// ---------- Vue détail : trajectoires des pays comparés (T6) ----------
let minuteur = null;

// Toutes les éditions de la saison, y compris celles où le pays est absent
function serieDuPays(cleChoisie) {
  const parAnnee = d3.group(
    donnees.filter(d => d.saison === etat.saison && cle(d) === cleChoisie), d => d.annee);
  return annees.map(annee => (parAnnee.has(annee)
    ? d3.greatest(parAnnee.get(annee), d => d.athletes)
    : { annee, absent: true }));
}

// « 1960–1972, 1984 » : éditions consécutives regroupées
function plages(liste) {
  const groupes = [];
  for (const a of liste) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && annees.indexOf(a) === annees.indexOf(dernier[1]) + 1) dernier[1] = a;
    else groupes.push([a, a]);
  }
  return groupes.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(", ");
}

// Noms successifs d'un même pays : « West Germany (1968–1988), Germany (1992–2020)... »
function appellations(presentes) {
  const groupes = [];
  for (const d of presentes) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.nom === d.nom) dernier.annees.push(d.annee);
    else groupes.push({ nom: d.nom, annees: [d.annee] });
  }
  return groupes.length > 1 ? groupes.map(g => `${g.nom} (${plages(g.annees)})`) : [];
}

// Résumé d'un pays sous le titre de la vue détail (avec liens contextuels façon Wikipédia)
function resume({ selection, serie, presentes, tracables }) {
  if (!presentes.length) return "aucune donnée dans ces Jeux.";
  const infos = [];
  const noms = appellations(presentes);
  if (noms.length) infos.push(`réunit ${noms.join(", ")}.`);
  infos.push(`${tracables.length} éditions sur ${presentes.length} avec un PIB connu.`);
  const [premiere, derniere] = d3.extent(presentes, d => d.annee);
  if (premiere > annees[0]) infos.push(`Première participation : ${premiere}.`);
  if (derniere < annees[annees.length - 1]) infos.push(`Dernière participation : ${derniere}.`);
  const absences = serie.filter(d => d.absent && d.annee > premiere && d.annee < derniere).map(d => d.annee);
  if (absences.length) infos.push(`Absent : ${plages(absences)}.`);
  const boycotts = absences.filter(boycott).map(a => `${a} (${boycott(a)})`);
  if (boycotts.length) infos.push(`Années de boycott parmi ces absences : ${boycotts.join(", ")}.`);

  if (etat.jeux === "olympiques") {
    const sCible = etat.saison === "hiver" ? "Winter" : "Summer";
    const cibleAnnee = Math.min(etat.annee, 2016);
    const courant = presentes.find(d => d.annee === cibleAnnee) || presentes[presentes.length - 1];
    if (courant && courant.annee <= 2016) {
      const geoLien = wikiLinkHtml({
        href: `../geographie/index.html?season=${sCible}&year=${courant.annee}&noc=${courant.pays}`,
        text: `${nombre(courant.athletes)} athlètes en ${courant.annee}`,
        eyebrow: "La carte des groupes sportifs",
        title: `Délégation de ${selection.nom} (${courant.annee})`,
        body: `Explorer la répartition par discipline sportive des ${nombre(courant.athletes)} athlètes de ${selection.nom}.`,
        metrics: [
          ["Athlètes engagés", `${nombre(courant.athletes)}`],
          ["Médailles obtenues", `${nombre(courant.medailles)}`],
          ["Efficacité", `${decimal(courant.efficacite)} × la moyenne`]
        ]
      });
      infos.push(`Délégation : ${geoLien}.`);
    }
    const accueils = getHostsByNocOrIso(selection.cle, sCible);
    if (accueils.length) {
      const liensHote = accueils.map(h => wikiLinkHtml({
        href: `../domicile/index.html?season=${sCible}&year=${h.year}`,
        text: `${h.city} ${h.year}`,
        eyebrow: "Avantage à domicile",
        title: `${h.country} · ${h.city} ${h.year}`,
        body: `Observer l’effet pays hôte sur la délégation et les médailles de ${h.country} autour de ${h.year}.`,
        metrics: [["Ville hôte", h.city], ["Année T", `${h.year}`]]
      })).join(", ");
      infos.push(`Pays hôte : ${liensHote}.`);
    }
  }

  if (!tracables.length) {
    infos.push("Sans PIB connu, pas de trajectoire. Efficacité par édition : " +
      presentes.map(d => `${d.annee} : ${decimal(d.efficacite)}`).join(" ; ") + ".");
  }
  return infos.join(" ");
}

function afficherDetail() {
  if (minuteur) minuteur.stop();
  majComparaison();
  trajectoire.svg.selectAll(".dessin").remove();
  trajectoire.anneeFond.text("");
  trajectoire.etatFond.text("");
  d3.select("#detail").property("hidden", !etat.selections.length);
  if (!etat.selections.length) return;

  const ligne = d3.line().defined(d => !d.absent && d.aPib && defini(d)) // trou si absent ou sans PIB
    .x(d => trajectoire.x(d.gdppc)).y(positionY);
  const relier = d3.line().x(ligne.x()).y(ligne.y());         // enjambe les trous, en pointillés
  const pays = etat.selections.map(s => {
    const serie = serieDuPays(s.cle);
    const presentes = serie.filter(d => !d.absent);
    if (presentes.length) s.nom = presentes[presentes.length - 1].nom;
    return { selection: s, serie, presentes, tracables: serie.filter(ligne.defined()) };
  });
  majComparaison(); // noms mis à jour

  d3.select("#detail-titre").text(
    `${pays.length > 1 ? "Comparaison" : pays[0].selection.nom}, ${nomJeux()} d’${nomSaison(etat.saison)}`);
  d3.select("#detail-info").selectAll("li")
    .data(pays)
    .join(entree => {
      const li = entree.append("li");
      li.append("span").attr("class", "pastille");
      li.append("strong");
      li.append("span").attr("class", "texte");
      return li;
    })
    .call(li => li.select(".pastille").style("background", p => p.selection.couleur))
    .call(li => li.select("strong").text(p => `${p.selection.nom} : `))
    .call(li => li.select(".texte").html(resume));
  bindWikiPreviews(document.querySelector("#detail-info"));

  // Pointillés seulement si un trou tombe entre deux éditions tracées
  const aDesTrous = pays.some(p => p.tracables.length > 1 &&
    p.serie.indexOf(p.tracables[p.tracables.length - 1]) - p.serie.indexOf(p.tracables[0]) + 1 > p.tracables.length);
  d3.select("#detail-note").text(aDesTrous ? "Pointillés : éditions manquantes (absence ou PIB inconnu)." : "");

  const avecTrace = pays.filter(p => p.tracables.length);
  trajectoire.svg.style("display", avecTrace.length ? null : "none");
  d3.select("#rejouer").style("display", avecTrace.length ? null : "none");
  if (!avecTrace.length) return;

  majAxes(trajectoire, d3.transition().duration(0));
  trajectoire.seuilY
    .attr("x1", M_TRAJECTOIRE.gauche).attr("x2", L - M.droite)
    .attr("y1", echellesY.efficacite(1)).attr("y2", echellesY.efficacite(1))
    .style("display", etat.mesure === "efficacite" ? null : "none");

  // Un groupe par pays ; sa couleur passe aux tracés par currentColor (voir styles.css)
  const dessin = trajectoire.svg.append("g").attr("class", "dessin");
  const traces = dessin.selectAll(".pays-trace").data(avecTrace).join("g")
    .attr("class", "pays-trace").style("color", p => p.selection.couleur);
  traces.append("path").attr("class", "trace-lacunes");
  traces.append("path").attr("class", "trace");
  traces.append("circle").attr("class", "point-courant").attr("r", 6).style("display", "none");

  // Les points avancent ensemble d'une édition par pas en laissant une trace
  let i = 0;
  minuteur = d3.interval(() => {
    trajectoire.anneeFond.text(annees[i]);
    const seul = avecTrace.length === 1 ? avecTrace[0].serie[i] : null;
    trajectoire.etatFond.text(!seul ? "" : seul.absent ? "absent" : seul.aPib ? "" : "PIB inconnu");
    traces.each(function (p) {
      const g = d3.select(this), d = p.serie[i], vues = p.serie.slice(0, i + 1);
      g.select(".trace").attr("d", ligne(vues));
      g.select(".trace-lacunes").attr("d", relier(vues.filter(ligne.defined())));
      const point = g.select(".point-courant");
      if (ligne.defined()(d)) {
        point.style("display", null).classed("en-suspens", false)
          .attr("cx", trajectoire.x(d.gdppc)).attr("cy", positionY(d));
      } else {
        point.classed("en-suspens", true); // reste à la dernière position connue, évidé
      }
    });
    i++;
    if (i === annees.length) {
      minuteur.stop();
      terminerTrajectoire(traces);
    }
  }, PAS_ANIMATION);
}

// Image finale : traces complètes et années étiquetées, pour l'analyse sur image fixe
function terminerTrajectoire(traces) {
  trajectoire.anneeFond.text("");
  trajectoire.etatFond.text("");
  traces.select(".point-courant").remove();
  const etapes = traces.selectAll(".etape").data(p => p.tracables).join("g")
    .attr("class", "etape").attr("transform", position(trajectoire))
    .on("mouseenter", afficherInfobulle)
    .on("mousemove", deplacerInfobulle)
    .on("mouseleave", cacherInfobulle);
  etapes.append("circle").attr("r", 3.5);

  // Étiquettes sans chevauchement (ni entre elles, ni sur les points) : dernière puis première
  // édition de chaque pays, puis les autres si la place est libre. En comparaison, seules la
  // première et la dernière sont candidates, et la dernière porte aussi le nom du pays.
  const plusieurs = traces.size() > 1;
  const derniers = traces.data().map(p => p.tracables[p.tracables.length - 1]);
  const premiers = traces.data().map(p => p.tracables[0]);
  const ordre = new Set([...derniers, ...premiers, ...(plusieurs ? [] : etapes.data())]);
  const texte = d => (plusieurs && derniers.includes(d) ? `${d.nom} ${d.annee}` : String(d.annee));
  const prises = etapes.data().map(d => {
    const px = trajectoire.x(d.gdppc), py = positionY(d);
    return { x0: px - 3, x1: px + 3, y0: py - 3, y1: py + 3 }; // l'étiquette du point commence à 5 px
  });
  const libre = b => prises.every(p => b.x1 < p.x0 || b.x0 > p.x1 || b.y1 < p.y0 || b.y0 > p.y1);
  const aGauche = new Map(); // étiquette retenue -> placée à gauche du point ?
  for (const d of ordre) {
    const px = trajectoire.x(d.gdppc), py = positionY(d);
    const largeur = texte(d).length * 6 + 4;
    const boites = [
      { gauche: false, x0: px + 5, x1: px + 5 + largeur, y0: py - 16, y1: py - 3 },
      { gauche: true, x0: px - 5 - largeur, x1: px - 5, y0: py - 16, y1: py - 3 }
    ].filter(b => b.x1 <= L - 5 && b.x0 >= trajectoire.marge.gauche);  // à droite d'abord, sans déborder
    const boite = boites.find(libre);
    if (boite) {
      prises.push(boite);
      aGauche.set(d, boite.gauche);
    }
  }
  etapes.filter(d => aGauche.has(d)).append("text")
    .attr("x", d => (aGauche.get(d) ? -5 : 5)).attr("y", -5)
    .attr("text-anchor", d => (aGauche.get(d) ? "end" : "start"))
    .text(texte);
}

// ---------- Contrôles ----------
function majCurseurAnnee() {
  annees = [...new Set(donnees.filter(d => d.saison === etat.saison).map(d => d.annee))]
    .sort(d3.ascending);
  if (!annees.includes(etat.annee)) {
    etat.annee = etat.annee == null
      ? annees[annees.length - 1]
      : annees[d3.minIndex(annees, a => Math.abs(a - etat.annee))]; // édition la plus proche
  }
  d3.select("#annee").attr("max", annees.length - 1);
  afficherAnnee();
}

function afficherAnnee() {
  d3.select("#annee").property("value", annees.indexOf(etat.annee)).attr("aria-valuetext", etat.annee);
  d3.select("#annee-valeur").text(etat.annee);
  const sCible = etat.saison === "hiver" ? "Winter" : "Summer";
  const hote = etat.jeux === "olympiques" ? getHostByYear(etat.annee, sCible) : null;
  if (hote) {
    d3.select("#hote-lien").html(wikiLinkHtml({
      href: `../domicile/index.html?season=${sCible}&year=${hote.year}`,
      text: `${hote.city}`,
      className: "wiki-badge",
      eyebrow: "Avantage à domicile",
      title: `${hote.country} · ${hote.city} ${hote.year}`,
      body: `Voir comment l’accueil des Jeux de ${hote.year} a boosté la délégation et les médailles de ${hote.country}.`,
      metrics: [["Ville hôte", hote.city], ["Pays hôte", `${hote.country} (${hote.noc})`]]
    }));
    bindWikiPreviews(document.querySelector("#hote-lien"));
  } else {
    d3.select("#hote-lien").html("");
  }
}

function changerAnnee(annee) {
  etat.annee = annee;
  afficherAnnee();
  dessiner(DUREE_GLISSEMENT);
}

// Lecture : le nuage défile d'une édition à l'autre
let lecture = null;

function basculerLecture() {
  if (lecture) return arreterLecture();
  if (etat.annee === annees[annees.length - 1]) changerAnnee(annees[0]); // repartir du début
  lecture = d3.interval(() => {
    const i = annees.indexOf(etat.annee);
    if (i >= annees.length - 1) return arreterLecture();
    changerAnnee(annees[i + 1]);
  }, PAS_LECTURE);
  d3.select("#lecture").text("⏸ Pause").attr("aria-pressed", true);
}

function arreterLecture() {
  if (lecture) lecture.stop();
  lecture = null;
  d3.select("#lecture").text("▶ Lecture").attr("aria-pressed", false);
}

// Recherche (Locate) : liste des noms du fichier chargé ; un pays trouvé est ajouté à la comparaison
function majRecherche() {
  nomsRecherche = new Map();
  for (const d of donnees) if (d.iso3 !== "exclu") nomsRecherche.set(d.nom, cle(d));
  d3.select("#liste-pays").selectAll("option")
    .data([...nomsRecherche.keys()].sort((a, b) => a.localeCompare(b, "fr")))
    .join("option").attr("value", d => d);
}

d3.select("#recherche").on("input change", e => {
  // Pendant la frappe, seul un choix dans la liste compte : « Congo » ne doit pas partir
  // avant « Democratic Republic of the Congo »
  if (e.type === "input" && e.inputType && e.inputType !== "insertReplacementText") return;
  const champ = d3.select(e.target);
  const valeur = e.target.value.trim().toLowerCase();
  if (!valeur) return champ.classed("introuvable", false);
  const noms = [...nomsRecherche.keys()];
  let nom = noms.find(n => n.toLowerCase() === valeur);
  if (!nom && e.type === "change") {                      // validation : accepte un nom partiel unique
    const proches = noms.filter(n => n.toLowerCase().includes(valeur));
    if (proches.length === 1) nom = proches[0];
  }
  champ.classed("introuvable", e.type === "change" && !nom);
  if (nom) {
    ajouter(nomsRecherche.get(nom), nom);
    e.target.value = "";                                  // prêt pour le pays suivant
  }
});

// Filtre par continent : une case par association continentale
d3.select("#filtre-continents").selectAll("label")
  .data(CONTINENTS)
  .join("label")
  .each(function (continent) {
    d3.select(this).append("input").attr("type", "checkbox").property("checked", true)
      .on("change", e => {
        if (e.target.checked) etat.continents.add(continent);
        else etat.continents.delete(continent);
        dessiner(DUREE_FILTRE);
      });
    d3.select(this).append("span").text(continent);
  });

d3.selectAll("input[name=jeux]").on("change", e => {
  arreterLecture();
  etat.jeux = e.target.value;
  charger();
});

d3.selectAll("input[name=saison]").on("change", e => {
  arreterLecture();
  etat.saison = e.target.value;
  majCurseurAnnee();
  dessinerAvecFondu();
  afficherDetail();
});

d3.selectAll("input[name=mesure]").on("change", e => {
  etat.mesure = e.target.value;
  majLegende();
  dessiner(DUREE_GLISSEMENT);
  afficherDetail();
});

d3.selectAll("input[name=taille]").on("change", e => {
  etat.taille = e.target.value;
  majLegende();
  dessiner(DUREE_GLISSEMENT);
});

d3.select("#annee").on("input", e => {
  arreterLecture();
  changerAnnee(annees[+e.target.value]);
});

d3.select("#min-athletes").property("value", etat.minAthletes).on("input", e => {
  etat.minAthletes = +e.target.value;
  d3.select("#min-valeur").text(etat.minAthletes);
  dessiner(DUREE_FILTRE);
});
d3.select("#min-valeur").text(etat.minAthletes);

d3.select("#lecture").on("click", basculerLecture);
d3.select("#rejouer").on("click", afficherDetail);
d3.selectAll("#fermer, #tout-effacer").on("click", toutEffacer);
d3.select(document).on("keydown", e => {
  if (e.key === "Escape") {
    cacherInfobulle();
    toutEffacer();
  }
});

majComparaison();
charger();
