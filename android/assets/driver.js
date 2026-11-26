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

function render() {
  const active = state.assignments.find(item => phase(item.id) === 'active');
  if (!selected) selected = (active || state.assignments[0]).id;
  const trip = state.assignments.find(item => item.id === selected);
  const status = phase(trip.id);
  const done = (state.trips[trip.id] || {}).done || 0;
  const total = trip.stops.length;
  const statusName = {assigned:'Assigned',active:'In progress',completed:'Completed'}[status];
  const tracking = Boolean(active && state.tracking);
  const sync = state.syncConfigured ? (state.pending ? 'Updates queued for dispatch' : 'No updates waiting to sync') : 'Dispatch sync is disconnected in this demo';
  const action = status === 'assigned' ? (active ? 'openActive' : 'start')
    : status === 'completed' ? '' : done === total ? 'end' : !tracking ? 'resume' : 'confirm';
  const actionInfo = {
    start: ['Start trip', 'gps', 'Starting records your location until the trip ends.'],
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
  screen.innerHTML = `<section class="hero">
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
    <span><b>${tracking ? 'Location recording on' : active ? 'Tracking paused' : 'Location recording off'}</b>
    <small>${sync}</small></span><span class="counter">${state.pending ? state.pending + ' queued' : ''}</span></div>
  <section aria-label="Delivery stops"><div class="sectionTitle"><h2>Delivery stops</h2><span>${done} of ${total} confirmed</span></div>
  <ol class="stops">${next}</ol></section>
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
  render();
};

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
    document.querySelector('#confirmText').textContent = end ? 'Location recording will stop. Saved updates will stay in the queue.'
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
