'use strict';

const ui = id => document.getElementById(id);
const shell = ui('driverWorkspace');
const settings = ui('driverSettings');
const themeQuery = matchMedia('(prefers-color-scheme: dark)');
const mobileNav = matchMedia('(max-width: 680px)');
const navigation = [
  ['overview','Dispatch Overview','grid'],
  ['trips','My Trips','truck']
];
const accountLinks = [
  ['profile','Profile','user'],
  ['notifications','Notifications','bell'],
  ['sync','Sync & Tracking','gps'],
  ['issue','Report an Issue','warning'],
  ['help','Help & Support','help']
];
Object.assign(shapes, {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4m-9 4h6m-6 4h6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 6 0 0 1 16 0v2"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0v5l-2 3h16l-2-3V8m-8 12h4"/>',
  warning:'<path d="M12 3 2 21h20L12 3Zm0 7v4m0 3h.01"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1.1-1 2m0 3h.01"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  up:'<path d="m6 15 6-6 6 6"/>',
  system:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>',
  light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  dark:'<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/>',
  logout:'<path d="M10 5H5v14h5m2-7h8m-3-3 3 3-3 3"/>'
});

const links = [...navigation, ...accountLinks];
const navMarkup = items => items.map(([page,label,icon]) => `<button type="button" class="side-link" data-page="${page}">${svg(icon)}${label}</button>`).join('');
ui('driverNav').innerHTML = navMarkup(navigation);
ui('driverSettingsLinks').innerHTML = navMarkup(accountLinks);
ui('appearanceOptions').innerHTML = ['system','light','dark'].map(theme => `<button type="button" data-theme-choice="${theme}">${svg(theme)}${theme[0].toUpperCase()+theme.slice(1)}</button>`).join('');
ui('tabbar').innerHTML = [['overview','Home','grid'],['trips','Trips','truck'],['notifications','Alerts','bell'],['issue','Report','warning'],['profile','Profile','user']]
  .map(([page,label,icon]) => `<button type="button" data-page="${page}">${svg(icon)}<span>${label}</span></button>`).join('');
ui('navToggle').innerHTML = svg('menu');
ui('navClose').innerHTML = svg('close');
ui('accountChevron').innerHTML = svg('up');
ui('signOut').insertAdjacentHTML('afterbegin',svg('logout'));

let driverProfile;
let page = 'overview';
let tripFilter = 'all';
let noticeFilter = 'all';
let profileEditing = false;
let driverData;
let feedback = '';
const accountCache = new Map();

function getDriverData(driverId) {
  if (accountCache.has(driverId)) return accountCache.get(driverId);
  let saved;
  try { saved = JSON.parse(localStorage.getItem('mouka-driver:workspace:' + driverId)); } catch {}
  const data = { theme:'light', font:'standard', proofs:[], issues:[], read:[], profile:{}, adminNotices:[], ...saved };
  accountCache.set(driverId,data);
  return data;
}

function saveDriverData() {
  try {
    localStorage.setItem('mouka-driver:workspace:' + driverProfile.id, JSON.stringify(driverData));
    return true;
  } catch {
    return false;
  }
}

function applyAppearance() {
  if (!driverData) return;
  shell.dataset.theme = driverData.theme === 'system' ? (themeQuery.matches ? 'dark' : 'light') : driverData.theme;
  shell.dataset.font = driverData.font;
  ui('driverFont').value = driverData.font;
  for (const button of ui('appearanceOptions').children) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === driverData.theme));
  }
}

function setSettings(open) {
  settings.hidden = !open;
  ui('accountSettings').setAttribute('aria-expanded', String(open));
}

function setNavigation(open, restoreFocus = true) {
  shell.classList.toggle('nav-open',open);
  ui('navScrim').hidden = !open;
  shell.querySelector('.workspace-body').inert = open;
  dock.inert = open;
  ui('navToggle').setAttribute('aria-expanded',String(open));
  if (open) ui('navClose').focus();
  else {
    setSettings(false);
    if (restoreFocus && mobileNav.matches) ui('navToggle').focus();
  }
}

window.closeDriverNavigation = () => setNavigation(false,false);
mobileNav.addEventListener('change', () => setNavigation(false,false));
themeQuery.addEventListener('change',applyAppearance);
ui('navToggle').addEventListener('click', () => setNavigation(true));
ui('navClose').addEventListener('click', () => setNavigation(false));
ui('navScrim').addEventListener('click', () => setNavigation(false));
ui('accountSettings').addEventListener('click', () => setSettings(settings.hidden));
ui('driverFont').addEventListener('change',event => {
  driverData.font = event.target.value;
  saveDriverData();
  applyAppearance();
});
document.addEventListener('keydown',event => {
  if (shell.hidden || event.key !== 'Escape') return;
  if (!settings.hidden) {
    setSettings(false);
    ui('accountSettings').focus();
  } else if (shell.classList.contains('nav-open')) setNavigation(false);
});

window.enterDriverWorkspace = profile => {
  Driver.useDriver(profile.id);
  driverData = getDriverData(profile.id);
  driverProfile = {...profile,...driverData.profile,id:profile.id};
  updateDriverIdentity();
  applyAppearance();
  selected = null;
  page = 'overview';
  tripFilter = noticeFilter = 'all';
  profileEditing = false;
  feedback = '';
  signature = null;
};

function updateDriverIdentity() {
  ui('sidebarDriver').textContent = driverProfile.name;
  ui('sidebarInitials').textContent = driverProfile.name.split(/\s+/).map(name => name[0]).join('').slice(0,2).toUpperCase();
}

function heading(title, description) {
  return `<div class="panel-heading"><h1 tabindex="-1">${title}</h1><p>${description}</p></div>`;
}

const phaseText = {assigned:'Upcoming',active:'In progress',completed:'Completed'};
const destination = trip => trip.stops[trip.stops.length-1].area.split(',')[0];
const doneStops = trip => state.trips[trip.id]?.done || 0;
const tripButton = trip => `<li><button type="button" class="tripButton" data-open-trip="${safe(trip.id)}"><span class="tile">${svg('route')}</span><span class="listCopy"><b>${safe(destination(trip))} delivery</b><small>${safe(trip.id)} · ${safe(trip.origin)} · ${safe(trip.window)} · ${doneStops(trip)}/${trip.stops.length} stops</small></span><span class="tag ${phase(trip.id)}">${phaseText[phase(trip.id)]}</span></button></li>`;
const tripList = trips => trips.length ? `<ul class="assignments">${trips.map(tripButton).join('')}</ul>` : '<p class="workspace-panel">No trips in this view.</p>';

function overview() {
  const active = state.assignments.find(trip => phase(trip.id) === 'active');
  const upcoming = state.assignments.filter(trip => phase(trip.id) === 'assigned');
  const featured = active || upcoming[0];
  const completed = state.assignments.length - upcoming.length - Number(Boolean(active));
  const metrics = [[active ? 1 : 0,'Active trip'],[upcoming.length,'Upcoming trips'],[completed,'Completed trips'],[state.assignments.reduce((count,trip) => count + doneStops(trip),0),'Stops confirmed']];
  return heading('Dispatch Overview',`Your assignments and delivery progress, ${safe(driverProfile.name.split(' ')[0])}.`) +
    `<div class="overview-hero"><section class="hero"><div class="heroTop"><span class="tripno">${active ? 'ACTIVE TRIP' : featured ? 'NEXT ASSIGNMENT' : 'TRIPS COMPLETE'}</span></div><h2>${featured ? safe(destination(featured)) + ' delivery' : 'You’re up to date'}</h2><p>${featured ? [featured.id,featured.truck,featured.window].map(safe).join(' · ') : 'Completed runs are available in My Trips.'}</p><button type="button" class="primary" ${featured ? `data-open-trip="${safe(featured.id)}"` : 'data-page="trips"'}>${active ? 'Resume trip' : featured ? 'Open trip details' : 'Open My Trips'}</button></section></div>` +
    `<div class="metric-grid">${metrics.map(([number,label]) => `<article class="metric"><b>${number}</b><span>${label}</span></article>`).join('')}</div>` +
    `<section><div class="panel-title"><h2>Your assignments</h2><button class="text-link" type="button" data-page="trips">View My Trips</button></div>${tripList(active ? [active,...upcoming] : upcoming)}</section>`;
}

function moduleHero(title, description, icon, color, actions = '') {
  return `<header class="module-hero tone-${color}"><span class="module-icon">${svg(icon)}</span><div><h1 tabindex="-1">${title}</h1><p>${description}</p></div>${actions ? '<div class="module-actions">' + actions + '</div>' : ''}</header>`;
}

const tones = ['green','blue','amber','red'];
const stamp = (label, tone = 'blue') => `<span class="status-chip tone-${tone}">${label}</span>`;
const linkButton = (label, props) => `<button type="button" class="secondary" ${props}>${label}</button>`;
const listPanel = (title, description, content) => `<section class="module-panel"><header><h2>${title}</h2><p>${description}</p></header>${content}</section>`;
const emptyState = (message, icon = 'file') => `<div class="module-empty">${svg(icon)}<p>${message}</p></div>`;
const searchable = (label, placeholder) => `<div class="module-search"><label>${label}<input type="search" data-module-search placeholder="${placeholder}"></label><p aria-live="polite"></p></div>`;
const prettyDate = input => input ? new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(input)) : 'Earlier in this demo';

function stageStrip(label, options, active, dataKey) {
  return `<div class="driver-stage-strip" role="group" aria-label="${label}">${options.map(([key,title,count,icon], index) => {
    const tone = tones[index % tones.length];
    const value = `<span class="stage-icon">${svg(icon)}</span><strong>${safe(count)}</strong><span>${title}</span>`;
    return dataKey ? `<button type="button" class="driver-stage tone-${tone}" data-${dataKey}="${key}" aria-pressed="${key === active}">${value}</button>` : `<div class="driver-stage tone-${tone}">${value}</div>`;
  }).join('')}</div>`;
}

function tripsPage() {
  const order = ['active','assigned','completed'];
  const trips = [...state.assignments].sort((a,b) => order.indexOf(phase(a.id))-order.indexOf(phase(b.id)));
  const stages = [['all','All trips',trips.length,'grid'],...order.map((key,i) => [key,phaseText[key],trips.filter(trip => phase(trip.id) === key).length,['truck','time','check'][i]])];
  const visible = trips.filter(trip => tripFilter === 'all' || phase(trip.id) === tripFilter);
  const queue = visible.length ? `<div class="driver-registry-header"><span>Assignment</span><span>Vehicle</span><span>Stops</span><span>Stage</span></div><ul class="driver-registry">${visible.map(trip => `<li data-search-row><button type="button" class="driver-registry-row" data-open-trip="${safe(trip.id)}"><span class="registry-person"><span class="entry-icon tone-blue">${svg('route')}</span><span><b>${safe(destination(trip))} delivery</b><small>${safe(trip.id)} · ${safe(trip.origin)} · ${safe(trip.window)}</small></span></span><span>${safe(trip.truck)}</span><span>${doneStops(trip)} of ${trip.stops.length}</span>${stamp(phaseText[phase(trip.id)],phase(trip.id) === 'assigned' ? 'blue' : 'green')}</button></li>`).join('')}</ul>` : emptyState('No assignments in this stage.','truck');
  return moduleHero('My Trips','Track your assignments from departure to the last delivery stop.','truck','blue') +
    stageStrip('Filter assignments',stages,tripFilter,'trip-filter') +
    listPanel('Trip registry','Select a row to open trip details.',searchable('Find an assignment','Trip ID, destination or vehicle') + queue);
}

const issueTypes = [['Delay','time','amber'],['Vehicle breakdown','truck','red'],['Wrong address','route','blue'],['Rejected delivery','file','red'],['Other','help','green']];
function issuePage() {
  const active = state.assignments.find(trip => phase(trip.id) === 'active');
  return moduleHero('Report an Issue','Capture a problem with a trip, a vehicle, or a delivery stop.','warning','amber') +
    `<div class="shortcut-grid">${issueTypes.slice(0,4).map(([name,icon,tone]) => `<button type="button" data-issue-type="${name}" class="shortcut tone-${tone}">${svg(icon)}<b>${name}</b></button>`).join('')}</div>` +
    `<div class="module-split">${listPanel('New issue','Choose a category and describe what happened.',`<div class="module-content"><form class="workspace-form" data-record-form="issue"><label for="issueTrip">Trip</label><select id="issueTrip" name="trip"><option value="">General issue</option>${state.assignments.map(trip => `<option value="${safe(trip.id)}" ${active?.id === trip.id ? 'selected' : ''}>${safe(trip.id)} · ${safe(destination(trip))}</option>`).join('')}</select><label for="issueType">Issue type</label><select id="issueType" name="type">${issueTypes.map(([name]) => `<option>${name}</option>`).join('')}</select><label for="issueNote">What happened?</label><textarea id="issueNote" name="note" required maxlength="500" placeholder="Include the stop or location if relevant"></textarea><button type="submit" class="primary">Save report</button></form>${statusMessage()}</div>`)}
    ${listPanel('Report history','Reports saved in this browser preview.',driverData.issues.length ? `<ul class="driver-registry">${driverData.issues.map(entry => `<li class="work-row"><span class="entry-icon tone-amber">${svg('warning')}</span><span><b>${safe(entry.type)}${entry.trip ? ' · '+safe(entry.trip) : ''}</b><small>${safe(entry.ref || 'Demo report')} · ${safe(prettyDate(entry.time))}</small><p>${safe(entry.note)}</p></span>${stamp('Saved locally','amber')}</li>`).join('')}</ul>` : emptyState('No issue reports yet.','warning'))}</div>`;
}

function notificationsPage() {
  const items = state.assignments.map(trip => ({id:trip.id,title:`${destination(trip)} delivery assigned`,description:`${trip.id} · ${trip.origin} · ${trip.window}`,trip:trip.id,icon:'truck',tone:'blue'}));
  items.unshift(...driverData.adminNotices.map(entry => ({id:entry.id,title:'Profile change queued for admin',description:entry.fields.join(', ') + ' · ' + prettyDate(entry.time),icon:'user',tone:'green'})));
  const unread = items.filter(item => !driverData.read.includes(item.id));
  const visible = noticeFilter === 'unread' ? unread : noticeFilter === 'read' ? items.filter(item => driverData.read.includes(item.id)) : items;
  const stages = [['all','All notices',items.length,'bell'],['unread','Unread',unread.length,'time'],['read','Read',items.length-unread.length,'check']];
  return moduleHero('Notifications','Keep up with your assignments and account activity.','bell','blue',unread.length ? linkButton('Mark all as read','data-read-all') : '') +
    stageStrip('Filter notifications',stages,noticeFilter,'notice-filter') +
    listPanel('Inbox','Open an assignment or mark it as read.',visible.length ? `<ul class="driver-registry inbox">${visible.map(item => `<li class="inbox-entry tone-${item.tone}"><span class="entry-icon">${svg(item.icon)}</span><div><b>${safe(item.title)}</b><p>${safe(item.description)}</p><div class="inbox-actions">${item.trip ? `<button type="button" class="text-link" data-open-trip="${safe(item.trip)}" data-read-notice>Open trip</button>` : ''}${!driverData.read.includes(item.id) ? `<button type="button" class="text-link" data-read-trip="${safe(item.id)}">Mark as read</button>` : ''}</div></div>${stamp(driverData.read.includes(item.id) ? 'Read' : 'Unread',driverData.read.includes(item.id) ? 'green' : 'blue')}</li>`).join('')}</ul>` : emptyState('No notices in this view.','bell'));
}

function syncPage() {
  const active = state.assignments.find(trip => phase(trip.id) === 'active');
  const review = [['gps','Location sharing',state.tracking ? 'Demo tracking active' : 'Idle',state.tracking ? 'green' : 'blue'],
    ['system','Browser connection',navigator.onLine ? 'Online' : 'Offline',navigator.onLine ? 'green' : 'amber'],
    ['file','Dispatch delivery','Preview only','amber']];
  const counts = [['trip','Trip updates',state.pending || 0,'route'],['profile','Admin notices',driverData.adminNotices.length,'user'],['issues','Saved reports',driverData.issues.length,'warning']];
  return moduleHero('Sync & Tracking','Check connection, location sharing, and updates stored on this device.','gps','blue',linkButton('Refresh status','data-refresh-sync')) +
    stageStrip('Browser outbox',counts) +
    `<div class="module-split">${listPanel('Connection status','Browser GPS and Dispatch sync are simulated.',`<ul class="driver-registry">${review.map(([icon,label,value,tone]) => `<li class="work-row"><span class="entry-icon tone-${tone}">${svg(icon)}</span><b>${label}</b>${stamp(value,tone)}</li>`).join('')}</ul><div class="module-content">${statusMessage()}${active ? linkButton('Open active trip',`data-open-trip="${safe(active.id)}"`) : ''}</div>`)}
    ${listPanel('Admin outbox','Profile changes are queued locally in this preview.',driverData.adminNotices.length ? `<ul class="driver-registry">${driverData.adminNotices.map(entry => `<li class="work-row"><span class="entry-icon tone-amber">${svg('user')}</span><span><b>${safe(entry.fields.join(', '))}</b><small>${safe(prettyDate(entry.time))}</small></span>${stamp('Queued','amber')}</li>`).join('')}</ul>` : emptyState('No changes waiting for an admin.','user'))}</div>` +
    (state.pending ? '<details class="demo-reset"><summary>Demo trip controls</summary><p>Reset the trip simulation and its queued trip updates.</p><button type="button" class="text-link" data-reset-progress>Reset demo trip progress</button></details>' : '');
}

const profileFields = [
  ['name','Full name','text',90],['email','Email','email',120],['phone','Phone number','tel',24],
  ['depot','Home depot','text',65],['licence','Driver licence number','text',45],
  ['licenceExpiry','Licence expiry date','date',10],['emergencyName','Emergency contact','text',90],['emergencyPhone','Emergency phone','tel',24]
];
function profileValue(key) {
  const value = driverProfile[key] || '';
  return key === 'phone' && value ? '+'+value : value;
}
function profilePage() {
  const identity = `<div class="profile-identity"><span class="driver-avatar">${safe(ui('sidebarInitials').textContent)}</span><div><h2>${safe(driverProfile.name)}</h2><p>${safe(driverProfile.depot || 'Home depot unavailable')}</p></div>${stamp('Driver account','green')}</div><div class="profile-id"><span>Driver ID</span><strong>${safe(driverProfile.id)}</strong></div>`;
  const details = profileEditing ? `<form class="workspace-form profile-form" data-record-form="profile"><div class="profile-fields">${profileFields.map(([key,label,type,max]) => `<label>${label}<input ${['name','email','phone'].includes(key) ? 'required' : ''} name="${key}" type="${type}" maxlength="${max}" value="${safe(profileValue(key))}"></label>`).join('')}</div><div class="account-actions"><button type="submit" class="primary">Save profile</button>${linkButton('Cancel','data-profile-edit="off"')}</div>${statusMessage()}</form>` : `<dl class="profile-fields profile-read">${profileFields.map(([key,label]) => `<div><dt>${label}</dt><dd>${safe(profileValue(key) || '—')}</dd></div>`).join('')}</dl>${statusMessage()}`;
  const latest = driverData.adminNotices[0];
  return moduleHero('Profile','Manage your driver, contact, licence, and emergency details.','user','green',profileEditing ? '' : linkButton('Edit profile','data-profile-edit="on"')) +
    `<div class="module-split profile-split">${listPanel(profileEditing ? 'Edit driver details' : 'Driver details','Saving a change queues an admin notice.',`<div class="module-content">${details}</div>`)}
    <div>${listPanel('Account', 'Your Driver ID is set by Dispatch.',`<div class="module-content">${identity}</div>`)}${listPanel('Latest admin notice','Profile updates appear in the demo admin outbox.',latest ? `<div class="module-content"><b>${safe(latest.fields.join(', '))}</b><p>${safe(prettyDate(latest.time))}</p>${stamp('Queued for admin','amber')}<button type="button" class="text-link" data-page="sync">View outbox</button></div>` : emptyState('No profile changes yet.','user'))}</div></div>`;
}

const faqs = [
  ['Trips','How do I start or end a trip?','Open My Trips, select the assignment, then start at departure. Confirm each stop in order before ending the trip.'],
  ['Deliveries','Where can I find directions to a stop?','Open the assignment in My Trips and use the route map in Trip Details. Choose Directions for the full trip or for an individual stop.'],
  ['Tracking','What happens if I lose connection?','Open Sync & Tracking to see your queued updates. This browser demo stores them locally and simulates tracking.'],
  ['Account','How do I update my phone number or email?','Open Account settings, then Profile. Edit your details and save. A notice is added to the demo admin outbox.'],
  ['Account','How do I recover my PIN?','Contact your dispatcher using the details your depot gave you. Have your Driver ID ready.'],
  ['Trips','What if I cannot complete a delivery?','Open Report an Issue, select the trip and type of issue, and describe what happened. Follow up directly with your dispatcher if you need an immediate response.']
];
function helpPage() {
  return moduleHero('Help & Support','Find answers to common trip and account questions.','help','blue') +
    `<div class="shortcut-grid help-shortcuts">${linkButton('Find a trip','data-page="trips"')}${linkButton('Report an issue','data-page="issue"')}${linkButton('Check tracking','data-page="sync"')}<a class="secondary" href="mailto:contact@terracodeanalytics.com">Email app support</a></div>` +
    listPanel('Driver help centre','Search by topic or expand a question.',searchable('Search help','Try PIN, directions or tracking') + `<div class="faq-list">${faqs.map(([topic,question,answer],i) => `<details data-search-row><summary>${stamp(topic,tones[i%4])}<b>${question}</b></summary><p>${answer}</p></details>`).join('')}</div>`);
}

function statusMessage() {
  return feedback ? `<p class="form-result" role="status">${safe(feedback)}</p>` : '';
}

const screens = {overview,trips:tripsPage,issue:issuePage,notifications:notificationsPage,sync:syncPage,profile:profilePage,help:helpPage};
window.renderWorkspace = () => {
  if (!driverProfile) return;
  const current = page === 'detail' ? 'trips' : page;
  for (const link of shell.querySelectorAll('.side-link[data-page], .tabbar [data-page]')) {
    if (link.dataset.page === current) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  ui('workspaceCrumb').textContent = page === 'detail' ? 'Trip Details' : links.find(item => item[0] === page)[1];
  if (page === 'detail') {
    render();
    return;
  }
  dock.hidden = true;
  dock.innerHTML = '';
  notice.hidden = true;
  screen.innerHTML = screens[page]();
};

function openPage(next) {
  page = next;
  profileEditing = false;
  feedback = '';
  setNavigation(false,false);
  window.renderWorkspace();
  const title = screen.querySelector('h1');
  title?.setAttribute('tabindex','-1');
  title?.focus();
  window.scrollTo(0,0);
}

function markNotice(id) {
  if (!driverData.read.includes(id)) driverData.read.push(id);
  saveDriverData();
}

shell.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !driverData) return;
  const target = button.dataset.page;
  if (target && screens[target]) openPage(target);
  if (button.dataset.openTrip) {
    if (button.hasAttribute('data-read-notice')) markNotice(button.dataset.openTrip);
    selected = button.dataset.openTrip;
    openPage('detail');
  }
  if (button.dataset.tripFilter) {
    tripFilter = button.dataset.tripFilter;
    window.renderWorkspace();
    screen.querySelector(`[data-trip-filter="${tripFilter}"]`).focus();
  }
  if (button.dataset.themeChoice) {
    driverData.theme = button.dataset.themeChoice;
    saveDriverData();
    applyAppearance();
  }
  if (button.dataset.readTrip) {
    markNotice(button.dataset.readTrip);
    window.renderWorkspace();
    (screen.querySelector(`[data-open-trip="${button.dataset.readTrip}"]`) || screen.querySelector('h1')).focus();
  }
  if (button.dataset.noticeFilter) {
    noticeFilter = button.dataset.noticeFilter;
    window.renderWorkspace();
    screen.querySelector(`[data-notice-filter="${noticeFilter}"]`).focus();
  }
  if (button.dataset.issueType) {
    ui('issueType').value = button.dataset.issueType;
    ui('issueNote').focus();
  }
  if (button.dataset.profileEdit) {
    profileEditing = button.dataset.profileEdit === 'on';
    feedback = '';
    window.renderWorkspace();
    (screen.querySelector('[name=name]') || screen.querySelector('[data-profile-edit]')).focus();
  }
  if (button.hasAttribute('data-read-all')) {
    driverData.read = [...new Set([...driverData.read,...state.assignments.map(item => item.id),...driverData.adminNotices.map(item => item.id)])];
    saveDriverData();
    window.renderWorkspace();
    screen.querySelector('h1').focus();
  }
  if (button.hasAttribute('data-reset-progress')) {
    feedback = 'Demo trip progress reset.';
    Driver.resetProgress();
    screen.querySelector('h1').focus();
  }
  if (button.hasAttribute('data-refresh-sync')) {
    feedback = 'Status refreshed at ' + new Intl.DateTimeFormat('en-NG',{timeStyle:'short'}).format(new Date()) + '.';
    window.renderWorkspace();
    screen.querySelector('[data-refresh-sync]').focus();
  }
});

shell.addEventListener('input',event => {
  if (!event.target.hasAttribute('data-module-search')) return;
  const query = event.target.value.trim().toLowerCase();
  const rows = [...event.target.closest('.module-panel').querySelectorAll('[data-search-row]')];
  for (const row of rows) row.hidden = !row.textContent.toLowerCase().includes(query);
  const count = rows.filter(row => !row.hidden).length;
  event.target.closest('.module-search').querySelector('p').textContent = query ? count + (count === 1 ? ' match' : ' matches') : '';
});

function profileError(form, message) {
  let error = form.querySelector('[role=alert]');
  if (!error) {
    error = document.createElement('p');
    error.setAttribute('role','alert');
    error.className = 'access-error';
    form.append(error);
  }
  error.textContent = message;
}

function saveProfile(form, values) {
  const next = Object.fromEntries(profileFields.map(([key]) => [key,String(values.get(key) ?? '').trim()]));
  next.email = next.email.toLowerCase();
  next.phone = normalizePhone(next.phone);
  if (!next.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.email) || !/^[0-9]{8,15}$/.test(next.phone)) {
    profileError(form,'Enter your name, a valid email, and a phone number with its country code.');
    return;
  }
  if (next.emergencyPhone && !/^[0-9]{8,15}$/.test(normalizePhone(next.emergencyPhone))) {
    profileError(form,'Enter a valid emergency phone number.');
    return;
  }
  const emailOwner = findDriver(next.email,true) || findDriver(next.email,false);
  const phoneOwner = findDriver(next.phone,true) || findDriver(next.phone,false);
  if ([emailOwner,phoneOwner].some(owner => owner && owner.id !== driverProfile.id)) {
    profileError(form,'That email or phone number is registered to another driver.');
    return;
  }
  const changes = profileFields.filter(([key]) => next[key] !== (driverProfile[key] || ''));
  if (!changes.length) {
    profileError(form,'Change at least one field before saving.');
    return;
  }
  const entry = {
    id:'profile-' + crypto.randomUUID(),
    driverId:driverProfile.id,
    time:new Date().toISOString(),
    fields:changes.map(([,label]) => label),
    changes:Object.fromEntries(changes.map(([key]) => [key,{previous:driverProfile[key] || '',updated:next[key]}]))
  };
  driverData.profile = next;
  driverData.adminNotices.unshift(entry);
  driverProfile = {...driverProfile,...next};
  updateDriverIdentity();
  feedback = saveDriverData() ? 'Profile saved. A notice is queued for the admin in this preview.' : 'Profile and admin notice saved for this visit only.';
  profileEditing = false;
  window.renderWorkspace();
  screen.querySelector('h1').focus();
}

shell.addEventListener('submit',event => {
  const form = event.target;
  if (!form.dataset.recordForm) return;
  event.preventDefault();
  const values = new FormData(form);
  if (form.dataset.recordForm === 'profile') return saveProfile(form,values);
  const note = String(values.get('note')).trim();
  if (!note) return;
  driverData.issues.unshift({trip:String(values.get('trip')), type:String(values.get('type')), note, ref:'ISS-' + crypto.randomUUID().slice(0,6).toUpperCase(), time:new Date().toISOString()});
  feedback = saveDriverData() ? 'Saved in this browser.' : 'Saved for this visit. Browser storage is unavailable.';
  window.renderWorkspace();
});
