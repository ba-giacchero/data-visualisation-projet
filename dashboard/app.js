import {mean, spearman, rowsForEdition, specialization, hostSeries, validateDataset} from './model.js';

const $ = id => document.getElementById(id);
const state = {source:'olympedia', season:'summer', year:2020, noc:'', sport:'', metric:'medals', heat:'specialization', measure:'height', sex:'compare', level:'sport', hostYear:2012};
const colors = {Europe:'#729b83', Asie:'#acb96b', Afrique:'#d2a570', 'Amérique':'#508a92', 'Océanie':'#b896ba', Autre:'#a6b1aa', F:'#ba5c83', M:'#368e9c'};
const display = {height:'Taille', weight:'Poids', age:'Âge', medals:'Médailles', athletes:'Athlètes inscrits', rate:'Médailles / 100 athlètes'};
const units = {height:'cm',weight:'kg',age:'ans'};
const number = n => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n);
const decimal = n => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(n);
const correlation = n => n == null ? '—' : new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, timer, activeDetail, loadSequence=0;
let years=[], heatRows=[], heatSports=[], anatomyRows=[], selectedHost;
const loaded=new Map();
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function options(id, rows, selected) {
  d3.select(`#${id}`).selectAll('option').data(rows).join('option').attr('value', r=>r.value).text(r=>r.label);
  $(id).value=selected;
}
function stop() {clearInterval(timer);timer=null;$('play').textContent='▶';$('play').setAttribute('aria-pressed','false');}
function setBusy(busy) {for(const node of document.querySelectorAll('.filterbar select,.filterbar button,.filterbar input,#export-button,#import-button')) node.disabled=busy;}
async function loadSource(source) {
  stop(); const sequence=++loadSequence; setBusy(true); $('error').hidden=true;
  try {
    let next=loaded.get(source);
    if(!next) {
      const response=await fetch(`dashboard/data/${source}.json`);
      if(!response.ok) throw new Error(`Impossible de charger la source (${response.status}). Lancez python3 main.py.`);
      next=validateDataset(await response.json());loaded.set(source,next);
    }
    if(sequence!==loadSequence)return;
    data=next;state.source=source; reconcile(); render();
  } catch(error) { showError(error.message); $('dataset').value=state.source; }
  finally {if(sequence===loadSequence)setBusy(false);}
}
function showError(message) {$('error').textContent=message;$('error').hidden=false;}
function reconcile() {
  const seasons=[...new Set(data.countries.map(r=>r.season))];
  if(!seasons.includes(state.season))state.season=seasons[0];
  options('season',seasons.map(s=>({value:s,label:s==='summer'?'Jeux d’été':'Jeux d’hiver'})),state.season);
  years=[...new Set(data.countries.filter(r=>r.season===state.season).map(r=>r.year))].sort((a,b)=>a-b);
  if(!years.includes(state.year))state.year=years[years.length-1];
  $('year').max=years.length-1;$('year').value=years.indexOf(state.year);$('year-value').value=state.year;
  const countries=data.countries.filter(r=>r.season===state.season&&r.year===state.year).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  if(state.noc&&!countries.some(r=>r.noc===state.noc))state.noc='';
  options('country',[{value:'',label:'Tous les pays'},...countries.map(r=>({value:r.noc,label:r.name}))],state.noc);
  const sports=[...new Set(data.sports.filter(r=>r.season===state.season&&r.year===state.year).map(r=>r.sport))].sort();
  if(state.sport&&!sports.includes(state.sport))state.sport='';
  options('sport',[{value:'',label:'Toutes les disciplines'},...sports.map(s=>({value:s,label:s}))],state.sport);
  const hosts=data.hosts.filter(r=>r.season===state.season&&years.includes(r.year));
  if(!hosts.some(r=>r.year===state.hostYear))state.hostYear=hosts.at(-1)?.year??null;
  options('host-edition',hosts.map(r=>({value:r.year,label:`${r.city} ${r.year}`})),state.hostYear);
  for(const [id,key] of [['economy-metric','metric'],['specialization-metric','heat'],['anatomy-measure','measure'],['anatomy-sex','sex'],['anatomy-level','level']])$(id).value=state[key];
}
function render() {
  if(!data)return;
  hideTooltip();
  const rows=rowsForEdition(data,state), all=rowsForEdition(data,{...state,sport:''});
  $('stat-countries').textContent=number(rows.length);$('stat-athletes').textContent=number(d3.sum(rows,r=>r.athletes));$('stat-medals').textContent=number(d3.sum(rows,r=>r.medals));
  const host=data.hosts.find(r=>r.season===state.season&&r.year===state.year);
  $('edition-label').textContent=`${host?.city || 'Édition'} ${state.year} · ${state.season==='summer'?'JEUX D’ÉTÉ':'JEUX D’HIVER'}`;
  $('context-note').textContent=state.sport?`Chiffres de ${state.sport}. Inscrits uniques dans cette discipline.`:`Athlètes uniques par délégation. ${state.year===2020?'Tokyo 2020 s’est tenu en 2021.':'Choisissez un pays pour suivre sa trajectoire.'}`;
  $('source-status').textContent=state.source==='custom'?'Dataset importé':state.source==='olympedia'?'Source Olympedia':'Source Kaggle historique';
  $('selection-status').textContent=`${state.year} · ${state.noc?all.find(r=>r.noc===state.noc)?.name || state.noc:'Tous les pays'} · ${state.sport||'Toutes les disciplines'}${state.noc?' · le pays est mis en évidence, le contexte mondial est conservé.':''}`;
  $('footer-period').textContent=`${years[0]}–${years.at(-1)} · ${years.length} éditions disponibles · ${state.source==='custom'?'Import local':data.name}`;
  const url=new URL(location.href);for(const k of ['source','season','year','noc','sport','hostYear']){if(state[k])url.searchParams.set(k,state[k]);else url.searchParams.delete(k);}history.replaceState(null,'',url);
  renderEconomy(); renderSpecialization();renderAnatomy();renderHost();
  if($('detail-dialog').open&&activeDetail)renderDetail(activeDetail);
}
function svgFrame(id,{left=48,right=16,top=16,bottom=37}={}) {
  const node=$(id),width=Math.max(280,node.clientWidth),height=node.clientHeight || 255;
  const svg=d3.select(node).selectAll('svg').data([null]).join('svg').attr('viewBox',`0 0 ${width} ${height}`);
  svg.selectAll('*').remove();
  return {svg,plot:svg.append('g').attr('transform',`translate(${left},${top})`),width:width-left-right,height:height-top-bottom,outerWidth:width,outerHeight:height,left,top};
}
function empty(plot,w,h,message='Pas assez de données pour cette sélection.') {plot.append('text').attr('class','chart-label').attr('x',w/2).attr('y',h/2).attr('text-anchor','middle').text(message);}
function tooltip(event,title,items,note='') {
  $('tooltip').innerHTML=`<strong>${escape(title)}</strong><dl>${items.map(([a,b])=>`<dt>${escape(a)}</dt><dd>${escape(b)}</dd>`).join('')}</dl>${note?`<small>${escape(note)}</small>`:''}`;
  $('tooltip').hidden=false;moveTooltip(event);
}
function moveTooltip(event) {const box=$('tooltip'),rect=event.currentTarget?.getBoundingClientRect?.();const x=event.clientX||rect?.x||20,y=event.clientY||rect?.y||20;box.style.left=`${Math.max(8,Math.min(x+14,innerWidth-box.offsetWidth-10))}px`;box.style.top=`${Math.max(8,Math.min(y+14,innerHeight-box.offsetHeight-10))}px`;}
function hideTooltip() {$('tooltip').hidden=true;}
function interactive(selection,onSelect,onTip) {
  selection.attr('tabindex',0).attr('role','button').on('click',onSelect).on('keydown',(event,row)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(event,row);}}).on('mouseenter',onTip).on('focus',onTip).on('mousemove',moveTooltip).on('mouseleave',hideTooltip).on('blur',hideTooltip);
}
function selectCountry(noc) {state.noc=noc===state.noc?'':noc;reconcile();render();}
function metricValue(row) {return state.metric==='rate'?(row.athletes?row.medals/row.athletes*100:0):row[state.metric];}
function renderEconomy() {
  const all=rowsForEdition(data,state),rows=all.filter(r=>r.gdp>0&&r.athletes>0);
  const previousPositions=new Map();
  d3.select('#economy-chart').selectAll('.point').each(function(row){previousPositions.set(row.noc,{x:+this.getAttribute('cx'),y:+this.getAttribute('cy')});});
  const {plot,width:w,height:h}=svgFrame('economy-chart');
  const seasonRows=data.countries.filter(r=>r.season===state.season&&r.gdp>0);
  const x=d3.scaleLog().domain([Math.max(1,d3.min(seasonRows,r=>r.gdp)*.8||100),d3.max(seasonRows,r=>r.gdp)*1.1||100000]).range([0,w]);
  const seriesRows=state.sport?data.sports.filter(r=>r.season===state.season&&r.sport===state.sport):seasonRows;
  const max=d3.max(seriesRows,r=>metricValue(r))||1;
  const y=d3.scaleLinear().domain([0,max*1.12]).nice().range([h,0]);
  plot.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''));
  plot.append('g').attr('class','axis').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(4,v=>v>=1000?`${decimal(v/1000)}k`:number(v)));
  plot.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(4));
  plot.append('text').attr('class','chart-label').attr('x',w/2).attr('y',h+31).attr('text-anchor','middle').text('PIB / habitant · $ PPA 2011 · échelle logarithmique');
  plot.append('text').attr('class','chart-label').attr('x',0).attr('y',-6).text(display[state.metric]);
  const radius=d3.scaleSqrt().domain([0,d3.max(seriesRows,r=>r.athletes)||1]).range([0,12]);
  const rho=spearman(rows,r=>r.gdp,metricValue);
  if(rho!==null)plot.append('text').attr('x',w).attr('y',10).attr('text-anchor','end').attr('class','chart-label').text(`ρ = ${correlation(rho)}`);
  // Une ligne de médiane donne un repère descriptif sans suggérer une causalité.
  if(rows.length){const median=d3.median(rows,r=>metricValue(r));plot.append('line').attr('x2',w).attr('y1',y(median)).attr('y2',y(median)).attr('stroke','#8e9d80').attr('stroke-dasharray','4 4');}
  const selected=rows.find(r=>r.noc===state.noc);
  const circles=plot.selectAll('.point').data([...rows].sort((a,b)=>b.athletes-a.athletes||a.noc.localeCompare(b.noc))).join('circle').attr('class',r=>`point ${r.noc===state.noc?'selected':''}`).attr('cx',r=>x(r.gdp)).attr('cy',r=>y(metricValue(r))).attr('r',r=>Math.max(2.5,radius(r.athletes))).attr('fill',r=>colors[r.continent]||colors.Autre).attr('opacity',r=>!state.noc||r.noc===state.noc?1:.35).attr('aria-label',r=>`${r.name}, ${number(r.medals)} médailles`);
  if(!reducedMotion&&previousPositions.size)circles.attr('cx',r=>previousPositions.get(r.noc)?.x??x(r.gdp)).attr('cy',r=>previousPositions.get(r.noc)?.y??y(metricValue(r))).transition().duration(420).ease(d3.easeCubicOut).attr('cx',r=>x(r.gdp)).attr('cy',r=>y(metricValue(r)));
  interactive(circles,(_,row)=>selectCountry(row.noc),(event,row)=>tooltip(event,row.name,[['PIB / habitant',`${number(row.gdp)} $ PPA`],['Médailles',number(row.medals)],['Athlètes',number(row.athletes)],['Médailles / 100 athlètes',decimal(row.medals/row.athletes*100)]],'Cliquez pour suivre ce pays.'));
  if(selected)plot.append('text').attr('x',Math.min(w-3,x(selected.gdp)+8)).attr('y',Math.max(12,y(metricValue(selected))-12)).attr('text-anchor',x(selected.gdp)>w*.85?'end':'start').attr('font-size',10).attr('font-weight',700).attr('fill','#234d3d').text(selected.noc);
  if(!rows.length)empty(plot,w,h);
  const relation=rho===null?'Le nombre de pays est insuffisant pour mesurer un lien.':rho>.5?'Les pays plus riches tendent à avoir des valeurs plus élevées.':rho>.2?'Le lien avec la richesse est positif, mais loin d’être systématique.':rho<-.2?'Le lien avec la richesse est négatif dans cette sélection.':'Le lien avec la richesse est faible dans cette sélection.';
  $('economy-insight').innerHTML=selected?`<strong>${escape(selected.name)}</strong> : ${number(selected.medals)} médailles pour ${number(selected.athletes)} inscrits, soit <strong>${decimal(selected.medals/selected.athletes*100)} pour 100</strong>. Explorez sa trajectoire.`:`<strong>${relation}</strong> ${rho!==null?`Corrélation de rang : ${correlation(rho)} sur ${number(rows.length)} pays.`:''}`;
  $('economy-coverage').textContent=`PIB disponible pour ${rows.length}/${all.length} délégations. Échelles fixes dans le temps. Pays sans PIB conservés dans les autres vues. Cliquez pour suivre un pays ; ratios fragiles sur petits effectifs.`;
}
function renderSpecialization() {
  const all=data.sports.filter(r=>r.season===state.season&&r.year===state.year);
  const countries=data.countries.filter(r=>r.season===state.season&&r.year===state.year&&r.medals>0).sort((a,b)=>b.medals-a.medals);
  const sportRanks=d3.rollups(all,r=>d3.sum(r,x=>x.medals),r=>r.sport).sort((a,b)=>b[1]-a[1]);
  heatSports=[...(state.sport?[state.sport]:[]),...sportRanks.map(r=>r[0]).filter(s=>s!==state.sport)].slice(0,8);
  const leaders=countries.slice(0,5);
  const specialists=countries.filter(r=>r.medals>=3&&!leaders.includes(r)).map(r=>({...r,score:d3.max(heatSports,s=>specialization(data,state,r.noc,s).lq||0)})).sort((a,b)=>b.score-a.score).slice(0,4);
  const pinned=state.noc?data.countries.filter(r=>r.season===state.season&&r.year===state.year&&r.noc===state.noc):[];
  heatRows=[...new Map([...pinned,...leaders,...specialists].map(r=>[r.noc,r])).values()].slice(0,9);
  const {plot,width:w,height:h}=svgFrame('specialization-chart',{left:100,top:10,right:10,bottom:65});
  const x=d3.scaleBand().domain(heatSports).range([0,w]).padding(.06),y=d3.scaleBand().domain(heatRows.map(r=>r.noc)).range([0,h]).padding(.08);
  const cells=heatRows.flatMap(r=>heatSports.map(s=>({...specialization(data,state,r.noc,s),noc:r.noc,name:r.name,sport:s})));
  const color=state.heat==='specialization'?d3.scaleSequentialLog(d3.interpolateRgbBasis(['#edf1e6','#bfd2a5','#719775','#245b4c'])).domain([.25,8]).clamp(true):d3.scaleSequential(d3.interpolateGreens).domain([0,d3.max(cells,r=>r.medals)||1]);
  plot.selectAll('.country-name').data(heatRows).join('text').attr('class','heat-label').attr('x',-8).attr('y',r=>y(r.noc)+y.bandwidth()/2+3).attr('text-anchor','end').attr('font-weight',r=>r.noc===state.noc?700:400).text(r=>shortName(r.name,18));
  plot.selectAll('.sport-name').data(heatSports).join('text').attr('class','heat-label').attr('transform',s=>`translate(${x(s)+x.bandwidth()/2},${h+11}) rotate(-36)`).attr('text-anchor','end').text(s=>shortName(s,17));
  const rectangles=plot.selectAll('.cell').data(cells).join('rect').attr('class','cell').attr('x',r=>x(r.sport)).attr('y',r=>y(r.noc)).attr('width',x.bandwidth()).attr('height',y.bandwidth()).attr('rx',3).attr('fill',r=>r.medals?color(state.heat==='specialization'?r.lq:r.medals):'#f2f4ee').attr('stroke',r=>r.noc===state.noc&&r.sport===state.sport?'#a17730':'#fff').attr('aria-label',r=>`${r.name}, ${r.sport}, ${number(r.medals)} médailles, spécialisation ${decimal(r.lq)}`);
  interactive(rectangles,(_,r)=>{state.noc=r.noc;state.sport=r.sport;reconcile();render();},(event,r)=>tooltip(event,`${r.name} · ${r.sport}`,[['Médailles',number(r.medals)],['Spécialisation',r.lq==null?'—':`× ${decimal(r.lq)}`],['Part des médailles du pays',r.ownMedals?`${decimal(r.medals/r.ownMedals*100)} %`:'—']],'×2 : ce sport pèse deux fois plus dans les médailles du pays que dans celles du monde.'));
  plot.selectAll('.cell-number').data(cells.filter(r=>r.medals>0)).join('text').attr('x',r=>x(r.sport)+x.bandwidth()/2).attr('y',r=>y(r.noc)+y.bandwidth()/2+3).attr('text-anchor','middle').attr('font-size',8).attr('fill',r=>(state.heat==='specialization'?r.lq>2:r.medals>(d3.max(cells,r=>r.medals)||1)*.5)?'#fff':'#42583c').attr('pointer-events','none').text(r=>state.heat==='specialization'?`×${decimal(r.lq)}`:r.medals);
  const positive=cells.filter(r=>r.lq>0).sort((a,b)=>b.lq-a.lq), best=positive.find(r=>(!state.noc||r.noc===state.noc)&&(!state.sport||r.sport===state.sport))||positive[0];
  $('specialization-insight').innerHTML=best?`<strong>${escape(best.name)} · ${escape(best.sport)}</strong> : ${number(best.medals)} médaille${best.medals>1?'s':''}. Cette discipline y pèse <strong>${decimal(best.lq)} fois</strong> sa part mondiale.`:'Aucune médaille dans cette sélection. La spécialisation ne peut pas être calculée.';
  $('heat-legend').innerHTML=`${state.heat==='specialization'?'×0,25':'0'} <i></i> ${state.heat==='specialization'?'×8+':'max.'}`;
  if(!cells.length)empty(plot,w,h);
}
function shortName(text,max=22) {return text.length>max?`${text.slice(0,max-1)}…`:text;}
function profileSelection({cohort='all',level=state.level}={}) {
  return data.profiles.filter(r=>r.season===state.season&&r.year===state.year&&r.level===level&&r.cohort===cohort&&(state.sex==='compare'||r.sex===state.sex));
}
function renderAnatomy() {
  const {plot,width:w,height:h}=svgFrame('anatomy-chart',{left:126,right:14,top:12,bottom:32});
  let rows=profileSelection();
  if(state.level==='event') {
    const chosen=state.sport||(rows.some(r=>r.sport==='Boxing')?'Boxing':rows[0]?.sport);
    rows=rows.filter(r=>r.sport===chosen);
  }
  let names=d3.rollups(rows,r=>d3.mean(r,x=>x[state.measure]?.median),r=>state.level==='event'?r.event:r.sport).filter(r=>Number.isFinite(r[1])).sort((a,b)=>b[1]-a[1]);
  if(state.level==='sport'&&state.sport)names=names.filter(r=>r[0]===state.sport);
  // Vue d'ensemble lisible : extrêmes et profils centraux. Le détail donne toutes les distributions.
  if(names.length>7) {
    const indices=[0,1,Math.floor(names.length*.33),Math.floor(names.length*.5),Math.floor(names.length*.67),names.length-2,names.length-1];
    names=indices.map(i=>names[i]);
  }
  const domain=names.map(r=>r[0]);
  anatomyRows=rows.filter(r=>domain.includes(state.level==='event'?r.event:r.sport));
  const globalProfiles=data.profiles.filter(r=>r.season===state.season&&r.level===state.level&&r.cohort==='all'&&r[state.measure]);
  const extent=[d3.min(globalProfiles,r=>r[state.measure].p10),d3.max(globalProfiles,r=>r[state.measure].p90)];
  const x=d3.scaleLinear().domain(extent.every(Number.isFinite)?extent:[0,1]).nice().range([0,w]);
  const y=d3.scaleBand().domain(domain).range([0,h]).padding(.28);
  plot.append('g').attr('class','grid').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(5).tickSize(-h).tickFormat(''));
  plot.append('g').attr('class','axis').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(5));
  plot.append('text').attr('class','chart-label').attr('text-anchor','end').attr('x',w).attr('y',h+29).text(`${display[state.measure]} (${units[state.measure]}) · échelle fixe dans le temps`);
  const labelText=row=>state.level==='event'?row.replace(/, (Men|Women|Mixed|Open)$/,''):row;
  plot.selectAll('.profile-label').data(domain).join('text').attr('class','heat-label').attr('x',-8).attr('y',name=>y(name)+y.bandwidth()/2+3).attr('text-anchor','end').text(name=>shortName(labelText(name),22));
  const boxes=plot.selectAll('.box').data(anatomyRows.filter(r=>r[state.measure])).join('g').attr('class','box').attr('transform',r=>{
    const key=state.level==='event'?r.event:r.sport;return `translate(0,${y(key)+y.bandwidth()/2+(state.sex==='compare'&&state.level==='sport'?(r.sex==='F'?-4:4):0)})`;
  }).attr('aria-label',r=>`${r.sport}, ${r.sex==='F'?'femmes':'hommes'}, médiane ${decimal(r[state.measure].median)} ${units[state.measure]}`);
  boxes.each(function(row){const s=row[state.measure],g=d3.select(this),color=colors[row.sex];
    g.append('line').attr('x1',x(s.p10)).attr('x2',x(s.p90)).attr('stroke',color).attr('stroke-width',1.4);
    g.append('rect').attr('x',x(s.q1)).attr('y',-3.5).attr('width',Math.max(1,x(s.q3)-x(s.q1))).attr('height',7).attr('rx',1).attr('fill',color).attr('fill-opacity',.35).attr('stroke',color);
    g.append('line').attr('x1',x(s.median)).attr('x2',x(s.median)).attr('y1',-5).attr('y2',5).attr('stroke',color).attr('stroke-width',2);
    g.append('rect').attr('x',x(s.p10)-3).attr('y',-7).attr('width',Math.max(8,x(s.p90)-x(s.p10)+6)).attr('height',14).attr('fill','transparent');
  });
  interactive(boxes,(_,r)=>{state.sport=r.sport;state.level=state.level==='sport'?'event':'sport';reconcile();render();},(event,r)=>{const s=r[state.measure];tooltip(event,`${state.level==='event'?r.event:r.sport} · ${r.sex==='F'?'Femmes':'Hommes'}`,[['Médiane',`${decimal(s.median)} ${units[state.measure]}`],['50 % centraux',`${decimal(s.q1)}–${decimal(s.q3)}`],['10e–90e percentiles',`${decimal(s.p10)}–${decimal(s.p90)}`],['Mesures disponibles',`${number(s.n)} / ${number(r.total)}`]],'Cliquez pour changer le niveau discipline / épreuve.');});
  const valid=anatomyRows.filter(r=>r[state.measure]), widest=[...valid].sort((a,b)=>(b[state.measure].q3-b[state.measure].q1)-(a[state.measure].q3-a[state.measure].q1))[0];
  $('anatomy-insight').innerHTML=widest?`<strong>${escape(state.level==='event'?widest.event:widest.sport)} · ${widest.sex==='F'?'femmes':'hommes'}</strong> : les 50 % centraux vont de <strong>${decimal(widest[state.measure].q1)} à ${decimal(widest[state.measure].q3)} ${units[state.measure]}</strong>. ${state.level==='sport'?'Cliquez pour distinguer les épreuves.':'Les catégories ne sont pas nécessairement comparables entre sexes.'}`:'Aucune mesure disponible. Les valeurs manquantes ne sont pas remplacées.';
  if(state.level==='event'&&!state.sport)$('anatomy-insight').innerHTML+=` <span class="tag">Exemple : ${escape(anatomyRows[0]?.sport||'aucun')}</span>`;
  if(!valid.length)empty(plot,w,h);
}
function renderHost() {
  const hosts=data.hosts.filter(r=>r.season===state.season), host=hosts.find(r=>r.year===state.hostYear); selectedHost=host;
  const series=hostSeries(data,state,host), {plot,width:w,height:h}=svgFrame('host-chart');
  const x=d3.scalePoint().domain([-3,-2,-1,0,1,2,3]).range([0,w]).padding(.15);
  const values=series.points.filter(r=>r.index!==null), max=Math.max(150,d3.max(values,r=>r.index)||0);
  const y=d3.scaleLinear().domain([0,max*1.1]).nice().range([h,0]);
  plot.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''));
  plot.append('rect').attr('x',x(0)-w/16).attr('width',w/8).attr('height',h).attr('fill','#edf2e1');
  plot.append('line').attr('x2',w).attr('y1',y(100)).attr('y2',y(100)).attr('stroke','#8c9a7b').attr('stroke-dasharray','4 4');
  plot.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(4));
  plot.append('g').attr('class','axis').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).tickSize(0).tickPadding(10).tickFormat(v=>v===0?'HÔTE':v<0?`${v} éd.`:`+${v} éd.`));
  plot.append('text').attr('class','chart-label').attr('x',0).attr('y',-6).text('Part des médailles · indice base 100');
  plot.append('path').datum(series.points).attr('d',d3.line().defined(r=>r.index!==null).x(r=>x(r.offset)).y(r=>y(r.index))).attr('fill','none').attr('stroke','#2d6951').attr('stroke-width',2.5);
  const circles=plot.selectAll('.host-point').data(values).join('circle').attr('cx',r=>x(r.offset)).attr('cy',r=>y(r.index)).attr('r',r=>r.offset===0?6:3.5).attr('fill',r=>r.offset===0?'#bd9654':'#2d6951').attr('stroke','#fff').attr('stroke-width',1.5).attr('aria-label',r=>`${r.year}, indice ${decimal(r.index)}, ${r.medals} médailles`);
  interactive(circles,(_,r)=>{state.year=r.year;state.noc=host.noc;reconcile();render();},(event,r)=>tooltip(event,`${host?.name} · ${r.year}`,[['Indice',decimal(r.index)],['Médailles',number(r.medals)],['Part mondiale',`${decimal(r.share*100)} %`],['Athlètes',number(r.athletes)]],'Cliquez pour explorer cette édition dans les autres vues.'));
  const current=values.find(r=>r.offset===0);
  if(current){plot.append('text').attr('x',x(0)+10).attr('y',Math.max(14,y(current.index)-10)).attr('fill','#7b673e').attr('font-size',11).attr('font-weight',700).text(`${current.index>=100?'+':''}${number(current.index-100)} %`);}
  $('host-insight').innerHTML=current?`À <strong>${escape(host.city)} ${host.year}</strong>, la part des médailles de ${escape(host.name)} est <strong>${decimal(Math.abs(current.index-100))} % ${current.index>=100?'au-dessus':'en dessous'}</strong> de son niveau antérieur (${series.previous} éditions).`:`<strong>${host?escape(`${host.city} ${host.year}`):'Aucun hôte disponible'}</strong> : référence insuffisante pour cette discipline et cette période. Choisissez un autre hôte ou retirez le filtre discipline.`;
  if(!values.length)empty(plot,w,h,'Référence avant accueil indisponible.');
}

function openDetail(kind) {activeDetail=kind;renderDetail(kind);if(!$('detail-dialog').open)$('detail-dialog').showModal();hideTooltip();}
function table(headers,rows) {return `<div style="overflow:auto"><table><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function buttonCell(label,noc,sport='') {return `<button data-country="${escape(noc)}" data-sport="${escape(sport)}">${escape(label)}</button>`;}
function renderDetail(kind) {
  const content=$('detail-content');$('detail-kicker').textContent='EXPLORER LES DONNÉES · '+state.year;
  if(kind==='economy') {
    $('detail-title').textContent='Les ressources et les résultats';
    const rows=rowsForEdition(data,state).sort((a,b)=>metricValue(b)-metricValue(a)),selected=rows.find(r=>r.noc===state.noc);
    content.innerHTML=`<p class="detail-copy">${selected?`Trajectoire de <strong>${escape(selected.name)}</strong>. Les éditions sans inscription sont des interruptions, pas des zéros.`:'Sélectionnez un pays dans le tableau pour afficher son évolution temporelle.'} Les ratios rapportent des médailles nationales à des inscrits : les sports collectifs y sont défavorisés.</p><div id="country-trend" class="detail-chart" ${selected?'':'hidden'}></div>${table(['Pays','PIB / hab.','Athlètes','Médailles','Médailles / 100'],rows.map(r=>[buttonCell(r.name,r.noc),number(r.gdp),number(r.athletes),number(r.medals),decimal(r.medals/r.athletes*100)]))}`;
    if(selected)drawCountryTrend(selected);
  }else if(kind==='specialization') {
    $('detail-title').textContent='Quels sports font les médailles d’un pays ?';
    const country=data.countries.find(r=>r.season===state.season&&r.year===state.year&&r.noc===state.noc)||heatRows[0];
    if(!country){content.innerHTML='<p>Aucune médaille disponible.</p>';return;}
    const sports=data.sports.filter(r=>r.season===state.season&&r.year===state.year&&r.noc===country.noc).sort((a,b)=>b.medals-a.medals);
    content.innerHTML=`<p class="detail-copy"><strong>${escape(country.name)}</strong> · ${number(country.medals)} médailles. La spécialisation est le rapport entre la part de ce sport dans les médailles du pays et sa part mondiale. Un grand indice sur une seule médaille reste fragile.</p>${table(['Discipline','Médailles','Part du pays','Indice relatif'],sports.map(r=>{const s=specialization(data,state,country.noc,r.sport);return [buttonCell(r.sport,country.noc,r.sport),number(r.medals),country.medals?`${decimal(r.medals/country.medals*100)} %`:'—',s.lq===null?'—':`×${decimal(s.lq)}`];}))}`;
  }else if(kind==='anatomy') {
    $('detail-title').textContent='Des distributions, pas un corps « idéal »';
    const sport=state.sport||anatomyRows[0]?.sport;
    const all=profileSelection({level:'event'}).filter(r=>r.sport===sport&&r[state.measure]);
    content.innerHTML=`<p class="detail-copy"><strong>${escape(sport||'Aucune discipline')}</strong> · ${display[state.measure]} en ${units[state.measure]}. Chaque athlète compte une fois par épreuve, édition et sexe. Les distributions sont mondiales : le pays suivi ne réduit pas cet échantillon. Les mensurations biographiques ne sont pas datées ; elles ne décrivent pas nécessairement le corps de l’athlète à cette édition.</p><p class="notice">Pour les sports à catégories, comparez d’abord les épreuves. Les classes de poids changent avec les éditions et diffèrent entre sexes. Aucune correspondance automatique entre catégories féminines et masculines n’est imposée.</p>${table(['Épreuve','Sexe','Mesurés / inscrits','Médiane','50 % centraux','Médiane des médaillés'],all.sort((a,b)=>a[state.measure].median-b[state.measure].median).map(r=>{const s=r[state.measure];const medal=data.profiles.find(p=>p.season===r.season&&p.year===r.year&&p.sport===r.sport&&p.level===r.level&&p.event===r.event&&p.sex===r.sex&&p.cohort==='medalists')?.[state.measure];return [escape(r.event),r.sex==='F'?'Femmes':'Hommes',`${number(s.n)} / ${number(r.total)}`,decimal(s.median),`${decimal(s.q1)}–${decimal(s.q3)}`,medal?`${decimal(medal.median)} (n=${medal.n})`:'—'];}))}<p class="detail-copy">Données d’inscription et de mesure : elles ne permettent pas de déduire qu’un gabarit cause la performance. Le tableau compare les médaillés aux inscrits à titre descriptif.</p>`;
  }else if(kind==='host') {
    $('detail-title').textContent='Avant, pendant, après les Jeux';
    const series=hostSeries(data,state,selectedHost);
    const comparable=data.hosts.filter(r=>r.season===state.season).map(host=>({host,series:hostSeries(data,state,host)})).filter(r=>r.series.baseline>0&&r.series.points.find(p=>p.offset===0)?.index!==null);
    const positive=comparable.filter(r=>r.series.points.find(p=>p.offset===0)?.index>100);
    content.innerHTML=`<p class="detail-copy"><strong>${escape(selectedHost?.city||'')} ${selectedHost?.year||''}</strong>. La part mondiale des médailles neutralise en partie la croissance du programme. La référence est la moyenne des trois éditions précédentes disponibles (au moins deux requises).</p>${table(['Position','Année','Médailles','Part mondiale','Indice'],series.points.map(r=>[r.offset===0?'Hôte':`${r.offset>0?'+':''}${r.offset} édition(s)`,number(r.year),number(r.medals),r.share===null?'—':`${decimal(r.share*100)} %`,decimal(r.index)]))}<p class="notice">${positive.length}/${comparable.length} hôtes comparables dépassent leur référence antérieure pour ce filtre. Ce décompte ne mesure pas un effet causal. Boycotts (notamment 1980 et 1984), disparition de pays, investissements et sélection des hôtes compliquent la comparaison.</p>${table(['Autres éditions hôtes','Écart à la référence'],comparable.map(r=>[buttonHost(r.host),`${decimal(r.series.points.find(p=>p.offset===0).index-100)} %`]))}`;
  }else {renderMethod(kind);return;}
  content.querySelectorAll('[data-country]').forEach(button=>button.addEventListener('click',()=>{state.noc=button.dataset.country;if(button.dataset.sport)state.sport=button.dataset.sport;reconcile();render();}));
  content.querySelectorAll('[data-host]').forEach(button=>button.addEventListener('click',()=>{state.hostYear=+button.dataset.host;reconcile();render();}));
}
function buttonHost(host) {return `<button data-host="${host.year}">${escape(host.city)} ${host.year} · ${escape(host.name)}</button>`;}
function drawCountryTrend(country) {
  const node=$('country-trend'); if(!node)return;
  const {plot,width:w,height:h}=svgFrame('country-trend',{left:42,top:20,bottom:32});
  const rows=years.map(year=>({year,row:rowsForEdition(data,state,year).find(r=>r.noc===country.noc)}));
  const x=d3.scalePoint().domain(years).range([0,w]),y=d3.scaleLinear().domain([0,d3.max(rows,r=>r.row?metricValue(r.row):0)*1.1||1]).nice().range([h,0]);
  plot.append('g').attr('class','axis').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).tickValues(years.filter((_,i)=>i%Math.max(1,Math.ceil(years.length/8))===0)));
  plot.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(4));
  plot.append('text').attr('class','chart-label').attr('y',-7).text(display[state.metric]);
  plot.append('path').datum(rows).attr('d',d3.line().defined(r=>!!r.row).x(r=>x(r.year)).y(r=>y(metricValue(r.row)))).attr('stroke','#245b4c').attr('fill','none').attr('stroke-width',2);
  const circles=plot.selectAll('circle').data(rows.filter(r=>r.row)).join('circle').attr('cx',r=>x(r.year)).attr('cy',r=>y(metricValue(r.row))).attr('r',r=>r.year===state.year?5:3).attr('fill',r=>r.year===state.year?'#ba8848':'#245b4c');
  interactive(circles,(_,r)=>{state.year=r.year;reconcile();render();},(event,r)=>tooltip(event,`${country.name} ${r.year}`,[[display[state.metric],decimal(metricValue(r.row))]]));
}
function renderMethod(kind) {
  $('detail-title').textContent=kind==='review'?'Le projet face aux consignes':'Ce que les données permettent de dire';
  $('detail-content').innerHTML=`<p class="detail-copy">Question générale : comment les ressources, les spécialisations sportives, la diversité des athlètes et l’accueil des Jeux s’articulent-ils avec les résultats olympiques ?</p>
  <section class="method-section"><h3>Un pipeline commun aux quatre vues</h3><p>CSV bruts → jointure résultats / biographies par athlete_id → édition, saison et NOC → athlètes uniques et médailles nationales → jointure NOC / ISO et PIB-population Maddison annuels → distributions, spécialisations et indices avant/après → positions, tailles, couleurs et boîtes D3.</p><p><strong>Changer de dataset :</strong> utilisez le sélecteur Olympedia / historique ou importez un export JSON au même schéma. Le fichier est validé avant remplacement ; il reste dans votre navigateur. L’export inclut les quatre tables normalisées. Été/hiver partagent également le même pipeline.</p></section>
  <section class="method-section"><h3>Quatre techniques, deux niveaux chacune</h3>${table(['Question','Vue d’ensemble','Détail'],[['La richesse fait-elle gagner ?','Nuage de points PIB / résultats','Trajectoire du pays, tableau chiffré'],['À chaque pays ses disciplines ?','Matrice de spécialisation','Toutes les disciplines et leurs parts'],['Un sport, un seul gabarit ?','Distributions par sexe et discipline','Épreuves/catégories, couverture, médaillés'],['Accueillir les Jeux change-t-il la donne ?','Série temporelle normalisée avant/après','Valeurs brutes, comparaison des hôtes']])}</section>
  <section class="method-section"><h3>Pour qui, pour quoi ?</h3><p><strong>Curieux :</strong> trouver son pays, repérer des disciplines et lire une conclusion simple. <strong>Journalistes :</strong> identifier des exceptions, comparer des éditions et vérifier les valeurs. <strong>Analystes sportifs :</strong> comparer spécialisation et distributions par épreuve ; aucune prescription de sélection des athlètes.</p></section>
  <section class="method-section"><h3>Couverture et limites</h3><ul><li>Olympedia : résultats disponibles jusqu’à 2020 en été et 2022 en hiver. Paris 2024 existe dans le catalogue, mais pas dans les résultats fournis.</li><li>PIB en dollars internationaux PPA 2011, population de l’année nominale des Jeux. Les pays sans jointure économique restent visibles ailleurs.</li><li>Une médaille collective n’est comptée qu’une fois pour l’équipe ; deux médaillés individuels d’un même pays et d’une même couleur sont distincts.</li><li>Les inscrits incluent les DNS. Les sexes proviennent de la classification binaire de la source. Taille et poids sont biographiques, sans date de mesure ; les plages de poids sont considérées manquantes.</li><li>Âge Olympedia estimé par année de naissance et année effective (2021 pour Tokyo). L’ancienne source fournit son âge directement.</li><li>Corps et distributions sont mondiaux, indépendamment du pays mis en évidence. Le pays n’est pas un filtre d’échantillon anatomique.</li><li>Les catégories et frontières historiques ne sont pas fusionnées artificiellement. Les deux sources n’ont pas exactement la même nomenclature des disciplines.</li></ul></section>
  <section class="method-section"><h3>Livrables et points à valider</h3><p>La page est une démonstration exécutable D3 avec filtres, sélection liée, lecture temporelle, changement de dataset et détails. L’audit complet et la trame de rapport sont dans <a href="docs/AUDIT_ET_RAPPORT.md" target="_blank" rel="noopener">docs/AUDIT_ET_RAPPORT.md</a>. La validation du dataset par Aline ou Marco, l’attribution d’une vue à chaque étudiant et le rapport final de 15 pages restent à confirmer par l’équipe.</p></section>
  <section class="method-section"><h3>Contrôles croisés des médailles</h3><p>${state.source==='olympedia'?'Trois écarts internes subsistent entre les résultats individuels et le tableau des médailles fourni : KOR 1992 été (28 / 29), CAN 2022 hiver (27 / 26), USA 2022 hiver (27 / 25). Les comptes des résultats sont conservés pour garder une décomposition cohérente par sport.':'Chaque source garde sa photographie historique des résultats. Les révisions rétrospectives peuvent modifier les médailles.'}</p></section>
  <section class="method-section"><h3>Sources</h3><div class="link-row"><a href="https://www.kaggle.com/datasets/josephcheng123456/olympic-historical-dataset-from-olympediaorg" target="_blank" rel="noopener">Kaggle · Olympedia, Joseph Cheng ↗</a><a href="https://www.kaggle.com/datasets/heesoo37/120-years-of-olympic-history-athletes-and-results" target="_blank" rel="noopener">Kaggle · 120 years of Olympic history ↗</a><a href="https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023?lang=en" target="_blank" rel="noopener">Maddison Project 2023 ↗</a></div><p>Les fichiers Olympedia du dépôt correspondent au schéma de cette collecte Kaggle. L’équipe doit confirmer la date exacte de son extraction. Les anciennes pages autonomes, dont <a href="visualizations/economie/index.html">l’économie étendue aux paralympiques</a>, restent accessibles comme références.</p></section>`;
}

function bind() {
  $('dataset').addEventListener('change',e=>loadSource(e.target.value));
  $('season').addEventListener('change',e=>{stop();state.season=e.target.value;reconcile();render();});
  $('year').addEventListener('input',e=>{state.year=years[+e.target.value];if(data.hosts.some(r=>r.season===state.season&&r.year===state.year))state.hostYear=state.year;reconcile();render();});
  $('country').addEventListener('change',e=>{state.noc=e.target.value;const host=data.hosts.find(r=>r.season===state.season&&r.noc===state.noc);if(host)state.hostYear=host.year;reconcile();render();});
  $('sport').addEventListener('change',e=>{state.sport=e.target.value;reconcile();render();});
  for(const [id,key] of [['economy-metric','metric'],['specialization-metric','heat'],['anatomy-measure','measure'],['anatomy-sex','sex'],['anatomy-level','level']])$(id).addEventListener('change',e=>{state[key]=e.target.value;render();});
  $('host-edition').addEventListener('change',e=>{state.hostYear=+e.target.value;state.year=state.hostYear;state.noc=data.hosts.find(r=>r.season===state.season&&r.year===state.hostYear)?.noc||'';reconcile();render();});
  $('play').addEventListener('click',()=>{if(timer){stop();return;}if(years.indexOf(state.year)===years.length-1){state.year=years[0];reconcile();render();}$('play').textContent='Ⅱ';$('play').setAttribute('aria-pressed','true');timer=setInterval(()=>{const i=years.indexOf(state.year);if(i===years.length-1){stop();return;}state.year=years[i+1];if(data.hosts.some(r=>r.season===state.season&&r.year===state.year))state.hostYear=state.year;reconcile();render();},reducedMotion?1800:1300);});
  $('reset').addEventListener('click',()=>{stop();state.noc='';state.sport='';state.year=years.at(-1);state.metric='medals';state.measure='height';state.sex='compare';state.level='sport';reconcile();render();});
  document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));
  $('method-button').addEventListener('click',()=>openDetail('method'));$('review-button').addEventListener('click',()=>openDetail('review'));
  $('close-dialog').addEventListener('click',()=>$('detail-dialog').close());$('detail-dialog').addEventListener('click',e=>{if(e.target===$('detail-dialog')&& (e.clientX<$('detail-dialog').getBoundingClientRect().left||e.clientX>$('detail-dialog').getBoundingClientRect().right))$('detail-dialog').close();});
  $('import-button').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try {if(file.size>40*1024*1024)throw new Error('Le fichier doit faire moins de 40 Mo.');const next=validateDataset(JSON.parse(await file.text()));stop();loaded.set('custom',next);d3.select('#dataset').selectAll('option.custom').data([next]).join('option').attr('class','custom').attr('value','custom').text('Dataset importé');data=next;state.source='custom';$('dataset').value='custom';$('error').hidden=true;reconcile();render();}catch(error){showError(error.message);}finally{e.target.value='';}
  });
  $('export-button').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`olympiques-${state.source}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
}

try {
  if(!window.d3)throw new Error('La bibliothèque D3 n’a pas été chargée.');
  const params=new URLSearchParams(location.search);
  for(const key of ['season','noc','sport'])if(params.has(key))state[key]=params.get(key);
  for(const key of ['year','hostYear'])if(params.has(key)&&Number.isFinite(+params.get(key)))state[key]=+params.get(key);
  bind();loadSource(params.get('source')==='historique'?'historique':'olympedia');
}catch(error){showError(error.message);}
