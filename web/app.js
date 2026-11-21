import {driverAccessMarkup, mountDriverAccess} from './driver/access.js';
import {legalItems, helpTopics} from './guidance.js';
import {seed, iconPaths} from './data.js';
import {currentSession, isRemembered, saveSession, demoPassword, makeDemoCredential, checkDemoPassword} from './demo-access.js';
import {dispatchAnswer, onDeviceAvailable, askOnDevice} from './aurora.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#dialog');
const feedback = document.querySelector('#feedback');
const assistant = document.querySelector('#aurora');
const storageKey = 'mouka-dispatch-demo-v1';
let state = structuredClone(seed);
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved?.fleet && saved?.trips && saved?.locations && saved?.activity && saved?.users) state = saved;
} catch {}
let current = '';
let filters = {};
let mapSelection = '';
let queueFilter = 'all';
const demoAdmin = {name:'Demo Administrator',email:'admin@example.com',role:'Administrator',status:'Active'};
let signedInEmail = currentSession();
if (signedInEmail !== demoAdmin.email && !state.users.some(u => u.email === signedInEmail && u.status === 'Active')) signedInEmail = '';
let pendingAccess;
let zoom = 1;
let navOpen = false;
let activityRead = false;
let authEmail = '';
let auroraOpen = false;
let auroraPending = false;
const auroraMessages = [];
const nav = [
  ['Operations', [['dispatch','Dispatch','grid'],['available','Available','truck'],['loading','Loading bay','bay'],['tracking','Live tracking','pin'],['deliveries','Deliveries','box']]],
  ['Administration', [['fleet','Fleet directory','list'],['verification','Verification','shield'],['users','Users & permissions','users'],['depots','Depot settings','settings']]]
];
const themeMedia = matchMedia('(prefers-color-scheme: dark)');
const themes = {system:['System','monitor'],light:['Light','sun'],dark:['Dark','moon']};
let themePreference = 'light';
try {
  const savedTheme = localStorage.getItem('mouka-appearance');
  if (Object.hasOwn(themes,savedTheme)) themePreference = savedTheme;
} catch {}
function applyTheme() {
  const dark = themePreference === 'dark' || (themePreference === 'system' && themeMedia.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#132131' : '#f6f9fc';
  app.querySelectorAll('[data-action="theme"]').forEach(button =>
    button.setAttribute('aria-pressed',String(button.dataset.id === themePreference)));
}
themeMedia.addEventListener('change',applyTheme);
applyTheme();

const fontSizes = {compact:'Compact',standard:'Standard',large:'Large',extraLarge:'Extra large'};
let fontSize = 'standard';
try {
  const savedSize = localStorage.getItem('mouka-font-size');
  if (Object.hasOwn(fontSizes,savedSize)) fontSize = savedSize;
} catch {}
document.documentElement.dataset.fontSize = fontSize;

const names = Object.fromEntries(nav.flatMap(([, items]) => items.map(([path,title]) => [path,title])));
const roles = ['Administrator','Dispatch','Loading','Fleet verification'];
const tone = {
  'Available':'green', 'Verified':'green', 'Accepted':'green', 'Active':'green', 'Delivered':'green',
  'In transit':'blue', 'Assigned':'blue', 'At bay':'blue', 'Invited':'blue','Suspended':'red',
  'Awaiting response':'amber', 'Loading':'amber', 'Pending review':'amber', 'Stale GPS':'amber',
  'Declined':'red', 'Rejected':'red', 'Needs corrections':'amber'
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.info}</svg>`;
const link = (path, label, look='secondary', symbol='') => `<a class="btn ${look}" href="#/${path}">${symbol ? icon(symbol) : ''}${esc(label)}</a>`;
const btn = (action, label, look='secondary', id='', symbol='') => `<button type="button" class="btn ${look}" data-action="${action}" data-id="${esc(id)}">${symbol ? icon(symbol) : ''}${esc(label)}</button>`;
const iconBtn = (action, label, symbol, extra='') => `<button type="button" class="icon-btn ${extra}" aria-label="${label}" title="${label}" data-action="${action}">${icon(symbol)}</button>`;
const chip = label => `<span class="pill ${tone[label] || ''}">${esc(label)}</span>`;
const truck = id => state.fleet.find(t => t.id === id);
const trip = id => state.trips.find(t => t.id === id);
const account = () => signedInEmail === demoAdmin.email ? demoAdmin : state.users.find(u => u.email === signedInEmail);
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
const rememberAccount = (email, remember=false) => {
  signedInEmail = email;
  saveSession(email,remember);
};
const active = () => state.trips.filter(t => t.status === 'In transit');
const loading = () => state.trips.filter(t => ['At bay','Loading','Accepted'].includes(t.status));
const pending = () => state.trips.filter(t => t.status === 'Awaiting response');
const available = () => state.fleet.filter(t => t.review === 'Verified' && t.status === 'Available' && !state.trips.some(x => x.truck === t.id && !['Delivered','Declined'].includes(x.status))).sort((a,b) => (a.eta ?? Infinity) - (b.eta ?? Infinity));
const stale = t => (t?.fresh ?? 100) >= 15;
const localTime = () => new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Lagos'}).format();
const logo = (label='Mouka') => `<img src="/assets/mouka.svg" alt="${label}">`;
const auroraMark = () => `<span class="aurora-mark" aria-hidden="true">${logo('')}</span>`;
const route = () => {
  if (location.hash.startsWith('#/')) {
    const path = location.hash.slice(2).replace(/\/$/,'') || 'dispatch';
    if (path === 'request') return 'available';
    if (path === 'requests') return 'dispatch';
    return path;
  }
  return ['/', '/index.html'].includes(location.pathname) ? (signedInEmail ? 'dispatch' : 'sign-in') : 'not-found';
};
const go = to => { if (current === to) render(); else location.hash = '/' + to; };
const tile = (symbol, look='') => `<span class="tile-icon ${look}">${icon(symbol)}</span>`;
const date = () => new Intl.DateTimeFormat('en-NG',{weekday:'long',day:'numeric',month:'long',timeZone:'Africa/Lagos'}).format(new Date(2026,10,20,12));
const notice = (text, type='info') => `<div class="notice ${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(({warn:'warning',error:'warning',success:'check'})[type] || 'info')}<span>${esc(text)}</span></div>`;
const pageSymbols = Object.fromEntries(nav.flatMap(([, items]) => items.map(([path,,symbol]) => [path,symbol])));
const head = (title, desc, actions='') => {
  const page = current.split('/')[0];
  return `<header class="page-head operation-head">
    <div class="operation-heading">${tile(pageSymbols[page] || (page === 'truck' ? 'truck' : 'box'))}
      <div><h1 tabindex="-1">${esc(title)}</h1><p>${esc(desc)}</p></div>
    </div>${actions ? `<div class="actions">${actions}</div>` : ''}
  </header>`;
};
const stageStrip = (label, records, stages, matches=(r,status)=>[r.status,r.review].includes(status)) => `<div class="stage-strip" role="group" aria-label="${esc(label)}">${stages.map(([status, caption, symbol]) =>
  `<button type="button" class="stage-cell" data-action="status-filter" data-id="${esc(status)}" aria-pressed="${(filters.status || '') === status}">
    ${icon(symbol)}<strong>${status ? records.filter(r => matches(r,status)).length : records.length}</strong><span>${esc(caption)}</span>
  </button>`).join('')}</div>`;
const statsStrip = (label, items) => `<dl class="stats-strip" aria-label="${esc(label)}">${items.map(([caption,value,symbol]) =>
  `<div>${icon(symbol)}<dt>${esc(caption)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;

const card = (title, desc, content, action='') => `<section class="card"><div class="card-head"><div><h2>${esc(title)}</h2>${desc ? `<p>${esc(desc)}</p>` : ''}</div>${action}</div>${content}</section>`;
const body = inner => `<div class="card-body">${inner}</div>`;
const empty = (title, desc, action='') => `<div class="empty">${tile('box')}<h2>${esc(title)}</h2><p>${esc(desc)}</p>${action}</div>`;
const field = (label, control) => `<label class="field"><span>${esc(label)}</span>${control}</label>`;
const option = (values, selected='') => values.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
const textField = (label, name, placeholder='', type='text') => field(label,`<input name="${name}" type="${type}" placeholder="${esc(placeholder)}" required aria-describedby="error-${name}"><span class="field-error" id="error-${name}"></span>`);
const kv = pairs => `<dl class="kv">${pairs.map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
const formActions = (label, cancel=true) => `<div class="actions">${cancel ? btn('close','Cancel') : ''}<button class="btn" type="submit">${esc(label)}</button></div>`;
const formError = '<div class="notice error" role="alert" data-form-error hidden></div>';
function save(message, mutate) {
  if (!navigator.onLine) {
    toast('Connection lost. Reconnect and try again.', 'error');
    return false;
  }
  const previous = structuredClone(state);
  try {
    mutate();
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    state = previous;
    toast('Your change could not be saved. Try again.', 'error');
    return false;
  }
  toast(message);
  return true;
}
function toast(message, type='success') {
  const wrap = document.createElement('div');
  wrap.innerHTML = notice(message,type);
  feedback.append(wrap.firstElementChild);
  const item = feedback.lastElementChild;
  setTimeout(() => item.remove(), 4300);
}
function log(title, detail, symbol='check') {
  state.activity.unshift([title,detail,localTime(),symbol]);
  activityRead = false;
}
function event(record, label) { record.events.unshift([label,localTime()]); }
function activity(limit=5) {
  return `<ul class="activity">${state.activity.slice(0,limit).map(([title,detail,time,symbol]) => `<li>${tile(symbol,symbol === 'warning' ? 'amber' : symbol === 'close' ? 'gray' : '')}<div class="event-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><time class="event-time">${esc(time)}</time></li>`).join('')}</ul>`;
}

const isMapped = vehicle => Array.isArray(vehicle?.demoPosition);
const demoDepotPosition = [443,367];
const demoRoute = [demoDepotPosition,[475,318],[501,278],[539,233],[608,182],[704,132]];
function mapContent(large=false) {
  const markers = active().map(t => [t,truck(t.truck)]).filter(([,t]) => isMapped(t));
  const selected = trip(mapSelection) || (!mapSelection ? markers[0]?.[0] : undefined);
  const selectedTruck = selected ? truck(selected.truck) : undefined;
  const marker = (coords, label, symbol, id, style='') => {
    const [x,y] = coords;
    return `<button type="button" class="map-marker ${style}" title="${esc(label)}" aria-label="${esc(label)}" aria-pressed="${(selected?.id || mapSelection) === id}" data-action="marker" data-id="${esc(id)}" style="left:${x/10}%;top:${y/6}%">${icon(symbol)}</button>`;
  };
  return `<div class="map ${large?'large':''} overview-map" role="region" aria-label="Simulated truck positions on a sample map">
    <div class="map-layer" style="transform:scale(${zoom});transform-origin:48% 64%">
      <img class="map-art" src="/assets/lagos.webp" alt="">
      <svg class="map-art" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        ${markers.some(([t]) => t.id==='MD-0042') ? `<polyline class="route" fill="none" stroke="#148752" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${demoRoute.map(p=>p.join(',')).join(' ')}"/>` : ''}
      </svg>
      ${marker(demoDepotPosition,'Demo Depot A','bay','depot','depot')}
      ${markers.map(([t,vehicle]) => marker(vehicle.demoPosition,`${t.id}, ${vehicle.location}`,'truck',t.id,stale(vehicle)?'stale':'')).join('')}
    </div>
    <div class="map-legend"><span><i class="dot"></i> Reporting</span><span><i class="dot warn"></i> Stale GPS</span></div>
    <div class="map-controls">${iconBtn('zoom-in','Zoom in','plus')}${iconBtn('zoom-out','Zoom out','minus')}${iconBtn('zoom-reset','Reset map zoom','target')}</div>
    <div class="attribution"><a href="https://www.arcgis.com/home/item.html?id=3b93337983e9436f8db950e38a8629af" target="_blank" rel="noopener">Esri, HERE, Garmin and contributors</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>
  </div>
    ${mapSelection === 'depot' ? `<div class="map-focus" aria-live="polite"><span class="map-focus-icon">${icon('bay')}</span><div><strong>Demo Depot A</strong><small>Loading and dispatch · Demo Region A</small></div></div>` : selected ? `<div class="map-focus" aria-live="polite">
      <span class="map-focus-icon">${icon('truck')}</span>
      <div><a href="#/trip/${selected.id}">${selected.id} <span>·</span> ${esc(selectedTruck?.plate)}</a>
      <small>${esc(selectedTruck?.location)} · ${selectedTruck?.fresh == null ? 'GPS age unavailable' : `${esc(selectedTruck.fresh)} min since GPS`}</small></div>
      ${chip(stale(selectedTruck) ? 'Stale GPS' : selected.status)}
    </div>` : `<div class="map-caption" aria-live="polite">${icon('pin')} Select a marker for details.</div>`}`;
}

function table(headers, rows, label, {blank='No records match the current filters.', mobile}={}) {
  if (!rows.length) return empty('No records found',blank,Object.values(filters).some(Boolean) ? btn('clear-filters','Clear filters','light') : '');
  return `<div class="registry">
    <div class="table-wrap" tabindex="0" role="region" aria-label="${esc(label)}">
      <table class="data-table registry-table" role="table">
        <thead role="rowgroup"><tr role="row">${headers.map(h=>`<th role="columnheader" scope="col" ${h?'':'class="registry-actions-heading"'}>${esc(h || 'Actions')}</th>`).join('')}</tr></thead>
        <tbody role="rowgroup">${rows.map(row=>`<tr role="row">${row.map((value,i)=>{
          const cell = i===0 ? 'th' : 'td';
          const attributes = i===0 ? 'scope="row" role="rowheader"' : 'role="cell"';
          const heading = headers[i];
          const cellClass = i===0?'registry-primary':!heading?'registry-actions':'';
          const hiddenOnMobile = i>0 && heading && mobile && !mobile.includes(heading);
          return `<${cell} ${attributes} class="${cellClass}${hiddenOnMobile?' registry-mobile-hidden':''}">
            ${i>0 && heading ? `<span class="registry-mobile-label" aria-hidden="true">${esc(heading)}</span>` : ''}${value}</${cell}>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="registry-footer">${rows.length} ${rows.length===1?'record':'records'}</div>
  </div>`;
}
function controls(placeholder, statuses=[], extraFields=[]) {
  const filterFields = statuses.length
    ? [{name:'status',label:'Status',all:'All statuses',choices:statuses.map(status=>[status,status])},...extraFields]
    : extraFields;
  const applied = filterFields.filter(({name})=>filters[name]).length;
  const id = 'registry-filter-options';
  return `<form class="filters registry-filters" data-form="filters">
    <div class="registry-search">${icon('search')}<input type="search" name="query" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}" value="${esc(filters.query)}"></div>
    ${filterFields.length ? `<button class="btn registry-filter-toggle" type="button" data-action="filter-options" aria-expanded="false" aria-controls="${id}">
      ${icon('filter')} Filters${applied ? ` <span class="filter-count" aria-label="${applied} applied">${applied}</span>` : ''}${icon('chevron')}
    </button>` : ''}
    ${filters.query || applied ? btn('clear-filters','Clear','light') : ''}
    ${filterFields.length ? `<div id="${id}" class="registry-filter-panel" hidden>
      <div class="registry-filter-fields">${filterFields.map(({name,label,all,choices})=>`<label class="field">
        <span>${esc(label)}</span><select name="${name}"><option value="">${esc(all)}</option>
        ${choices.map(([value,text])=>`<option value="${esc(value)}"${value===filters[name]?' selected':''}>${esc(text)}</option>`).join('')}</select>
      </label>`).join('')}</div>
      <button class="btn primary" type="submit">Apply filters</button>
    </div>` : ''}
  </form>`;
}
function matchQuery(record) {
  return !filters.query || JSON.stringify(record).toLowerCase().includes(filters.query.toLowerCase().trim());
}
function match(record) { return (!filters.status || [record.status,record.review].includes(filters.status)) && matchQuery(record); }

function numberedField(records,key,name,label,all,describe) {
  const numbers = new Map(records.map((record,index)=>[record[key],index+1]));
  return {name,label,all,numbers,choices:records.map(record=>[record[key],`${numbers.get(record[key])}. ${describe(record)}`])};
}
function optionField(records,name,label,all) {
  const values = [...new Set(records.map(record=>record[name]).filter(value=>value!=null && value!==''))];
  return {name,label,all,choices:values.sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})).map(value=>[String(value),String(value)])};
}
function matchesFields(record,...names) {
  return names.every(name=>!filters[name] || String(record[name])===filters[name]);
}
function vehicleField(vehicles,name='vehicle') {
  return numberedField(vehicles,'id',name,'Vehicle','All vehicles',v=>`${v.plate} · ${v.type}`);
}
function tripVehicleField(records) {
  const ids = new Set(records.map(t=>t.truck));
  return vehicleField(state.fleet.filter(v=>ids.has(v.id)),'truck');
}
function registryIdentity(title, detail, symbol, path='', number) {
  const emblem = number == null ? icon(symbol) : number;
  const identity = `<span class="registry-emblem">${emblem}</span>
    <span class="registry-identity-text"><strong>${esc(title)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</span>`;
  return path ? `<a class="registry-identity" href="#/${esc(path)}">${identity}<span class="registry-open">${icon('chevron')}</span></a>` : `<span class="registry-identity">${identity}</span>`;
}
function registryStatus(label) {
  const color = tone[label] || '';
  const symbol = ({'Stale GPS':'warning','In transit':'truck','Verified':'shield','Invited':'send'})[label] ||
    ({green:'check',amber:'clock',red:'close',blue:'info'})[color] || 'info';
  return `<span class="pill registry-status ${color}">${icon(symbol)}${esc(label)}</span>`;
}
function registryProgress(value, total, label) {
  return `<span class="registry-progress"><strong>${esc(label)}</strong>
    <progress value="${value}" max="${Math.max(total,1)}" aria-label="${esc(label)}"></progress>
  </span>`;
}
const tripIdentity = (t,number) => registryIdentity(t.id,number==null?'':truck(t.truck)?.plate,'box','trip/'+t.id,number);

function tripTable(records, label, blank, numbers) {
  return table(['Trip','Destination','Truck','Status','ETA / stops'],records.map(t=>{
    const v = truck(t.truck);
    const progress = t.status==='In transit'
      ? (stale(v)?registryStatus('Stale GPS'):esc(t.eta ?? 'Pending'))
      : registryProgress(t.done,t.stops.length,`${t.done}/${t.stops.length} stops`);
    return [tripIdentity(t,numbers?.get(t.truck)),`<strong>${esc(t.stops.at(-1))}</strong><small>${esc(t.depot)}${t.stops.length>1 ? ` · ${t.stops.length} stops` : ''}</small>`,
      `<strong>${esc(v?.plate)}</strong><small>${esc(v?.operator)}</small>`,registryStatus(t.status),progress];
  }),label,{blank,mobile:['Destination','Status']});
}

function dispatchQueue(deliveries, bays, requests) {
  const exceptions = deliveries.filter(t => stale(truck(t.truck)));
  const records = queueFilter === 'attention' ? exceptions :
    [...exceptions, ...bays, ...requests, ...deliveries.filter(t => !exceptions.includes(t))];
  return `<section class="card dispatch-queue" aria-label="Dispatch queue">
    <div class="queue-title"><h2>Dispatch queue</h2><span class="queue-total">${records.length} ${records.length === 1 ? 'trip' : 'trips'}</span></div>
    <div class="queue-filters" role="group" aria-label="Filter dispatch queue">
      <button type="button" data-action="queue-filter" data-id="all" aria-pressed="${queueFilter==='all'}">All open trips</button>
      <button type="button" data-action="queue-filter" data-id="attention" aria-pressed="${queueFilter==='attention'}">Needs attention <span>${exceptions.length}</span></button>
    </div>
    ${records.length ? `<ul class="queue-list">${records.map(t => {
      const vehicle = truck(t.truck);
      const warning = exceptions.includes(t);
      const mapped = t.status === 'In transit' && isMapped(vehicle);
      return `<li class="${warning?'needs-attention':''}">
        <a href="#/trip/${t.id}" class="queue-trip">
          <span class="queue-icon">${icon(warning?'warning':t.status==='In transit'?'truck':bays.includes(t)?'bay':'send')}</span>
          <span class="queue-info"><strong>${esc(t.stops.at(-1))}</strong><small>${t.id} · ${esc(vehicle?.plate)}</small></span>
        </a>
        <div class="queue-meta">${chip(warning?'Stale GPS':t.status)}
          ${mapped ? `<button class="icon-btn queue-pin" type="button" data-action="marker" data-id="${t.id}" aria-label="Show ${t.id} on map" aria-pressed="${mapSelection === t.id}">${icon('target')}</button>` : ''}
        </div>
      </li>`;
    }).join('')}</ul>` : empty(queueFilter==='attention'?'No active exceptions':'Queue is clear',queueFilter==='attention'?'All active trips have a recent GPS update.':'Active assignments and deliveries appear here.')}
  </section>`;
}
function dashboard() {
  const deliveries = active();
  const bays = loading();
  const requests = pending();
  const staleCount = deliveries.filter(t => stale(truck(t.truck))).length;
  const items = [
    ['truck','Available trucks',available().length,'Verified and ready','available'],
    ['bay','At the loading bay',bays.filter(t=>t.status!=='Accepted').length,'Arrived or loading','loading'],
    ['pin','In transit',deliveries.length,staleCount ? `${staleCount} with stale GPS` : 'No stale GPS reports','tracking']
  ];
  return `<header class="manifest-head">
    <div>
      <div class="manifest-date">${icon('calendar')} ${esc(date())} <span>WAT</span></div>
      <h1 tabindex="-1">Dispatch overview</h1>
      <div class="actions">${link('available','Available trucks','primary','truck')}${link('tracking','Live tracking','secondary','pin')}</div>
    </div>
    <div class="manifest-signal">
      <span class="manifest-signal-icon">${icon(staleCount ? 'warning' : 'check')}</span>
      <div>
        <span class="manifest-signal-label">GPS status</span>
        <strong>${staleCount ? `${staleCount} ${staleCount === 1 ? 'truck' : 'trucks'} overdue` : 'No overdue updates'}</strong>
        ${staleCount ? btn('show-exceptions','Review affected trips','signal-link') : ''}
      </div>
    </div>
  </header>
  <div class="manifest-metrics" aria-label="Dispatch totals">${items.map(([symbol,title,value,sub,path])=>`
    <a class="manifest-metric" href="#/${path}">
      <span class="manifest-metric-label">${icon(symbol)}${title}</span>
      <strong>${value}</strong>
      <small>${sub}</small>
    </a>`).join('')}</div>
  <div class="manifest-board">
    ${dispatchQueue(deliveries,bays,requests)}
    <section class="card manifest-map" aria-label="Fleet map">
      <header class="card-head"><div><h2>Fleet map</h2><p>Lagos and Ogun</p></div>${link('tracking','Open tracking','secondary')}</header>
      ${mapContent()}
    </section>
  </div>
  <div class="manifest-records">
    ${card('Recent deliveries','',tripTable(state.trips.filter(t=>!['Declined','Awaiting response'].includes(t.status)).slice(0,5),'Recent deliveries'),link('deliveries','All deliveries','secondary'))}
    ${card('Dispatch activity','',activity(4),iconBtn('activity','View activity','bell'))}
  </div>`;
}

function pickupTime(vehicle) {
  if (stale(vehicle)) return 'Stale GPS';
  return Number.isFinite(vehicle.eta) ? `${vehicle.eta} min` : 'ETA unavailable';
}
const availabilityStages = [
  ['', 'All available', 'truck'],
  ['fresh', 'Fresh GPS', 'pin'],
  ['nearby', 'Pickup within 20 min', 'clock'],
  ['stale', 'GPS needs update', 'warning']
];
function matchesAvailability(vehicle,status) {
  if (status === 'stale') return stale(vehicle);
  if (status === 'fresh') return !stale(vehicle);
  if (status === 'nearby') return !stale(vehicle) && Number.isFinite(vehicle.eta) && vehicle.eta <= 20;
  return true;
}
function availablePage() {
  const candidates = available();
  const vehicles = vehicleField(candidates);
  const rows = candidates.filter(v=>matchesAvailability(v,filters.status) &&
    (!filters.vehicle || v.id===filters.vehicle) && matchesFields(v,'operator','type') && matchQuery(v)).map(v => [
    registryIdentity(v.plate,`${v.id} · ${v.type}`,'truck','truck/'+v.id,vehicles.numbers.get(v.id)),
    esc(v.operator),
    esc(v.driver),
    esc(v.location),
    v.fresh == null ? 'Unavailable' : `${esc(v.fresh)} min ago`,
    stale(v) ? registryStatus('Stale GPS') : `<strong>${esc(pickupTime(v))}</strong>`
  ]);
  const fields = [
    vehicles,
    optionField(candidates,'type','Vehicle type','All vehicle types'),
    optionField(candidates,'operator','Operator','All operators'),
    {name:'status',label:'Readiness',all:'All available',choices:availabilityStages.slice(1).map(([value,label])=>[value,label])}
  ];
  return head('Available','Find verified trucks that are free for dispatch.') +
    stageStrip('Availability summary',candidates,availabilityStages,matchesAvailability) +
    card('Available trucks','Pickup ETAs are estimates to Demo Depot A.',
      controls('Search plate, driver or operator',[],fields) +
      table(['Truck','Operator','Driver','Last location','GPS update','Ikeja pickup ETA'],rows,'Available trucks',
        {blank:'Clear your search or check again when a truck becomes available.',mobile:['Last location','Ikeja pickup ETA']}));
}
function loadingPage() {
  const records = loading();
  const vehicles = tripVehicleField(records);
  const fields = [vehicles,optionField(records,'depot','Depot','All depots'),optionField(records,'bay','Loading bay','All bays')];
  const items = records.filter(t=>match(t) && matchesFields(t,'truck','depot','bay'));
  return head('Loading bay','Record arrivals, track loading time and release trucks for delivery.') +
    stageStrip('Loading stages',records,[['','All bay trips','bay'],['Accepted','Awaiting arrival','truck'],['At bay','At bay','pin'],['Loading','Loading','box']]) +
    card('Bay queue','',controls('Search trips or depots',['Accepted','At bay','Loading'],fields)+table(['Trip','Truck','Depot / bay','Elapsed at bay','Stage',''],items.map(t=>[
      registryIdentity(t.id,'','bay','trip/'+t.id,vehicles.numbers.get(t.truck)),esc(truck(t.truck)?.plate),`${esc(t.depot)}<small>${esc(t.bay || 'Awaiting bay assignment')}</small>`,
      t.arrivalAt ? `${Math.max(0,Math.floor((Date.now()-t.arrivalAt)/60000))} min` : t.arrived ? `${t.arrived} min` : '—',chip(t.status),
      btn('stage', ({Accepted:'Record arrival','At bay':'Start loading',Loading:'Confirm loaded and release'})[t.status],'secondary registry-action',t.id)
    ]),'Loading bay queue',{blank:'Accepted trucks will appear here while they wait for loading.',mobile:['Depot / bay','Stage']}));
}
function trackingPage() {
  const trips = active();
  const overdue = trips.filter(t => stale(truck(t.truck)));
  const records = [...overdue, ...trips.filter(t => !overdue.includes(t))];
  const trackingList = records.length ? `<ul class="tracking-list">${records.map(t => {
    const v = truck(t.truck);
    return `<li><a href="#/trip/${esc(t.id)}"><strong>${esc(t.stops.at(-1))}</strong><small>${esc(t.id)} · ${esc(v?.plate)}</small></a>
      ${chip(overdue.includes(t) ? 'Stale GPS' : 'In transit')}${isMapped(v) ?
      `<button class="icon-btn" type="button" data-action="marker" data-id="${esc(t.id)}" aria-label="Show ${esc(t.id)} on map">${icon('target')}</button>` : ''}
    </li>`;
  }).join('')}</ul>` : empty('No active trips','Released trips appear here until they are delivered.');
  return head('Live tracking','View the latest reported position for each active delivery.') +
    (overdue.length ? `<div class="notice-region">${notice(`${overdue.length} active ${overdue.length===1?'trip has':'trips have'} stale GPS. Destination ETAs are hidden until a fresh update arrives.`,'warn')}</div>` : '') +
    `<div class="tracking-board">${card('Delivery map','Sample vehicle positions in Lagos and Ogun',mapContent(true))}
      ${card('On the road',`${trips.length} active ${trips.length === 1 ? 'trip' : 'trips'}`,trackingList)}</div>
    <div class="section-bottom">${card('In-transit deliveries','',tripTable(trips,'In-transit deliveries','Released trips appear here until their deliveries are completed.'))}</div>`;
}
function deliveriesPage() {
  const records = state.trips.filter(t=>!['Declined','Awaiting response'].includes(t.status));
  const vehicles = tripVehicleField(records);
  const fields = [vehicles,optionField(records,'depot','Pickup depot','All depots')];
  const items = records.filter(t=>match(t) && matchesFields(t,'truck','depot'));
  return head('Deliveries','Review trips and stop confirmations.') +
    stageStrip('Delivery status',records,[['','All deliveries','box'],['In transit','In transit','truck'],['Delivered','Delivered','check']]) +
    card('Delivery records','',controls('Search trip, depot or destination',['Accepted','At bay','Loading','In transit','Delivered'],fields) +
      tripTable(items,'Delivery records',undefined,vehicles.numbers));
}

function fleetPage() {
  const vehicles = vehicleField(state.fleet);
  const fields = [vehicles,optionField(state.fleet,'type','Vehicle type','All vehicle types'),optionField(state.fleet,'operator','Operator','All operators')];
  const records = state.fleet.filter(t=>match(t) && (!filters.vehicle || t.id===filters.vehicle) && matchesFields(t,'type','operator'));
  return head('Fleet directory','Browse third-party operators, drivers and registered trucks.') +
    stageStrip('Fleet status',state.fleet,[['','All trucks','truck'],['Verified','Verified','shield'],['Pending review','Pending review','clock'],['Needs corrections','Needs corrections','warning']]) +
    card('Registered fleet','',
      controls('Search plate, driver or operator',['Available','Assigned','Verified','Pending review','Needs corrections','Rejected'],fields) +
      table(['Truck','Operator','Driver','Last location','Verification'],records.map(t=>[
        registryIdentity(t.plate,`${t.id} · ${t.type}`,'truck','truck/'+t.id,vehicles.numbers.get(t.id)),
        esc(t.operator),esc(t.driver),esc(t.location),registryStatus(t.review)
      ]),'Registered fleet',{mobile:['Operator','Verification']}));
}
function verificationPage() {
  const records = state.fleet.filter(t=>t.review!=='Verified');
  const vehicles = vehicleField(records);
  const fields = [vehicles,optionField(records,'type','Vehicle type','All vehicle types'),optionField(records,'operator','Operator','All operators')];
  const items = records.filter(t=>match(t) && (!filters.vehicle || t.id===filters.vehicle) && matchesFields(t,'type','operator'));
  return head('Verification','Review registration documents before approving a vehicle.') +
    stageStrip('Registration status',records,[['','All registrations','truck'],['Pending review','Pending review','clock'],['Needs corrections','Needs corrections','warning'],['Rejected','Rejected','close']]) +
    card('Truck registrations','',controls('Search registrations',['Pending review','Needs corrections','Rejected'],fields) +
      table(['Truck','Operator','Documents','Status'],items.map(t=>[
        registryIdentity(t.plate,t.id,'shield','truck/'+t.id,vehicles.numbers.get(t.id)),esc(t.operator),
        registryProgress(t.docs?.length ?? 0,3,`${t.docs?.length ?? 0} of 3 received`),registryStatus(t.review)
      ]),'Truck registrations',{blank:records.length?'No registrations match your filters.':'All registrations have been verified.',mobile:['Documents','Status']}));
}
function usersPage() {
  const users = numberedField(state.users,'email','email','Staff account','All staff',u=>u.name);
  const fields = [users,optionField(state.users,'role','Workspace role','All roles')];
  const records = state.users.filter(u=>match(u) && matchesFields(u,'email','role'));
  return head('Users & permissions','Manage roles for Mouka workspace staff.',btn('invite','Create demo invitation','primary','','plus')) +
    stageStrip('Staff status',state.users,[['','All staff','users'],['Active','Active accounts','check'],['Invited','Open invitations','send'],['Suspended','Suspended','warning']]) +
    card('Staff accounts','',controls('Search staff',['Active','Invited','Suspended'],fields) +
      table(['Name','Email','Role','Status'],records.map(u=>[
        `<button type="button" class="registry-identity staff-edit" data-action="edit-user" data-id="${esc(u.email)}" aria-label="Edit ${esc(u.name)}"><span class="registry-emblem">${users.numbers.get(u.email)}</span><strong>${esc(u.name)}</strong><span class="registry-open">${icon('chevron')}</span></button>`,
        esc(u.email),esc(u.role),registryStatus(u.status)]),
        'Staff accounts',{mobile:['Role','Status']}));
}
function depotsPage() {
  const depots = numberedField(state.locations,'name','name','Depot','All depots',d=>d.name);
  const fields = [depots,optionField(state.locations,'area','State','All states'),optionField(state.locations,'bays','Loading bays','Any bay count')];
  const records = state.locations.filter(d=>match(d) && matchesFields(d,'name','area','bays'));
  return head('Depot settings','Manage dispatch locations and loading bay capacity.',btn('new-depot','Add depot','primary','','plus')) +
    statsStrip('Depot capacity',[['Depots',state.locations.length,'pin'],['Loading bays',state.locations.reduce((sum,d)=>sum+d.bays,0),'bay']]) +
    card('Dispatch locations','',controls('Search depots',[],fields) +
      table(['Depot','State','Loading bays',''],records.map(d=>[registryIdentity(d.name,'','pin','',depots.numbers.get(d.name)),esc(d.area),
        `<span class="registry-capacity">${icon('bay')} <strong>${esc(d.bays)}</strong></span>`,btn('edit-depot','Edit','secondary registry-action',d.name,'settings')]),
        'Dispatch locations'));
}
function tripProgress(status) {
  const stages = [
    ['Requested','send',['Awaiting response']],
    ['Accepted','check',['Accepted']],
    ['At loading bay','bay',['At bay','Loading']],
    ['On the road','truck',['In transit']],
    ['Delivered','box',['Delivered']]
  ];
  const currentStage = stages.findIndex(([, , values]) => values.includes(status));
  if (currentStage < 0) return '';
  return `<ol class="trip-progress card" aria-label="Delivery progress">${stages.map(([label,symbol],index) =>
    `<li class="${index <= currentStage?'reached':''}" ${index === currentStage?'aria-current="step"':''}>
      <span>${icon(index < currentStage?'check':symbol)}</span><strong>${label}</strong>
    </li>`).join('')}</ol>`;
}
function tripDetail(id) {
  const t = trip(id);
  if (!t) return notFound('Trip not found');
  const v = truck(t.truck);
  const stageAction = ({Accepted:'Record arrival','At bay':'Start loading',Loading:'Confirm loaded and release'})[t.status];
  const actions = t.status==='Awaiting response' ? btn('respond','Simulate operator response','primary',t.id) :
    stageAction ? btn('stage',stageAction,'primary',t.id) :
    t.status==='In transit' ? btn('deliver','Confirm next stop','primary',t.id) :
    t.status==='Declined' ? link('available','Available trucks','primary') : '';
  return head(t.id,`${t.depot} to ${t.stops.at(-1)}`,actions) +
    (t.reason ? `<div class="notice-region">${notice(`Operator declined: ${t.reason}`,'error')}</div>` :
      t.status==='In transit' && stale(v) ? `<div class="notice-region">${notice('The last GPS update has expired. A fresh location is needed to estimate arrival.','warn')}</div>` : '') + tripProgress(t.status) +
    `<div class="split">${card('Trip details','',body(kv([['Status',t.status],['Truck',v?.plate],['Operator',v?.operator],['Driver',v?.driver],['Loading bay',t.bay || 'Pending'],['Destination ETA',t.status==='In transit' && !stale(v) ? t.eta || 'Pending' : '—'],
    ['Loading time',t.loadMinutes===undefined ? '—' : t.loadMinutes+' min']])+
    `<div class="section-bottom"><h3>Delivery stops</h3><ol class="list-stops">${t.stops.map((s,i)=>`<li>${esc(s)} · ${i<t.done?chip('Delivered'):chip('Pending')}</li>`).join('')}</ol></div>`))}
    ${card('Trip history','',body(`<ol class="timeline">${t.events.map(([s,time])=>`<li><strong>${esc(s)}</strong><br><small>${esc(time)} WAT</small></li>`).join('')}</ol>`))}</div>`;
}
function truckDetail(id) {
  const t = truck(id);
  if (!t) return notFound('Truck not found');
  const isAvailable = available().some(v=>v.id===t.id);
  return head(t.plate,`${t.id} · ${t.operator}`,link('fleet','Fleet directory')) +
    `<div class="split">${card('Vehicle details','',body(kv([['Operator',t.operator],['Driver',t.driver],['Vehicle type',t.type],['Last location',t.location],['GPS update',t.fresh == null ? 'Unavailable' : `${t.fresh} min ago`],['Availability',isAvailable?'Available':t.status==='Available'?'Reserved':t.status],['Verification',t.review],...(isAvailable?[['Ikeja pickup ETA',pickupTime(t)]]:[])])))}
    ${card('Document checklist','',body(`<div class="stack">${['Vehicle registration','Insurance certificate','Roadworthiness certificate'].map(doc=>`<div>${esc(doc)} · ${chip(t.review==='Verified'||t.docs?.includes(doc)?'Received':'Missing')}</div>`).join('')}${t.reviewNote ? notice(t.reviewNote,'warn') : ''}</div>
      ${t.review==='Pending review' ? `<div class="actions detail-actions">${btn('review','Review decision','primary',t.id)}</div>` : ''}`))}</div>`;
}
function notFound(title='Page not found') {
  return `<section class="center-page"><div class="center-card"><span class="error-code" aria-hidden="true">404</span><h1 tabindex="-1">${title}</h1><p class="muted">Check the address or return to the dispatch dashboard.</p><a class="btn primary" href="/#/dispatch">${icon('grid')} Back to dispatch</a></div></section>`;
}
const authModes = {
  'driver-sign-in': ['Driver sign in','',''],
  'sign-in': ['Sign in','Use a demo email and password to open the workspace.','Sign in'],
  'sign-up': ['Create your account','Preview email verification, then set a demo password.','Send one-time link'],
  'reset-password': ['Reset your password','Enter your demo email to preview a reset link.','Send reset link'],
  'set-password': ['Set your demo password','Choose a password you only use for this demo.','Save password'],
  'accept-invitation': ['Accept an invitation','Enter the demo email listed on your invitation.','Accept demo invitation']
};
const authTitles = Object.fromEntries(Object.entries(authModes).map(([mode,[title]]) => [mode,title]));
const rememberChoice = checked => `<label class="remember-choice"><input type="checkbox" name="remember" ${checked?'checked':''}><span>Keep me signed in for 30 days<small>Use only on a device you trust.</small></span></label>`;
const policyChoices = (prefix='admin') => `<fieldset class="access-legal"><legend>Demo acknowledgments</legend>
  <label class="legal-all"><input type="checkbox" name="accept-all"> Select all</label>
  ${Object.entries(legalItems).map(([key,[label]]) => `<div class="legal-option"><input type="checkbox" name="policy" value="${key}" aria-labelledby="policy-copy-${prefix}-${key}">
    <span id="policy-copy-${prefix}-${key}">I acknowledge the <button class="inline-link" type="button" data-action="access-policy" data-id="${key}">${label}</button>.</span></div>`).join('')}
</fieldset>`;
const passwordField = isNew => `<div class="field">
  <label for="demo-password">${isNew?'New demo password':'Demo password'}</label>
  <span class="password-wrap"><input id="demo-password" name="password" type="password" autocomplete="${isNew?'new-password':'current-password'}" ${isNew?'minlength="8"':''} maxlength="128" required aria-describedby="error-password">
  <button type="button" class="inline-link password-toggle" data-action="password-toggle" aria-controls="demo-password">Show</button></span><span id="error-password" class="field-error"></span></div>`;
const googleMark = () => icon('google');
function authPage(type) {
  const [title,description,submit] = authModes[type];
  const credentials = ['sign-in','sign-up'].includes(type);
  const driverEntry = type === 'driver-sign-in';
  const canSet = pendingAccess && pendingAccess.expires > Date.now();
  return `<div class="access-layout">
    <section class="access-art" aria-label="Mouka logistics">
      <a href="#/dispatch" class="access-brand">${logo()}<span>Mouka Logistics<small>Dispatch and Driver</small></span></a>
      <div class="access-story">
        <h2>From the depot<br>to the doorstep.</h2>
        <div class="access-route" aria-label="Depot to delivery">
          <span>${icon('bay')} Depot</span><i aria-hidden="true"></i><span>${icon('pin')} Delivery</span>
        </div>
      </div>
    </section>
    <section class="access-content">
      <div class="access-panel">
        <nav class="access-roles" aria-label="Sign-in role">
          <a href="#/sign-in"${driverEntry ? '' : ' aria-current="page"'}>${icon('shield')} Admin</a>
          <a href="#/driver-sign-in"${driverEntry ? ' aria-current="page"' : ''}>${icon('truck')} Driver</a>
        </nav>
        ${driverEntry ? driverAccessMarkup(policyChoices) : `
        <nav class="access-modes admin-modes" aria-label="Admin account actions">
          ${[['sign-in','Sign in'],['sign-up','Create account']].map(([mode,label]) =>
            `<a href="#/${mode}"${mode===type?' aria-current="page"':''}>${label}</a>`).join('')}
        </nav>
        <div class="access-heading">
          <span class="access-heading-icon">${icon(type==='sign-up'?'users':type==='reset-password'?'lock':'shield')}</span>
          <div><h1 tabindex="-1">${title}</h1><p class="access-description">${description}</p></div>
        </div>
        ${type==='sign-up' || (type==='set-password' && pendingAccess?.mode==='sign-up') ? `
          <ol class="access-steps" aria-label="Account setup progress">
            ${['Your details','Verify email','Set password'].map((label,i)=>`<li${i===(type==='set-password'?2:0)?' aria-current="step"':''}><span>${i+1}</span>${label}</li>`).join('')}
          </ol>` : ''}
        ${type==='sign-in' ? `<div class="access-demo-card">${icon('info')}<div><strong>Try the Admin demo</strong><p>Fill the sample login, then confirm the acknowledgments.</p></div>${btn('fill-demo-email','Use demo credentials','light')}</div>` : ''}
        ${type==='set-password' && !canSet ? `<p class="access-description">This demo link has expired. <a class="inline-link" href="#/reset-password">Request another link</a>.</p>` : `
        <form class="form access-fields" data-form="auth" data-id="${type}" novalidate>
          ${type==='sign-up' ? field('Full name','<input name="name" autocomplete="name" placeholder="e.g. Sample Staff Member" required aria-describedby="error-name"><span id="error-name" class="field-error"></span>') : ''}
          ${type!=='set-password' ? field('Demo email',`<input name="email" type="email" inputmode="email" autocomplete="email" value="${esc(authEmail)}" placeholder="name@example.com" required aria-describedby="error-email"><span id="error-email" class="field-error"></span>`) : passwordField(true)}
          ${type==='sign-in' ? `${passwordField(false)}<a class="inline-link forgot-link" href="#/reset-password">Forgot password?</a>` : ''}
          ${credentials ? rememberChoice(false) + policyChoices() : ''}
          ${formError}<div class="notice success" data-auth-result role="status" tabindex="-1" hidden></div>
          <button class="btn primary" type="submit">${submit}</button>
          ${credentials ? `<button class="btn secondary google-button" data-action="google-preview" type="button">${googleMark()} Continue with Google</button>` : ''}
        </form>`}
        <div class="access-footer">
          ${type==='accept-invitation' ? '<a href="#/sign-in">Return to sign in</a>' : '<a href="#/accept-invitation">Accept an invitation</a>'}
          <a href="mailto:contact@terracodeanalytics.com">Contact support</a>
          <a href="#/dispatch">Explore demo</a>
        </div>
        <p class="access-note">${icon('info')} Use sample credentials. Account changes stay in this browser.</p>`}
      </div>
    </section>
  </div>`;
}
const auroraPrompts = [
  ['Dispatch summary','Give me a dispatch overview','grid'],
  ['GPS exceptions','Which trips have stale GPS?','warning'],
  ['Available trucks','Which trucks are available?','truck']
];
function renderAurora() {
  document.body.classList.toggle('aurora-open',auroraOpen);
  if (auroraOpen && !assistant.querySelector('.aurora-panel')) {
    assistant.insertAdjacentHTML('beforeend',`<aside class="aurora-panel" id="aurora-panel" aria-labelledby="aurora-title">
      <header class="aurora-header">
        ${auroraMark()}<div><h2 id="aurora-title">Aurora</h2><p>Mouka Dispatch assistant</p></div>
        ${iconBtn('aurora-close','Close Aurora','close')}
      </header>
      <div class="aurora-thread" role="log" aria-label="Aurora conversation"></div>
      <div class="aurora-composer"><form class="aurora-form" data-form="aurora">
        <label class="sr-only" for="aurora-question">Your question</label>
        <input id="aurora-question" name="question" placeholder="Ask about a trip or truck" maxlength="400" required autocomplete="off">
        <button type="submit" class="btn primary" aria-label="Send question">${icon('send')}</button>
      </form><p class="aurora-footnote">${icon('info')} Answers use sample workspace records.</p></div>
    </aside>`);
    updateAuroraThread();
  } else if (!auroraOpen) {
    assistant.querySelector('.aurora-panel')?.remove();
  }
  if (!assistant.querySelector('.aurora-launcher')) {
    assistant.insertAdjacentHTML('afterbegin',`<button type="button" class="aurora-launcher" data-action="aurora-toggle" aria-label="Ask Aurora" aria-expanded="false">
      ${auroraMark()}<span class="aurora-launcher-label" aria-hidden="true">Ask Aurora</span>
    </button>`);
  }
  assistant.inert = navOpen;
  const toggle = assistant.querySelector('.aurora-launcher');
  toggle.hidden = auroraOpen || navOpen;
  toggle.setAttribute('aria-expanded',String(auroraOpen));
}
// Strip pictographs from assistant messages, including flags, keycaps and joined sequences.
const emojiPattern = /[#*0-9]\uFE0F?\u20E3|[©®™]\uFE0F|(?![©®™])(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier})|[\u200D\uFE0F]|[\u{E0020}-\u{E007F}]/gu;
function updateAuroraThread() {
  const thread = assistant.querySelector('.aurora-thread');
  if (!thread) return;
  const welcome = `<div class="aurora-welcome"><h3>What’s happening in dispatch?</h3>
    <p>Get a summary or look up a specific trip, truck, or depot.</p>
    <div class="aurora-prompts" aria-label="Suggested questions">${auroraPrompts.map(([label,prompt,symbol]) => btn('aurora-prompt',label,'light',prompt,symbol)).join('')}</div>
  </div>`;
  thread.innerHTML = welcome + auroraMessages.map(message => {
    const text = message.user ? message.text : message.text.replace(emojiPattern,'').trim() || 'Try asking about a trip, truck, or depot.';
    return `<div class="aurora-bubble ${message.user?'from-user':''}">
      <span class="aurora-speaker">${message.user?'You':'Aurora'}</span><p>${esc(text)}</p>
      ${message.path ? link(esc(message.path),message.label,'light','chevron') : ''}</div>`;
  }).join('') + (auroraPending ? `<div class="aurora-bubble" role="status">${icon('clock')} Checking workspace records…</div>` : '');
  thread.scrollTop = thread.scrollHeight;
  assistant.querySelector('[type="submit"]').disabled = auroraPending;
}
async function sendAurora(value) {
  const question = value.trim();
  if (!question || auroraPending) return;
  auroraMessages.push({user:true,text:question});
  if (auroraMessages.length > 23) auroraMessages.splice(0,2);
  const [page,selectedId] = current.split('/');
  const context = {state, active, available, loading, stale, page, selectedId};
  let reply = dispatchAnswer(question,context);
  // Structured dispatch answers retain exact counts, statuses and links. Use the local
  // language model for other questions only when the browser already has it.
  if (!reply.path) {
    auroraPending = true;
    updateAuroraThread();
    try {
      if (await onDeviceAvailable()) {
        const text = await askOnDevice(question,context);
        if (text) reply = {text};
      }
    } catch {
      // The structured fallback is available on every supported browser.
    } finally {
      auroraPending = false;
    }
  }
  auroraMessages.push(reply);
  updateAuroraThread();
}
function toggleAurora(open) {
  auroraOpen = open;
  renderAurora();
  if (open) assistant.querySelector('input')?.focus({preventScroll:true});
  else assistant.querySelector('.aurora-launcher')?.focus({preventScroll:true});
}
function profileMenu(viewer) {
  const avatar = viewer ? esc(initials(viewer.name)) : icon('user');
  return `<div class="account-dropdown">
    <button class="profile profile-trigger" data-action="profile" type="button" aria-label="Workspace account" aria-expanded="false" aria-controls="account-options">
      <span class="avatar">${avatar}</span>
    </button>
    <div id="account-options" class="account-options" hidden>
      <div class="account-summary"><strong>${esc(viewer?.name || 'Guest')}</strong><small>${esc(viewer ? viewer.role + ' · Demo workspace' : 'Demo workspace')}</small></div>
      <button type="button" data-action="account-settings">${icon('settings')} Account settings</button>
      <a href="#/depots">${icon('bay')} Depot settings</a>
      <a href="#/help">${icon('help')} Help and support</a>
      ${viewer ? `<button type="button" class="account-exit" data-action="sign-out">${icon('log-out')} Log out</button>` :
        `<a class="account-exit" href="#/sign-in">${icon('user')} Sign in</a>`}
    </div></div>`;
}
function setProfileOpen(open, restoreFocus=false) {
  const trigger = app.querySelector('.profile-trigger');
  const options = app.querySelector('#account-options');
  if (!trigger || !options) return;
  trigger.setAttribute('aria-expanded',String(open));
  options.hidden = !open;
  if (restoreFocus) trigger.focus();
}
function fontSizeControl() {
  return field('Font size',`<select data-font-size>${Object.entries(fontSizes).map(([size,label]) =>
    `<option value="${size}"${fontSize===size?' selected':''}>${label}</option>`).join('')}</select>`);
}
function administration(page) {
  const [label,items] = nav[1];
  return `<details class="admin-dropup">
    <summary class="admin-trigger">${icon('settings')}<span><strong>${label}</strong><small>Mouka workspace</small></span>${icon('chevron')}</summary>
    <div class="admin-panel" aria-label="Administration options">
      <div class="admin-appearance"><strong>Appearance</strong><div class="theme-controls" role="group" aria-label="Appearance">
        ${Object.entries(themes).map(([key,[name,symbol]]) => `<button type="button" data-action="theme" data-id="${key}" aria-pressed="${themePreference===key}">${icon(symbol)}${name}</button>`).join('')}
      </div>${fontSizeControl()}</div>
      <nav aria-label="Administration">${items.map(([path,name,symbol]) =>
        `<a href="#/${path}"${page===path?' aria-current="page"':''}>${icon(symbol)}${name}</a>`).join('')}</nav>
      <div class="admin-utilities"><a href="#/policies">${icon('document')} Terms &amp; policies</a>
      <a href="#/help">${icon('help')} Help and support</a></div>
    </div>
  </details>`;
}
function closeAdministration(restoreFocus=false) {
  const menu = app.querySelector('.admin-dropup[open]');
  if (!menu) return;
  menu.open = false;
  if (restoreFocus) menu.querySelector('summary').focus();
}
function policySections(sections) {
  return sections.map(([heading,copy])=>`<section class="guidance-section"><h3>${esc(heading)}</h3><p>${esc(copy)}</p></section>`).join('');
}
function policiesPage() {
  return head('Terms & policies','Draft policies for the Mouka Dispatch pilot and planned rollout.') +
    `<div class="guidance-grid">${Object.entries(legalItems).map(([id,[title,symbol,sections]])=>`
      <details class="card guidance-card" data-policy="${id}"><summary>${tile(symbol)}<h2>${esc(title)}</h2>${icon('chevron')}</summary>
      <div class="guidance-content">${policySections(sections)}</div></details>`).join('')}</div>`;
}
function helpPage() {
  return head('Help and support','Guides for dispatch, depots and workspace administration.',
    btn('open-help-aurora','Ask Aurora','secondary','','message') + '<a class="btn primary help-contact" href="mailto:contact@terracodeanalytics.com">contact@terracodeanalytics.com</a>') +
    `<div class="help-search registry-search">${icon('search')}<input type="search" id="help-search" aria-label="Search help articles" placeholder="Search help articles"></div>
    <p class="guidance-empty" hidden role="status">No articles match your search.</p>
    <div class="guidance-grid help-topics">${helpTopics.map(([title,symbol,items])=>`<section class="card guidance-card">
      <header>${tile(symbol)}<h2>${esc(title)}</h2></header>
      <div class="guidance-questions">${items.map(([question,answer])=>`<details><summary><span>${esc(question)}</span>${icon('chevron')}</summary><p>${esc(answer)}</p></details>`).join('')}</div>
    </section>`).join('')}</div>`;
}
const renderers = {dispatch:dashboard,available:availablePage,loading:loadingPage,tracking:trackingPage,deliveries:deliveriesPage,fleet:fleetPage,verification:verificationPage,users:usersPage,depots:depotsPage,policies:policiesPage,help:helpPage};
function render({focus=false}={}) {
  const [page,id,extra] = current.split('/');
  const title = names[page] || ({trip:'Trip details',truck:'Truck details',policies:'Terms & policies',help:'Help and support',...authTitles})[page] || 'Page not found';
  document.title = `${title} | Mouka Dispatch`;
  const content = extra ? notFound() : id && page==='trip' ? tripDetail(id) : id && page==='truck' ? truckDetail(id) :
    id ? notFound() : renderers[page] ? renderers[page]() : Object.hasOwn(authTitles,page) ? authPage(page) : notFound();
  const auth = Object.hasOwn(authTitles,page);
  const viewer = account();
  app.innerHTML = auth ? `<main id="main" class="auth-main" tabindex="-1"><div class="page">${content}</div></main>` : `
  <div class="shell">
    <aside id="side" class="sidebar ${navOpen?'open':''}">
      <div class="brand"><a href="#/dispatch" aria-label="Mouka Dispatch home">${logo()}</a><div><strong>Dispatch</strong><small>Mouka Logistics</small></div>${iconBtn('menu','Close navigation','close','mobile-only side-close')}</div>
      <nav class="side-scroll" aria-label="Main navigation">${nav.slice(0,1).map(([label,items])=>`<div class="nav-group"><div class="nav-label">${label}</div>${items.map(([s,n,g])=>`<a href="#/${s}" class="nav-link ${page===s?'active':''}" ${page===s?'aria-current="page"':''}>${icon(g)}${n}</a>`).join('')}</div>`).join('')}</nav>
      <div class="side-footer">${administration(page)}</div>
    </aside>
    <button type="button" class="overlay ${navOpen?'open':''}" tabindex="-1" aria-label="Close navigation" data-action="menu"></button>
    <div class="workspace"${navOpen?' inert':''}><header class="top"><div class="top-left"><button type="button" class="icon-btn mobile-only" data-action="menu" aria-expanded="${navOpen}" aria-controls="side" aria-label="Open navigation">${icon('menu')}</button>
      <div class="crumb"><span>Mouka Logistics</span>${icon('chevron')}<strong>${title}</strong></div></div>
      <div class="top-actions"><button type="button" class="icon-btn" data-action="activity" aria-label="Notifications">${icon('bell')}${activityRead?'':'<i class="unread"></i>'}</button>
        ${profileMenu(viewer)}
      </div></header><main id="main" tabindex="-1"><div id="connection" ${navigator.onLine?'hidden':''}>${notice('Connection lost. You can browse existing records. Reconnect to save changes.','warn')}</div><div class="page${current === 'dispatch' && focus ? ' manifest-enter' : ''}">${content}</div></main></div>
  </div>`;
  document.body.classList.toggle('account-access',auth);
  if (page==='driver-sign-in') mountDriverAccess(app.querySelector('#driver-entry'));
  renderAurora();
  if (focus) document.querySelector('h1')?.focus({preventScroll:true});
}
function routeChanged() {
  const next = route();
  if (next === current) return;
  if (modal.open) modal.close();
  const previousEmail = app.querySelector('form[data-form="auth"] input[name="email"]');
  if (previousEmail) authEmail = previousEmail.value.trim();
  current = next;
  filters = {};
  mapSelection = '';
  queueFilter = 'all';
  zoom = 1;
  navOpen = false;
  render({focus:true});
  window.scrollTo(0,0);
}
function openModal(title, html) {
  modal.innerHTML = `<div class="card-head"><h2 id="dialog-title">${esc(title)}</h2>${iconBtn('close','Close dialog','close')}</div><div class="dialog-body">${html}</div>`;
  if (!modal.open) modal.showModal();
}
function modalForm(title, kind, id, fields, submit) {
  openModal(title,`<form class="form" data-form="${kind}" data-id="${esc(id)}" novalidate>${fields}${formError}${formActions(submit)}</form>`);
}
function setError(form, fieldName, message) {
  const input = form.elements.namedItem(fieldName);
  input?.setAttribute('aria-invalid','true');
  const span = form.querySelector('#error-'+fieldName);
  if (span) span.textContent = message;
  input?.focus();
}
function generalError(form, message) {
  const el = form.querySelector('[data-form-error]');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
}
function valid(form) {
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const span of form.querySelectorAll('.field-error')) span.textContent='';
  if (form.querySelector('[data-form-error]')) form.querySelector('[data-form-error]').hidden=true;
  if (form.querySelector('[data-auth-result]')) form.querySelector('[data-auth-result]').hidden=true;
  const el = [...form.elements].find(i=> i.validity && (!i.validity.valid || (i.required && typeof i.value==='string' && !i.value.trim())));
  if (!el) return true;
  setError(form,el.name,el.validity.typeMismatch?'Enter a valid email address.':el.validity.tooShort?'Use at least 8 characters.':el.type==='number'?'Enter a number between 1 and 30.':'Complete this field.');
  return false;
}
function finish(message, mutate, next) {
  if (!save(message,mutate)) {
    const form = modal.open ? modal.querySelector('form') : null;
    if (form) generalError(form,'Your change could not be saved. Check your connection or browser storage and try again.');
    return;
  }
  if (modal.open) modal.close();
  if (next && next !== current) go(next); else render({focus:true});
}

function stageModal(t) {
  if (!t) return;
  if (t.status==='Accepted') {
    const depot = state.locations.find(d=>d.name===t.depot);
    const bays = Array.from({length:depot?.bays ?? 1},(_,i)=>'Bay '+String(i+1).padStart(2,'0'));
    const open = bays.filter(bay=>!loading().some(x=>x.depot===t.depot && x.bay===bay));
    if (!open.length) return openModal('No loading bay available',notice('Wait for a truck at this depot to be released, then record the arrival.','warn'));
    return modalForm('Record truck arrival','stage',t.id,field('Loading bay',`<select name="bay">${option(open)}</select>`),'Record arrival');
  }
  if (t.status==='At bay') return modalForm('Start loading','stage',t.id,notice(`${t.id} is assigned to ${t.bay} at ${t.depot}.`),'Start loading');
  if (t.status==='Loading') return modalForm('Confirm loaded and release','stage',t.id,notice('This records the release by Mouka loading staff and starts tracking the delivery ETA.','warn'),'Release truck');
}
const staffStatuses = ['Active','Invited','Suspended'];
function userModal(u) {
  modalForm(u?'Edit staff account':'Create demo invitation',u?'edit-user':'invite',u?.email ?? '',
    field('Full name',`<input name="name" autocomplete="name" value="${esc(u?.name)}" required aria-describedby="error-name"><span id="error-name" class="field-error"></span>`) +
    field('Work email',`<input name="email" type="email" autocomplete="email" placeholder="name@example.com" value="${esc(u?.email)}" required aria-describedby="error-email"><span id="error-email" class="field-error"></span>`) +
    field('Workspace role',`<select name="role">${option(roles,u?.role)}</select>`) +
    (u ? field('Account status',`<select name="status">${option(staffStatuses,u.status)}</select>`) : ''),
    u?'Save changes':'Create invitation');
}
function depotModal(d) {
  modalForm(d?'Edit depot':'Add depot',d?'edit-depot':'new-depot',d?.name ?? '',
    field('Depot name',`<input name="name" required value="${esc(d?.name)}" aria-describedby="error-name"><span class="field-error" id="error-name"></span>`) +
    field('State',`<input name="area" required value="${esc(d?.area)}" aria-describedby="error-area"><span class="field-error" id="error-area"></span>`) +
    field('Loading bays',`<input type="number" name="bays" min="1" max="30" required value="${d?.bays ?? 1}" aria-describedby="error-bays"><span class="field-error" id="error-bays"></span>`),'Save depot');
}
function updateMap(action, element) {
  if (action==='marker') mapSelection = element.dataset.id;
  if (action==='zoom-in') zoom = Math.min(2.5,zoom+.3);
  if (action==='zoom-out') zoom = Math.max(1,zoom-.3);
  if (action==='zoom-reset') { zoom=1; mapSelection=''; }
  render();
  [...app.querySelectorAll('[data-action="'+action+'"]')].find(e=>e.dataset.id===element.dataset.id)?.focus({preventScroll:true});
}

document.addEventListener('change', e=>{
  const input = e.target;
  if (input.matches('[data-font-size]') && Object.hasOwn(fontSizes,input.value)) {
    fontSize = input.value;
    document.documentElement.dataset.fontSize = fontSize;
    try { localStorage.setItem('mouka-font-size',fontSize); } catch {}
    document.querySelectorAll('[data-font-size]').forEach(control => { control.value = fontSize; });
    return;
  }
  if (!input.matches('.access-legal input')) return;
  const form = input.form;
  const all = form.elements.namedItem('accept-all');
  const choices = [...form.querySelectorAll('[name="policy"]')];
  if (input === all) choices.forEach(choice => { choice.checked = all.checked; });
  const selected = choices.filter(choice => choice.checked).length;
  all.checked = selected === choices.length;
  all.indeterminate = selected > 0 && selected < choices.length;
  form.querySelector('.access-legal').removeAttribute('aria-invalid');
});
async function handleAccess(form, mode, values) {
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const email = values.email?.trim().toLowerCase();
  if (email !== undefined && !email.endsWith('@example.com')) {
    return setError(form,'email','Use an example.com email address for the demo.');
  }
  const user = mode==='sign-in' && email===demoAdmin.email ? demoAdmin : state.users.find(u=>u.email===email);
  if (['sign-in','sign-up'].includes(mode) &&
      form.querySelectorAll('[name="policy"]:checked').length !== Object.keys(legalItems).length) {
    form.querySelector('.access-legal').setAttribute('aria-invalid','true');
    generalError(form,'Confirm each demo acknowledgment to continue.');
    form.elements.namedItem('accept-all').focus();
    return;
  }
  if (mode==='sign-up' && (user || email===demoAdmin.email)) return setError(form,'email','This demo account already exists. Sign in or use another address.');
  if (mode==='reset-password' || mode==='sign-up') {
    const result = form.querySelector('[data-auth-result]');
    result.hidden = false;
    result.textContent = mode==='sign-up'
      ? 'Your demo one-time link is ready to preview. No email was sent.'
      : 'If this demo account exists, a reset link would be sent. No email was sent.';
    pendingAccess = mode==='sign-up' || user?.status==='Active'
      ? {mode,email,name:values.name?.trim(),remember:Boolean(values.remember),expires:Date.now()+15*60*1000} : undefined;
    if (pendingAccess) result.insertAdjacentHTML('beforeend',link('set-password','Open demo link','light'));
    if (mode==='sign-up') app.querySelector('.access-steps [aria-current]')?.removeAttribute('aria-current');
    if (mode==='sign-up') app.querySelector('.access-steps li:nth-child(2)')?.setAttribute('aria-current','step');
    result.focus();
    return;
  }
  if (mode==='accept-invitation') {
    if (user?.status!=='Invited') return setError(form,'email','No open demo invitation matches this email.');
    if (save('Demo invitation accepted.',()=>{user.status='Active';})) {
      rememberAccount(email);
      go('dispatch');
    } else generalError(form,'The invitation could not be saved.');
    return;
  }
  submit.disabled = true;
  try {
    if (mode==='sign-in') {
      const matched = user?.status==='Active' && await checkDemoPassword(user,values.password);
      if (!form.isConnected) return;
      if (!matched) return generalError(form,'The demo email or password did not match.');
      rememberAccount(email,Boolean(values.remember));
      go('dispatch');
    } else if (mode==='set-password') {
      const pending = pendingAccess;
      if (!pending || pending.expires <= Date.now()) return generalError(form,'This demo link has expired. Request a new link.');
      if (values.password.length < 8) return setError(form,'password','Use at least 8 characters.');
      const credential = await makeDemoCredential(values.password);
      if (!form.isConnected || pendingAccess !== pending) return;
      if (pending.expires <= Date.now()) return generalError(form,'This demo link has expired. Request a new link.');
      const existing = state.users.find(u => u.email===pending.email);
      if ((pending.mode==='sign-up' && existing) || (pending.mode==='reset-password' && existing?.status!=='Active')) {
        return generalError(form,'This demo link is no longer valid.');
      }
      const reset = pending.mode==='reset-password';
      if (!save(reset?'Demo password changed.':'Demo account created.',()=>{
        if (reset) existing.demoCredential = credential;
        else state.users.push({name:pending.name,email:pending.email,role:'Dispatch',status:'Active',demoCredential:credential});
      })) return generalError(form,'The password could not be saved in this browser.');
      pendingAccess = undefined;
      authEmail = pending.email;
      if (reset) {
        if (signedInEmail===pending.email) rememberAccount('');
        go('sign-in');
      } else {
        rememberAccount(pending.email,pending.remember);
        go('dispatch');
      }
    }
  } catch {
    if (form.isConnected) generalError(form,'This browser could not complete the demo account action.');
  } finally {
    submit.disabled = false;
  }
}

document.addEventListener('input',e=>{
  if (e.target.id !== 'help-search') return;
  const query = e.target.value.trim().toLowerCase();
  let matches = 0;
  app.querySelectorAll('.help-topics > section').forEach(section=>{
    const heading = section.querySelector('h2').textContent;
    const articles = Array.from(section.querySelectorAll('details'));
    articles.forEach(article=>{
      article.hidden = !`${heading} ${article.textContent}`.toLowerCase().includes(query);
      if (!article.hidden) matches++;
    });
    section.hidden = articles.every(article=>article.hidden);
  });
  app.querySelector('.guidance-empty').hidden = matches > 0;
});

document.addEventListener('click', e=>{
  if (!e.target.closest('.account-dropdown') || e.target.closest('.account-options a')) setProfileOpen(false);
  if (!e.target.closest('.admin-dropup') || e.target.closest('.admin-panel a')) closeAdministration();
  const el = e.target.closest('[data-action]');
  if (!el) {
    const row = e.target.closest('.registry-table tbody tr');
    if (row && !e.target.closest('a,button,input,select,textarea') &&
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && window.getSelection()?.isCollapsed !== false) {
      row.querySelector('a.registry-identity,button.staff-edit')?.click();
    }
    if (navOpen && e.target.closest('.sidebar a') && e.target.closest('a').hash===location.hash) {
      navOpen=false; render({focus:true});
    }
    return;
  }
  const {action,id} = el.dataset;
  if (action==='menu') {
    navOpen=!navOpen;
    render();
    app.querySelector(navOpen?'.side-close':'[aria-controls="side"]')?.focus();
  } else if (action==='aurora-toggle' || action==='aurora-close') toggleAurora(action==='aurora-toggle' && !auroraOpen);
  else if (action==='aurora-prompt') {
    sendAurora(id);
    assistant.querySelector('input')?.focus({preventScroll:true});
  }
  else if (action==='fill-demo-email') {
    const form = app.querySelector('form[data-form="auth"]');
    form.elements.email.value = demoAdmin.email;
    form.elements.password.value = demoPassword;
    form.elements.namedItem('accept-all').focus();
  } else if (action==='password-toggle') {
    const input = el.form.elements.password;
    input.type = input.type === 'password' ? 'text' : 'password';
    el.textContent = input.type === 'password' ? 'Show' : 'Hide';
  } else if (action==='theme' && Object.hasOwn(themes,id)) {
    themePreference = id;
    try { localStorage.setItem('mouka-appearance',id); } catch {}
    applyTheme();
  } else if (action==='access-policy') {
    const [title,,sections] = legalItems[id];
    openModal(title,`<div class="guidance-content">${policySections(sections)}</div>`);
  } else if (action==='google-preview') {
    openModal('Continue with Google',`<p>Google sign-in is unavailable in this demo. Use a demo account to explore the workspace.</p>`);
  } else if (action==='close') modal.close();
  else if (action==='filter-options') {
    const panel = document.getElementById(el.getAttribute('aria-controls'));
    panel.hidden = !panel.hidden;
    el.setAttribute('aria-expanded',String(!panel.hidden));
  } else if (action==='status-filter') {
    const query = app.querySelector('form[data-form="filters"] input[name="query"]')?.value;
    filters = {...filters,query: query?.trim() || '',status:id};
    render();
    [...app.querySelectorAll('[data-action="status-filter"]')].find(button => button.dataset.id === id)?.focus({preventScroll:true});
  }
  else if (action==='queue-filter' || action==='show-exceptions') {
    queueFilter=action==='show-exceptions' ? 'attention' : id;
    render();
    const filterButton = app.querySelector(`[data-action="queue-filter"][data-id="${queueFilter}"]`);
    filterButton?.focus({preventScroll:action==='queue-filter'});
  } else if (action==='sign-out') {
    rememberAccount('');
    pendingAccess = undefined;
    go('sign-in');
  }
  else if (action==='activity') {
    activityRead=true;
    app.querySelector('.unread')?.remove();
    openModal('Dispatch activity',activity(12));
  } else if (action==='profile') {
    setProfileOpen(el.getAttribute('aria-expanded') !== 'true');
  } else if (action==='account-settings') {
    setProfileOpen(false,true);
    const viewer = account();
    if (viewer) openModal('Account settings',`<form class="form" data-form="account-settings">
      ${kv([['Name',viewer.name],['Demo email',viewer.email],['Role',viewer.role]])}
      ${fontSizeControl()}${rememberChoice(isRemembered(signedInEmail))}<button class="btn" type="submit">Save settings</button></form>`);
    else openModal('Account settings',`<div class="stack">${fontSizeControl()}<p>Sign in to change your demo account settings.</p></div><div class="detail-actions">${link('sign-in','Sign in','primary')}</div>`);
  } else if (action==='open-help-aurora') {
    modal.close();
    toggleAurora(true);
  } else if (action==='clear-filters') { filters={}; render({focus:true}); }
  else if (action==='marker'||action.startsWith('zoom-')) updateMap(action,el);
  else if (action==='respond') modalForm('Simulate operator response','respond',id,
    field('Response','<select name="response"><option>Accepted</option><option>Declined</option></select>')+
    field('Reason for declining','<textarea name="reason" aria-describedby="error-reason"></textarea><span class="field-error" id="error-reason"></span>'),'Save response');
  else if (action==='stage') stageModal(trip(id));
  else if (action==='deliver') {
    const t=trip(id);
    if (t?.stops[t.done]) modalForm('Confirm delivery stop','deliver',id,notice(t.stops[t.done]),'Confirm delivered');
  } else if (action==='review') modalForm('Review truck registration','review',id,
    field('Decision','<select name="decision"><option>Verified</option><option>Needs corrections</option><option>Rejected</option></select>')+
    field('Review note','<textarea name="note" aria-describedby="error-note"></textarea><span class="field-error" id="error-note"></span>'),'Save decision');
  else if (action==='invite') userModal();
  else if (action==='edit-user') {
    const user = state.users.find(u=>u.email===id);
    if (user) userModal(user);
  }
  else if (action==='new-depot'||action==='edit-depot') depotModal(state.locations.find(d=>d.name===id));
});

document.addEventListener('submit',async e=>{
  const form=e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind=form.dataset.form;
  const id=form.dataset.id;
  const f=Object.fromEntries(new FormData(form));
  if (kind==='aurora') {
    if (String(f.question || '').trim()) {
      sendAurora(f.question);
      form.reset();
    }
    return;
  }
  if (kind==='filters') {
    filters={...f,query:f.query?.trim() || ''};
    render({focus:Boolean(e.submitter)});
    if (!e.submitter) app.querySelector('.registry-search input')?.focus({preventScroll:true});
    return;
  }
  if (!valid(form)) return;
  if (kind==='account-settings') {
    if (signedInEmail) rememberAccount(signedInEmail,Boolean(f.remember));
    modal.close();
    toast('Account settings saved.');
    return;
  }

  if (kind==='auth') {
    await handleAccess(form,id,f);
    return;
  }
  if (kind==='respond') {
    const t=trip(id);
    if (!t || t.status!=='Awaiting response') return generalError(form,'This request already has a response. Close this window and refresh the queue.');
    if (f.response==='Declined'&&!f.reason.trim()) return setError(form,'reason','Enter a reason for declining.');
    finish('Operator response saved.',()=>{
      t.status=f.response;
      t.reason=f.response==='Declined'?f.reason.trim():'';
      const label='Truck request '+f.response.toLowerCase();
      event(t,label);
      log(label,id+' · '+truck(t.truck).operator,f.response==='Declined'?'close':'check');
    });
  } else if (kind==='stage') {
    const t=trip(id);
    if (!t) return generalError(form,'This trip is unavailable.');
    if (t.status==='Accepted') finish('Arrival recorded.',()=>{
      t.status='At bay'; t.bay=f.bay; t.arrivalAt=Date.now();
      event(t,'Truck arrived at '+f.bay); log('Truck arrived',id+' · '+t.depot,'bay');
    });
    else if (t.status==='At bay') finish('Loading started.',()=>{
      t.status='Loading'; t.loadingAt=Date.now(); event(t,'Loading started'); log('Loading started',id+' · '+t.bay,'bay');
    });
    else if (t.status==='Loading') finish('Truck released. Delivery tracking started.',()=>{
      t.status='In transit'; t.releasedAt=Date.now();
      t.loadMinutes=t.loadingAt?Math.floor((t.releasedAt-t.loadingAt)/60000):t.arrived ?? 0;
      t.eta='48 min (sample)'; event(t,'Truck released by loading staff'); log('Truck released',id+' · '+t.depot,'check');
    });
  } else if (kind==='deliver') {
    const t=trip(id);
    if (!t || t.done>=t.stops.length || t.status!=='In transit') return generalError(form,'No remaining delivery stop is available.');
    finish('Delivery stop confirmed.',()=>{
      const stop=t.stops[t.done++];
      event(t,'Delivery confirmed at '+stop);
      if (t.done===t.stops.length) { t.status='Delivered'; truck(t.truck).status='Available'; }
      log('Delivery confirmed',id+' · '+stop);
    });
  } else if (kind==='review') {
    const v=truck(id);
    if (!v||v.review!=='Pending review') return generalError(form,'This registration is no longer pending.');
    if (f.decision==='Verified' && (v.docs?.length ?? 0)<3) return generalError(form,'A required document is missing. Request corrections before approving this truck.');
    if (f.decision!=='Verified'&&!f.note.trim()) return setError(form,'note','Explain the decision so the operator can follow up.');
    finish('Verification decision saved.',()=>{
      v.review=f.decision; v.reviewNote=f.note.trim(); if(f.decision==='Verified') { v.status='Available'; v.fresh=null; }
      log('Registration reviewed',v.plate+' · '+f.decision,'shield');
    });
  } else if (kind==='invite'||kind==='edit-user') {
    const email=f.email.trim().toLowerCase();
    const editing = kind==='edit-user';
    const user = editing ? state.users.find(u=>u.email===id) : undefined;
    if (editing && !user) return generalError(form,'This account is no longer available.');
    if (!email.endsWith('@example.com')) return setError(form,'email','Use an example.com email address for this demo.');
    if (state.users.some(u=>u!==user && u.email.toLowerCase()===email)) return setError(form,'email','This email already has a workspace account.');
    if (!roles.includes(f.role) || (editing && !staffStatuses.includes(f.status))) return generalError(form,'Choose a valid role and account status.');
    const record = {name:f.name.trim(),email,role:f.role,status:editing?f.status:'Invited'};
    const isCurrentUser = editing && id===signedInEmail;
    const keepSession = isCurrentUser && isRemembered(id);
    if (!save(editing?'Staff account updated.':'Demo invitation created.',()=>{
      if (user) Object.assign(user,record);
      else state.users.push(record);
    })) return generalError(form,'The account could not be saved. Check your connection or browser storage and try again.');
    if (isCurrentUser && (email!==id || record.status!=='Active')) rememberAccount(record.status==='Active'?email:'',keepSession);
    if (editing && filters.email===id) filters.email=email;
    modal.close();
    render({focus:true});
  } else if (kind==='new-depot'||kind==='edit-depot') {
    const name=f.name.trim();
    if (state.locations.some(d=>d.name!==id && d.name.toLowerCase()===name.toLowerCase())) return setError(form,'name','A depot with this name already exists.');
    const record={name,area:f.area.trim(),bays:Number(f.bays)};
    if (loading().some(t=>t.depot===id && Number(t.bay?.split(' ').at(-1))>record.bays)) return generalError(form,'A truck is still using a bay that would be removed.');
    finish('Depot settings saved.',()=>{
      if (kind==='new-depot') state.locations.push(record);
      else {
        Object.assign(state.locations.find(d=>d.name===id),record);
        state.trips.filter(t=>t.depot===id).forEach(t=>{ t.depot=name; });
      }
    });
  }
});

document.addEventListener('keydown',e=>{
  if (e.key==='Enter' && !e.isComposing && e.target.matches('.registry-search input')) {
    e.preventDefault();
    e.target.form.requestSubmit();
    return;
  }
  if (e.key==='Escape' && !modal.open) {
    if (app.querySelector('.admin-dropup[open]')) {
      closeAdministration(true);
      return;
    }
    if (app.querySelector('.profile-trigger[aria-expanded="true"]')) {
      setProfileOpen(false,true);
      return;
    }
    if (auroraOpen && !navOpen) toggleAurora(false);
  }
  if (e.key==='Escape'&&navOpen&&!modal.open) {
    navOpen=false; render(); app.querySelector('[aria-controls="side"]')?.focus();
  }
  if (e.key==='Tab' && navOpen && !modal.open) {
    const items=[...app.querySelectorAll('.sidebar a,.sidebar button,.sidebar summary')].filter(item => item.getClientRects().length && !item.closest('.admin-dropup:not([open]) .admin-panel'));
    if (e.shiftKey && document.activeElement===items[0]) { e.preventDefault(); items.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement===items.at(-1)) { e.preventDefault(); items[0].focus(); }
  }
});
document.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();document.querySelector('#main')?.focus();});
window.addEventListener('hashchange',routeChanged);
for (const eventType of ['online','offline']) window.addEventListener(eventType,()=>{
  const banner=document.querySelector('#connection');
  if (banner) banner.hidden=navigator.onLine;
});
routeChanged();
