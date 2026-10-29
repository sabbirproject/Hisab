/* Minimal in-memory mock of Apps Script services so backend/Code.gs can be tested in Node. */
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
function makeSheet(name) {
  const s = { name, rows: [], frozen: 0 };
  const rng = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.rows[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
    getValue: () => { const v = (s.rows[r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
    setValues: (vals) => { vals.forEach((row, i) => { const t = (s.rows[r - 1 + i] = s.rows[r - 1 + i] || []); row.forEach((v, j) => { t[c - 1 + j] = v; }); }); return rng(r, c, nr, nc); },
    setValue: (v) => { const t = (s.rows[r - 1] = s.rows[r - 1] || []); t[c - 1] = v; },
    setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }
  });
  s.getRange = rng; s.getLastRow = () => s.rows.length; s.appendRow = (row) => { s.rows.push(row.slice()); }; s.setFrozenRows = (n) => { s.frozen = n; };
  return s;
}
function create() {
  const sheets = {}, props = {}, cache = {}, files = {}, folders = {};
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet(n)) };
  const mkFolder = (name) => { const id = 'fold' + crypto.randomBytes(8).toString('hex'); const f = { id, name, kids: [], files: [] }; folders[id] = f;
    const api = { getId: () => id,
      getFoldersByName: (n) => { const l = f.kids.filter((k) => k.name === n); let i = 0; return { hasNext: () => i < l.length, next: () => wrapFolder(l[i++]) }; },
      createFolder: (n) => { const k = mkFolder(n); f.kids.push(folders[k.getId()]); return k; },
      createFile: (a, b, c) => { const blob = typeof a === 'string' ? { name: a, bytes: Buffer.from(b), mime: c } : a; const fid = 'file' + crypto.randomBytes(10).toString('hex'); const rec = { id: fid, name: blob.name, bytes: blob.bytes, mime: blob.mime, desc: '', created: Date.now() }; files[fid] = rec; f.files.push(rec); return wrapFile(rec); },
      getFiles: () => { let i = 0; return { hasNext: () => i < f.files.length, next: () => wrapFile(f.files[i++]) }; } };
    return api; };
  const wrapFolder = (f) => ({ getId: () => f.id, getFoldersByName: (n) => { const l = f.kids.filter((k) => k.name === n); let i = 0; return { hasNext: () => i < l.length, next: () => wrapFolder(l[i++]) }; }, createFolder: (n) => { const k = mkFolder(n); f.kids.push(folders[k.getId()]); return k; }, createFile: (a, b, c) => mkFolderApi(f).createFile(a, b, c), getFiles: () => { let i = 0; return { hasNext: () => i < f.files.length, next: () => wrapFile(f.files[i++]) }; } });
  const mkFolderApi = (f) => wrapFolder(f);
  const wrapFile = (r) => ({ getId: () => r.id, setDescription: (d) => { r.desc = d; }, getDescription: () => r.desc, getName: () => r.name, getSize: () => r.bytes.length, getDateCreated: () => new Date(r.created), getBlob: () => ({ getContentType: () => r.mime, getBytes: () => Array.from(r.bytes).map((b) => (b > 127 ? b - 256 : b)), getDataAsString: () => Buffer.from(r.bytes).toString() }) });
  const ctx = {
    console, Logger: { log: (...a) => ctx.__log.push(a.join(' ')) }, __log: [],
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), sleep: () => {},
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Decode: (s) => { if (!/^[A-Za-z0-9+/=]*$/.test(s)) throw new Error('bad b64'); return Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)); },
      base64Encode: (b) => Buffer.from(b.map((x) => (x < 0 ? x + 256 : x))).toString('base64'),
      newBlob: (bytes, mime, name) => ({ bytes: Buffer.from(bytes.map((x) => (x < 0 ? x + 256 : x))), mime, name }),
      formatDate: (d) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14)
    },
    DriveApp: { createFolder: (n) => mkFolder(n), getFolderById: (id) => { if (!folders[id]) throw new Error('nf'); return wrapFolder(folders[id]); }, getFileById: (id) => { if (!files[id]) throw new Error('nf'); return wrapFile(files[id]); } },
    Date, JSON, Math, Number, String, Object, Array, isFinite, parseInt, RegExp
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  return {
    ctx, sheets,
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text),
    get: () => JSON.parse(ctx.doGet().text),
    ownerSecret: () => { const l = ctx.__log.filter((x) => /^OWNER-/.test(x)); return l[l.length - 1]; }
  };
}
module.exports = { create };
