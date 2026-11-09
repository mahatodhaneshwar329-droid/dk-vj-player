const { app, BrowserWindow, screen, powerSaveBlocker, session, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const cfg = require('./config');
const cache = require('./cache');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

if (!app.requestSingleInstanceLock()) app.quit();

const EXPIRY_MS = new Date(cfg.EXPIRY).getTime();
let win = null, waitWin = null, expWin = null, psb = null, expired = false;
let lastHash = null, retryTimer = null, relayoutTimer = null;

// ---------- Expiry (system clock peeche karne se bhi bachav) ----------
function checkExpired() {
  const f = path.join(app.getPath('userData'), 'state.json');
  let st = {};
  try { st = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  const now = Math.max(Date.now(), st.lastSeen || 0);
  if (now > (st.lastSeen || 0)) {
    st.lastSeen = now;
    try { fs.writeFileSync(f, JSON.stringify(st)); } catch {}
  }
  expired = now >= EXPIRY_MS;
  return expired;
}

// ---------- Display ----------
function pickDisplay() {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const ext = all.filter((d) => d.id !== primary.id)
    .sort((a, b) => b.size.width * b.size.height - a.size.width * a.size.height);
  if (ext.length) return ext[0];
  return cfg.EXTENDED_ONLY ? null : primary;
}

function placeWindow() {
  if (!win || win.isDestroyed()) return;
  const d = pickDisplay();
  if (process.platform === 'darwin') {
    win.setSimpleFullScreen(false);
    win.setBounds(d.bounds);
    win.setSimpleFullScreen(true);
  } else {
    win.setFullScreen(false);
    win.setBounds(d.bounds);
    win.setFullScreen(true);
  }
  if (cfg.ALWAYS_ON_TOP) win.setAlwaysOnTop(true, 'screen-saver');
}

// Mirror/Duplicate mode me OS ek hi screen dikhata hai -> apne aap Extend kar do
let extBusy = false;
function ensureExtended() {
  return new Promise((res) => {
    if (extBusy) return res();
    extBusy = true;
    const done = () => setTimeout(() => { extBusy = false; res(); }, 2500);
    if (process.platform === 'win32') {
      execFile('DisplaySwitch.exe', ['/extend'], { windowsHide: true }, done);
    } else if (process.platform === 'darwin') {
      const h = path.join(process.resourcesPath, 'unmirror');
      if (fs.existsSync(h)) execFile(h, [], done); else done();
    } else done();
  });
}

function scheduleRelayout() {
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(syncDisplays, 700);
}

// Extended screen mile -> output turant wahi pe fullscreen. Nikal jaye -> "waiting" screen.
function syncDisplays() {
  if (expired) return;
  const d = pickDisplay();
  if (d) {
    if (!win || win.isDestroyed()) createMain();
    else placeWindow();
    if (waitWin && !waitWin.isDestroyed()) { waitWin.destroy(); waitWin = null; }
  } else {
    showWait();
    if (win && !win.isDestroyed()) { win.destroy(); win = null; }
  }
}

function showWait() {
  if (waitWin && !waitWin.isDestroyed()) return;
  waitWin = new BrowserWindow({
    width: 560, height: 320, resizable: false, title: 'DK Edits VJ Player', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  waitWin.loadFile(path.join(__dirname, 'waiting.html'));
}

// ---------- Main output window ----------
function loadSite() {
  if (!win || win.isDestroyed()) return;
  win.loadURL(cfg.START_URL);
}

function createMain() {
  win = new BrowserWindow({
    show: false, frame: false, backgroundColor: '#000000', autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', contextIsolation: true, sandbox: true }
  });
  win.once('ready-to-show', () => { placeWindow(); win.show(); });

  win.webContents.on('did-finish-load', async () => {
    const url = win.webContents.getURL();
    if (!url.startsWith('http')) return;
    let css = 'html,body{margin:0!important;overflow:hidden!important;background:#000}';
    if (cfg.STRETCH) css += 'video,canvas{width:100vw!important;height:100vh!important;object-fit:fill!important}';
    if (cfg.HIDE_CURSOR) css += '*{cursor:none!important}';
    win.webContents.insertCSS(css).catch(() => {});
    if (lastHash === null) lastHash = await fetchHash();
  });

  // Net/cache dono na ho (pehli baar) -> retry screen, 5 sec me dobara
  win.webContents.on('did-fail-load', (_e, code, _d, _u, isMain) => {
    if (!isMain || code === -3 || retryTimer) return;
    win.loadFile(path.join(__dirname, 'offline.html'));
    retryTimer = setTimeout(() => { retryTimer = null; loadSite(); }, 5000);
  });

  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const mod = i.control || i.meta;
    const k = (i.key || '').toLowerCase();
    if (mod && k === 'q') { app.quit(); e.preventDefault(); }
    if ((mod && k === 'r') || k === 'f5') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  loadSite();
}

async function fetchHash() {
  try {
    const r = await session.defaultSession.fetch(cfg.START_URL, { cache: 'no-store' });
    if (!r.ok) return null;
    return crypto.createHash('sha1').update(Buffer.from(await r.arrayBuffer())).digest('hex');
  } catch { return null; }
}

// Website pe naya update aaya to apne aap reload (offline me kuch nahi hota)
async function updateTick() {
  if (expired || !win || win.isDestroyed() || !win.webContents.getURL().startsWith('http')) return;
  const h = await fetchHash();
  if (h && lastHash && h !== lastHash) {
    lastHash = h;
    win.webContents.reloadIgnoringCache();
  } else if (h && !lastHash) lastHash = h;
}

// ---------- Expired screen ----------
function showExpired() {
  expired = true;
  if (psb !== null && powerSaveBlocker.isStarted(psb)) powerSaveBlocker.stop(psb);
  if (win && !win.isDestroyed()) { win.destroy(); win = null; }
  if (waitWin && !waitWin.isDestroyed()) { waitWin.destroy(); waitWin = null; }
  cache.clear();
  if (expWin && !expWin.isDestroyed()) return;
  expWin = new BrowserWindow({
    width: 560, height: 420, resizable: false, title: 'DK Edits VJ Player', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  expWin.loadFile(path.join(__dirname, 'expired.html'));
  expWin.on('closed', () => app.quit());
}

ipcMain.handle('uninstall', async () => {
  cache.clear();
  if (process.platform === 'win32') {
    const un = path.join(path.dirname(process.execPath), 'Uninstall DK Edits VJ Player.exe');
    if (fs.existsSync(un)) {
      spawn(un, [], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    } else {
      shell.openExternal('ms-settings:appsfeatures');
    }
  } else if (process.platform === 'darwin') {
    const appPath = path.resolve(process.execPath, '../../..');
    try { await shell.trashItem(appPath); app.quit(); }
    catch { shell.showItemInFolder(appPath); }
  } else app.quit();
});

// ---------- Start ----------
app.whenReady().then(() => {
  if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }]));
  else Menu.setApplicationMenu(null);

  if (checkExpired()) return showExpired();

  cache.init(session.defaultSession, () => expired);
  psb = powerSaveBlocker.start('prevent-display-sleep'); // laptop sleep / screen off nahi hoga
  syncDisplays();
  if (!pickDisplay()) ensureExtended().then(syncDisplays);
  setInterval(() => { if (!expired && !pickDisplay()) ensureExtended().then(syncDisplays); }, 10 * 1000);

  screen.on('display-added', scheduleRelayout);
  screen.on('display-removed', scheduleRelayout);
  screen.on('display-metrics-changed', scheduleRelayout);

  setInterval(() => { if (!expired && checkExpired()) showExpired(); }, 30 * 1000);
  setInterval(updateTick, cfg.UPDATE_CHECK_MS);
});

app.on('second-instance', () => { if (win && !win.isDestroyed()) win.focus(); });
app.on('window-all-closed', () => app.quit());
