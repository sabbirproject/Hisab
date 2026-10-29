/**
 * GD Expense Tracker — Google Apps Script backend (Shared Mode only)
 * ------------------------------------------------------------------
 * Personal Mode never talks to this script. Shared Mode talks to it with POST requests
 * (Content-Type: text/plain, JSON string body — no CORS pre-flight needed).
 *
 * SETUP (one time):  see docs/DEPLOY.md
 *   1. Open the Google Sheet -> Extensions -> Apps Script -> paste this file.
 *   2. Run  setup()  once and authorize. Read the execution log: it shows your OWNER SECRET (once).
 *   3. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
 *
 * Wire contract (client = js/api.js):
 *   request : { action, key?, ownerSecret?, ... }
 *   response: { ok:true, data:{...} }  |  { ok:false, code, error }
 *   codes   : auth | forbidden | invalid | busy | throttled | server
 */

var APP_VERSION = '1.0.0';
var MAX_BODY = 4200000;          // chars
var MAX_OPS = 50;                // ops per sync request
var CHANGE_LIMIT = 300;          // records returned per sync response
var MAX_JSON = 16000;            // chars of JSON per record
var MAX_UPLOAD_B64 = 2800000;    // ~2 MB file
var ROLES = ['editor', 'viewer'];

// Entity -> sheet layout. Fixed leading columns: ID, WorkspaceID, Version, Seq, IsDeleted, LastOpId
// then mirrored (human-readable) columns, then CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, DeletedAt, Data(JSON)
var ENTITIES = {
  transactions: { sheet: 'Transactions', id: 'TransactionID', mirror: [['Type', 'type'], ['Amount', 'amount'], ['Currency', 'currency'], ['CategoryID', 'categoryId'], ['AccountID', 'accountId'], ['TransactionDate', 'date'], ['Time', 'time'], ['Description', 'description'], ['PaymentMethod', 'paymentMethod'], ['Status', 'status']] },
  accounts: { sheet: 'Accounts', id: 'AccountID', mirror: [['Name', 'name'], ['Type', 'type'], ['OpeningBalance', 'opening'], ['Active', 'active']] },
  categories: { sheet: 'Categories', id: 'CategoryID', mirror: [['Name', 'name'], ['Type', 'type'], ['SortOrder', 'order'], ['Active', 'active']] },
  transfers: { sheet: 'Transfers', id: 'TransferID', mirror: [['FromAccountID', 'fromAccountId'], ['ToAccountID', 'toAccountId'], ['Amount', 'amount'], ['TransferDate', 'date'], ['Note', 'note']] },
  budgets: { sheet: 'Budgets', id: 'BudgetID', mirror: [['Month', 'month'], ['OverallLimit', 'overall']] },
  recurring: { sheet: 'RecurringTransactions', id: 'RecurringID', mirror: [['Type', 'type'], ['Amount', 'amount'], ['CategoryID', 'categoryId'], ['AccountID', 'accountId'], ['Frequency', 'freq'], ['NextDate', 'next'], ['Active', 'active']] }
};
var FIXED = 6; // ID, WorkspaceID, Version, Seq, IsDeleted, LastOpId

var SYSTEM_SHEETS = {
  Settings: ['Key', 'Value'],
  Workspaces: ['WorkspaceID', 'Name', 'Status', 'CreatedAt', 'FolderID'],
  AccessKeys: ['KeyID', 'WorkspaceID', 'Label', 'Role', 'KeyHash', 'Status', 'CreatedAt', 'ExpiresAt', 'LastUsedAt', 'RotatedAt'],
  AuditLog: ['Time', 'WorkspaceID', 'KeyID', 'Action', 'Detail'],
  SyncMetadata: ['WorkspaceID', 'Seq', 'LastSyncAt', 'LastKeyID', 'OpsTotal']
};

// =====================================================================
// ENTRY POINTS
// =====================================================================
function doGet() {
  return json_({ ok: true, data: { app: 'GD Expense Tracker API', version: APP_VERSION } });
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_BODY) return fail_('invalid', 'Bad request.');
    var req;
    try { req = JSON.parse(raw); } catch (x) { return fail_('invalid', 'Bad request.'); }
    var action = String(req.action || '');
    if (action.indexOf('admin.') === 0) return handleAdmin_(action, req);
    return handleUser_(action, req);
  } catch (err) {
    if (err && err.gdx) return fail_(err.code, err.msg);
    console.error(String(err && err.message || err)); // never log request bodies / secrets
    return fail_('server', 'Unexpected server error. Try again.');
  }
}

// =====================================================================
// ONE-TIME SETUP / OWNER SECRET (run from the editor, not from the web)
// =====================================================================
function setup() {
  var ss = ss_();
  Object.keys(SYSTEM_SHEETS).forEach(function (n) { ensureSheet_(ss, n, SYSTEM_SHEETS[n]); });
  Object.keys(ENTITIES).forEach(function (k) { ensureSheet_(ss, ENTITIES[k].sheet, entityHeaders_(k)); });
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PEPPER')) p.setProperty('PEPPER', randomHex_(32));
  setting_('SchemaVersion', '1');
  setting_('CreatedAt', new Date().toISOString());
  if (!p.getProperty('OWNER_HASH')) { resetOwnerSecret(); }
  else Logger.log('Setup OK. Owner secret already exists (run resetOwnerSecret() to make a new one).');
}

/** Makes a NEW owner secret. It is shown only in the execution log, once. Only its hash is stored. */
function resetOwnerSecret() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PEPPER')) p.setProperty('PEPPER', randomHex_(32));
  var secret = 'OWNER-' + randomHex_(24).toUpperCase();
  p.setProperty('OWNER_HASH', hash_(secret));
  Logger.log('==============================================');
  Logger.log('OWNER SECRET (copy it now, it is NOT shown again):');
  Logger.log(secret);
  Logger.log('==============================================');
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw gerr_('server', 'Spreadsheet not found. Use a container-bound script or set Script Property SHEET_ID.');
  return ss;
}
function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#0b3d91').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function entityHeaders_(k) {
  var E = ENTITIES[k];
  return [E.id, 'WorkspaceID', 'Version', 'Seq', 'IsDeleted', 'LastOpID'].concat(E.mirror.map(function (m) { return m[0]; }), ['CreatedAt', 'UpdatedAt', 'CreatedBy', 'UpdatedBy', 'DeletedAt', 'Data']);
}
function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw gerr_('server', 'Run setup() first.');
  return sh;
}
function setting_(k, v) {
  var sh = sheet_('Settings'), rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
  for (var i = 0; i < rows.length; i++) if (rows[i][0] === k) { sh.getRange(i + 2, 2).setValue(v); return; }
  sh.appendRow([k, v]);
}

// =====================================================================
// HELPERS
// =====================================================================
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, msg) { return json_({ ok: false, code: code, error: msg }); }
function ok_(data) { return json_({ ok: true, data: data || {} }); }
function gerr_(code, msg) { return { gdx: true, code: code, msg: msg }; }
function randomHex_(n) { var s = ''; while (s.length < n) s += Utilities.getUuid().replace(/-/g, ''); return s.slice(0, n); }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join(''); }
function hash_(s) {
  var pepper = PropertiesService.getScriptProperties().getProperty('PEPPER');
  if (!pepper) throw gerr_('server', 'Run setup() first.');
  return hex_(Utilities.computeHmacSha256Signature(String(s), pepper));
}
function safeEq_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function cell_(v) { // Sheets formula-injection guard for mirrored text
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') { v = v.slice(0, 300); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return isFinite(v) ? v : '';
  return '';
}
function newKeySecret_() { var h = randomHex_(32).toUpperCase(); return 'GDX-' + h.slice(0, 8) + '-' + h.slice(8, 16) + '-' + h.slice(16, 24) + '-' + h.slice(24, 32); }
function rows_(name) { // objects from a small system sheet
  var sh = sheet_(name), n = sh.getLastRow(); if (n < 2) return [];
  var h = SYSTEM_SHEETS[name], vals = sh.getRange(2, 1, n - 1, h.length).getValues();
  return vals.map(function (r, i) { var o = { _row: i + 2 }; h.forEach(function (k, j) { o[k] = r[j]; }); return o; });
}
function audit_(ws, keyId, action, detail) {
  try { sheet_('AuditLog').appendRow([new Date(), ws || '', keyId || '', action, String(detail || '').slice(0, 300)]); } catch (e) { /* audit is best-effort */ }
}
function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw gerr_('busy', 'Server is busy. Please try again.');
  try { return fn(); } finally { lock.releaseLock(); }
}

// =====================================================================
// AUTH (workspace keys)
// =====================================================================
function authenticate_(rawKey) {
  var cache = CacheService.getScriptCache();
  var key = String(rawKey || '').trim().toUpperCase();
  if (!/^GDX-[0-9A-F]{8}(-[0-9A-F]{8}){3}$/.test(key)) return authFail_();
  var h = hash_(key), now = Date.now(), info = null;
  var c = cache.get('a:' + h);
  if (c) { try { info = JSON.parse(c); } catch (e) { info = null; } }
  if (!info) {
    var k = rows_('AccessKeys').filter(function (r) { return safeEq_(r.KeyHash, h); })[0];
    if (!k) return authFail_();
    var ws = rows_('Workspaces').filter(function (w) { return w.WorkspaceID === k.WorkspaceID; })[0];
    if (!ws) return authFail_();
    info = { keyId: k.KeyID, ws: k.WorkspaceID, wsName: ws.Name, wsStatus: ws.Status, role: k.Role, label: k.Label, status: k.Status, exp: Number(k.ExpiresAt) || 0, row: k._row, last: Number(k.LastUsedAt) || 0 };
    cache.put('a:' + h, JSON.stringify(info), 60);
  }
  if (info.status !== 'active' || info.wsStatus !== 'active' || (info.exp && info.exp < now)) return authFail_();
  if (now - info.last > 300000) { // touch lastUsed at most every 5 min
    try { sheet_('AccessKeys').getRange(info.row, 9).setValue(now); info.last = now; cache.put('a:' + h, JSON.stringify(info), 60); } catch (e) {}
  }
  return info;
}
function authFail_() {
  var cache = CacheService.getScriptCache(), n = Number(cache.get('failn') || 0) + 1;
  cache.put('failn', String(n), 600);
  Utilities.sleep(400);
  if (n > 150) throw gerr_('throttled', 'Too many failed attempts. Wait a few minutes.');
  throw gerr_('auth', 'This key is not valid, has expired, or was revoked.');
}
function dropAuthCache_(keyHash) { CacheService.getScriptCache().remove('a:' + keyHash); }

// =====================================================================
// USER ACTIONS
// =====================================================================
function handleUser_(action, req) {
  var auth = authenticate_(req.key);
  switch (action) {
    case 'auth.verify':
      return ok_({ workspace: { id: auth.ws, name: auth.wsName }, role: auth.role, label: auth.label, serverTime: Date.now() });
    case 'sync': return sync_(auth, req);
    case 'export': {
      var out = {};
      Object.keys(ENTITIES).forEach(function (k) { out[k] = readAll_(k, auth.ws).filter(function (r) { return !r.deleted; }).map(stripMeta_); });
      audit_(auth.ws, auth.keyId, 'export', '');
      return ok_({ data: out, exportedAt: Date.now() });
    }
    case 'file.upload':
      if (auth.role !== 'editor') throw gerr_('forbidden', 'This key is read-only.');
      return locked_(function () { return uploadFile_(auth, req); });
    case 'file.get': return getFile_(auth, req);
    default: throw gerr_('invalid', 'Unknown action.');
  }
}
function stripMeta_(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== 'v' && k !== 'seq') o[k] = r[k]; }); return o; }

// ---------- storage primitives ----------
function metaIndex_(entity) { // reads only the 6 leading columns
  var E = ENTITIES[entity], sh = sheet_(E.sheet), n = sh.getLastRow(), map = {}, list = [];
  if (n > 1) {
    var vals = sh.getRange(2, 1, n - 1, FIXED).getValues();
    for (var i = 0; i < vals.length; i++) {
      var m = { row: i + 2, id: String(vals[i][0]), ws: String(vals[i][1]), v: Number(vals[i][2]) || 0, seq: Number(vals[i][3]) || 0, deleted: Number(vals[i][4]) === 1, lastOp: String(vals[i][5]) };
      map[m.ws + '|' + m.id] = m; list.push(m);
    }
  }
  return { sh: sh, map: map, list: list, next: n + 1, appends: [] };
}
function rowToRec_(entity, row) {
  var E = ENTITIES[entity], dataIdx = FIXED + E.mirror.length + 5, rec;
  try { rec = JSON.parse(row[dataIdx]); } catch (e) { rec = { id: String(row[0]) }; }
  rec.id = String(row[0]); rec.v = Number(row[2]) || 0; rec.seq = Number(row[3]) || 0;
  if (Number(row[4]) === 1) { rec.deleted = true; } else { delete rec.deleted; }
  return rec;
}
function recToRow_(entity, ws, rec, v, seq, deleted, lastOp, keyLabel, createdBy) {
  var E = ENTITIES[entity], now = Date.now();
  var data = {}; Object.keys(rec).forEach(function (k) { if (k !== 'v' && k !== 'seq' && k !== 'dirty' && k !== 'createdBy' && k !== 'updatedBy' && k[0] !== '_') data[k] = rec[k]; });
  var js = JSON.stringify(data);
  if (js.length > MAX_JSON) throw gerr_('invalid', 'Record is too large.');
  var row = [rec.id, ws, v, seq, deleted ? 1 : 0, lastOp];
  E.mirror.forEach(function (m) { row.push(cell_(data[m[1]])); });
  row.push(Number(data.createdAt) || now, Number(data.updatedAt) || now, createdBy || keyLabel, keyLabel, deleted ? (Number(data.deletedAt) || now) : '', js);
  return row;
}
function validate_(entity, id, rec) {
  if (!ENTITIES[entity]) throw gerr_('invalid', 'Unknown entity.');
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw gerr_('invalid', 'Bad record.');
  if (!/^[A-Za-z0-9_.:\-]{1,80}$/.test(id) || rec.id !== id) throw gerr_('invalid', 'Bad record id.');
  if (entity === 'transactions' || entity === 'transfers' || entity === 'recurring') {
    if (rec.amount !== undefined && (typeof rec.amount !== 'number' || !isFinite(rec.amount) || rec.amount < 0 || rec.amount > 1e12)) throw gerr_('invalid', 'Bad amount.');
  }
  if (rec.date !== undefined && rec.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(rec.date))) throw gerr_('invalid', 'Bad date.');
}
function nextSeqState_(ws) { // returns {sh,row,seq}; caller holds the lock
  var sh = sheet_('SyncMetadata'), n = sh.getLastRow(), vals = n > 1 ? sh.getRange(2, 1, n - 1, 5).getValues() : [];
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === ws) return { sh: sh, row: i + 2, seq: Number(vals[i][1]) || 0, ops: Number(vals[i][4]) || 0 };
  sh.appendRow([ws, 0, 0, '', 0]);
  return { sh: sh, row: sh.getLastRow(), seq: 0, ops: 0 };
}
function currentSeq_(ws) {
  var cache = CacheService.getScriptCache(), c = cache.get('s:' + ws);
  if (c !== null && c !== undefined) return Number(c);
  var sh = sheet_('SyncMetadata'), n = sh.getLastRow(), vals = n > 1 ? sh.getRange(2, 1, n - 1, 2).getValues() : [], s = 0;
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === ws) s = Number(vals[i][1]) || 0;
  cache.put('s:' + ws, String(s), 30);
  return s;
}

// ---------- sync ----------
function sync_(auth, req) {
  var ops = Array.isArray(req.ops) ? req.ops : [];
  if (ops.length > MAX_OPS) throw gerr_('invalid', 'Too many operations in one request.');
  var cursor = Number(req.cursor) || 0, results = [];
  if (ops.length) results = locked_(function () { return applyOps_(auth, ops); });
  var ch = changesSince_(auth.ws, cursor);
  return ok_({ workspace: { id: auth.ws, name: auth.wsName, role: auth.role }, results: results, changes: ch.changes, cursor: ch.cursor, more: ch.more, serverTime: Date.now() });
}

function applyOps_(auth, ops) {
  var st = nextSeqState_(auth.ws), seq = st.seq, idx = {}, results = [], applied = 0;
  var label = auth.label || auth.keyId;
  ops.forEach(function (op) {
    var res = { opId: String(op && op.opId || '') };
    try {
      if (!op || !ENTITIES[op.entity]) throw gerr_('invalid', 'Unknown entity.');
      if (!res.opId || res.opId.length > 80) throw gerr_('invalid', 'Missing operation id.');
      if (auth.role !== 'editor') throw gerr_('forbidden', 'This key is read-only.');
      var entity = op.entity, recId = String(op.recId || ''), rec = op.data;
      validate_(entity, recId, rec);
      var ix = idx[entity] || (idx[entity] = metaIndex_(entity));
      var ex = ix.map[auth.ws + '|' + recId], baseV = Number(op.baseV) || 0;
      if (ex && ex.lastOp === res.opId) { res.status = 'duplicate'; res.record = readOne_(entity, ix, ex); results.push(res); return; }
      if (ex && baseV === 0 && !ex.deleted) { res.status = 'exists'; res.record = readOne_(entity, ix, ex); results.push(res); return; }
      if (ex && baseV !== 0 && baseV !== ex.v) { res.status = 'conflict'; res.record = readOne_(entity, ix, ex); results.push(res); return; }
      var deleted = rec.deleted === true; seq++;
      if (ex) {
        var createdBy = ix.sh.getRange(ex.row, FIXED + ENTITIES[entity].mirror.length + 3).getValue();
        var vals = recToRow_(entity, auth.ws, rec, ex.v + 1, seq, deleted, res.opId, label, createdBy);
        ix.sh.getRange(ex.row, 1, 1, vals.length).setValues([vals]);
        ex.v += 1; ex.seq = seq; ex.deleted = deleted; ex.lastOp = res.opId;
        res.record = rowToRec_(entity, vals);
      } else {
        var nv = recToRow_(entity, auth.ws, rec, 1, seq, deleted, res.opId, label, label);
        var m = { row: ix.next++, id: recId, ws: auth.ws, v: 1, seq: seq, deleted: deleted, lastOp: res.opId };
        ix.map[auth.ws + '|' + recId] = m; ix.appends.push({ row: m.row, vals: nv });
        res.record = rowToRec_(entity, nv);
      }
      res.status = 'applied'; applied++; results.push(res);
    } catch (e) {
      if (e && e.gdx) { res.status = 'failed'; res.error = e.msg; res.code = e.code; results.push(res); }
      else { console.error(String(e && e.message || e)); res.status = 'failed'; res.error = 'Server error'; results.push(res); }
    }
  });
  Object.keys(idx).forEach(function (en) { // flush appended rows (contiguous)
    var ix = idx[en], a = ix.appends; if (!a.length) return;
    a.sort(function (x, y) { return x.row - y.row; });
    ix.sh.getRange(a[0].row, 1, a.length, a[0].vals.length).setValues(a.map(function (z) { return z.vals; }));
  });
  if (applied) {
    st.sh.getRange(st.row, 2, 1, 4).setValues([[seq, Date.now(), auth.keyId, st.ops + applied]]);
    CacheService.getScriptCache().put('s:' + auth.ws, String(seq), 30);
    audit_(auth.ws, auth.keyId, 'sync', applied + ' change(s)');
  }
  return results;
}
function readOne_(entity, ix, m) {
  var E = ENTITIES[entity], row = ix.sh.getRange(m.row, 1, 1, FIXED + E.mirror.length + 6).getValues()[0];
  return rowToRec_(entity, row);
}
function changesSince_(ws, cursor) {
  var cur = currentSeq_(ws), out = {};
  Object.keys(ENTITIES).forEach(function (k) { out[k] = []; });
  if (cur <= cursor) return { changes: out, cursor: Math.max(cursor, cur), more: false };
  var cand = [];
  Object.keys(ENTITIES).forEach(function (k) {
    metaIndex_(k).list.forEach(function (m) { if (m.ws === ws && m.seq > cursor) cand.push({ e: k, row: m.row, seq: m.seq }); });
  });
  cand.sort(function (a, b) { return a.seq - b.seq; });
  var more = cand.length > CHANGE_LIMIT, take = cand.slice(0, CHANGE_LIMIT);
  var by = {}; take.forEach(function (c) { (by[c.e] = by[c.e] || []).push(c); });
  Object.keys(by).forEach(function (k) {
    var E = ENTITIES[k], sh = sheet_(E.sheet), w = FIXED + E.mirror.length + 6;
    if (by[k].length > 25) {
      var all = sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues();
      by[k].forEach(function (c) { out[k].push(rowToRec_(k, all[c.row - 2])); });
    } else by[k].forEach(function (c) { out[k].push(rowToRec_(k, sh.getRange(c.row, 1, 1, w).getValues()[0])); });
  });
  var newCursor = more ? take[take.length - 1].seq : Math.max(cur, take.length ? take[take.length - 1].seq : cursor);
  return { changes: out, cursor: newCursor, more: more };
}
function readAll_(entity, ws) {
  var E = ENTITIES[entity], sh = sheet_(E.sheet), n = sh.getLastRow(); if (n < 2) return [];
  var w = FIXED + E.mirror.length + 6;
  return sh.getRange(2, 1, n - 1, w).getValues().filter(function (r) { return String(r[1]) === ws; }).map(function (r) { return rowToRec_(entity, r); });
}

// ---------- files (receipts) : private Drive files only ----------
function rootFolder_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('ROOT_FOLDER'), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); } catch (e) { f = null; } }
  if (!f) { f = DriveApp.createFolder('GD Expense Tracker (private)'); p.setProperty('ROOT_FOLDER', f.getId()); }
  return f;
}
function subFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function wsFolder_(ws) { return subFolder_(rootFolder_(), ws); }
function sniff_(bytes) {
  var b = bytes.map(function (x) { return x < 0 ? x + 256 : x; });
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}
function uploadFile_(auth, req) {
  var b64 = String(req.data || '');
  if (!b64 || b64.length > MAX_UPLOAD_B64) throw gerr_('invalid', 'File is empty or larger than 2 MB.');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw gerr_('invalid', 'File data is not valid.'); }
  var mime = sniff_(bytes);
  if (!mime) throw gerr_('invalid', 'Only JPG, PNG or WebP images are allowed.');
  var name = String(req.name || 'receipt').replace(/[^\w.\- ]/g, '_').slice(0, 60) || 'receipt';
  var folder = subFolder_(wsFolder_(auth.ws), 'Receipts');
  var file = folder.createFile(Utilities.newBlob(bytes, mime, name)); // private: no sharing is ever set
  file.setDescription('gdx:' + auth.ws);
  audit_(auth.ws, auth.keyId, 'file.upload', name);
  return ok_({ fileId: file.getId() });
}
function getFile_(auth, req) {
  var id = String(req.fileId || '');
  if (!/^[\w\-]{10,100}$/.test(id)) throw gerr_('invalid', 'Bad file id.');
  var f; try { f = DriveApp.getFileById(id); } catch (e) { throw gerr_('invalid', 'File not found.'); }
  if (f.getDescription() !== 'gdx:' + auth.ws) throw gerr_('forbidden', 'Not allowed.');
  var blob = f.getBlob();
  return ok_({ mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) });
}

// =====================================================================
// OWNER ADMIN (owner secret required on EVERY call; only its hash is stored)
// =====================================================================
function requireOwner_(secret) {
  var stored = PropertiesService.getScriptProperties().getProperty('OWNER_HASH');
  var s = String(secret || '').trim();
  if (!stored || !s || !safeEq_(hash_(s), stored)) {
    audit_('', 'owner', 'admin.denied', '');
    var cache = CacheService.getScriptCache(), n = Number(cache.get('adminfail') || 0) + 1;
    cache.put('adminfail', String(n), 900); Utilities.sleep(800);
    if (n > 30) throw gerr_('throttled', 'Too many failed owner attempts. Wait 15 minutes.');
    throw gerr_('auth', 'Owner secret is not correct.');
  }
}
function pubKey_(k) { return { keyId: k.KeyID, workspaceId: k.WorkspaceID, label: k.Label, role: k.Role, status: k.Status, createdAt: Number(k.CreatedAt) || 0, expiresAt: Number(k.ExpiresAt) || 0, lastUsedAt: Number(k.LastUsedAt) || 0, rotatedAt: Number(k.RotatedAt) || 0 }; }
function findKey_(keyId) {
  var k = rows_('AccessKeys').filter(function (r) { return r.KeyID === keyId; })[0];
  if (!k) throw gerr_('invalid', 'Key not found.');
  return k;
}
function parseExpiry_(s) {
  if (!s) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw gerr_('invalid', 'Expiry must be YYYY-MM-DD.');
  var t = Date.parse(s + 'T23:59:59+05:30'); if (!isFinite(t)) throw gerr_('invalid', 'Bad expiry date.');
  return t;
}
function cleanName_(s, n) { return String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }

function handleAdmin_(action, req) {
  requireOwner_(req.ownerSecret);
  switch (action) {
    case 'admin.check': return ok_({ ok: true });

    case 'admin.overview': {
      var keys = rows_('AccessKeys').map(pubKey_), meta = rows_('SyncMetadata');
      var ws = rows_('Workspaces').map(function (w) {
        var m = meta.filter(function (x) { return x.WorkspaceID === w.WorkspaceID; })[0] || {};
        return { id: w.WorkspaceID, name: w.Name, status: w.Status, createdAt: Number(w.CreatedAt) || 0, lastSyncAt: Number(m.LastSyncAt) || 0, changes: Number(m.OpsTotal) || 0, keys: keys.filter(function (k) { return k.workspaceId === w.WorkspaceID; }) };
      });
      return ok_({ workspaces: ws });
    }

    case 'admin.workspace.create': return locked_(function () {
      var name = cleanName_(req.name, 60); if (!name) throw gerr_('invalid', 'Enter a workspace name.');
      var id = 'ws_' + randomHex_(8);
      sheet_('Workspaces').appendRow([id, name, 'active', Date.now(), '']);
      try { sheet_('Workspaces').getRange(sheet_('Workspaces').getLastRow(), 5).setValue(wsFolder_(id).getId()); } catch (e) { /* Drive optional */ }
      audit_(id, 'owner', 'workspace.create', name);
      return ok_({ workspaceId: id, name: name });
    });

    case 'admin.workspace.rename': return locked_(function () {
      var w = rows_('Workspaces').filter(function (x) { return x.WorkspaceID === req.workspaceId; })[0];
      if (!w) throw gerr_('invalid', 'Workspace not found.');
      var name = cleanName_(req.name, 60); if (!name) throw gerr_('invalid', 'Enter a name.');
      sheet_('Workspaces').getRange(w._row, 2).setValue(name);
      rows_('AccessKeys').filter(function (k) { return k.WorkspaceID === w.WorkspaceID; }).forEach(function (k) { dropAuthCache_(k.KeyHash); });
      audit_(w.WorkspaceID, 'owner', 'workspace.rename', name);
      return ok_({});
    });

    case 'admin.key.create': return locked_(function () {
      var w = rows_('Workspaces').filter(function (x) { return x.WorkspaceID === req.workspaceId && x.Status === 'active'; })[0];
      if (!w) throw gerr_('invalid', 'Workspace not found.');
      var role = String(req.role || 'editor'); if (ROLES.indexOf(role) < 0) throw gerr_('invalid', 'Role must be editor or viewer.');
      var label = cleanName_(req.label, 40) || 'Key', secret = newKeySecret_(), id = 'key_' + randomHex_(8), now = Date.now();
      sheet_('AccessKeys').appendRow([id, w.WorkspaceID, label, role, hash_(secret), 'active', now, parseExpiry_(req.expiresAt), 0, 0]);
      audit_(w.WorkspaceID, 'owner', 'key.create', label + ' (' + role + ')');
      return ok_({ keyId: id, secret: secret, label: label, role: role }); // the ONLY time the secret is returned
    });

    case 'admin.key.update': return locked_(function () {
      var k = findKey_(req.keyId), sh = sheet_('AccessKeys');
      if (req.status !== undefined) {
        if (['active', 'disabled', 'revoked'].indexOf(req.status) < 0) throw gerr_('invalid', 'Bad status.');
        if (k.Status === 'revoked' && req.status !== 'revoked') throw gerr_('invalid', 'A revoked key cannot be re-enabled. Create a new key.');
        sh.getRange(k._row, 6).setValue(req.status);
      }
      if (req.label !== undefined) sh.getRange(k._row, 3).setValue(cleanName_(req.label, 40) || k.Label);
      if (req.role !== undefined) { if (ROLES.indexOf(req.role) < 0) throw gerr_('invalid', 'Bad role.'); sh.getRange(k._row, 4).setValue(req.role); }
      if (req.expiresAt !== undefined) sh.getRange(k._row, 8).setValue(parseExpiry_(req.expiresAt));
      dropAuthCache_(k.KeyHash);
      audit_(k.WorkspaceID, 'owner', 'key.update', k.KeyID + ' ' + (req.status || ''));
      return ok_({});
    });

    case 'admin.key.rotate': return locked_(function () {
      var k = findKey_(req.keyId); if (k.Status === 'revoked') throw gerr_('invalid', 'Key is revoked.');
      var secret = newKeySecret_(), sh = sheet_('AccessKeys');
      dropAuthCache_(k.KeyHash);
      sh.getRange(k._row, 5).setValue(hash_(secret)); sh.getRange(k._row, 10).setValue(Date.now());
      audit_(k.WorkspaceID, 'owner', 'key.rotate', k.KeyID);
      return ok_({ keyId: k.KeyID, secret: secret });
    });

    case 'admin.audit': {
      var sh2 = sheet_('AuditLog'), n = sh2.getLastRow(), lim = Math.min(Number(req.limit) || 50, 200);
      var start = Math.max(2, n - lim + 1), vals = n >= 2 ? sh2.getRange(start, 1, n - start + 1, 5).getValues() : [];
      return ok_({ entries: vals.reverse().map(function (r) { return { time: r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0, ws: r[1], key: r[2], action: r[3], detail: r[4] }; }) });
    }

    case 'admin.backup': return locked_(function () {
      var w = rows_('Workspaces').filter(function (x) { return x.WorkspaceID === req.workspaceId; })[0];
      if (!w) throw gerr_('invalid', 'Workspace not found.');
      var data = {}, counts = {};
      Object.keys(ENTITIES).forEach(function (k) { data[k] = readAll_(k, w.WorkspaceID).filter(function (r) { return !r.deleted; }).map(stripMeta_); counts[k] = data[k].length; });
      var snap = { format: 'gd-expense-tracker-server-backup', formatVersion: 1, createdAt: new Date().toISOString(), workspaceId: w.WorkspaceID, workspaceName: w.Name, data: data };
      var name = 'backup-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HHmmss') + '.json';
      var f = subFolder_(wsFolder_(w.WorkspaceID), 'Backups').createFile(name, JSON.stringify(snap), 'application/json'); // private
      f.setDescription('gdx-backup:' + w.WorkspaceID);
      audit_(w.WorkspaceID, 'owner', 'backup', name);
      return ok_({ fileId: f.getId(), name: name, counts: counts });
    });

    case 'admin.backup.list': {
      var out = [], it = subFolder_(wsFolder_(String(req.workspaceId || '')), 'Backups').getFiles();
      while (it.hasNext()) { var f2 = it.next(); out.push({ fileId: f2.getId(), name: f2.getName(), createdAt: f2.getDateCreated().getTime(), size: f2.getSize() }); }
      out.sort(function (a, b) { return b.createdAt - a.createdAt; });
      return ok_({ backups: out.slice(0, 30) });
    }

    case 'admin.restore': return locked_(function () {
      var w = rows_('Workspaces').filter(function (x) { return x.WorkspaceID === req.workspaceId; })[0];
      if (!w) throw gerr_('invalid', 'Workspace not found.');
      var f; try { f = DriveApp.getFileById(String(req.fileId || '')); } catch (e) { throw gerr_('invalid', 'Backup file not found.'); }
      if (f.getDescription() !== 'gdx-backup:' + w.WorkspaceID) throw gerr_('forbidden', 'That file is not a backup of this workspace.');
      var snap = JSON.parse(f.getBlob().getDataAsString());
      if (!snap || snap.format !== 'gd-expense-tracker-server-backup' || snap.workspaceId !== w.WorkspaceID) throw gerr_('invalid', 'Backup format is not valid.');
      var n = restoreRecords_(w.WorkspaceID, snap.data || {});
      audit_(w.WorkspaceID, 'owner', 'restore', f.getName() + ' (' + n + ' records)');
      return ok_({ restored: n });
    });

    case 'admin.workspace.wipe': return locked_(function () { // tombstones every record; devices drop them on next sync
      var w = rows_('Workspaces').filter(function (x) { return x.WorkspaceID === req.workspaceId; })[0];
      if (!w) throw gerr_('invalid', 'Workspace not found.');
      if (String(req.confirm || '') !== w.Name) throw gerr_('invalid', 'Type the exact workspace name to confirm.');
      var st = nextSeqState_(w.WorkspaceID), seq = st.seq, n = 0;
      Object.keys(ENTITIES).forEach(function (k) {
        var ix = metaIndex_(k);
        ix.list.forEach(function (m) {
          if (m.ws !== w.WorkspaceID || m.deleted) return;
          seq++; n++;
          ix.sh.getRange(m.row, 3, 1, 4).setValues([[m.v + 1, seq, 1, 'wipe']]);
        });
      });
      if (n) { st.sh.getRange(st.row, 2, 1, 4).setValues([[seq, Date.now(), 'owner', st.ops + n]]); CacheService.getScriptCache().remove('s:' + w.WorkspaceID); }
      audit_(w.WorkspaceID, 'owner', 'workspace.wipe', n + ' records');
      return ok_({ deleted: n });
    });

    default: throw gerr_('invalid', 'Unknown action.');
  }
}

function restoreRecords_(ws, data) {
  var st = nextSeqState_(ws), seq = st.seq, count = 0, idx = {};
  Object.keys(ENTITIES).forEach(function (k) {
    var list = Array.isArray(data[k]) ? data[k] : [], ix = idx[k] = metaIndex_(k);
    list.forEach(function (rec) {
      try { validate_(k, String(rec && rec.id), rec); } catch (e) { return; }
      var ex = ix.map[ws + '|' + rec.id]; seq++; count++;
      var vals = recToRow_(k, ws, rec, ex ? ex.v + 1 : 1, seq, false, 'restore', 'owner-restore', 'owner-restore');
      if (ex) { ix.sh.getRange(ex.row, 1, 1, vals.length).setValues([vals]); ex.v++; }
      else { var m = { row: ix.next++, id: rec.id, ws: ws, v: 1, seq: seq, deleted: false, lastOp: 'restore' }; ix.map[ws + '|' + rec.id] = m; ix.appends.push({ row: m.row, vals: vals }); }
    });
    var a = ix.appends; if (a.length) { a.sort(function (x, y) { return x.row - y.row; }); ix.sh.getRange(a[0].row, 1, a.length, a[0].vals.length).setValues(a.map(function (z) { return z.vals; })); }
  });
  if (count) { st.sh.getRange(st.row, 2, 1, 4).setValues([[seq, Date.now(), 'owner', st.ops + count]]); CacheService.getScriptCache().remove('s:' + ws); }
  return count;
}
