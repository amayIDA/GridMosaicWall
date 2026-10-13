(() => {
'use strict';
const $ = s => document.querySelector(s);
const cam = $('#cam'), video = $('#video'), shot = $('#shot'), countEl = $('#count'), flash = $('#flash');
const camMsg = $('#camMsg'), startCam = $('#startCam'), pickFile = $('#pickFile'), fileIn = $('#file'), flipCam = $('#flipCam');
const shutter = $('#shutter'), retake = $('#retake'), submitBtn = $('#submit'), errorEl = $('#error'), netEl = $('#net'), title = $('#title');
const done = $('#done'), doneTitle = $('#doneTitle'), again = $('#again');

const OUT_W = 720, OUT_H = 900;                       // 4:5 portrait, same shape the wall uses
let stream = null, photo = null, busy = false, autoReset = 0;
let facing = 'environment';                           // back camera first; the flip button switches
try { facing = localStorage.getItem('mosaic-facing') || facing; } catch (e) {}
const wait = ms => new Promise(r => setTimeout(r, ms));
const state = s => { cam.dataset.state = s; };
const showError = msg => { errorEl.textContent = msg || ''; };

/* ───────── camera ───────── */

function camNote(text, allowRetry = true) {
  camMsg.innerHTML = '';
  if (text) { const p = document.createElement('p'); p.className = 'note'; p.textContent = text; camMsg.appendChild(p); }
  if (allowRetry) camMsg.appendChild(startCam);
  camMsg.appendChild(pickFile);
}
function ui() {
  const taken = cam.dataset.state === 'taken';
  submitBtn.hidden = !taken; retake.hidden = !taken;
  submitBtn.disabled = busy;
  title.textContent = taken ? 'Looking good.' : 'Join the wall.';
}

async function openCamera() {
  photo = null; state('idle'); ui(); showError('');
  closeCamera();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    state('denied'); return camNote(window.isSecureContext ? 'This browser can’t open a camera.' : 'The camera needs a secure page (https or localhost). You can still choose a photo.', false);
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    const s = stream.getVideoTracks()[0], fm = s && s.getSettings && s.getSettings().facingMode;
    cam.classList.toggle('mirror', fm ? fm === 'user' : facing === 'user');      // only a selfie camera is shown mirrored
    video.srcObject = stream; await video.play().catch(() => {});
    state('live'); flipCam.hidden = false;
  } catch (e) {
    state('denied');
    camNote(e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser, or choose a photo.' : 'No camera found. You can choose a photo instead.');
  }
}
function closeCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } video.srcObject = null; }

function cropTo(src, sw, sh) {                        // centre-crop to 4:5, draw into the output canvas
  shot.width = OUT_W; shot.height = OUT_H;
  const g = shot.getContext('2d');
  const k = Math.max(OUT_W / sw, OUT_H / sh), w = sw * k, h = sh * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, (OUT_W - w) / 2, (OUT_H - h) * .4, w, h);
}
function finishCapture() { photo = shot.toDataURL('image/jpeg', .9); state('taken'); closeCamera(); ui(); }

async function takePhoto() {
  if (cam.dataset.state !== 'live') return;
  state('count');
  for (const n of [3, 2, 1]) {
    countEl.textContent = n; countEl.classList.remove('tick'); void countEl.offsetWidth; countEl.classList.add('tick');
    await wait(900);
  }
  countEl.textContent = '';
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  cropTo(video, video.videoWidth, video.videoHeight);  // the saved photo is never mirrored
  finishCapture();
}

async function useFile(f) {
  if (!f || !/^image\//.test(f.type)) return;
  try {
    let bmp;
    try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(f); }); }
    cropTo(bmp, bmp.width || bmp.naturalWidth, bmp.height || bmp.naturalHeight);
    finishCapture();
  } catch (e) { showError('That image could not be opened. Try another one.'); }
}

startCam.addEventListener('click', openCamera);
pickFile.addEventListener('click', () => fileIn.click());
fileIn.addEventListener('change', () => { useFile(fileIn.files[0]); fileIn.value = ''; });
shutter.addEventListener('click', takePhoto);
retake.addEventListener('click', openCamera);
flipCam.addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; try { localStorage.setItem('mosaic-facing', facing); } catch (e) {} openCamera(); });

/* ───────── submit ───────── */

submitBtn.addEventListener('click', async () => {
  if (busy || !photo) return;
  busy = true; submitBtn.classList.add('busy'); ui(); showError('');
  try {
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: photo }) });
    const data = await res.json().catch(() => null);
    if (!data || (!res.ok && !data.error)) { setServerOk(false); showError('This page isn’t talking to the Mosaic server. Open it from the address that “node server.js” prints.'); return; }
    if (!res.ok) { showError(data.error); return; }
    done.hidden = false; again.focus({ preventScroll: true });
    autoReset = setTimeout(reset, 6000);
  } catch (err) {
    setServerOk(false); showError('Can’t reach the wall computer right now. Check the Wi‑Fi and try again.');
  } finally { busy = false; submitBtn.classList.remove('busy'); ui(); }
});

function reset() { clearTimeout(autoReset); done.hidden = true; openCamera(); }
again.addEventListener('click', reset);

/* ───────── server link & screen wake ───────── */

function setServerOk(okay) { netEl.hidden = okay; }
async function ping() {
  try { const r = await fetch('/api/ping', { cache: 'no-store' }); const d = await r.json(); setServerOk(!!(d && d.ok)); }
  catch (e) { setServerOk(false); }
}
setInterval(ping, 5000); ping();

let wake = null;
async function keepAwake() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
addEventListener('pointerdown', keepAwake, { once: true }); keepAwake();

camNote('', true);
ui();
openCamera();                                         // straight into the camera — nothing else to fill in
})();
