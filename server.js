// Farm Ni Haji — LAN systems monitor
// Checks every system from this machine (real HTTP status + response time)
// and serves the farm page to any browser on the LAN.
// No packages needed. Requires Node.js 18 or newer.  Run:  node server.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, 'config.json');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PUBLIC = path.join(ROOT, 'public');
const HISTORY_POINTS = 60;
const MAX_INCIDENTS = 500;

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- config (re-read automatically when config.json changes) ----------
let config = null, configMtime = 0;
function loadConfig() {
  try {
    const st = fs.statSync(CONFIG_FILE);
    if (config && st.mtimeMs === configMtime) return;
    const next = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    next.port = next.port || 8080;
    next.checkEverySeconds = Math.max(5, next.checkEverySeconds || 15);
    next.slowMs = next.slowMs || 1500;
    next.timeoutMs = next.timeoutMs || 8000;
    next.failuresBeforeDown = Math.max(1, next.failuresBeforeDown || 2);
    next.systems = next.systems || [];
    config = next; configMtime = st.mtimeMs;
    console.log(`[config] loaded ${config.systems.length} systems`);
  } catch (e) {
    console.error(`[config] could not read config.json: ${e.message}`);
    if (!config) process.exit(1);
  }
}
loadConfig();

// ---------- state ----------
let saved = {};
try { saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
const stats = saved.stats || {};          // id -> { checks, ok, history: [{t, ms, ok}] }
let incidents = saved.incidents || [];    // newest first
const live = {};                          // id -> { status, latency, code, error, lastCheck, fails, since }

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify({ stats, incidents }), err => {
      if (!err) fs.rename(tmp, STATE_FILE, () => {});
    });
  }, 500);
}

// ---------- one check ----------
function probe(sys) {
  return new Promise(resolve => {
    let url;
    try { url = new URL(sys.url); } catch (e) { return resolve({ ok: false, error: 'Bad URL in config' }); }
    const lib = url.protocol === 'https:' ? https : http;
    const t0 = process.hrtime.bigint();
    let done = false;
    const finish = r => { if (!done) { done = true; resolve(r); } };
    const req = lib.request(url, {
      method: 'GET',
      timeout: config.timeoutMs,
      rejectUnauthorized: !sys.insecure,
      headers: { 'User-Agent': 'FarmNiHaji-Monitor/1.0', 'Cache-Control': 'no-cache', 'Accept': 'text/html,*/*' },
    }, res => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const code = res.statusCode;
      res.destroy();
      // 2xx, 3xx and 4xx mean the app answered (401/403 = login wall, still alive). 5xx = app is broken.
      if (code >= 500) finish({ ok: false, code, ms, error: `HTTP ${code} server error` });
      else finish({ ok: true, code, ms });
    });
    req.on('timeout', () => { req.destroy(); finish({ ok: false, error: `No answer in ${config.timeoutMs / 1000}s` }); });
    req.on('error', e => finish({ ok: false, error: friendlyError(e) }));
    req.end();
  });
}

function friendlyError(e) {
  const map = {
    ECONNREFUSED: 'Connection refused (app not running?)',
    EHOSTUNREACH: 'Host unreachable',
    ENETUNREACH: 'Network unreachable',
    ETIMEDOUT: 'Connection timed out',
    ECONNRESET: 'Connection reset',
    ENOTFOUND: 'Name not found (DNS)',
    EAI_AGAIN: 'DNS lookup failed',
    CERT_HAS_EXPIRED: 'SSL certificate expired',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'Self-signed certificate (set "insecure": true)',
    SELF_SIGNED_CERT_IN_CHAIN: 'Self-signed certificate (set "insecure": true)',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Certificate not trusted (set "insecure": true)',
  };
  return map[e.code] || e.message || String(e);
}

async function check(sys) {
  const L = live[sys.id] || (live[sys.id] = { status: 'wait', fails: 0, since: Date.now() });
  if (sys.maint) return setStatus(sys, L, 'maint');
  if (!sys.url) return setStatus(sys, L, 'nourl');

  const r = await probe(sys);
  const S = stats[sys.id] || (stats[sys.id] = { checks: 0, ok: 0, history: [] });
  S.checks++; if (r.ok) S.ok++;
  S.history.push({ t: Date.now(), ms: r.ms != null ? Math.round(r.ms) : null, ok: r.ok });
  if (S.history.length > HISTORY_POINTS) S.history.splice(0, S.history.length - HISTORY_POINTS);

  L.lastCheck = Date.now(); L.code = r.code ?? null; L.latency = r.ms != null ? Math.round(r.ms) : null;
  if (r.ok) {
    L.fails = 0; L.error = null;
    setStatus(sys, L, r.ms > config.slowMs ? 'slow' : 'up');
  } else {
    L.fails++; L.error = r.error;
    if (L.fails >= config.failuresBeforeDown) setStatus(sys, L, 'down');
  }
}

function setStatus(sys, L, status) {
  const prev = L.status;
  if (prev === status) return;
  L.status = status; L.since = Date.now();
  if (prev === 'wait' && status !== 'down') return;   // first result after start is not an incident
  incidents.unshift({ t: Date.now(), id: sys.id, name: sys.short || sys.name, from: prev, to: status, ms: L.latency, code: L.code, error: L.error || null });
  if (incidents.length > MAX_INCIDENTS) incidents.length = MAX_INCIDENTS;
  console.log(`[${new Date().toLocaleString()}] ${sys.short || sys.name}: ${prev} -> ${status}${L.error ? ' (' + L.error + ')' : ''}`);
  saveState();
}

let running = false;
async function cycle() {
  if (running) return;
  running = true;
  loadConfig();
  try { await Promise.all(config.systems.map(check)); } catch (e) { console.error(e); }
  saveState();
  running = false;
  setTimeout(cycle, config.checkEverySeconds * 1000);
}

// ---------- web ----------
function statusPayload() {
  return {
    now: Date.now(),
    server: config.server || {},
    checkEverySeconds: config.checkEverySeconds,
    slowMs: config.slowMs,
    systems: config.systems.map(s => {
      const L = live[s.id] || { status: s.maint ? 'maint' : s.url ? 'wait' : 'nourl' };
      const S = stats[s.id] || { checks: 0, ok: 0, history: [] };
      return {
        id: s.id, name: s.name, short: s.short || s.name, desc: s.desc || '', species: s.species || 'sheep', url: s.url || '',
        status: L.status, latency: L.latency ?? null, code: L.code ?? null, error: L.error || null,
        lastCheck: L.lastCheck || null, since: L.since || null,
        checks: S.checks, ok: S.ok, history: S.history.slice(-40),
      };
    }),
    incidents: incidents.slice(0, 150),
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(statusPayload()));
  }
  if (u.pathname === '/api/incidents' && req.method === 'DELETE') {
    incidents = []; saveState();
    res.writeHead(204); return res.end();
  }
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=86400' });
    res.end(buf);
  });
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${config.port} is already in use. Change "port" in config.json.`);
  else console.error(e);
  process.exit(1);
});

server.listen(config.port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  Farm Ni Haji monitor is running.');
  console.log(`  On this PC:      http://localhost:${config.port}`);
  ips.forEach(ip => console.log(`  From the LAN:    http://${ip}:${config.port}`));
  console.log('\n  Keep this window open. Press Ctrl+C to stop.\n');
  cycle();
});
