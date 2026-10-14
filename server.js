// Mosaic server — no dependencies. Run:  node server.js   (PORT / HTTPS_PORT / MOSAIC_DATA env vars optional)
//
//   /                 the mosaic wall            (wall/)
//   /register/        the registration kiosk     (register/)
//   /admin/           manage the wall            (admin/)   — asks for the admin PIN
//   /uploads/<id>.jpg captured portraits         (data/photos/)
//   POST /api/register   {name,email,mobile,consent,image(dataURL)} → saves + tells the wall
//   GET  /api/people     public list for the wall (id, name, photo, joinedAt) — never email/mobile
//   GET  /api/events     Server-Sent Events: the wall listens here (join / remove)
//
// Everything is stored under data/ (override with MOSAIC_DATA=/some/folder):
//   registrations.json (+ .bak)  people currently on the wall      photos/  their portraits
//   removed.json + removed/      people taken off the wall (restorable from the admin page)
//   config.json                  the admin PIN
// Contact details never leave the server except to the PIN-protected admin page.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const os = require('node:os');

const PORT = +process.env.PORT || 3000;
const HTTPS_PORT = +process.env.HTTPS_PORT || 3443;
const ROOT = __dirname;
const CERTS = path.join(ROOT, 'certs');
const DIRS = { wall: path.join(ROOT, 'wall'), register: path.join(ROOT, 'register'), admin: path.join(ROOT, 'admin') };
const DATA = process.env.MOSAIC_DATA ? path.resolve(process.env.MOSAIC_DATA) : path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos'), REMOVED_DIR = path.join(DATA, 'removed');
const DB = path.join(DATA, 'registrations.json'), RDB = path.join(DATA, 'removed.json'), CONF = path.join(DATA, 'config.json');
fs.mkdirSync(PHOTOS, { recursive: true }); fs.mkdirSync(REMOVED_DIR, { recursive: true });

/* ───── storage: atomic writes + a .bak of the previous version ───── */
function load(file) {
  for (const f of [file, file + '.bak']) {
    try { const v = JSON.parse(fs.readFileSync(f, 'utf8')); if (Array.isArray(v)) { if (f !== file) console.log(`! ${path.basename(file)} was unreadable — recovered from its backup`); return v; } } catch (e) {}
  }
  return [];
}
function store(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(tmp, file);
}
let registrations = load(DB), removed = load(RDB);
const publicPerson = r => ({ id: r.id, name: r.name, photo: '/uploads/' + r.id + '.jpg', joinedAt: r.createdAt });
const adminPerson = r => ({ ...publicPerson(r), email: r.email, mobile: r.mobile, removedAt: r.removedAt });

/* ───── admin PIN ───── */
let config = {};
try { config = JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch (e) {}
if (process.env.ADMIN_PIN) config.adminPin = String(process.env.ADMIN_PIN);
const DEFAULT_SETTINGS = { cols: 0, rows: 0, fill: 'photos', overlayEvery: 22, revealHold: 2 };       // 0 = fit the screen automatically
config.settings = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };
config.seq = +config.seq || 0;
const saveConfig = () => fs.writeFileSync(CONF, JSON.stringify(config, null, 2));
if (!config.adminPin) { config.adminPin = String(crypto.randomInt(100000, 1000000)); }
saveConfig();
const tokens = new Set();
let failures = [];                                       // timestamps of recent wrong PINs → simple lockout
const safeEq = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
const isAdmin = req => tokens.has(req.headers['x-admin-token']);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

const clients = new Set();
const broadcast = obj => { const msg = `data: ${JSON.stringify(obj)}\n\n`; for (const c of clients) c.write(msg); };
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000).unref();

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(res, baseDir, rel, cache = 'no-cache') {
  let p;
  try { p = path.normalize(path.join(baseDir, decodeURIComponent(rel))); } catch (e) { return send(res, 400, { error: 'bad path' }); }
  if (p !== baseDir && !p.startsWith(baseDir + path.sep)) return send(res, 403, { error: 'forbidden' });
  fs.stat(p, (err, st) => {
    if (!err && st.isDirectory()) { p = path.join(p, 'index.html'); }
    fs.readFile(p, (e, buf) => {
      if (e) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
      res.end(buf);
    });
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const ID = /^[a-f0-9]{16}$/;

async function register(req, res) {
  let data;
  try { data = JSON.parse(await readBody(req, 6 * 1024 * 1024)); }
  catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'Photo is too large' : 'Invalid request' }); }

  const optional = clean(data.name, 80);
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(data.image || ''));
  if (!m) return send(res, 422, { error: 'Please capture your photo', field: 'image' });
  const img = Buffer.from(m[2], 'base64');
  const isJpg = img[0] === 0xff && img[1] === 0xd8, isPng = img[0] === 0x89 && img[1] === 0x50;
  if (img.length < 1000 || img.length > 4 * 1024 * 1024 || !(isJpg || isPng)) return send(res, 422, { error: 'That photo could not be read', field: 'image' });

  const id = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(PHOTOS, id + '.jpg'), img);                // the kiosk always sends a JPEG; extension is fixed on purpose
  config.seq += 1; saveConfig();
  const name = optional.length >= 2 ? optional : 'Guest ' + String(config.seq).padStart(3, '0');
  const rec = { id, name, email: '', mobile: '', createdAt: new Date().toISOString() };
  registrations.push(rec); store(DB, registrations);
  const person = publicPerson(rec);
  broadcast({ type: 'join', person });
  console.log(`+ ${name}  (${registrations.length} on the wall)`);
  send(res, 201, { ok: true, person });
}

/* ───── admin ───── */
async function admin(req, res, p) {
  if (p === '/api/admin/login' && req.method === 'POST') {
    const now = Date.now(); failures = failures.filter(t => now - t < 60000);
    if (failures.length >= 5) return send(res, 429, { error: 'Too many attempts. Wait a minute.' });
    let pin = ''; try { pin = String(JSON.parse(await readBody(req, 2048)).pin || ''); } catch (e) {}
    if (!safeEq(pin, config.adminPin)) { failures.push(now); return send(res, 401, { error: 'Wrong PIN' }); }
    const token = crypto.randomBytes(24).toString('hex'); tokens.add(token);
    return send(res, 200, { token });
  }
  if (!isAdmin(req)) return send(res, 401, { error: 'Not signed in' });
  if (p === '/api/admin/settings' && req.method === 'POST') {
    let b = {}; try { b = JSON.parse(await readBody(req, 2048)); } catch (e) {}
    const int = (v, lo, hi) => { v = Math.round(+v); return v === 0 ? 0 : (v >= lo && v <= hi ? v : null); };
    const cols = b.cols === undefined ? config.settings.cols : int(b.cols, 3, 80);
    const rows = b.rows === undefined ? config.settings.rows : int(b.rows, 2, 60);
    const fill = b.fill === undefined ? config.settings.fill : b.fill;
    const overlayEvery = b.overlayEvery === undefined ? config.settings.overlayEvery : int(b.overlayEvery, 5, 600);
    const revealHold = b.revealHold === undefined ? config.settings.revealHold : Math.round(+b.revealHold);
    if (!(revealHold >= 1 && revealHold <= 60)) return send(res, 422, { error: 'Invalid settings' });
    if (cols === null || rows === null || overlayEvery === null || !['photos', 'faces', 'plain'].includes(fill)) return send(res, 422, { error: 'Invalid settings' });
    config.settings = { cols, rows, fill, overlayEvery, revealHold }; saveConfig();
    broadcast({ type: 'settings', settings: config.settings });
    console.log(`~ wall layout: ${cols || 'auto'} columns x ${rows || 'auto'} rows, background: ${fill}, logo every ${overlayEvery ? overlayEvery + ' s' : '(off)'}, portrait stays ${revealHold} s`);
    return send(res, 200, config.settings);
  }
  if (p === '/api/admin/settings' && req.method === 'GET') return send(res, 200, config.settings);
  if (p === '/api/admin/removeall' && req.method === 'POST') {          // take everyone off the wall at once (restorable)
    const gone = registrations.splice(0, registrations.length), at = new Date().toISOString();
    for (const rec of gone) {
      try { fs.renameSync(path.join(PHOTOS, rec.id + '.jpg'), path.join(REMOVED_DIR, rec.id + '.jpg')); } catch (e) {}
      removed.push({ ...rec, removedAt: at });
    }
    store(RDB, removed); store(DB, registrations);
    for (const rec of gone) broadcast({ type: 'remove', id: rec.id });
    console.log(`- everyone removed from the wall (${gone.length})`);
    return send(res, 200, { ok: true, removed: gone.map(r => r.id) });
  }
  const parts = p.split('/').filter(Boolean);                            // ['api','admin',action,id]
  const action = parts[2], id = parts[3];

  if (action === 'people' && req.method === 'GET' && !id) return send(res, 200, { people: registrations.map(adminPerson), removed: removed.map(adminPerson) });
  if (!ID.test(id || '')) return send(res, 400, { error: 'bad id' });

  if (action === 'people' && req.method === 'DELETE') {                 // take off the wall (restorable)
    const i = registrations.findIndex(r => r.id === id); if (i < 0) return send(res, 404, { error: 'not found' });
    const [rec] = registrations.splice(i, 1);
    try { fs.renameSync(path.join(PHOTOS, id + '.jpg'), path.join(REMOVED_DIR, id + '.jpg')); } catch (e) {}
    removed.push({ ...rec, removedAt: new Date().toISOString() });
    store(RDB, removed); store(DB, registrations);
    broadcast({ type: 'remove', id });
    console.log(`- ${rec.name} removed from the wall`);
    return send(res, 200, { ok: true });
  }
  if (action === 'restore' && req.method === 'POST') {
    const i = removed.findIndex(r => r.id === id); if (i < 0) return send(res, 404, { error: 'not found' });
    const [rec] = removed.splice(i, 1); delete rec.removedAt;
    try { fs.renameSync(path.join(REMOVED_DIR, id + '.jpg'), path.join(PHOTOS, id + '.jpg')); } catch (e) {}
    registrations.push(rec);
    store(DB, registrations); store(RDB, removed);
    broadcast({ type: 'join', person: publicPerson(rec), quiet: true });
    console.log(`+ ${rec.name} restored`);
    return send(res, 200, { ok: true });
  }
  if (action === 'removed' && req.method === 'DELETE') {                // delete for good
    const i = removed.findIndex(r => r.id === id); if (i < 0) return send(res, 404, { error: 'not found' });
    const [rec] = removed.splice(i, 1);
    try { fs.unlinkSync(path.join(REMOVED_DIR, id + '.jpg')); } catch (e) {}
    store(RDB, removed);
    console.log(`x ${rec.name} deleted permanently`);
    return send(res, 200, { ok: true });
  }
  if (action === 'photo' && req.method === 'GET') {                      // thumbnail of someone who is in the removed list
    return serveFile(res, REMOVED_DIR, id + '.jpg', 'no-store');
  }
  return send(res, 404, { error: 'not found' });
}

const handler = (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/api/ping') return send(res, 200, { ok: true, app: 'mosaic', people: registrations.length });
  if (p === '/ca.crt') {                                  // public root certificate for iPad/iPhone to trust (never the key)
    try { const buf = fs.readFileSync(path.join(CERTS, 'ca.pem')); res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="Mosaic-Local-CA.crt"' }); return res.end(buf); }
    catch (e) { return send(res, 404, 'Start with start.bat to create the certificate', 'text/plain; charset=utf-8'); }
  }
  if (p === '/api/register' && req.method === 'POST') return register(req, res).catch(() => send(res, 500, { error: 'Server error' }));
  if (p === '/api/overlays' && req.method === 'GET') {
    let files = [];
    try { files = fs.readdirSync(path.join(DIRS.wall, 'overlays')).filter(f => /\.(png|webp|jpe?g|svg)$/i.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(f => 'overlays/' + f); } catch (e) {}
    return send(res, 200, { files });
  }
  if (p === '/api/settings' && req.method === 'GET') return send(res, 200, config.settings);
  if (p === '/api/people' && req.method === 'GET') return send(res, 200, { people: registrations.map(publicPerson) });
  if (p === '/api/events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (p.startsWith('/api/admin/')) return admin(req, res, p).catch(() => send(res, 500, { error: 'Server error' }));
  if (p.startsWith('/api/')) return send(res, 404, { error: 'not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
  if (p.startsWith('/uploads/')) return serveFile(res, PHOTOS, p.slice('/uploads/'.length));
  if (p === '/register' || p === '/admin') { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  if (p.startsWith('/register/')) return serveFile(res, DIRS.register, p.slice('/register/'.length));
  if (p.startsWith('/admin/')) return serveFile(res, DIRS.admin, p.slice('/admin/'.length));
  return serveFile(res, DIRS.wall, p === '/' ? 'index.html' : p.slice(1));
};

const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);

http.createServer(handler).listen(PORT, () => {
  console.log('');
  console.log('Mosaic is running.');
  console.log('');
  console.log(`  Wall (this PC)        http://localhost:${PORT}/`);
  console.log(`  Admin (this PC)       http://localhost:${PORT}/admin/      PIN: ${config.adminPin}`);
  for (const ip of lanIPs()) console.log(`  Registration (iPad)   http://${ip}:${PORT}/register/`);
  console.log('');
  console.log(`  ${registrations.length} ${registrations.length === 1 ? 'person' : 'people'} on the wall  ·  data folder: ${DATA}`);
});

try {
  const opts = { key: fs.readFileSync(path.join(CERTS, 'server.key')), cert: fs.readFileSync(path.join(CERTS, 'server.pem')) };
  https.createServer(opts, handler).listen(HTTPS_PORT, () => {
    console.log('');
    for (const ip of lanIPs()) console.log(`  Registration (iPad, camera on)  https://${ip}:${HTTPS_PORT}/register/`);
    console.log(`  iPad certificate to trust       http://${lanIPs()[0] || 'localhost'}:${PORT}/ca.crt`);
    console.log('');
  });
} catch (e) {
  console.log('');
  console.log('  No HTTPS certificate yet. For the live camera on an iPad start with start.bat (or run: node tools/make-cert.js)');
  console.log('');
}
