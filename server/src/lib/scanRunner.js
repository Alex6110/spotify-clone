// Lancia lo scanner (scripts/scan.js) in un processo separato, uno alla volta.
// Se arrivano altri caricamenti mentre sta girando, ne parte un'altra scansione subito dopo.
const path = require('path');
const { spawn } = require('child_process');

const state = { running: false, pending: false, startedAt: null, finishedAt: null, ok: null, summary: null, error: null };
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'scan.js');

function run() {
  state.running = true;
  state.pending = false;
  state.startedAt = Date.now();
  state.ok = null; state.summary = null; state.error = null;
  const child = spawn(process.execPath, [SCRIPT], { cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
  child.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
  const done = (ok, message) => {
    state.running = false;
    state.finishedAt = Date.now();
    state.ok = ok;
    const line = out.split('\n').reverse().find((l) => l.includes('Fatto.'));
    try { state.summary = line ? JSON.parse(line.slice(line.indexOf('{'))) : null; } catch { state.summary = null; }
    state.error = ok ? null : (message || err.trim().split('\n').pop() || 'Scansione non riuscita');
    if (state.pending) run();
  };
  child.on('error', (e) => done(false, e.message));
  child.on('close', (code) => done(code === 0, code === 0 ? null : `La scansione è terminata con errore (codice ${code})`));
}

function requestScan() {
  if (state.running) state.pending = true;
  else run();
  return getState();
}

const getState = () => ({ ...state });

module.exports = { requestScan, getState };
