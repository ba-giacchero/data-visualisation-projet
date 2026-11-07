import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spearman, specialization, hostSeries, rowsForEdition, validateDataset} from '../dashboard/model.js';

const read = source => JSON.parse(fs.readFileSync(new URL(`../dashboard/data/${source}.json`, import.meta.url)));
const modern = read('olympedia'), historic = read('historique');

test('les deux datasets satisfont le contrat d’import et les quantiles sont ordonnés', () => {
  assert.equal(validateDataset(modern), modern);
  assert.equal(validateDataset(historic), historic);
});
test('la couverture vient des résultats et ne présente aucune édition 2024 fictive', () => {
  assert.equal(Math.max(...modern.countries.filter(r=>r.season==='summer').map(r=>r.year)), 2020);
  assert.equal(Math.max(...modern.countries.filter(r=>r.season==='winter').map(r=>r.year)), 2022);
  assert.equal(Math.max(...historic.countries.map(r=>r.year)), 2016);
  assert.ok(modern.countries.every(r=>!r.gdp || r.gdp>0));
});
test('les médailles pays-édition sont exactement la somme des médailles par discipline', () => {
  for(const data of [modern,historic]) {
    const sums=new Map();
    for(const r of data.sports) {const key=`${r.season}|${r.year}|${r.noc}`;sums.set(key,(sums.get(key)||0)+r.medals);}
    for(const r of data.countries) assert.equal(r.medals,sums.get(`${r.season}|${r.year}|${r.noc}`)||0,`${data.name}, ${r.noc} ${r.year}`);
  }
});
test('Rio 2016 conserve le compte national et ne multiplie pas les médailles collectives', () => {
  const rows=rowsForEdition(modern,{season:'summer',year:2016,sport:''});
  assert.equal(rows.length,207);
  assert.equal(rows.reduce((s,r)=>s+r.medals,0),972);
  assert.equal(rows.find(r=>r.noc==='USA').medals,121);
  assert.equal(rows.find(r=>r.noc==='FRA').medals,42);
});
test('un filtre discipline conserve le PIB joint et sélectionne ses propres effectifs', () => {
  const rows=rowsForEdition(modern,{season:'summer',year:2016,sport:'Swimming'});
  const usa=rows.find(r=>r.noc==='USA');
  assert.ok(usa.gdp>0);assert.equal(usa.medals,33);assert.ok(usa.athletes<100);
});
test('Spearman gère les ex aequo et refuse une série constante ou trop courte', () => {
  assert.equal(spearman([{x:1,y:1},{x:1,y:1},{x:2,y:2}],r=>r.x,r=>r.y),1);
  assert.equal(spearman([{x:1,y:3},{x:2,y:2},{x:3,y:1}],r=>r.x,r=>r.y),-1);
  assert.equal(spearman([{x:1,y:1},{x:1,y:2},{x:1,y:3}],r=>r.x,r=>r.y),null);
});
test('la spécialisation utilise des parts et non le volume absolu', () => {
  const data={sports:[{season:'summer',year:2000,noc:'A',sport:'X',medals:4},{season:'summer',year:2000,noc:'A',sport:'Y',medals:0},{season:'summer',year:2000,noc:'B',sport:'X',medals:1},{season:'summer',year:2000,noc:'B',sport:'Y',medals:5}]};
  assert.equal(specialization(data,{season:'summer',year:2000},'A','X').lq,2);
  assert.equal(specialization(data,{season:'summer',year:2000},'A','Y').lq,0);
});
test('une édition absente ne se transforme pas en zéro dans le graphique hôte', () => {
  const result=hostSeries(modern,{season:'summer',sport:''},modern.hosts.find(r=>r.season==='summer'&&r.year===1960));
  assert.equal(result.baseline,null);assert.equal(result.points[0].share,null);assert.equal(result.points[0].year,null);
  const london=hostSeries(modern,{season:'summer',sport:''},modern.hosts.find(r=>r.season==='summer'&&r.year===2012));
  assert.equal(london.previous,3);assert.ok(london.points.find(r=>r.offset===0).index>100);
});
test('les poids de boxeurs restent séparés par épreuve et sexe et les médaillés sont un sous-ensemble', () => {
  const rows=modern.profiles.filter(r=>r.season==='summer'&&r.year===2016&&r.sport==='Boxing'&&r.level==='event'&&r.cohort==='all');
  assert.equal(rows.length,13);assert.ok(rows.some(r=>r.sex==='F'));assert.ok(rows.some(r=>r.sex==='M'));
  for(const row of rows) {const medal=modern.profiles.find(r=>r.season===row.season&&r.year===row.year&&r.sport===row.sport&&r.level===row.level&&r.event===row.event&&r.sex===row.sex&&r.cohort==='medalists');if(medal)assert.ok(medal.total<=row.total);}
});
test('un import corrompu est refusé avant de remplacer le dataset courant', () => {
  assert.throws(()=>validateDataset({schemaVersion:2}),/incompatible/);
  const invalid={...modern,countries:[{...modern.countries[0],gdp:-1}]};assert.throws(()=>validateDataset(invalid),/gdp/);
  const duplicates={...modern,countries:[modern.countries[0],modern.countries[0]]};assert.throws(()=>validateDataset(duplicates),/doublon/);
});
