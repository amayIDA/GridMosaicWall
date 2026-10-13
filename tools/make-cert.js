// Creates a private certificate authority + a server certificate for this PC, so an iPad on the same
// network can open the kiosk over https (Safari only allows the camera on secure pages).
//
//   node tools/make-cert.js
//
// Pure Node — no OpenSSL needed. Safe to run on every start: the CA is created once and reused (so each
// iPad only has to trust it once); the server certificate is re-issued each time so it always matches
// this PC's current IP address.
//
//   certs/ca.pem      → install + trust on the iPad (served by the server at /ca.crt)
//   certs/ca.key      → private, keep on the PC
//   certs/server.pem, certs/server.key → used by server.js automatically

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'certs');
fs.mkdirSync(OUT, { recursive: true });

/* ───── minimal DER encoder ───── */
const len = n => n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
const tlv = (tag, ...parts) => { const c = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(c.length), c]); };
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const int = buf => { let b = Buffer.from(buf); while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1); if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return tlv(0x02, b); };
const oid = s => {
  const p = s.split('.').map(Number), bytes = [p[0] * 40 + p[1]];
  for (const n of p.slice(2)) { const t = [n & 127]; let v = n >> 7; while (v) { t.unshift((v & 127) | 128); v >>= 7; } bytes.push(...t); }
  return tlv(0x06, Buffer.from(bytes));
};
const utf8 = s => tlv(0x0c, Buffer.from(s, 'utf8'));
const bool = v => tlv(0x01, Buffer.from([v ? 0xff : 0]));
const octets = b => tlv(0x04, b);
const bits = (b, unused = 0) => tlv(0x03, Buffer.from([unused]), b);
const utc = d => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const ctx = (n, ...p) => tlv(0xa0 + n, ...p);

const SHA256_RSA = seq(oid('1.2.840.113549.1.1.11'), tlv(0x05, Buffer.alloc(0)));
const name = cn => seq(set(seq(oid('2.5.4.3'), utf8(cn))));
const ext = (id, critical, value) => seq(oid(id), ...(critical ? [bool(true)] : []), octets(value));
const sha1 = b => crypto.createHash('sha1').update(b).digest();
const pem = (label, der) => `-----BEGIN ${label}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;

function certificate({ subjectCN, issuerCN, spki, issuerSpki, signKey, days, extensions }) {
  const now = Date.now(), from = new Date(now - 864e5), to = new Date(now + days * 864e5);
  const tbs = seq(
    ctx(0, int(Buffer.from([2]))), int(crypto.randomBytes(16)), SHA256_RSA,
    name(issuerCN), seq(utc(from), utc(to)), name(subjectCN), spki,
    ctx(3, seq(...extensions(sha1(spki), sha1(issuerSpki))))
  );
  const sig = crypto.sign('sha256', tbs, signKey);
  return seq(tbs, SHA256_RSA, bits(Buffer.concat([Buffer.from([0]), sig]).subarray(1), 0));
}

/* ───── certificate authority (created once, reused) ───── */
const CA_CN = 'Mosaic Local CA', caPemPath = path.join(OUT, 'ca.pem'), caKeyPath = path.join(OUT, 'ca.key');
let caKeyPem, caSpki, reusedCA = false;
if (fs.existsSync(caPemPath) && fs.existsSync(caKeyPath)) {
  caKeyPem = fs.readFileSync(caKeyPath, 'utf8');
  caSpki = crypto.createPublicKey(caKeyPem).export({ type: 'spki', format: 'der' });
  reusedCA = true;
} else {
  const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  caKeyPem = kp.privateKey; caSpki = kp.publicKey;
  const caDer = certificate({
    subjectCN: CA_CN, issuerCN: CA_CN, spki: caSpki, issuerSpki: caSpki, signKey: caKeyPem, days: 3650,
    extensions: ski => [
      ext('2.5.29.19', true, seq(bool(true))),                                   // basicConstraints: CA
      ext('2.5.29.15', true, bits(Buffer.from([0x06]), 1)),                      // keyUsage: keyCertSign, cRLSign
      ext('2.5.29.14', false, octets(ski))                                       // subjectKeyIdentifier
    ]
  });
  fs.writeFileSync(caKeyPath, caKeyPem, { mode: 0o600 });
  fs.writeFileSync(caPemPath, pem('CERTIFICATE', caDer));
}

/* ───── server certificate (re-issued every run, matches today's IPs) ───── */
const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
const dns = ['localhost', os.hostname(), os.hostname() + '.local'];
const ipList = ['127.0.0.1', ...ips];
const san = seq(
  ...dns.map(d => tlv(0x82, Buffer.from(d, 'ascii'))),
  ...ipList.map(ip => tlv(0x87, Buffer.from(ip.split('.').map(Number))))
);
const sk = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const serverDer = certificate({
  subjectCN: 'Mosaic Wall', issuerCN: CA_CN, spki: sk.publicKey, issuerSpki: caSpki, signKey: caKeyPem, days: 800,
  extensions: (ski, aki) => [
    ext('2.5.29.19', true, seq()),                                               // basicConstraints: not a CA
    ext('2.5.29.15', true, bits(Buffer.from([0xa0]), 5)),                        // keyUsage: digitalSignature, keyEncipherment
    ext('2.5.29.37', false, seq(oid('1.3.6.1.5.5.7.3.1'))),                      // extKeyUsage: serverAuth
    ext('2.5.29.17', false, san),                                                // subjectAltName
    ext('2.5.29.14', false, octets(ski)),
    ext('2.5.29.35', false, seq(tlv(0x80, aki)))                                 // authorityKeyIdentifier
  ]
});
fs.writeFileSync(path.join(OUT, 'server.key'), sk.privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(OUT, 'server.pem'), pem('CERTIFICATE', serverDer));

console.log(reusedCA ? 'Certificate refreshed for this network (existing CA kept).' : 'Created a new certificate authority and server certificate.');
console.log('Valid for: ' + [...dns, ...ipList].join(', '));
