'use strict';

const shapes = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h8"/>',
  truck: '<path d="M3 5h12v12H3zM15 9h4l2 4v4h-6"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  gps: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m10 7h-3m-7 10v-3M2 12h3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>'
};
const svg = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shapes[name] + '</svg>';
const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const screen = document.querySelector('#screen');
const dock = document.querySelector('#dock');
const dialog = document.querySelector('#confirm');
const notice = document.querySelector('#notice');
let selected;
let state;
let signature;
let message = '';

function phase(id) {
  return (state.trips[id] || {}).phase || 'assigned';
}

function routeDirections(places) {
  const query = new URLSearchParams({api:'1',origin:places[0],destination:places[places.length-1],travelmode:'driving'});
  if (places.length > 2) query.set('waypoints',places.slice(1,-1).join('|'));
  return 'https://www.google.com/maps/dir/?' + query.toString();
}

function tripRouteMap(trip) {
  const stops = [{name:trip.origin, address:trip.originAddress, coordinates:trip.originCoordinates}, ...trip.stops];
  const points = stops.map((point,index) => ({
    ...point,
    city:index === 0 ? 'Depot' : 'Stop ' + index,
    x:65 + index * 350 / Math.max(1,stops.length-1),
    y:211 - index * 150 / Math.max(1,stops.length-1)
  }));
  const known = points.every(point => Array.isArray(point.coordinates) && point.coordinates.length === 2 && point.coordinates.every(Number.isFinite));
  const route = points.length > 1 ? `<svg class="route-drawing" viewBox="0 0 480 260" role="img" aria-label="${safe('Schematic map from '+points.map(point => point.city).join(' to '))}">
      <path class="route-grid" d="M0 52h480M0 104h480M0 156h480M0 208h480M80 0v260M160 0v260M240 0v260M320 0v260M400 0v260"/>
      <polyline class="route-line" points="${points.map(point => point.x+','+point.y).join(' ')}"/>
      ${points.map((point,i) => `<g><circle cx="${point.x}" cy="${point.y}" r="10"/><text class="map-index" x="${point.x}" y="${point.y+4}">${i}</text><text class="map-place" x="${point.x}" y="${point.y-16}">${safe(point.city)}</text></g>`).join('')}
    </svg>` : '';
  const places = points.map(point => point.address);
  const destination = points[points.length-1];
  const bounds = known ? [
    Math.min(...points.map(point => point.coordinates[1])) - .12,
    Math.min(...points.map(point => point.coordinates[0])) - .12,
    Math.max(...points.map(point => point.coordinates[1])) + .12,
    Math.max(...points.map(point => point.coordinates[0])) + .12
  ].join(',') : '';
  const streetMap = bounds && 'https://www.openstreetmap.org/export/embed.html?' +
    new URLSearchParams({bbox:bounds,layer:'mapnik',marker:destination.coordinates.join(',')});

  return `<section class="trip-route-map" aria-labelledby="trip-map-title">
    <header><div><h2 id="trip-map-title">Route map</h2><p>Sample stop order</p></div>${places.every(Boolean) ? `<a class="secondary" href="${safe(routeDirections(places))}" target="_blank" rel="noopener noreferrer">Full trip directions</a>` : ''}</header>
    ${route}${streetMap ? `<details class="trip-street-map" data-map-url="${safe(streetMap)}"><summary>Show interactive street map</summary></details>` : ''}<ol>${points.map((point,i) => `<li><span class="pin" aria-hidden="true">${i}</span><b>${safe(point.name)}</b>${i && places[i-1] && places[i] ? `<a class="text-link" href="${safe(routeDirections(places.slice(i-1,i+1)))}" target="_blank" rel="noopener noreferrer">Directions<span class="visually-hidden"> to ${safe(point.name)}</span></a>` : !i ? '<small>Departure</small>' : ''}</li>`).join('')}</ol>
  </section>`;
}

function render() {
  const active = state.assignments.find(item => phase(item.id) === 'active');
  if (!selected) selected = (active || state.assignments[0]).id;
  const trip = state.assignments.find(item => item.id === selected);
  const status = phase(trip.id);
  const done = (state.trips[trip.id] || {}).done || 0;
  const total = trip.stops.length;
  const statusName = {assigned:'Assigned',active:'In progress',completed:'Completed'}[status];
  const tracking = Boolean(active && state.tracking);
  const sync = state.syncConfigured ? (state.pending ? 'Updates queued for dispatch' : 'No updates waiting to sync') : 'GPS and Dispatch updates are simulated';
  const action = status === 'assigned' ? (active ? 'openActive' : 'start')
    : status === 'completed' ? '' : done === total ? 'end' : !tracking ? 'resume' : 'confirm';
  const actionInfo = {
    start: ['Start trip', 'gps', 'Try the trip using simulated location tracking.'],
    openActive: ['Return to active trip', 'arrow', 'One trip can be active at a time.'],
    resume: ['Resume tracking', 'gps', 'Open the app and resume recording location.'],
    confirm: ['Confirm stop ' + (done + 1), 'check', done < total ? trip.stops[done].name : ''],
    end: ['End trip', 'stop', 'All delivery stops confirmed.']
  };
  const last = trip.stops[total - 1];
  const next = trip.stops.map((stop, index) => {
    const complete = index < done;
    const current = index === done && status !== 'completed';
    return '<li class="stop ' + (complete ? 'done' : current ? 'next' : '') + '"><span class="pin">'
      + (complete ? svg('check') + '<span hidden>' + (index + 1) + '</span>' : index + 1)
      + '</span><span class="listCopy"><b>' + safe(stop.name) + '</b><small>' + safe(stop.area)
      + '</small></span>' + (complete || current ? '<span class="stepLabel">' + (complete ? 'Delivered' : 'Next stop') + '</span>' : '') + '</li>';
  }).join('');
  const others = state.assignments.filter(item => item.id !== trip.id).map(item =>
    '<li><button class="tripButton" data-trip="' + safe(item.id) + '"><span class="tile">' + svg('route')
    + '</span><span class="listCopy"><b>' + safe(item.stops[item.stops.length - 1].area.split(',')[0]) + '</b><small>'
    + safe(item.id) + ' · ' + ({assigned:'Assigned',active:'In progress',completed:'Completed'}[phase(item.id)])
    + '</small></span>' + svg('arrow') + '</button></li>').join('');

  const focusedTrip = document.activeElement && document.activeElement.dataset.trip;
  screen.innerHTML = `<div class="detail-back"><button type="button" class="secondary" data-page="trips">My Trips</button></div><section class="hero">
    <div class="heroTop"><span class="tripno">TRIP ${safe(trip.id)}</span><span class="tag ${status}">${statusName}</span></div>
    <h1>${safe(last.area.split(',')[0])} delivery</h1>
    <p class="route">${safe(trip.origin)} ${svg('arrow')} ${safe(last.area)}</p>
    <div class="details">
      <div class="stat">${svg('truck')}<span><small>Vehicle</small><b>${safe(trip.truck)}</b></span></div>
      <div class="stat">${svg('time')}<span><small>Departure</small><b>${safe(trip.window)}</b></span></div>
    </div>
    <progress class="trip-meter" value="${done}" max="${total}" aria-label="${done} of ${total} stops confirmed"></progress>
  </section>
  <div class="status"><span class="tile ${tracking ? 'live' : active ? 'attention' : ''}">${svg('gps')}</span>
    <span><b>${tracking ? 'Simulated tracking on' : active ? 'Tracking paused' : 'Simulated tracking off'}</b>
    <small>${sync}</small></span><span class="counter">${state.pending ? state.pending + ' queued' : ''}</span></div>
  <section aria-label="Delivery stops"><div class="sectionTitle"><h2>Delivery stops</h2><span>${done} of ${total} confirmed</span></div>
  <ol class="stops">${next}</ol></section>
  ${tripRouteMap(trip)}
  ${others ? '<section class="assignmentSection"><div class="sectionTitle"><h2>Other trips</h2></div><ul class="assignments">' + others + '</ul></section>' : ''}`;

  if (focusedTrip) {
    const focus = Array.from(screen.querySelectorAll('[data-trip]')).find(button => button.dataset.trip === focusedTrip);
    if (focus) focus.focus({preventScroll:true});
  }
  dock.hidden = !action;
  const currentButton = dock.querySelector('button');
  if (action) {
    const [label, icon, help] = actionInfo[action];
    if (!currentButton || currentButton.dataset.action !== action || currentButton.dataset.index !== String(done)) {
      dock.innerHTML = '<div class="wrap bar"><button class="primary" data-action="' + action + '" data-index="' + done + '">'
        + svg(icon) + safe(label) + '</button><p>' + safe(help) + '</p></div>';
      if (currentButton === document.activeElement) dock.querySelector('button').focus();
    }
  } else {
    dock.innerHTML = '';
  }
  if (state.note !== message) {
    message = state.note;
    notice.textContent = message;
    notice.hidden = !message;
  }
}

window.refreshDriver = function () {
  if (!window.Driver) return;
  const snapshot = Driver.snapshot();
  if (snapshot === signature) return;
  signature = snapshot;
  state = JSON.parse(snapshot);
  if (window.renderWorkspace) window.renderWorkspace();
  else render();
};

document.addEventListener('toggle', event => {
  const section = event.target;
  if (!section.open || !section.dataset?.mapUrl || section.querySelector('iframe')) return;
  const map = document.createElement('iframe');
  map.src = section.dataset.mapUrl;
  map.title = 'Interactive street map of the trip area';
  map.loading = 'lazy';
  section.append(map);
}, true);

let pending;
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !state) return;
  if (button.dataset.trip || button.dataset.action === 'openActive') {
    selected = button.dataset.trip || state.assignments.find(item => phase(item.id) === 'active').id;
    signature = null;
    window.refreshDriver();
    window.scrollTo(0, 0);
    return;
  }
  const action = button.dataset.action;
  const index = Number(button.dataset.index);
  if (action === 'start' || action === 'resume') Driver.act(selected, action, index);
  if (action === 'confirm' || action === 'end') {
    const trip = state.assignments.find(item => item.id === selected);
    pending = {id:selected, action, index};
    const end = action === 'end';
    document.querySelector('#confirmTitle').textContent = end ? 'End this trip?' : 'Confirm this delivery?';
    document.querySelector('#confirmText').textContent = end ? 'Simulated tracking will stop. Demo updates will stay in the queue.'
      : 'Confirm once the delivery at ' + trip.stops[index].name + ' is complete.';
    document.querySelector('#approve').textContent = end ? 'End trip' : 'Confirm delivery';
    dialog.showModal();
  }
});
document.querySelector('#cancel').addEventListener('click', () => dialog.close());
document.querySelector('#approve').addEventListener('click', () => {
  if (pending) Driver.act(pending.id, pending.action, pending.index);
  dialog.close();
});
dialog.addEventListener('close', () => { pending = null; });
window.refreshDriver();
setInterval(window.refreshDriver, 1500);
