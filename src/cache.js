// Offline cache: page + video. Network-first (hamesha latest), net na ho to cache.
// Video: cache-first, pura download hone ke baad offline chalta hai. Sab kuch encrypted disk pe.
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const cfg = require('./config');
const { ctrAt, parseRange } = require('./cryptoutil');

const KEY = crypto.scryptSync(cfg.CACHE_SECRET, 'dk-vj-salt', 32);
const SKIP = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive']);
const MEDIA_EXT = /\.(mp4|webm|mov|m4v|m4s|ts|mkv|mp3|aac|m4a|wav|ogg)$/i;
const MEDIA_HOST = /(b-cdn\.net|bunnycdn|mediadelivery\.net)/i;

let dir;
const inflight = new Set();
const downloading = new Set();
let isExpiredFn = () => false;

const id = (u) => crypto.createHash('sha256').update(u).digest('hex');
const paths = (u) => {
  const k = id(u);
  return { meta: path.join(dir, k + '.json'), bin: path.join(dir, k + '.bin'), tmp: path.join(dir, k + '.tmp') };
};

function readMeta(u) {
  const p = paths(u);
  try {
    const m = JSON.parse(fs.readFileSync(p.meta, 'utf8'));
    if (fs.statSync(p.bin).size === m.size) return m;
  } catch {}
  return null;
}

function isMedia(url, range) {
  if (range) return true;
  try {
    const u = new URL(url);
    return MEDIA_EXT.test(u.pathname) || MEDIA_HOST.test(u.hostname);
  } catch { return false; }
}

function fwdHeaders(h) {
  const x = new Headers(h);
  ['range', 'if-none-match', 'if-modified-since'].forEach((k) => x.delete(k));
  return x;
}

async function store(url, resp) {
  const key = id(url);
  if (inflight.has(key)) return;
  inflight.add(key);
  const p = paths(url);
  try {
    const iv = crypto.randomBytes(16);
    const c = crypto.createCipheriv('aes-256-ctr', KEY, iv);
    await pipeline(Readable.fromWeb(resp.body), c, fs.createWriteStream(p.tmp));
    const size = fs.statSync(p.tmp).size;
    const headers = [];
    resp.headers.forEach((v, k) => { if (!SKIP.has(k.toLowerCase())) headers.push([k, v]); });
    fs.renameSync(p.tmp, p.bin);
    fs.writeFileSync(p.meta, JSON.stringify({ url, status: 200, headers, size, iv: iv.toString('hex'), ts: Date.now() }));
  } catch {
    try { fs.unlinkSync(p.tmp); } catch {}
  } finally {
    inflight.delete(key);
  }
}

async function bgDownload(request) {
  const url = request.url;
  const key = id(url);
  if (downloading.has(key) || inflight.has(key)) return;
  downloading.add(key);
  try {
    const r = await net.fetch(url, { headers: fwdHeaders(request.headers), bypassCustomProtocolHandlers: true });
    if (r.status === 200 && r.body) await store(url, r);
  } catch {} finally { downloading.delete(key); }
}

function serve(meta, rangeHeader) {
  const p = paths(meta.url);
  const size = meta.size;
  const headers = new Headers(meta.headers);
  headers.set('accept-ranges', 'bytes');
  let s = 0, e = size - 1, status = 200;
  if (rangeHeader) {
    const r = parseRange(rangeHeader, size);
    if (r === 'bad') return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    if (r) { s = r.s; e = r.e; status = 206; headers.set('content-range', `bytes ${s}-${e}/${size}`); }
  }
  headers.set('content-length', String(Math.max(0, e - s + 1)));
  if (size === 0) return new Response(null, { status, headers });
  const rs = fs.createReadStream(p.bin, { start: s, end: e });
  const d = ctrAt(KEY, Buffer.from(meta.iv, 'hex'), s);
  rs.on('error', (err) => d.destroy(err));
  rs.pipe(d);
  return new Response(Readable.toWeb(d), { status, headers });
}

async function handle(request) {
  if (isExpiredFn()) return Response.error();
  const url = request.url;
  if (request.method !== 'GET') return net.fetch(request, { bypassCustomProtocolHandlers: true });

  const range = request.headers.get('range');
  const media = isMedia(url, range);
  const meta = readMeta(url);

  if (media) {
    if (meta) return serve(meta, range);
    try {
      const r = await net.fetch(request, { bypassCustomProtocolHandlers: true });
      if (range) bgDownload(request);
      else if (r.status === 200 && r.body) store(url, r.clone());
      return r;
    } catch { return Response.error(); }
  }

  // Page / JS / CSS / API(GET): network-first
  try {
    const ctl = new AbortController();
    const t = meta ? setTimeout(() => ctl.abort(), 6000) : null;
    const r = await net.fetch(url, {
      method: 'GET',
      headers: fwdHeaders(request.headers),
      cache: 'no-cache',
      signal: ctl.signal,
      bypassCustomProtocolHandlers: true
    });
    if (t) clearTimeout(t);
    if (r.status === 200 && r.body) store(url, r.clone());
    return r;
  } catch {
    if (meta) return serve(meta, range);
    return Response.error();
  }
}

function init(ses, expiredFn) {
  dir = path.join(app.getPath('userData'), 'vjcache');
  fs.mkdirSync(dir, { recursive: true });
  isExpiredFn = expiredFn;
  ses.protocol.handle('https', handle);
}

function clear() {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

module.exports = { init, clear };
