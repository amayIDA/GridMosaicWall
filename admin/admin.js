(() => {
'use strict';
const $ = s => document.querySelector(s);
const gate = $('#gate'), gateForm = $('#gateForm'), pinEl = $('#pin'), gateErr = $('#gateErr');
const app = $('#app'), grid = $('#grid'), countEl = $('#count'), emptyEl = $('#empty'), search = $('#search');
const removedWrap = $('#removedWrap'), removedGrid = $('#removedGrid'), removedCount = $('#removedCount'), removedToggle = $('#removedToggle');
const toast = $('#toast');
const colsEl = $('#cols'), rowsEl = $('#rows'), colsAuto = $('#colsAuto'), rowsAuto = $('#rowsAuto'), colsOut = $('#colsOut'), rowsOut = $('#rowsOut'), fillEl = $('#fill'), tilesEl = $('#tiles'), fillHint = $('#fillHint'), ovEvery = $('#ovEvery'), ovOut = $('#ovOut'), ovOff = $('#ovOff');

let token = sessionStorage.getItem('mosaic-admin') || '';
let people = [], removed = [], query = '';
const blobs = new Map();                               // removed people's photos need the admin header, so they are fetched as blobs

const api = async (path, opts = {}) => {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, ...(opts.headers || {}) } });
  if (res.status === 401 && path !== '/api/admin/login') { signOut(); throw new Error('signed out'); }
  return res;
};

/* ───── sign in / out ───── */
function showApp() { gate.hidden = true; app.hidden = false; refresh(); loadSettings(); connect(); }
function signOut() { token = ''; sessionStorage.removeItem('mosaic-admin'); app.hidden = true; gate.hidden = false; pinEl.value = ''; pinEl.focus(); }
gateForm.addEventListener('submit', async e => {
  e.preventDefault(); gateErr.textContent = '';
  try {
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pinEl.value }) });
    const data = await res.json().catch(() => null);
    if (!data) { gateErr.textContent = 'This page isn’t connected to the Mosaic server.'; return; }
    if (!res.ok) { gateErr.textContent = data.error || 'Wrong PIN'; pinEl.select(); return; }
    token = data.token; sessionStorage.setItem('mosaic-admin', token); showApp();
  } catch (err) { gateErr.textContent = 'Can’t reach the Mosaic server.'; }
});
$('#signout').addEventListener('click', signOut);

/* ───── data ───── */
async function refresh() {
  try {
    const res = await api('/api/admin/people'); const d = await res.json();
    people = d.people || []; removed = d.removed || [];
    render();
  } catch (e) {}
}

const ago = iso => {
  const s = Math.max(1, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};
const matches = p => !query || [p.name, p.email, p.mobile].some(v => String(v || '').toLowerCase().includes(query));

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function card(p, mode) {
  const c = el('article', 'card' + (mode === 'removed' ? ' gone' : '')); c.dataset.id = p.id;
  const img = el('img', 'photo'); img.alt = p.name; img.loading = 'lazy'; img.decoding = 'async';
  if (mode === 'removed') {
    if (blobs.has(p.id)) img.src = blobs.get(p.id);
    else api('/api/admin/photo/' + p.id).then(r => r.blob()).then(b => { const u = URL.createObjectURL(b); blobs.set(p.id, u); img.src = u; }).catch(() => {});
  } else img.src = p.photo + '?v=' + encodeURIComponent(p.joinedAt);
  const info = el('div', 'info');
  info.append(el('div', 'name', p.name), el('div', 'meta', p.email), el('div', 'meta', p.mobile),
    el('div', 'when', mode === 'removed' ? 'Removed ' + ago(p.removedAt || p.joinedAt) : 'Joined ' + ago(p.joinedAt)));
  const actions = el('div', 'actions');
  if (mode === 'removed') {
    const restore = el('button', 'act', 'Restore'); restore.type = 'button'; restore.onclick = () => restoreOne(p);
    actions.append(restore, confirmButton('Delete', 'Delete forever?', () => purge(p)));
  } else actions.append(confirmButton('Remove from wall', 'Tap again to remove', () => removeOne(p, c)));
  c.append(img, info, actions);
  return c;
}

function confirmButton(label, ask, run) {              // two taps: the first arms the button, the second does it
  const b = el('button', 'act danger', label); b.type = 'button'; let t = 0;
  b.onclick = () => {
    if (b.classList.contains('confirm')) { clearTimeout(t); run(); return; }
    b.classList.add('confirm'); b.textContent = ask;
    t = setTimeout(() => { b.classList.remove('confirm'); b.textContent = label; }, 3200);
  };
  return b;
}

function render() {
  const shown = people.filter(matches);
  countEl.textContent = people.length + (shown.length !== people.length ? ` · ${shown.length} shown` : '');
  grid.replaceChildren(...shown.map(p => card(p, 'live')));
  emptyEl.hidden = people.length > 0;
  removedWrap.hidden = removed.length === 0;
  removedCount.textContent = removed.length;
  if (!removedToggle.getAttribute('aria-expanded') || removedToggle.getAttribute('aria-expanded') === 'true') removedGrid.replaceChildren(...removed.filter(matches).map(p => card(p, 'removed')));
}
search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
removedToggle.addEventListener('click', () => {
  const open = removedToggle.getAttribute('aria-expanded') !== 'true';
  removedToggle.setAttribute('aria-expanded', open); removedGrid.hidden = !open; if (open) render();
});

/* ───── wall layout (columns / rows / background) ───── */
let settings = { cols: 0, rows: 0, fill: 'photos', overlayEvery: 22 }, saveTimer = 0;
const FILL_HINT = {
  photos: 'Tiles that nobody has claimed repeat the registered photos in black & white. With nobody registered yet they stay empty.',
  faces: 'Tiles that nobody has claimed show generated illustrated faces.',
  plain: 'Only registered people appear; every other tile is an empty frame.'
};
function paintSettings() {
  colsAuto.checked = !settings.cols; rowsAuto.checked = !settings.rows;
  colsEl.disabled = colsAuto.checked; rowsEl.disabled = rowsAuto.checked;
  if (settings.cols) colsEl.value = settings.cols;
  if (settings.rows) rowsEl.value = settings.rows;
  colsOut.textContent = settings.cols || 'Auto'; rowsOut.textContent = settings.rows || 'Auto';
  tilesEl.textContent = settings.cols && settings.rows ? `${settings.cols} × ${settings.rows} = ${settings.cols * settings.rows} tiles on screen`
    : settings.cols || settings.rows ? 'One side fits the screen automatically' : 'Fits the screen';
  const oe = settings.overlayEvery === undefined ? 22 : settings.overlayEvery;
  ovOff.checked = oe === 0; ovEvery.disabled = oe === 0;
  if (oe) ovEvery.value = Math.min(oe, 180);
  ovOut.textContent = oe === 0 ? 'Off' : oe + ' s';
  fillEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.v === settings.fill));
  fillHint.textContent = FILL_HINT[settings.fill] || '';
}
async function loadSettings() { try { const r = await api('/api/admin/settings'); settings = await r.json(); paintSettings(); } catch (e) {} }
function changed() {                                    // apply to the live wall a moment after the last change
  paintSettings(); clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const res = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(settings) });
    say(res.ok ? 'Wall updated' : 'Couldn’t save the layout.');
  }, 450);
}
colsEl.addEventListener('input', () => { settings.cols = +colsEl.value; changed(); });
rowsEl.addEventListener('input', () => { settings.rows = +rowsEl.value; changed(); });
colsAuto.addEventListener('change', () => { settings.cols = colsAuto.checked ? 0 : +colsEl.value; changed(); });
rowsAuto.addEventListener('change', () => { settings.rows = rowsAuto.checked ? 0 : +rowsEl.value; changed(); });
ovEvery.addEventListener('input', () => { settings.overlayEvery = +ovEvery.value; changed(); });
ovOff.addEventListener('change', () => { settings.overlayEvery = ovOff.checked ? 0 : +ovEvery.value; changed(); });
fillEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.fill = b.dataset.v; changed(); });

/* ───── actions ───── */
let toastTimer = 0;
function say(text, undo) {
  toast.replaceChildren(el('span', '', text));
  if (undo) { const b = el('button', '', 'Undo'); b.type = 'button'; b.onclick = () => { toast.classList.remove('show'); undo(); }; toast.append(b); }
  toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 7000);
}
async function removeOne(p, node) {
  node.classList.add('leaving');
  const res = await api('/api/admin/people/' + p.id, { method: 'DELETE' });
  if (!res.ok) { node.classList.remove('leaving'); return say('Couldn’t remove that person.'); }
  setTimeout(refresh, 350);
  say(`${p.name} removed from the wall`, () => restoreOne(p, true));
}
async function restoreOne(p, quiet) {
  const res = await api('/api/admin/restore/' + p.id, { method: 'POST' });
  if (!res.ok) return say('Couldn’t restore that person.');
  refresh(); if (!quiet) say(`${p.name} is back on the wall`);
}
async function purge(p) {
  const res = await api('/api/admin/removed/' + p.id, { method: 'DELETE' });
  if (!res.ok) return say('Couldn’t delete that person.');
  blobs.delete(p.id); refresh(); say(`${p.name} deleted permanently`);
}

$('#csv').addEventListener('click', () => {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Name', 'Email', 'Mobile', 'Joined'], ...people.map(p => [p.name, p.email, p.mobile, p.joinedAt])];
  const url = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }));
  const a = el('a'); a.href = url; a.download = 'mosaic-registrations.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
});

/* ───── live updates when someone registers ───── */
function connect() {
  if (!window.EventSource || connect.es) return;
  connect.es = new EventSource('/api/events');
  connect.es.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === 'join' || m.type === 'remove') refresh(); else if (m.type === 'settings') { settings = m.settings; paintSettings(); } } catch (err) {} };
}
setInterval(() => { if (!app.hidden) render(); }, 60000);   // keep the “x min ago” labels fresh

if (token) { gate.hidden = true; api('/api/admin/people').then(r => r.ok ? showApp() : signOut()).catch(() => signOut()); } else pinEl.focus();
})();
