(() => {
'use strict';

const CFG = Object.assign({ people: [] }, window.MOSAIC || {});
const PH = Object.assign({ dir: 'photos/', count: 0, ext: 'jpg', start: 1 }, CFG.photos || {});
const $ = s => document.querySelector(s);
const stage = $('#stage'), wall = $('#wall'), portrait = $('#portrait');

const HOLD = /[?&]hold(=|&|$)/.test(location.search);            // dev aid: ?hold jumps to the portrait state and stays there
const reduce = HOLD || matchMedia('(prefers-reduced-motion: reduce)').matches;
if (HOLD) document.documentElement.classList.add('fast');
const wait = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(r));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const T = ms => reduce ? 1 : ms;

/* ─────────────────────────── people ─────────────────────────── */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const FIRST = ['Aiko','Mateo','Amara','Liam','Priya','Noor','Jonas','Sofia','Kofi','Hana','Luca','Zara','Ravi','Elena','Tariq','Mei','Oscar','Ines','Kwame','Yuki','Dmitri','Leila','Diego','Anika','Omar','Freya','Kenji','Camila','Idris','Saoirse','Arjun','Mila','Tomas','Nia','Felix','Rania','Hugo','Thandi','Soren','Isla'];
const LAST  = ['Tanaka','Okafor','Lindqvist','Moreau','Haddad','Reyes','Kapoor','Novak','Silva','Chen','Abara','Fischer','Rossi','Nakamura','Mensah','Petrov','Alvarez','Khan','Larsen','Dubois','Ito','Bianchi','Osei','Santos','Kowalski','Rahman','Eriksen','Vargas','Zhou','Murphy'];
const ROLES = ['Architect','Photographer','Cellist','Marine biologist','Chef','Typographer','Pilot','Industrial designer','Poet','Astronomer','Ceramicist','Cartographer','Film editor','Botanist','Luthier','Urbanist','Sound designer','Surgeon','Illustrator','Glassblower'];
const CITIES = ['Kyoto','Lagos','Lisbon','Mumbai','Oslo','São Paulo','Nairobi','Seoul','Istanbul','Mexico City','Cape Town','Reykjavík','Tbilisi','Hanoi','Lima','Montréal','Cairo','Perth','Marseille','Jakarta'];

/* wall settings, set from the admin page: columns × rows (0 = fit the screen) and what fills the tiles */
let S = { cols: 0, rows: 0, fill: 'photos' };
const registered = [];
const persons = [];
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

function makePerson(k) {
  const seed = k * 7919 + 13, c = CFG.people[k];
  const r = mulberry32(seed ^ 0x9e3779b9), pick = a => a[Math.floor(r() * a.length)];
  const auto = PH.count > 0 ? `${PH.dir}${PH.start + (k * 61 + 7) % PH.count}.${PH.ext}` : null;
  const p = c ? { name: c.name, role: c.role || '', tile: c.photo || auto, seed }
              : { name: `${pick(FIRST)} ${pick(LAST)}`, role: `${pick(ROLES)} · ${pick(CITIES)}`, tile: auto, seed };
  p.mirror = r() < .5; p.zoom = 1 + r() * .22; p.ox = 40 + r() * 20; p.oy = 30 + r() * 25;
  return p;
}
/* what a tile shows when nobody has registered for it: an echo of the registered photos, an illustrated face, or an empty frame */
function fillPerson(k) {
  if (S.fill === 'faces') return makePerson(k);
  if (S.fill === 'photos' && registered.length) {
    const r = registered[hashStr('echo' + k) % registered.length], rr = mulberry32(hashStr(r.id + ':' + k));
    return { name: r.name, role: '', tile: r.photo, seed: hashStr(r.id), echo: true, echoOf: r.id, mirror: rr() < .5, zoom: 1 + rr() * .3, ox: 35 + rr() * 30, oy: 25 + rr() * 30 };
  }
  return { plain: true, name: '', role: '', tile: null, seed: k, mirror: false, zoom: 1, ox: 50, oy: 50 };
}
function ensurePersons(n) { while (persons.length < n) persons.push(fillPerson(persons.length)); }

/* people who registered through the kiosk — they take the wall from the centre outwards */
let appliedRegistered = false;
const joinedPerson = r => ({ name: r.name, role: '', tile: r.photo, seed: hashStr(r.id), mirror: false, zoom: 1, ox: 50, oy: 36, id: r.id, joined: true });

/* ───────────────── procedural studio portraits ───────────────── */

const SKIN = ['#f7dcc4','#f1c9a5','#e6b88f','#d49c72','#b97c52','#8f5a38','#6a3f26','#4a2c1b'];
const HAIR = ['#16100d','#2a1a12','#4a2e1b','#6e4425','#9a6a35','#c9a46a','#e2cfa3','#9b9b9b','#d8d6d0','#7b2a18','#22252b'];
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };

function drawPortrait(seed, S) {
  const r = mulberry32(seed), rnd = (a, b) => a + (b - a) * r(), pick = a => a[Math.floor(r() * a.length)];
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), u = S / 100;
  const skin = pick(SKIN), hairC = pick(HAIR), fem = r() < .5;
  let style = Math.floor(r() * 7);                       // 0 short · 1 long · 2 bun · 3 curly · 4 bald · 5 scarf · 6 side-part
  if (style === 5 && !fem) style = 0;
  const glasses = r() < .2, beard = !fem && r() < .32 && style !== 5;
  const sh = mix(skin, '#000000', .22), hi = mix(skin, '#ffffff', .2);
  const E = (x, y, a, b, f) => { g.beginPath(); g.ellipse(x, y, a, b, 0, 0, Math.PI * 2); g.fillStyle = f; g.fill(); };

  // backdrop
  const bgH = Math.floor(rnd(0, 360)), bgS = rnd(10, 30);
  const bg = g.createLinearGradient(0, 0, S * .5, S);
  bg.addColorStop(0, `hsl(${bgH} ${bgS}% ${rnd(60, 76)}%)`); bg.addColorStop(1, `hsl(${bgH} ${bgS + 8}% ${rnd(28, 42)}%)`);
  g.fillStyle = bg; g.fillRect(0, 0, S, S);

  const cx = (50 + rnd(-1.5, 1.5)) * u, hy = rnd(38, 43) * u;
  const rx = (fem ? rnd(14.5, 17) : rnd(16.5, 19.5)) * u, ry = rx * rnd(1.22, 1.36);
  const scarfC = `hsl(${Math.floor(rnd(0, 360))} ${rnd(25, 55)}% ${rnd(30, 62)}%)`;

  // hair behind the head
  if (style === 1) {
    g.fillStyle = hairC; g.beginPath(); g.ellipse(cx, hy - ry * .05, rx * 1.22, ry * 1.06, 0, Math.PI, 0);
    g.lineTo(cx + rx * 1.32, hy + ry * 1.95); g.lineTo(cx - rx * 1.32, hy + ry * 1.95); g.fill();
  }
  if (style === 3) {
    for (let i = 0; i < 17; i++) {
      const a = Math.PI + i / 16 * Math.PI;
      E(cx + Math.cos(a) * rx * 1.02, hy - ry * .12 + Math.sin(a) * ry * 1.02, rx * .44, rx * .44, hairC);
    }
    E(cx, hy - ry * .55, rx * 1.1, ry * .62, hairC);
  }
  if (style === 5) E(cx, hy + ry * .1, rx * 1.4, ry * 1.38, scarfC);

  // shoulders
  g.fillStyle = `hsl(${Math.floor(rnd(0, 360))} ${rnd(12, 50)}% ${rnd(18, 58)}%)`;
  g.beginPath(); g.ellipse(cx, S * 1.03, S * .46, S * .3, 0, 0, Math.PI * 2); g.fill();
  if (style === 5) E(cx, hy + ry * 1.62, rx * 1.75, ry * .62, scarfC);
  else {
    const nw = rx * .8;
    E(cx, 73.5 * u, nw * .72, 5 * u, sh);                                  // neckline
    const ng = g.createLinearGradient(0, hy + ry * .5, 0, 76 * u);
    ng.addColorStop(0, sh); ng.addColorStop(1, mix(skin, '#000000', .34));
    g.fillStyle = ng; g.fillRect(cx - nw / 2, hy + ry * .5, nw, 75 * u - (hy + ry * .5));
  }
  E(cx, hy + ry * .9, rx * .62, ry * .2, 'rgba(0,0,0,.22)');              // chin shadow

  // head
  E(cx - rx * .98, hy + ry * .1, rx * .14, ry * .2, sh); E(cx + rx * .98, hy + ry * .1, rx * .14, ry * .2, sh);
  const hg = g.createRadialGradient(cx - rx * .35, hy - ry * .35, 0, cx - rx * .2, hy - ry * .1, Math.max(rx, ry) * 1.55);
  hg.addColorStop(0, hi); hg.addColorStop(.5, skin); hg.addColorStop(1, sh);
  E(cx, hy, rx, ry, hg);

  // hair in front
  const cap = (side, v = 1) => {
    g.fillStyle = hairC; g.beginPath();
    g.ellipse(cx, hy - ry * .08, rx * 1.08, ry * 1.06 * v, 0, Math.PI, 0);
    g.quadraticCurveTo(cx + rx * side * .6, hy - ry * .6, cx - rx * 1.08, hy - ry * .08); g.fill();
  };
  if (style === 0) cap(rnd(-.5, .5));
  if (style === 1) { cap(0); E(cx - rx * 1.07, hy + ry * .4, rx * .2, ry * .78, hairC); E(cx + rx * 1.07, hy + ry * .4, rx * .2, ry * .78, hairC); }
  if (style === 2) { E(cx, hy - ry * 1.12, rx * .44, rx * .44, hairC); cap(.2); }
  if (style === 3) cap(.1, .92);
  if (style === 6) { cap(.9); E(cx + rx * .15, hy - ry * 1.02, rx * .95, ry * .17, hairC); }

  // face
  const ey = hy - ry * .02, ex = rx * .42, er = rx * .12;
  g.lineCap = 'round';
  g.strokeStyle = style === 4 || style === 5 ? mix(hairC, '#000000', .1) : mix(hairC, '#000000', .2); g.lineWidth = u * (fem ? 1.1 : 1.8);
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + s * (ex + er * 1.7), ey - ry * .16);
    g.quadraticCurveTo(cx + s * ex, ey - ry * .27, cx + s * (ex - er * 1.7), ey - ry * .15); g.stroke();
  }
  for (const s of [-1, 1]) {
    E(cx + s * ex, ey, er * 1.05, er * .68, '#241812');
    E(cx + s * ex + er * .3, ey - er * .22, er * .28, er * .28, 'rgba(255,255,255,.85)');
    if (fem) { g.strokeStyle = '#1b120e'; g.lineWidth = u * .8; g.beginPath(); g.ellipse(cx + s * ex, ey, er * 1.1, er * .75, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
  }
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = u * 1.1;                                 // nose
  g.beginPath(); g.moveTo(cx - rx * .02, ey + ry * .08); g.quadraticCurveTo(cx - rx * .13, hy + ry * .27, cx - rx * .08, hy + ry * .33); g.stroke();
  E(cx - rx * .1, hy + ry * .33, rx * .06, ry * .03, 'rgba(0,0,0,.25)'); E(cx + rx * .1, hy + ry * .33, rx * .06, ry * .03, 'rgba(0,0,0,.25)');
  E(cx + rx * .03, hy + ry * .12, rx * .06, ry * .14, 'rgba(255,255,255,.14)');
  E(cx - rx * .56, hy + ry * .36, rx * .2, ry * .13, 'rgba(220,90,80,.12)'); E(cx + rx * .56, hy + ry * .36, rx * .2, ry * .13, 'rgba(220,90,80,.12)');

  if (beard) {
    g.save(); g.beginPath(); g.ellipse(cx, hy, rx, ry, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = hairC; g.globalAlpha = .92; g.beginPath();
    g.moveTo(cx - rx * 1.1, hy + ry * .05); g.quadraticCurveTo(cx - rx * .7, hy + ry * .5, cx - rx * .35, hy + ry * .46);
    g.quadraticCurveTo(cx, hy + ry * .38, cx + rx * .35, hy + ry * .46); g.quadraticCurveTo(cx + rx * .7, hy + ry * .5, cx + rx * 1.1, hy + ry * .05);
    g.lineTo(cx + rx * 1.1, hy + ry * 1.3); g.lineTo(cx - rx * 1.1, hy + ry * 1.3); g.fill(); g.restore();
  }
  const my = hy + ry * .6, mw = rx * rnd(.34, .5), depth = ry * rnd(.07, .15);                // smile
  g.fillStyle = fem ? mix(skin, '#c2434f', .55) : mix(skin, '#6e3a30', beard ? .7 : .45);
  g.beginPath(); g.moveTo(cx - mw, my); g.quadraticCurveTo(cx, my + depth * 2.3, cx + mw, my); g.quadraticCurveTo(cx, my + depth * .1, cx - mw, my); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = u * .6; g.beginPath(); g.moveTo(cx - mw, my); g.quadraticCurveTo(cx, my + depth * .55, cx + mw, my); g.stroke();

  if (glasses) {
    g.strokeStyle = '#17171a'; g.lineWidth = u * .95;
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * ex, ey, rx * .28, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - ex + rx * .28, ey); g.lineTo(cx + ex - rx * .28, ey); g.stroke();
  }
  if (style === 5) {                                   // scarf frames the face
    g.fillStyle = scarfC; g.beginPath();
    g.ellipse(cx, hy + ry * .1, rx * 1.4, ry * 1.38, 0, 0, Math.PI * 2);
    g.ellipse(cx, hy + ry * .04, rx * .93, ry * .98, 0, 0, Math.PI * 2); g.fill('evenodd');
  }

  // studio light
  const L = g.createRadialGradient(S * .28, S * .2, 0, S * .28, S * .2, S * .95);
  L.addColorStop(0, 'rgba(255,255,255,.24)'); L.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = L; g.fillRect(0, 0, S, S);
  const V = g.createLinearGradient(0, S * .55, 0, S);
  V.addColorStop(0, 'rgba(0,0,0,0)'); V.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = V; g.fillRect(0, 0, S, S);
  return cv;
}

function grayURL(cv) {
  const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const y = p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114;
    p[i] = p[i + 1] = p[i + 2] = clamp((y - 128) * 1.1 + 132, 0, 255);
  }
  g.putImageData(d, 0, 0);
  return cv.toDataURL('image/jpeg', .84);
}

/* ─────────────────────────── the wall ─────────────────────────── */

const DRIFT = 15;                       // px / second, leftwards
const FLIP_MS = 1250;
let cols = 0, rows = 0, cw = 0, ch = 0, pitchX = 0, pitchY = 0, gap = 3;
let cells = [], cellByK = [], rowEls = [], track = null;
const revealed = new Set(), grays = new Map(), srcCache = new Map();
let queue = Promise.resolve();
let offset = 0, speed = 0, brake = true, idleOn = false, revealing = false, lastTrack = '';

function grayFor(k) {
  let u = grays.get(k);
  if (!u) { u = grayURL(drawPortrait(persons[k].seed, 96)); grays.set(k, u); }
  return u;
}
function styleImg(img, p) {
  img.style.transform = `${p.mirror ? 'scaleX(-1) ' : ''}scale(${p.zoom.toFixed(3)})`;
  img.style.objectPosition = `${p.ox.toFixed(0)}% ${p.oy.toFixed(0)}%`;
}
function setFront(c) {
  const p = persons[c.k], img = c.front;
  c.el.classList.toggle('plain', !!p.plain);
  img.className = ''; img.onerror = null;
  if (p.plain) { img.removeAttribute('src'); return; }
  if (p.tile) {
    img.classList.add('photo');                                                          // tiles are always black & white — a submitted photo is in colour only in the big portrait of its reveal
    img.onerror = () => { img.onerror = null; img.classList.remove('photo'); p.tile = null; img.src = grayFor(c.k); };
    img.src = p.tile;
  } else img.src = grayFor(c.k);
  styleImg(img, p);
}
function prepColor(c) {
  const img = c.back, p = persons[c.k];
  if (p.plain) return img;
  if (!img.getAttribute('src')) {
    img.onerror = () => { img.onerror = null; p.tile = null; img.src = drawPortrait(p.seed, 192).toDataURL('image/jpeg', .9); };
    img.src = p.tile || drawPortrait(p.seed, 192).toDataURL('image/jpeg', .9);
    styleImg(img, p);
  }
  return img;
}
const decoded = img => img.getAttribute('src') ? Promise.race([img.decode().catch(() => {}), wait(1800)]) : Promise.resolve();
const prepAndDecode = c => decoded(prepColor(c));
function refreshCell(c) {                          // re-point a tile at whoever persons[c.k] is now
  c.front.removeAttribute('src'); setFront(c);
  c.back.removeAttribute('src'); if (c.el.classList.contains('on') || revealed.has(c.k)) prepColor(c);
}

/* ───── layout: columns × rows come from the admin page (0 = fit the screen) ───── */
function layout() {
  const vw = innerWidth, vh = innerHeight;
  gap = vw < 700 ? 2 : 3;
  if (S.cols > 0) cols = S.cols;
  else { const target = clamp(vw / 40, 30, 52); cols = Math.max(8, Math.round((vw + gap) / (target + gap))); }
  cw = (vw - gap * (cols - 1)) / cols;
  rows = S.rows > 0 ? S.rows : Math.max(4, Math.round((vh + gap) / (cw + gap)));
  ch = (vh - gap * (rows - 1)) / rows;
  pitchX = cw + gap; pitchY = ch + gap;
}

function build() {
  wall.textContent = '';
  layout();
  const root = document.documentElement.style;
  root.setProperty('--w', cw.toFixed(2) + 'px'); root.setProperty('--h', ch.toFixed(2) + 'px');
  root.setProperty('--gap', gap + 'px'); root.setProperty('--r', (Math.min(cw, ch) * .06).toFixed(1) + 'px');

  const per = cols, n = rows * per, mx = (cols - 1) / 2, my = (rows - 1) / 2;
  ensurePersons(n);
  if (!appliedRegistered) { appliedRegistered = true; registered.forEach((r, i) => { if (i < persons.length) { persons[i] = joinedPerson(r); revealed.add(i); } }); }
  track = document.createElement('div'); track.className = 'track';
  rowEls = []; cells = [];
  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div'); row.className = 'row';
    for (let i = 0; i < per; i++) {
      const el = document.createElement('div'); el.className = 'tile';
      el.innerHTML = '<div class="card"><div class="face front"><img alt="" draggable="false"></div><div class="face back"><img alt="" draggable="false"></div></div>';
      const dx = i - mx, dy = r - my;
      const c = { el, card: el.firstChild, backFace: el.querySelector('.back'), front: el.querySelector('.front img'), back: el.querySelector('.back img'),
                  d: Math.hypot(dx, dy), key: Math.hypot(dx, dy) + Math.atan2(dy, dx) * 1e-4, x: 0, y: 0 };
      el.__c = c; cells.push(c); row.appendChild(el);
    }
    rowEls.push(row); track.appendChild(row);
  }
  cellByK = [...cells].sort((a, b) => a.key - b.key);
  cellByK.forEach((c, k) => { c.k = k; c.el.dataset.k = k; setFront(c); });
  wall.appendChild(track);
  for (const k of [...revealed]) if (k >= n) revealed.delete(k);
  offset = 0; speed = 0; lastTrack = '';
}

function positions() {                  // viewport position of every tile
  rowEls.forEach((row, r) => {
    for (let i = 0; i < row.children.length; i++) {
      const c = row.children[i].__c; c.x = i * pitchX - offset; c.y = r * pitchY;
    }
  });
}

async function boot() {
  build();
  wall.style.visibility = 'hidden';
  await Promise.race([Promise.all(cells.slice(0, 400).map(c => c.front.getAttribute('src') ? c.front.decode().catch(() => {}) : 0)), wait(2500)]);
  wall.style.visibility = '';
  if (HOLD) { brake = false; return; }
  intro();
}

function intro() {
  idleOn = false; brake = true;
  const maxd = Math.hypot(cols / 2, rows / 2);
  wall.classList.add('intro');
  let last = 0;
  for (const c of cells) {
    const delay = T((c.d / maxd) * 1500 + Math.random() * 200);
    last = Math.max(last, delay);
    c.el.style.setProperty('--d', delay + 'ms');
    c.el.style.transformOrigin = '0% 50%';
    const a = c.el.animate([
      { opacity: 0, transform: 'perspective(900px) rotateY(-98deg) translateX(-8px)' },
      { opacity: 1, transform: 'perspective(900px) rotateY(0deg) translateX(0)' }
    ], { duration: T(1050), delay, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'backwards' });
    a.onfinish = () => { c.el.style.transformOrigin = ''; };
  }
  setTimeout(() => wall.classList.remove('intro'), last + T(1150));
  setTimeout(() => { brake = false; idleOn = true; idleTick(); if (!ovStarted) { ovStarted = true; overlayLoop(true); } }, T(2900));
}

/* ───── flipping: 3D is only switched on for tiles that are actually turning ───── */
function flipMany(list, on, delayOf) {
  const todo = list.filter(c => c.el.classList.contains('on') !== on);
  if (!todo.length) return 0;
  for (const c of todo) { c.el.classList.add('flipping'); c.card.style.transitionDelay = (delayOf ? Math.round(delayOf(c)) : 0) + 'ms'; }
  void wall.offsetWidth;                                // one style flush for the whole batch
  let longest = 0;
  for (const c of todo) {
    const d = parseInt(c.card.style.transitionDelay) || 0; longest = Math.max(longest, d);
    c.el.classList.toggle('on', on);
    clearTimeout(c.ft);
    c.ft = setTimeout(() => { c.el.classList.remove('flipping'); c.card.style.transitionDelay = ''; }, d + FLIP_MS + 200);
  }
  return longest + FLIP_MS;
}

/* ───── idle life: the wall drifts left, faces flip to colour ───── */
function peek() {
  positions();
  const vw = innerWidth, vh = innerHeight;
  for (let tries = 0; tries < 20; tries++) {
    const c = cells[(Math.random() * cells.length) | 0], cl = c.el.classList;
    if (persons[c.k].plain || cl.contains('on') || cl.contains('flipping')) continue;
    if (c.x < 0 || c.y < 0 || c.x + cw > vw || c.y + ch > vh) continue;
    decoded(prepColor(c)).then(() => {
      if (!idleOn || cl.contains('on')) return;
      flipMany([c], true); c.peeking = true;
      setTimeout(() => { if (c.peeking) flipMany([c], false); c.peeking = false; }, 2600 + Math.random() * 2600);
    });
    return;
  }
}
function idleTick() {
  if (!idleOn) return;
  if (!document.hidden && !reduce) { const n = 1 + (Math.random() < .35) + (Math.random() < .15); for (let i = 0; i < n; i++) setTimeout(peek, i * 260); }
  setTimeout(idleTick, 900 + Math.random() * 1300);
}
function clearPeeks() {
  const list = cells.filter(c => c.peeking);
  list.forEach(c => { c.peeking = false; });
  flipMany(list, false);
}

/* ───── the reveal: the wall becomes a collage of the portrait ───── */

async function loadPortrait(k) {
  const p = persons[k];
  if (p.tile) {
    try {
      const im = new Image(); im.src = p.tile; await im.decode();
      const t = document.createElement('canvas'); t.width = t.height = 2;
      const g = t.getContext('2d'); g.drawImage(im, 0, 0, 2, 2); g.getImageData(0, 0, 1, 1);   // throws if tainted
      return im;
    } catch (e) { /* fall through to the generated portrait */ }
  }
  return drawPortrait(p.seed, 720);
}
function drawCover(g, img, W, H, p) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s;
  g.save(); if (p.mirror) { g.translate(W, 0); g.scale(-1, 1); }
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(img, (W - w) / 2, (H - h) * .35, w, h); g.restore();
}

/* the tile's own photo, so each tile can be re-coloured to the part of the portrait it stands in */
function tileSource(k) {
  const p = persons[k]; if (p.plain) return Promise.resolve(null);
  const key = p.tile ? 'u:' + p.tile : 'k:' + k;
  if (!srcCache.has(key)) srcCache.set(key, p.tile
    ? new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(drawPortrait(p.seed, 96)); im.src = p.tile; })
    : Promise.resolve(drawPortrait(p.seed, 96)));
  return srcCache.get(key);
}
function tintedTile(src, W, H, p, [tr, tg, tb]) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!src) { g.fillStyle = `rgb(${tr},${tg},${tb})`; g.fillRect(0, 0, W, H); return cv; }
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
  const s = Math.max(W / iw, H / ih) * p.zoom, w = iw * s, h = ih * s;
  g.save(); if (p.mirror) { g.translate(W, 0); g.scale(-1, 1); }
  g.drawImage(src, (W - w) * p.ox / 100, (H - h) * p.oy / 100, w, h); g.restore();
  const d = g.getImageData(0, 0, W, H), a = d.data, n = a.length / 4;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < a.length; i += 4) { const y = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114; R += y; G += y; B += y; }
  const m = (R / n) || 1;                                                            // the tile's brightness…
  const gr = clamp(tr / m, .45, 2.4), gg = clamp(tg / m, .45, 2.4), gb = clamp(tb / m, .45, 2.4), k = .18;   // …re-coloured to the portrait's colour there
  for (let i = 0; i < a.length; i += 4) {
    const y = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114;                       // the (black & white) tile photo supplies the detail
    a[i] = Math.min(255, y * gr) * (1 - k) + tr * k;
    a[i + 1] = Math.min(255, y * gg) * (1 - k) + tg * k;
    a[i + 2] = Math.min(255, y * gb) * (1 - k) + tb * k;
  }
  g.putImageData(d, 0, 0);
  return cv;
}

/* ───── "something is happening": before a new portrait is revealed, a gradient drifts over the wall's photos, then fades away ───── */
const fxEl = $('#fx');
async function playFx() {                              // resolves once it has faded away again
  if (reduce) return;
  fxEl.classList.add('run'); void fxEl.offsetWidth; fxEl.classList.add('show');          // fade in (CSS)…
  await wait(1000 + 2800);                                                              // …drift for a moment…
  fxEl.classList.remove('show');                                                        // …and fade away
  await wait(1200);
  fxEl.classList.remove('run');
}

async function reveal(k, fresh = false) {
  const c = cellByK[k]; if (!c) return;
  const p = persons[k];
  revealing = true; idleOn = false; brake = true; hideOverlay(); clearPeeks();
  const fx = fresh ? playFx() : Promise.resolve();                                    // a brand-new submission gets the gradient effect first
  const [img] = await Promise.all([loadPortrait(k), prepAndDecode(c), wait(T(700))]);
  positions();

  const vw = innerWidth, vh = innerHeight;
  const rh = Math.min(vh * .68, vw * .9 * 1.25), rw = rh * .8;
  const rx0 = (vw - rw) / 2, ry0 = Math.max(30, (vh - rh - 110) / 2);

  // sample the portrait: one average colour per tile
  const S3 = 3, sw = Math.ceil(rw / S3), sh = Math.ceil(rh / S3);
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  const sg = sc.getContext('2d', { willReadFrequently: true }); drawCover(sg, img, sw, sh, p);
  const data = sg.getImageData(0, 0, sw, sh).data;
  const inCells = [], cx0 = rx0 + rw / 2, cy0 = ry0 + rh / 2, maxd = Math.hypot(rw / 2, rh / 2);
  for (const o of cells) {
    const mx = o.x + cw / 2, my = o.y + ch / 2;
    if (mx < rx0 || mx > rx0 + rw || my < ry0 || my > ry0 + rh) continue;
    const x0 = clamp(Math.floor((o.x - rx0) / S3), 0, sw - 1), y0 = clamp(Math.floor((o.y - ry0) / S3), 0, sh - 1);
    const x1 = clamp(Math.ceil((o.x + cw - rx0) / S3), x0 + 1, sw), y1 = clamp(Math.ceil((o.y + ch - ry0) / S3), y0 + 1, sh);
    let R = 0, G = 0, B = 0, N = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * sw + x) * 4; R += data[i]; G += data[i + 1]; B += data[i + 2]; N++; }
    o.target = [Math.round(R / N), Math.round(G / N), Math.round(B / N)];
    o.dist = Math.hypot(mx - cx0, my - cy0) / maxd;
    inCells.push(o);
  }

  // re-colour every tile off-screen first (in small batches so the page never stalls), so the flip itself is only a cheap transform
  const dpr = Math.min(devicePixelRatio || 1, 2), tw = Math.max(16, Math.round(cw * dpr)), th = Math.max(16, Math.round(ch * dpr));
  for (let i = 0; i < inCells.length; i += 10) {
    const part = inCells.slice(i, i + 10);
    const srcs = await Promise.all(part.map(o => tileSource(o.k)));
    part.forEach((o, j) => {
      o.cv = tintedTile(srcs[j], tw, th, persons[o.k], o.target);
      o.backFace.appendChild(o.cv); o.el.classList.add('cz');
    });
    await frame();
  }

  // 1 · one wave of flips from the centre of the portrait outwards; the rest of the wall dims through a single flat layer
  const sOut = $('#scrimOut'), sIn = $('#scrimIn');
  sOut.style.clipPath = `polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${rx0}px ${ry0}px,${rx0 + rw}px ${ry0}px,${rx0 + rw}px ${ry0 + rh}px,${rx0}px ${ry0 + rh}px,${rx0}px ${ry0}px)`;
  sIn.style.cssText = `left:${rx0}px;top:${ry0}px;width:${rw}px;height:${rh}px`;
  await frame();
  await fx;                                                                            // the gradient has to be gone before the portrait appears
  sOut.classList.add('show');
  flipMany([...inCells, c], true, o => (o.dist || 0) * 1300);
  await wait(T(2500));

  // 2 · the grid recedes, the portrait itself emerges
  portrait.width = Math.round(rw * dpr); portrait.height = Math.round(rh * dpr);
  portrait.style.cssText = `left:${rx0}px;top:${ry0}px;width:${rw}px;height:${rh}px`;
  const pg = portrait.getContext('2d'), W = portrait.width, H = portrait.height;
  pg.clearRect(0, 0, W, H); drawCover(pg, img, W, H, p);
  pg.globalCompositeOperation = 'destination-in';                                   // feather the edges once, here, instead of masking every frame
  for (const [x1, y1] of [[W, 0], [0, H]]) {
    const f = pg.createLinearGradient(0, 0, x1, y1);
    f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(.12, '#000'); f.addColorStop(.88, '#000'); f.addColorStop(1, 'rgba(0,0,0,0)');
    pg.fillStyle = f; pg.fillRect(0, 0, W, H);
  }
  pg.globalCompositeOperation = 'source-over';
  await frame();
  portrait.classList.add('show'); sIn.classList.add('show');
  revealed.add(k);

  await wait(T(1300));
  if (HOLD) return;
  await wait(T(4200));

  // 3 · the portrait dissolves, the grid returns, the tiles flip back to black & white (except theirs)
  portrait.classList.remove('show'); sIn.classList.remove('show'); sOut.classList.remove('show');
  flipMany([...inCells, c], false, o => (1 - (o.dist === undefined ? 0 : o.dist)) * 800);
  await wait(T(2300));
  for (const o of inCells) { if (o.el.classList.contains('on')) flipMany([o], false); }
  await wait(T(60));
  for (const o of inCells) { if (o.cv) o.cv.remove(); o.cv = null; o.el.classList.remove('cz'); }
  brake = false; revealing = false; idleOn = true; idleTick();
}

/* ───── idle: the logo appears as a window of colour onto the black & white wall ─────
   wall/overlay.png is never drawn itself — only its shape is used, as a mask over colour versions of the photos behind it. */
const OV = Object.assign({ src: ['overlays/2-proud-of-you-2026.png'], every: 22, hold: 3, first: 6, dim: .42, glow: .14 }, CFG.overlay || {});
const colorLayer = $('#colorLayer');
let ovTimer = 0, ovBusy = false, ovStarted = false, ovIndex = 0;

async function overlaySources() {                     // every image in wall/overlays/, falling back to the list in people.js
  const d = await fetchJSON('/api/overlays');
  return d && d.files && d.files.length ? d.files : [].concat(OV.src);
}
async function loadOverlay() {                         // the next logo in turn
  const list = await overlaySources(), src = list[ovIndex++ % list.length];
  return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now(); });
}
function hasAlpha(img) {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 48, 48);
  const d = g.getImageData(0, 0, 48, 48).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}
function makeMask(img, W, H) {                         // the logo, fitted and centred, as an alpha mask
  const m = document.createElement('canvas'); m.width = W; m.height = H;
  const g = m.getContext('2d', { willReadFrequently: true });
  const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.min(W * .84 / iw, H * .84 / ih), w = iw * s, h = ih * s;
  g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  if (!hasAlpha(img)) {                                // an opaque image: treat its light background as empty
    const id = g.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d[i + 3] = Math.min(255, Math.max(0, 255 - Math.min(d[i], d[i + 1], d[i + 2])) * 1.4);
    g.putImageData(id, 0, 0);
  }
  return m;
}
async function renderColorLayer(img) {                 // colour photos inside the logo, a dimming veil everywhere else
  const vw = innerWidth, vh = innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
  const W = Math.round(vw * dpr), H = Math.round(vh * dpr);
  colorLayer.width = W; colorLayer.height = H;
  const g = colorLayer.getContext('2d');
  const tiles = document.createElement('canvas'); tiles.width = W; tiles.height = H;
  const tg = tiles.getContext('2d');
  positions();
  const vis = cells.filter(c => !persons[c.k].plain && c.x > -cw && c.y > -ch && c.x < vw && c.y < vh);
  const srcs = [];
  for (let i = 0; i < vis.length; i += 40) { srcs.push(...await Promise.all(vis.slice(i, i + 40).map(c => tileSource(c.k)))); await frame(); }
  tg.save(); tg.scale(dpr, dpr);
  vis.forEach((c, i) => {
    const src = srcs[i], p = persons[c.k]; if (!src) return;
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    const s = Math.max(cw / iw, ch / ih) * p.zoom, w = iw * s, h = ih * s;
    tg.save(); tg.beginPath(); tg.rect(c.x, c.y, cw, ch); tg.clip();
    tg.translate(c.x, c.y); if (p.mirror) { tg.translate(cw, 0); tg.scale(-1, 1); }
    tg.drawImage(src, (cw - w) * p.ox / 100, (ch - h) * p.oy / 100, w, h); tg.restore();
  });
  tg.restore();
  const mask = makeMask(img, W, H);
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, 0, 0);          // colour photos, only inside the logo
  g.fillStyle = 'rgba(2,2,4,' + OV.dim + ')'; g.fillRect(0, 0, W, H);                // darken everything…
  g.globalCompositeOperation = 'destination-out'; g.drawImage(mask, 0, 0);          // …except inside the logo
  g.globalCompositeOperation = 'source-over'; g.drawImage(tiles, 0, 0);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = OV.glow; g.drawImage(tiles, 0, 0);   // and a touch brighter in there
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
const hideOverlay = () => colorLayer.classList.remove('show');
async function pulse() {
  if (ovBusy || !idleOn || revealing || document.hidden || !cells.length) return;
  ovBusy = true;
  try {
    const img = await loadOverlay(); if (!img) return;
    await renderColorLayer(img);
    if (!idleOn || revealing) return;
    colorLayer.classList.add('show'); await wait(T(1700 + OV.hold * 1000));        // colour fades in through the logo, holds…
    colorLayer.classList.remove('show'); await wait(T(1800));                       // …and fades away again
  } finally { ovBusy = false; }
}
let ovGen = 0;
function overlayLoop(first) {
  clearTimeout(ovTimer); const gen = ++ovGen;
  const every = S.overlayEvery !== undefined ? S.overlayEvery : OV.every;           // seconds between logos; set on the admin page, 0 = off
  if (every === 0) return;
  ovTimer = setTimeout(async () => { await pulse(); if (gen === ovGen) overlayLoop(); }, (first ? OV.first : every) * 1000);
}

/* ───── background faces that echo the registered people ───── */
function refreshEchoes() {
  if (S.fill !== 'photos') return;
  for (const c of cells) { if (persons[c.k].joined) continue; persons[c.k] = fillPerson(c.k); refreshCell(c); }
}

/* ───── live changes from the kiosk and the admin page ───── */

async function fetchJSON(url) {
  try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}

function onJoin(r, quiet = false) {
  if (registered.some(x => x.id === r.id)) return;
  registered.push(r);
  if (!appliedRegistered) return;                      // wall still booting: it picks this person up itself
  queue = queue.then(() => welcome(r, quiet)).catch(console.error);
}

function onRemove(id) {                                // taken off the wall from the admin page
  const i = registered.findIndex(x => x.id === id); if (i >= 0) registered.splice(i, 1);
  queue = queue.then(async () => {
    while (revealing) await wait(300);
    for (let k = 0; k < persons.length; k++) {
      const p = persons[k]; if (!((p.joined || p.echo) && (p.id === id || p.echoOf === id))) continue;
      persons[k] = fillPerson(k); revealed.delete(k);
      const c = cellByK[k]; if (!c) continue;
      c.peeking = false;
      flipMany([c], false);                            // flip back to black & white, then swap the face underneath
      setTimeout(() => refreshCell(c), 1500);
    }
  }).catch(console.error);
}

function applySettings(next) {
  const same = ['cols', 'rows', 'fill'].every(f => S[f] === next[f]);
  const everyChanged = next.overlayEvery !== undefined && next.overlayEvery !== S.overlayEvery;
  S = { ...S, ...next };
  if (everyChanged && ovStarted) overlayLoop(true);                                // a new interval takes effect straight away
  if (same) return;
  queue = queue.then(async () => {                     // new grid or background: rebuild with a fresh page-flip
    while (revealing) await wait(300);
    clearPeeks(); persons.length = 0; appliedRegistered = false; revealed.clear();
    build(); intro();
  }).catch(console.error);
}

async function welcome(r, quiet = false) {
  while (!cells.length || revealing) await wait(300);
  const slot = registered.length - 1, person = joinedPerson(r);
  positions();
  const vw = innerWidth, vh = innerHeight;
  const spots = cells.filter(c => { const cl = c.el.classList; return !persons[c.k].joined && !cl.contains('on') && !cl.contains('flipping') &&
    c.x > vw * .08 && c.x + cw < vw * .92 && c.y > 40 && c.y + ch < vh - 40; });
  const t = spots.length ? spots[(Math.random() * spots.length) | 0] : cellByK[slot % cellByK.length];
  let kS = Math.min(slot, persons.length - 1);        // the tile this person gets after a reload
  while (kS < persons.length - 1 && persons[kS].joined) kS++;
  if (kS !== t.k && !persons[kS].joined) { persons[kS] = persons[t.k]; refreshCell(cellByK[kS]); }
  persons[t.k] = person; t.peeking = false; refreshCell(t);
  await decoded(t.front);
  if (quiet) { revealed.add(t.k); }
  else await reveal(t.k, true);
  refreshEchoes();
}

function connect() {
  if (!window.EventSource) return;
  const es = new EventSource('/api/events'); let opened = false;
  es.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      if (m.type === 'join') onJoin(m.person, !!m.quiet);
      else if (m.type === 'remove') onRemove(m.id);
      else if (m.type === 'settings') applySettings(m.settings);
    } catch (err) {}
  };
  es.onopen = async () => {                            // after a dropped connection, catch up on anything we missed
    if (opened) {
      const [list, set] = await Promise.all([fetchJSON('/api/people'), fetchJSON('/api/settings')]);
      if (list) { registered.filter(x => !list.people.some(y => y.id === x.id)).forEach(x => onRemove(x.id)); list.people.forEach(r => onJoin(r)); }
      if (set) applySettings(set);
    }
    opened = true;
  };
}

wall.addEventListener('click', e => {
  const t = e.target.closest('.tile'); if (!t || revealing) return;
  const k = +t.dataset.k;
  if (revealed.has(k) && persons[k].joined) queue = queue.then(() => reveal(k));
});

let rt = 0;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!revealing) { build(); } }, 250); });

(async () => {
  const [people, set] = await Promise.all([fetchJSON('/api/people'), fetchJSON('/api/settings')]);
  if (set) S = { ...S, ...set };
  if (people) registered.push(...people.people);
  await boot(); connect();
})().then(() => { const m = location.search.match(/[?&]hold=(\d+)/); if (m) setTimeout(() => window.__mosaic.reveal(+m[1]), 400); });
window.__mosaic = { reveal: k => (queue = queue.then(() => reveal(k))), persons, join: onJoin, settings: () => S, pulse, setOverlay: i => { ovIndex = i; } };
})();
