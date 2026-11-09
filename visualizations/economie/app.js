import { ROOT_PREFIX, registerVizController, countryFr, loadFrenchNames } from '../shared-links.js';
// Vue 2 : la richesse fait-elle les médailles ?
// Deux graphiques côte à côte, sur la même mesure (médailles ou efficacité) :
// - vue d'ensemble : moyenne de la mesure dans chaque groupe de richesse (quintiles de PIB par habitant) ;
// - détail : un cercle par pays (PIB par habitant en x, mesure en y). Chaque barre est la moyenne des cercles de sa zone.

// ---------- Réglages ----------
const L = 600, H = 440;       // taille de chacun des deux dessins
const DUREE_GLISSEMENT = 600; // ms, changement d'édition, de saison ou de mesure
const DUREE_FILTRE = 200;     // ms, curseur et repère de pays
const PAS_LECTURE = 1000;     // ms par édition, bouton « Lecture »
const MIN_ATHLETES = 5;       // efficacité : en dessous, la valeur est trop instable (1 athlète, 1 médaille)
const EFFICACITE_MAX = 4;     // efficacité : au-delà, le cercle est posé sur le bord haut avec un triangle

// ---------- État de l'interface ----------
const etat = {
  saison: "ete",
  annee: 2016,          // édition affichée à l'ouverture (la plus proche si la saison change)
  mesure: "medailles",  // "medailles" ou "efficacite", commune aux deux graphiques
  paysFocus: null,      // code CIO du pays repéré (lien depuis une autre vue, recherche ou clic sur un cercle)
  quintileActif: null,  // groupe isolé par un clic sur sa barre ou sur sa zone du nuage
  quintileSurvol: null, // groupe survolé (barre)
  paysSurvol: null      // pays survolé (cercle)
};
let donnees = [];    // lignes de data/olympiques.csv
let annees = [];     // éditions disponibles pour la saison choisie

// ---------- Format des nombres en français ----------
const localeFr = d3.formatLocale({ decimal: ",", thousands: " ", grouping: [3], currency: ["", " $"], minus: "-" });
const nombre = localeFr.format(",.0f");
const decimal1 = localeFr.format(",.1f");
const decimal2 = localeFr.format(",.2f");
const nomPays = d => countryFr(d.pays, d.nom);
const medailles = n => `${nombre(n)} ${n > 1 ? "médailles" : "médaille"}`;

// ---------- Les deux mesures ----------
// retenu : pays placés dans le nuage et comptés dans la moyenne de leur barre
const MESURES = {
  medailles: {
    valeur: d => d.medailles,
    retenu: () => true,
    format: decimal1,
    formatPays: medailles,
    titreBarres: "Médailles par pays, en moyenne dans chaque groupe",
    axeBarres: "Médailles par pays (moyenne)",
    axeNuage: "Médailles (échelle log)",
    aideBarres: "Moyenne par pays, pays sans médaille compris ; pointillé : moyenne de l’édition. Les groupes sont recalculés à chaque édition.",
    aideNuage: "Taille du cercle : population. Les pays sans médaille sont regroupés dans la bande du bas."
  },
  efficacite: {
    valeur: d => d.efficacite,
    retenu: d => d.athletes >= MIN_ATHLETES && d.efficacite != null,
    format: decimal2,
    formatPays: decimal2,
    titreBarres: "Efficacité moyenne des pays de chaque groupe",
    axeBarres: "Efficacité moyenne (1 = moyenne de l’édition)",
    axeNuage: "Efficacité (1 = moyenne de l’édition)",
    aideBarres: "Efficacité : médailles par athlète du pays rapportées à celles de l’édition (pointillé : 1). Pays d’au moins 5 athlètes.",
    aideNuage: "Taille du cercle : population. Pays d’au moins 5 athlètes ; un triangle signale une efficacité supérieure à 4."
  }
};
const mesure = () => MESURES[etat.mesure];

// ---------- Chargement ----------
function cocher(nom, valeur) {
  d3.selectAll(`input[name=${nom}]`).property("checked", function() { return this.value === valeur; });
}

function appliquerParametres(params = {}, redessiner = false) {
  const sParam = params.saison || params.season;
  if (sParam === "hiver" || sParam === "Winter") etat.saison = "hiver";
  else if (sParam === "ete" || sParam === "Summer") etat.saison = "ete";
  cocher("saison", etat.saison);
  if (MESURES[params.mesure]) {
    etat.mesure = params.mesure;
    cocher("mesure", etat.mesure);
  }
  const y = +(params.year || params.annee);
  if (y) etat.annee = y;
  // Pays transmis par un lien d'une autre vue (code CIO) : son cercle et la barre de son groupe sont repérés
  const pays = params.country || params.noc;
  etat.paysFocus = pays ? String(pays).toUpperCase() : null;
  if (redessiner && donnees.length) {
    arreterLecture();
    majCurseurAnnee();
    dessiner();
  }
}

// Efficacité = (médailles / athlètes du pays) / (médailles / athlètes de l'édition, tous pays)
function calculerEfficacite(lignes) {
  const taux = d3.rollup(lignes,
    v => d3.sum(v, d => d.medailles) / d3.sum(v, d => d.athletes),
    d => d.saison, d => d.annee);
  for (const d of lignes) {
    const tauxEdition = taux.get(d.saison).get(d.annee);
    d.efficacite = d.athletes > 0 && tauxEdition > 0 ? (d.medailles / d.athletes) / tauxEdition : null;
  }
  return lignes;
}

let urlDejaAppliquee = false;
function charger() {
  Promise.all([d3.csv(`${ROOT_PREFIX}visualizations/economie/data/olympiques.csv`, d3.autoType), loadFrenchNames()]).then(([lignes]) => {
    donnees = calculerEfficacite(lignes).filter(d => d.iso3 !== "exclu" && Number.isFinite(d.medailles));
    construireEchelleX();
    if (!urlDejaAppliquee) {
      urlDejaAppliquee = true;
      const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
      appliquerParametres(urlParams, false);
      registerVizController('economie', params => appliquerParametres(params, true));
    }
    majCurseurAnnee();
    dessiner();
  }).catch(erreur => {
    d3.select("#barres-aide").classed("erreur", true).text(
      `Impossible de charger les données (${erreur.message}). ` +
      "Lancez « python main.py » à la racine du projet puis ouvrez http://localhost:8000.");
  });
}

// ---------- Groupes de richesse (communs aux deux graphiques) ----------
// Dégradé de la teinte sarcelle du projet (--teal), du moins riche (clair) au plus riche (foncé).
// Pas de luminosité réguliers (OKLab) : écart d'environ 12 entre deux groupes voisins.
const COULEURS_QUINTILES = ["#b6e2de", "#7bc0bb", "#449d98", "#207774", "#0b5350"];
const COULEUR_INCONNU = "#c3c5bd"; // pays sans PIB connu : gris neutre, hors du dégradé
const couleurGroupe = index => (index === 0 ? COULEUR_INCONNU : COULEURS_QUINTILES[index - 1]);
const nomGroupe = index => (index === 0 ? "PIB inconnu" : `Quintile ${index}`);
const aPib = d => Number.isFinite(d.gdppc);

// Six groupes : 0 = PIB inconnu, puis les cinq quintiles de PIB par habitant (tous les pays de l'édition).
// La moyenne porte sur les pays retenus pour la mesure : exactement les cercles de la zone du groupe.
function groupesEdition(saison, annee, cle = etat.mesure) {
  const m = MESURES[cle];
  const edition = donnees.filter(d => d.saison === saison && d.annee === annee);
  const classees = edition.filter(aPib).sort((a, b) => d3.ascending(a.gdppc, b.gdppc));
  const listes = [edition.filter(d => !aPib(d)),
    ...d3.range(5).map(i => classees.slice(Math.floor(i * classees.length / 5), Math.floor((i + 1) * classees.length / 5)))];
  return listes.map((pays, index) => {
    const retenus = pays.filter(m.retenu);
    return {
      index,
      pays,
      retenus,
      pibMin: index ? pays[0]?.gdppc : null,
      pibMax: index ? pays[pays.length - 1]?.gdppc : null,
      moyenne: retenus.length ? d3.mean(retenus, m.valeur) : null,
      medailles: retenus.filter(d => d.medailles > 0).length
    };
  }).filter(g => g.index === 0 || g.pays.length);
}

// Repère commun aux deux graphiques : moyenne de l'édition (médailles par pays, ou 1 pour l'efficacité)
const referenceEdition = (groupes, cle = etat.mesure) =>
  (cle === "efficacite" ? 1 : d3.mean(groupes.flatMap(g => g.pays), d => d.medailles));

// Pays du groupe de richesse auquel appartient un code CIO
function trouverPays(groupes, code) {
  for (const g of groupes) {
    const d = g.pays.find(p => p.pays === code);
    if (d) return { ...d, quintile: g.index, retenu: mesure().retenu(d) };
  }
  return null;
}

// ---------- Graphique en barres : moyenne de la mesure dans chaque groupe ----------
const MB = { haut: 30, droite: 12, bas: 62, gauche: 56 };
const BAS_BARRES = H - MB.bas;
const xBarres = d3.scaleBand().domain([0, 1, 2, 3, 4, 5])
  .range([MB.gauche, L - MB.droite]).padding(0.3);
// Séparation entre la barre « PIB inconnu » et les quintiles, au milieu de l'espace entre les deux barres
const X_SEPARATION_BARRES = (xBarres(0) + xBarres.bandwidth() + xBarres(1)) / 2;
const barres = {};
const maxBarres = new Map(); // axe vertical fixe pour une saison et une mesure : hauteurs comparables pendant la lecture

function echelleBarres() {
  const cle = `${etat.saison}-${etat.mesure}`;
  if (!maxBarres.has(cle)) {
    const max = d3.max(annees, a => {
      const groupes = groupesEdition(etat.saison, a);
      return Math.max(d3.max(groupes, g => g.moyenne) || 0, referenceEdition(groupes) || 0);
    });
    maxBarres.set(cle, max || 1);
  }
  return d3.scaleLinear().domain([0, maxBarres.get(cle)]).nice().range([BAS_BARRES, MB.haut]);
}

function initBarres() {
  const svg = d3.select("#barres");
  svg.selectAll("*").remove();
  svg.attr("viewBox", [0, 0, L, H]);
  barres.grille = svg.append("g").attr("class", "boxplot-grid").attr("transform", `translate(${MB.gauche},0)`);
  barres.axeY = svg.append("g").attr("class", "boxplot-y-axis").attr("transform", `translate(${MB.gauche},0)`);
  svg.append("line").attr("class", "separation-inconnu")
    .attr("x1", X_SEPARATION_BARRES).attr("x2", X_SEPARATION_BARRES)
    .attr("y1", MB.haut).attr("y2", BAS_BARRES + 36);
  barres.groupes = svg.append("g");
  svg.append("g").attr("class", "boxplot-x-axis").attr("transform", `translate(0,${BAS_BARRES})`)
    .call(d3.axisBottom(xBarres).tickSize(0).tickPadding(9).tickFormat(i => (i === 0 ? "PIB inc." : `Q${i}`)));
  barres.titreY = svg.append("text").attr("class", "boxplot-axis-title")
    .attr("transform", `translate(14,${(MB.haut + BAS_BARRES) / 2}) rotate(-90)`).attr("text-anchor", "middle");
  svg.append("text").attr("class", "boxplot-axis-title")
    .attr("x", (MB.gauche + L - MB.droite) / 2).attr("y", H - 8)
    .attr("text-anchor", "middle").text("Groupes de richesse, du PIB/hab. le plus bas au plus élevé");
  barres.reference = svg.append("g").attr("class", "reference");
  barres.reference.append("line").attr("x1", MB.gauche).attr("x2", L - MB.droite); // légende dans l'aide au-dessus
  barres.vide = svg.append("text").attr("class", "boxplot-empty")
    .attr("x", L / 2).attr("y", H / 2).attr("text-anchor", "middle")
    .text("Aucun pays avec PIB par habitant connu pour cette édition.");
  // Repère d'un pays (survolé ou repéré) : trait à sa valeur sur la barre de son groupe
  barres.repere = svg.append("g").attr("class", "repere-pays").style("display", "none");
  barres.repere.append("line");
  barres.repere.append("text").attr("text-anchor", "middle");
}

function basculerQuintile(index) {
  etat.quintileActif = etat.quintileActif === index ? null : index;
  majLiens();
}

function infobulleGroupe(event, d) {
  const m = mesure();
  const pris = etat.mesure === "efficacite"
    ? `${d.retenus.length} sur ${d.pays.length} (≥ ${MIN_ATHLETES} athlètes)`
    : nombre(d.pays.length);
  afficherTexteInfobulle(event,
    `<strong>${nomGroupe(d.index)}</strong>` +
    ligneInfobulle("PIB / habitant", d.index === 0 ? "non renseigné" : `${nombre(d.pibMin)} - ${nombre(d.pibMax)} $`) +
    ligneInfobulle("Pays", pris) +
    ligneInfobulle(etat.mesure === "efficacite" ? "Efficacité moyenne" : "Médailles par pays", d.moyenne == null ? "n.d." : m.format(d.moyenne)) +
    ligneInfobulle("Pays médaillés", `${d.medailles} sur ${d.retenus.length}`));
}

function dessinerBarres(groupes, t) {
  if (!barres.groupes) initBarres();
  const m = mesure();
  const y = echelleBarres();
  const largeur = L - MB.gauche - MB.droite;
  const hauteur = d => (d.moyenne == null ? 0 : BAS_BARRES - y(d.moyenne));

  barres.vide.style("display", groupes.some(g => g.index > 0) ? "none" : null);
  barres.titreY.text(m.axeBarres);
  barres.grille.transition(t)
    .call(d3.axisLeft(y).ticks(5).tickSize(-largeur).tickFormat(""))
    .call(g => g.select(".domain").remove());
  barres.axeY.transition(t).call(d3.axisLeft(y).ticks(5).tickFormat(localeFr.format("~g")));
  const yRef = y(referenceEdition(groupes));
  barres.reference.select("line").transition(t).attr("y1", yRef).attr("y2", yRef);

  const groupe = barres.groupes.selectAll("g.quintile").data(groupes, d => d.index).join(entree => {
    const g = entree.append("g").attr("class", "quintile")
      .attr("transform", d => `translate(${xBarres(d.index)},0)`);
    g.append("rect").attr("class", "barre-quintile")
      .attr("fill", d => couleurGroupe(d.index))
      .attr("width", xBarres.bandwidth()).attr("y", BAS_BARRES).attr("height", 0)
      .attr("tabindex", 0).attr("role", "button")
      .on("mouseenter focus", (event, d) => {
        etat.quintileSurvol = d.index;
        majLiens();
        infobulleGroupe(event, d);
      })
      .on("mousemove", deplacerInfobulle)
      .on("mouseleave blur", () => {
        etat.quintileSurvol = null;
        majLiens();
        cacherInfobulle();
      })
      .on("click", (event, d) => basculerQuintile(d.index))
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          basculerQuintile(d.index);
        }
      });
    g.append("text").attr("class", "barre-valeur")
      .attr("x", xBarres.bandwidth() / 2).attr("y", BAS_BARRES - 6).attr("text-anchor", "middle");
    g.append("text").attr("class", "barre-pays")
      .attr("x", xBarres.bandwidth() / 2).attr("y", BAS_BARRES + 34).attr("text-anchor", "middle");
    return g;
  });

  // select() transmet les nouvelles données du groupe à chaque enfant (infobulle à jour)
  groupe.select(".barre-quintile")
    .attr("aria-label", d => `${nomGroupe(d.index)} : ${d.moyenne == null ? "n.d." : m.format(d.moyenne)}, ${d.retenus.length} pays. Entrée : isoler le groupe dans le nuage`)
    .transition(t)
    .attr("y", d => BAS_BARRES - hauteur(d)).attr("height", hauteur);
  // La valeur défile jusqu'à la nouvelle moyenne, en repartant de la valeur affichée
  groupe.select(".barre-valeur").transition(t)
    .attr("y", d => BAS_BARRES - hauteur(d) - 6)
    .tween("text", function (d) {
      const noeud = this;
      const i = d3.interpolateNumber(noeud._valeur ?? 0, d.moyenne ?? 0);
      return u => { noeud._valeur = i(u); noeud.textContent = d.moyenne == null ? "–" : m.format(noeud._valeur); };
    });
  groupe.select(".barre-pays").text(d => `${d.retenus.length} pays`);
  barres.selection = groupe;
  barres.donnees = groupes;
}

// ---------- Nuage : un cercle par pays, PIB par habitant en x, mesure en y ----------
const MN = { haut: 34, droite: 12, bas: 44, gauche: 56 }; // mêmes marges que les barres
const BAS_NUAGE = H - MN.bas;
const BANDE_INCONNU = { debut: MN.gauche + 8, largeur: 40 }; // pays sans PIB : bande à gauche de l'axe log
const X_SEPARATION_NUAGE = BANDE_INCONNU.debut + BANDE_INCONNU.largeur + 8;
// Pays sans médaille : bande sous l'axe vertical, cercles écartés les uns des autres (essaim)
const BANDE_ZERO = { hauteur: 58, marge: 10 };
const HAUT_BANDE_ZERO = BAS_NUAGE - BANDE_ZERO.hauteur;
const RAYON_MAX_ZERO = 4.5;   // px : taille plafonnée dans la bande pour garder l'essaim compact
const nuage = {};

// Axe horizontal fixe pour toutes les éditions et les deux mesures : un pays ne bouge que si son PIB change
function construireEchelleX() {
  const [pibMin, pibMax] = d3.extent(donnees.filter(aPib), d => d.gdppc);
  nuage.x = d3.scaleLog()
    .domain([pibMin / 1.15, pibMax * 1.15]) // petite marge : aucun cercle collé aux bords
    .range([X_SEPARATION_NUAGE + 10, L - MN.droite]);
  nuage.r = d3.scaleSqrt().domain([0, d3.max(donnees, d => d.pop) || 1]).range([2, 16]);
}

// Axe vertical : efficacité linéaire de 0 à 4, ou médailles en échelle log (fixe pour la saison)
const maxMedailles = new Map();
function echelleY() {
  const range = [HAUT_BANDE_ZERO - BANDE_ZERO.marge, MN.haut];
  if (etat.mesure === "efficacite") return d3.scaleLinear().domain([0, EFFICACITE_MAX]).range(range);
  if (!maxMedailles.has(etat.saison)) {
    maxMedailles.set(etat.saison, d3.max(donnees.filter(d => d.saison === etat.saison), d => d.medailles) || 1);
  }
  return d3.scaleLog().domain([1, maxMedailles.get(etat.saison) * 1.15]).range(range);
}

// Nombre entre 0 et 1 tiré du code du pays : position stable d'une édition à l'autre
function hachage(texte) {
  let h = 0;
  for (const c of String(texte)) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return h / 1000;
}

const sansMedaille = d => d.medailles === 0;
const horsEchelle = d => etat.mesure === "efficacite" && d.efficacite > EFFICACITE_MAX;
const rayon = d => (Number.isFinite(d.pop) ? nuage.r(d.pop) : 2.5); // population inconnue : petit cercle
const rayonPoint = d => (sansMedaille(d) ? Math.min(rayon(d), RAYON_MAX_ZERO) : rayon(d));
const xPoint = d => (aPib(d) ? nuage.x(d.gdppc) : BANDE_INCONNU.debut + 5 + hachage(d.pays) * (BANDE_INCONNU.largeur - 10));
const yPoint = d => (etat.mesure === "efficacite"
  ? nuage.y(Math.min(d.efficacite, EFFICACITE_MAX))
  : nuage.y(d.medailles));
// Position affichée : celle calculée par l'essaim pour les pays sans médaille, sinon la position exacte
const posX = d => d.bx ?? xPoint(d);
const posY = d => d.by ?? yPoint(d);
const positionPoint = d => `translate(${posX(d)},${posY(d)})`;

// Essaim des pays sans médaille : chaque cercle reste au plus près de son PIB, sans chevaucher les autres.
// Départ tiré du code du pays et calcul complet à chaque édition : même résultat à chaque affichage.
function placerSansMedaille(points) {
  const zeros = points.filter(sansMedaille);
  const centre = HAUT_BANDE_ZERO + BANDE_ZERO.hauteur / 2;
  for (const d of zeros) {
    d.cible = xPoint(d);
    d.x = d.cible;
    d.y = centre + (hachage([...String(d.pays)].reverse().join("")) - 0.5) * (BANDE_ZERO.hauteur - 14);
  }
  d3.forceSimulation(zeros)
    .force("x", d3.forceX(d => d.cible).strength(0.8))
    .force("y", d3.forceY(centre).strength(0.06))
    .force("collision", d3.forceCollide(d => rayonPoint(d) + 0.8).iterations(3))
    .stop()
    .tick(200);
  for (const d of zeros) {
    const r = rayonPoint(d);
    d.by = Math.max(HAUT_BANDE_ZERO + r + 2, Math.min(BAS_NUAGE - r - 2, d.y));
    d.bx = aPib(d)
      ? Math.max(X_SEPARATION_NUAGE + r + 2, Math.min(L - MN.droite - r, d.x))
      : Math.max(BANDE_INCONNU.debut + r, Math.min(BANDE_INCONNU.debut + BANDE_INCONNU.largeur - r, d.x));
  }
}

function initNuage() {
  const svg = d3.select("#nuage");
  svg.selectAll("*").remove();
  svg.attr("viewBox", [0, 0, L, H]);
  svg.append("rect").attr("class", "bande-zero")
    .attr("x", MN.gauche).attr("y", HAUT_BANDE_ZERO)
    .attr("width", L - MN.droite - MN.gauche).attr("height", BANDE_ZERO.hauteur);
  svg.append("text").attr("class", "etiquette-bande")
    .attr("x", L - MN.droite - 4).attr("y", HAUT_BANDE_ZERO + 12).attr("text-anchor", "end")
    .text("0 médaille");
  nuage.zones = svg.append("g");   // fond du groupe mis en évidence et étiquettes des groupes
  nuage.grille = svg.append("g").attr("class", "boxplot-grid").attr("transform", `translate(${MN.gauche},0)`);
  nuage.limites = svg.append("g");
  svg.append("line").attr("class", "separation-inconnu")
    .attr("x1", X_SEPARATION_NUAGE).attr("x2", X_SEPARATION_NUAGE)
    .attr("y1", 4).attr("y2", BAS_NUAGE + 22);
  nuage.axeY = svg.append("g").attr("class", "boxplot-y-axis").attr("transform", `translate(${MN.gauche},0)`);
  const valeursX = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]
    .filter(v => v >= nuage.x.domain()[0] && v <= nuage.x.domain()[1]);
  svg.append("g").attr("class", "boxplot-x-axis").attr("transform", `translate(0,${BAS_NUAGE})`)
    .call(d3.axisBottom(nuage.x).tickValues(valeursX).tickFormat(nombre));
  nuage.reference = svg.append("g").attr("class", "reference");
  nuage.reference.append("line").attr("x1", MN.gauche).attr("x2", L - MN.droite);
  nuage.reference.append("text").attr("class", "etiquette-moyenne").attr("x", L - MN.droite - 4).attr("text-anchor", "end")
    .text("moyenne de l’édition");
  nuage.titreY = svg.append("text").attr("class", "boxplot-axis-title")
    .attr("transform", `translate(14,${(MN.haut + HAUT_BANDE_ZERO) / 2}) rotate(-90)`).attr("text-anchor", "middle");
  svg.append("text").attr("class", "boxplot-axis-title")
    .attr("x", (nuage.x.range()[0] + L - MN.droite) / 2).attr("y", H - 8)
    .attr("text-anchor", "middle").text("PIB par habitant (dollars PPA 2011, échelle log)");
  nuage.points = svg.append("g");
  nuage.etiquette = svg.append("text").attr("class", "point-focus").attr("text-anchor", "middle");
  nuage.vide = svg.append("text").attr("class", "boxplot-empty")
    .attr("x", L / 2).attr("y", H / 2).attr("text-anchor", "middle")
    .text("Aucun pays pour cette édition.");
}

// Zones des groupes en pixels. Limites entre quintiles : moyenne géométrique du plus riche
// d'un groupe et du moins riche du suivant. La bande « PIB inconnu » est fixe, à gauche.
function zonesGroupes(groupes) {
  const quintilesEdition = groupes.filter(g => g.index > 0);
  const [x0, x1] = nuage.x.domain();
  const bornes = quintilesEdition.slice(1).map((g, i) => Math.sqrt(quintilesEdition[i].pibMax * g.pibMin));
  return [
    { index: 0, debut: BANDE_INCONNU.debut, fin: BANDE_INCONNU.debut + BANDE_INCONNU.largeur },
    ...quintilesEdition.map((g, i) => ({
      index: g.index,
      debut: nuage.x(i === 0 ? x0 : Math.max(x0, bornes[i - 1])),
      fin: nuage.x(i === quintilesEdition.length - 1 ? x1 : Math.min(x1, bornes[i]))
    }))
  ];
}

function infobullePays(event, d) {
  afficherTexteInfobulle(event,
    `<strong>${nomPays(d)}</strong>` +
    ligneInfobulle("Groupe de richesse", nomGroupe(d.quintile)) +
    ligneInfobulle("PIB / habitant", aPib(d) ? `${nombre(d.gdppc)} $` : "non renseigné") +
    ligneInfobulle("Athlètes", nombre(d.athletes)) +
    ligneInfobulle("Médailles", nombre(d.medailles)) +
    ligneInfobulle("Efficacité", d.athletes >= MIN_ATHLETES && d.efficacite != null
      ? decimal2(d.efficacite) : `n.d. (moins de ${MIN_ATHLETES} athlètes)`));
}

function dessinerNuage(groupes, t) {
  if (!nuage.points) initNuage();
  const m = mesure();
  nuage.y = echelleY();
  const points = groupes.flatMap(g => g.retenus.map(d => ({ ...d, quintile: g.index })))
    .sort((a, b) => rayonPoint(b) - rayonPoint(a)); // petits cercles devant
  placerSansMedaille(points);
  nuage.vide.style("display", points.length ? "none" : null);

  // Axe vertical selon la mesure
  const largeur = L - MN.gauche - MN.droite;
  const axe = etat.mesure === "efficacite"
    ? d3.axisLeft(nuage.y).ticks(4).tickFormat(localeFr.format("~g"))
    : d3.axisLeft(nuage.y).tickValues([1, 2, 5, 10, 20, 50, 100, 200].filter(v => v <= nuage.y.domain()[1])).tickFormat(nombre);
  nuage.axeY.transition(t).call(axe);
  nuage.grille.transition(t).call(axe.tickSize(-largeur).tickFormat(""))
    .call(g => g.select(".domain").remove());
  nuage.titreY.text(m.axeNuage);
  const yRef = nuage.y(Math.max(referenceEdition(groupes), etat.mesure === "efficacite" ? 0 : 1));
  nuage.reference.select("line").transition(t).attr("y1", yRef).attr("y2", yRef);
  nuage.reference.select("text").transition(t).attr("y", yRef - 5);

  const zones = zonesGroupes(groupes);
  nuage.zones.selectAll("g.zone").data(zones, d => d.index).join(entree => {
    const g = entree.append("g").attr("class", d => (d.index === 0 ? "zone zone-inconnu" : "zone"));
    g.append("rect").attr("class", "zone-fond").attr("y", MN.haut).attr("height", BAS_NUAGE - MN.haut)
      .attr("fill", d => couleurGroupe(d.index));
    g.append("text").attr("class", "zone-titre").attr("y", 14).attr("text-anchor", "middle")
      .text(d => (d.index === 0 ? "PIB inc." : `Q${d.index}`));
    // Un clic dans la zone d'un groupe l'isole, comme un clic sur sa barre
    g.on("click", (event, d) => basculerQuintile(d.index));
    return g;
  }).call(g => g.select(".zone-fond").transition(t)
      .attr("x", d => d.debut).attr("width", d => Math.max(0, d.fin - d.debut)))
    .call(g => g.select(".zone-titre").transition(t)
      .attr("x", d => (d.debut + d.fin) / 2));

  nuage.limites.selectAll("line").data(zones.filter(z => z.index > 1), d => d.index).join("line")
    .attr("class", "limite-quintile").attr("y1", MN.haut).attr("y2", BAS_NUAGE)
    .transition(t).attr("x1", d => d.debut).attr("x2", d => d.debut);

  nuage.selection = nuage.points.selectAll("g.point").data(points, d => d.pays).join(
    entree => {
      // opacité en attribut, pas en style : la classe « estompe » (CSS) garde la main
      const g = entree.append("g").attr("class", "point").attr("transform", positionPoint).attr("opacity", 0);
      g.append("circle");
      g.append("path").attr("class", "triangle").attr("d", d3.symbol(d3.symbolTriangle, 34));
      return g;
    },
    maj => maj,
    sortie => sortie.transition(t).attr("opacity", 0).remove()
  )
    .order()
    .classed("inconnu", d => d.quintile === 0)
    .on("mouseenter", (event, d) => {
      etat.paysSurvol = d;
      majLiens();
      infobullePays(event, d);
    })
    .on("mousemove", deplacerInfobulle)
    .on("mouseleave", () => {
      etat.paysSurvol = null;
      majLiens();
      cacherInfobulle();
    })
    .on("click", (event, d) => {
      etat.paysFocus = etat.paysFocus === d.pays ? null : d.pays;
      majFocus(DUREE_FILTRE);
    });

  nuage.selection.transition(t).attr("transform", positionPoint).attr("opacity", 1);
  nuage.selection.select("circle")
    .attr("fill", d => couleurGroupe(d.quintile))
    .transition(t).attr("r", rayonPoint);
  nuage.selection.select(".triangle")
    .attr("display", d => (horsEchelle(d) ? null : "none"))
    .attr("transform", d => `translate(0,${-rayonPoint(d) - 5})`);
}

// ---------- Liens entre les deux graphiques ----------
// Barre survolée ou isolée : ses pays restent en évidence dans le nuage, les autres s'estompent.
// Cercle survolé ou repéré : la barre de son groupe ressort et un trait y marque la valeur du pays.
function majLiens() {
  const qNuage = etat.quintileSurvol ?? etat.quintileActif;
  const qBarres = etat.quintileSurvol ?? etat.paysSurvol?.quintile ?? etat.quintileActif;
  if (barres.selection) {
    barres.selection.select(".barre-quintile")
      .classed("estompe", d => qBarres != null && d.index !== qBarres)
      .attr("aria-pressed", d => etat.quintileActif === d.index);
  }
  if (nuage.selection) {
    nuage.selection.classed("estompe", d => qNuage != null && d.quintile !== qNuage)
      .classed("survol", d => etat.paysSurvol?.pays === d.pays);
    nuage.zones.selectAll("g.zone").classed("active", d => d.index === qNuage);
  }
  d3.select("#eco-groupe").property("hidden", etat.quintileActif == null)
    .text(etat.quintileActif == null ? "" : `${nomGroupe(etat.quintileActif)} isolé ✕`);
  majRepereBarres();
}

function majRepereBarres() {
  if (!barres.repere) return;
  const d = etat.paysSurvol ?? (etat.paysFocus ? trouverPays(barres.donnees, etat.paysFocus) : null);
  const visible = d && mesure().retenu(d);
  barres.repere.style("display", visible ? null : "none");
  barres.selection.select(".barre-valeur").style("opacity", null);
  if (!visible) return;
  const m = mesure();
  const y = echelleBarres();
  const max = y.domain()[1];
  const valeur = m.valeur(d);
  const yRepere = y(Math.min(valeur, max));
  const x0 = xBarres(d.quintile);
  barres.repere.select("line")
    .attr("x1", x0 - 6).attr("x2", x0 + xBarres.bandwidth() + 6)
    .attr("y1", yRepere).attr("y2", yRepere);
  // Le nom reste dans le dessin : calé à gauche ou à droite près des bords
  const xTexte = Math.max(MB.gauche + 50, Math.min(L - MB.droite - 50, x0 + xBarres.bandwidth() / 2));
  barres.repere.select("text")
    .attr("x", xTexte).attr("y", yRepere - 7)
    .text(`${nomPays(d)} : ${m.formatPays(valeur)}${valeur > max ? " ▲" : ""}`);
  // La moyenne du groupe s'efface si le repère tombe dessus
  barres.selection.select(".barre-valeur")
    .style("opacity", g => (g.index === d.quintile && g.moyenne != null && Math.abs(y(g.moyenne) - yRepere) < 18 ? 0 : null));
}

// Repère du pays : cercle entouré et nommé, barre de son groupe cerclée avec un trait, pastille pour le retirer
function majFocus(duree = 0) {
  const t = d3.transition().duration(duree);
  const nomFocus = etat.paysFocus ? countryFr(etat.paysFocus) : null;
  const pays = etat.paysFocus && barres.donnees ? trouverPays(barres.donnees, etat.paysFocus) : null;
  if (barres.selection) {
    barres.selection.select(".barre-quintile").classed("focus", d => d.index === pays?.quintile);
  }
  let point = null;
  if (nuage.selection) {
    nuage.selection.classed("focus", d => d.pays === etat.paysFocus);
    nuage.selection.filter(".focus").raise();
    point = nuage.selection.data().find(d => d.pays === etat.paysFocus) || null;
    nuage.etiquette.style("display", point ? null : "none");
    if (point) {
      const x = Math.max(MN.gauche + 40, Math.min(L - MN.droite - 40, posX(point)));
      nuage.etiquette.text(nomPays(point)).transition(t)
        .attr("x", x)
        .attr("y", posY(point) - rayonPoint(point) - (horsEchelle(point) ? 14 : 5));
    }
  }
  let texte = "";
  if (nomFocus) {
    if (!pays) texte = `${nomFocus} : absent en ${etat.annee}`;
    else if (!point) texte = `${nomFocus} : moins de ${MIN_ATHLETES} athlètes en ${etat.annee}`;
    else texte = nomFocus;
  }
  d3.select("#eco-focus").property("hidden", !nomFocus).text(nomFocus ? `${texte} ✕` : "");
  majRepereBarres();
}

function majTextes() {
  const m = mesure();
  d3.select("#barres-titre").text(m.titreBarres);
  d3.select("#barres-aide").classed("erreur", false).text(m.aideBarres);
  d3.select("#nuage-aide").text(m.aideNuage);
}

function dessiner(duree = 0) {
  const groupes = groupesEdition(etat.saison, etat.annee);
  const t = d3.transition().duration(duree).ease(d3.easeCubicInOut);
  majTextes();
  dessinerBarres(groupes, t);
  dessinerNuage(groupes, t);
  if (etat.paysSurvol && !nuage.selection.data().some(d => d.pays === etat.paysSurvol.pays)) etat.paysSurvol = null;
  majLiens();
  majFocus(duree);
}

// ---------- Infobulle ----------
const infobulle = d3.select("#infobulle");
const ligneInfobulle = (libelle, valeur) => `<div class="tooltip-row"><span>${libelle}</span><b>${valeur}</b></div>`;

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
  majListePays();
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

// Recherche : noms français des pays présents dans la saison choisie
let paysParNom = new Map();
function majListePays() {
  const saison = donnees.filter(d => d.saison === etat.saison);
  paysParNom = new Map(saison.map(d => [nomPays(d).toLowerCase(), d.pays]));
  const noms = [...new Set(saison.map(nomPays))].sort((a, b) => a.localeCompare(b, "fr"));
  d3.select("#eco-pays-options").selectAll("option").data(noms).join("option").attr("value", d => d);
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

d3.select("#eco-groupe").on("click", () => {
  etat.quintileActif = null;
  majLiens();
});

d3.select("#eco-focus").on("click", () => {
  etat.paysFocus = null;
  d3.select("#eco-recherche").property("value", "");
  majFocus(DUREE_FILTRE);
});

d3.select("#eco-recherche").on("change", e => {
  const noc = paysParNom.get(e.target.value.trim().toLowerCase());
  if (!noc) return;
  etat.paysFocus = noc;
  majFocus(DUREE_FILTRE);
});

d3.selectAll("input[name=saison]").on("change", e => {
  etat.paysFocus = null;
  d3.select("#eco-recherche").property("value", "");
  arreterLecture();
  etat.saison = e.target.value;
  majCurseurAnnee();
  dessiner(DUREE_GLISSEMENT);
});

d3.selectAll("input[name=mesure]").on("change", e => {
  etat.mesure = e.target.value;
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
