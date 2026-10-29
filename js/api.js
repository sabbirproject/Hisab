/* GD Expense Tracker — Apps Script client + Shared-mode sync engine.
   POST bodies are sent as text/plain (JSON string) so the browser does NOT send a CORS pre-flight
   request (Apps Script Web Apps cannot answer OPTIONS). */
(function () {
  'use strict';
  var GD = (window.GD = window.GD || {});
  var U = GD.U, Store = GD.Store, Prefs = GD.Prefs;

  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }

  function serverUrl() { return Prefs.get('serverUrl') || (window.GD_CONFIG && window.GD_CONFIG.APPS_SCRIPT_URL) || ''; }

  // Personal mode must never contact the backend for data.
  var BLOCKED_IN_PERSONAL = /^(sync|file\.|export)/;

  function call(action, payload, ms) {
    var url = serverUrl();
    if (!url) return Promise.reject(err('config', 'Apps Script Web App URL is not configured.'));
    if (Store.mode !== 'shared' && BLOCKED_IN_PERSONAL.test(action)) return Promise.reject(err('blocked', 'Personal Mode never contacts the server.'));
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 30000);
    return fetch(url, {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})), signal: ctl ? ctl.signal : undefined
    }).then(function (r) { return r.text(); }).then(function (txt) {
      var j; try { j = JSON.parse(txt); } catch (e) { throw err('bad_response', 'Server did not return JSON. Check that the Web App is deployed with access "Anyone".'); }
      if (!j.ok) throw err(j.code || 'error', j.error || 'Request failed');
      return j.data || {};
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw err('timeout', 'The server took too long to answer.');
      if (e instanceof TypeError) throw err('network', 'No network connection to the server.');
      throw e;
    }).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }

  GD.API = { call: call, url: serverUrl, err: err };

  /* ---------------- sync engine ---------------- */
  var S = { state: 'idle', last: 0, msg: '' }, listeners = [], busy = false, again = false, timer = null, kick = null;
  function set(p) { Object.assign(S, p); listeners.forEach(function (f) { try { f(S); } catch (e) { console.error(e); } }); }
  function clean(rec) {
    var o = {}; Object.keys(rec).forEach(function (k) { if (k !== 'v' && k !== 'seq' && k !== 'dirty' && k[0] !== '_') o[k] = rec[k]; }); return o;
  }

  function uploadAttachments() {
    var list = Store.live('transactions').filter(function (t) { return t.attachment && t.attachment.pending; });
    return list.reduce(function (p, t) {
      return p.then(function () {
        return Store.blob('rcpt_' + t.id).then(function (b) {
          if (!b) { t.attachment = Object.assign({}, t.attachment, { pending: false, lost: true }); return Store.putLocal('transactions', t); }
          return call('file.upload', { key: Prefs.getKey(), kind: 'receipt', name: t.attachment.name || 'receipt.jpg', mime: t.attachment.mime || 'image/jpeg', data: b.data.split(',')[1] }).then(function (r) {
            t.attachment = { fileId: r.fileId, name: t.attachment.name, mime: t.attachment.mime };
            t.updatedAt = Date.now();
            return Store.putLocal('transactions', t).then(function () { return Store.delBlob('rcpt_' + t.id); }).then(function () { return Store.save('transactions', t); });
          }, function (e) {
            if (e.code === 'invalid') { t.attachment = Object.assign({}, t.attachment, { pending: false, error: e.message }); return Store.putLocal('transactions', t); }
            throw e;
          });
        });
      });
    }, Promise.resolve());
  }

  function handleResults(ops, results) {
    var byId = {}; (results || []).forEach(function (r) { byId[r.opId] = r; });
    return ops.reduce(function (p, op) {
      return p.then(function () {
        var r = byId[op.id]; if (!r) return null;
        var rec = Store.get(op.entity, op.recId);
        if (r.status === 'applied' || r.status === 'duplicate') {
          if (!rec) return Store.delOp(op.id);
          var edited = rec.updatedAt > (op.sent || 0);
          if (rec.deleted && !edited) return Store.dropLocal(op.entity, rec.id).then(function () { return Store.delOp(op.id); });
          rec.v = r.record.v; rec.seq = r.record.seq;
          return Store.putLocal(op.entity, rec).then(function () {
            if (edited) { op.id = U.uid('op'); op.baseV = r.record.v; op.status = 'pending'; return Store.saveOp(op); }
            return Store.delOp(op.id);
          });
        }
        if (r.status === 'exists') { // same deterministic id already on server -> adopt the server copy
          return Store.putLocal(op.entity, r.record).then(function () { return Store.delOp(op.id); });
        }
        if (r.status === 'conflict') { op.status = 'conflict'; op.serverRec = r.record; op.error = 'Changed on another device'; return Store.saveOp(op); }
        op.status = 'failed'; op.error = r.error || r.status; return Store.saveOp(op);
      });
    }, Promise.resolve());
  }

  function applyChanges(ch) {
    var jobs = [];
    Object.keys(ch || {}).forEach(function (e) {
      if (Store.ENT.indexOf(e) < 0) return;
      ch[e].forEach(function (rec) {
        var op = Store.opFor(rec.id);
        if (op && op.status === 'pending') return; // local edit wins until it is sent (server will flag a conflict if needed)
        if (rec.deleted) jobs.push(Store.dropLocal(e, rec.id)); else jobs.push(Store.putLocal(e, rec));
      });
    });
    return Promise.all(jobs);
  }

  function seedIfEmpty() {
    if (!Store.needsSeed() || Store.readOnly()) return Promise.resolve();
    var cats = Store.defaults.categories(), accs = Store.defaults.accounts();
    return Store.saveMany('categories', cats).then(function () { return Store.saveMany('accounts', accs); }).then(function () { return Store.markSeeded(); });
  }

  function now() {
    if (Store.mode !== 'shared') return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    if (S.state === 'auth') return Promise.resolve();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { set({ state: 'offline', msg: 'You are offline. Changes are saved on this device and will sync later.' }); return Promise.resolve(); }
    busy = true; set({ state: 'syncing', msg: '' });
    var changed = false;
    function loop(guard) {
      var ops = Store.sendable(50);
      var payload = ops.map(function (op) {
        var rec = Store.get(op.entity, op.recId); op.sent = rec ? rec.updatedAt : 0;
        return { opId: op.id, entity: op.entity, recId: op.recId, baseV: op.baseV || 0, data: rec ? clean(rec) : null };
      }).filter(function (o) { return o.data; });
      return call('sync', { key: Prefs.getKey(), cursor: Store.cursor, ops: payload }, 45000).then(function (res) {
        if (res.workspace && Store.ws && res.workspace.role !== Store.ws.role) { Store.ws.role = res.workspace.role; Prefs.set('role', res.workspace.role); }
        return handleResults(ops, res.results).then(function () { return applyChanges(res.changes); }).then(function () { return Store.setCursor(res.cursor); }).then(function () {
          if (payload.length || Object.keys(res.changes || {}).some(function (k) { return res.changes[k].length; })) changed = true;
          if (guard > 0 && (res.more || Store.sendable(1).length)) return loop(guard - 1);
        });
      });
    }
    return uploadAttachments().then(function () { return loop(30); }).then(function () { return seedIfEmpty(); }).then(function () {
      set({ state: 'idle', last: Date.now(), msg: '' }); if (changed) Store.emit('data'); else Store.emit('sync');
    }).catch(function (e) {
      if (e.code === 'auth') set({ state: 'auth', msg: e.message });
      else if (e.code === 'network' || e.code === 'timeout') set({ state: 'offline', msg: e.message + ' Changes stay on this device and will sync later.' });
      else set({ state: 'error', msg: e.message });
      Store.emit('sync');
    }).then(function () { busy = false; if (again) { again = false; setTimeout(now, 400); } });
  }

  function start() {
    stop();
    if (Store.mode !== 'shared') return;
    var sec = Number(Prefs.get('syncSec')) || 0;
    if (sec > 0) timer = setInterval(function () { if (!document.hidden) now(); }, sec * 1000);
    now();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  function soon() { if (Store.mode !== 'shared') return; clearTimeout(kick); kick = setTimeout(now, 1500); }
  function reset() { S.state = 'idle'; S.msg = ''; }

  window.addEventListener('online', function () { now(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) now(); });

  function resolve(opId, how) {
    var op = Store.outbox.find(function (o) { return o.id === opId; }); if (!op) return Promise.resolve();
    if (how === 'mine') { op.baseV = (op.serverRec && op.serverRec.v) || op.baseV; op.status = 'pending'; op.error = ''; return Store.saveOp(op).then(now); }
    if (how === 'retry') { op.status = 'pending'; op.error = ''; return Store.saveOp(op).then(now); }
    var p = op.serverRec ? (op.serverRec.deleted ? Store.dropLocal(op.entity, op.recId) : Store.putLocal(op.entity, op.serverRec)) : Store.dropLocal(op.entity, op.recId);
    return p.then(function () { return Store.delOp(op.id); }).then(function () { Store.emit('data'); });
  }

  GD.Sync = { status: S, now: now, start: start, stop: stop, soon: soon, reset: reset, resolve: resolve, on: function (f) { listeners.push(f); }, set: set };
  Store.on(function (k) { if (k === 'data') soon(); });
})();
